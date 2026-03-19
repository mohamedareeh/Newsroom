"use client";

// ─── Article View Page (Streaming) ────────────────────────
// Streams the AI output in real-time from the process/compose API.
// Reads request params from sessionStorage, makes the streaming call,
// and displays text as it arrives from Gemini.

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import WordPressPublisher from "@/components/WordPressPublisher";

export default function ArticlePage() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [meta, setMeta] = useState<{ originalTitle: string; originalLength: number; sourceUrl: string } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const streamStarted = useRef(false);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  // Start streaming on mount
  useEffect(() => {
    if (streamStarted.current) return;
    streamStarted.current = true;

    // Check for cached result first (back navigation)
    const cachedResult = sessionStorage.getItem("articleResult");
    if (cachedResult) {
      try {
        const data = JSON.parse(cachedResult);
        setMeta({
          originalTitle: data.originalTitle || "Article",
          originalLength: data.originalLength || 0,
          sourceUrl: data.sourceUrl || "",
        });
        setRawText(data.rewrittenText || "");
        setDone(true);
        return;
      } catch { /* fall through */ }
    }

    // Get request params
    const requestStr = sessionStorage.getItem("articleRequest");
    if (!requestStr) {
      router.push("/");
      return;
    }

    const request = JSON.parse(requestStr);
    setStreaming(true);

    // Start streaming fetch
    fetch(request.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Request failed");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream available");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));

              if (payload.type === "meta") {
                setMeta({
                  originalTitle: payload.originalTitle,
                  originalLength: payload.originalLength,
                  sourceUrl: payload.sourceUrl,
                });
              } else if (payload.type === "chunk") {
                fullText += payload.text;
                setRawText(fullText);
              } else if (payload.type === "done") {
                setDone(true);
              } else if (payload.type === "error") {
                setError(payload.error);
              }
            } catch { /* skip malformed lines */ }
          }
        }

        setStreaming(false);
        setDone(true);
        // Cache result for back navigation
        sessionStorage.setItem("articleResult", JSON.stringify({
          originalTitle: metaRef.current?.originalTitle || "Article",
          originalLength: metaRef.current?.originalLength || 0,
          rewrittenText: fullText,
          sourceUrl: metaRef.current?.sourceUrl || "",
          processedAt: new Date().toISOString(),
        }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Streaming failed");
        setStreaming(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parse structured output (updates in real-time as text streams in)
  const parsedOutput = useMemo(() => {
    if (!rawText) return null;
    const text = rawText.trim();

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
  }, [rawText]);

  const copySection = useCallback(async (text: string, section: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  // Loading state — no data yet
  if (!rawText && !error && !streaming) {
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
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-gray-900 truncate">Article Output</h1>
              {streaming && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full text-[10px] text-blue-600 font-medium">
                  <Sparkles className="w-3 h-3 animate-pulse" />
                  Writing...
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 truncate">
              {meta?.sourceUrl ? `Source: ${meta.originalTitle}` : "AI Generated Article"}
            </p>
          </div>
          {done && (
            <button
              onClick={() => copySection(rawText, "all")}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all duration-200"
            >
              {copiedSection === "all" ? (
                <><Check className="w-4 h-4 text-green-600" /> Copied</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy All</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Error */}
        {error && (
          <GlassCard className="p-6 animate-fade-in">
            <div className="flex items-start gap-3 text-red-600">
              <div>
                <p className="font-medium">Processing Failed</p>
                <p className="text-sm text-red-500 mt-1">{error}</p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Streaming indicator — waiting for first content */}
        {streaming && !parsedOutput && (
          <GlassCard className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-[#4F6DF5]" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#4F6DF5] animate-[rotate_1.2s_linear_infinite]" />
              </div>
              <p className="text-gray-700 font-medium mb-1">AI is writing...</p>
              <p className="text-gray-400 text-sm">The article will appear here in real-time</p>
            </div>
          </GlassCard>
        )}

        {/* TITLE section */}
        {parsedOutput?.title && (
          <GlassCard className="overflow-hidden animate-fade-in">
            <div className="h-1 bg-gradient-to-r from-[#4F6DF5] to-[#7C5BF5]" />
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#4F6DF5] uppercase tracking-[0.08em]">
                  <span className="w-2 h-2 rounded-full bg-[#4F6DF5]" />Title
                </p>
                {done && (
                  <button onClick={() => copySection(parsedOutput.title, "title")} className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                    {copiedSection === "title" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copiedSection === "title" ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              <div className="bg-gradient-to-b from-gray-50 to-white border border-gray-200/80 rounded-xl p-5">
                <h2 className="dhivehi-output text-gray-900 text-2xl font-bold" dir="rtl">
                  {parsedOutput.title}
                </h2>
              </div>
            </div>
          </GlassCard>
        )}

        {/* CONTENT section */}
        {parsedOutput?.content && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#4F6DF5] uppercase tracking-[0.08em]">
                <span className="w-2 h-2 rounded-full bg-[#4F6DF5]" />Content
                {streaming && <Loader2 className="w-3 h-3 animate-spin text-gray-400 ml-2" />}
              </p>
              {done && (
                <button onClick={() => copySection(parsedOutput.content, "content")} className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                  {copiedSection === "content" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copiedSection === "content" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 sm:p-6">
              <div className="dhivehi-output text-gray-800 text-base whitespace-pre-wrap" dir="rtl">
                {parsedOutput.content}
              </div>
            </div>
          </GlassCard>
        )}

        {/* article_LATIN section */}
        {parsedOutput?.articleLatin && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-500 uppercase tracking-[0.08em]">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />Latin Transliteration
              </p>
              {done && (
                <button onClick={() => copySection(parsedOutput.articleLatin, "latin")} className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                  {copiedSection === "latin" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copiedSection === "latin" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <div className="bg-indigo-50/50 border border-indigo-200/60 rounded-xl p-4">
              <p className="text-gray-800 text-sm font-medium">{parsedOutput.articleLatin}</p>
            </div>
          </GlassCard>
        )}

        {/* SOCIAL_TEXT section */}
        {parsedOutput?.socialText && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-violet-500 uppercase tracking-[0.08em]">
                <span className="w-2 h-2 rounded-full bg-violet-500" />Social Media Text
              </p>
              {done && (
                <button onClick={() => copySection(parsedOutput.socialText, "social")} className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                  {copiedSection === "social" ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copiedSection === "social" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <div className="bg-violet-50/50 border border-violet-200/60 rounded-xl p-4">
              <div className="dhivehi-output text-gray-800 text-sm" dir="rtl">
                {parsedOutput.socialText}
              </div>
            </div>
          </GlassCard>
        )}

        {/* WordPress Publisher — only show when done */}
        {done && parsedOutput && (
          <GlassCard className="p-5 sm:p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4 text-xs text-gray-400">
              <span>Original: {(meta?.originalLength || 0).toLocaleString()} chars</span>
              <span>Completed: {new Date().toLocaleTimeString()}</span>
            </div>
            <WordPressPublisher
              title={parsedOutput.title || meta?.originalTitle || ""}
              content={parsedOutput.content || rawText}
              customFields={{
                ...(parsedOutput.articleLatin ? { article_latin: parsedOutput.articleLatin } : {}),
                ...(parsedOutput.socialText ? { article_social_text: parsedOutput.socialText } : {}),
              }}
            />
          </GlassCard>
        )}
      </div>
    </div>
  );
}
