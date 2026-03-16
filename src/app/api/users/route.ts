// ─── User Management API ──────────────────────────────────
// GET  /api/users           — list usernames
// POST /api/users           — add or remove a user

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, getUsers, addUser, removeUser } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const users = await getUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "add") {
    if (!body.username || !body.password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }
    const result = await addUser(body.username, body.password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  if (body.action === "remove") {
    if (!body.username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }
    const result = await removeUser(body.username);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
