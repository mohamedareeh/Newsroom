// ─── Shared Settings (Server-Side KV) ─────────────────────
// Admin-configured settings stored in Vercel KV, shared across all users.
// Includes Gemini API key, models, WordPress creds, prompt template.

import { kv } from "@vercel/kv";

const KV_SHARED_SETTINGS_KEY = "newsdesk_shared_settings";

export interface SharedSettings {
  geminiApiKey: string;
  geminiModel: string;
  composeModel: string;
  promptTemplate: string;
  wordpress: {
    siteUrl: string;
    username: string;
    appPassword: string;
  };
}

export const DEFAULT_SHARED: SharedSettings = {
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  composeModel: "gemini-2.5-flash",
  promptTemplate: "",
  wordpress: { siteUrl: "", username: "", appPassword: "" },
};

export async function getSharedSettings(): Promise<SharedSettings> {
  try {
    const stored = await kv.get<SharedSettings>(KV_SHARED_SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SHARED, ...stored };
  } catch {
    // KV unavailable
  }
  return DEFAULT_SHARED;
}

export async function saveSharedSettings(settings: SharedSettings): Promise<void> {
  await kv.set(KV_SHARED_SETTINGS_KEY, settings);
}
