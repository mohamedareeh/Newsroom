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
  /** IFTTT Webhooks bridge — pipeline POSTs to the Maker webhook to fan out to applets. */
  ifttt?: {
    webhookKey: string;
    /** Event name configured in your IFTTT applets (e.g. "news_share"). */
    defaultEvent: string;
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
  ifttt: { webhookKey: "", defaultEvent: "news_share" },
  customSources: [],
  removedDefaultSourceIds: [],
  enabledSourceIds: [], // empty = all enabled by default
};

function isCompleteWP(c?: WordPressCreds | null): c is WordPressCreds {
  return !!(c && c.siteUrl && c.username && c.appPassword);
}

function hostOf(u: string): string {
  try {
    return new URL(u).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

// Resolve the WordPress target for a given language.
//
// IMPORTANT: the legacy single `shared.wordpress` config historically points
// at the Dhivehi site (dhen.mv). We must NEVER silently fall back English
// content onto it, or English drafts land on the Dhivehi site.
//
// Rules:
//  - "dv": specific Dhivehi config → else legacy single config → else null.
//  - "en": specific English config ONLY. No legacy fallback (prevents
//          English-on-dhen.mv). If unset, returns null and the pipeline
//          reports it instead of mis-publishing.
export function resolveWP(
  shared: SharedSettings,
  language: "dv" | "en"
): WordPressCreds | null {
  if (language === "en") {
    return isCompleteWP(shared.wordpressEnglish) ? shared.wordpressEnglish : null;
  }

  // Dhivehi
  if (isCompleteWP(shared.wordpressDhivehi)) return shared.wordpressDhivehi;
  const legacy = shared.wordpress;
  if (isCompleteWP(legacy)) {
    // Guard: if the legacy site is the same host as the explicitly-configured
    // English site, don't reuse it for Dhivehi either.
    if (
      isCompleteWP(shared.wordpressEnglish) &&
      hostOf(legacy.siteUrl) === hostOf(shared.wordpressEnglish.siteUrl)
    ) {
      return null;
    }
    return legacy;
  }
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
