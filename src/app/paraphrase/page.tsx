"use client";

// ─── Paraphrase Preview Screen ────────────────────────────
// Shows the original text (before) next to the AI-paraphrased
// version (after) streaming in. Optionally generates a headline
// when none was provided. User can Apply the result back to the
// Manual writer or Discard.

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Check,
  X,
  Copy,
  RotateCcw,
  Wand2,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";

interface ParaphraseRequest {
  text: string;
  title?: string;
  paraphrasingLevel: "light" | "heavy";
  tone: "formal" | "casual" | "sensational";
  generateTitle: boolean;
  level?: "light" | "heavy"; // for display
  glossary?: { term: string; fullForm: string; role?: string }[];
}

interface Parsed {
  title: string;
  content: string;
}

function parseOutput(raw: string, structured: boolean): Parsed {
  if (!structured) return { title: "", content: raw.trim() };

  const t = raw.trim();
  const titleMatch = t.match(/TITLE:\s*([\s\S]*?)(?=\nCONTENT:|$)/i);
  const contentMatch = t.match(/CONTENT:\s*([\s\S]*?)$/i);
  if (titleMatch) {
    return {
      title: (titleMatch[1] || "").trim(),
      content: (contentMatch?.[1] || "").trim(),
    };
  }
  // No TITLE label yet — show what we have so far as content
  return { title: "", content: t };
}

export default function ParaphrasePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      }
    >
      <ParaphraseInner />
    </Suspense>
  );
}

