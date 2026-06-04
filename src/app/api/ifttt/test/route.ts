// ─── IFTTT Connection Test ─────────────────────────────────
// POST /api/ifttt/test
// Triggers the configured IFTTT webhook with a small text payload
// (no image upload, no Blob dependency). Lets the admin confirm the
// Webhooks key + event name are saved correctly without having to
// build a full applet first.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSharedSettings } from "@/lib/sharedSettings";

export async function POST(_req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shared = await getSharedSettings();
  const webhookKey = shared.ifttt?.webhookKey?.trim();
  const event = (shared.ifttt?.defaultEvent || "news_share").trim();

  if (!webhookKey) {
    return NextResponse.json(
      { error: "No Webhooks key saved. Paste it in Settings → IFTTT Webhooks and wait a second." },
      { status: 400 }
    );
  }

  const url = `https://maker.ifttt.com/trigger/${encodeURIComponent(event)}/with/key/${encodeURIComponent(webhookKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        value1: "Test ping from Newsdesk",
        value2: "Settings → IFTTT test",
        value3: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const text = (await res.text().catch(() => "")) || "";

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: res.status,
          event,
          message:
            res.status === 401
              ? "401 — IFTTT rejected the key. Double-check there's no whitespace, and that it's the Webhooks key (not your account password)."
              : `IFTTT returned HTTP ${res.status}. Response: ${text.slice(0, 200) || "(empty)"}`,
        },
        { status: res.status }
      );
    }

    return NextResponse.json({
      ok: true,
      event,
      message: text || "IFTTT accepted the trigger. If you have an applet on this event, it should fire shortly.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Network error reaching IFTTT",
      },
      { status: 500 }
    );
  }
}
