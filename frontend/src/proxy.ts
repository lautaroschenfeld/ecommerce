import { NextResponse, type NextRequest } from "next/server";

import {
  DEV_MAINTENANCE_COOKIE_NAME,
  hasDevMaintenanceAccess,
  isDevMaintenanceEnabled,
} from "@/lib/dev-maintenance";

function isBypassPath(pathname: string) {
  if (
    pathname === "/mantenimiento" ||
    pathname.startsWith("/mantenimiento/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/store-media/") ||
    pathname.startsWith("/api/")
  ) {
    return true;
  }

  if (
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return true;
  }

  return /\.[a-z0-9]+$/i.test(pathname);
}

export function proxy(request: NextRequest) {
  if (!isDevMaintenanceEnabled()) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (isBypassPath(pathname)) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(DEV_MAINTENANCE_COOKIE_NAME)?.value;
  if (hasDevMaintenanceAccess(cookieValue)) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/mantenimiento";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: "/:path*",
};
