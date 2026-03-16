"use client";

// ─── Creative Network News Desk — Main Dashboard ──────────
// Auto-scrapes all enabled sources on interval, shows unified
// headlines with processed badges, AI rewriting, and WordPress
// draft publishing.

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Newspaper,
  Rss,
  Globe,
  Link2,
  Settings2,
  Sparkles,
  Loader2,
  Copy,
  Check,
  LogOut,
  AlertCircle,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import WordPressPublisher from "@/components/WordPressPublisher";
import { useSettings } from "@/lib/useSettings";
import { getEffectiveSources } from "@/lib/config";

// ─── Types ─────────────────────────────────────────────────
interface Headline {
  title: string;
  link: string;
  pubDate?: string;
  alreadyProcessed?: boolean;
  sourceLabel?: string;
}

interface ProcessResult {
  originalTitle: string;
  originalLength: number;
  rewrittenText: string;
  sourceUrl: string;
  processedAt: string;
}

type InputTab = "rss" | "scrape" | "manual";

// ─── Main Dashboard Component ──────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const { settings, loaded } = useSettings();

  // ── Derive enabled sources from settings ──
  const effectiveSources = useMemo(
    () => (loaded ? getEffectiveSources(settings) : []),
    [settings, loaded]
  );

  const enabledRssFeeds = useMemo(
    () => effectiveSources.filter((s) => s.rssUrl && settings.enabledRssFeeds.includes(s.id)),
    [effectiveSources, settings.enabledRssFeeds]
  );

  const enabledScrapeSources = useMemo(
    () => effectiveSources.filter((s) => settings.enabledScrapeSources.includes(s.id)),
    [effectiveSources, settings.enabledScrapeSources]
  );

  // ── Input tab state ──
  const [activeTab, setActiveTab] = useState<InputTab>("rss");
  const [selectedFeed, setSelectedFeed] = useState("");
  const [selectedScrapeSource, setSelectedScrapeSource] = useState("");
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
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [processError, setProcessError] = useState("");
  const [copied, setCopied] = useState(false);

  // ── Helper: dedupe headlines by URL ──
  const mergeHeadlines = useCallback(
    (existing: Headline[], incoming: Headline[]) => {
      const seen = new Set(existing.map((h) => h.link));
      const newOnes = incoming.filter((h) => !seen.has(h.link));
      const merged = [...existing, ...newOnes];
      // If auto-exclude is on, optionally sort processed to bottom
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

  // ── Auto-scrape all sources ──
  const autoScrapeAll = useCallback(async () => {
    if (autoScraping) return;
    setAutoScraping(true);

    const fetches: Promise<Headline[]>[] = [];

    // RSS feeds
    for (const source of enabledRssFeeds) {
      if (!source.rssUrl) continue;
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
    }

    // Scrape sources
    for (const source of enabledScrapeSources) {
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
  }, [enabledRssFeeds, enabledScrapeSources, settings.defaultHeadlineCount, mergeHeadlines, autoScraping]);

  // ── Auto-scrape interval ──
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (settings.autoScrapeInterval === "disabled" || !loaded) return;

    const ms = parseInt(settings.autoScrapeInterval) * 60 * 1000;

    // Initial scrape on mount
    autoScrapeAll();

    intervalRef.current = setInterval(() => {
      autoScrapeAll();
    }, ms);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoScrapeInterval, loaded]);

  // ── Fetch RSS headlines (manual) ──
  const fetchRSS = useCallback(async () => {
    const feedUrl = selectedFeed || enabledRssFeeds[0]?.rssUrl;
    if (!feedUrl) return;
    setHeadlinesLoading(true);
    setHeadlinesError("");
    try {
      const source = enabledRssFeeds.find((s) => s.rssUrl === feedUrl);
      const res = await fetch(
        `/api/feeds?url=${encodeURIComponent(feedUrl)}&count=${settings.defaultHeadlineCount}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch feed");
      const incoming = (data.headlines || []).map((h: Headline) => ({
        ...h,
        sourceLabel: source?.label,
      }));
      setHeadlines((prev) => mergeHeadlines(prev, incoming));
    } catch (err: unknown) {
      setHeadlinesError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setHeadlinesLoading(false);
    }
  }, [selectedFeed, enabledRssFeeds, settings.defaultHeadlineCount, mergeHeadlines]);

  // ── Scrape homepage (manual) ──
  const scrapeHomepage = useCallback(async () => {
    const scrapeUrl = selectedScrapeSource || enabledScrapeSources[0]?.scrapeUrl;
    if (!scrapeUrl) return;
    setHeadlinesLoading(true);
    setHeadlinesError("");
    try {
      const source = enabledScrapeSources.find((s) => s.scrapeUrl === scrapeUrl);
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(scrapeUrl)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scrape");
      const incoming = (data.headlines || []).map((h: Headline) => ({
        ...h,
        sourceLabel: source?.label,
      }));
      setHeadlines((prev) => mergeHeadlines(prev, incoming));
    } catch (err: unknown) {
      setHeadlinesError(err instanceof Error ? err.message : "Failed to scrape");
    } finally {
      setHeadlinesLoading(false);
    }
  }, [selectedScrapeSource, enabledScrapeSources, mergeHeadlines]);

  // ── Process an article through the AI Spin Engine ──
  const processArticle = useCallback(
    async (url: string) => {
      setProcessing(true);
      setProcessingUrl(url);
      setProcessError("");
      setResult(null);
      try {
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            paraphrasingLevel: settings.paraphrasingLevel,
            tone: settings.tone,
            length: settings.length,
            geminiApiKey: settings.geminiApiKey || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Processing failed");
        setResult(data);
      } catch (err: unknown) {
        setProcessError(err instanceof Error ? err.message : "Processing failed");
      } finally {
        setProcessing(false);
        setProcessingUrl("");
      }
    },
    [settings.paraphrasingLevel, settings.tone, settings.length, settings.geminiApiKey]
  );

  // ── Copy result to clipboard ──
  const copyToClipboard = useCallback(async () => {
    if (!result?.rewrittenText) return;
    await navigator.clipboard.writeText(result.rewrittenText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  // ── Logout handler ──
  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  // ── Loading state ──
  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  // ── Visible headlines (respect auto-exclude toggle) ──
  const visibleHeadlines = settings.autoExcludeProcessed
    ? headlines.filter((h) => !h.alreadyProcessed)
    : headlines;

  // ── Tab config ──
  const tabs: Array<{ id: InputTab; label: string; icon: React.ReactNode }> = [
    { id: "rss", label: "RSS Radar", icon: <Rss className="w-4 h-4" /> },
    { id: "scrape", label: "Direct Scrape", icon: <Globe className="w-4 h-4" /> },
    { id: "manual", label: "Manual Link", icon: <Link2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900 text-white">
      {/* ── Ambient Background Orbs ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-sky-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      {/* ── Main Content ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-teal-500/20 rounded-2xl border border-teal-400/30">
              <Newspaper className="w-7 h-7 text-teal-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Creative Network{" "}
                <span className="text-teal-300">News Desk</span>
              </h1>
              <p className="text-sm text-white/40">
                AI-Powered Dhivehi News Engine
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
              title="Settings"
            >
              <Settings2 className="w-4 h-4 text-white/60" />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-white/60 hover:text-white/80 text-sm"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* ── Auto-Scrape Status Bar ── */}
        {settings.autoScrapeInterval !== "disabled" && (
          <div className="mb-6 flex items-center justify-between gap-4 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center gap-3 text-xs text-white/50">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Auto-scrape: every {settings.autoScrapeInterval} min
              </span>
              {lastAutoScrape && (
                <span className="text-white/30">
                  Last: {lastAutoScrape.toLocaleTimeString()}
                </span>
              )}
              {autoScraping && (
                <span className="flex items-center gap-1.5 text-teal-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Scraping...
                </span>
              )}
            </div>
            <button
              onClick={autoScrapeAll}
              disabled={autoScraping}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-400/20 text-teal-300 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${autoScraping ? "animate-spin" : ""}`} />
              Scrape All Now
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ════════════════════════════════════════════════ */}
          {/* LEFT COLUMN: Input System + AI Summary          */}
          {/* ════════════════════════════════════════════════ */}
          <div className="lg:col-span-1 space-y-6">
            {/* ── Tri-Mode Input Tabs ── */}
            <GlassCard className="p-6">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
                News Discovery
              </h2>

              {/* Tab buttons */}
              <div className="flex gap-2 mb-5">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                      activeTab === tab.id
                        ? "tab-active text-white"
                        : "bg-white/5 border-transparent text-white/50 hover:text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── RSS Radar Tab ── */}
              {activeTab === "rss" && (
                <div className="space-y-3">
                  {enabledRssFeeds.length === 0 ? (
                    <p className="text-sm text-white/40 text-center py-4">
                      No RSS feeds enabled.{" "}
                      <Link href="/settings" className="text-teal-400 hover:text-teal-300">
                        Enable in Settings
                      </Link>
                    </p>
                  ) : (
                    <>
                      <div className="relative">
                        <select
                          value={selectedFeed || enabledRssFeeds[0]?.rssUrl || ""}
                          onChange={(e) => setSelectedFeed(e.target.value)}
                          className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:border-teal-400/50 transition-all cursor-pointer"
                        >
                          {enabledRssFeeds.map((source) => (
                            <option key={source.id} value={source.rssUrl} className="bg-slate-800">
                              {source.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                      </div>
                      <button
                        onClick={fetchRSS}
                        disabled={headlinesLoading}
                        className="w-full flex items-center justify-center gap-2 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 text-teal-200 font-medium py-3 rounded-xl transition-all disabled:opacity-50"
                      >
                        {headlinesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rss className="w-4 h-4" />}
                        Fetch Headlines
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── Direct Scrape Tab ── */}
              {activeTab === "scrape" && (
                <div className="space-y-3">
                  {enabledScrapeSources.length === 0 ? (
                    <p className="text-sm text-white/40 text-center py-4">
                      No scrape sources enabled.{" "}
                      <Link href="/settings" className="text-teal-400 hover:text-teal-300">
                        Enable in Settings
                      </Link>
                    </p>
                  ) : (
                    <>
                      <div className="relative">
                        <select
                          value={selectedScrapeSource || enabledScrapeSources[0]?.scrapeUrl || ""}
                          onChange={(e) => setSelectedScrapeSource(e.target.value)}
                          className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:border-teal-400/50 transition-all cursor-pointer"
                        >
                          {enabledScrapeSources.map((source) => (
                            <option key={source.id} value={source.scrapeUrl} className="bg-slate-800">
                              {source.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                      </div>
                      <button
                        onClick={scrapeHomepage}
                        disabled={headlinesLoading}
                        className="w-full flex items-center justify-center gap-2 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 text-teal-200 font-medium py-3 rounded-xl transition-all disabled:opacity-50"
                      >
                        {headlinesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        Scrape Homepage
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-teal-400/50 transition-all"
                  />
                  <button
                    onClick={() => manualUrl.trim() && processArticle(manualUrl)}
                    disabled={processing || !manualUrl.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500/30 to-sky-500/30 hover:from-teal-500/40 hover:to-sky-500/40 border border-teal-400/30 text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
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
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-medium py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${autoScraping ? "animate-spin" : ""}`} />
                  Scrape All Sources
                </button>
              )}
            </GlassCard>

            {/* ── Current AI Settings Summary ── */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                    AI Config
                  </h2>
                </div>
                <Link href="/settings" className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
                  Change
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white/50">
                  {settings.paraphrasingLevel === "heavy" ? "Heavy Rewrite" : "Light Touch"}
                </span>
                <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white/50 capitalize">
                  {settings.tone}
                </span>
                <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white/50">
                  {settings.length === "match" ? "Full Length" : "Summary"}
                </span>
                {settings.geminiApiKey && (
                  <span className="px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400">
                    API Key Set
                  </span>
                )}
              </div>
            </GlassCard>
          </div>

          {/* ════════════════════════════════════════════════ */}
          {/* RIGHT COLUMN: Headlines + AI Output             */}
          {/* ════════════════════════════════════════════════ */}
          <div className="lg:col-span-2 space-y-6">
            {/* ── Headlines List ── */}
            {(visibleHeadlines.length > 0 || headlinesLoading || headlinesError) && (
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                    Discovered Headlines
                    {headlines.length > 0 && (
                      <span className="ml-2 text-xs text-white/30 font-normal">
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
                      className="text-xs text-white/30 hover:text-white/60 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {headlinesError && (
                  <div className="flex items-center gap-2 text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm mb-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {headlinesError}
                  </div>
                )}

                {headlinesLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                    <span className="ml-3 text-white/50 text-sm">Scanning feeds...</span>
                  </div>
                )}

                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {visibleHeadlines.map((h, i) => (
                    <div
                      key={`${h.link}-${i}`}
                      className={`flex items-center justify-between gap-3 p-3 border rounded-xl transition-all group ${
                        h.alreadyProcessed
                          ? "bg-white/3 border-white/5 opacity-60"
                          : "bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/15"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white/80 truncate">{h.title}</p>
                          {h.alreadyProcessed && (
                            <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Processed
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {h.sourceLabel && (
                            <span className="text-[10px] text-teal-400/60">{h.sourceLabel}</span>
                          )}
                          {h.pubDate && (
                            <span className="text-xs text-white/30">
                              {new Date(h.pubDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={h.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-white/30 hover:text-white/60 transition-colors"
                          title="Open original"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => processArticle(h.link)}
                          disabled={processing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-400/20 text-teal-300 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                        >
                          {processing && processingUrl === h.link ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          Process
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* ── Processing Indicator ── */}
            {processing && (
              <GlassCard className="p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center">
                      <Sparkles className="w-7 h-7 text-teal-300 animate-shimmer" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-teal-400/30 animate-ping" />
                  </div>
                  <p className="text-white/70 font-medium mb-1">AI Spin Engine Active</p>
                  <p className="text-white/40 text-sm">
                    Scraping, translating & rewriting into Dhivehi...
                  </p>
                </div>
              </GlassCard>
            )}

            {/* ── Error Display ── */}
            {processError && (
              <GlassCard className="p-6">
                <div className="flex items-start gap-3 text-red-300">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Processing Failed</p>
                    <p className="text-sm text-red-300/70 mt-1">{processError}</p>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* ── AI Output ── */}
            {result && (
              <GlassCard className="p-6">
                {/* Output header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                      Dhivehi Output
                    </h2>
                    <p className="text-xs text-white/30 mt-1">
                      Source: {result.originalTitle}
                    </p>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white transition-all"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                {/* Dhivehi RTL output area */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 max-h-[600px] overflow-y-auto">
                  <div className="dhivehi-output text-white/90 text-base whitespace-pre-wrap" dir="rtl">
                    {result.rewrittenText}
                  </div>
                </div>

                {/* Metadata footer */}
                <div className="flex items-center justify-between mt-4 text-xs text-white/30">
                  <span>Original: {result.originalLength.toLocaleString()} chars</span>
                  <span>Processed: {new Date(result.processedAt).toLocaleTimeString()}</span>
                </div>

                {/* WordPress Publisher */}
                <div className="mt-4">
                  <WordPressPublisher
                    title={result.originalTitle}
                    content={result.rewrittenText}
                    wordpress={settings.wordpress}
                  />
                </div>
              </GlassCard>
            )}

            {/* ── Empty State ── */}
            {!processing && !result && !processError && visibleHeadlines.length === 0 && !headlinesLoading && (
              <GlassCard className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="p-5 bg-white/5 rounded-3xl mb-5">
                    <Newspaper className="w-12 h-12 text-white/20" />
                  </div>
                  <h3 className="text-lg font-medium text-white/40 mb-2">
                    Ready to Discover News
                  </h3>
                  <p className="text-sm text-white/25 max-w-sm">
                    {settings.autoScrapeInterval !== "disabled"
                      ? "Auto-scrape is enabled. Headlines will appear shortly."
                      : "Select an RSS feed, scrape a homepage, or paste a direct article link to get started."}
                  </p>
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
