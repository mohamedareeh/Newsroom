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
  return NextResponse.json({
    ...settings,
    geminiApiKey: admin ? settings.geminiApiKey : (settings.geminiApiKey ? "••••••••" : ""),
    wordpress: admin ? settings.wordpress : {
      siteUrl: settings.wordpress.siteUrl,
      username: settings.wordpress.username ? "••••" : "",
      appPassword: settings.wordpress.appPassword ? "••••" : "",
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
    const updated: SharedSettings = {
      geminiApiKey: body.geminiApiKey !== undefined ? body.geminiApiKey : current.geminiApiKey,
      geminiModel: body.geminiModel !== undefined ? body.geminiModel : current.geminiModel,
      composeModel: body.composeModel !== undefined ? body.composeModel : current.composeModel,
      promptTemplate: body.promptTemplate !== undefined ? body.promptTemplate : current.promptTemplate,
      wordpress: body.wordpress !== undefined ? { ...current.wordpress, ...body.wordpress } : current.wordpress,
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
