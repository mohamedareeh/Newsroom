"use client";

// ─── Multi-Publish Pipeline Page ──────────────────────────
// Two-step editorial workflow:
//   1. Paste URLs → Analyze: scrape + label each (topics, subject
//      tones in the source). Display labels so the editor can scan.
//   2. Editor checks N articles → Run pipeline: translate to
//      Dhivehi (→ dhen.mv) AND paraphrase in English (→
//      maldivesinsight.com), publishing live or as drafts.

import { useState, useCallback, useMemo, useRef } from "react";
import {
  Loader2,
  AlertCircle,
  Sparkles,
  ListChecks,
  Send,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Languages,
  PenLine,
  Globe,
  ClipboardPaste,
  CheckSquare,
  Square,
  Search,
  X,
  Filter,
  RotateCcw,
  Copy,
  ClipboardList,
  Link2,
  Check,
  Newspaper,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";
import SiteReportCard from "@/components/SiteReportCard";
import PipelineNewsPanel from "@/components/PipelineNewsPanel";

interface SubjectTone {
  subject: string;
  tone: "positive" | "negative" | "neutral";
}

interface Analysis {
  url: string;
  ok: true;
  title: string;
  source: string;
  summary: string;
  topics: string[];
  subjects: SubjectTone[];
  publishedAt?: string;
  excerpt: string;
}

interface ItemState {
  url: string;
  title: string;
  step:
    | "queued"
    | "translating-dv"
    | "publishing-dv"
    | "paraphrasing-en"
    | "publishing-en"
    | "done"
    | "error";
  dv?: { title: string; site: string; editUrl?: string; postUrl?: string; error?: string };
  en?: { title: string; site: string; editUrl?: string; postUrl?: string; error?: string };
  startedAt?: number;
  finishedAt?: number;
  attempts: number;
}

const STEP_LABEL: Record<ItemState["step"], string> = {
  queued: "Queued",
  "translating-dv": "Translating to Dhivehi…",
  "publishing-dv": "Publishing to dhen.mv…",
  "paraphrasing-en": "Paraphrasing in English…",
  "publishing-en": "Publishing to maldivesinsight.com…",
  done: "Done",
  error: "Failed",
};

function parseUrls(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s))
    )
  );
}

