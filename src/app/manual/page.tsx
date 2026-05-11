"use client";

// ─── Manual Writer Page ────────────────────────────────────
// Blank Dhivehi editor with inline paraphrase. The user writes
// (or pastes) text into the content area and hits "Paraphrase"
// to have Gemini rewrite it in clean Dhivehi.

import { useState, useCallback, useRef } from "react";
import {
  PenLine,
  Sparkles,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Send,
  RotateCcw,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";
import WordPressPublisher from "@/components/WordPressPublisher";
import GlassSelect from "@/components/GlassSelect";
import { useSettings } from "@/lib/useSettings";

interface Fields {
  title: string;
  content: string;
  articleLatin: string;
  socialText: string;
  tags: string[];
}

const EMPTY: Fields = {
  title: "",
  content: "",
  articleLatin: "",
  socialText: "",
  tags: [],
};

export default function ManualPage() {
  const { settings, loaded } = useSettings();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [tagInput, setTagInput] = useState("");

  // Paraphrase state
  const [paraphrasing, setParaphrasing] = useState(false);
  const [paraError, setParaError] = useState("");
  const [paraLevel, setParaLevel] = useState<"light" | "heavy">("light");
  const [paraTone, setParaTone] = useState<"formal" | "casual" | "sensational">("formal");
  const [previousContent, setPreviousContent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const update = useCallback(
    <K extends keyof Fields>(k: K, v: Fields[K]) => setFields((p) => ({ ...p, [k]: v })),
    []
  );

  const copy = useCallback(async (text: string, section: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  const paraphraseContent = useCallback(async () => {
    if (paraphrasing) return;
    const source = fields.content.trim();
    if (!source) {
      setParaError("Write or paste some text in the content area first.");
      return;
    }

    setParaError("");
    setPreviousContent(fields.content);
    setParaphrasing(true);
    update("content", "");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/paraphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, paraphrasingLevel: paraLevel, tone: paraTone }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream available");

      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === "chunk") {
              full += payload.text;
              setFields((p) => ({ ...p, content: full }));
            } else if (payload.type === "error") {
              throw new Error(payload.error || "Paraphrasing failed");
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setParaError(err instanceof Error ? err.message : "Paraphrasing failed");
      // Restore previous content on failure
      setFields((p) => ({ ...p, content: previousContent ?? p.content }));
    } finally {
      setParaphrasing(false);
      abortRef.current = null;
    }
  }, [fields.content, paraLevel, paraTone, paraphrasing, previousContent, update]);

  const stopParaphrase = useCallback(() => {
    abortRef.current?.abort();
    setParaphrasing(false);
  }, []);

  const undoParaphrase = useCallback(() => {
    if (previousContent !== null) {
      update("content", previousContent);
      setPreviousContent(null);
    }
  }, [previousContent, update]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Page title */}
        <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight flex items-center gap-2">
              <PenLine className="w-6 h-6" />
              Manual Writer
            </h2>
            <p className="text-sm text-muted mt-1">
              Write a Dhivehi article from scratch — paraphrase your draft, then publish.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* TITLE */}
          <GlassCard className="overflow-hidden">
            <div className="h-1" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                  <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                  Title
                </p>
                <CopyBtn
                  onClick={() => copy(fields.title, "title")}
                  copied={copiedSection === "title"}
                  disabled={!fields.title}
                />
              </div>
              <textarea
                value={fields.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="ލިޔުމުގެ ސުރުޚީ — Write your headline…"
                rows={2}
                dir="rtl"
                className="dhivehi-output glass-input w-full rounded-xl p-5 text-2xl font-bold resize-none"
                style={{ lineHeight: 1.6 }}
              />
            </div>
          </GlassCard>

          {/* CONTENT + PARAPHRASE */}
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                Content
                {paraphrasing && <Loader2 className="w-3 h-3 animate-spin text-muted ml-2" />}
              </p>
              <CopyBtn
                onClick={() => copy(fields.content, "content")}
                copied={copiedSection === "content"}
                disabled={!fields.content}
              />
            </div>

            <textarea
              value={fields.content}
              onChange={(e) => update("content", e.target.value)}
              placeholder="Write or paste your draft here — then tap Paraphrase to clean it up."
              rows={14}
              dir="rtl"
              className="dhivehi-output glass-input w-full rounded-xl p-5 text-base resize-y"
            />

            {/* Paraphrase controls */}
            <div className="mt-4 glass-soft rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                  AI Paraphrase
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <GlassSelect
                  label="Rewrite Level"
                  value={paraLevel}
                  onChange={(v) => setParaLevel(v as "light" | "heavy")}
                  options={[
                    { label: "Light — keep structure", value: "light" },
                    { label: "Heavy — full rewrite", value: "heavy" },
                  ]}
                />
                <GlassSelect
                  label="Tone"
                  value={paraTone}
                  onChange={(v) => setParaTone(v as "formal" | "casual" | "sensational")}
                  options={[
                    { label: "Formal", value: "formal" },
                    { label: "Casual", value: "casual" },
                    { label: "Sensational", value: "sensational" },
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!paraphrasing ? (
                  <button
                    onClick={paraphraseContent}
                    disabled={!fields.content.trim()}
                    className="glass-btn flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                  >
                    <Sparkles className="w-4 h-4" />
                    Paraphrase Content
                  </button>
                ) : (
                  <button
                    onClick={stopParaphrase}
                    className="glass-btn-ghost flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Stop
                  </button>
                )}

                {previousContent !== null && !paraphrasing && (
                  <button
                    onClick={undoParaphrase}
                    className="glass-btn-ghost flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                    title="Restore previous content"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo
                  </button>
                )}
              </div>

              {paraError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm mt-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {paraError}
                </div>
              )}
            </div>
          </GlassCard>

          {/* LATIN */}
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#6366f1" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: "#6366f1" }} />
                Latin Transliteration
              </p>
              <CopyBtn
                onClick={() => copy(fields.articleLatin, "latin")}
                copied={copiedSection === "latin"}
                disabled={!fields.articleLatin}
              />
            </div>
            <textarea
              value={fields.articleLatin}
              onChange={(e) => update("articleLatin", e.target.value)}
              placeholder="Latin transliteration of the headline (optional)"
              rows={3}
              className="glass-input w-full rounded-xl p-4 text-sm font-medium resize-y"
            />
          </GlassCard>

          {/* SOCIAL */}
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#a855f7" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: "#a855f7" }} />
                Social Media Text
              </p>
              <CopyBtn
                onClick={() => copy(fields.socialText, "social")}
                copied={copiedSection === "social"}
                disabled={!fields.socialText}
              />
            </div>
            <textarea
              value={fields.socialText}
              onChange={(e) => update("socialText", e.target.value)}
              placeholder="Short social caption (optional)"
              rows={3}
              dir="rtl"
              className="dhivehi-output glass-input w-full rounded-xl p-4 text-sm resize-y"
            />
          </GlassCard>

          {/* TAGS */}
          <GlassCard className="p-5 sm:p-6">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] mb-3" style={{ color: "#10b981" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: "#10b981" }} />
              Tags
            </p>
            <input
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                update(
                  "tags",
                  e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                );
              }}
              placeholder="Comma-separated, e.g. politics, economy"
              className="glass-input w-full rounded-xl p-4 text-sm"
            />
            {fields.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {fields.tags.map((t, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full glass-soft text-primary font-medium">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </GlassCard>

          {/* PUBLISH */}
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Send className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Publish</p>
            </div>
            <WordPressPublisher
              title={fields.title}
              content={fields.content}
              customFields={{
                ...(fields.articleLatin ? { article_latin: fields.articleLatin } : {}),
                ...(fields.socialText ? { article_social_text: fields.socialText } : {}),
              }}
              tags={fields.tags.length > 0 ? fields.tags : undefined}
            />
          </GlassCard>
        </div>
      </div>
    </div>
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
