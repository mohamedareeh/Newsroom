"use client";

import { useState, useEffect, useCallback } from "react";

export interface Bookmark {
  title: string;
  link: string;
  sourceLabel?: string;
  pubDate?: string;
  savedAt: number;
}

const KEY = "cn-bookmarks";

function read(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function write(list: Bookmark[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("cn-bookmarks-changed"));
  } catch {}
}

export function useBookmarks() {
  const [items, setItems] = useState<Bookmark[]>([]);

  useEffect(() => {
    setItems(read());
    const sync = () => setItems(read());
    window.addEventListener("cn-bookmarks-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("cn-bookmarks-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const has = useCallback((link: string) => items.some((b) => b.link === link), [items]);

  const add = useCallback((b: Omit<Bookmark, "savedAt">) => {
    const current = read();
    if (current.some((x) => x.link === b.link)) return;
    write([{ ...b, savedAt: Date.now() }, ...current]);
  }, []);

  const remove = useCallback((link: string) => {
    write(read().filter((b) => b.link !== link));
  }, []);

  const toggle = useCallback((b: Omit<Bookmark, "savedAt">) => {
    const current = read();
    if (current.some((x) => x.link === b.link)) {
      write(current.filter((x) => x.link !== b.link));
    } else {
      write([{ ...b, savedAt: Date.now() }, ...current]);
    }
  }, []);

  const clear = useCallback(() => write([]), []);

  return { bookmarks: items, has, add, remove, toggle, clear };
}
