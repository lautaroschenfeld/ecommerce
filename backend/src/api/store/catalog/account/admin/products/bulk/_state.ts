import { prefixedNanoId } from "../../../../../../../lib/id"
import { pgQuery } from "../../../../../../../lib/pg"

export type AdminProductsBulkAction =
  | "publish"
  | "delete"
  | "change_category"
  | "adjust_stock"

export type AdminProductsBulkJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"

export type AdminProductsBulkJobError = {
  productId: string
  message: string
}

export type AdminProductsBulkJob = {
  id: string
  action: AdminProductsBulkAction
  status: AdminProductsBulkJobStatus
  total: number
  processed: number
  succeeded: number
  failed: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  errors: AdminProductsBulkJobError[]
  parameters: Record<string, unknown>
}

type BulkJobRow = {
  id: string
  action: string
  status: string
  total: number | string
  processed: number | string
  succeeded: number | string
  failed: number | string
  created_at: string | Date
  started_at: string | Date | null
  finished_at: string | Date | null
  error: string | null
  errors: unknown
  parameters: unknown
  updated_at: string | Date
}

const JOB_TTL_MS = 1000 * 60 * 60 * 24
const MAX_JOBS = 250
const MAX_JOB_ERRORS = 60
const STALE_RUNNING_MS = 1000 * 60 * 30

function nowIso() {
  return new Date().toISOString()
}

function toMs(value: unknown) {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== "string") return Number.NaN
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : Number.NaN
}

function toIso(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function clampInt(value: unknown, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.trunc(n))
}

function sanitizeText(value: unknown, max = 240) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function sanitizeAction(value: unknown): AdminProductsBulkAction {
  const action = sanitizeText(value, 60).toLowerCase()
  if (
    action === "publish" ||
    action === "delete" ||
    action === "change_category" ||
    action === "adjust_stock"
  ) {
    return action
  }
  return "publish"
}

function sanitizeStatus(value: unknown): AdminProductsBulkJobStatus {
  const status = sanitizeText(value, 40).toLowerCase()
  if (
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status
  }
  return "failed"
}

function sanitizeErrors(value: unknown) {
  if (!Array.isArray(value)) return [] as AdminProductsBulkJobError[]

  const out: AdminProductsBulkJobError[] = []
  for (const item of value) {
    const rec = asRecord(item)
    if (!rec) continue

    const productId = sanitizeText(rec.productId ?? rec.product_id, 180)
    const message = sanitizeText(rec.message, 260)
    if (!productId || !message) continue

    out.push({ productId, message })
    if (out.length >= MAX_JOB_ERRORS) break
  }

  return out
}

function sanitizeParameters(value: unknown) {
  const rec = asRecord(value)
  if (!rec) return {} as Record<string, unknown>
  return rec
}

function mapJobRow(row: BulkJobRow): AdminProductsBulkJob {
  return {
    id: sanitizeText(row.id, 140),
    action: sanitizeAction(row.action),
    status: sanitizeStatus(row.status),
    total: clampInt(row.total),
    processed: clampInt(row.processed),
    succeeded: clampInt(row.succeeded),
    failed: clampInt(row.failed),
    createdAt: toIso(row.created_at) ?? nowIso(),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    error: sanitizeText(row.error, 260) || null,
    errors: sanitizeErrors(row.errors),
    parameters: sanitizeParameters(row.parameters),
  }
}

async function cleanupJobsInDb() {
  await pgQuery(
    `delete from "mp_admin_products_bulk_job"
     where coalesce("finished_at", "created_at")
       <= now() - ($1 * interval '1 millisecond');`,
    [JOB_TTL_MS]
  )

  await pgQuery(
    `with overflow as (
      select "id"
      from "mp_admin_products_bulk_job"
      order by "created_at" desc, "id" desc
      offset $1
    )
    delete from "mp_admin_products_bulk_job" j
    using overflow o
    where j."id" = o."id";`,
    [MAX_JOBS]
  )
}

export async function failStaleRunningJobs() {
  await pgQuery(
    `update "mp_admin_products_bulk_job"
       set "status" = 'failed',
           "error" = coalesce(
             nullif("error", ''),
             'Job interrumpido por reinicio o timeout del backend.'
           ),
           "finished_at" = coalesce("finished_at", now()),
           "updated_at" = now()
     where "status" = 'running'
       and "updated_at" <= now() - ($1 * interval '1 millisecond');`,
    [STALE_RUNNING_MS]
  )
}

function buildJobId() {
  return prefixedNanoId("mpbulk", 16)
}

