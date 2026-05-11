"use client";

// ─── Selection-Aware Textarea ──────────────────────────────
// A drop-in replacement for a <textarea> that adds an "AI on
// selection" toolbar above it. When the user selects text and
// picks an intent, the selection is replaced in place with the
// AI's rewrite.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  TextareaHTMLAttributes,
} from "react";
import {
  Sparkles,
  Wand2,
  Scissors,
  StretchHorizontal,
  Pilcrow,
  Languages,
  Loader2,
  AlertCircle,
  Check,
  Undo2,
  X,
} from "lucide-react";
import { useGlossary } from "@/lib/useGlossary";

type Intent = "rewrite" | "shorten" | "expand" | "fix" | "translate_dv" | "translate_en";

const INTENTS: { id: Intent; label: string; icon: React.ReactNode; short: string }[] = [
  { id: "rewrite", label: "Rewrite", short: "Rewrite", icon: <Wand2 className="w-3.5 h-3.5" /> },
  { id: "shorten", label: "Shorten", short: "Shorter", icon: <Scissors className="w-3.5 h-3.5" /> },
  { id: "expand", label: "Expand", short: "Expand", icon: <StretchHorizontal className="w-3.5 h-3.5" /> },
  { id: "fix", label: "Fix grammar", short: "Fix", icon: <Pilcrow className="w-3.5 h-3.5" /> },
  { id: "translate_dv", label: "Translate → Dhivehi", short: "→ DV", icon: <Languages className="w-3.5 h-3.5" /> },
  { id: "translate_en", label: "Translate → English", short: "→ EN", icon: <Languages className="w-3.5 h-3.5" /> },
];

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onValueChange: (next: string) => void;
  /** Full article body, used as context for the AI. */
  context?: string;
  /** Hidden when no selection is in the textarea. */
  toolbarLabel?: string;
}

export interface SelectionAIHandle {
  focus: () => void;
  textarea: HTMLTextAreaElement | null;
}

const SelectionAITextarea = forwardRef<SelectionAIHandle, Props>(function SelectionAITextarea(
  { value, onValueChange, context, toolbarLabel, onSelect, onChange, ...rest },
  ref
) {
  const { glossary } = useGlossary();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [loading, setLoading] = useState<Intent | null>(null);
  const [error, setError] = useState("");
  const [lastReplaced, setLastReplaced] = useState<{
    start: number;
    end: number;
    previous: string;
    replacement: string;
  } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => taRef.current?.focus(),
      get textarea() { return taRef.current; },
    }),
    []
  );

  const recomputeSelection = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    setHasSelection(el.selectionEnd > el.selectionStart);
  }, []);

  useEffect(() => {
    recomputeSelection();
  }, [value, recomputeSelection]);

  const runIntent = useCallback(
    async (intent: Intent) => {
      const el = taRef.current;
      if (!el || loading) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (end <= start) return;
      const selected = value.slice(start, end);
      if (!selected.trim()) return;

      setLoading(intent);
      setError("");
      try {
        const res = await fetch("/api/edit-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: selected,
            intent,
            context: context ?? value,
            glossary: glossary.map((g) => ({ term: g.term, fullForm: g.fullForm, role: g.role })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        const replacement = String(data.result || "");
        if (!replacement) throw new Error("Empty replacement");

        const before = value.slice(0, start);
        const after = value.slice(end);
        const next = before + replacement + after;
        onValueChange(next);
        setLastReplaced({ start, end, previous: selected, replacement });

        // Restore a selection around the new text on the next tick
        setTimeout(() => {
          if (taRef.current) {
            taRef.current.focus();
            taRef.current.setSelectionRange(start, start + replacement.length);
          }
        }, 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Edit failed");
      } finally {
        setLoading(null);
      }
    },
    [value, context, glossary, onValueChange, loading]
  );

  const undoLastReplace = useCallback(() => {
    if (!lastReplaced) return;
    const { start, replacement, previous } = lastReplaced;
    const after = value.slice(start + replacement.length);
    const before = value.slice(0, start);
    onValueChange(before + previous + after);
    setLastReplaced(null);
    setTimeout(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.setSelectionRange(start, start + previous.length);
      }
    }, 0);
  }, [lastReplaced, value, onValueChange]);

  return (
    <div className="space-y-2">
      {/* Toolbar — visible whenever there's a selection or a loading state or an error */}
      {(hasSelection || loading || error || lastReplaced) && (
        <div className="glass-soft rounded-2xl p-2 flex items-center gap-1.5 flex-wrap animate-fade-in">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted px-1.5">
            <Sparkles className="w-3 h-3" />
            {toolbarLabel || "AI on selection"}
          </span>
          {INTENTS.map((it) => (
            <button
              key={it.id}
              onClick={() => runIntent(it.id)}
              disabled={!hasSelection || loading !== null}
              className="glass-btn-ghost flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium"
              title={it.label}
            >
              {loading === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : it.icon}
              {it.short}
            </button>
          ))}
          {lastReplaced && !loading && (
            <button
              onClick={undoLastReplace}
              className="glass-btn-ghost flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-muted"
              title="Undo last AI edit"
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          )}
          {error && (
            <span className="flex items-center gap-1 text-[11px] text-red-500 ml-auto">
              <AlertCircle className="w-3 h-3" />
              {error}
              <button onClick={() => setError("")} className="ml-1" aria-label="Dismiss error">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {!error && lastReplaced && !loading && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-500 ml-auto">
              <Check className="w-3 h-3" />
              Replaced
            </span>
          )}
        </div>
      )}

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          onChange?.(e);
        }}
        onSelect={(e) => {
          recomputeSelection();
          onSelect?.(e);
        }}
        onKeyUp={recomputeSelection}
        onMouseUp={recomputeSelection}
        {...rest}
      />
    </div>
  );
});

export default SelectionAITextarea;
