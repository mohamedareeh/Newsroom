"use client";

// ─── AI Suggest Button + Popover ────────────────────────────
// Used next to Title/Tags fields. Shows a button that, when clicked,
// fetches N suggestions from /api/suggest and renders them as a
// popover the user can pick from.

import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { useGlossary } from "@/lib/useGlossary";

interface Props {
  kind: "headlines" | "tags";
  /** Article content to base suggestions on. */
  content: string;
  /** Optional working title (helps headline suggestions). */
  title?: string;
  /** Called when user picks a suggestion. For tags, called once per pick. */
  onPick: (value: string) => void;
  /** Optional label override. */
  label?: string;
  /** Compact mode for small slots. */
  compact?: boolean;
}

export default function SuggestButton({
  kind,
  content,
  title,
  onPick,
  label,
  compact,
}: Props) {
  const { glossary } = useGlossary();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside to dismiss
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    setItems([]);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          content,
          title,
          count: kind === "tags" ? 6 : 5,
          glossary: glossary.map((g) => ({ term: g.term, fullForm: g.fullForm, role: g.role })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setItems(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggestion failed");
    } finally {
      setLoading(false);
    }
  }, [kind, content, title, glossary]);

  const disabled = !content.trim() && !(title || "").trim();

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        onClick={run}
        disabled={disabled || loading}
        className={
          compact
            ? "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-muted hover:text-primary disabled:opacity-30 transition-colors"
            : "glass-btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
        }
        title={disabled ? "Need some content first" : "Get AI suggestions"}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {label || (kind === "headlines" ? "Suggest" : "Suggest tags")}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-[min(90vw,360px)] glass-strong rounded-2xl p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {kind === "headlines" ? "Headline Ideas" : "Tag Ideas"}
            </p>
            <button
              onClick={() => setOpen(false)}
              className="p-1 text-muted hover:text-primary"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-500 px-2 py-2">{error}</p>
          )}

          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {items.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onPick(s);
                    if (kind === "headlines") setOpen(false);
                  }}
                  className="w-full glass-soft hover:glass rounded-xl px-3 py-2 text-left text-sm text-primary transition-colors"
                  dir={kind === "headlines" ? "rtl" : undefined}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="text-xs text-muted text-center py-4">No suggestions.</p>
          )}

          <button
            onClick={run}
            disabled={loading}
            className="glass-btn-ghost w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
          >
            <Sparkles className="w-3 h-3" />
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
