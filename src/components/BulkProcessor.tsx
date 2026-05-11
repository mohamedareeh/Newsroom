"use client";

// ─── Bulk Article Processor ─────────────────────────────────
// Fires N parallel /api/process streams for a list of URLs and
// shows per-item progress. When each one completes, the user can
// Open it in /article, Copy the body, or just dismiss.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  X,
  Sparkles,
} from "lucide-react";

interface JobSettings {
  paraphrasingLevel: "light" | "heavy";
  tone: "formal" | "casual" | "sensational";
  length: "match" | "summary";
}

interface JobItem {
  url: string;
  state: "queued" | "running" | "done" | "error";
  title?: string;
  originalTitle?: string;
  text: string;
  error?: string;
}

interface Props {
  urls: string[];
  settings: JobSettings;
  onClose: () => void;
}

const CONCURRENCY = 2; // be polite to the upstream

function parseTitleFromOutput(raw: string): string | undefined {
  const m = raw.match(/TITLE:\s*([\s\S]*?)(?=\n|$)/i);
  return m?.[1]?.trim();
}

export default function BulkProcessor({ urls, settings, onClose }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobItem[]>(() =>
    urls.map((u) => ({ url: u, state: "queued", text: "" }))
  );
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    let active = 0;
    let nextIdx = 0;

    const runOne = async (idx: number) => {
      active++;
      setJobs((prev) => prev.map((j, i) => (i === idx ? { ...j, state: "running" } : j)));
      try {
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: urls[idx],
            paraphrasingLevel: settings.paraphrasingLevel,
            tone: settings.tone,
            length: settings.length,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");

        const decoder = new TextDecoder();
        let full = "";
        let originalTitle: string | undefined;

        while (!cancelledRef.current) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.decode(value, { stream: true }).split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "meta") {
                originalTitle = payload.originalTitle;
              } else if (payload.type === "chunk") {
                full += payload.text;
              } else if (payload.type === "error") {
                throw new Error(payload.error || "Stream error");
              }
            } catch {}
          }
        }

        if (cancelledRef.current) return;
        const title = parseTitleFromOutput(full) || originalTitle;
        setJobs((prev) =>
          prev.map((j, i) =>
            i === idx ? { ...j, state: "done", text: full, title, originalTitle } : j
          )
        );
      } catch (err) {
        if (cancelledRef.current) return;
        setJobs((prev) =>
          prev.map((j, i) =>
            i === idx
              ? { ...j, state: "error", error: err instanceof Error ? err.message : "Failed" }
              : j
          )
        );
      } finally {
        active--;
        scheduleMore();
      }
    };

    const scheduleMore = () => {
      while (active < CONCURRENCY && nextIdx < urls.length) {
        runOne(nextIdx++);
      }
    };

    scheduleMore();
    // cleanup just sets the flag
    return () => {
      cancelledRef.current = true;
    };
  }, [urls, settings]);

  const total = jobs.length;
  const done = jobs.filter((j) => j.state === "done").length;
  const errored = jobs.filter((j) => j.state === "error").length;
  const allFinished = done + errored === total;

  const openInEditor = (j: JobItem) => {
    sessionStorage.setItem(
      "articleResult",
      JSON.stringify({
        originalTitle: j.originalTitle || j.title || "Article",
        originalLength: j.text.length,
        rewrittenText: j.text,
        sourceUrl: j.url,
        processedAt: new Date().toISOString(),
      })
    );
    sessionStorage.removeItem("articleRequest");
    router.push("/article");
  };

  const copy = async (idx: number, text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="glass-strong rounded-2xl p-4 sm:p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Bulk processing
          </p>
          <p className="text-xs text-muted mt-0.5">
            {done}/{total} done{errored > 0 ? ` · ${errored} failed` : ""}
            {!allFinished && " — running in parallel"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="glass-btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
        >
          <X className="w-3.5 h-3.5" />
          {allFinished ? "Close" : "Hide"}
        </button>
      </div>

      <div className="w-full glass-soft rounded-full h-1.5 mb-4 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{
            width: `${total === 0 ? 0 : Math.round(((done + errored) / total) * 100)}%`,
            background: "var(--accent)",
          }}
        />
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {jobs.map((j, i) => (
          <div key={j.url} className="glass-soft rounded-xl p-3 flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              {j.state === "queued" && <div className="w-4 h-4 rounded-full bg-[var(--glass-border)]" />}
              {j.state === "running" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              {j.state === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {j.state === "error" && <XCircle className="w-4 h-4 text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-primary truncate" dir="rtl">
                {j.title || j.originalTitle || hostOf(j.url)}
              </p>
              <p className="text-[11px] text-faint truncate flex items-center gap-1">
                <ExternalLink className="w-2.5 h-2.5" />
                {hostOf(j.url)}
                {j.state === "error" && j.error && (
                  <span className="ml-2 text-red-500 truncate">· {j.error}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {j.state === "done" && (
                <>
                  <button
                    onClick={() => copy(i, j.text)}
                    className="p-1.5 text-muted hover:text-primary rounded-lg"
                    title="Copy raw output"
                  >
                    {copiedIdx === i ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => openInEditor(j)}
                    className="glass-btn flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                  >
                    Open
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}
