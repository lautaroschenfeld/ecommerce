import { cleanupCheckoutIdempotency } from "../scripts/cleanup-checkout-idempotency"
import { cleanupTransferProofs } from "../scripts/cleanup-transfer-proofs"
import { logError, logInfo } from "./logger"

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

function isSchedulerEnabled() {
  const raw = String(process.env.MAINTENANCE_JOBS_ENABLED || "true").trim().toLowerCase()
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no")
}

function unrefTimer(timer: NodeJS.Timeout) {
  if (typeof timer.unref === "function") timer.unref()
}

type SchedulerHandle = {
  stop: () => void
}

export function startMaintenanceScheduler(): SchedulerHandle {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "test") {
    return { stop: () => undefined }
  }

  if (!isSchedulerEnabled()) {
    logInfo("maintenance.scheduler.disabled")
    return { stop: () => undefined }
  }

  const initialDelayMs = toPositiveInt(process.env.MAINTENANCE_INITIAL_DELAY_MS, 45_000)
  const transferProofIntervalMs = toPositiveInt(
    process.env.MAINTENANCE_TRANSFER_PROOF_INTERVAL_MS,
    6 * 60 * 60 * 1000
  )
  const idempotencyIntervalMs = toPositiveInt(
    process.env.MAINTENANCE_CHECKOUT_IDEMPOTENCY_INTERVAL_MS,
    15 * 60 * 1000
  )

  let stopped = false
  let transferProofRunning = false
  let idempotencyRunning = false

  const runTransferProofCleanup = () => {
    if (stopped || transferProofRunning) return
    transferProofRunning = true

    void cleanupTransferProofs()
      .then((result) => {
        logInfo("maintenance.transfer_proofs.cleanup", {
          mode: result.mode,
          retentionDays: result.retentionDays,
          scannedFiles: result.scannedFiles,
          deletedFiles: result.deletedFiles,
          removedDirs: result.removedDirs,
          reclaimedBytes: result.reclaimedBytes,
        })
      })
      .catch((error) => {
        logError("maintenance.transfer_proofs.cleanup_failed", {
          message: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        transferProofRunning = false
      })
  }

  const runIdempotencyCleanup = () => {
    if (stopped || idempotencyRunning) return
    idempotencyRunning = true

    void cleanupCheckoutIdempotency()
      .then((result) => {
        logInfo("maintenance.checkout_idempotency.cleanup", {
          mode: result.mode,
          retentionDays: result.retentionDays,
          matching: result.matching,
          deleted: result.deleted,
        })
      })
      .catch((error) => {
        logError("maintenance.checkout_idempotency.cleanup_failed", {
          message: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        idempotencyRunning = false
      })
  }

  const initialTimer = setTimeout(() => {
    runTransferProofCleanup()
    runIdempotencyCleanup()
  }, initialDelayMs)
  const transferProofTimer = setInterval(runTransferProofCleanup, transferProofIntervalMs)
  const idempotencyTimer = setInterval(runIdempotencyCleanup, idempotencyIntervalMs)

  unrefTimer(initialTimer)
  unrefTimer(transferProofTimer)
  unrefTimer(idempotencyTimer)

  logInfo("maintenance.scheduler.started", {
    initialDelayMs,
    transferProofIntervalMs,
    idempotencyIntervalMs,
  })

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      clearTimeout(initialTimer)
      clearInterval(transferProofTimer)
      clearInterval(idempotencyTimer)
      logInfo("maintenance.scheduler.stopped")
    },
  }
}
