import { fetchBlobWithAuthRetry } from "@/lib/store-client";

function sanitizeFileName(value: string, max = 180) {
  const cleaned = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return cleaned || "comprobante-pedido";
}

function ensurePdfExtension(fileName: string) {
  if (/\.pdf$/i.test(fileName)) return fileName;
  return `${fileName}.pdf`;
}

function decodeHeaderFileName(value: string) {
  const trimmed = value.trim().replace(/^"(.*)"$/, "$1");
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function readFileNameFromDisposition(headerValue: string | null) {
  if (!headerValue) return "";

  const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    return decodeHeaderFileName(utf8Match[1]);
  }

  const asciiMatch = /filename\s*=\s*("?[^";]+"?)/i.exec(headerValue);
  if (asciiMatch?.[1]) {
    return decodeHeaderFileName(asciiMatch[1]);
  }

  return "";
}

export async function downloadOrderInvoicePdf(
  orderId: string,
  orderNumber?: string
) {
  const safeOrderId = String(orderId || "").trim();
  if (!safeOrderId) {
    throw new Error("No se pudo identificar la orden.");
  }

  const { blob, response } = await fetchBlobWithAuthRetry(
    `/store/catalog/account/orders/${encodeURIComponent(safeOrderId)}/invoice`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const headerFileName = readFileNameFromDisposition(
    response.headers.get("content-disposition")
  );
  const fallbackFileName = sanitizeFileName(
    `comprobante-${orderNumber || safeOrderId}`
  );
  const finalFileName = ensurePdfExtension(
    sanitizeFileName(headerFileName || fallbackFileName)
  );

  const href = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = finalFileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    globalThis.setTimeout(() => URL.revokeObjectURL(href), 1500);
  }

  return finalFileName;
}
