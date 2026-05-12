// ─── Publication Log API ──────────────────────────────────
// GET /api/publication-log?date=YYYY-MM-DD       → single day
// GET /api/publication-log?start=...&end=...     → date range (inclusive)

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getPublicationsForDate,
  getPublicationsInRange,
  todayUTC,
} from "@/lib/publicationLog";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (start && end) {
    const days = await getPublicationsInRange(start, end);
    return NextResponse.json({ days });
  }
  const date = url.searchParams.get("date") || todayUTC();
  const records = await getPublicationsForDate(date);
  return NextResponse.json({ date, records });
}

export const dynamic = "force-dynamic";