function ParaphraseInner() {
  const router = useRouter();
  const [request, setRequest] = useState<ParaphraseRequest | null>(null);
  const [rawOutput, setRawOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const streamStarted = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load request from sessionStorage on mount
  useEffect(() => {
    if (streamStarted.current) return;
    streamStarted.current = true;

    const raw = sessionStorage.getItem("paraphraseRequest");
    if (!raw) {
      router.replace("/manual");
      return;
    }

    let req: ParaphraseRequest;
    try {
      req = JSON.parse(raw);
    } catch {
      router.replace("/manual");
      return;
    }
    setRequest(req);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    fetch("/api/paraphrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: req.text,
        paraphrasingLevel: req.paraphrasingLevel,
        tone: req.tone,
        generateTitle: req.generateTitle,
        glossary: req.glossary,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream available");

        const decoder = new TextDecoder();
        let full = "";

        while (true) {
          const { done: rdone, value } = await reader.read();
          if (rdone) break;
          const lines = decoder.decode(value, { stream: true }).split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "chunk") {
                full += payload.text;
                setRawOutput(full);
              } else if (payload.type === "error") {
                throw new Error(payload.error || "Paraphrasing failed");
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
            }
          }
        }
        setStreaming(false);
        setDone(true);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Paraphrasing failed");
        setStreaming(false);
      });

    return () => controller.abort();
  }, [router]);

  const parsed = parseOutput(rawOutput, request?.generateTitle ?? false);

  const copy = useCallback(async (text: string, key: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const apply = useCallback(() => {
    if (!request) return;
    const result = {
      title: parsed.title,
      content: parsed.content,
      generatedTitle: request.generateTitle,
      appliedAt: Date.now(),
    };
    sessionStorage.setItem("paraphraseResult", JSON.stringify(result));
    sessionStorage.removeItem("paraphraseRequest");
    router.push("/manual");
  }, [parsed.title, parsed.content, request, router]);

  const discard = useCallback(() => {
    sessionStorage.removeItem("paraphraseRequest");
    sessionStorage.removeItem("paraphraseResult");
    router.push("/manual");
  }, [router]);

  const regenerate = useCallback(() => {
    if (!request || streaming) return;
    setRawOutput("");
    setError("");
    setDone(false);
    streamStarted.current = false;
    // Re-write request to sessionStorage and reload
    sessionStorage.setItem("paraphraseRequest", JSON.stringify(request));
    router.refresh();
    // Trigger re-mount by replacing the route with same path
    window.location.reload();
  }, [request, streaming, router]);

  if (!request) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Sticky glass header */}
      <div className="sticky top-0 z-50 px-3 sm:px-6 pt-3">
        <div className="max-w-6xl mx-auto glass px-3 sm:px-4 py-2.5 rounded-2xl flex items-center gap-3">
          <button
            onClick={discard}
            className="glass-btn-ghost p-2 rounded-xl"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-secondary" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-primary truncate">Paraphrase Preview</h1>
              {streaming && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 glass-soft rounded-full text-[10px] text-primary font-medium">
                  <Sparkles className="w-3 h-3 animate-pulse" />
                  Writing…
                </span>
              )}
              {done && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 glass-soft rounded-full text-[10px] text-primary font-medium">
                  <Check className="w-3 h-3 text-emerald-500" />
                  Done
                </span>
              )}
              <span className="text-[10px] text-muted">
                {request.paraphrasingLevel === "heavy" ? "Heavy" : "Light"} · {request.tone}
              </span>
            </div>
            <p className="text-xs text-muted truncate">Before vs. after — apply when you're happy</p>
          </div>
          <div className="flex items-center gap-2">
            {done && !error && (
              <button
                onClick={regenerate}
                className="glass-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-secondary"
                title="Run paraphrase again"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Redo</span>
              </button>
            )}
            <button
              onClick={discard}
              className="glass-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-secondary"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Discard</span>
            </button>
            <button
              onClick={apply}
              disabled={!done || !!error || !parsed.content.trim()}
              className="glass-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
            >
              <Check className="w-3.5 h-3.5" />
              Apply
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 space-y-4">
        {error && (
          <GlassCard className="p-4 animate-fade-in">
            <div className="flex items-start gap-3 text-red-600">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Paraphrasing Failed</p>
                <p className="text-sm text-red-500 mt-1">{error}</p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Headline panels (only if AI is generating one) */}
        {request.generateTitle && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlassCard className="p-4 sm:p-5">
              <SectionHeader label="Original Headline" muted />
              <div className="glass-soft rounded-xl p-4 min-h-[64px]">
                {request.title?.trim() ? (
                  <h2 className="dhivehi-output text-secondary text-lg font-bold" dir="rtl">
                    {request.title}
                  </h2>
                ) : (
                  <p className="text-faint text-sm italic">No headline provided</p>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <SectionHeader label="Generated Headline" accent />
                <CopyBtn
                  onClick={() => copy(parsed.title, "title")}
                  copied={copied === "title"}
                  disabled={!parsed.title}
                />
              </div>
              <div className="glass-soft rounded-xl p-4 min-h-[64px]">
                {parsed.title ? (
                  <h2 className="dhivehi-output text-primary text-lg font-bold" dir="rtl">
                    {parsed.title}
                  </h2>
                ) : streaming ? (
                  <p className="text-faint text-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating headline…
                  </p>
                ) : (
                  <p className="text-faint text-sm italic">—</p>
                )}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Content panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader label="Before" muted />
              <CopyBtn
                onClick={() => copy(request.text, "before")}
                copied={copied === "before"}
                disabled={!request.text}
              />
            </div>
            <div className="glass-soft rounded-xl p-4 max-h-[60vh] overflow-y-auto">
              <div
                className="dhivehi-output text-secondary text-base whitespace-pre-wrap"
                dir="rtl"
              >
                {request.text}
              </div>
            </div>
            <p className="text-[11px] text-faint mt-2">
              {request.text.length.toLocaleString()} characters
            </p>
          </GlassCard>

          <GlassCard className="p-4 sm:p-5 overflow-hidden">
            <div className="h-1 -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
            <div className="flex items-center justify-between mb-3">
              <SectionHeader
                label="After"
                accent
                streaming={streaming}
              />
              <CopyBtn
                onClick={() => copy(parsed.content, "after")}
                copied={copied === "after"}
                disabled={!parsed.content}
              />
            </div>
            <div className="glass-soft rounded-xl p-4 max-h-[60vh] overflow-y-auto">
              {parsed.content ? (
                <div
                  className="dhivehi-output text-primary text-base whitespace-pre-wrap"
                  dir="rtl"
                >
                  {parsed.content}
                </div>
              ) : streaming ? (
                <p className="text-faint text-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Paraphrasing…
                </p>
              ) : (
                <p className="text-faint text-sm italic">—</p>
              )}
            </div>
            <p className="text-[11px] text-faint mt-2">
              {parsed.content.length.toLocaleString()} characters
            </p>
          </GlassCard>
        </div>

        {/* Bottom action bar (duplicated for easy reach on mobile) */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={discard}
            className="glass-btn-ghost flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          >
            <X className="w-4 h-4" />
            Discard
          </button>
          <button
            onClick={apply}
            disabled={!done || !!error || !parsed.content.trim()}
            className="glass-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          >
            <Wand2 className="w-4 h-4" />
            Apply to Manual Writer
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  accent,
  muted,
  streaming,
}: {
  label: string;
  accent?: boolean;
  muted?: boolean;
  streaming?: boolean;
}) {
  return (
    <p
      className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{ color: accent ? "var(--text-primary)" : muted ? "var(--text-muted)" : "var(--text-primary)" }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: accent ? "var(--accent)" : "var(--text-faint)" }}
      />
      {label}
      {streaming && <Loader2 className="w-3 h-3 animate-spin text-muted ml-1" />}
    </p>
  );
}

function CopyBtn({ onClick, copied, disabled }: { onClick: () => void; copied: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted hover:text-primary rounded-lg transition-all disabled:opacity-30"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
