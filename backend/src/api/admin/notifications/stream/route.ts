import type { HttpRequest, HttpResponse } from "../../../../lib/http"

import { requireCustomerAdmin } from "../../../store/catalog/_shared/customer-auth"
import {
  listAdminNotificationsAfter,
  subscribeAdminNotifications,
  type AdminNotificationEvent,
} from "../../../../lib/admin-notifications"

function writeEvent(res: HttpResponse, event: AdminNotificationEvent) {
  res.write(`id: ${event.id}\n`)
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function readLastEventId(req: HttpRequest) {
  const raw = req.headers?.["last-event-id"]
  if (typeof raw === "string") return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim()
  return ""
}

function createWriteDeduper() {
  const sentIds = new Set<string>()

  return (res: HttpResponse, event: AdminNotificationEvent) => {
    const id = String(event?.id || "").trim()
    if (!id) return
    if (sentIds.has(id)) return

    sentIds.add(id)
    if (sentIds.size > 2000) {
      const first = sentIds.values().next().value
      if (first) sentIds.delete(first)
    }

    writeEvent(res, event)
  }
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  res.status(200)
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  // Nginx/Reverse proxies: avoid buffering SSE.
  res.setHeader("X-Accel-Buffering", "no")

  res.flushHeaders?.()
  res.write(`: ready\n\n`)

  const writeOnce = createWriteDeduper()
  const pendingEvents: AdminNotificationEvent[] = []
  let replayDone = false

  const unsubscribe = subscribeAdminNotifications((event) => {
    try {
      if (!replayDone) {
        pendingEvents.push(event)
        return
      }
      writeOnce(res, event)
    } catch {
      // Connection likely closed; `close` handler will clean up.
    }
  })

  const lastEventId = readLastEventId(req)
  if (lastEventId) {
    try {
      const missed = await listAdminNotificationsAfter(lastEventId, 200)
      for (const event of missed) {
        writeOnce(res, event)
      }
    } catch (error) {
      console.error("[admin.notifications.stream] replay failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  replayDone = true
  for (const event of pendingEvents) {
    try {
      writeOnce(res, event)
    } catch {
      // ignore
    }
  }

  const ping = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`)
    } catch {
      // ignore
    }
  }, 25_000)

  req.on("close", () => {
    clearInterval(ping)
    unsubscribe()
    try {
      res.end()
    } catch {
      // ignore
    }
  })
}
