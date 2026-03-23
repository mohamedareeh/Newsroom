"use client";

// ─── Translate Page ───────────────────────────────────────
// Translate news articles or raw text into Dhivehi using Gemini AI.
// Two modes: from a URL (scrape + translate) or from raw text.

import { useState, useCallback, useRef } from "react";
import {
  Languages,
  Link2,
  FileText,
  Loader2,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";

type InputMode = "url" | "text";

export default function TranslatePage() {
  const [mode, setMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Translate ──
  const handleTranslate = useCallback(async () => {
    if (mode === "url" && !url.trim()) return;
    if (mode === "text" && !rawText.trim()) return;

    setStreaming(true);
    setTranslatedText("");
    setSourceTitle("");
    setError("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "url" ? { url: url.trim() } : { rawText: rawText.trim() }
        ),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Translation failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "meta") {
              setSourceTitle(data.sourceTitle || "");
            } else if (data.type === "chunk") {
              setTranslatedText((prev) => prev + data.text);
            } else if (data.type === "done") {
              setStreaming(false);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Translation failed");
      }
    } finally {
      setStreaming(false);
    }
  }, [mode, url, rawText]);

  // ── Copy ──
  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [translatedText]);

  return (
    <div className="min-h-screen bg-[#f5f3f0] pb-20 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Page title */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Translate</h2>
          <p className="text-sm text-gray-400">Translate articles or text into Dhivehi</p>
        </div>

        {/* Input section */}
        <GlassCard className="p-4 sm:p-6 mb-6">
          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-[#f0ede8] rounded-xl mb-5">
            <button
              onClick={() => setMode("url")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 flex-1 justify-center ${
                mode === "url"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Link2 className="w-4 h-4" />
              From URL
            </button>
            <button
              onClick={() => setMode("text")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 flex-1 justify-center ${
                mode === "text"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <FileText className="w-4 h-4" />
              From Text
            </button>
          </div>

          {/* URL input */}
          {mode === "url" && (
            <div className="space-y-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste article URL to translate..."
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1a1a1a] transition-all"
              />
            </div>
          )}

          {/* Raw text input */}
          {mode === "text" && (
            <div className="space-y-3">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste or type text to translate into Dhivehi..."
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1a1a1a] transition-all resize-none"
                rows={6}
              />
            </div>
          )}

          <button
            onClick={handleTranslate}
            disabled={streaming || (mode === "url" ? !url.trim() : !rawText.trim())}
            className="w-full mt-4 flex items-center justify-center gap-2 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            {streaming ? "Translating..." : "Translate to Dhivehi"}
          </button>
        </GlassCard>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Output */}
        {(translatedText || streaming) && (
          <GlassCard className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Translation
                </h3>
                {sourceTitle && (
                  <p className="text-xs text-gray-400 mt-1">{sourceTitle}</p>
                )}
              </div>
              {translatedText && !streaming && (
                <button
                  onClick={copyText}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-all"
                >
                  {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>

            <div className="dhivehi-output text-gray-800 leading-loose whitespace-pre-wrap">
              {translatedText}
              {streaming && (
                <span className="inline-block w-1.5 h-5 bg-[#1a1a1a] animate-pulse ml-1 align-middle" />
              )}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