export async function createBulkJob(input: {
  action: AdminProductsBulkAction
  total: number
  parameters?: Record<string, unknown>
}) {
  await cleanupJobsInDb()

  const createdAt = nowIso()
  const job: AdminProductsBulkJob = {
    id: buildJobId(),
    action: input.action,
    status: "queued",
    total: Math.max(0, Math.trunc(input.total)),
    processed: 0,
    succeeded: 0,
    failed: 0,
    createdAt,
    startedAt: null,
    finishedAt: null,
    error: null,
    errors: [],
    parameters: input.parameters ?? {},
  }

  const rows = await pgQuery<BulkJobRow>(
    `insert into "mp_admin_products_bulk_job"
      ("id","action","status","total","processed","succeeded","failed","created_at","started_at","finished_at","error","errors","parameters","updated_at")
     values
      ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::jsonb,$13::jsonb,now())
     returning
      "id","action","status","total","processed","succeeded","failed","created_at","started_at","finished_at","error","errors","parameters","updated_at";`,
    [
      job.id,
      job.action,
      job.status,
      job.total,
      job.processed,
      job.succeeded,
      job.failed,
      job.createdAt,
      null,
      null,
      null,
      JSON.stringify(job.errors),
      JSON.stringify(job.parameters),
    ]
  )

  await cleanupJobsInDb()

  const row = rows[0]
  if (!row) return job
  return mapJobRow(row)
}

export async function getBulkJob(jobIdRaw: string) {
  const jobId = sanitizeText(jobIdRaw, 140)
  if (!jobId) return null

  await failStaleRunningJobs()

  const rows = await pgQuery<BulkJobRow>(
    `select
      "id","action","status","total","processed","succeeded","failed","created_at","started_at","finished_at","error","errors","parameters","updated_at"
     from "mp_admin_products_bulk_job"
     where "id" = $1
     limit 1;`,
    [jobId]
  )

  const row = rows[0]
  if (!row) return null
  return mapJobRow(row)
}

export async function claimNextQueuedBulkJob() {
  await failStaleRunningJobs()

  const rows = await pgQuery<BulkJobRow>(
    `with next_job as (
      select j."id"
      from "mp_admin_products_bulk_job" j
      where j."status" = 'queued'
      order by j."created_at" asc, j."id" asc
      limit 1
      for update skip locked
    )
    update "mp_admin_products_bulk_job" j
       set "status" = 'running',
           "started_at" = coalesce(j."started_at", now()),
           "finished_at" = null,
           "error" = null,
           "updated_at" = now()
     from next_job
     where j."id" = next_job."id"
     returning
      j."id" as "id",
      j."action" as "action",
      j."status" as "status",
      j."total" as "total",
      j."processed" as "processed",
      j."succeeded" as "succeeded",
      j."failed" as "failed",
      j."created_at" as "created_at",
      j."started_at" as "started_at",
      j."finished_at" as "finished_at",
      j."error" as "error",
      j."errors" as "errors",
      j."parameters" as "parameters",
      j."updated_at" as "updated_at";`
  )

  const row = rows[0]
  if (!row) return null
  return mapJobRow(row)
}

export async function persistBulkJob(job: AdminProductsBulkJob) {
  const rows = await pgQuery<BulkJobRow>(
    `update "mp_admin_products_bulk_job"
       set "action" = $2,
           "status" = $3,
           "total" = $4,
           "processed" = $5,
           "succeeded" = $6,
           "failed" = $7,
           "created_at" = $8::timestamptz,
           "started_at" = $9::timestamptz,
           "finished_at" = $10::timestamptz,
           "error" = $11,
           "errors" = $12::jsonb,
           "parameters" = $13::jsonb,
           "updated_at" = now()
     where "id" = $1
     returning
      "id","action","status","total","processed","succeeded","failed","created_at","started_at","finished_at","error","errors","parameters","updated_at";`,
    [
      job.id,
      job.action,
      job.status,
      Math.max(0, Math.trunc(job.total)),
      Math.max(0, Math.trunc(job.processed)),
      Math.max(0, Math.trunc(job.succeeded)),
      Math.max(0, Math.trunc(job.failed)),
      job.createdAt,
      job.startedAt,
      job.finishedAt,
      sanitizeText(job.error, 260) || null,
      JSON.stringify(job.errors.slice(0, MAX_JOB_ERRORS)),
      JSON.stringify(job.parameters ?? {}),
    ]
  )

  const row = rows[0]
  if (!row) return job

  const mapped = mapJobRow(row)
  Object.assign(job, mapped)
  return mapped
}

export function markJobRunning(job: AdminProductsBulkJob) {
  job.status = "running"
  job.startedAt = nowIso()
  job.error = null
}

export function markJobCompleted(job: AdminProductsBulkJob) {
  job.status = "completed"
  job.finishedAt = nowIso()
}

export function markJobFailed(job: AdminProductsBulkJob, message: string) {
  job.status = "failed"
  job.error = sanitizeText(message, 260) || "No se pudo completar la operación."
  job.finishedAt = nowIso()
}

export function pushJobError(
  job: AdminProductsBulkJob,
  error: AdminProductsBulkJobError
) {
  if (job.errors.length >= MAX_JOB_ERRORS) return
  const productId = sanitizeText(error.productId, 180)
  const message = sanitizeText(error.message, 260)
  if (!productId || !message) return
  job.errors.push({ productId, message })
}
