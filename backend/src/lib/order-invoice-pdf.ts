type InvoiceLine = {
  text: string
  fontSize?: number
}

type InvoiceItem = {
  name: string
  brand: string
  category: string
  qty: number
  unitPriceArs: number
  totalArs: number
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeText(value: unknown, max = 240) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function asciiText(value: unknown, max = 240) {
  const normalized = normalizeText(value, max)
  if (!normalized) return ""

  return normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
}

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
}

function toNumber(value: unknown) {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function toMoney(value: number, currencyCode = "ARS") {
  const safe = Math.max(0, Math.round(value))
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currencyCode || "ARS",
      maximumFractionDigits: 0,
    }).format(safe)
  } catch {
    return `${currencyCode || "ARS"} ${safe}`
  }
}

function toDateTime(value: unknown) {
  const raw =
    typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : null
  if (!raw || Number.isNaN(raw.getTime())) {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date())
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(raw)
}

function wrapText(value: string, maxChars = 86) {
  const out: string[] = []
  const text = asciiText(value, 800)
  if (!text) return out

  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return out

  let line = ""
  for (const word of words) {
    if (!line) {
      line = word
      continue
    }

    if (line.length + 1 + word.length <= maxChars) {
      line += ` ${word}`
      continue
    }

    out.push(line)
    line = word
  }

  if (line) out.push(line)
  return out
}

function readInvoiceItems(order: Record<string, any>) {
  const rawItems = Array.isArray(order.items) ? order.items : []
  const out: InvoiceItem[] = []

  for (const raw of rawItems) {
    const item = asRecord(raw)
    if (!item) continue

    const name = asciiText(item.name, 180) || "Item"
    const brand = asciiText(item.brand, 120)
    const category = asciiText(item.category, 120)
    const qty = Math.max(1, Math.trunc(toNumber(item.qty) ?? 1))
    const unitPrice =
      toNumber(item.priceArs) ??
      toNumber(item.price_ars) ??
      toNumber(item.unitPriceArs) ??
      toNumber(item.unit_price_ars) ??
      0

    const safeUnit = Math.max(0, Math.round(unitPrice))
    out.push({
      name,
      brand,
      category,
      qty,
      unitPriceArs: safeUnit,
      totalArs: Math.max(0, Math.round(safeUnit * qty)),
    })
  }

  return out
}

function linesFromOrder(order: Record<string, any>): InvoiceLine[] {
  const orderNumber = asciiText(order.order_number ?? order.id, 120) || "N/A"
  const createdAt = toDateTime(order.created_at)
  const issuedAt = toDateTime(new Date().toISOString())
  const currencyCode =
    asciiText(order.currency_code, 10).toUpperCase() || "ARS"

  const metadata = asRecord(order.metadata) ?? {}
  const customer =
    asRecord(metadata.customer) ?? asRecord(metadata.customer_data) ?? {}
  const shippingAddress =
    asRecord(metadata.shipping_address) ?? asRecord(metadata.shippingAddress) ?? {}

  const customerFirst = asciiText(customer.first_name ?? customer.firstName, 80)
  const customerLast = asciiText(customer.last_name ?? customer.lastName, 80)
  const customerName = `${customerFirst} ${customerLast}`.trim() || "Cliente"

  const customerEmail = asciiText(order.email, 180) || "-"
  const customerPhone = asciiText(order.phone, 60) || "-"
  const customerDocument =
    asciiText(customer.document_number ?? customer.documentNumber, 32) || "-"

  const shippingLine1 = asciiText(
    shippingAddress.line1 ?? shippingAddress.address1,
    200
  )
  const shippingLine2 = asciiText(
    shippingAddress.line2 ?? shippingAddress.address2,
    160
  )
  const shippingCity = asciiText(shippingAddress.city, 120)
  const shippingProvince = asciiText(
    shippingAddress.province ?? shippingAddress.state,
    120
  )
  const shippingPostal = asciiText(
    shippingAddress.postal_code ?? shippingAddress.postalCode ?? shippingAddress.zip,
    30
  )

  const shippingText = [shippingLine1, shippingLine2, shippingCity, shippingProvince, shippingPostal]
    .filter(Boolean)
    .join(", ") || "-"

  const paymentMethod = asciiText(order.payment_method, 80) || "-"
  const shippingMethod = asciiText(order.shipping_method, 80) || "-"
  const orderStatus = asciiText(order.status, 80) || "-"
  const paymentStatus = asciiText(order.payment_status, 80) || "-"
  const trackingCode = asciiText(order.tracking_code, 120) || "-"

  const items = readInvoiceItems(order)
  const computedSubtotal = items.reduce((sum, item) => sum + item.totalArs, 0)
  const subtotal = Math.max(
    0,
    Math.round(toNumber(metadata.subtotal_ars) ?? computedSubtotal)
  )
  const shippingArs = Math.max(
    0,
    Math.round(toNumber(metadata.shipping_ars) ?? 0)
  )
  const discountArs = Math.max(
    0,
    Math.round(toNumber(metadata.discount_ars) ?? 0)
  )
  const total = Math.max(
    0,
    Math.round(toNumber(order.total_ars) ?? subtotal + shippingArs - discountArs)
  )

  const lines: InvoiceLine[] = []
  lines.push({ text: "COMPROBANTE INTERNO DE PEDIDO", fontSize: 16 })
  lines.push({ text: "Documento generado por el backend de la tienda." })
  lines.push({ text: "" })

  lines.push({ text: `Numero de pedido: ${orderNumber}` })
  lines.push({ text: `Fecha de pedido: ${createdAt}` })
  lines.push({ text: `Fecha de emision: ${issuedAt}` })
  lines.push({ text: "" })

  lines.push({ text: "DATOS DEL CLIENTE", fontSize: 12 })
  lines.push({ text: `Nombre: ${customerName}` })
  lines.push({ text: `Email: ${customerEmail}` })
  lines.push({ text: `Telefono: ${customerPhone}` })
  lines.push({ text: `Documento: ${customerDocument}` })
  lines.push({ text: "" })

  lines.push({ text: "ENTREGA Y PAGO", fontSize: 12 })
  lines.push({ text: `Metodo de envio: ${shippingMethod}` })
  lines.push({ text: `Metodo de pago: ${paymentMethod}` })
  lines.push({ text: `Estado del pedido: ${orderStatus}` })
  lines.push({ text: `Estado del pago: ${paymentStatus}` })
  lines.push({ text: `Tracking: ${trackingCode}` })
  for (const wrapped of wrapText(`Direccion de entrega: ${shippingText}`)) {
    lines.push({ text: wrapped })
  }
  lines.push({ text: "" })

  lines.push({ text: "DETALLE DE ITEMS", fontSize: 12 })
  if (!items.length) {
    lines.push({ text: "Sin items registrados." })
  } else {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      const descriptor = `${index + 1}. ${item.name}${
        item.brand || item.category
          ? ` (${[item.brand, item.category].filter(Boolean).join(" - ")})`
          : ""
      }`
      for (const wrapped of wrapText(descriptor, 82)) {
        lines.push({ text: wrapped })
      }
      lines.push({
        text: `   ${item.qty} x ${toMoney(item.unitPriceArs, currencyCode)} = ${toMoney(item.totalArs, currencyCode)}`,
      })
    }
  }
  lines.push({ text: "" })

  lines.push({ text: "RESUMEN", fontSize: 12 })
  lines.push({ text: `Subtotal: ${toMoney(subtotal, currencyCode)}` })
  lines.push({ text: `Envio: ${toMoney(shippingArs, currencyCode)}` })
  lines.push({ text: `Descuento: -${toMoney(discountArs, currencyCode)}` })
  lines.push({ text: `TOTAL: ${toMoney(total, currencyCode)}`, fontSize: 13 })
  lines.push({ text: "" })
  lines.push({
    text: "Uso interno. Este comprobante no reemplaza documentacion fiscal oficial.",
  })

  return lines
}

