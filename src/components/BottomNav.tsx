"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  PenTool,
  PenLine,
  Languages,
  Share2,
  Settings2,
  Search,
  Sun,
  Moon,
  Command,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import CommandPalette from "@/components/CommandPalette";

const allTabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/manual", label: "Manual", icon: PenLine },
  { href: "/writer", label: "Writer", icon: PenTool },
  { href: "/research", label: "Research", icon: Search },
  { href: "/translate", label: "Translate", icon: Languages },
  { href: "/social", label: "Social", icon: Share2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

// Show only the first 4 as primary on mobile; the rest go behind "More".
const PRIMARY_COUNT = 4;
const primaryTabs = allTabs.slice(0, PRIMARY_COUNT);
const overflowTabs = allTabs.slice(PRIMARY_COUNT);

export default function BottomNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the More sheet whenever the route changes
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Global ⌘K / Ctrl+K toggle + "/" shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const isK = e.key === "k" || e.key === "K";
      const mod = e.metaKey || e.ctrlKey;
      if (mod && isK) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        if (moreOpen) setMoreOpen(false);
      } else if (!mod && !inField && e.key === "/" && !paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [paletteOpen, moreOpen]);

  const overflowActive = overflowTabs.some((t) =>
    t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)
  );

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ── Mobile bottom nav ── */}
      {/* Backdrop for the More sheet */}
      {moreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-fade-in"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* Mobile More sheet (slides up above the nav) */}
      {moreOpen && (
        <div className="lg:hidden fixed bottom-[5.5rem] left-3 right-3 z-50 glass-strong rounded-2xl p-2 animate-fade-in">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              More
            </span>
            <button
              onClick={() => setMoreOpen(false)}
              className="p-1 text-muted hover:text-primary"
              aria-label="Close more menu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 mb-1">
            {overflowTabs.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl transition-colors ${
                    active ? "glass-soft text-primary" : "text-muted hover:text-primary"
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${active ? "stroke-[2.4]" : "stroke-[1.7]"}`} />
                  <span className={`text-[10px] ${active ? "font-semibold" : "font-medium"}`}>
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => {
                setMoreOpen(false);
                setPaletteOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-muted hover:text-primary glass-btn-ghost"
            >
              <Command className="w-4 h-4" />
              Command Palette
            </button>
            <button
              onClick={() => {
                toggle();
                setMoreOpen(false);
              }}
              aria-label="Toggle theme"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-muted hover:text-primary glass-btn-ghost"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </div>
      )}

      <nav
        className="lg:hidden fixed bottom-3 left-3 right-3 z-50 glass rounded-2xl pb-[env(safe-area-inset-bottom)]"
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-around px-1 py-2">
          {primaryTabs.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all flex-shrink-0 ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                <tab.icon className={`w-5 h-5 ${active ? "stroke-[2.4]" : "stroke-[1.7]"}`} />
                <span className={`text-[10px] ${active ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            aria-label="More options"
            aria-expanded={moreOpen}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all flex-shrink-0 ${
              moreOpen || overflowActive ? "text-primary" : "text-muted"
            }`}
          >
            <MoreHorizontal
              className={`w-5 h-5 ${moreOpen || overflowActive ? "stroke-[2.4]" : "stroke-[1.7]"}`}
            />
            <span
              className={`text-[10px] ${
                moreOpen || overflowActive ? "font-semibold" : "font-medium"
              }`}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ── Desktop top nav (unchanged: shows everything) ── */}
      <nav className="hidden lg:block sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <div className="glass flex items-center justify-between px-5 py-2.5 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                <LayoutDashboard className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-primary tracking-tight">
                Creative Network
              </span>
            </div>
            <div className="flex items-center gap-1">
              {allTabs.map((tab) => {
                const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      active ? "shadow-sm" : "text-muted hover:text-primary"
                    }`}
                    style={
                      active
                        ? { background: "var(--accent)", color: "var(--accent-fg)" }
                        : undefined
                    }
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </Link>
                );
              })}
              <button
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
                className="ml-1 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted hover:text-primary transition-all glass-btn-ghost"
              >
                <Command className="w-3.5 h-3.5" />
                <kbd className="text-[10px]">⌘K</kbd>
              </button>
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="flex items-center justify-center w-9 h-9 rounded-xl text-muted hover:text-primary transition-all glass-btn-ghost"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
