import {
  type AdminProductsBulkJob,
  claimNextQueuedBulkJob,
  markJobFailed,
  persistBulkJob,
} from "./_state"
import { runBulkJob } from "./_runner"

let drainPromise: Promise<void> | null = null

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo ejecutar el job masivo."
}

function logBulkDrainError(context: string, error: unknown) {
  const message = toErrorMessage(error)
  const stack = error instanceof Error ? error.stack : undefined
  console.error(`[bulk-drain] ${context}`, { message, stack })
}

async function drainQueuedJobs() {
  while (true) {
    let job: AdminProductsBulkJob | null = null
    try {
      job = await claimNextQueuedBulkJob()
    } catch (error) {
      logBulkDrainError("No se pudo reclamar el siguiente job.", error)
      break
    }
    if (!job) break

    try {
      await runBulkJob(job)
    } catch (error) {
      markJobFailed(job, toErrorMessage(error))
      try {
        await persistBulkJob(job)
      } catch (persistError) {
        logBulkDrainError(
          `No se pudo persistir el estado fallido del job ${job.id}.`,
          persistError
        )
      }
    }
  }
}

export function ensureBulkJobsDrain() {
  if (drainPromise) return

  drainPromise = (async () => {
    try {
      await drainQueuedJobs()
    } catch (error) {
      logBulkDrainError("Fallo inesperado durante el drenaje de jobs.", error)
    } finally {
      drainPromise = null
    }
  })()
}
