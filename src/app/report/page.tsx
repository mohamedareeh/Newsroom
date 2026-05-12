"use client";

// ─── Daily Report Page ─────────────────────────────────────
// Shows every article auto-published through the pipeline for a
// given date (defaults to today, UTC). Filterable by language and
// downloadable as Markdown.

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  Loader2,
  ExternalLink,
  Languages,
  PenLine,
  Download,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";

interface PublicationRecord {
  id: string;
  sourceUrl: string;
  sourceTitle?: string;
  sourceDate?: string;
  publishedAt: number;
  dv?: {
    title: string;
    site: string;
    postId?: number;
    postUrl?: string;
    editUrl?: string;
    error?: string;
  };
  en?: {
    title: string;
    site: string;
    postId?: number;
    postUrl?: string;
    editUrl?: string;
    error?: string;
  };
}

function todayUTCString(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(d: string, days: number): string {
  const t = new Date(d + "T00:00:00Z").getTime() + days * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export default function ReportPage() {
  const [date, setDate] = useState<string>(todayUTCString());
  const [filter, setFilter] = useState<"all" | "dv" | "en" | "errors">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<PublicationRecord[]>([]);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/publication-log?date=${encodeURIComponent(d)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filter === "all") return true;
      if (filter === "dv") return !!r.dv && !r.dv.error;
      if (filter === "en") return !!r.en && !r.en.error;
      if (filter === "errors") return r.dv?.error || r.en?.error;
      return true;
    });
  }, [records, filter]);

  const stats = useMemo(() => {
    let dvOk = 0, dvErr = 0, enOk = 0, enErr = 0;
    const sources = new Map<string, number>();
    for (const r of records) {
      if (r.dv) (r.dv.error ? dvErr++ : dvOk++);
      if (r.en) (r.en.error ? enErr++ : enOk++);
      try {
        const host = new URL(r.sourceUrl).hostname.replace(/^www\./, "");
        sources.set(host, (sources.get(host) || 0) + 1);
      } catch {}
    }
    const topSources = Array.from(sources.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { dvOk, dvErr, enOk, enErr, total: records.length, topSources };
  }, [records]);

  const exportMarkdown = useCallback(() => {
    const lines: string[] = [];
    lines.push(`# Newsroom Daily Report — ${date}`);
    lines.push("");
    lines.push(
      `Published ${stats.total} source article${stats.total === 1 ? "" : "s"} — ${stats.dvOk} Dhivehi drafts on dhen.mv, ${stats.enOk} English drafts on maldivesinsight.com.`
    );
    if (stats.dvErr || stats.enErr) {
      lines.push(`Failures: ${stats.dvErr} Dhivehi, ${stats.enErr} English.`);
    }
    lines.push("");
    if (stats.topSources.length > 0) {
      lines.push("## Sources");
      for (const [host, count] of stats.topSources) {
        lines.push(`- ${host} — ${count} article${count === 1 ? "" : "s"}`);
      }
      lines.push("");
    }
    lines.push("## Articles");
    for (const r of records) {
      lines.push(`### ${r.sourceTitle || r.sourceUrl}`);
      lines.push(`- Source: ${r.sourceUrl}`);
      if (r.sourceDate) lines.push(`- Source date: ${r.sourceDate}`);
      lines.push(`- Published at: ${new Date(r.publishedAt).toLocaleString()}`);
      if (r.dv) {
        lines.push(
          r.dv.error
            ? `- Dhivehi (${r.dv.site}): FAILED — ${r.dv.error}`
            : `- Dhivehi (${r.dv.site}): "${r.dv.title}" — ${r.dv.editUrl || r.dv.postUrl || ""}`
        );
      }
      if (r.en) {
        lines.push(
          r.en.error
            ? `- English (${r.en.site}): FAILED — ${r.en.error}`
            : `- English (${r.en.site}): "${r.en.title}" — ${r.en.editUrl || r.en.postUrl || ""}`
        );
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsroom-report-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [date, records, stats]);

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Daily Report
          </h2>
          <p className="text-sm text-muted mt-1">
            Everything auto-published through the multi-publish pipeline (drafts on both sites).
          </p>
        </div>

        {/* Date picker */}
        <GlassCard className="p-4 sm:p-5 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setDate((d) => shiftDate(d, -1))}
              className="glass-btn-ghost px-3 py-2 rounded-xl text-xs font-medium"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <Calendar className="w-4 h-4 text-muted" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="glass-input rounded-xl px-3 py-2 text-sm flex-1 min-w-0"
              />
            </div>
            <button
              onClick={() => setDate((d) => shiftDate(d, +1))}
              disabled={date >= todayUTCString()}
              className="glass-btn-ghost px-3 py-2 rounded-xl text-xs font-medium"
            >
              Next →
            </button>
            <button
              onClick={() => load(date)}
              className="glass-btn-ghost p-2 rounded-xl"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={exportMarkdown}
              disabled={records.length === 0}
              className="glass-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </GlassCard>

        {/* Stats */}
        <GlassCard className="p-4 sm:p-5 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Source Articles" value={stats.total} />
            <Stat label="Dhivehi (dhen.mv)" value={`${stats.dvOk}${stats.dvErr ? ` (${stats.dvErr} ✗)` : ""}`} />
            <Stat label="English (insight)" value={`${stats.enOk}${stats.enErr ? ` (${stats.enErr} ✗)` : ""}`} />
            <Stat label="Top Source" value={stats.topSources[0] ? `${stats.topSources[0][0]} (${stats.topSources[0][1]})` : "—"} />
          </div>
        </GlassCard>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1 p-1 glass-soft rounded-xl mb-4 w-fit">
          {(["all", "dv", "en", "errors"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f ? "shadow-sm" : "text-muted hover:text-primary"
              }`}
              style={
                filter === f
                  ? { background: "var(--glass-bg-strong)", color: "var(--text-primary)" }
                  : undefined
              }
            >
              {f === "all" ? "All" : f === "dv" ? "Dhivehi" : f === "en" ? "English" : "Errors"}
            </button>
          ))}
        </div>

        {error && (
          <GlassCard className="p-4 mb-4">
            <p className="text-sm text-red-500">{error}</p>
          </GlassCard>
        )}

        {loading && filtered.length === 0 && (
          <GlassCard className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </GlassCard>
        )}

        {!loading && filtered.length === 0 && !error && (
          <GlassCard className="p-8 text-center">
            <p className="text-sm text-muted">
              No publications recorded for {date}.
            </p>
          </GlassCard>
        )}

        <div className="space-y-3">
          {filtered.map((r) => (
            <Row key={r.id} record={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="glass-soft rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
      <p className="text-lg font-bold text-primary mt-0.5 truncate">{value}</p>
    </div>
  );
}

function Row({ record }: { record: PublicationRecord }) {
  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="mb-2">
        <a
          href={record.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline truncate flex items-center gap-1"
        >
          <ExternalLink className="w-3.5 h-3.5 text-muted shrink-0" />
          <span className="truncate">{record.sourceTitle || record.sourceUrl}</span>
        </a>
        <p className="text-[11px] text-faint mt-0.5">
          {hostOf(record.sourceUrl)}
          {" · published "}
          {new Date(record.publishedAt).toLocaleString()}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {record.dv && (
          <PublishCell
            language="Dhivehi"
            icon={<Languages className="w-3.5 h-3.5" />}
            site={record.dv.site}
            title={record.dv.title}
            editUrl={record.dv.editUrl}
            postUrl={record.dv.postUrl}
            error={record.dv.error}
            rtl
          />
        )}
        {record.en && (
          <PublishCell
            language="English"
            icon={<PenLine className="w-3.5 h-3.5" />}
            site={record.en.site}
            title={record.en.title}
            editUrl={record.en.editUrl}
            postUrl={record.en.postUrl}
            error={record.en.error}
          />
        )}
      </div>
    </GlassCard>
  );
}

function PublishCell({
  language,
  icon,
  site,
  title,
  editUrl,
  postUrl,
  error,
  rtl,
}: {
  language: string;
  icon: React.ReactNode;
  site: string;
  title: string;
  editUrl?: string;
  postUrl?: string;
  error?: string;
  rtl?: boolean;
}) {
  return (
    <div className="glass-soft rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
          {icon}
          {language}
        </span>
        {error ? (
          <XCircle className="w-3.5 h-3.5 text-red-500" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        )}
      </div>
      <p className="text-[10px] text-faint mb-1.5">{site}</p>
      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <>
          <p className="text-xs text-primary truncate" dir={rtl ? "rtl" : undefined}>
            {title || "(no title)"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {editUrl && (
              <a
                href={editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline"
              >
                Edit draft
              </a>
            )}
            {postUrl && (
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-muted hover:text-primary"
              >
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
