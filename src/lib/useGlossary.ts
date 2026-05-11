"use client";

import { useState, useEffect, useCallback } from "react";

export interface GlossaryEntry {
  id: string;
  term: string;        // The short form, e.g. "Muizzu"
  fullForm: string;    // Canonical expansion, e.g. "President Dr. Mohamed Muizzu"
  role?: string;       // Optional role label, e.g. "person", "ministry", "company"
  notes?: string;      // Free notes for the editor
  createdAt: number;
  updatedAt: number;
}

const KEY = "cn-glossary-v1";

function read(): GlossaryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as GlossaryEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: GlossaryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("cn-glossary-changed"));
  } catch {}
}

function uid() {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useGlossary() {
  const [items, setItems] = useState<GlossaryEntry[]>([]);

  useEffect(() => {
    setItems(read());
    const sync = () => setItems(read());
    window.addEventListener("cn-glossary-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("cn-glossary-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const upsert = useCallback(
    (entry: Omit<GlossaryEntry, "id" | "createdAt" | "updatedAt"> & { id?: string }) => {
      const now = Date.now();
      const list = read();
      if (entry.id) {
        const idx = list.findIndex((e) => e.id === entry.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...entry, id: list[idx].id, updatedAt: now };
          write(list);
          return list[idx];
        }
      }
      const created: GlossaryEntry = {
        id: uid(),
        term: entry.term.trim(),
        fullForm: entry.fullForm.trim(),
        role: entry.role?.trim() || undefined,
        notes: entry.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      if (!created.term || !created.fullForm) {
        return null;
      }
      write([created, ...list]);
      return created;
    },
    []
  );

  const remove = useCallback((id: string) => {
    write(read().filter((e) => e.id !== id));
  }, []);

  const clearAll = useCallback(() => write([]), []);

  return { glossary: items, upsert, remove, clearAll };
}

// Build a compact glossary block to inject into AI prompts.
export function glossaryPromptBlock(entries: GlossaryEntry[]): string {
  if (!entries || entries.length === 0) return "";
  const lines = entries.slice(0, 60).map((e) => {
    const role = e.role ? ` (${e.role})` : "";
    return `- "${e.term}"${role} → ${e.fullForm}`;
  });
  return `\n\nNEWSROOM GLOSSARY — when these short forms appear, use the canonical expanded form on first mention and stay consistent throughout the article:\n${lines.join("\n")}`;
}

// Server-safe helper to read glossary from a request body (clients can pass it in).
export type GlossaryPayload = Pick<GlossaryEntry, "term" | "fullForm" | "role">[];
