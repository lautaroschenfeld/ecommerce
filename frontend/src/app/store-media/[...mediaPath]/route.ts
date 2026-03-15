import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_ROOTS = new Set(["static", "uploads"]);
const PASS_THROUGH_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-length",
  "content-type",
  "etag",
  "last-modified",
];

const BACKEND_URL_CANDIDATES = [
  process.env.BACKEND_INTERNAL_URL?.trim(),
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim(),
  "http://localhost:9000",
]
  .filter(Boolean)
  .map((value) => value!.replace(/\/+$/, ""));

function decodeMediaPath(input: string[]) {
  if (!Array.isArray(input) || !input.length) return "";

  const decoded: string[] = [];
  for (const segment of input) {
    if (typeof segment !== "string" || !segment.trim()) return "";
    let value = segment;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return "";
    }
    value = value.replace(/\\/g, "/").trim();
    if (!value || value === "." || value === "..") return "";
    if (value.includes("/") || value.includes("\\")) return "";
    decoded.push(value);
  }

  if (!decoded.length) return "";
  if (!MEDIA_ROOTS.has(decoded[0].toLowerCase())) return "";

  return `/${decoded.join("/")}`;
}

function buildBackendMediaUrl(baseUrl: string, mediaPath: string, search: string) {
  return `${baseUrl}${mediaPath}${search}`;
}

function buildProxyResponse(response: Response, includeBody: boolean) {
  const headers = new Headers();
  for (const header of PASS_THROUGH_HEADERS) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }
  headers.set("x-store-media-proxy", "1");

  return new NextResponse(includeBody ? response.body : null, {
    status: response.status,
    headers,
  });
}

async function proxyMedia(
  request: NextRequest,
  mediaPathInput: string[] | undefined,
  method: "GET" | "HEAD"
) {
  const mediaPath = decodeMediaPath(mediaPathInput ?? []);
  if (!mediaPath) {
    return NextResponse.json(
      { message: "Ruta de media invalida." },
      { status: 400 }
    );
  }

  const search = request.nextUrl.search || "";
  const accept = request.headers.get("accept") || "image/*,*/*;q=0.8";

  let sawNotFound = false;
  let lastError: unknown = null;

  for (const baseUrl of BACKEND_URL_CANDIDATES) {
    const targetUrl = buildBackendMediaUrl(baseUrl, mediaPath, search);
    try {
      const upstream = await fetch(targetUrl, {
        method,
        cache: "no-store",
        headers: { accept },
      });

      if (upstream.status === 404) {
        sawNotFound = true;
        continue;
      }

      if (!upstream.ok) {
        return NextResponse.json(
          { message: "No se pudo cargar el recurso." },
          { status: upstream.status }
        );
      }

      return buildProxyResponse(upstream, method === "GET");
    } catch (error) {
      lastError = error;
    }
  }

  if (sawNotFound) {
    return NextResponse.json(
      { message: "Recurso no encontrado." },
      { status: 404 }
    );
  }

  if (lastError) {
    return NextResponse.json(
      { message: "El backend de media no esta disponible." },
      { status: 502 }
    );
  }

  return NextResponse.json({ message: "No disponible." }, { status: 503 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mediaPath?: string[] }> | { mediaPath?: string[] } }
) {
  const resolved = await context.params;
  return proxyMedia(request, resolved.mediaPath, "GET");
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ mediaPath?: string[] }> | { mediaPath?: string[] } }
) {
  const resolved = await context.params;
  return proxyMedia(request, resolved.mediaPath, "HEAD");
}
