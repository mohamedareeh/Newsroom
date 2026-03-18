"use client";

// ─── AI Writer Page ───────────────────────────────────────
// Generate original Dhivehi articles from bullet points.
// Supports article type (news/opinion/report) and word count selection.

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Newspaper,
  PenTool,
  Loader2,
  AlertCircle,
  LayoutDashboard,
  Settings2,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import GlassSelect from "@/components/GlassSelect";
import { useSettings } from "@/lib/useSettings";

export default function WriterPage() {
  const router = useRouter();
  const { settings, loaded } = useSettings();

  const [writerPoints, setWriterPoints] = useState("");
  const [articleType, setArticleType] = useState("news");
  const [wordCount, setWordCount] = useState("400");
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");

  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  const composeArticle = useCallback(async () => {
    if (!writerPoints.trim()) return;
    setProcessing(true);
    setProcessError("");
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: writerPoints,
          articleType,
          wordCount: parseInt(wordCount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Article generation failed");
      sessionStorage.setItem("articleResult", JSON.stringify(data));
      router.push("/article");
    } catch (err: unknown) {
      setProcessError(err instanceof Error ? err.message : "Article generation failed");
    } finally {
      setProcessing(false);
    }
  }, [writerPoints, articleType, wordCount, router]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <Loader2 className="w-8 h-8 text-[#4F6DF5] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#f0f2f5]">
      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-gradient-to-b from-[#1B2332] to-[#141B27] text-white min-h-screen sticky top-0">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/[0.06]">
          <div className="p-2.5 bg-gradient-to-br from-[#4F6DF5] to-[#7C5BF5] rounded-xl">
            <Newspaper className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Creative Network</h1>
            <p className="text-[10px] text-white/30">News Desk</p>
          </div>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          <Link href="/" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/50 hover:bg-white/[0.04] hover:text-white/70 text-sm transition-all duration-200">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <Link href="/writer" className="relative flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.08] text-[#8BA3F9] text-sm font-medium">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#4F6DF5] rounded-r-full" />
            <PenTool className="w-4 h-4" />
            AI Writer
          </Link>
          <Link href="/settings" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/50 hover:bg-white/[0.04] hover:text-white/70 text-sm transition-all duration-200">
            <Settings2 className="w-4 h-4" />
            Settings
          </Link>
        </nav>
        <div className="px-4 py-4 border-t border-white/[0.06]">
          <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-white/40 hover:bg-white/[0.04] hover:text-red-400 text-sm transition-all duration-200">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-gray-200/60 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            <h1 className="text-sm font-bold text-gray-900">AI Writer</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/settings" className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200">
              <Settings2 className="w-4 h-4 text-gray-400" />
            </Link>
            <button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200">
              <LogOut className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Page title */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">AI Writer</h2>
            <p className="text-sm text-gray-400">Generate original Dhivehi articles from key points</p>
          </div>

          {/* Article options */}
          <GlassCard className="p-5 sm:p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Article Options</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <GlassSelect
                label="Article Type"
                value={articleType}
                onChange={setArticleType}
                options={[
                  { label: "News Report", value: "news" },
                  { label: "Opinion / Editorial", value: "opinion" },
                  { label: "Investigative Report", value: "report" },
                ]}
              />
              <GlassSelect
                label="Word Count"
                value={wordCount}
                onChange={setWordCount}
                options={[
                  { label: "~200 words (Short)", value: "200" },
                  { label: "~400 words (Medium)", value: "400" },
                  { label: "~600 words (Standard)", value: "600" },
                  { label: "~800 words (Long)", value: "800" },
                  { label: "~1000 words (Extended)", value: "1000" },
                ]}
              />
            </div>
          </GlassCard>

          {/* Key points input */}
          <GlassCard className="p-5 sm:p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Key Points</h3>
            <textarea
              value={writerPoints}
              onChange={(e) => setWriterPoints(e.target.value)}
              placeholder={"Enter the key points to write about...\n\nExample:\n- President announced new housing project\n- 5000 units in Hulhumale Phase 3\n- Construction starts Q2 2026\n- Partnership with foreign investors"}
              rows={8}
              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-[#4F6DF5] focus:ring-2 focus:ring-[#4F6DF5]/10 transition-all duration-200 resize-y mb-4"
            />
            <button
              onClick={composeArticle}
              disabled={processing || !writerPoints.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.97] text-white font-medium py-3 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4" />
                  Generate Article
                </>
              )}
            </button>
          </GlassCard>

          {/* Error display */}
          {processError && (
            <GlassCard className="p-5 animate-fade-in">
              <div className="flex items-start gap-3 text-red-600">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Generation Failed</p>
                  <p className="text-sm text-red-500 mt-1">{processError}</p>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </main>
    </div>
  );
}
