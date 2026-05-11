"use client";

// ─── Article View / Edit Page (Streaming + Manual) ────────
// Streams AI output from process/compose APIs, or starts blank in
// manual mode. All sections (title, content, latin, social, tags)
// are inline-editable before copy/publish.

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Sparkles,
  PenLine,
  RotateCcw,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import WordPressPublisher from "@/components/WordPressPublisher";

interface ArticleFields {
  title: string;
  content: string;
  articleLatin: string;
  socialText: string;
  tags: string[];
}

const EMPTY: ArticleFields = {
  title: "",
  content: "",
  articleLatin: "",
  socialText: "",
  tags: [],
};

// Parse Gemini's structured output
function parseStructured(text: string): ArticleFields | null {
  if (!text) return null;
  const t = text.trim();

  const titleMatch = t.match(/TITLE:\s*([\s\S]*?)(?=\nCONTENT:|$)/i);
  const contentMatch = t.match(/CONTENT:\s*([\s\S]*?)(?=\narticle_LATIN:|$)/i);
  const latinMatch = t.match(/article_LATIN:\s*([\s\S]*?)(?=\nSOCIAL_TEXT:|$)/i);
  const socialMatch = t.match(/SOCIAL_TEXT:\s*([\s\S]*?)(?=\nTAGS:|$)/i);
  const tagsMatch = t.match(/TAGS:\s*([\s\S]*?)$/i);

  if (titleMatch) {
    const tagsStr = tagsMatch?.[1]?.trim() || "";
    return {
      title: titleMatch[1]?.trim() || "",
      content: contentMatch?.[1]?.trim() || "",
      articleLatin: latinMatch?.[1]?.trim() || "",
      socialText: socialMatch?.[1]?.trim() || "",
      tags: tagsStr ? tagsStr.split(",").map((x) => x.trim()).filter(Boolean) : [],
    };
  }

  const firstNewline = t.indexOf("\n");
  if (firstNewline === -1) {
    return { ...EMPTY, title: t };
  }
  return {
    title: t.slice(0, firstNewline).trim(),
    content: t.slice(firstNewline + 1).trim(),
    articleLatin: "",
    socialText: "",
    tags: [],
  };
}

