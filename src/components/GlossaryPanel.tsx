"use client";

// ─── Glossary Panel ─────────────────────────────────────────
// Compact UI for managing the newsroom glossary (term → canonical
// full form). Used inside Manual writer's collapsible "Glossary"
// section. The glossary is also injected into AI prompts so that
// names are consistently expanded across articles.

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, BookOpen } from "lucide-react";
import { useGlossary, GlossaryEntry } from "@/lib/useGlossary";

interface Props {
  /** When set, clicking a row inserts the canonical fullForm via this callback. */
  onInsert?: (fullForm: string) => void;
}

export default function GlossaryPanel({ onInsert }: Props) {
  const { glossary, upsert, remove } = useGlossary();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [fullForm, setFullForm] = useState("");
  const [role, setRole] = useState("");

  const startEdit = (e: GlossaryEntry) => {
    setEditingId(e.id);
    setTerm(e.term);
    setFullForm(e.fullForm);
    setRole(e.role || "");
  };

  const cancel = () => {
    setEditingId(null);
    setTerm("");
    setFullForm("");
    setRole("");
  };

  const submit = () => {
    if (!term.trim() || !fullForm.trim()) return;
    upsert({ id: editingId || undefined, term, fullForm, role });
    cancel();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <BookOpen className="w-3.5 h-3.5" />
        <span>
          {glossary.length} {glossary.length === 1 ? "entry" : "entries"} — used everywhere AI writes for you.
        </span>
      </div>

      {/* Add / edit form */}
      <div className="glass-soft rounded-xl p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Short form (e.g. Muizzu)"
            className="glass-input rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={fullForm}
            onChange={(e) => setFullForm(e.target.value)}
            placeholder="Canonical full form (e.g. President Dr. Mohamed Muizzu)"
            className="glass-input rounded-lg px-3 py-2 text-sm sm:col-span-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (optional — person / ministry / company)"
            className="glass-input rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={submit}
            disabled={!term.trim() || !fullForm.trim()}
            className="glass-btn flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
          >
            {editingId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {editingId ? "Save" : "Add"}
          </button>
          {editingId && (
            <button
              onClick={cancel}
              className="glass-btn-ghost flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {glossary.length === 0 ? (
        <p className="text-xs text-muted text-center py-4">
          No glossary entries yet. Add common names, titles, and organisations so the AI uses them consistently.
        </p>
      ) : (
        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
          {glossary.map((e) => (
            <div
              key={e.id}
              className="glass-soft rounded-xl px-3 py-2 flex items-start gap-3 group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-primary">{e.term}</span>
                  {e.role && (
                    <span className="text-[10px] uppercase tracking-wider text-faint">
                      {e.role}
                    </span>
                  )}
                </div>
                <div className="text-xs text-secondary truncate">{e.fullForm}</div>
              </div>
              {onInsert && (
                <button
                  onClick={() => onInsert(e.fullForm)}
                  className="text-[10px] text-muted hover:text-primary px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Insert canonical form into the active field"
                >
                  Insert
                </button>
              )}
              <button
                onClick={() => startEdit(e)}
                className="p-1 text-muted hover:text-primary"
                aria-label="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => remove(e.id)}
                className="p-1 text-muted hover:text-red-500"
                aria-label="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
