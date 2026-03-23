// ─── Facebook Page Photo API ──────────────────────────────
// POST /api/facebook
// Posts a photo with caption to a Facebook Page using the
// Graph API with a Page Access Token.

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
  const pageAccessToken = shared.facebook?.pageAccessToken;
  const pageId = shared.facebook?.pageId;

  if (!pageAccessToken || !pageId) {
    return NextResponse.json(
      { error: "Facebook not configured. Ask an admin to set Page Access Token and Page ID in Settings." },
      { status: 400 }
    );
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const formData = new FormData();
    formData.append("access_token", pageAccessToken);
    if (caption) {
      formData.append("message", caption);
    }
    formData.append(
      "source",
      new Blob([imageBuffer], { type: "image/png" }),
      "social.png"
    );

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      { method: "POST", body: formData }
    );

    const data = await res.json();
    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || "Facebook API error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      postId: data.post_id || data.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to post to Facebook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
