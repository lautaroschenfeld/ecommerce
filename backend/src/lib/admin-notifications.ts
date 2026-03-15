import { nanoId } from "./id"
import { getPgPool, pgQuery, pgTransaction, type PgClient } from "./pg"

export type AdminNotificationEvent = {
  id: string
  type: string
  createdAt: number
  payload?: unknown
}

type Listener = (event: AdminNotificationEvent) => void

type NotificationRow = {
  id: string
  type: string
  payload: unknown
  created_at: string | Date
}

type ListenClient = PgClient & {
  on: (event: string, handler: (...args: any[]) => void) => void
  removeListener: (event: string, handler: (...args: any[]) => void) => void
}

type PgNotification = {
  channel?: string
  payload?: string
}

const listeners = new Set<Listener>()
const recentlyDeliveredIds = new Map<string, number>()

const NOTIFY_CHANNEL = "mp_admin_notifications"
const EVENT_RETENTION_MS = 1000 * 60 * 60 * 24 * 7
const CLEANUP_EVERY_MS = 1000 * 60 * 5
const LISTEN_RETRY_MS = 2000
const RECENT_ID_TTL_MS = 1000 * 60
const RECENT_ID_MAX = 4000

let listenClient: ListenClient | null = null
let listenReadyPromise: Promise<void> | null = null
let listenReconnectTimer: NodeJS.Timeout | null = null
let lastCleanupAt = 0

function nowMs() {
  return Date.now()
}

function toMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  return Number.NaN
}

function cleanText(value: unknown, max = 160) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, max)
}

function serializeJson(value: unknown) {
  try {
    return JSON.stringify(value === undefined ? null : value)
  } catch {
    return JSON.stringify({ message: "payload_not_serializable" })
  }
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function mapNotificationRow(row: NotificationRow): AdminNotificationEvent {
  const createdAtMs = toMs(row.created_at)
  return {
    id: cleanText(row.id, 140),
    type: cleanText(row.type, 120),
    createdAt: Number.isFinite(createdAtMs) ? createdAtMs : nowMs(),
    payload: row.payload === null ? undefined : row.payload,
  }
}

function pruneRecentIds(now: number) {
  for (const [id, deliveredAt] of recentlyDeliveredIds) {
    if (now - deliveredAt <= RECENT_ID_TTL_MS) continue
    recentlyDeliveredIds.delete(id)
  }

  while (recentlyDeliveredIds.size > RECENT_ID_MAX) {
    const first = recentlyDeliveredIds.keys().next().value
    if (!first) break
    recentlyDeliveredIds.delete(first)
  }
}

function shouldDeliver(id: string) {
  if (!id) return false

  const now = nowMs()
  pruneRecentIds(now)

  if (recentlyDeliveredIds.has(id)) {
    return false
  }

  recentlyDeliveredIds.set(id, now)
  return true
}

function emitToLocalListeners(event: AdminNotificationEvent) {
  if (!shouldDeliver(event.id)) return

  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Best-effort delivery.
    }
  }
}

function decodeNotificationPayload(payloadRaw: string | undefined) {
  if (!payloadRaw) return null

  const parsed = parseJson<Record<string, unknown>>(payloadRaw)
  if (!parsed) return null

  const id = cleanText(parsed.id, 140)
  const type = cleanText(parsed.type, 120)
  if (!id || !type) return null

  const createdAt = toMs(parsed.createdAt)

  return {
    id,
    type,
    createdAt: Number.isFinite(createdAt) ? createdAt : nowMs(),
    payload: parsed.payload,
  } satisfies AdminNotificationEvent
}

