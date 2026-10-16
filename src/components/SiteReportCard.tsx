"use client";

// ─── Site Report Card ─────────────────────────────────────
// Small daily report of what went live on Dhen and Maldives Insight,
// pulled from each site's WordPress API. Shown on the Publish page.

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  History,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";

interface ReportPost {
  id: number;
  title: string;
  link: string;
  date: string;
  categories: string[];
}

interface SiteReport {
  key: "dv" | "en";
  name: string;
  site: string | null;
  posts: ReportPost[];
  error?: string;
}

interface ReportData {
  date: string;
  sites: SiteReport[];
  backdated: { dv: number; en: number };
}

const MV_OFFSET_MS = 5 * 60 * 60 * 1000; // Maldives is UTC+5

function maldivesDate(daysBack = 0): string {
  return new Date(Date.now() + MV_OFFSET_MS - daysBack * 86400_000).toISOString().slice(0, 10);
}

function timeOf(localDate: string): string {
  return localDate.slice(11, 16);
}

function categoryCounts(posts: ReportPost[]): [string, number][] {
  const m = new Map<string, number>();
  for (const p of posts) {
    const cats = p.categories.length ? p.categories : ["Uncategorized"];
    for (const c of cats) m.set(c, (m.get(c) || 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

export default function SiteReportCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [day, setDay] = useState<0 | 1>(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const date = maldivesDate(day);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/site-report?date=${d}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, refreshKey, load]);

  const total = useMemo(
    () => (data ? data.sites.reduce((n, s) => n + s.posts.length, 0) : 0),
    [data]
  );

  const reportText = useMemo(() => {
    if (!data) return "";
    const lines = [`Published on ${data.date}: ${total} post${total === 1 ? "" : "s"}`];
    for (const s of data.sites) {
      lines.push("");
      lines.push(`${s.name}: ${s.posts.length}`);
      const cats = categoryCounts(s.posts);
      if (cats.length) lines.push(cats.map(([c, n]) => `${c} ${n}`).join(" · "));
      for (const p of s.posts) lines.push(`• ${timeOf(p.date)} ${p.title}\n  ${p.link}`);
      const bd = data.backdated[s.key];
      if (bd > 0) lines.push(`(+${bd} World News posted today, backdated)`);
    }
    return lines.join("\n");
  }, [data, total]);

  const copy = useCallback(async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* ignore */}
  }, [reportText]);

  return (
    <GlassCard className="p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Published {day === 0 ? "today" : "yesterday"}
          {data && !loading && <span className="text-faint normal-case font-normal">· {total} posts</span>}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 glass-soft rounded-lg p-0.5" role="group" aria-label="Report day">
            {([0, 1] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  day === d ? "glass-strong text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {d === 0 ? "Today" : "Yesterday"}
              </button>
            ))}
          </div>
          <button
            onClick={copy}
            disabled={!data || loading}
            className="glass-btn flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50"
            title="Copy report"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => load(date)}
            disabled={loading}
            className="p-1.5 text-muted hover:text-primary rounded-lg"
            title="Refresh"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-600 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!data && loading && <p className="text-xs text-muted py-2">Loading…</p>}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.sites.map((s) => {
            const cats = categoryCounts(s.posts);
            const isOpen = !!open[s.key];
            const bd = data.backdated[s.key];
            return (
              <div key={s.key} className="glass-soft rounded-xl p-3 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{s.name}</span>
                  <span className="text-[10px] text-faint truncate">{s.site || "not configured"}</span>
                </div>
                {s.error ? (
                  <p className="text-xs text-red-500 mt-1">{s.error}</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-primary mt-1 leading-none">{s.posts.length}</p>
                    {cats.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {cats.map(([c, n]) => (
                          <span
                            key={c}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-muted"
                            style={{ background: "var(--accent-soft)" }}
                          >
                            {c} {n}
                          </span>
                        ))}
                      </div>
                    )}
                    {bd > 0 && (
                      <p className="text-[10px] text-faint mt-2 flex items-center gap-1">
                        <History className="w-3 h-3" />
                        +{bd} World News posted {day === 0 ? "today" : "that day"}, backdated
                      </p>
                    )}
                    {s.posts.length > 0 && (
                      <>
                        <button
                          onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}
                          className="mt-2 flex items-center gap-1 text-[11px] text-muted hover:text-primary"
                        >
                          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isOpen ? "Hide" : "Show"} posts
                        </button>
                        {isOpen && (
                          <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
                            {s.posts.map((p) => (
                              <li key={p.id} className="text-xs flex items-start gap-2">
                                <span className="text-faint tabular-nums shrink-0">{timeOf(p.date)}</span>
                                <a
                                  href={p.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline leading-snug min-w-0 flex-1"
                                  dir={s.key === "dv" ? "rtl" : undefined}
                                >
                                  {p.title}
                                </a>
                                <ExternalLink className="w-3 h-3 text-faint shrink-0 mt-0.5" />
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
