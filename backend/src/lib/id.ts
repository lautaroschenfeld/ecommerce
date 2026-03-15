import { customAlphabet } from "nanoid"

const LOWER_ALPHA_NUMERIC = "0123456789abcdefghijklmnopqrstuvwxyz"
const DEFAULT_LENGTH = 21

const lowerGenerators = new Map<number, () => string>()

function normalizeLength(input: number) {
  const length = Number(input)
  if (!Number.isFinite(length) || length <= 0) return DEFAULT_LENGTH
  return Math.max(1, Math.trunc(length))
}

function getLowerGenerator(length: number) {
  const safeLength = normalizeLength(length)
  const cached = lowerGenerators.get(safeLength)
  if (cached) return cached

  const generator = customAlphabet(LOWER_ALPHA_NUMERIC, safeLength)
  lowerGenerators.set(safeLength, generator)
  return generator
}

export function nanoId(length = DEFAULT_LENGTH) {
  return getLowerGenerator(length)()
}

export function prefixedNanoId(prefix: string, length = DEFAULT_LENGTH) {
  const safePrefix = String(prefix || "").trim()
  if (!safePrefix) return nanoId(length)
  return `${safePrefix}_${nanoId(length)}`
}
