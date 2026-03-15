import { NextRequest, NextResponse } from "next/server";

import {
  DEV_MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
  DEV_MAINTENANCE_COOKIE_NAME,
  DEV_MAINTENANCE_COOKIE_VALUE,
  DEV_MAINTENANCE_PASSWORD,
  isDevMaintenanceEnabled,
  normalizeMaintenanceRedirectPath,
} from "@/lib/dev-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildRedirect(request: NextRequest, targetPath: string) {
  return new URL(targetPath, request.url);
}

export async function POST(request: NextRequest) {
  if (!isDevMaintenanceEnabled()) {
    return NextResponse.redirect(buildRedirect(request, "/"));
  }

  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const nextPath = normalizeMaintenanceRedirectPath(String(formData.get("next") || "/"));

  if (password !== DEV_MAINTENANCE_PASSWORD) {
    const redirectUrl = buildRedirect(
      request,
      `/mantenimiento?error=1&next=${encodeURIComponent(nextPath)}`
    );
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.redirect(buildRedirect(request, nextPath));
  response.cookies.set({
    name: DEV_MAINTENANCE_COOKIE_NAME,
    value: DEV_MAINTENANCE_COOKIE_VALUE,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: DEV_MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
