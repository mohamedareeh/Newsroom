// ─── Shared Settings (Server-Side KV) ─────────────────────
// Admin-configured settings stored in Vercel KV, shared across all users.
// Includes Gemini config, WordPress creds, prompt template, and news sources.

import { kv } from "@vercel/kv";

const KV_SHARED_SETTINGS_KEY = "newsdesk_shared_settings";

export interface SharedNewsSource {
  id: string;
  label: string;
  rssUrl?: string;
  scrapeUrl: string;
}

export interface WordPressCreds {
  siteUrl: string;
  username: string;
  appPassword: string;
  /** Default WP category name (e.g. "World News"). Pipeline looks it up — or creates it — when publishing. */
  defaultCategoryName?: string;
}

export interface SharedSettings {
  geminiApiKey: string;
  geminiModel: string;
  composeModel: string;
  promptTemplate: string;
  wordpress: WordPressCreds; // Default site (legacy + Publisher card)
  // Multi-publish pipeline: separate sites per language
  wordpressDhivehi?: WordPressCreds; // dhen.mv
  wordpressEnglish?: WordPressCreds; // maldivesinsight.com
  telegram: {
    botToken: string;
    chatId: string;
  };
  facebook: {
    pageAccessToken: string;
    pageId: string;
  };
  // Source management (admin-only)
  customSources: SharedNewsSource[];
  removedDefaultSourceIds: string[];
  enabledSourceIds: string[]; // unified enabled list (both RSS + scrape)
}

export const DEFAULT_SHARED: SharedSettings = {
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  composeModel: "gemini-2.5-flash",
  promptTemplate: "",
  wordpress: { siteUrl: "", username: "", appPassword: "" },
  wordpressDhivehi: { siteUrl: "", username: "", appPassword: "", defaultCategoryName: "World News" },
  wordpressEnglish: { siteUrl: "", username: "", appPassword: "", defaultCategoryName: "World News" },
  telegram: { botToken: "", chatId: "" },
  facebook: { pageAccessToken: "", pageId: "" },
  customSources: [],
  removedDefaultSourceIds: [],
  enabledSourceIds: [], // empty = all enabled by default
};

// Resolve WP creds with fallback to the legacy single config.
export function resolveWP(
  shared: SharedSettings,
  language: "dv" | "en"
): WordPressCreds | null {
  const specific = language === "dv" ? shared.wordpressDhivehi : shared.wordpressEnglish;
  if (specific?.siteUrl && specific.username && specific.appPassword) return specific;
  if (shared.wordpress?.siteUrl && shared.wordpress.username && shared.wordpress.appPassword)
    return shared.wordpress;
  return null;
}

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
