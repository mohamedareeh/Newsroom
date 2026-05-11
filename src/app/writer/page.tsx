"use client";

// ─── AI Writer Page ───────────────────────────────────────
// Generate original Dhivehi articles from bullet points.
// Supports article type (news/opinion/report) and word count selection.

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PenTool,
  Loader2,
  AlertCircle,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import GlassSelect from "@/components/GlassSelect";
import BottomNav from "@/components/BottomNav";
import { useSettings } from "@/lib/useSettings";

export default function WriterPage() {
  const router = useRouter();
  const { settings, loaded } = useSettings();

  const [writerPoints, setWriterPoints] = useState("");
  const [articleType, setArticleType] = useState("news");
  const [wordCount, setWordCount] = useState("400");
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");

  const composeArticle = useCallback(() => {
    if (!writerPoints.trim()) return;
    // Store request params and navigate — article page will stream the response
    sessionStorage.setItem("articleRequest", JSON.stringify({
      endpoint: "/api/compose",
      body: {
        points: writerPoints,
        articleType,
        wordCount: parseInt(wordCount),
      },
    }));
    sessionStorage.removeItem("articleResult");
    router.push("/article");
  }, [writerPoints, articleType, wordCount, router]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#1a1a1a] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
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
            className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-[#1a1a1a] focus:ring-2 focus:ring-[#1a1a1a]/10 transition-all duration-200 resize-y mb-4"
          />
          <button
            onClick={composeArticle}
            disabled={processing || !writerPoints.trim()}
            className="w-full flex items-center justify-center gap-2 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white font-medium py-3 rounded-xl transition-all duration-200 disabled:opacity-50"
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
    </div>
  );
}
