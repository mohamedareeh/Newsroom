// ─── Telegram Sender API ──────────────────────────────────
// POST /api/telegram
// Sends a generated image + caption to a Telegram channel
// using the Bot Token and Chat ID from shared settings.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSharedSettings } from "@/lib/sharedSettings";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageBase64, caption } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
  }

  const shared = await getSharedSettings();
  const botToken = shared.telegram?.botToken;
  const chatId = shared.telegram?.chatId;

  if (!botToken || !chatId) {
    return NextResponse.json(
      { error: "Telegram not configured. Ask an admin to set Bot Token and Chat ID in Settings." },
      { status: 400 }
    );
  }

  try {
    // Convert base64 to Buffer
    const imageBuffer = Buffer.from(imageBase64, "base64");

    // Build multipart form data for Telegram API
    const formData = new FormData();
    formData.append("chat_id", chatId);
    if (caption) {
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
    }
    formData.append(
      "photo",
      new Blob([imageBuffer], { type: "image/png" }),
      "social.png"
    );

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      { method: "POST", body: formData }
    );

    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json(
        { error: data.description || "Telegram API error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data.result?.message_id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send to Telegram";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
