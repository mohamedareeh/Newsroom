"use client";

// ─── Command Palette (⌘K / Ctrl+K) ─────────────────────────
// Global quick-action menu. Fuzzy-matches pages, recent bookmarks,
// and saved drafts. Toggled with ⌘K (macOS) or Ctrl+K (Windows/Linux),
// or by pressing the search icon in the bottom nav (handled by caller).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PenLine,
  PenTool,
  Languages,
  Share2,
  Settings2,
  Search,
  Bookmark,
  FileText,
  Moon,
  Sun,
  LogOut,
  Sparkles,
  X,
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useBookmarks } from "@/lib/useBookmarks";
import { useDrafts } from "@/lib/useDrafts";

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: "Pages" | "Actions" | "Drafts" | "Bookmarks";
  icon: React.ReactNode;
  run: () => void;
  keywords?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { bookmarks } = useBookmarks();
  const { drafts } = useDrafts();

  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on Escape, focus input on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Lock background scroll
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [open]);

  // Build items
  const items: Item[] = useMemo(() => {
    const go = (path: string) => () => {
      router.push(path);
      onClose();
    };
    const out: Item[] = [
      { id: "p-home", label: "Home", group: "Pages", icon: <LayoutDashboard className="w-4 h-4" />, run: go("/") },
      { id: "p-manual", label: "Manual Writer", group: "Pages", icon: <PenLine className="w-4 h-4" />, run: go("/manual") },
      { id: "p-writer", label: "AI Writer", group: "Pages", icon: <PenTool className="w-4 h-4" />, run: go("/writer") },
      { id: "p-research", label: "Research", group: "Pages", icon: <Search className="w-4 h-4" />, run: go("/research") },
      { id: "p-translate", label: "Translate", group: "Pages", icon: <Languages className="w-4 h-4" />, run: go("/translate") },
      { id: "p-social", label: "Social", group: "Pages", icon: <Share2 className="w-4 h-4" />, run: go("/social") },
      { id: "p-settings", label: "Settings", group: "Pages", icon: <Settings2 className="w-4 h-4" />, run: go("/settings") },

      {
        id: "a-theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        group: "Actions",
        icon: theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
        run: () => { toggle(); onClose(); },
        keywords: "theme dark light mode toggle",
      },
      {
        id: "a-new-draft",
        label: "New Manual Draft",
        group: "Actions",
        icon: <Sparkles className="w-4 h-4" />,
        run: () => {
          try { sessionStorage.removeItem("cn-manual-active-draft-id"); } catch {}
          go("/manual")();
        },
        keywords: "draft new manual create",
      },
      {
        id: "a-logout",
        label: "Sign Out",
        group: "Actions",
        icon: <LogOut className="w-4 h-4" />,
        run: async () => {
          onClose();
          await fetch("/api/logout", { method: "POST" });
          router.push("/login");
          router.refresh();
        },
        keywords: "logout signout exit",
      },
    ];

    // Recent drafts (max 8)
    for (const d of drafts.slice(0, 8)) {
      out.push({
        id: `d-${d.id}`,
        label: d.name,
        hint: new Date(d.updatedAt).toLocaleDateString(),
        group: "Drafts",
        icon: <FileText className="w-4 h-4" />,
        run: () => {
          try { sessionStorage.setItem("cn-manual-active-draft-id", d.id); } catch {}
          router.push("/manual");
          onClose();
        },
      });
    }

    // Recent bookmarks (max 10)
    for (const b of bookmarks.slice(0, 10)) {
      out.push({
        id: `b-${b.link}`,
        label: b.title,
        hint: b.sourceLabel,
        group: "Bookmarks",
        icon: <Bookmark className="w-4 h-4" />,
        run: () => {
          window.open(b.link, "_blank", "noopener");
          onClose();
        },
      });
    }

    return out;
  }, [router, theme, toggle, drafts, bookmarks, onClose]);

  // Fuzzy filter
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items
      .map((it) => {
        const hay = `${it.label} ${it.group} ${it.hint || ""} ${it.keywords || ""}`.toLowerCase();
        if (hay.includes(q)) return { it, score: 2 };
        // Loose match: all chars in order
        let i = 0;
        for (const c of hay) {
          if (q[i] === c) i++;
          if (i === q.length) return { it, score: 1 };
        }
        return null;
      })
      .filter((x): x is { it: Item; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it);
  }, [items, query]);

  // Group sequentially preserving filter order
  const groups = useMemo(() => {
    const order: Item["group"][] = ["Pages", "Actions", "Drafts", "Bookmarks"];
    const buckets: Record<string, Item[]> = {};
    for (const it of filtered) {
      (buckets[it.group] ||= []).push(it);
    }
    return order.flatMap((g) => (buckets[g] ? [{ group: g, items: buckets[g] }] : []));
  }, [filtered]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIdx];
        if (item) item.run();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIdx, onClose]);

  // Reset active row when filter changes
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Scroll active row into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  let runningIdx = -1;
  return (
    <div className="fixed inset-0 z-[100]" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-md" />
      <div className="relative max-w-xl mx-auto pt-[12vh] px-4">
        <div
          className="glass-strong rounded-2xl overflow-hidden animate-fade-in"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--glass-border-soft)]">
            <Search className="w-4 h-4 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search pages, drafts, bookmarks…"
              className="bg-transparent border-0 outline-none flex-1 text-sm text-primary placeholder:text-faint"
            />
            <kbd className="text-[10px] text-faint glass-soft rounded px-1.5 py-0.5">esc</kbd>
            <button onClick={onClose} className="p-1 text-muted hover:text-primary" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
            {groups.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No results</p>
            ) : (
              groups.map(({ group, items: gItems }) => (
                <div key={group} className="mb-2 last:mb-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-faint px-3 py-1.5">
                    {group}
                  </p>
                  {gItems.map((it) => {
                    runningIdx++;
                    const isActive = runningIdx === activeIdx;
                    return (
                      <button
                        key={it.id}
                        data-idx={runningIdx}
                        onMouseEnter={() => setActiveIdx(runningIdx)}
                        onClick={it.run}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                          isActive ? "glass-soft" : ""
                        }`}
                      >
                        <span className="text-muted">{it.icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="text-sm text-primary truncate block">{it.label}</span>
                          {it.hint && (
                            <span className="text-[10px] text-faint truncate block">{it.hint}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[var(--glass-border-soft)] px-4 py-2 flex items-center gap-3 text-[10px] text-faint">
            <span><kbd className="glass-soft rounded px-1.5 py-0.5">↑↓</kbd> navigate</span>
            <span><kbd className="glass-soft rounded px-1.5 py-0.5">↵</kbd> select</span>
            <span className="ml-auto"><kbd className="glass-soft rounded px-1.5 py-0.5">⌘K</kbd> toggle</span>
          </div>
        </div>
      </div>
    </div>
  );
}
