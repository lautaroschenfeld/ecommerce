import { NextRequest, NextResponse } from "next/server";

import {
  MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
  MAINTENANCE_COOKIE_NAME,
  MAINTENANCE_COOKIE_VALUE,
  isMaintenanceEnabled,
  normalizeMaintenanceRedirectPath,
  verifyMaintenancePassword,
} from "@/lib/dev-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createRelativeRedirectResponse(targetPath: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: targetPath,
    },
  });
}

function isHttpsRequest(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto") || "";
  const firstForwardedProto = forwardedProto.split(",")[0]?.trim().toLowerCase();
  if (firstForwardedProto === "https") return true;
  return request.nextUrl.protocol === "https:";
}

export async function POST(request: NextRequest) {
  if (!(await isMaintenanceEnabled())) {
    return createRelativeRedirectResponse("/");
  }

  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const nextPath = normalizeMaintenanceRedirectPath(String(formData.get("next") || "/"));

  const validPassword = await verifyMaintenancePassword(password);
  if (!validPassword) {
    return createRelativeRedirectResponse(
      `/mantenimiento?error=1&next=${encodeURIComponent(nextPath)}`
    );
  }

  const response = createRelativeRedirectResponse(nextPath);
  response.cookies.set({
    name: MAINTENANCE_COOKIE_NAME,
    value: MAINTENANCE_COOKIE_VALUE,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
