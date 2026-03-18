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
  LayoutDashboard,
  PenTool,
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

type InputTab = "rss" | "scrape" | "manual" | "writer";

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
  const [writerPoints, setWriterPoints] = useState("");

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
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

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

  // ── Auto-scrape all sources ──
  const autoScrapeAll = useCallback(async () => {
    if (autoScraping) return;
    setAutoScraping(true);

    const fetches: Promise<Headline[]>[] = [];

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
            geminiModel: settings.geminiModel || undefined,
            promptTemplate: settings.promptTemplate || undefined,
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
    [settings.paraphrasingLevel, settings.tone, settings.length, settings.geminiApiKey, settings.geminiModel, settings.promptTemplate]
  );

  // ── Compose an original article from bullet points ──
  const composeArticle = useCallback(
    async () => {
      if (!writerPoints.trim()) return;
      setProcessing(true);
      setProcessingUrl("");
      setProcessError("");
      setResult(null);
      try {
        const res = await fetch("/api/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: writerPoints,
            geminiApiKey: settings.geminiApiKey || undefined,
            geminiModel: settings.composeModel || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Article generation failed");
        setResult(data);
      } catch (err: unknown) {
        setProcessError(err instanceof Error ? err.message : "Article generation failed");
      } finally {
        setProcessing(false);
      }
    },
    [writerPoints, settings.geminiApiKey, settings.composeModel]
  );

  // ── Copy section to clipboard ──
  const copySection = useCallback(async (text: string, section: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  // ── Logout handler ──
  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  // ── Parse structured AI output into sections ──
  const parsedOutput = useMemo(() => {
    if (!result?.rewrittenText) return null;
    const text = result.rewrittenText.trim();

    // Try to parse labeled sections: TITLE:, CONTENT:, article_LATIN:, SOCIAL_TEXT:
    const titleMatch = text.match(/TITLE:\s*([\s\S]*?)(?=\nCONTENT:|$)/i);
    const contentMatch = text.match(/CONTENT:\s*([\s\S]*?)(?=\narticle_LATIN:|$)/i);
    const latinMatch = text.match(/article_LATIN:\s*([\s\S]*?)(?=\nSOCIAL_TEXT:|$)/i);
    const socialMatch = text.match(/SOCIAL_TEXT:\s*([\s\S]*?)$/i);

    if (titleMatch) {
      return {
        title: titleMatch[1]?.trim() || "",
        content: contentMatch?.[1]?.trim() || "",
        articleLatin: latinMatch?.[1]?.trim() || "",
        socialText: socialMatch?.[1]?.trim() || "",
      };
    }

    // Fallback: old format (headline on first line, body after)
    const firstNewline = text.indexOf("\n");
    if (firstNewline === -1) return { title: text, content: "", articleLatin: "", socialText: "" };
    return {
      title: text.slice(0, firstNewline).trim(),
      content: text.slice(firstNewline + 1).trim(),
      articleLatin: "",
      socialText: "",
    };
  }, [result]);

  // ── Loading state ──
  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa]">
        <Loader2 className="w-8 h-8 text-[#5D87FF] animate-spin" />
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
    { id: "writer", label: "AI Writer", icon: <PenTool className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen flex bg-[#f5f7fa]">
      {/* ════════════════════════════════════════════════════════ */}
      {/* SIDEBAR                                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-[#2A3447] text-white min-h-screen sticky top-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <div className="p-2 bg-[#5D87FF]/20 rounded-xl">
            <Newspaper className="w-6 h-6 text-[#5D87FF]" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Creative Network</h1>
            <p className="text-[10px] text-white/40">News Desk</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#5D87FF]/15 text-[#5D87FF] text-sm font-medium"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/60 hover:bg-white/5 hover:text-white/80 text-sm transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Settings
          </Link>
        </nav>

        {/* Logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-white/50 hover:bg-white/5 hover:text-white/70 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT                                            */}
      {/* ════════════════════════════════════════════════════════ */}
      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-xl">
              <Newspaper className="w-5 h-5 text-[#5D87FF]" />
            </div>
            <h1 className="text-sm font-bold text-gray-900">Creative Network</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <Settings2 className="w-4 h-4 text-gray-500" />
            </Link>
            <button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <LogOut className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          {/* ── Page Title ── */}
          <div className="mb-4 sm:mb-6">
            <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
            <p className="text-sm text-gray-500">AI-Powered Dhivehi News Engine</p>
          </div>

          {/* ── Auto-Scrape Status Bar ── */}
          {settings.autoScrapeInterval !== "disabled" && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Auto-scrape: every {settings.autoScrapeInterval} min</span>
                {lastAutoScrape && (
                  <span className="text-gray-400">
                    Last: {lastAutoScrape.toLocaleTimeString()}
                  </span>
                )}
                {autoScraping && (
                  <span className="flex items-center gap-1.5 text-[#5D87FF]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Scraping...
                  </span>
                )}
              </div>
              <button
                onClick={autoScrapeAll}
                disabled={autoScraping}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#5D87FF] hover:bg-[#4A70E0] text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
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
            <div className="lg:col-span-1 space-y-4 sm:space-y-6">
              {/* ── Tri-Mode Input Tabs ── */}
              <GlassCard className="p-4 sm:p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
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
                          ? "tab-active"
                          : "bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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
                      <p className="text-sm text-gray-400 text-center py-4">
                        No RSS feeds enabled.{" "}
                        <Link href="/settings" className="text-[#5D87FF] hover:underline">
                          Enable in Settings
                        </Link>
                      </p>
                    ) : (
                      <>
                        <div className="relative">
                          <select
                            value={selectedFeed || enabledRssFeeds[0]?.rssUrl || ""}
                            onChange={(e) => setSelectedFeed(e.target.value)}
                            className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
                          >
                            {enabledRssFeeds.map((source) => (
                              <option key={source.id} value={source.rssUrl}>
                                {source.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        <button
                          onClick={fetchRSS}
                          disabled={headlinesLoading}
                          className="w-full flex items-center justify-center gap-2 bg-[#5D87FF] hover:bg-[#4A70E0] text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
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
                      <p className="text-sm text-gray-400 text-center py-4">
                        No scrape sources enabled.{" "}
                        <Link href="/settings" className="text-[#5D87FF] hover:underline">
                          Enable in Settings
                        </Link>
                      </p>
                    ) : (
                      <>
                        <div className="relative">
                          <select
                            value={selectedScrapeSource || enabledScrapeSources[0]?.scrapeUrl || ""}
                            onChange={(e) => setSelectedScrapeSource(e.target.value)}
                            className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
                          >
                            {enabledScrapeSources.map((source) => (
                              <option key={source.id} value={source.scrapeUrl}>
                                {source.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        <button
                          onClick={scrapeHomepage}
                          disabled={headlinesLoading}
                          className="w-full flex items-center justify-center gap-2 bg-[#5D87FF] hover:bg-[#4A70E0] text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
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
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 transition-all"
                    />
                    <button
                      onClick={() => manualUrl.trim() && processArticle(manualUrl)}
                      disabled={processing || !manualUrl.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-[#5D87FF] hover:bg-[#4A70E0] text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
                    >
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Process Article
                    </button>
                  </div>
                )}

                {/* ── AI Writer Tab ── */}
                {activeTab === "writer" && (
                  <div className="space-y-3">
                    <textarea
                      value={writerPoints}
                      onChange={(e) => setWriterPoints(e.target.value)}
                      placeholder="Enter key points to write about...&#10;&#10;Example:&#10;- President announced new housing project&#10;- 5000 units in Hulhumale Phase 3&#10;- Construction starts Q2 2026&#10;- Partnership with foreign investors"
                      rows={6}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 transition-all resize-y"
                    />
                    <button
                      onClick={composeArticle}
                      disabled={processing || !writerPoints.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-[#5D87FF] hover:bg-[#4A70E0] text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
                    >
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
                      Generate Article
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

              {/* ── Current AI Settings Summary ── */}
              <GlassCard className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      AI Config
                    </h2>
                  </div>
                  <Link href="/settings" className="text-xs text-[#5D87FF] hover:underline transition-colors">
                    Change
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                    {settings.paraphrasingLevel === "heavy" ? "Heavy Rewrite" : "Light Touch"}
                  </span>
                  <span className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 capitalize">
                    {settings.tone}
                  </span>
                  <span className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                    {settings.length === "match" ? "Full Length" : "Summary"}
                  </span>
                  {settings.geminiApiKey && (
                    <span className="px-2.5 py-1 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                      API Key Set
                    </span>
                  )}
                </div>
              </GlassCard>
            </div>

            {/* ════════════════════════════════════════════════ */}
            {/* RIGHT COLUMN: Headlines + AI Output             */}
            {/* ════════════════════════════════════════════════ */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
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
                      <Loader2 className="w-6 h-6 text-[#5D87FF] animate-spin" />
                      <span className="ml-3 text-gray-500 text-sm">Scanning feeds...</span>
                    </div>
                  )}

                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {visibleHeadlines.map((h, i) => (
                      <div
                        key={`${h.link}-${i}`}
                        className={`p-3 border rounded-xl transition-all group ${
                          h.alreadyProcessed
                            ? "bg-gray-50 border-gray-100 opacity-60"
                            : "bg-white hover:bg-gray-50 border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="mb-2">
                          <p className="text-sm text-gray-700 leading-snug">{h.title}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {h.sourceLabel && (
                              <span className="text-[10px] text-[#5D87FF]">{h.sourceLabel}</span>
                            )}
                            {h.pubDate && (
                              <span className="text-xs text-gray-400">
                                {new Date(h.pubDate).toLocaleDateString()}
                              </span>
                            )}
                            {h.alreadyProcessed && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-600">
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
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5D87FF] hover:bg-[#4A70E0] text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
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

              {/* ── Processing Indicator ── */}
              {processing && (
                <GlassCard className="p-8">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="relative mb-4">
                      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                        <Sparkles className="w-7 h-7 text-[#5D87FF]" />
                      </div>
                      <div className="absolute inset-0 rounded-full border-2 border-[#5D87FF]/30 animate-ping" />
                    </div>
                    <p className="text-gray-700 font-medium mb-1">AI Spin Engine Active</p>
                    <p className="text-gray-400 text-sm">
                      Scraping, translating & rewriting into Dhivehi...
                    </p>
                  </div>
                </GlassCard>
              )}

              {/* ── Error Display ── */}
              {processError && (
                <GlassCard className="p-6">
                  <div className="flex items-start gap-3 text-red-600">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Processing Failed</p>
                      <p className="text-sm text-red-500 mt-1">{processError}</p>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* ── AI Output ── */}
              {result && parsedOutput && (
                <GlassCard className="p-4 sm:p-6">
                  {/* Output header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                        Dhivehi Output
                      </h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Source: {result.originalTitle}
                      </p>
                    </div>
                    <button
                      onClick={() => copySection(result.rewrittenText, "all")}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all"
                    >
                      {copiedSection === "all" ? (
                        <>
                          <Check className="w-4 h-4 text-green-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy All
                        </>
                      )}
                    </button>
                  </div>

                  {/* TITLE section */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold text-[#5D87FF] uppercase tracking-wider">Title</p>
                      <button
                        onClick={() => copySection(parsedOutput.title, "title")}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                      >
                        {copiedSection === "title" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        {copiedSection === "title" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h3
                        className="dhivehi-output text-gray-900 text-xl font-bold"
                        dir="rtl"
                      >
                        {parsedOutput.title}
                      </h3>
                    </div>
                  </div>

                  {/* CONTENT section */}
                  {parsedOutput.content && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-semibold text-[#5D87FF] uppercase tracking-wider">Content</p>
                        <button
                          onClick={() => copySection(parsedOutput.content, "content")}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                        >
                          {copiedSection === "content" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                          {copiedSection === "content" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:p-6 max-h-[600px] overflow-y-auto">
                        <div className="dhivehi-output text-gray-800 text-base whitespace-pre-wrap" dir="rtl">
                          {parsedOutput.content}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* article_LATIN section */}
                  {parsedOutput.articleLatin && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-semibold text-[#5D87FF] uppercase tracking-wider">Latin Transliteration</p>
                        <button
                          onClick={() => copySection(parsedOutput.articleLatin, "latin")}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                        >
                          {copiedSection === "latin" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                          {copiedSection === "latin" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <p className="text-gray-800 text-sm font-medium">{parsedOutput.articleLatin}</p>
                      </div>
                    </div>
                  )}

                  {/* SOCIAL_TEXT section */}
                  {parsedOutput.socialText && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-semibold text-[#5D87FF] uppercase tracking-wider">Social Media Text</p>
                        <button
                          onClick={() => copySection(parsedOutput.socialText, "social")}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                        >
                          {copiedSection === "social" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                          {copiedSection === "social" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <div className="dhivehi-output text-gray-800 text-sm" dir="rtl">
                          {parsedOutput.socialText}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Metadata footer */}
                  <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
                    <span>Original: {result.originalLength.toLocaleString()} chars</span>
                    <span>Processed: {new Date(result.processedAt).toLocaleTimeString()}</span>
                  </div>

                  {/* WordPress Publisher */}
                  <div className="mt-4">
                    <WordPressPublisher
                      title={parsedOutput.title || result.originalTitle}
                      content={parsedOutput.content || result.rewrittenText}
                      wordpress={settings.wordpress}
                      customFields={{
                        ...(parsedOutput.articleLatin ? { article_latin: parsedOutput.articleLatin } : {}),
                        ...(parsedOutput.socialText ? { article_social_text: parsedOutput.socialText } : {}),
                      }}
                    />
                  </div>
                </GlassCard>
              )}

              {/* ── Empty State ── */}
              {!processing && !result && !processError && visibleHeadlines.length === 0 && !headlinesLoading && (
                <GlassCard className="p-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="p-5 bg-gray-50 rounded-3xl mb-5">
                      <Newspaper className="w-12 h-12 text-gray-300" />
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
          </div>
        </div>
      </main>
    </div>
  );
}
