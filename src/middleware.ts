// ─── Auth Middleware ────────────────────────────────────────
// Protects all routes except /login, API login, and static assets.
// Unauthenticated users are redirected to the login page.

import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("newsdesk_session");
  const isAuthenticated = !!session?.value && session.value.length > 0;

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except login, API endpoints, static assets, and PWA files
    "/((?!login|api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|fonts/|postwater.png).*)",
  ],
};
