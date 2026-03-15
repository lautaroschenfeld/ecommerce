import sharp from "sharp"

const TRANSPARENT_BG = { r: 0, g: 0, b: 0, alpha: 0 }
const WHITE_BG = { r: 255, g: 255, b: 255 }
const BLACK_BG = { r: 0, g: 0, b: 0 }

type NormalizeOptions = {
  paddingPx: number
  outputSizePx: number
}

type BoundingBox = {
  left: number
  top: number
  width: number
  height: number
}

type RawImage = {
  data: Buffer
  width: number
  height: number
}

type BgTone = "white" | "black"

type BgRemovalModule = {
  removeBackground: (
    image: Buffer,
    config?: Record<string, unknown>
  ) => Promise<Blob>
}

let bgRemovalModulePromise: Promise<BgRemovalModule | null> | null = null

function toByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function colorDistanceSquared(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
) {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

async function readRawImage(inputBuffer: Buffer): Promise<RawImage> {
  const raw = await sharp(inputBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = Math.trunc(raw.info.width || 0)
  const height = Math.trunc(raw.info.height || 0)
  if (!width || !height) {
    throw new Error("Invalid image dimensions")
  }

  return { data: raw.data, width, height }
}

function analyzeAlpha(data: Buffer, pixelCount: number) {
  let transparent = 0
  let semiTransparent = 0

  for (let index = 0; index < pixelCount; index += 1) {
    const alpha = data[index * 4 + 3] ?? 0
    if (alpha <= 10) {
      transparent += 1
      continue
    }
    if (alpha < 250) {
      semiTransparent += 1
    }
  }

  const transparentRatio = transparent / pixelCount
  const semiTransparentRatio = semiTransparent / pixelCount
  const hasUsefulAlpha = transparentRatio > 0.002 || semiTransparentRatio > 0.002

  return {
    transparentRatio,
    semiTransparentRatio,
    hasUsefulAlpha,
  }
}

async function getBgRemovalModule() {
  if (!bgRemovalModulePromise) {
    bgRemovalModulePromise = import("@imgly/background-removal-node")
      .then((mod) => {
        if (typeof mod.removeBackground === "function") {
          return { removeBackground: mod.removeBackground } satisfies BgRemovalModule
        }
        return null
      })
      .catch(() => null)
  }

  return await bgRemovalModulePromise
}

async function removeBackgroundWithMl(inputBuffer: Buffer) {
  const module = await getBgRemovalModule()
  if (!module) return null

  const blob = await module.removeBackground(inputBuffer, {
    model: "medium",
    output: {
      format: "image/png",
      quality: 1,
      type: "foreground",
    },
  })

  const arrayBuffer = await blob.arrayBuffer()
  const output = Buffer.from(arrayBuffer)
  return output.length ? output : null
}

function buildLumaMap(data: Buffer, pixelCount: number) {
  const luma = new Uint8Array(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    const base = index * 4
    const r = data[base] ?? 0
    const g = data[base + 1] ?? 0
    const b = data[base + 2] ?? 0
    luma[index] = toByte(0.2126 * r + 0.7152 * g + 0.0722 * b)
  }
  return luma
}

function sanitizeBox(
  box: BoundingBox | null,
  width: number,
  height: number
): BoundingBox | null {
  if (!box) return null

  const left = Math.max(0, Math.min(width - 1, Math.trunc(box.left)))
  const top = Math.max(0, Math.min(height - 1, Math.trunc(box.top)))
  const right = Math.max(
    left,
    Math.min(width - 1, Math.trunc(box.left + box.width - 1))
  )
  const bottom = Math.max(
    top,
    Math.min(height - 1, Math.trunc(box.top + box.height - 1))
  )
  const next = {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  } satisfies BoundingBox

  if (next.width < 8 || next.height < 8) return null
  const areaRatio = (next.width * next.height) / (width * height)
  if (areaRatio >= 0.995) return null
  return next
}

function detectAlphaForegroundBox(data: Buffer, width: number, height: number) {
  const pixelCount = width * height
  if (pixelCount <= 0) return null

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let count = 0

  for (let index = 0; index < pixelCount; index += 1) {
    const alpha = data[index * 4 + 3] ?? 0
    if (alpha <= 10) continue
    const x = index % width
    const y = Math.trunc(index / width)
    count += 1
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  if (!count) return null

  const ratio = count / pixelCount
  if (ratio < 0.0025) return null

  return sanitizeBox(
    {
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    width,
    height
  )
}

function buildLocalContrast(
  luma: Uint8Array,
  width: number,
  height: number,
  pixelCount: number
) {
  const contrast = new Uint8Array(pixelCount)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const center = luma[index] ?? 0

      let sum = 0
      let count = 0
      if (x > 0) {
        sum += Math.abs(center - (luma[index - 1] ?? 0))
        count += 1
      }
      if (x + 1 < width) {
        sum += Math.abs(center - (luma[index + 1] ?? 0))
        count += 1
      }
      if (y > 0) {
        sum += Math.abs(center - (luma[index - width] ?? 0))
        count += 1
      }
      if (y + 1 < height) {
        sum += Math.abs(center - (luma[index + width] ?? 0))
        count += 1
      }

      contrast[index] = count ? toByte(sum / count) : 0
    }
  }
  return contrast
}

function detectForegroundBox(data: Buffer, width: number, height: number) {
  const pixelCount = width * height
  if (pixelCount <= 0) return null

  const luma = buildLumaMap(data, pixelCount)
  const contrast = buildLocalContrast(luma, width, height, pixelCount)

  const visited = new Uint8Array(pixelCount)
  const background = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let head = 0
  let tail = 0

  const ALPHA_SEED_THRESHOLD = 12
  const ALPHA_BG_THRESHOLD = 22
  const EDGE_LUMA_WHITE = 245
  const EDGE_LUMA_BLACK = 10
  const MAX_LOCAL_CONTRAST = 34
  const MAX_STEP_CONTRAST_DIFF = 24
  const MAX_STEP_LUMA_DIFF = 24
  const MAX_STEP_CHANNEL_DIFF = 20
  const MIN_FOREGROUND_RATIO = 0.0035

  const trySeed = (index: number) => {
    if (index < 0 || index >= pixelCount) return
    if (visited[index]) return
    visited[index] = 1
    background[index] = 1
    queue[tail] = index
    tail += 1
  }

  for (let x = 0; x < width; x += 1) {
    const top = x
    const bottom = (height - 1) * width + x
    const topAlpha = data[top * 4 + 3] ?? 0
    const bottomAlpha = data[bottom * 4 + 3] ?? 0
    const topLuma = luma[top] ?? 0
    const bottomLuma = luma[bottom] ?? 0

    if (
      topAlpha <= ALPHA_SEED_THRESHOLD ||
      topLuma >= EDGE_LUMA_WHITE ||
      topLuma <= EDGE_LUMA_BLACK
    ) {
      trySeed(top)
    }
    if (
      bottomAlpha <= ALPHA_SEED_THRESHOLD ||
      bottomLuma >= EDGE_LUMA_WHITE ||
      bottomLuma <= EDGE_LUMA_BLACK
    ) {
      trySeed(bottom)
    }
  }

  for (let y = 0; y < height; y += 1) {
    const left = y * width
    const right = left + (width - 1)
    const leftAlpha = data[left * 4 + 3] ?? 0
    const rightAlpha = data[right * 4 + 3] ?? 0
    const leftLuma = luma[left] ?? 0
    const rightLuma = luma[right] ?? 0

    if (
      leftAlpha <= ALPHA_SEED_THRESHOLD ||
      leftLuma >= EDGE_LUMA_WHITE ||
      leftLuma <= EDGE_LUMA_BLACK
    ) {
      trySeed(left)
    }
    if (
      rightAlpha <= ALPHA_SEED_THRESHOLD ||
      rightLuma >= EDGE_LUMA_WHITE ||
      rightLuma <= EDGE_LUMA_BLACK
    ) {
      trySeed(right)
    }
  }

  if (tail === 0) return null

  while (head < tail) {
    const current = queue[head]
    head += 1

    const currentBase = current * 4
    const currentR = data[currentBase] ?? 0
    const currentG = data[currentBase + 1] ?? 0
    const currentB = data[currentBase + 2] ?? 0
    const currentLuma = luma[current] ?? 0
    const currentContrast = contrast[current] ?? 0

    const x = current % width
    const y = Math.trunc(current / width)

    const neighbors: number[] = []
    if (x > 0) neighbors.push(current - 1)
    if (x + 1 < width) neighbors.push(current + 1)
    if (y > 0) neighbors.push(current - width)
    if (y + 1 < height) neighbors.push(current + width)

    for (const next of neighbors) {
      if (visited[next]) continue

      const nextBase = next * 4
      const nextAlpha = data[nextBase + 3] ?? 0
      const nextContrast = contrast[next] ?? 0

      let isBackground = false

      if (nextAlpha <= ALPHA_BG_THRESHOLD) {
        isBackground = true
      } else if (
        nextContrast <= MAX_LOCAL_CONTRAST &&
        Math.abs(nextContrast - currentContrast) <= MAX_STEP_CONTRAST_DIFF
      ) {
        const nextR = data[nextBase] ?? 0
        const nextG = data[nextBase + 1] ?? 0
        const nextB = data[nextBase + 2] ?? 0
        const nextLuma = luma[next] ?? 0

        const stepLumaDiff = Math.abs(nextLuma - currentLuma)
        const stepRDiff = Math.abs(nextR - currentR)
        const stepGDiff = Math.abs(nextG - currentG)
        const stepBDiff = Math.abs(nextB - currentB)

        if (
          stepLumaDiff <= MAX_STEP_LUMA_DIFF &&
          stepRDiff <= MAX_STEP_CHANNEL_DIFF &&
          stepGDiff <= MAX_STEP_CHANNEL_DIFF &&
          stepBDiff <= MAX_STEP_CHANNEL_DIFF
        ) {
          isBackground = true
        }
      }

      if (!isBackground) continue

      visited[next] = 1
      background[next] = 1
      queue[tail] = next
      tail += 1
    }
  }

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let foregroundCount = 0

  for (let index = 0; index < pixelCount; index += 1) {
    const alpha = data[index * 4 + 3] ?? 0
    if (alpha <= 3) continue
    if (background[index]) continue

    const x = index % width
    const y = Math.trunc(index / width)
    foregroundCount += 1
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  if (foregroundCount === 0) return null
  if (foregroundCount < Math.max(128, Math.trunc(pixelCount * MIN_FOREGROUND_RATIO))) {
    return null
  }

  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1
  if (boxWidth < 8 || boxHeight < 8) return null

  const boxAreaRatio = (boxWidth * boxHeight) / pixelCount
  if (boxAreaRatio > 0.985) return null

  return {
    left: minX,
    top: minY,
    width: boxWidth,
    height: boxHeight,
  } satisfies BoundingBox
}

async function detectTrimBox(
  inputBuffer: Buffer,
  width: number,
  height: number,
  background: { r: number; g: number; b: number } | null,
  threshold: number
) {
  let pipeline = sharp(inputBuffer).rotate().ensureAlpha()
  if (background) {
    pipeline = pipeline.flatten({ background })
  }

  const { info } = await pipeline
    .trim({
      threshold,
      ...(background ? { background } : {}),
    })
    .png()
    .toBuffer({ resolveWithObject: true })

  const trimmedWidth = Math.trunc(info.width || 0)
  const trimmedHeight = Math.trunc(info.height || 0)
  if (!trimmedWidth || !trimmedHeight) return null
  if (trimmedWidth >= width - 1 && trimmedHeight >= height - 1) return null

  const infoRecord = info as unknown as Record<string, unknown>
  const rawLeft = Number(infoRecord.trimOffsetLeft || 0)
  const rawTop = Number(infoRecord.trimOffsetTop || 0)
  const left = rawLeft < 0 ? Math.abs(rawLeft) : rawLeft
  const top = rawTop < 0 ? Math.abs(rawTop) : rawTop

  return sanitizeBox(
    {
      left,
      top,
      width: trimmedWidth,
      height: trimmedHeight,
    },
    width,
    height
  )
}

function pickBestCandidate(
  candidates: Array<BoundingBox | null>,
  width: number,
  height: number
) {
  const cleaned = candidates
    .map((box) => sanitizeBox(box, width, height))
    .filter(Boolean) as BoundingBox[]
  if (!cleaned.length) return null

  const uniqueMap = new Map<string, BoundingBox>()
  for (const box of cleaned) {
    uniqueMap.set(`${box.left}:${box.top}:${box.width}:${box.height}`, box)
  }
  const unique = Array.from(uniqueMap.values())
  unique.sort((a, b) => a.width * a.height - b.width * b.height)

  return unique[Math.floor(unique.length / 2)] ?? unique[0]
}

function expandBox(
  box: BoundingBox,
  width: number,
  height: number,
  pixels: number
) {
  const left = Math.max(0, box.left - pixels)
  const top = Math.max(0, box.top - pixels)
  const right = Math.min(width - 1, box.left + box.width - 1 + pixels)
  const bottom = Math.min(height - 1, box.top + box.height - 1 + pixels)
  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  } satisfies BoundingBox
}

function sampleEdgeIndices(width: number, height: number) {
  const indices: number[] = []
  const step = Math.max(1, Math.round(Math.min(width, height) / 240))

  for (let x = 0; x < width; x += step) {
    indices.push(x)
    indices.push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += step) {
    indices.push(y * width)
    indices.push(y * width + (width - 1))
  }

  return indices
}

function detectUniformTone(data: Buffer, width: number, height: number): BgTone | null {
  const indices = sampleEdgeIndices(width, height)
  if (!indices.length) return null

  let whiteVotes = 0
  let blackVotes = 0

  for (const idx of indices) {
    const base = idx * 4
    const r = data[base] ?? 0
    const g = data[base + 1] ?? 0
    const b = data[base + 2] ?? 0
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

    if (luma >= 215 && max - min <= 60) whiteVotes += 1
    if (luma <= 40 && max - min <= 60) blackVotes += 1
  }

  const total = indices.length
  const whiteRatio = whiteVotes / total
  const blackRatio = blackVotes / total

  if (whiteRatio >= 0.68) return "white"
  if (blackRatio >= 0.68) return "black"
  return null
}

function estimateEdgeBackgroundColor(
  data: Buffer,
  width: number,
  height: number,
  tone: BgTone
) {
  const indices = sampleEdgeIndices(width, height)
  const color = tone === "white" ? WHITE_BG : BLACK_BG
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let count = 0

  for (const idx of indices) {
    const base = idx * 4
    const r = data[base] ?? 0
    const g = data[base + 1] ?? 0
    const b = data[base + 2] ?? 0
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const spread = Math.max(r, g, b) - Math.min(r, g, b)

    if (tone === "white") {
      if (luma < 170 || spread > 90) continue
    } else {
      if (luma > 95 || spread > 90) continue
    }

    sumR += r
    sumG += g
    sumB += b
    count += 1
  }

  if (!count) return color

  return {
    r: toByte(sumR / count),
    g: toByte(sumG / count),
    b: toByte(sumB / count),
  }
}

function removeUniformBackground(
  data: Buffer,
  width: number,
  height: number,
  tone: BgTone
) {
  const pixelCount = width * height
  if (!pixelCount) return null

  const bgColor = estimateEdgeBackgroundColor(data, width, height, tone)
  const bgColorDistanceLimit = tone === "white" ? 95 * 95 : 85 * 85

  const visited = new Uint8Array(pixelCount)
  const background = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let head = 0
  let tail = 0

  const isBackgroundCandidate = (index: number, fromIndex: number | null) => {
    const base = index * 4
    const r = data[base] ?? 0
    const g = data[base + 1] ?? 0
    const b = data[base + 2] ?? 0
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    const distToBg = colorDistanceSquared({ r, g, b }, bgColor)

    if (tone === "white") {
      if (luma < 150 || spread > 95 || distToBg > bgColorDistanceLimit) {
        return false
      }
    } else {
      if (luma > 120 || spread > 95 || distToBg > bgColorDistanceLimit) {
        return false
      }
    }

    if (fromIndex !== null) {
      const fromBase = fromIndex * 4
      const fromR = data[fromBase] ?? 0
      const fromG = data[fromBase + 1] ?? 0
      const fromB = data[fromBase + 2] ?? 0
      const stepDistance = colorDistanceSquared(
        { r, g, b },
        { r: fromR, g: fromG, b: fromB }
      )
      if (stepDistance > 35 * 35) return false
    }

    return true
  }

  const trySeed = (index: number) => {
    if (index < 0 || index >= pixelCount) return
    if (visited[index]) return
    visited[index] = 1
    if (!isBackgroundCandidate(index, null)) return
    background[index] = 1
    queue[tail] = index
    tail += 1
  }

  for (let x = 0; x < width; x += 1) {
    trySeed(x)
    trySeed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    trySeed(y * width)
    trySeed(y * width + (width - 1))
  }

  if (tail === 0) return null

  while (head < tail) {
    const current = queue[head]
    head += 1
    const x = current % width
    const y = Math.trunc(current / width)

    const neighbors: number[] = []
    if (x > 0) neighbors.push(current - 1)
    if (x + 1 < width) neighbors.push(current + 1)
    if (y > 0) neighbors.push(current - width)
    if (y + 1 < height) neighbors.push(current + width)

    for (const next of neighbors) {
      if (visited[next]) continue
      visited[next] = 1
      if (!isBackgroundCandidate(next, current)) continue
      background[next] = 1
      queue[tail] = next
      tail += 1
    }
  }

  let bgCount = 0
  for (let i = 0; i < pixelCount; i += 1) {
    if (background[i]) bgCount += 1
  }

  const bgRatio = bgCount / pixelCount
  if (bgRatio < 0.05 || bgRatio > 0.98) return null

  const output = Buffer.from(data)
  for (let index = 0; index < pixelCount; index += 1) {
    const alphaIndex = index * 4 + 3
    if (background[index]) {
      output[alphaIndex] = 0
    } else {
      output[alphaIndex] = 255
    }
  }

  const alphaInfo = analyzeAlpha(output, pixelCount)
  if (!alphaInfo.hasUsefulAlpha) return null
  return output
}

export async function normalizeCatalogUploadImage(
  inputBuffer: Buffer,
  options: NormalizeOptions
) {
  const baseRaw = await readRawImage(inputBuffer)
  const pixelCount = baseRaw.width * baseRaw.height
  const baseAlpha = analyzeAlpha(baseRaw.data, pixelCount)

  let workingRaw = baseRaw
  let workingBuffer = inputBuffer
  let removedBackground = false

  if (!baseAlpha.hasUsefulAlpha) {
    try {
      const mlBuffer = await removeBackgroundWithMl(inputBuffer)
      if (mlBuffer) {
        const mlRaw = await readRawImage(mlBuffer)
        const mlAlpha = analyzeAlpha(mlRaw.data, mlRaw.width * mlRaw.height)
        if (mlAlpha.hasUsefulAlpha) {
          workingRaw = mlRaw
          workingBuffer = mlBuffer
          removedBackground = true
        }
      }
    } catch {
      // Fallback below.
    }
  }

  if (!removedBackground && !baseAlpha.hasUsefulAlpha) {
    const tone = detectUniformTone(baseRaw.data, baseRaw.width, baseRaw.height)
    if (tone) {
      const masked = removeUniformBackground(
        baseRaw.data,
        baseRaw.width,
        baseRaw.height,
        tone
      )
      if (masked) {
        workingRaw = {
          data: masked,
          width: baseRaw.width,
          height: baseRaw.height,
        }
        workingBuffer = await sharp(masked, {
          raw: {
            width: baseRaw.width,
            height: baseRaw.height,
            channels: 4,
          },
        })
          .png()
          .toBuffer()
        removedBackground = true
      }
    }
  }

  const width = workingRaw.width
  const height = workingRaw.height

  let detected = detectAlphaForegroundBox(workingRaw.data, width, height)

  if (!detected) {
    const heuristic = detectForegroundBox(workingRaw.data, width, height)
    const [trimDefault, trimWhite, trimBlack] = await Promise.all([
      detectTrimBox(workingBuffer, width, height, null, 10).catch(() => null),
      detectTrimBox(workingBuffer, width, height, WHITE_BG, 10).catch(() => null),
      detectTrimBox(workingBuffer, width, height, BLACK_BG, 10).catch(() => null),
    ])

    detected = pickBestCandidate(
      [heuristic, trimDefault, trimWhite, trimBlack],
      width,
      height
    )
  }

  if (detected) {
    const safePixels = Math.max(2, Math.round(Math.max(width, height) * 0.012))
    detected = expandBox(detected, width, height, safePixels)
  }

  let pipeline = sharp(workingRaw.data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })

  if (detected) {
    pipeline = pipeline.extract(detected)
  }

  const buffer = await pipeline
    .extend({
      top: options.paddingPx,
      right: options.paddingPx,
      bottom: options.paddingPx,
      left: options.paddingPx,
      background: TRANSPARENT_BG,
    })
    .resize(options.outputSizePx, options.outputSizePx, {
      fit: "contain",
      background: TRANSPARENT_BG,
    })
    .webp({
      quality: 96,
      alphaQuality: 100,
      nearLossless: true,
      effort: 6,
    })
    .toBuffer()

  return {
    buffer,
    cropped: Boolean(detected),
    removedBackground,
  }
}