export default function MultiPublishPage() {
  // Step 1 — paste + analyze
  const [input, setInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [scrapeFailures, setScrapeFailures] = useState<{ url: string; error: string }[]>([]);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  // Step 2 — curate
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());

  // Step 3 — run
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<ItemState[]>([]);
  const [pipelineInfo, setPipelineInfo] = useState<{ dvSite: string | null; enSite: string | null } | null>(null);
  const [pipelineWarnings, setPipelineWarnings] = useState<string[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  // Publish live vs save as drafts. Read via ref inside runUrls (stable deps).
  const [publishLive, setPublishLive] = useState(true);
  const publishLiveRef = useRef(publishLive);
  publishLiveRef.current = publishLive;
  // Backdate: 0 = now, 1 = yesterday, 2 = two days ago.
  const [backdateDays, setBackdateDays] = useState(0);
  const backdateDaysRef = useRef(backdateDays);
  backdateDaysRef.current = backdateDays;
  // Bumped after each run so the site report refreshes.
  const [reportTick, setReportTick] = useState(0);
  const [showPipelineNews, setShowPipelineNews] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const urls = parseUrls(input);

  const allTopics = useMemo(() => {
    const set = new Set<string>();
    analyses?.forEach((a) => a.topics.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [analyses]);

  const filtered = useMemo(() => {
    if (!analyses) return [];
    const q = search.trim().toLowerCase();
    return analyses.filter((a) => {
      if (q && !`${a.title} ${a.summary} ${a.topics.join(" ")} ${a.subjects.map((s) => s.subject).join(" ")}`.toLowerCase().includes(q)) {
        return false;
      }
      if (activeTopics.size > 0 && !a.topics.some((t) => activeTopics.has(t))) {
        return false;
      }
      return true;
    });
  }, [analyses, search, activeTopics]);

  // A flat list of everything that was actually published — one entry per
  // language per article — for the "Posted summary" panel and clipboard export.
  const summaryEntries = useMemo(() => {
    const out: { pub: string; site: string; title: string; url: string; rtl: boolean }[] = [];
    for (const it of items) {
      if (it.dv && !it.dv.error) {
        const url = it.dv.postUrl || it.dv.editUrl;
        if (url) out.push({ pub: "Dhen", site: it.dv.site, title: it.dv.title || it.title, url, rtl: true });
      }
      if (it.en && !it.en.error) {
        const url = it.en.postUrl || it.en.editUrl;
        if (url) out.push({ pub: "Maldives Insight", site: it.en.site, title: it.en.title || it.title, url, rtl: false });
      }
    }
    return out;
  }, [items]);

  // Plain-text version, grouped by publication, for sharing.
  const summaryText = useMemo(() => {
    if (summaryEntries.length === 0) return "";
    const groups = new Map<string, { title: string; url: string }[]>();
    for (const e of summaryEntries) {
      if (!groups.has(e.pub)) groups.set(e.pub, []);
      groups.get(e.pub)!.push({ title: e.title, url: e.url });
    }
    return Array.from(groups.entries())
      .map(([pub, rows]) =>
        `${pub}\n${rows.map((r) => `• ${r.title}\n  ${r.url}`).join("\n")}`
      )
      .join("\n\n");
  }, [summaryEntries]);

  const copySummary = useCallback(async () => {
    if (!summaryText) return;
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 1500);
    } catch {/* ignore */}
  }, [summaryText]);

  const analyze = useCallback(async () => {
    if (analyzing) return;
    if (urls.length === 0) {
      setError("Paste at least one valid http(s) URL.");
      return;
    }
    setAnalyzing(true);
    setError("");
    setWarning("");
    setAnalyses(null);
    setSelected(new Set());
    setItems([]);
    try {
      const res = await fetch("/api/analyze-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Analyze failed (${res.status})`);
      setAnalyses(Array.isArray(data.analyses) ? data.analyses : []);
      setScrapeFailures(Array.isArray(data.failures) ? data.failures : []);
      if (data.warning) setWarning(String(data.warning));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, urls]);

  const toggleSelected = useCallback((url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const toggleTopic = useCallback((t: string) => {
    setActiveTopics((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  // Core runner — accepts an explicit URL list + a function that maps the
  // upstream item index to the index in our `items` state. This lets us
  // retry just a subset (failed / single item) without losing completed rows.
  const runUrls = useCallback(
    async (urlsToRun: string[], targetIndexFor: (upstreamIdx: number) => number) => {
      if (urlsToRun.length === 0) return;
      setRunning(true);
      setError("");
      setPipelineInfo(null);
      setPipelineWarnings([]);

      // Mark the targets as queued and bump attempt count
      const startedAt = Date.now();
      setItems((prev) =>
        prev.map((it, i) => {
          if (!urlsToRun.includes(it.url)) return it;
          // Only reset items at indices in the target range.
          const matchIdx = urlsToRun.indexOf(it.url);
          if (matchIdx === -1) return it;
          return {
            ...it,
            step: "queued",
            startedAt,
            finishedAt: undefined,
            attempts: (it.attempts ?? 0) + (i === targetIndexFor(matchIdx) ? 1 : 0),
            dv: undefined,
            en: undefined,
          };
        })
      );

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/multi-publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            urls: urlsToRun,
            status: publishLiveRef.current ? "publish" : "draft",
            backdateDays: backdateDaysRef.current,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Run failed (${res.status})`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");
        const decoder = new TextDecoder();
        let serverDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.decode(value, { stream: true }).split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let payload: { type: string; [k: string]: unknown };
            try { payload = JSON.parse(line.slice(6)); } catch { continue; }
            if (payload.type === "done") {
              serverDone = true;
            }
            if (payload.type === "ping") continue;
            if (payload.type === "started") {
              setPipelineInfo({
                dvSite: (payload.dvSite as string) || null,
                enSite: (payload.enSite as string) || null,
              });
            } else if (payload.type === "warning") {
              setPipelineWarnings((prev) => [...prev, String(payload.message || "")]);
            } else if (payload.type === "step") {
              const upstreamIdx = payload.index as number;
              const targetIdx = targetIndexFor(upstreamIdx);
              const step = payload.step as ItemState["step"];
              setItems((prev) =>
                prev.map((it, i) =>
                  i === targetIdx
                    ? { ...it, step, startedAt: it.startedAt ?? Date.now() }
                    : it
                )
              );
            } else if (payload.type === "item-done") {
              const upstreamIdx = payload.index as number;
              const targetIdx = targetIndexFor(upstreamIdx);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rec = payload.record as any;
              const errored = !!(rec.dv?.error || rec.en?.error);
              setItems((prev) =>
                prev.map((it, i) =>
                  i === targetIdx
                    ? {
                        ...it,
                        step: errored ? "error" : "done",
                        dv: rec.dv,
                        en: rec.en,
                        finishedAt: Date.now(),
                      }
                    : it
                )
              );
            } else if (payload.type === "error") {
              setError(String(payload.error || "Pipeline error"));
            }
          }
        }
        // If the stream ended but the server never told us it was done, the
        // connection was cut mid-pipeline. Mark only the items WE TRIED to run
        // (touched by this invocation) as errored — leave previously-completed
        // ones intact.
        if (!serverDone) {
          setItems((prev) =>
            prev.map((it) => {
              if (!urlsToRun.includes(it.url)) return it;
              if (it.step === "done" || it.step === "error") return it;
              return {
                ...it,
                step: "error",
                finishedAt: Date.now(),
                dv: it.dv ?? { title: "", site: "—", error: "Connection ended early" },
              };
            })
          );
          setError(
            "Pipeline connection ended before finishing — use Retry failed to pick up where it left off."
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Pipeline failed");
      } finally {
        setRunning(false);
        abortRef.current = null;
        setReportTick((t) => t + 1);
      }
    },
    []
  );

  // Initial run: replaces items list with the selected URLs and runs all.
  const runPipeline = useCallback(async () => {
    if (running || selected.size === 0) return;
    const orderedUrls = (analyses || []).filter((a) => selected.has(a.url)).map((a) => a.url);
    setItems(
      orderedUrls.map((u) => {
        const a = analyses?.find((x) => x.url === u);
        return { url: u, title: a?.title || u, step: "queued", attempts: 0 };
      })
    );
    // upstream index === target index for an initial run
    await runUrls(orderedUrls, (i) => i);
  }, [running, selected, analyses, runUrls]);

  // Retry only the failed items, in place.
  const retryFailed = useCallback(async () => {
    if (running) return;
    const failed = items.filter((it) => it.step === "error");
    if (failed.length === 0) return;
    const failedUrls = failed.map((it) => it.url);
    // Map upstream index (0..failedUrls-1) to its current index in `items`
    const targetIndexFor = (upstreamIdx: number) =>
      items.findIndex((it) => it.url === failedUrls[upstreamIdx]);
    await runUrls(failedUrls, targetIndexFor);
  }, [running, items, runUrls]);

  // Retry a single item, in place.
  const retryOne = useCallback(
    async (url: string) => {
      if (running) return;
      const targetIndexFor = () => items.findIndex((it) => it.url === url);
      await runUrls([url], targetIndexFor);
    },
    [running, items, runUrls]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
    } catch {/* ignore */}
  }, []);

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight flex items-center gap-2">
              <Globe className="w-6 h-6" />
              Multi-Publish Pipeline
            </h2>
            <button
              onClick={() => setShowPipelineNews((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium ${
                showPipelineNews ? "glass-strong text-primary" : "glass-btn"
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              News through Publish
            </button>
          </div>
          <p className="text-sm text-muted mt-1">
            Step 1 — paste source URLs. Step 2 — pick which to publish. Step 3 — pipeline translates
            to Dhivehi (dhen.mv) and paraphrases in English (maldivesinsight.com), publishing live or as drafts.
          </p>
        </div>

        {showPipelineNews && (
          <PipelineNewsPanel refreshKey={reportTick} onClose={() => setShowPipelineNews(false)} />
        )}

        <SiteReportCard refreshKey={reportTick} />

        {/* Step 1: Input */}
        <GlassCard className="p-5 sm:p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Step 1 · Source URLs
            </p>
            <button
              onClick={paste}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted hover:text-primary rounded-lg"
              title="Paste from clipboard"
            >
              <ClipboardPaste className="w-3 h-3" />
              Paste
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"Paste one URL per line or comma-separated.\n\nhttps://example.com/article-1\nhttps://example.com/article-2\n..."}
            rows={5}
            className="glass-input w-full rounded-xl p-4 text-sm resize-y font-mono"
            disabled={analyzing}
          />
          <div className="flex flex-col sm:flex-row gap-3 mt-3 sm:items-center">
            <div className="flex items-center gap-2 text-xs text-muted">
              <ListChecks className="w-3.5 h-3.5" />
              {urls.length} valid URL{urls.length === 1 ? "" : "s"}
            </div>
            <button
              onClick={analyze}
              disabled={analyzing || urls.length === 0}
              className="glass-btn sm:ml-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          {error && !analyses && (
            <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-600 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {warning && analyses && (
            <p className="mt-3 text-xs text-muted">{warning}</p>
          )}
          {scrapeFailures.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-faint cursor-pointer">
                {scrapeFailures.length} URL{scrapeFailures.length === 1 ? "" : "s"} couldn't be fetched
              </summary>
              <div className="space-y-1 mt-1 text-[11px] text-muted">
                {scrapeFailures.map((f, i) => (
                  <div key={i} className="truncate">
                    <span className="text-faint">{f.url}</span> — {f.error}
                  </div>
                ))}
              </div>
            </details>
          )}
        </GlassCard>

        {/* Step 2: Curate */}
        {analyses && analyses.length > 0 && (
          <GlassCard className="p-5 sm:p-6 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Step 2 · Pick what to publish
              </p>
              <div className="flex items-center gap-3">
                {/* Publish mode: live or drafts */}
                <div className="flex items-center gap-1 glass-soft rounded-lg p-0.5" role="group" aria-label="Publish mode">
                  <button
                    onClick={() => setPublishLive(true)}
                    disabled={running}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      publishLive ? "glass-strong text-primary" : "text-muted hover:text-primary"
                    }`}
                  >
                    Publish live
                  </button>
                  <button
                    onClick={() => setPublishLive(false)}
                    disabled={running}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      !publishLive ? "glass-strong text-primary" : "text-muted hover:text-primary"
                    }`}
                  >
                    Drafts
                  </button>
                </div>
                {/* Post date: now or backdated */}
                <div className="flex items-center gap-1 glass-soft rounded-lg p-0.5" role="group" aria-label="Post date">
                  {[
                    { d: 0, label: "Today" },
                    { d: 1, label: "Yesterday" },
                    { d: 2, label: "2 days ago" },
                  ].map((o) => (
                    <button
                      key={o.d}
                      onClick={() => setBackdateDays(o.d)}
                      disabled={running}
                      title={o.d === 0 ? "Date posts now" : `Date posts ${o.d} day${o.d === 1 ? "" : "s"} back (same time of day)`}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        backdateDays === o.d ? "glass-strong text-primary" : "text-muted hover:text-primary"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted">
                  {selected.size} selected
                </p>
              </div>
            </div>

            {/* Search + topic filters */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by title, summary, subject…"
                  className="glass-input w-full rounded-xl pl-9 pr-9 py-2 text-sm"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={runPipeline}
                disabled={running || selected.size === 0}
                className="glass-btn flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shrink-0"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {publishLive ? "Publish live" : "Save drafts"}
                {backdateDays > 0 && ` · ${backdateDays === 1 ? "yesterday" : `${backdateDays}d ago`}`} ({selected.size})
              </button>
            </div>

            {allTopics.length > 0 && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-muted" />
                {allTopics.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTopic(t)}
                    className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                      activeTopics.has(t)
                        ? "text-primary glass-strong"
                        : "text-muted glass-soft hover:text-primary"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {activeTopics.size > 0 && (
                  <button
                    onClick={() => setActiveTopics(new Set())}
                    className="text-[10px] text-faint hover:text-primary"
                  >
                    clear
                  </button>
                )}
              </div>
            )}

            {/* Article cards */}
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {filtered.map((a) => (
                <ArticleRow
                  key={a.url}
                  analysis={a}
                  checked={selected.has(a.url)}
                  onToggle={() => toggleSelected(a.url)}
                  disabled={running}
                />
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted text-center py-6">No articles match the filter.</p>
              )}
            </div>
          </GlassCard>
        )}

        {analyses && analyses.length === 0 && !analyzing && (
          <GlassCard className="p-6 text-center">
            <p className="text-sm text-muted">No articles could be scraped from those URLs.</p>
          </GlassCard>
        )}

        {/* Step 3: Run */}
        {items.length > 0 && (
          <div>
            {(() => {
              const counts = items.reduce(
                (acc, it) => {
                  if (it.step === "done") acc.done++;
                  else if (it.step === "error") acc.failed++;
                  else if (it.step !== "queued") acc.running++;
                  else acc.queued++;
                  return acc;
                },
                { done: 0, failed: 0, running: 0, queued: 0 }
              );
              const finished = counts.done + counts.failed;
              const progressPct = items.length === 0 ? 0 : Math.round((finished / items.length) * 100);
              return (
                <GlassCard className="p-4 sm:p-5 mb-3">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                        Step 3 · Publishing
                      </p>
                      <StatPill icon={<CheckCircle2 className="w-3 h-3 text-emerald-500" />} value={counts.done} label="done" />
                      {counts.failed > 0 && (
                        <StatPill icon={<XCircle className="w-3 h-3 text-red-500" />} value={counts.failed} label="failed" tone="red" />
                      )}
                      {(counts.running > 0 || counts.queued > 0) && (
                        <StatPill
                          icon={<Loader2 className={`w-3 h-3 text-muted ${counts.running > 0 ? "animate-spin" : ""}`} />}
                          value={counts.running + counts.queued}
                          label="left"
                        />
                      )}
                      <span className="text-[11px] text-faint">
                        {finished}/{items.length} · {progressPct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {summaryEntries.length > 0 && (
                        <button
                          onClick={() => setShowSummary((s) => !s)}
                          className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${
                            showSummary ? "glass-strong text-primary" : "glass-btn"
                          }`}
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          Summary ({summaryEntries.length})
                        </button>
                      )}
                      {counts.failed > 0 && !running && (
                        <button
                          onClick={retryFailed}
                          className="glass-btn flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Retry failed ({counts.failed})
                        </button>
                      )}
                      {running && (
                        <button
                          onClick={stop}
                          className="glass-btn-ghost flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Stop
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 glass-soft rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${progressPct}%`,
                        background:
                          counts.failed === 0
                            ? "var(--accent)"
                            : "linear-gradient(to right, var(--accent), #f59e0b)",
                      }}
                    />
                  </div>
                </GlassCard>
              );
            })()}

            {/* Posted summary — title + link for everything published */}
            {showSummary && summaryEntries.length > 0 && (
              <GlassCard className="p-4 sm:p-5 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Posted summary · {summaryEntries.length}
                  </p>
                  <button
                    onClick={copySummary}
                    className="glass-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  >
                    {copiedSummary ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedSummary ? "Copied" : "Copy all"}
                  </button>
                </div>
                <div className="space-y-2">
                  {summaryEntries.map((e, i) => (
                    <div key={`${e.url}-${i}`} className="glass-soft rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                          {e.pub}
                        </span>
                        <span className="text-[10px] text-faint truncate">{e.site}</span>
                      </div>
                      <p
                        className="text-sm text-primary leading-snug"
                        dir={e.rtl ? "rtl" : undefined}
                      >
                        {e.title || "(no title)"}
                      </p>
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted hover:text-primary break-all"
                      >
                        <Link2 className="w-3 h-3 shrink-0" />
                        {e.url}
                      </a>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Target sites + config warnings */}
            {(pipelineInfo || pipelineWarnings.length > 0) && (
              <div className="mb-3 space-y-2">
                {pipelineInfo && (
                  <div className="glass-soft rounded-xl px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-muted" />
                      <span className="text-muted">Dhivehi →</span>
                      <span className={pipelineInfo.dvSite ? "text-primary font-medium" : "text-red-500"}>
                        {pipelineInfo.dvSite || "not configured"}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <PenLine className="w-3.5 h-3.5 text-muted" />
                      <span className="text-muted">English →</span>
                      <span className={pipelineInfo.enSite ? "text-primary font-medium" : "text-red-500"}>
                        {pipelineInfo.enSite || "not configured"}
                      </span>
                    </span>
                  </div>
                )}
                {pipelineWarnings.map((w, i) => (
                  <div
                    key={i}
                    className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-600 flex items-start gap-2"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {items.map((it, i) => (
                <RunRow
                  key={`${it.url}-${i}`}
                  item={it}
                  onRetry={running ? undefined : () => retryOne(it.url)}
                />
              ))}
            </div>
            {error && (
              <GlassCard className="p-4 mt-4">
                <p className="text-sm text-red-500">{error}</p>
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleRow({
  analysis,
  checked,
  onToggle,
  disabled,
}: {
  analysis: Analysis;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`glass-soft rounded-2xl p-3 sm:p-4 flex items-start gap-3 ${
        checked ? "ring-2" : ""
      } ${disabled ? "opacity-60" : ""}`}
      style={checked ? { boxShadow: "0 0 0 2px var(--accent)" } : undefined}
    >
      <button
        onClick={onToggle}
        disabled={disabled}
        className="p-0.5 mt-0.5 shrink-0"
        aria-label={checked ? "Deselect" : "Select"}
      >
        {checked ? (
          <CheckSquare className="w-4 h-4" style={{ color: "var(--accent)" }} />
        ) : (
          <Square className="w-4 h-4 text-muted" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary leading-snug">{analysis.title}</p>
        <p className="text-[11px] text-faint mt-0.5 flex items-center gap-1">
          <ExternalLink className="w-2.5 h-2.5" />
          <a href={analysis.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {analysis.source}
          </a>
          {analysis.publishedAt && <> · {new Date(analysis.publishedAt).toLocaleDateString()}</>}
        </p>
        {analysis.summary && (
          <p className="text-xs text-secondary mt-2 leading-relaxed">{analysis.summary}</p>
        )}
        {(analysis.topics.length > 0 || analysis.subjects.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {analysis.topics.map((t, i) => (
              <span
                key={`t${i}`}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-muted"
                style={{ background: "var(--accent-soft)" }}
              >
                {t}
              </span>
            ))}
            {analysis.subjects.map((s, i) => (
              <span
                key={`s${i}`}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{
                  background:
                    s.tone === "positive"
                      ? "rgba(16, 185, 129, 0.15)"
                      : s.tone === "negative"
                      ? "rgba(239, 68, 68, 0.15)"
                      : "var(--accent-soft)",
                  color:
                    s.tone === "positive"
                      ? "#10b981"
                      : s.tone === "negative"
                      ? "#ef4444"
                      : "var(--text-muted)",
                }}
                title={`Source's tone on ${s.subject}: ${s.tone}`}
              >
                {s.subject}
                {s.tone !== "neutral" && <span className="opacity-75">·{s.tone === "positive" ? "+" : "−"}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone?: "red";
}) {
  return (
    <span
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium glass-soft ${
        tone === "red" ? "text-red-500" : "text-primary"
      }`}
    >
      {icon}
      <span>{value}</span>
      <span className="text-faint font-normal">{label}</span>
    </span>
  );
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r === 0 ? `${m}m` : `${m}m${r}s`;
}

function RunRow({
  item,
  onRetry,
}: {
  item: ItemState;
  onRetry?: () => void;
}) {
  const isError = item.step === "error";
  const isDone = item.step === "done";
  const isWorking = !isDone && !isError && item.step !== "queued";
  const accent = isError ? "#ef4444" : isDone ? "#10b981" : isWorking ? "var(--accent)" : "var(--glass-border)";
  const duration =
    item.startedAt && item.finishedAt ? item.finishedAt - item.startedAt : null;

  return (
    <GlassCard className="p-4 sm:p-5 relative overflow-hidden">
      {/* Colored side-bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: accent }}
      />
      <div className="flex items-start gap-3 pl-2">
        <div className="shrink-0 mt-0.5">
          {isError ? (
            <XCircle className="w-5 h-5 text-red-500" />
          ) : isDone ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : isWorking ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-[var(--glass-border)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium text-primary truncate flex-1 min-w-0">
              {item.title}
            </p>
            {item.attempts > 1 && (
              <span className="text-[10px] text-faint shrink-0">
                attempt {item.attempts}
              </span>
            )}
          </div>
          <p className="text-[11px] text-faint truncate flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {hostOf(item.url)}
            </a>
            {duration !== null && <span className="ml-2">· {fmtDuration(duration)}</span>}
          </p>
          <p
            className="text-xs mt-2"
            style={{ color: isError ? "#ef4444" : isDone ? "#10b981" : "var(--text-muted)" }}
          >
            {STEP_LABEL[item.step]}
          </p>
          {(item.dv || item.en) && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {item.dv && (
                <Outcome
                  label="Dhivehi"
                  icon={<Languages className="w-3.5 h-3.5" />}
                  outcome={item.dv}
                  rtl
                />
              )}
              {item.en && (
                <Outcome
                  label="English"
                  icon={<PenLine className="w-3.5 h-3.5" />}
                  outcome={item.en}
                />
              )}
            </div>
          )}
          {isError && onRetry && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={onRetry}
                className="glass-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
              {(item.dv?.error || item.en?.error) && (
                <button
                  onClick={() => {
                    const msg = [item.dv?.error, item.en?.error].filter(Boolean).join("\n");
                    navigator.clipboard.writeText(msg);
                  }}
                  className="glass-btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  title="Copy error"
                >
                  <Copy className="w-3 h-3" />
                  Copy error
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function Outcome({
  label,
  icon,
  outcome,
  rtl,
}: {
  label: string;
  icon: React.ReactNode;
  outcome: { title: string; site: string; editUrl?: string; postUrl?: string; error?: string };
  rtl?: boolean;
}) {
  return (
    <div className="glass-soft rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
          {icon}
          {label}
        </span>
        <span className="text-[10px] text-faint truncate">{outcome.site}</span>
      </div>
      {outcome.error ? (
        <p className="text-xs text-red-500">{outcome.error}</p>
      ) : (
        <>
          <p className="text-xs text-primary truncate" dir={rtl ? "rtl" : undefined}>
            {outcome.title || "(no title)"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {outcome.editUrl && (
              <a
                href={outcome.editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-btn flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
              >
                <Send className="w-3 h-3" />
                Edit in WP
              </a>
            )}
            {outcome.postUrl && (
              <a
                href={outcome.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-muted hover:text-primary"
              >
                <ExternalLink className="w-3 h-3" />
                Preview
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
