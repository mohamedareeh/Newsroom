"use client";

// ─── Creative Network News Desk — Main Dashboard ──────────
// Auto-scrapes all enabled sources on interval, shows unified
// headlines with processed badges, AI rewriting, and WordPress
// draft publishing.

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";
import { useSettings } from "@/lib/useSettings";
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

        // Build effective sources (defaults minus removed + custom)
        const defaults = DHIVEHI_NEWS_SOURCES.filter((s) => !removedIds.includes(s.id));
        const all = [...defaults, ...customSources];

        // If enabledIds is empty, all are enabled; "__none__" = none enabled
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

  // ── Input tab state ──
  const [activeTab, setActiveTab] = useState<InputTab>("sources");
  const [selectedSource, setSelectedSource] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  // ── Unified headlines state ──
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(false);
  const [headlinesError, setHeadlinesError] = useState("");

  // ── Auto-scrape state ──
  const [autoScraping, setAutoScraping] = useState(false);
  const [lastAutoScrape, setLastAutoScrape] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Processing state ──
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
      // Try RSS first if available
      if (source.rssUrl) {
        fetches.push(
          fetch(`/api/feeds?url=${encodeURIComponent(source.rssUrl)}&count=${settings.defaultHeadlineCount}`)
            .then((r) => r.json())
            .then((data) =>
              (data.headlines || []).map((h: Headline) => ({
                ...h,
                sourceLabel: source.label,
              }))
            )
            .catch(() => [] as Headline[])
        );
      } else {
        // Fallback to scrape
        fetches.push(
          fetch(`/api/scrape?url=${encodeURIComponent(source.scrapeUrl)}`)
            .then((r) => r.json())
            .then((data) =>
              (data.headlines || []).map((h: Headline) => ({
                ...h,
                sourceLabel: source.label,
              }))
            )
            .catch(() => [] as Headline[])
        );
      }
    }

    const results = await Promise.allSettled(fetches);
    const allHeadlines: Headline[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        allHeadlines.push(...r.value);
      }
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

    intervalRef.current = setInterval(() => {
      autoScrapeAll();
    }, ms);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoScrapeInterval, loaded]);

  // ── Fetch from a single source (RSS preferred, fallback to scrape) ──
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
      // Store request params and navigate — article page will stream the response
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

  // ── Logout handler ──
  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  // ── Loading state ──
  if (!loaded || !sourcesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f3f0]">
        <Loader2 className="w-8 h-8 text-[#1a1a1a] animate-spin" />
      </div>
    );
  }

  // ── Visible headlines (respect auto-exclude toggle) ──
  const visibleHeadlines = settings.autoExcludeProcessed
    ? headlines.filter((h) => !h.alreadyProcessed)
    : headlines;

  // ── Tab config ──
  const tabs: Array<{ id: InputTab; label: string; icon: React.ReactNode }> = [
    { id: "sources", label: "Fetch Headlines", icon: <Rss className="w-4 h-4" /> },
    { id: "manual", label: "Manual Link", icon: <Link2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#f5f3f0] pb-20 lg:pb-0">
      {/* ════════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT                                            */}
      {/* ════════════════════════════════════════════════════════ */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ── Page Header ── */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[#1a1a1a] tracking-tight">Good to see you</h2>
          <p className="text-sm text-gray-400 mt-1">AI-Powered Dhivehi News Engine</p>
        </div>

        {/* ── Auto-Scrape Status Bar ── */}
        {settings.autoScrapeInterval !== "disabled" && (
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Auto-scrape: every {settings.autoScrapeInterval} min</span>
              {lastAutoScrape && (
                <span className="text-gray-400">
                  Last: {lastAutoScrape.toLocaleTimeString()}
                </span>
              )}
              {autoScraping && (
                <span className="flex items-center gap-1.5 text-[#1a1a1a]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Scraping...
                </span>
              )}
            </div>
            <button
              onClick={autoScrapeAll}
              disabled={autoScraping}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${autoScraping ? "animate-spin" : ""}`} />
              Scrape All Now
            </button>
          </div>
        )}

        <div className="space-y-8">
          {/* ════════════════════════════════════════════════ */}
          {/* NEWS DISCOVERY                                   */}
          {/* ════════════════════════════════════════════════ */}
          <GlassCard className="p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              News Discovery
            </h2>

            {/* Tab buttons — segmented control */}
            <div className="flex gap-1 p-1 bg-[#f0ede8] rounded-xl mb-5 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 flex-shrink-0 ${
                    activeTab === tab.id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Fetch Headlines Tab (merged RSS + scrape) ── */}
            {activeTab === "sources" && (
              <div className="space-y-3">
                {enabledSources.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No sources configured.{" "}
                    <Link href="/settings" className="text-[#1a1a1a] hover:underline">
                      Configure in Settings
                    </Link>
                  </p>
                ) : (
                  <>
                    <div className="relative">
                      <select
                        value={selectedSource || enabledSources[0]?.id || ""}
                        onChange={(e) => setSelectedSource(e.target.value)}
                        className="w-full appearance-none bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#1a1a1a] transition-all cursor-pointer"
                      >
                        {enabledSources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    <button
                      onClick={fetchSource}
                      disabled={headlinesLoading}
                      className="w-full flex items-center justify-center gap-2 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
                    >
                      {headlinesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rss className="w-4 h-4" />}
                      Fetch Headlines
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── Manual Link Tab ── */}
            {activeTab === "manual" && (
              <div className="space-y-3">
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="Paste article URL here..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#333] transition-all"
                />
                <button
                  onClick={() => manualUrl.trim() && processArticle(manualUrl)}
                  disabled={processing || !manualUrl.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Process Article
                </button>
              </div>
            )}

            {/* ── Scrape All Now button (when auto-scrape is disabled) ── */}
            {settings.autoScrapeInterval === "disabled" && (
              <button
                onClick={autoScrapeAll}
                disabled={autoScraping}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${autoScraping ? "animate-spin" : ""}`} />
                Scrape All Sources
              </button>
            )}
          </GlassCard>

          {/* ════════════════════════════════════════════════ */}
          {/* HEADLINES + AI OUTPUT                            */}
          {/* ════════════════════════════════════════════════ */}

          {/* ── Headlines List ── */}
          {(visibleHeadlines.length > 0 || headlinesLoading || headlinesError) && (
            <GlassCard className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Discovered Headlines
                  {headlines.length > 0 && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      ({visibleHeadlines.length}
                      {settings.autoExcludeProcessed && headlines.length !== visibleHeadlines.length && (
                        <>, {headlines.length - visibleHeadlines.length} hidden</>
                      )}
                      )
                    </span>
                  )}
                </h2>
                {headlines.length > 0 && (
                  <button
                    onClick={() => setHeadlines([])}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {headlinesError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-sm mb-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {headlinesError}
                </div>
              )}

              {headlinesLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[#1a1a1a] animate-spin" />
                  <span className="ml-3 text-gray-500 text-sm">Scanning feeds...</span>
                </div>
              )}

              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {visibleHeadlines.map((h, i) => (
                  <div
                    key={`${h.link}-${i}`}
                    className={`p-4 border rounded-xl transition-all duration-200 group animate-fade-in ${
                      h.alreadyProcessed
                        ? "bg-gray-50/80 border-gray-100 opacity-60"
                        : "bg-white hover:bg-gray-50/50 border-gray-200/60 border-l-[3px] border-l-[#1a1a1a]"
                    }`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="mb-2">
                      <p className="text-sm text-gray-700 leading-snug">{h.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {h.sourceLabel && (
                          <span className="text-[11px] font-medium text-gray-600 px-2 py-0.5 bg-gray-100 rounded-full">{h.sourceLabel}</span>
                        )}
                        {h.pubDate && (
                          <span className="text-xs text-gray-400">
                            {new Date(h.pubDate).toLocaleDateString()}
                          </span>
                        )}
                        {h.alreadyProcessed && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-[10px] text-emerald-600">
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
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                      >
                        {processing && processingUrl === h.link ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Process
                      </button>
                      <a
                        href={h.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Open original"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
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
          {!processing && !processError && visibleHeadlines.length === 0 && !headlinesLoading && (
            <GlassCard className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="relative p-5 bg-[#f0ede8] rounded-3xl mb-5">
                  <Rss className="w-12 h-12 text-gray-300 relative z-10" />
                  <div className="ripple-ring" />
                  <div className="ripple-ring" style={{ animationDelay: "0.8s" }} />
                </div>
                <h3 className="text-lg font-medium text-gray-500 mb-2">
                  Ready to Discover News
                </h3>
                <p className="text-sm text-gray-400 max-w-sm">
                  {settings.autoScrapeInterval !== "disabled"
                    ? "Auto-scrape is enabled. Headlines will appear shortly."
                    : "Select an RSS feed, scrape a homepage, or paste a direct article link to get started."}
                </p>
              </div>
            </GlassCard>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