export default function ArticlePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManualMode = searchParams.get("mode") === "manual";

  const [rawText, setRawText] = useState("");
  const [meta, setMeta] = useState<{ originalTitle: string; originalLength: number; sourceUrl: string } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Editable state — sync from parsed AI output once
  const [fields, setFields] = useState<ArticleFields>(EMPTY);
  const [originalFields, setOriginalFields] = useState<ArticleFields | null>(null);
  const fieldsInitialized = useRef(false);

  const streamStarted = useRef(false);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  // Bootstrap: cached result, manual mode, or start streaming
  useEffect(() => {
    if (streamStarted.current) return;
    streamStarted.current = true;

    if (isManualMode) {
      setMeta({ originalTitle: "Manual Article", originalLength: 0, sourceUrl: "" });
      setDone(true);
      setFields(EMPTY);
      setOriginalFields(EMPTY);
      fieldsInitialized.current = true;
      sessionStorage.removeItem("articleResult");
      return;
    }

    const cachedResult = sessionStorage.getItem("articleResult");
    if (cachedResult) {
      try {
        const data = JSON.parse(cachedResult);
        setMeta({
          originalTitle: data.originalTitle || "Article",
          originalLength: data.originalLength || 0,
          sourceUrl: data.sourceUrl || "",
        });
        setRawText(data.rewrittenText || "");
        setDone(true);
        return;
      } catch { /* fall through */ }
    }

    const requestStr = sessionStorage.getItem("articleRequest");
    if (!requestStr) {
      router.push("/");
      return;
    }
    const request = JSON.parse(requestStr);
    setStreaming(true);

    fetch(request.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Request failed");
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream available");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "meta") {
                setMeta({
                  originalTitle: payload.originalTitle,
                  originalLength: payload.originalLength,
                  sourceUrl: payload.sourceUrl,
                });
              } else if (payload.type === "chunk") {
                fullText += payload.text;
                setRawText(fullText);
              } else if (payload.type === "done") {
                setDone(true);
              } else if (payload.type === "error") {
                setError(payload.error);
              }
            } catch { /* skip malformed */ }
          }
        }

        setStreaming(false);
        setDone(true);
        sessionStorage.setItem("articleResult", JSON.stringify({
          originalTitle: metaRef.current?.originalTitle || "Article",
          originalLength: metaRef.current?.originalLength || 0,
          rewrittenText: fullText,
          sourceUrl: metaRef.current?.sourceUrl || "",
          processedAt: new Date().toISOString(),
        }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Streaming failed");
        setStreaming(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-parsed view of streaming text
  const parsedOutput = useMemo(() => parseStructured(rawText), [rawText]);

  // Initialize editable fields once when streaming completes
  useEffect(() => {
    if (!done || fieldsInitialized.current) return;
    const parsed = parsedOutput ?? EMPTY;
    setFields(parsed);
    setOriginalFields(parsed);
    fieldsInitialized.current = true;
  }, [done, parsedOutput]);

  const copySection = useCallback(async (text: string, section: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  const updateField = <K extends keyof ArticleFields>(key: K, value: ArticleFields[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const resetToOriginal = useCallback(() => {
    if (originalFields) setFields(originalFields);
  }, [originalFields]);

  const isDirty = useMemo(() => {
    if (!originalFields) return false;
    return (
      fields.title !== originalFields.title ||
      fields.content !== originalFields.content ||
      fields.articleLatin !== originalFields.articleLatin ||
      fields.socialText !== originalFields.socialText ||
      fields.tags.join(",") !== originalFields.tags.join(",")
    );
  }, [fields, originalFields]);

  // Loading state — no data yet
  if (!rawText && !error && !streaming && !isManualMode && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const headerLabel = isManualMode
    ? "Manual Article"
    : streaming
    ? "Article Output"
    : "Article Output";

  const subLabel = isManualMode
    ? "Blank editor — write freely"
    : meta?.sourceUrl
    ? `Source: ${meta.originalTitle}`
    : "AI Generated Article";

  return (
    <div className="min-h-screen pb-16">
      {/* Sticky glass header */}
      <div className="sticky top-0 z-50 px-3 sm:px-6 pt-3">
        <div className="max-w-4xl mx-auto glass px-3 sm:px-4 py-2.5 rounded-2xl flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="glass-btn-ghost p-2 rounded-xl"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-secondary" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-primary truncate">{headerLabel}</h1>
              {streaming && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 glass-soft rounded-full text-[10px] text-primary font-medium">
                  <Sparkles className="w-3 h-3 animate-pulse" />
                  Writing…
                </span>
              )}
              {isManualMode && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 glass-soft rounded-full text-[10px] text-primary font-medium">
                  <PenLine className="w-3 h-3" />
                  Manual
                </span>
              )}
              {isDirty && (
                <span className="px-2 py-0.5 glass-soft rounded-full text-[10px] text-primary font-medium">
                  Edited
                </span>
              )}
            </div>
            <p className="text-xs text-muted truncate">{subLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && originalFields && (
              <button
                onClick={resetToOriginal}
                className="glass-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-secondary"
                title="Reset to original"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
            {done && (
              <button
                onClick={() =>
                  copySection(
                    [
                      fields.title && `TITLE: ${fields.title}`,
                      fields.content && `CONTENT: ${fields.content}`,
                      fields.articleLatin && `article_LATIN: ${fields.articleLatin}`,
                      fields.socialText && `SOCIAL_TEXT: ${fields.socialText}`,
                      fields.tags.length && `TAGS: ${fields.tags.join(", ")}`,
                    ]
                      .filter(Boolean)
                      .join("\n\n"),
                    "all"
                  )
                }
                className="glass-btn-ghost flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-secondary"
              >
                {copiedSection === "all" ? (
                  <><Check className="w-4 h-4 text-emerald-500" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 space-y-4">
        {error && (
          <GlassCard className="p-6 animate-fade-in">
            <div className="text-red-600">
              <p className="font-medium">Processing Failed</p>
              <p className="text-sm text-red-500 mt-1">{error}</p>
            </div>
          </GlassCard>
        )}

        {/* WordPress Publisher — uses edited fields */}
        {done && fieldsInitialized.current && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in">
            <WordPressPublisher
              title={fields.title || meta?.originalTitle || ""}
              content={fields.content || ""}
              customFields={{
                ...(fields.articleLatin ? { article_latin: fields.articleLatin } : {}),
                ...(fields.socialText ? { article_social_text: fields.socialText } : {}),
              }}
              tags={fields.tags.length > 0 ? fields.tags : undefined}
            />
          </GlassCard>
        )}

        {/* Streaming placeholder */}
        {streaming && !parsedOutput && (
          <GlassCard className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-full glass-soft flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <div
                  className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                  style={{ borderTopColor: "var(--accent)" }}
                />
              </div>
              <p className="text-primary font-medium mb-1">AI is writing…</p>
              <p className="text-muted text-sm">The article will appear here in real-time</p>
            </div>
          </GlassCard>
        )}

        {/* While streaming, show live read-only parsed output. Once done, switch to editable. */}
        {streaming && !done && parsedOutput && (
          <ReadOnlySections data={parsedOutput} streaming />
        )}

        {done && fieldsInitialized.current && (
          <EditableSections
            fields={fields}
            onChange={updateField}
            onCopy={copySection}
            copiedSection={copiedSection}
            isManual={isManualMode}
          />
        )}
      </div>
    </div>
  );
}

// ─── Streaming preview (read-only while data still arrives) ──────
function ReadOnlySections({ data, streaming }: { data: ArticleFields; streaming: boolean }) {
  return (
    <>
      {data.title && (
        <GlassCard className="overflow-hidden animate-fade-in">
          <div className="h-1" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
          <div className="p-5 sm:p-6">
            <SectionHeader label="Title" streaming={streaming} />
            <div className="glass-soft rounded-xl p-5">
              <h2 className="dhivehi-output text-primary text-2xl font-bold" dir="rtl">
                {data.title}
              </h2>
            </div>
          </div>
        </GlassCard>
      )}
      {data.content && (
        <GlassCard className="p-5 sm:p-6 animate-fade-in">
          <SectionHeader label="Content" streaming={streaming} />
          <div className="glass-soft rounded-xl p-5">
            <div className="dhivehi-output text-secondary text-base whitespace-pre-wrap" dir="rtl">
              {data.content}
            </div>
          </div>
        </GlassCard>
      )}
    </>
  );
}

function SectionHeader({ label, streaming, accent }: { label: string; streaming?: boolean; accent?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: accent || "var(--text-primary)" }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: accent || "var(--accent)" }} />
        {label}
        {streaming && <Loader2 className="w-3 h-3 animate-spin text-muted ml-2" />}
      </p>
    </div>
  );
}

// ─── Editable sections ─────────────────────────────────────
function EditableSections({
  fields,
  onChange,
  onCopy,
  copiedSection,
  isManual,
}: {
  fields: ArticleFields;
  onChange: <K extends keyof ArticleFields>(k: K, v: ArticleFields[K]) => void;
  onCopy: (text: string, section: string) => void;
  copiedSection: string | null;
  isManual: boolean;
}) {
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    setTagInput(fields.tags.join(", "));
  }, [fields.tags]);

  return (
    <>
      {/* TITLE */}
      <GlassCard className="overflow-hidden animate-fade-in">
        <div className="h-1" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader label="Title" />
            <CopyBtn
              onClick={() => onCopy(fields.title, "title")}
              copied={copiedSection === "title"}
              disabled={!fields.title}
            />
          </div>
          <textarea
            value={fields.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder={isManual ? "ލިޔުމުގެ ސުރުޚީ — Write your headline…" : ""}
            rows={2}
            dir="rtl"
            className="dhivehi-output glass-input w-full rounded-xl p-5 text-2xl font-bold resize-none"
            style={{ lineHeight: 1.6 }}
          />
        </div>
      </GlassCard>

      {/* CONTENT */}
      <GlassCard className="p-5 sm:p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader label="Content" />
          <CopyBtn
            onClick={() => onCopy(fields.content, "content")}
            copied={copiedSection === "content"}
            disabled={!fields.content}
          />
        </div>
        <textarea
          value={fields.content}
          onChange={(e) => onChange("content", e.target.value)}
          placeholder={isManual ? "ލިޔުމުގެ ތަފްސީލް — Write your article content here…" : ""}
          rows={14}
          dir="rtl"
          className="dhivehi-output glass-input w-full rounded-xl p-5 text-base resize-y"
        />
      </GlassCard>

      {/* LATIN */}
      <GlassCard className="p-5 sm:p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader label="Latin Transliteration" accent="#6366f1" />
          <CopyBtn
            onClick={() => onCopy(fields.articleLatin, "latin")}
            copied={copiedSection === "latin"}
            disabled={!fields.articleLatin}
          />
        </div>
        <textarea
          value={fields.articleLatin}
          onChange={(e) => onChange("articleLatin", e.target.value)}
          placeholder="Latin transliteration (optional)"
          rows={3}
          className="glass-input w-full rounded-xl p-4 text-sm font-medium resize-y"
        />
      </GlassCard>

      {/* SOCIAL */}
      <GlassCard className="p-5 sm:p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader label="Social Media Text" accent="#a855f7" />
          <CopyBtn
            onClick={() => onCopy(fields.socialText, "social")}
            copied={copiedSection === "social"}
            disabled={!fields.socialText}
          />
        </div>
        <textarea
          value={fields.socialText}
          onChange={(e) => onChange("socialText", e.target.value)}
          placeholder="Social caption (optional)"
          rows={4}
          dir="rtl"
          className="dhivehi-output glass-input w-full rounded-xl p-4 text-sm resize-y"
        />
      </GlassCard>

      {/* TAGS */}
      <GlassCard className="p-5 sm:p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader label="Tags" accent="#10b981" />
        </div>
        <input
          value={tagInput}
          onChange={(e) => {
            setTagInput(e.target.value);
            onChange(
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
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-full glass-soft text-primary font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </GlassCard>
    </>
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
