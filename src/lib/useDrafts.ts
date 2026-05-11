"use client";

import { useState, useEffect, useCallback } from "react";

export interface DraftFields {
  title: string;
  content: string;
  articleLatin: string;
  socialText: string;
  tags: string[];
}

export interface Draft {
  id: string;
  name: string;
  fields: DraftFields;
  createdAt: number;
  updatedAt: number;
}

const KEY = "cn-drafts-v1";

function read(): Draft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Draft[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: Draft[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("cn-drafts-changed"));
  } catch {}
}

function uid() {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function deriveName(fields: DraftFields): string {
  const t = fields.title.trim();
  if (t) return t.length > 60 ? `${t.slice(0, 60)}…` : t;
  const c = fields.content.trim();
  if (c) {
    const first = c.split("\n")[0].trim();
    if (first) return first.length > 60 ? `${first.slice(0, 60)}…` : first;
  }
  return "Untitled draft";
}

export function useDrafts() {
  const [items, setItems] = useState<Draft[]>([]);

  useEffect(() => {
    setItems(read());
    const sync = () => setItems(read());
    window.addEventListener("cn-drafts-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("cn-drafts-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((fields: DraftFields, existingId?: string): string => {
    const now = Date.now();
    const list = read();
    if (existingId) {
      const idx = list.findIndex((d) => d.id === existingId);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          fields,
          name: deriveName(fields),
          updatedAt: now,
        };
        write(list);
        return existingId;
      }
    }
    const draft: Draft = {
      id: uid(),
      name: deriveName(fields),
      fields,
      createdAt: now,
      updatedAt: now,
    };
    write([draft, ...list]);
    return draft.id;
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((d) => d.id !== id));
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const list = read();
    const idx = list.findIndex((d) => d.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], name: name.trim() || list[idx].name };
      write(list);
    }
  }, []);

  const get = useCallback((id: string): Draft | undefined => {
    return read().find((d) => d.id === id);
  }, []);

  const clearAll = useCallback(() => write([]), []);

  return { drafts: items, save, remove, rename, get, clearAll };
}

export function isFieldsEmpty(f: DraftFields): boolean {
  return (
    !f.title.trim() &&
    !f.content.trim() &&
    !f.articleLatin.trim() &&
    !f.socialText.trim() &&
    f.tags.length === 0
  );
}
