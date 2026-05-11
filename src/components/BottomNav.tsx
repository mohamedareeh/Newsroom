"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PenTool,
  PenLine,
  Languages,
  Share2,
  Settings2,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";

const tabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/manual", label: "Manual", icon: PenLine },
  { href: "/writer", label: "Writer", icon: PenTool },
  { href: "/translate", label: "Translate", icon: Languages },
  { href: "/social", label: "Social", icon: Share2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <>
      {/* Mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-3 left-3 right-3 z-50 glass rounded-2xl pb-[env(safe-area-inset-bottom)]"
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-around px-1 py-2">
          {tabs.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all ${
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
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all text-muted hover:text-primary"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5 stroke-[1.7]" />
            ) : (
              <Moon className="w-5 h-5 stroke-[1.7]" />
            )}
            <span className="text-[10px] font-medium">Theme</span>
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
                      active
                        ? "shadow-sm"
                        : "text-muted hover:text-primary"
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
                onClick={toggle}
                aria-label="Toggle theme"
                className="ml-1 flex items-center justify-center w-9 h-9 rounded-xl text-muted hover:text-primary transition-all glass-btn-ghost"
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
