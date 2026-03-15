import { loadEnv } from "../lib/env"
import { closePgPool, pgQuery } from "../lib/pg"

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

function hasArg(name: string) {
  return process.argv.includes(name)
}

async function readMatchingRows(retentionDays: number) {
  const rows = await pgQuery<{ count: string }>(
    `select count(*)::text as "count"
     from "mp_checkout_idempotency"
     where "created_at" < now() - ($1::integer * interval '1 day');`,
    [retentionDays]
  )
  return toPositiveInt(rows[0]?.count, 0)
}

async function deleteExpiredRows(retentionDays: number) {
  await pgQuery(
    `delete from "mp_checkout_idempotency"
     where "created_at" < now() - ($1::integer * interval '1 day');`,
    [retentionDays]
  )
}

export type CheckoutIdempotencyCleanupResult = {
  mode: "dry-run" | "delete"
  retentionDays: number
  matching: number
  deleted: number
}

export async function cleanupCheckoutIdempotency(input: {
  dryRun?: boolean
  retentionDays?: number
} = {}): Promise<CheckoutIdempotencyCleanupResult> {
  const dryRun = Boolean(input.dryRun)
  const retentionDays = toPositiveInt(
    input.retentionDays ?? process.env.CHECKOUT_IDEMPOTENCY_RETENTION_DAYS,
    14
  )

  const before = await readMatchingRows(retentionDays)
  let deleted = 0

  if (!dryRun && before > 0) {
    await deleteExpiredRows(retentionDays)
    const after = await readMatchingRows(retentionDays)
    deleted = Math.max(0, before - after)
  }

  return {
    mode: dryRun ? "dry-run" : "delete",
    retentionDays,
    matching: before,
    deleted,
  }
}

async function main() {
  loadEnv()

  const result = await cleanupCheckoutIdempotency({
    dryRun: hasArg("--dry-run"),
  })

  console.log(
    `[cleanup-checkout-idempotency] mode=${result.mode} retention_days=${result.retentionDays} matching=${result.matching} deleted=${result.deleted}`
  )
}

if (require.main === module) {
  void main()
    .catch((error) => {
      console.error("[cleanup-checkout-idempotency] failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      process.exitCode = 1
    })
    .finally(async () => {
      await closePgPool().catch(() => {
        // best-effort
      })
    })
}
