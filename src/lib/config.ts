// ─── News Source Registry & Settings Types ─────────────────
// Single source of truth for all Dhivehi news sources and
// application settings types.

export interface NewsSource {
  id: string;
  label: string;
  rssUrl?: string;
  scrapeUrl: string;
}

// ─── Dhivehi News Sources (defaults) ───────────────────────
export const DHIVEHI_NEWS_SOURCES: NewsSource[] = [
  { id: "edition-mv", label: "Edition.mv", rssUrl: "https://edition.mv/feed", scrapeUrl: "https://edition.mv" },
  { id: "avas-mv", label: "Avas.mv", rssUrl: "https://avas.mv/feed", scrapeUrl: "https://avas.mv" },
  { id: "sun-mv-en", label: "Sun.mv (English)", rssUrl: "https://en.sun.mv/feed", scrapeUrl: "https://en.sun.mv" },
  { id: "sun-mv-dv", label: "Sun.mv (Dhivehi)", rssUrl: "https://sun.mv/feed", scrapeUrl: "https://sun.mv" },
  { id: "mihaaru", label: "Mihaaru", rssUrl: "https://mihaaru.com/feed", scrapeUrl: "https://mihaaru.com" },
  { id: "raajje-mv", label: "Raajje.mv", rssUrl: "https://raajje.mv/feed", scrapeUrl: "https://raajje.mv" },
  { id: "psmnews", label: "PSM News", rssUrl: "https://psmnews.mv/feed", scrapeUrl: "https://psmnews.mv" },
  { id: "dhauru", label: "Dhauru", rssUrl: "https://dhauru.com/feed", scrapeUrl: "https://dhauru.com" },
  { id: "vaguthu", label: "Vaguthu", rssUrl: "https://vaguthu.mv/feed", scrapeUrl: "https://vaguthu.mv" },
  { id: "oneonline", label: "OneOnline", rssUrl: "https://oneonline.mv/feed", scrapeUrl: "https://oneonline.mv" },
  { id: "thiladhun", label: "Thiladhun", rssUrl: "https://thiladhun.com/feed", scrapeUrl: "https://thiladhun.com" },
  { id: "voice-mv", label: "Voice.mv", scrapeUrl: "https://voice.mv" },
  // ── Additional Dhivehi outlets ──
  { id: "sangu-mv", label: "Sangu", rssUrl: "https://sangu.mv/feed", scrapeUrl: "https://sangu.mv" },
  { id: "atoll-times", label: "Atoll Times", rssUrl: "https://atolltimes.mv/feed", scrapeUrl: "https://atolltimes.mv" },
  { id: "adhadhu", label: "Adhadhu", scrapeUrl: "https://adhadhu.com" },
  { id: "the-press", label: "The Press", scrapeUrl: "https://thepress.mv" },
  { id: "dhuvas", label: "Dhuvas", scrapeUrl: "https://dhuvas.mv" },
  { id: "times-of-addu", label: "Times of Addu", rssUrl: "https://timesofaddu.com/feed", scrapeUrl: "https://timesofaddu.com" },
  { id: "corporate-maldives", label: "Corporate Maldives", rssUrl: "https://corporatemaldives.com/feed", scrapeUrl: "https://corporatemaldives.com" },
  { id: "maldives-independent", label: "Maldives Independent", scrapeUrl: "https://maldivesindependent.com" },
];

// ─── Settings Types ────────────────────────────────────────
export type ParaphrasingLevel = "light" | "heavy";
export type Tone = "formal" | "casual" | "sensational";
export type Length = "match" | "summary";
export type AutoScrapeInterval = "disabled" | "5" | "15" | "30" | "60";

export interface WordPressSettings {
  siteUrl: string;
  username: string;
  appPassword: string;
}

export const GEMINI_MODELS = [
  { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
  { label: "Gemini 2.5 Flash Lite", value: "gemini-2.5-flash-lite" },
  { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
  { label: "Gemini 3 Flash Preview", value: "gemini-3-flash-preview" },
  { label: "Gemini 3.1 Pro Preview", value: "gemini-3.1-pro-preview" },
  { label: "Gemini 3.1 Flash Lite Preview", value: "gemini-3.1-flash-lite-preview" },
];

export interface AppSettings {
  paraphrasingLevel: ParaphrasingLevel;
  tone: Tone;
  length: Length;
  defaultHeadlineCount: number;
  autoExcludeProcessed: boolean;
  autoScrapeInterval: AutoScrapeInterval;
}

// Shared settings are stored server-side in Vercel KV (admin-only)
// geminiApiKey, geminiModel, composeModel, promptTemplate, wordpress,
// customSources, removedDefaultSourceIds, enabledSourceIds

// ─── Default AI Prompt Template ─────────────────────────────
export const DEFAULT_PROMPT_TEMPLATE = `You are an expert Dhivehi journalist and translator. Your task is to rewrite the following news article into Dhivehi (the language of the Maldives, written in Thaana script).

RULES:
- {{paraphrasingInstructions}}
- {{toneInstructions}}
- {{lengthInstructions}}
- Rewrite the headline in a different way while keeping the same meaning. The headline must be in Dhivehi (Thaana script).
- Start the article with a one-sentence lead that expands on the headline, covering who, what, when, where, and why.
- Write the rest of the article in inverted pyramid style (most important information first, least important last).
- All article output (TITLE and CONTENT) MUST be in Dhivehi (Thaana script). Do NOT include any English text in TITLE or CONTENT.
- Transliterate the paraphrased Dhivehi headline into Latin alphabet (write the Thaana in English letters) for article_LATIN. Do NOT add a period/fullstop at the end.
- Write a short punchy social media caption in Dhivehi for SOCIAL_TEXT. Make it headline-style, not a full sentence — do NOT end with އެވެ or similar sentence endings. Use a hook or call-to-action style.
- Generate exactly 3 relevant tags/keywords in Dhivehi for TAGS (comma-separated, in Thaana script).
- Maintain factual accuracy — do not fabricate information.

OUTPUT FORMAT (you MUST use exactly these labels):
TITLE: paraphrased Dhivehi headline
CONTENT: paraphrased Dhivehi article (lead sentence + inverted pyramid)
article_LATIN: paraphrased headline in English letters
SOCIAL_TEXT: Dhivehi social media text
TAGS: tag1, tag2, tag3

ORIGINAL ARTICLE TITLE: {{title}}

ORIGINAL ARTICLE TEXT:
{{articleText}}

OUTPUT:`;

// ─── Defaults ──────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  paraphrasingLevel: "heavy",
  tone: "formal",
  length: "match",
  defaultHeadlineCount: 10,
  autoExcludeProcessed: true,
  autoScrapeInterval: "disabled",
};
