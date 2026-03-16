// ─── Auth Middleware ────────────────────────────────────────
// Protects all routes except /login, API login, and static assets.
// Unauthenticated users are redirected to the login page.

import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("newsdesk_session");
  const isAuthenticated = session?.value === "authenticated";

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except login, API endpoints, and static assets
    "/((?!login|api|_next/static|_next/image|favicon.ico).*)",
  ],
};
