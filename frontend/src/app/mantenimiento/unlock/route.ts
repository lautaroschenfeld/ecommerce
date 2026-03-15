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

function buildRedirect(request: NextRequest, targetPath: string) {
  return new URL(targetPath, request.url);
}

export async function POST(request: NextRequest) {
  if (!(await isMaintenanceEnabled())) {
    return NextResponse.redirect(buildRedirect(request, "/"));
  }

  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const nextPath = normalizeMaintenanceRedirectPath(String(formData.get("next") || "/"));

  const validPassword = await verifyMaintenancePassword(password);
  if (!validPassword) {
    const redirectUrl = buildRedirect(
      request,
      `/mantenimiento?error=1&next=${encodeURIComponent(nextPath)}`
    );
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.redirect(buildRedirect(request, nextPath));
  response.cookies.set({
    name: MAINTENANCE_COOKIE_NAME,
    value: MAINTENANCE_COOKIE_VALUE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAINTENANCE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
