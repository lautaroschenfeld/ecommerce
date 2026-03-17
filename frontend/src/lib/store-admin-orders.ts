import { fetchJsonWithAuthRetry as fetchJson } from "./store-client"

const ADMIN_ORDERS_INVALIDATE_EVENT = "store:invalidate:admin-orders";

export type AdminOrder = {
  id: string
  order_number: string
  account_id: string | null
  email: string | null
  phone?: string | null
  status: string
  payment_status?: string | null
  total_ars: number
  currency_code?: string | null
  item_count: number
  shipping_method?: string | null
  payment_method?: string | null
  tracking_code?: string | null
  items: Array<{
    id: string
    name: string
    brand: string
    category: string
    priceArs?: number
    price_ars?: number
    unitPriceArs?: number
    unit_price_ars?: number
    qty: number
    imageUrl?: string
    image_url?: string
  }>
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AdminOrderItemStock = {
  availableQty?: number
  reservedQty?: number
  soldQty?: number
  inStock?: boolean
  lowStock?: boolean
  lowStockThreshold?: number
}

export type AdminOrderDetail = {
  order: AdminOrder
  item_skus?: Record<string, string>
  item_stock?: Record<string, AdminOrderItemStock>
}

export type AdminOrderSort = "created_desc" | "created_asc" | "total_desc" | "total_asc"

export type AdminOrdersQuery = {
  q?: string
  status?: string
  payment_status?: string
  from?: string
  to?: string
  sort?: AdminOrderSort
  limit?: number
  offset?: number
}

export type AdminOrdersPage = {
  orders: AdminOrder[]
  count: number
  limit: number
  offset: number
}

type AdminOrdersRequestOptions = {
  signal?: AbortSignal
}

const DEFAULT_ADMIN_ORDERS_PAGE_SIZE = 200

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || ""
}

function adminHeaders(): Record<string, string> {
  const key = getPublishableKey()
  if (!key) return {}
  return { "x-publishable-api-key": key }
}

function appendQueryParam(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return
  const text = typeof value === "string" ? value.trim() : String(value)
  if (!text) return
  params.set(key, text)
}

export async function getAdminOrdersPage(
  query: AdminOrdersQuery = {},
  options: AdminOrdersRequestOptions = {}
): Promise<AdminOrdersPage> {
  const params = new URLSearchParams()
  appendQueryParam(params, "q", query.q)
  appendQueryParam(params, "status", query.status)
  appendQueryParam(params, "payment_status", query.payment_status)
  appendQueryParam(params, "from", query.from)
  appendQueryParam(params, "to", query.to)
  appendQueryParam(params, "sort", query.sort)
  appendQueryParam(params, "limit", query.limit)
  appendQueryParam(params, "offset", query.offset)

  const queryString = params.toString()
  const path = `/store/catalog/account/admin/orders${queryString ? `?${queryString}` : ""}`

  const data = await fetchJson<{
    orders?: unknown[]
    count?: number | string
    limit?: number | string
    offset?: number | string
  }>(path,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
      signal: options.signal,
    }
  )

  const orders = (data.orders ?? []) as AdminOrder[]
  const parsedCount = Number(data.count)
  const parsedLimit = Number(data.limit)
  const parsedOffset = Number(data.offset)

  return {
    orders,
    count: Number.isFinite(parsedCount) && parsedCount >= 0 ? Math.trunc(parsedCount) : orders.length,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.trunc(parsedLimit) : 50,
    offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? Math.trunc(parsedOffset) : 0,
  }
}

export async function getAdminOrders(limit = 50): Promise<AdminOrder[]> {
  const page = await getAdminOrdersPage({ limit })
  return page.orders
}

export async function getAllAdminOrders(
  query: Omit<AdminOrdersQuery, "limit" | "offset"> = {},
  pageSize = DEFAULT_ADMIN_ORDERS_PAGE_SIZE
): Promise<AdminOrder[]> {
  const safePageSize = Math.max(1, Math.min(200, Math.trunc(pageSize || DEFAULT_ADMIN_ORDERS_PAGE_SIZE)))
  const collected: AdminOrder[] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  let fetchedPages = 0

  while (collected.length < total) {
    const page = await getAdminOrdersPage({
      ...query,
      limit: safePageSize,
      offset,
    })

    collected.push(...page.orders)
    total = Math.max(0, page.count)
    fetchedPages += 1

    if (page.orders.length === 0 || page.orders.length < page.limit) {
      break
    }

    offset += page.limit

    if (Number.isFinite(total) && fetchedPages > Math.ceil(total / safePageSize) + 2) {
      break
    }
  }

  if (Number.isFinite(total) && collected.length < total) {
    throw new Error("La carga masiva de ordenes quedo incompleta. Intenta nuevamente.")
  }

  return collected.slice(0, Number.isFinite(total) ? total : collected.length)
}

export async function getAdminOrder(
  orderId: string,
  options: AdminOrdersRequestOptions = {}
): Promise<AdminOrderDetail> {
  const data = await fetchJson<AdminOrderDetail>(
    `/store/catalog/account/admin/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
      signal: options.signal,
    }
  )
  return data
}

export async function patchAdminOrder(
  orderId: string,
  patch: Record<string, unknown>
): Promise<AdminOrderDetail> {
  const data = await fetchJson<AdminOrderDetail>(
    `/store/catalog/account/admin/orders/${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(),
        "content-type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(patch),
    }
  )
  return data
}

export function invalidateAdminOrders() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_ORDERS_INVALIDATE_EVENT));
}

export function subscribeAdminOrdersInvalidation(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ADMIN_ORDERS_INVALIDATE_EVENT, handler);
  return () => window.removeEventListener(ADMIN_ORDERS_INVALIDATE_EVENT, handler);
}
