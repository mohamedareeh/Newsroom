"use client";

// ─── Research Page ─────────────────────────────────────────
// Search the web for people, places, or events. Uses Gemini with
// Google Search grounding to produce a sourced briefing with
// citation links. Recent queries are kept in localStorage.

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Loader2,
  ExternalLink,
  AlertCircle,
  Copy,
  Check,
  ClockIcon,
  Trash2,
  Sparkles,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";
import GlassSelect from "@/components/GlassSelect";

interface Citation {
  title?: string;
  uri: string;
}

interface HistoryEntry {
  q: string;
  ts: number;
}

const HISTORY_KEY = "cn-research-history";

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(items: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
  } catch {}
}

export default function ResearchPage() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"en" | "dv">("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [warning, setWarning] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(readHistory());
    inputRef.current?.focus();
  }, []);

  const search = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text || loading) return;
      setLoading(true);
      setError("");
      setWarning("");
      setAnswer("");
      setCitations([]);

      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, language }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        setAnswer(data.answer || "");
        setCitations(Array.isArray(data.citations) ? data.citations : []);
        if (data.warning) setWarning(data.warning);

        // Save to history
        const next = [{ q: text, ts: Date.now() }, ...readHistory().filter((h) => h.q !== text)];
        writeHistory(next);
        setHistory(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Research failed");
      } finally {
        setLoading(false);
      }
    },
    [loading, language]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const copy = useCallback(async () => {
    if (!answer) return;
    const text =
      answer +
      (citations.length
        ? "\n\nSources:\n" + citations.map((c) => `- ${c.title || c.uri} (${c.uri})`).join("\n")
        : "");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [answer, citations]);

  const clearHistory = useCallback(() => {
    writeHistory([]);
    setHistory([]);
  }, []);

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight flex items-center gap-2">
            <Search className="w-6 h-6" />
            Research
          </h2>
          <p className="text-sm text-muted mt-1">
            Live web search via AI — get a sourced briefing on a person, place, or event.
          </p>
        </div>

        {/* Search bar */}
        <GlassCard className="p-4 sm:p-5 mb-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Who or what would you like to research?"
                className="glass-input w-full rounded-xl pl-10 pr-3 py-3 text-sm"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="sm:max-w-[200px]">
                <GlassSelect
                  label="Answer Language"
                  value={language}
                  onChange={(v) => setLanguage(v as "en" | "dv")}
                  options={[
                    { label: "English", value: "en" },
                    { label: "Dhivehi", value: "dv" },
                  ]}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="glass-btn flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium sm:ml-auto"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {loading ? "Researching…" : "Research"}
              </button>
            </div>
          </form>
        </GlassCard>

        {/* Error */}
        {error && (
          <GlassCard className="p-4 mb-4 animate-fade-in">
            <div className="flex items-start gap-3 text-red-600">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Research Failed</p>
                <p className="text-sm text-red-500 mt-1">{error}</p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Warning */}
        {warning && (
          <GlassCard className="p-3 mb-4 animate-fade-in">
            <p className="text-xs text-muted">{warning}</p>
          </GlassCard>
        )}

        {/* Answer */}
        {answer && (
          <GlassCard className="overflow-hidden mb-4 animate-fade-in">
            <div className="h-1" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                  <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                  Briefing
                </p>
                <button
                  onClick={copy}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted hover:text-primary rounded-lg transition-all"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div
                className={`glass-soft rounded-xl p-5 ${language === "dv" ? "dhivehi-output text-base" : "text-sm"}`}
                dir={language === "dv" ? "rtl" : "ltr"}
              >
                <div className="whitespace-pre-wrap text-primary leading-relaxed">{answer}</div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Citations */}
        {citations.length > 0 && (
          <GlassCard className="p-5 sm:p-6 mb-4 animate-fade-in">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary mb-3">
              <span className="w-2 h-2 rounded-full" style={{ background: "#10b981" }} />
              Sources ({citations.length})
            </p>
            <div className="space-y-2">
              {citations.map((c, i) => (
                <a
                  key={i}
                  href={c.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-soft rounded-xl p-3 flex items-start gap-3 group hover:glass transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-muted shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm text-primary block truncate">
                      {c.title || c.uri}
                    </span>
                    <span className="text-[11px] text-faint block truncate">
                      {hostnameOf(c.uri)}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </GlassCard>
        )}

        {/* History */}
        {history.length > 0 && !answer && !loading && (
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                <ClockIcon className="w-3.5 h-3.5" />
                Recent Searches
              </p>
              <button
                onClick={clearHistory}
                className="text-xs text-muted hover:text-primary transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {history.slice(0, 12).map((h) => (
                <button
                  key={h.ts}
                  onClick={() => {
                    setQuery(h.q);
                    search(h.q);
                  }}
                  className="w-full glass-soft rounded-xl px-3 py-2 text-left text-sm text-primary hover:glass transition-colors flex items-center justify-between gap-2"
                >
                  <span className="truncate">{h.q}</span>
                  <span className="text-[10px] text-faint shrink-0">
                    {new Date(h.ts).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
