"use client";

// ─── Pipeline News Panel ──────────────────────────────────
// "News through Publish": every article made by the multi-publish
// pipeline (from the publication log), with its Dhen and Maldives
// Insight links. Today / Yesterday / Last 7 days, Maldives time.

import { useState, useEffect, useCallback, useMemo } from "react";
import { Newspaper, Loader2, RefreshCw, Copy, Check, Link2, AlertCircle, History, X } from "lucide-react";
import GlassCard from "@/components/GlassCard";

interface Outcome {
  title: string;
  site: string;
  postUrl?: string;
  editUrl?: string;
  error?: string;
}

interface PublicationRecord {
  id: string;
  sourceUrl: string;
  sourceTitle?: string;
  publishedAt: number;
  backdatedTo?: string;
  dv?: Outcome;
  en?: Outcome;
}

type Range = "today" | "yesterday" | "week";

const MV_OFFSET_MS = 5 * 60 * 60 * 1000; // Maldives is UTC+5
const DAY = 86400_000;

/** Epoch ms of 00:00 Maldives time, `daysBack` days ago. */
function mvMidnight(daysBack: number): number {
  const mvNow = Date.now() + MV_OFFSET_MS;
  return Math.floor(mvNow / DAY) * DAY - daysBack * DAY - MV_OFFSET_MS;
}

function rangeBounds(r: Range): [number, number] {
  if (r === "today") return [mvMidnight(0), Date.now() + 60_000];
  if (r === "yesterday") return [mvMidnight(1), mvMidnight(0)];
  return [mvMidnight(6), Date.now() + 60_000];
}

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function mvTime(t: number, withDate: boolean): string {
  const iso = new Date(t + MV_OFFSET_MS).toISOString();
  return withDate ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : iso.slice(11, 16);
}

const linkOf = (o?: Outcome) => (o && !o.error ? o.postUrl || o.editUrl : undefined);

export default function PipelineNewsPanel({ onClose, refreshKey = 0 }: { onClose: () => void; refreshKey?: number }) {
  const [range, setRange] = useState<Range>("today");
  const [records, setRecords] = useState<PublicationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    setError("");
    try {
      const [from, to] = rangeBounds(r);
      // Log is keyed by UTC day; fetch the covering UTC days, then trim to Maldives-day bounds.
      const res = await fetch(`/api/publication-log?start=${utcDay(from)}&end=${utcDay(to)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      const all: PublicationRecord[] = (json.days || []).flatMap(
        (d: { records: PublicationRecord[] }) => d.records || []
      );
      setRecords(
        all
          .filter((x) => x.publishedAt >= from && x.publishedAt < to)
          .filter((x) => linkOf(x.dv) || linkOf(x.en))
          .sort((a, b) => b.publishedAt - a.publishedAt)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, refreshKey, load]);

  const counts = useMemo(() => {
    let dv = 0, en = 0;
    for (const r of records) {
      if (linkOf(r.dv)) dv++;
      if (linkOf(r.en)) en++;
    }
    return { dv, en };
  }, [records]);

  const copyText = useMemo(() => {
    const dv = records.filter((r) => linkOf(r.dv));
    const en = records.filter((r) => linkOf(r.en));
    const parts: string[] = [];
    if (dv.length) parts.push(`Dhen\n${dv.map((r) => `• ${r.dv!.title}\n  ${linkOf(r.dv)}`).join("\n")}`);
    if (en.length) parts.push(`Maldives Insight\n${en.map((r) => `• ${r.en!.title}\n  ${linkOf(r.en)}`).join("\n")}`);
    return parts.join("\n\n");
  }, [records]);

  const copy = useCallback(async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* ignore */}
  }, [copyText]);

  const RANGES: { r: Range; label: string }[] = [
    { r: "today", label: "Today" },
    { r: "yesterday", label: "Yesterday" },
    { r: "week", label: "7 days" },
  ];

  return (
    <GlassCard className="p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Newspaper className="w-3.5 h-3.5" />
          News through Publish
          {!loading && (
            <span className="text-faint normal-case font-normal">
              · {records.length} stories · Dhen {counts.dv} · MI {counts.en}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 glass-soft rounded-lg p-0.5" role="group" aria-label="Range">
            {RANGES.map((o) => (
              <button
                key={o.r}
                onClick={() => setRange(o.r)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  range === o.r ? "glass-strong text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={copy}
            disabled={!copyText}
            className="glass-btn flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy all"}
          </button>
          <button onClick={() => load(range)} disabled={loading} className="p-1.5 text-muted hover:text-primary rounded-lg" title="Refresh">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-primary rounded-lg" title="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-600 flex items-start gap-2 mb-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <p className="text-sm text-muted text-center py-4">Nothing published through the pipeline in this period.</p>
      )}

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {records.map((r) => (
          <div key={r.id} className="glass-soft rounded-xl p-3">
            <div className="flex items-center gap-2 text-[10px] text-faint mb-1.5 flex-wrap">
              <span className="tabular-nums">{mvTime(r.publishedAt, range === "week")}</span>
              {r.backdatedTo && (
                <span className="inline-flex items-center gap-0.5" title="Post date on the site">
                  <History className="w-3 h-3" />
                  dated {mvTime(Date.parse(r.backdatedTo), true)}
                </span>
              )}
              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                source
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(["dv", "en"] as const).map((k) => {
                const o = r[k];
                const url = linkOf(o);
                if (!o || !url) return null;
                return (
                  <div key={k} className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      {k === "dv" ? "Dhen" : "Maldives Insight"}
                    </span>
                    <p className="text-sm text-primary leading-snug" dir={k === "dv" ? "rtl" : undefined}>
                      {o.title || "(no title)"}
                    </p>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted hover:text-primary break-all"
                    >
                      <Link2 className="w-3 h-3 shrink-0" />
                      {url}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
