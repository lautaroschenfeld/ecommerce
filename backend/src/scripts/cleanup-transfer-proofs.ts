import * as fs from "fs/promises"
import path from "path"

type CleanupStats = {
  scannedFiles: number
  deletedFiles: number
  removedDirs: number
  reclaimedBytes: number
}

export type TransferProofCleanupResult = CleanupStats & {
  mode: "dry-run" | "apply"
  retentionDays: number
  uploadRoot: string
}

export type TransferProofCleanupOptions = {
  dryRun?: boolean
  retentionDays?: number
  uploadRoot?: string
}

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.trunc(parsed)
}

function parseArgs(argv: string[]) {
  const flags = new Set(argv.map((item) => String(item || "").trim().toLowerCase()))
  return {
    dryRun: flags.has("--dry-run"),
  }
}

async function cleanupTree(input: {
  dir: string
  cutoffMs: number
  dryRun: boolean
  keepDir: string
  stats: CleanupStats
}) {
  const entries = await fs.readdir(input.dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(input.dir, entry.name)

    if (entry.isDirectory()) {
      await cleanupTree({
        ...input,
        dir: fullPath,
      })
      continue
    }

    if (!entry.isFile()) continue

    input.stats.scannedFiles += 1

    let fileStat: Awaited<ReturnType<typeof fs.stat>>
    try {
      fileStat = await fs.stat(fullPath)
    } catch {
      continue
    }

    if (!Number.isFinite(fileStat.mtimeMs) || fileStat.mtimeMs >= input.cutoffMs) {
      continue
    }

    input.stats.deletedFiles += 1
    input.stats.reclaimedBytes += Math.max(0, Number(fileStat.size || 0))

    if (!input.dryRun) {
      await fs.unlink(fullPath).catch(() => {
        // Best-effort cleanup.
      })
    }
  }

  if (path.resolve(input.dir) === path.resolve(input.keepDir)) return

  const remaining = await fs.readdir(input.dir).catch(() => [])
  if (remaining.length > 0) return

  input.stats.removedDirs += 1
  if (!input.dryRun) {
    await fs.rmdir(input.dir).catch(() => {
      // Best-effort cleanup.
    })
  }
}

export async function cleanupTransferProofs(
  options: TransferProofCleanupOptions = {}
): Promise<TransferProofCleanupResult> {
  const retentionDays = toPositiveInt(
    options.retentionDays ?? process.env.TRANSFER_PROOF_RETENTION_DAYS,
    45
  )
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const uploadRoot = path.resolve(
    options.uploadRoot || path.join(process.cwd(), "uploads", "transfer-proofs")
  )
  const dryRun = Boolean(options.dryRun)

  const stats: CleanupStats = {
    scannedFiles: 0,
    deletedFiles: 0,
    removedDirs: 0,
    reclaimedBytes: 0,
  }

  const rootExists = await fs
    .stat(uploadRoot)
    .then((entry) => entry.isDirectory())
    .catch(() => false)

  if (!rootExists) {
    return {
      ...stats,
      mode: dryRun ? "dry-run" : "apply",
      retentionDays,
      uploadRoot,
    }
  }

  await cleanupTree({
    dir: uploadRoot,
    cutoffMs,
    dryRun,
    keepDir: uploadRoot,
    stats,
  })

  return {
    ...stats,
    mode: dryRun ? "dry-run" : "apply",
    retentionDays,
    uploadRoot,
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const result = await cleanupTransferProofs({
    dryRun: args.dryRun,
  })

  if (result.scannedFiles === 0 && result.deletedFiles === 0) {
    const rootExists = await fs
      .stat(result.uploadRoot)
      .then((entry) => entry.isDirectory())
      .catch(() => false)
    if (!rootExists) {
      console.log(`[cleanup-transfer-proofs] directory not found: ${result.uploadRoot}`)
      return
    }
  }

  const reclaimedMb = Math.round((result.reclaimedBytes / (1024 * 1024)) * 100) / 100
  console.log(
    `[cleanup-transfer-proofs] mode=${result.mode} retention_days=${result.retentionDays} scanned=${result.scannedFiles} deleted=${result.deletedFiles} dirs_removed=${result.removedDirs} reclaimed_mb=${reclaimedMb}`
  )
}

if (require.main === module) {
  void run().catch((error) => {
    console.error("[cleanup-transfer-proofs] failed", {
      message: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
}
