// Minimal Postgres helper used by custom modules.
// Keep this framework-agnostic so it can be reused across modules.

export type PgQueryResult<T = any> = { rows: T[] }

export type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<PgQueryResult>
  release: () => void
}

export type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<PgQueryResult>
  connect: () => Promise<PgClient>
  end?: () => Promise<void>
}

let pool: PgPool | null = null

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

function getConnectionString() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Configure backend/.env (you can start from backend/.env.template)."
    )
  }
  return url
}

export function getPgPool(): PgPool {
  if (pool) return pool

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require("pg") as { Pool: new (args: any) => PgPool }

  const connectionTimeoutMs = toPositiveInt(process.env.PG_CONNECT_TIMEOUT_MS, 5000)
  const idleTimeoutMs = toPositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 30_000)

  pool = new Pool({
    connectionString: getConnectionString(),
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: idleTimeoutMs,
  })

  return pool
}

export async function closePgPool() {
  if (!pool) return
  const current = pool
  pool = null

  if (typeof current.end === "function") {
    await current.end()
  }
}

export async function pgQuery<T = any>(sql: string, params?: unknown[]) {
  const db = getPgPool()
  const result = (await db.query(sql, params)) as PgQueryResult<T>
  return result.rows
}

export async function pgTransaction<T>(fn: (client: PgClient) => Promise<T>) {
  const db = getPgPool()
  const client = await db.connect()

  try {
    await client.query("BEGIN")
    const out = await fn(client)
    await client.query("COMMIT")
    return out
  } catch (e) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // ignore rollback failures
    }
    throw e
  } finally {
    client.release()
  }
}
