"use client";

// ─── Creative Network News Desk — Main Dashboard ──────────
// Liquid-glass dashboard. Auto-scrapes sources, lets the user
// search/bookmark headlines, kick off AI processing, paste a
// manual link, or open the blank manual-write editor.

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Rss,
  Link2,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
  Search,
  Bookmark,
  BookmarkCheck,
  X,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";
import { useSettings } from "@/lib/useSettings";
import { useBookmarks } from "@/lib/useBookmarks";
import { DHIVEHI_NEWS_SOURCES, NewsSource } from "@/lib/config";

// ─── Types ─────────────────────────────────────────────────
interface Headline {
  title: string;
  link: string;
  pubDate?: string;
  alreadyProcessed?: boolean;
  sourceLabel?: string;
}

type InputTab = "sources" | "manual";

// ─── Main Dashboard Component ──────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const { settings, loaded } = useSettings();
  const { bookmarks, has: isBookmarked, toggle: toggleBookmark, remove: removeBookmark } = useBookmarks();

  // ── Shared sources from server ──
  const [enabledSources, setEnabledSources] = useState<NewsSource[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/shared-settings")
      .then((r) => r.json())
      .then((shared) => {
        const removedIds: string[] = shared.removedDefaultSourceIds || [];
        const customSources: NewsSource[] = shared.customSources || [];
        const enabledIds: string[] = shared.enabledSourceIds || [];

        const defaults = DHIVEHI_NEWS_SOURCES.filter((s) => !removedIds.includes(s.id));
        const all = [...defaults, ...customSources];

        let enabled = all;
        if (enabledIds.length > 0) {
          if (enabledIds.includes("__none__")) {
            enabled = [];
          } else {
            enabled = all.filter((s) => enabledIds.includes(s.id));
          }
        }
        setEnabledSources(enabled);
        setSourcesLoaded(true);
      })
      .catch(() => {
        setEnabledSources(DHIVEHI_NEWS_SOURCES);
        setSourcesLoaded(true);
      });
  }, []);

  // ── State ──
  const [activeTab, setActiveTab] = useState<InputTab>("sources");
  const [selectedSource, setSelectedSource] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(false);
  const [headlinesError, setHeadlinesError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "fresh" | "saved">("all");

  const [autoScraping, setAutoScraping] = useState(false);
  const [lastAutoScrape, setLastAutoScrape] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [processing, setProcessing] = useState(false);
  const [processingUrl, setProcessingUrl] = useState("");
  const [processError, setProcessError] = useState("");

  // ── Helper: dedupe headlines by URL ──
  const mergeHeadlines = useCallback(
    (existing: Headline[], incoming: Headline[]) => {
      const seen = new Set(existing.map((h) => h.link));
      const newOnes = incoming.filter((h) => !seen.has(h.link));
      const merged = [...existing, ...newOnes];
      if (settings.autoExcludeProcessed) {
        merged.sort((a, b) => {
          if (a.alreadyProcessed && !b.alreadyProcessed) return 1;
          if (!a.alreadyProcessed && b.alreadyProcessed) return -1;
          return 0;
        });
      }
      return merged;
    },
    [settings.autoExcludeProcessed]
  );

  // ── Fetch all enabled sources (RSS + scrape) ──
  const autoScrapeAll = useCallback(async () => {
    if (autoScraping) return;
    setAutoScraping(true);

    const fetches: Promise<Headline[]>[] = [];
    for (const source of enabledSources) {
      if (source.rssUrl) {
        fetches.push(
          fetch(`/api/feeds?url=${encodeURIComponent(source.rssUrl)}&count=${settings.defaultHeadlineCount}`)
            .then((r) => r.json())
            .then((data) =>
              (data.headlines || []).map((h: Headline) => ({ ...h, sourceLabel: source.label }))
            )
            .catch(() => [] as Headline[])
        );
      } else {
        fetches.push(
          fetch(`/api/scrape?url=${encodeURIComponent(source.scrapeUrl)}`)
            .then((r) => r.json())
            .then((data) =>
              (data.headlines || []).map((h: Headline) => ({ ...h, sourceLabel: source.label }))
            )
            .catch(() => [] as Headline[])
        );
      }
    }

    const results = await Promise.allSettled(fetches);
    const allHeadlines: Headline[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") allHeadlines.push(...r.value);
    }

    setHeadlines((prev) => mergeHeadlines(prev, allHeadlines));
    setLastAutoScrape(new Date());
    setAutoScraping(false);
  }, [enabledSources, settings.defaultHeadlineCount, mergeHeadlines, autoScraping]);

  // ── Auto-scrape interval ──
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (settings.autoScrapeInterval === "disabled" || !loaded) return;
    const ms = parseInt(settings.autoScrapeInterval) * 60 * 1000;
    autoScrapeAll();
    intervalRef.current = setInterval(() => autoScrapeAll(), ms);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoScrapeInterval, loaded]);

  // ── Fetch from a single source ──
  const fetchSource = useCallback(async () => {
    const sourceId = selectedSource || enabledSources[0]?.id;
    const source = enabledSources.find((s) => s.id === sourceId);
    if (!source) return;
    setHeadlinesLoading(true);
    setHeadlinesError("");
    try {
      let data;
      if (source.rssUrl) {
        const res = await fetch(`/api/feeds?url=${encodeURIComponent(source.rssUrl)}&count=${settings.defaultHeadlineCount}`);
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch");
      } else {
        const res = await fetch(`/api/scrape?url=${encodeURIComponent(source.scrapeUrl)}`);
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to scrape");
      }
      const incoming = (data.headlines || []).map((h: Headline) => ({
        ...h,
        sourceLabel: source.label,
      }));
      setHeadlines((prev) => mergeHeadlines(prev, incoming));
    } catch (err: unknown) {
      setHeadlinesError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setHeadlinesLoading(false);
    }
  }, [selectedSource, enabledSources, settings.defaultHeadlineCount, mergeHeadlines]);

  // ── Process an article through the AI Spin Engine ──
  const processArticle = useCallback(
    async (url: string) => {
      setProcessing(true);
      setProcessingUrl(url);
      setProcessError("");
      sessionStorage.setItem("articleRequest", JSON.stringify({
        endpoint: "/api/process",
        body: {
          url,
          paraphrasingLevel: settings.paraphrasingLevel,
          tone: settings.tone,
          length: settings.length,
        },
      }));
      sessionStorage.removeItem("articleResult");
      router.push("/article");
      setProcessing(false);
      setProcessingUrl("");
    },
    [settings.paraphrasingLevel, settings.tone, settings.length, router]
  );

  // ── Loading state ──
  if (!loaded || !sourcesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // ── Compute visible headlines: filter + search ──
  const baseHeadlines = settings.autoExcludeProcessed
    ? headlines.filter((h) => !h.alreadyProcessed)
    : headlines;

  const savedSet = new Set(bookmarks.map((b) => b.link));

  let viewHeadlines: Headline[] = baseHeadlines;
  if (filter === "fresh") viewHeadlines = baseHeadlines.filter((h) => !h.alreadyProcessed);
  if (filter === "saved")
    viewHeadlines = bookmarks.map((b) => ({
      title: b.title,
      link: b.link,
      sourceLabel: b.sourceLabel,
      pubDate: b.pubDate,
      alreadyProcessed: false,
    }));

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    viewHeadlines = viewHeadlines.filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        (h.sourceLabel || "").toLowerCase().includes(q)
    );
  }

  const tabs: Array<{ id: InputTab; label: string; icon: React.ReactNode }> = [
    { id: "sources", label: "Sources", icon: <Rss className="w-4 h-4" /> },
    { id: "manual", label: "Paste Link", icon: <Link2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ── Page Header ── */}
        <div className="mb-6 sm:mb-8 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
              Good to see you
            </h2>
            <p className="text-sm text-muted mt-1">AI-Powered Dhivehi News Engine</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="glass-soft px-3 py-2 rounded-xl flex items-center gap-2">
              <span className="text-[11px] text-muted uppercase tracking-wider">Headlines</span>
              <span className="text-sm font-semibold text-primary">{headlines.length}</span>
            </div>
            <div className="glass-soft px-3 py-2 rounded-xl flex items-center gap-2">
              <span className="text-[11px] text-muted uppercase tracking-wider">Saved</span>
              <span className="text-sm font-semibold text-primary">{bookmarks.length}</span>
            </div>
          </div>
        </div>

        {/* ── Auto-Scrape Status Bar ── */}
        {settings.autoScrapeInterval !== "disabled" && (
          <div className="mb-6 glass flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Clock className="w-3.5 h-3.5" />
              <span>Auto-scrape: every {settings.autoScrapeInterval} min</span>
              {lastAutoScrape && (
                <span className="text-faint">Last: {lastAutoScrape.toLocaleTimeString()}</span>
              )}
              {autoScraping && (
                <span className="flex items-center gap-1.5 text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Scraping…
                </span>
              )}
            </div>
            <button
              onClick={autoScrapeAll}
              disabled={autoScraping}
              className="glass-btn flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl"
            >
              <RefreshCw className={`w-3 h-3 ${autoScraping ? "animate-spin" : ""}`} />
              Scrape All Now
            </button>
          </div>
        )}

        <div className="space-y-6">
          {/* ── News Discovery ── */}
          <GlassCard className="p-4 sm:p-6">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
              News Discovery
            </h2>

            {/* Tab buttons */}
            <div className="flex gap-1 p-1 glass-soft rounded-2xl mb-5 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-shrink-0 ${
                    activeTab === tab.id
                      ? "shadow-sm"
                      : "text-muted hover:text-primary"
                  }`}
                  style={
                    activeTab === tab.id
                      ? { background: "var(--glass-bg-strong)", color: "var(--text-primary)" }
                      : undefined
                  }
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sources Tab */}
            {activeTab === "sources" && (
              <div className="space-y-3">
                {enabledSources.length === 0 ? (
                  <p className="text-sm text-muted text-center py-4">
                    No sources configured.{" "}
                    <Link href="/settings" className="text-primary underline-offset-2 hover:underline">
                      Configure in Settings
                    </Link>
                  </p>
                ) : (
                  <>
                    <div className="relative">
                      <select
                        value={selectedSource || enabledSources[0]?.id || ""}
                        onChange={(e) => setSelectedSource(e.target.value)}
                        className="glass-input w-full appearance-none rounded-xl px-4 py-3 text-sm cursor-pointer"
                      >
                        {enabledSources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                    </div>
                    <button
                      onClick={fetchSource}
                      disabled={headlinesLoading}
                      className="glass-btn w-full flex items-center justify-center gap-2 font-medium py-3 rounded-xl"
                    >
                      {headlinesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rss className="w-4 h-4" />}
                      Fetch Headlines
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Manual Link Tab */}
            {activeTab === "manual" && (
              <div className="space-y-3">
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="Paste article URL here…"
                  className="glass-input w-full rounded-xl px-4 py-3 text-sm"
                />
                <button
                  onClick={() => manualUrl.trim() && processArticle(manualUrl)}
                  disabled={processing || !manualUrl.trim()}
                  className="glass-btn w-full flex items-center justify-center gap-2 font-medium py-3 rounded-xl"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Process Article
                </button>
              </div>
            )}

            {settings.autoScrapeInterval === "disabled" && (
              <button
                onClick={autoScrapeAll}
                disabled={autoScraping}
                className="glass-btn-ghost w-full mt-4 flex items-center justify-center gap-2 font-medium py-2.5 rounded-xl text-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${autoScraping ? "animate-spin" : ""}`} />
                Scrape All Sources
              </button>
            )}
          </GlassCard>

          {/* ── Headlines List ── */}
          {(viewHeadlines.length > 0 || headlinesLoading || headlinesError || filter === "saved") && (
            <GlassCard className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
                  {filter === "saved" ? "Saved Headlines" : "Discovered Headlines"}
                  <span className="ml-2 text-xs text-faint font-normal normal-case tracking-normal">
                    ({viewHeadlines.length})
                  </span>
                </h2>
                {headlines.length > 0 && filter !== "saved" && (
                  <button
                    onClick={() => setHeadlines([])}
                    className="text-xs text-muted hover:text-primary transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Search + filter chips */}
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search headlines or sources…"
                    className="glass-input w-full rounded-xl pl-9 pr-9 py-2 text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-1 p-1 glass-soft rounded-xl">
                  {(["all", "fresh", "saved"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                        filter === f ? "shadow-sm" : "text-muted hover:text-primary"
                      }`}
                      style={
                        filter === f
                          ? { background: "var(--glass-bg-strong)", color: "var(--text-primary)" }
                          : undefined
                      }
                    >
                      {f === "saved" ? `Saved (${bookmarks.length})` : f}
                    </button>
                  ))}
                </div>
              </div>

              {headlinesError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm mb-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {headlinesError}
                </div>
              )}

              {headlinesLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <span className="ml-3 text-muted text-sm">Scanning feeds…</span>
                </div>
              )}

              {viewHeadlines.length === 0 && !headlinesLoading && (
                <p className="text-sm text-muted text-center py-6">
                  {filter === "saved"
                    ? "No saved headlines yet. Tap the bookmark on any headline to save it."
                    : searchQuery
                    ? "No headlines match your search."
                    : "No headlines yet."}
                </p>
              )}

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {viewHeadlines.map((h, i) => {
                  const saved = savedSet.has(h.link);
                  return (
                    <div
                      key={`${h.link}-${i}`}
                      className={`glass-soft p-4 rounded-2xl transition-all duration-200 group animate-fade-in ${
                        h.alreadyProcessed ? "opacity-60" : ""
                      }`}
                      style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                    >
                      <div className="mb-2">
                        <p className="text-sm text-primary leading-snug">{h.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {h.sourceLabel && (
                            <span className="text-[11px] font-medium text-secondary px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)" }}>
                              {h.sourceLabel}
                            </span>
                          )}
                          {h.pubDate && (
                            <span className="text-xs text-faint">
                              {new Date(h.pubDate).toLocaleDateString()}
                            </span>
                          )}
                          {h.alreadyProcessed && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded text-[10px] text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Processed
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => processArticle(h.link)}
                          disabled={processing}
                          className="glass-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg"
                        >
                          {processing && processingUrl === h.link ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          Process
                        </button>
                        <button
                          onClick={() =>
                            saved
                              ? removeBookmark(h.link)
                              : toggleBookmark({
                                  title: h.title,
                                  link: h.link,
                                  sourceLabel: h.sourceLabel,
                                  pubDate: h.pubDate,
                                })
                          }
                          className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors"
                          title={saved ? "Remove from saved" : "Save for later"}
                          aria-label={saved ? "Remove bookmark" : "Add bookmark"}
                        >
                          {saved ? (
                            <BookmarkCheck className="w-4 h-4" style={{ color: "var(--accent)" }} />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                        </button>
                        <a
                          href={h.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-muted hover:text-primary transition-colors"
                          title="Open original"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {/* ── Error Display ── */}
          {processError && (
            <GlassCard className="p-6 animate-fade-in">
              <div className="flex items-start gap-3 text-red-600">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Processing Failed</p>
                  <p className="text-sm text-red-500 mt-1">{processError}</p>
                </div>
              </div>
            </GlassCard>
          )}

          {/* ── Empty State ── */}
          {!processing && !processError && headlines.length === 0 && !headlinesLoading && filter !== "saved" && (
            <GlassCard className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="relative p-5 rounded-3xl mb-5 glass-soft">
                  <Rss className="w-12 h-12 text-faint relative z-10" />
                  <div className="ripple-ring" />
                  <div className="ripple-ring" style={{ animationDelay: "0.8s" }} />
                </div>
                <h3 className="text-lg font-medium text-secondary mb-2">
                  Ready to Discover News
                </h3>
                <p className="text-sm text-muted max-w-sm">
                  {settings.autoScrapeInterval !== "disabled"
                    ? "Auto-scrape is enabled. Headlines will appear shortly."
                    : "Pick an RSS feed, paste a link, or write manually to get started."}
                </p>
              </div>
            </GlassCard>
          )}
        </div>
      </main>
    </div>
  );
}
