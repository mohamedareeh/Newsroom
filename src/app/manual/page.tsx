"use client";

// ─── Manual Writer Page ────────────────────────────────────
// Blank Dhivehi editor with persistent drafts (localStorage). Auto-
// saves the active draft as the user types. Paraphrase navigates to
// /paraphrase for a Before/After view and auto-generates a headline
// when the Title is empty.

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PenLine,
  Sparkles,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Send,
  RotateCcw,
  FileText,
  FilePlus,
  Trash2,
  ChevronDown,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";
import WordPressPublisher from "@/components/WordPressPublisher";
import GlassSelect from "@/components/GlassSelect";
import { useSettings } from "@/lib/useSettings";
import { useDrafts, DraftFields, isFieldsEmpty } from "@/lib/useDrafts";

const EMPTY: DraftFields = {
  title: "",
  content: "",
  articleLatin: "",
  socialText: "",
  tags: [],
};

const ACTIVE_ID_KEY = "cn-manual-active-draft-id";
const OPTS_KEY = "cn-manual-opts";

export default function ManualPage() {
  const router = useRouter();
  const { loaded } = useSettings();
  const { drafts, save: saveDraft, remove: removeDraft, get: getDraft } = useDrafts();

  const [fields, setFields] = useState<DraftFields>(EMPTY);
  const [tagInput, setTagInput] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);

  // Paraphrase options
  const [paraLevel, setParaLevel] = useState<"light" | "heavy">("light");
  const [paraTone, setParaTone] = useState<"formal" | "casual" | "sensational">("formal");

  // Undo state for the most recent applied paraphrase
  const [previousContent, setPreviousContent] = useState<string | null>(null);
  const [previousTitle, setPreviousTitle] = useState<string | null>(null);
  const [paraError, setParaError] = useState("");

  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const initialized = useRef(false);

  const update = useCallback(
    <K extends keyof DraftFields>(k: K, v: DraftFields[K]) =>
      setFields((p) => ({ ...p, [k]: v })),
    []
  );

  // ─── Mount: restore active draft + paraphrase round-trip ────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Restore options
    try {
      const raw = sessionStorage.getItem(OPTS_KEY);
      if (raw) {
        const opts = JSON.parse(raw);
        if (opts.paraLevel) setParaLevel(opts.paraLevel);
        if (opts.paraTone) setParaTone(opts.paraTone);
      }
    } catch {}

    // Restore active draft
    let loadedId: string | null = null;
    try {
      loadedId = sessionStorage.getItem(ACTIVE_ID_KEY);
      if (loadedId) {
        const d = getDraft(loadedId);
        if (d) {
          setFields(d.fields);
          setTagInput(d.fields.tags.join(", "));
          setActiveId(loadedId);
        } else {
          loadedId = null;
          sessionStorage.removeItem(ACTIVE_ID_KEY);
        }
      }
    } catch {}

    // Apply any returned paraphrase result
    try {
      const raw = sessionStorage.getItem("paraphraseResult");
      if (raw) {
        const r = JSON.parse(raw) as {
          title: string;
          content: string;
          generatedTitle: boolean;
        };
        setFields((prev) => {
          setPreviousContent(prev.content);
          setPreviousTitle(prev.title);
          return {
            ...prev,
            content: r.content || prev.content,
            title: r.generatedTitle && r.title ? r.title : prev.title,
          };
        });
        sessionStorage.removeItem("paraphraseResult");
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-save active draft (debounced) ─────────────────────────
  useEffect(() => {
    if (!initialized.current) return;
    if (isFieldsEmpty(fields)) return;
    const t = setTimeout(() => {
      const id = saveDraft(fields, activeId ?? undefined);
      if (id !== activeId) {
        setActiveId(id);
        try { sessionStorage.setItem(ACTIVE_ID_KEY, id); } catch {}
      }
    }, 600);
    return () => clearTimeout(t);
  }, [fields, activeId, saveDraft]);

  // Persist paraphrase options
  useEffect(() => {
    if (!initialized.current) return;
    try {
      sessionStorage.setItem(OPTS_KEY, JSON.stringify({ paraLevel, paraTone }));
    } catch {}
  }, [paraLevel, paraTone]);

  const copy = useCallback(async (text: string, section: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  // ─── Draft management ───────────────────────────────────────────
  const loadDraft = useCallback((id: string) => {
    const d = getDraft(id);
    if (!d) return;
    setFields(d.fields);
    setTagInput(d.fields.tags.join(", "));
    setActiveId(id);
    setPreviousContent(null);
    setPreviousTitle(null);
    try { sessionStorage.setItem(ACTIVE_ID_KEY, id); } catch {}
    setDraftsOpen(false);
  }, [getDraft]);

  const newDraft = useCallback(() => {
    setFields(EMPTY);
    setTagInput("");
    setActiveId(null);
    setPreviousContent(null);
    setPreviousTitle(null);
    try { sessionStorage.removeItem(ACTIVE_ID_KEY); } catch {}
    setDraftsOpen(false);
  }, []);

  const deleteDraft = useCallback((id: string) => {
    removeDraft(id);
    if (id === activeId) newDraft();
  }, [activeId, removeDraft, newDraft]);

  // ─── Open Paraphrase screen ─────────────────────────────────────
  const openParaphrase = useCallback(() => {
    const source = fields.content.trim();
    if (!source) {
      setParaError("Write or paste some text in the content area first.");
      return;
    }
    setParaError("");
    const generateTitle = fields.title.trim().length === 0;

    sessionStorage.setItem(
      "paraphraseRequest",
      JSON.stringify({
        text: source,
        title: fields.title,
        paraphrasingLevel: paraLevel,
        tone: paraTone,
        generateTitle,
      })
    );
    router.push("/paraphrase");
  }, [fields, paraLevel, paraTone, router]);

  const undoParaphrase = useCallback(() => {
    if (previousContent !== null) {
      setFields((p) => ({
        ...p,
        content: previousContent,
        title: previousTitle ?? p.title,
      }));
      setPreviousContent(null);
      setPreviousTitle(null);
    }
  }, [previousContent, previousTitle]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const activeDraft = activeId ? drafts.find((d) => d.id === activeId) : null;
  const wordCount = fields.content.trim() ? fields.content.trim().split(/\s+/).length : 0;
  const charCount = fields.content.length;
  const readingMin = Math.max(1, Math.round(wordCount / 200));

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Page title */}
        <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
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

        {/* Drafts strip */}
        <div className="mb-4 relative">
          <div className="glass-soft rounded-2xl p-3 flex items-center gap-2 flex-wrap">
            <FileText className="w-4 h-4 text-muted shrink-0" />
            <button
              onClick={() => setDraftsOpen((v) => !v)}
              className="glass-input flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium flex-1 min-w-0 text-left"
            >
              <span className="truncate text-primary">
                {activeDraft?.name || (isFieldsEmpty(fields) ? "No draft yet" : "Untitled draft")}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${draftsOpen ? "rotate-180" : ""}`} />
            </button>
            <span className="text-[10px] text-faint hidden sm:inline">
              {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} saved
            </span>
            <button
              onClick={newDraft}
              className="glass-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
            >
              <FilePlus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {draftsOpen && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 glass rounded-2xl p-2 max-h-[60vh] overflow-y-auto">
              {drafts.length === 0 ? (
                <p className="text-xs text-muted text-center py-3">No saved drafts yet.</p>
              ) : (
                drafts.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${
                      d.id === activeId ? "glass-soft" : "hover:glass-soft"
                    }`}
                  >
                    <button
                      onClick={() => loadDraft(d.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="font-medium text-primary truncate">{d.name}</div>
                      <div className="text-[10px] text-faint">
                        {new Date(d.updatedAt).toLocaleString()}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteDraft(d.id)}
                      className="p-1.5 text-faint hover:text-red-500 rounded-lg"
                      title="Delete draft"
                      aria-label="Delete draft"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* PUBLISH (top, for quick access) */}
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

          {/* TITLE */}
          <GlassCard className="overflow-hidden">
            <div className="h-1" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                  <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                  Title
                  {!fields.title.trim() && fields.content.trim() && (
                    <span className="ml-2 text-[10px] text-muted normal-case tracking-normal font-medium">
                      (AI will generate one on Paraphrase)
                    </span>
                  )}
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
                placeholder="ލިޔުމުގެ ސުރުޚީ — Write your headline (leave blank to auto-generate)…"
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
                {fields.content.trim() && (
                  <span className="ml-2 text-[10px] text-muted normal-case tracking-normal font-medium">
                    {wordCount} words · {charCount.toLocaleString()} chars · ~{readingMin} min read
                  </span>
                )}
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
                <button
                  onClick={openParaphrase}
                  disabled={!fields.content.trim()}
                  className="glass-btn flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                >
                  <Sparkles className="w-4 h-4" />
                  Paraphrase Content
                </button>

                {previousContent !== null && (
                  <button
                    onClick={undoParaphrase}
                    className="glass-btn-ghost flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                    title="Restore previous content/title"
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