function scheduleListenReconnect() {
  if (listenReconnectTimer) return
  if (!listeners.size) return

  listenReconnectTimer = setTimeout(() => {
    listenReconnectTimer = null
    void ensureListenConnection().catch((error) => {
      console.error("[admin-notifications] listen reconnect failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }, LISTEN_RETRY_MS)
}

function closeListenClient(client: ListenClient | null) {
  if (!client) return

  try {
    client.release()
  } catch {
    // ignore
  }
}

async function ensureListenConnection() {
  if (listenClient) return
  if (listenReadyPromise) return listenReadyPromise

  listenReadyPromise = (async () => {
    const client = (await getPgPool().connect()) as ListenClient

    const onNotification = (msg: PgNotification) => {
      if (msg?.channel !== NOTIFY_CHANNEL) return

      const event = decodeNotificationPayload(msg.payload)
      if (!event) return

      emitToLocalListeners(event)
    }

    const onDisconnect = (error: unknown) => {
      if (listenClient !== client) return

      listenClient = null
      client.removeListener("notification", onNotification)
      client.removeListener("error", onDisconnect)
      client.removeListener("end", onDisconnect)
      closeListenClient(client)

      console.error("[admin-notifications] listen connection dropped", {
        message: error instanceof Error ? error.message : String(error),
      })
      scheduleListenReconnect()
    }

    client.on("notification", onNotification)
    client.on("error", onDisconnect)
    client.on("end", onDisconnect)

    try {
      await client.query(`LISTEN ${NOTIFY_CHANNEL};`)
      listenClient = client
    } catch (error) {
      client.removeListener("notification", onNotification)
      client.removeListener("error", onDisconnect)
      client.removeListener("end", onDisconnect)
      closeListenClient(client)
      throw error
    }
  })()
    .catch((error) => {
      scheduleListenReconnect()
      throw error
    })
    .finally(() => {
      listenReadyPromise = null
    })

  return listenReadyPromise
}

async function cleanupOldEventsIfNeeded() {
  const now = nowMs()
  if (now - lastCleanupAt < CLEANUP_EVERY_MS) return
  lastCleanupAt = now

  await pgQuery(
    `delete from "mp_admin_notification_event"
     where "created_at" <= now() - ($1 * interval '1 millisecond');`,
    [EVENT_RETENTION_MS]
  )
}

export function publishAdminNotification(input: {
  type: string
  payload?: unknown
  createdAtMs?: number
}) {
  const type = cleanText(input.type, 120)
  if (!type) return

  const createdAt =
    typeof input.createdAtMs === "number" && Number.isFinite(input.createdAtMs)
      ? Math.trunc(input.createdAtMs)
      : nowMs()

  const event: AdminNotificationEvent = {
    id: nanoId(),
    type,
    createdAt,
    payload: input.payload,
  }

  const payloadJson = serializeJson(event.payload)
  const eventJson = serializeJson(event)

  void pgTransaction(async (client) => {
    await client.query(
      `insert into "mp_admin_notification_event" ("id", "type", "payload", "created_at")
       values ($1, $2, $3::jsonb, to_timestamp($4::double precision / 1000.0));`,
      [event.id, event.type, payloadJson, event.createdAt]
    )

    await client.query(`select pg_notify($1, $2);`, [NOTIFY_CHANNEL, eventJson])
  })
    .then(() => {
      emitToLocalListeners(event)
      return cleanupOldEventsIfNeeded()
    })
    .catch((error) => {
      console.error("[admin-notifications] publish failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      // Fallback local delivery to preserve behavior for single instance.
      emitToLocalListeners(event)
    })
}

export async function listAdminNotificationsAfter(eventIdRaw: string, limit = 200) {
  const eventId = cleanText(eventIdRaw, 140)
  if (!eventId) return [] as AdminNotificationEvent[]

  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)))

  const rows = await pgQuery<NotificationRow>(
    `with anchor as (
      select "created_at", "id"
      from "mp_admin_notification_event"
      where "id" = $1
      limit 1
    )
    select
      e."id",
      e."type",
      e."payload",
      e."created_at"
    from "mp_admin_notification_event" e
    where exists (select 1 from anchor)
      and (e."created_at", e."id") > (
        (select a."created_at" from anchor a),
        (select a."id" from anchor a)
      )
    order by e."created_at" asc, e."id" asc
    limit $2;`,
    [eventId, safeLimit]
  )

  return rows.map(mapNotificationRow)
}

export function subscribeAdminNotifications(listener: Listener) {
  listeners.add(listener)

  void ensureListenConnection().catch((error) => {
    console.error("[admin-notifications] listen bootstrap failed", {
      message: error instanceof Error ? error.message : String(error),
    })
  })

  return () => listeners.delete(listener)
}
