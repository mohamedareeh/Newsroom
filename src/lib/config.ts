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
  { label: "Gemini 2.5 Flash Preview", value: "gemini-2.5-flash-preview-05-20" },
  { label: "Gemini 2.5 Pro Preview", value: "gemini-2.5-pro-preview-05-06" },
  { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
  { label: "Gemini 2.0 Flash Lite", value: "gemini-2.0-flash-lite" },
  { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
  { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
];

export interface AppSettings {
  enabledRssFeeds: string[];
  enabledScrapeSources: string[];
  paraphrasingLevel: ParaphrasingLevel;
  tone: Tone;
  length: Length;
  defaultHeadlineCount: number;
  autoExcludeProcessed: boolean;
  autoScrapeInterval: AutoScrapeInterval;
  customSources: NewsSource[];
  removedDefaultSourceIds: string[];
  geminiApiKey: string;
  geminiModel: string;
  promptTemplate: string;
  wordpress: WordPressSettings;
}

// ─── Default AI Prompt Template ─────────────────────────────
export const DEFAULT_PROMPT_TEMPLATE = `You are an expert Dhivehi journalist and translator. Your task is to rewrite the following English news article completely into Dhivehi (the language of the Maldives, written in Thaana script).

RULES:
- {{paraphrasingInstructions}}
- {{toneInstructions}}
- {{lengthInstructions}}
- The entire output MUST be in Dhivehi (Thaana script). Do NOT include any English text in the output.
- Include a compelling Dhivehi headline at the top on its own line.
- Maintain factual accuracy — do not fabricate information.
- Format the output cleanly with proper paragraphs.

ORIGINAL ARTICLE TITLE: {{title}}

ORIGINAL ARTICLE TEXT:
{{articleText}}

OUTPUT (in Dhivehi only):`;

// ─── Helper: Get effective sources ─────────────────────────
// Merges default sources (minus removed) with custom sources.
export function getEffectiveSources(settings: AppSettings): NewsSource[] {
  const defaults = DHIVEHI_NEWS_SOURCES.filter(
    (s) => !settings.removedDefaultSourceIds.includes(s.id)
  );
  return [...defaults, ...(settings.customSources || [])];
}

// ─── Defaults ──────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  enabledRssFeeds: DHIVEHI_NEWS_SOURCES.filter((s) => s.rssUrl).map((s) => s.id),
  enabledScrapeSources: DHIVEHI_NEWS_SOURCES.map((s) => s.id),
  paraphrasingLevel: "heavy",
  tone: "formal",
  length: "match",
  defaultHeadlineCount: 10,
  autoExcludeProcessed: true,
  autoScrapeInterval: "disabled",
  customSources: [],
  removedDefaultSourceIds: [],
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash-preview-05-20",
  promptTemplate: "",
  wordpress: { siteUrl: "", username: "", appPassword: "" },
};
