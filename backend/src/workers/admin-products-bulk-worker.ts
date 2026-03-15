import { runAppMigrations } from "../lib/db-migrations"
import { assertSecureRuntimeEnv, loadEnv } from "../lib/env"
import { closePgPool } from "../lib/pg"
import {
  claimNextQueuedBulkJob,
  markJobFailed,
  persistBulkJob,
} from "../api/store/catalog/account/admin/products/bulk/_state"
import { runBulkJob } from "../api/store/catalog/account/admin/products/bulk/_runner"

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.trunc(parsed)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function startAdminProductsBulkWorker() {
  loadEnv()
  assertSecureRuntimeEnv()
  await runAppMigrations()

  const pollMs = toPositiveInt(process.env.ADMIN_BULK_WORKER_POLL_MS, 1000)
  const errorBackoffMs = toPositiveInt(process.env.ADMIN_BULK_WORKER_ERROR_BACKOFF_MS, 3000)

  let stopping = false
  const requestStop = () => {
    stopping = true
  }

  process.once("SIGTERM", requestStop)
  process.once("SIGINT", requestStop)

  console.log(`[bulk-worker] started (poll=${pollMs}ms)`)

  try {
    while (!stopping) {
      try {
        const job = await claimNextQueuedBulkJob()
        if (!job) {
          await sleep(pollMs)
          continue
        }

        try {
          await runBulkJob(job)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "No se pudo ejecutar el job masivo."
          markJobFailed(job, message)
          await persistBulkJob(job)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[bulk-worker] loop error", { message })
        await sleep(errorBackoffMs)
      }
    }
  } finally {
    process.off("SIGTERM", requestStop)
    process.off("SIGINT", requestStop)

    await closePgPool().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[bulk-worker] close pg pool failed", { message })
    })

    console.log("[bulk-worker] stopped")
  }
}

if (require.main === module) {
  void startAdminProductsBulkWorker().catch((error) => {
    console.error("[bulk-worker] fatal error", {
      message: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
}