function lineHeight(fontSize: number) {
  return fontSize >= 15 ? 22 : fontSize >= 13 ? 18 : 14
}

function paginateLines(lines: InvoiceLine[]) {
  const pages: InvoiceLine[][] = []
  let page: InvoiceLine[] = []
  let y = 806

  for (const line of lines) {
    const size = line.fontSize ?? 11
    const height = lineHeight(size)
    if (y - height < 44 && page.length) {
      pages.push(page)
      page = []
      y = 806
    }
    page.push(line)
    y -= height
  }

  if (page.length) pages.push(page)
  return pages.length ? pages : [[{ text: "Comprobante vacio." }]]
}

function buildPageContent(lines: InvoiceLine[]) {
  const commands: string[] = ["BT"]
  let y = 806

  for (const line of lines) {
    const size = line.fontSize ?? 11
    commands.push(`/F1 ${size} Tf`)
    commands.push(`1 0 0 1 40 ${y.toFixed(2)} Tm (${escapePdfText(asciiText(line.text, 500))}) Tj`)
    y -= lineHeight(size)
  }

  commands.push("ET")
  return commands.join("\n")
}

function buildPdfFromPageStreams(pageStreams: string[]) {
  const pageDefs: Array<{ pageId: number; contentId: number }> = []
  let nextId = 3

  for (let i = 0; i < pageStreams.length; i += 1) {
    const pageId = nextId
    const contentId = nextId + 1
    pageDefs.push({ pageId, contentId })
    nextId += 2
  }

  const fontId = nextId
  const maxId = fontId
  const objects = new Array<string>(maxId + 1)

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[2] = `<< /Type /Pages /Kids [${pageDefs
    .map((entry) => `${entry.pageId} 0 R`)
    .join(" ")}] /Count ${pageDefs.length} >>`

  for (let i = 0; i < pageDefs.length; i += 1) {
    const { pageId, contentId } = pageDefs[i]
    const stream = pageStreams[i]
    const length = Buffer.byteLength(stream, "binary")

    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${length} >>\nstream\n${stream}\nendstream`
  }

  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

  let output = "%PDF-1.4\n"
  const offsets = new Array<number>(maxId + 1).fill(0)

  for (let id = 1; id <= maxId; id += 1) {
    const body = objects[id]
    offsets[id] = Buffer.byteLength(output, "binary")
    output += `${id} 0 obj\n${body}\nendobj\n`
  }

  const xrefStart = Buffer.byteLength(output, "binary")
  output += `xref\n0 ${maxId + 1}\n`
  output += "0000000000 65535 f \n"

  for (let id = 1; id <= maxId; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
  }

  output += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(output, "binary")
}

function safeNameSegment(value: string, max = 80) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
}

export function buildOrderInvoicePdf(order: Record<string, any>) {
  const lines = linesFromOrder(order)
  const pages = paginateLines(lines).map((page) => buildPageContent(page))
  return buildPdfFromPageStreams(pages)
}

export function orderInvoiceFileName(order: Record<string, any>) {
  const number = safeNameSegment(
    asciiText(order.order_number ?? order.id, 120) || "pedido"
  )
  return `comprobante-${number || "pedido"}.pdf`
}
