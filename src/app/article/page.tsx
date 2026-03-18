"use client";

// ─── Article View Page ────────────────────────────────────
// Displays the AI-generated structured output (TITLE, CONTENT,
// article_LATIN, SOCIAL_TEXT) with copy buttons and WordPress publishing.
// Reads result from sessionStorage, set by dashboard or writer.

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import WordPressPublisher from "@/components/WordPressPublisher";
import { useSettings } from "@/lib/useSettings";

interface ProcessResult {
  originalTitle: string;
  originalLength: number;
  rewrittenText: string;
  sourceUrl: string;
  processedAt: string;
}

export default function ArticlePage() {
  const router = useRouter();
  const { settings, loaded } = useSettings();
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Load result from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("articleResult");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {
        router.push("/");
      }
    } else {
      router.push("/");
    }
  }, [router]);

  // Parse structured output
  const parsedOutput = useMemo(() => {
    if (!result?.rewrittenText) return null;
    const text = result.rewrittenText.trim();

    const titleMatch = text.match(/TITLE:\s*([\s\S]*?)(?=\nCONTENT:|$)/i);
    const contentMatch = text.match(/CONTENT:\s*([\s\S]*?)(?=\narticle_LATIN:|$)/i);
    const latinMatch = text.match(/article_LATIN:\s*([\s\S]*?)(?=\nSOCIAL_TEXT:|$)/i);
    const socialMatch = text.match(/SOCIAL_TEXT:\s*([\s\S]*?)$/i);

    if (titleMatch) {
      return {
        title: titleMatch[1]?.trim() || "",
        content: contentMatch?.[1]?.trim() || "",
        articleLatin: latinMatch?.[1]?.trim() || "",
        socialText: socialMatch?.[1]?.trim() || "",
      };
    }

    const firstNewline = text.indexOf("\n");
    if (firstNewline === -1) return { title: text, content: "", articleLatin: "", socialText: "" };
    return {
      title: text.slice(0, firstNewline).trim(),
      content: text.slice(firstNewline + 1).trim(),
      articleLatin: "",
      socialText: "",
    };
  }, [result]);

  const copySection = useCallback(async (text: string, section: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  if (!loaded || !result || !parsedOutput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <Loader2 className="w-8 h-8 text-[#4F6DF5] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Header bar */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-gray-900 truncate">Article Output</h1>
            <p className="text-xs text-gray-400 truncate">
              {result.sourceUrl ? `Source: ${result.originalTitle}` : "AI Generated Article"}
            </p>
          </div>
          <button
            onClick={() => copySection(result.rewrittenText, "all")}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all duration-200"
          >
            {copiedSection === "all" ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy All
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* TITLE section */}
        <GlassCard className="overflow-hidden animate-fade-in">
          <div className="h-1 bg-gradient-to-r from-[#4F6DF5] to-[#7C5BF5]" />
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#4F6DF5] uppercase tracking-[0.08em]">
                <span className="w-2 h-2 rounded-full bg-[#4F6DF5]" />Title
              </p>
              <button
                onClick={() => copySection(parsedOutput.title, "title")}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                {copiedSection === "title" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copiedSection === "title" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="bg-gradient-to-b from-gray-50 to-white border border-gray-200/80 rounded-xl p-5">
              <h2 className="dhivehi-output text-gray-900 text-2xl font-bold" dir="rtl">
                {parsedOutput.title}
              </h2>
            </div>
          </div>
        </GlassCard>

        {/* CONTENT section */}
        {parsedOutput.content && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in [animation-delay:50ms]">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#4F6DF5] uppercase tracking-[0.08em]">
                <span className="w-2 h-2 rounded-full bg-[#4F6DF5]" />Content
              </p>
              <button
                onClick={() => copySection(parsedOutput.content, "content")}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                {copiedSection === "content" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copiedSection === "content" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 sm:p-6">
              <div className="dhivehi-output text-gray-800 text-base whitespace-pre-wrap" dir="rtl">
                {parsedOutput.content}
              </div>
            </div>
          </GlassCard>
        )}

        {/* article_LATIN section */}
        {parsedOutput.articleLatin && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in [animation-delay:100ms]">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-500 uppercase tracking-[0.08em]">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />Latin Transliteration
              </p>
              <button
                onClick={() => copySection(parsedOutput.articleLatin, "latin")}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                {copiedSection === "latin" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copiedSection === "latin" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="bg-indigo-50/50 border border-indigo-200/60 rounded-xl p-4">
              <p className="text-gray-800 text-sm font-medium">{parsedOutput.articleLatin}</p>
            </div>
          </GlassCard>
        )}

        {/* SOCIAL_TEXT section */}
        {parsedOutput.socialText && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in [animation-delay:150ms]">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-violet-500 uppercase tracking-[0.08em]">
                <span className="w-2 h-2 rounded-full bg-violet-500" />Social Media Text
              </p>
              <button
                onClick={() => copySection(parsedOutput.socialText, "social")}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                {copiedSection === "social" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copiedSection === "social" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="bg-violet-50/50 border border-violet-200/60 rounded-xl p-4">
              <div className="dhivehi-output text-gray-800 text-sm" dir="rtl">
                {parsedOutput.socialText}
              </div>
            </div>
          </GlassCard>
        )}

        {/* Metadata + WordPress */}
        <GlassCard className="p-5 sm:p-6 animate-fade-in [animation-delay:200ms]">
          <div className="flex items-center justify-between mb-4 text-xs text-gray-400">
            <span>Original: {result.originalLength.toLocaleString()} chars</span>
            <span>Processed: {new Date(result.processedAt).toLocaleTimeString()}</span>
          </div>
          <WordPressPublisher
            title={parsedOutput.title || result.originalTitle}
            content={parsedOutput.content || result.rewrittenText}
            wordpress={settings.wordpress}
            customFields={{
              ...(parsedOutput.articleLatin ? { article_latin: parsedOutput.articleLatin } : {}),
              ...(parsedOutput.socialText ? { article_social_text: parsedOutput.socialText } : {}),
            }}
          />
        </GlassCard>
      </div>
    </div>
  );
}
