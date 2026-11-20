import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  cookieBase,
  createSessionToken,
  sessionNeedsRefresh,
  verifySessionToken,
} from "@/lib/server/tokens";

/**
 * The front door. Everything behind it needs the family code; a valid
 * session cookie is checked here (signature and expiry, no database).
 * Data that is really sensitive is checked again on the server.
 */
const PUBLIC_PATHS = new Set(["/welkom", "/privacy", "/offline"]);
const PUBLIC_PREFIXES = ["/api/keepalive", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/welkom" && session) {
    const back = request.nextUrl.searchParams.get("terug");
    const target = back && back.startsWith("/") && !back.startsWith("//") ? back : "/";
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { fout: "Vul eerst de familiecode in." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const url = new URL("/welkom", request.url);
    if (pathname !== "/") url.searchParams.set("terug", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (sessionNeedsRefresh(session)) {
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(session.deviceId),
      cookieBase(SESSION_MAX_AGE_S),
    );
  }
  return response;
}

export const config = {
  matcher: [
    // Skip static assets, icons, the manifest and the service worker.
    "/((?!_next/static|_next/image|icons/|splash/|favicon.ico|apple-touch-icon.png|manifest.webmanifest|sw.js|robots.txt).*)",
  ],
};
