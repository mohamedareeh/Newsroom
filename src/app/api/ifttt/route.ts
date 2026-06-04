// ─── IFTTT Webhooks Bridge ────────────────────────────────
// POST /api/ifttt
// Uploads the generated PNG to Vercel Blob (for a public URL),
// then triggers the configured IFTTT Maker Webhook event. IFTTT
// fans the request out to whichever applets you've connected
// (Instagram, X, LinkedIn, Pinterest, etc.) — each applet uses
//   {{Value1}} = image URL
//   {{Value2}} = caption
//   {{Value3}} = source link

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSharedSettings } from "@/lib/sharedSettings";
import { put } from "@vercel/blob";

interface IftttRequest {
  imageBase64: string;
  caption?: string;
  link?: string;
  /** Override the configured default event name. */
  event?: string;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: IftttRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.imageBase64) {
    return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
  }

  const shared = await getSharedSettings();
  const webhookKey = shared.ifttt?.webhookKey?.trim();
  const event = (body.event || shared.ifttt?.defaultEvent || "news_share").trim();

  if (!webhookKey) {
    return NextResponse.json(
      { error: "IFTTT not configured. Add your Webhooks key in Settings → IFTTT." },
      { status: 400 }
    );
  }

  // Find a Blob token in the environment. Vercel Blob usually injects
  // BLOB_READ_WRITE_TOKEN by default, but if your Blob store has a custom
  // prefix (e.g. "media") it'll show up as MEDIA_BLOB_READ_WRITE_TOKEN —
  // so we scan all env vars matching the pattern.
  const blobTokenKey = Object.keys(process.env).find(
    (k) => /BLOB_READ_WRITE_TOKEN$/.test(k) && process.env[k]
  );
  const blobToken = blobTokenKey ? process.env[blobTokenKey] : undefined;

  if (!blobToken) {
    // Help the user diagnose which step they missed by surfacing the env
    // vars Vercel injects so they can see whether the Blob store is
    // connected to THIS project (vs. just created at the team level).
    const blobLikeKeys = Object.keys(process.env).filter((k) => /BLOB|VERCEL/i.test(k));
    return NextResponse.json(
      {
        error:
          "Vercel Blob token not found on this deployment. Three things to check (in order):\n" +
          "1) Vercel dashboard → your dhennews project → Storage → make sure the Blob store is CONNECTED to this project (not just created at the team level).\n" +
          "2) After connecting, REDEPLOY (env vars only take effect on a new deployment).\n" +
          "3) If your store uses a custom prefix, the env var won't be named BLOB_READ_WRITE_TOKEN — it'll be <PREFIX>_BLOB_READ_WRITE_TOKEN. This route now auto-detects any *BLOB_READ_WRITE_TOKEN env var.",
        diagnostic: {
          envKeysSeen: blobLikeKeys,
          hint: blobLikeKeys.length === 0
            ? "No Blob/Vercel env vars are visible — the store isn't connected to this project yet."
            : "Vercel env vars are visible, but none match *BLOB_READ_WRITE_TOKEN. The store may not have the read-write token enabled.",
        },
      },
      { status: 400 }
    );
  }

  try {
    // 1. Upload image to Vercel Blob → get a public URL
    const imageBuffer = Buffer.from(body.imageBase64, "base64");
    const filename = `social/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const blob = await put(filename, imageBuffer, {
      access: "public",
      contentType: "image/png",
      token: blobToken, // explicit token so custom-prefix stores work too
    });

    // 2. Trigger IFTTT Maker Webhook with the public URL + caption + link
    const iftttUrl = `https://maker.ifttt.com/trigger/${encodeURIComponent(event)}/with/key/${encodeURIComponent(webhookKey)}`;
    const iftttRes = await fetch(iftttUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        value1: blob.url,            // image URL
        value2: body.caption || "",  // caption
        value3: body.link || "",     // source link
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!iftttRes.ok) {
      const text = await iftttRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `IFTTT webhook failed (HTTP ${iftttRes.status}): ${text || "no response body"}`,
          imageUrl: blob.url,
        },
        { status: 502 }
      );
    }

    const iftttBody = await iftttRes.text();
    return NextResponse.json({
      success: true,
      event,
      imageUrl: blob.url,
      iftttResponse: iftttBody,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "IFTTT bridge failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
