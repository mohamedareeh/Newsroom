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
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import CommandPalette from "@/components/CommandPalette";

const tabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/manual", label: "Manual", icon: PenLine },
  { href: "/writer", label: "Writer", icon: PenTool },
  { href: "/research", label: "Research", icon: Search },
  { href: "/translate", label: "Translate", icon: Languages },
  { href: "/social", label: "Social", icon: Share2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global ⌘K / Ctrl+K toggle
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
      } else if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      } else if (!mod && !inField && e.key === "/" && !paletteOpen) {
        // Press "/" anywhere outside an input to open palette quickly
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [paletteOpen]);

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-3 left-3 right-3 z-50 glass rounded-2xl pb-[env(safe-area-inset-bottom)]"
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-around px-1 py-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all flex-shrink-0 ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                <tab.icon className={`w-5 h-5 ${active ? "stroke-[2.4]" : "stroke-[1.7]"}`} />
                <span className={`text-[9px] ${active ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
            className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all text-muted hover:text-primary flex-shrink-0"
          >
            <Command className="w-5 h-5 stroke-[1.7]" />
            <span className="text-[9px] font-medium">⌘K</span>
          </button>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all text-muted hover:text-primary flex-shrink-0"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5 stroke-[1.7]" />
            ) : (
              <Moon className="w-5 h-5 stroke-[1.7]" />
            )}
            <span className="text-[9px] font-medium">Theme</span>
          </button>
        </div>
      </nav>

      {/* Desktop top nav */}
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
              {tabs.map((tab) => {
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
