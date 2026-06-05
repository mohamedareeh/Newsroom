// ─── Shared Settings API ──────────────────────────────────
// GET  /api/shared-settings — read shared settings (all users)
// POST /api/shared-settings — update shared settings (admin only)

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isAdmin } from "@/lib/auth";
import { getSharedSettings, saveSharedSettings, SharedSettings } from "@/lib/sharedSettings";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSharedSettings();

  // Non-admins get settings but with sensitive values masked
  const admin = await isAdmin();
  const maskWP = (w?: { siteUrl?: string; username?: string; appPassword?: string; defaultCategoryName?: string }) => ({
    siteUrl: w?.siteUrl || "",
    username: w?.username ? "••••" : "",
    appPassword: w?.appPassword ? "••••" : "",
    defaultCategoryName: w?.defaultCategoryName || "",
  });
  return NextResponse.json({
    ...settings,
    geminiApiKey: admin ? settings.geminiApiKey : (settings.geminiApiKey ? "••••••••" : ""),
    wordpress: admin ? settings.wordpress : maskWP(settings.wordpress),
    wordpressDhivehi: admin
      ? (settings.wordpressDhivehi || { siteUrl: "", username: "", appPassword: "", defaultCategoryName: "" })
      : maskWP(settings.wordpressDhivehi),
    wordpressEnglish: admin
      ? (settings.wordpressEnglish || { siteUrl: "", username: "", appPassword: "", defaultCategoryName: "" })
      : maskWP(settings.wordpressEnglish),
    telegram: admin ? (settings.telegram || { botToken: "", chatId: "" }) : {
      botToken: settings.telegram?.botToken ? "••••••••" : "",
      chatId: settings.telegram?.chatId || "",
    },
    facebook: admin ? (settings.facebook || { pageAccessToken: "", pageId: "" }) : {
      pageAccessToken: settings.facebook?.pageAccessToken ? "••••••••" : "",
      pageId: settings.facebook?.pageId || "",
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: Partial<SharedSettings>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const current = await getSharedSettings();
    const emptyWP = { siteUrl: "", username: "", appPassword: "" };
    const updated: SharedSettings = {
      geminiApiKey: body.geminiApiKey !== undefined ? body.geminiApiKey : current.geminiApiKey,
      geminiModel: body.geminiModel !== undefined ? body.geminiModel : current.geminiModel,
      composeModel: body.composeModel !== undefined ? body.composeModel : current.composeModel,
      promptTemplate: body.promptTemplate !== undefined ? body.promptTemplate : current.promptTemplate,
      wordpress: body.wordpress !== undefined ? { ...current.wordpress, ...body.wordpress } : current.wordpress,
      wordpressDhivehi:
        body.wordpressDhivehi !== undefined
          ? { ...(current.wordpressDhivehi || emptyWP), ...body.wordpressDhivehi }
          : current.wordpressDhivehi,
      wordpressEnglish:
        body.wordpressEnglish !== undefined
          ? { ...(current.wordpressEnglish || emptyWP), ...body.wordpressEnglish }
          : current.wordpressEnglish,
      telegram: body.telegram !== undefined ? { ...(current.telegram || { botToken: "", chatId: "" }), ...body.telegram } : (current.telegram || { botToken: "", chatId: "" }),
      facebook: body.facebook !== undefined ? { ...(current.facebook || { pageAccessToken: "", pageId: "" }), ...body.facebook } : (current.facebook || { pageAccessToken: "", pageId: "" }),
      ifttt:
        body.ifttt !== undefined
          ? { ...(current.ifttt || { webhookKey: "", defaultEvent: "news_share" }), ...body.ifttt }
          : (current.ifttt || { webhookKey: "", defaultEvent: "news_share" }),
      blobReadWriteToken:
        body.blobReadWriteToken !== undefined ? body.blobReadWriteToken : current.blobReadWriteToken,
      customSources: body.customSources !== undefined ? body.customSources : current.customSources,
      removedDefaultSourceIds: body.removedDefaultSourceIds !== undefined ? body.removedDefaultSourceIds : current.removedDefaultSourceIds,
      enabledSourceIds: body.enabledSourceIds !== undefined ? body.enabledSourceIds : current.enabledSourceIds,
    };
    await saveSharedSettings(updated);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save settings (KV unavailable)" }, { status: 500 });
  }
}
