"use client";

// ─── Social Media Page ────────────────────────────────────
// Fetch news from dhen.mv RSS, generate branded 1500x1500 images,
// preview, and send to Telegram channel.

import { useState, useCallback, useEffect } from "react";
import {
  Share2,
  Image,
  Send,
  Download,
  Facebook,
  Languages,
  Loader2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Zap,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import BottomNav from "@/components/BottomNav";

// ─── Types ─────────────────────────────────────────────────
interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  imageUrl?: string;
}

export default function SocialPage() {
  // ── Feed state ──
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Image generation state ──
  const [generatingFor, setGeneratingFor] = useState("");
  const [generatedImages, setGeneratedImages] = useState<Map<string, string>>(new Map());

  // ── Telegram state ──
  const [sendingFor, setSendingFor] = useState("");
  const [sentItems, setSentItems] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState("");
  const [socialTexts, setSocialTexts] = useState<Map<string, string>>(new Map());
  const [fbSendingFor, setFbSendingFor] = useState("");
  const [fbSentItems, setFbSentItems] = useState<Set<string>>(new Set());
  const [iftttSendingFor, setIftttSendingFor] = useState("");
  const [iftttSentItems, setIftttSentItems] = useState<Set<string>>(new Set());

  // ── Fetch RSS feed ──
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/feeds?url=${encodeURIComponent("https://dhen.mv/feed")}&count=20`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch feed");
      setFeedItems(data.headlines || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch feed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // ── Generate image (fully server-side) ──
  const generateImage = useCallback(async (item: FeedItem) => {
    setGeneratingFor(item.link);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          imageUrl: item.imageUrl || "",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Image generation failed");
      }
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setGeneratedImages((prev) => new Map(prev).set(item.link, reader.result as string));
        setGeneratingFor("");
      };
      reader.readAsDataURL(blob);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Image generation failed");
      setGeneratingFor("");
    }
  }, []);

  // ── Send to Telegram ──
  const sendToTelegram = useCallback(async (item: FeedItem) => {
    setSendingFor(item.link);
    setSendError("");
    try {
      const dataUrl = generatedImages.get(item.link);
      if (!dataUrl) throw new Error("No generated image");
      const base64 = dataUrl.split(",")[1];
      const customText = socialTexts.get(item.link);
      const displayText = customText?.trim() || item.title;
      const caption = `${displayText}\n\n${item.link}`;
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, caption }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSentItems((prev) => new Set(prev).add(item.link));
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : "Failed to send to Telegram");
    } finally {
      setSendingFor("");
    }
  }, [generatedImages, socialTexts]);

  // ── Send to IFTTT (fans out to Instagram / X / etc. via applets) ──
  const sendToIFTTT = useCallback(async (item: FeedItem) => {
    setIftttSendingFor(item.link);
    setSendError("");
    try {
      const dataUrl = generatedImages.get(item.link);
      if (!dataUrl) throw new Error("No generated image");
      const base64 = dataUrl.split(",")[1];
      const customText = socialTexts.get(item.link);
      const caption = customText?.trim() || item.title;
      const res = await fetch("/api/ifttt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, caption, link: item.link }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger IFTTT");
      setIftttSentItems((prev) => new Set(prev).add(item.link));
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : "Failed to trigger IFTTT");
    } finally {
      setIftttSendingFor("");
    }
  }, [generatedImages, socialTexts]);

  // ── Send to Facebook ──
  const sendToFacebook = useCallback(async (item: FeedItem) => {
    setFbSendingFor(item.link);
    setSendError("");
    try {
      const dataUrl = generatedImages.get(item.link);
      if (!dataUrl) throw new Error("No generated image");
      const base64 = dataUrl.split(",")[1];
      const customText = socialTexts.get(item.link);
      const displayText = customText?.trim() || item.title;
      const caption = `${displayText}\n\n${item.link}`;
      const res = await fetch("/api/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, caption }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post");
      setFbSentItems((prev) => new Set(prev).add(item.link));
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : "Failed to post to Facebook");
    } finally {
      setFbSendingFor("");
    }
  }, [generatedImages, socialTexts]);

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Page title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Social Media</h2>
            <p className="text-sm text-gray-400">Generate images &amp; share to Telegram</p>
          </div>
          <button
            onClick={fetchFeed}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Error display */}
        {(error || sendError) && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error || sendError}
            <button onClick={() => { setError(""); setSendError(""); }} className="ml-auto text-red-400 hover:text-red-600">
              &times;
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && feedItems.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#1a1a1a] animate-spin" />
            <span className="ml-3 text-gray-500 text-sm">Fetching feed from dhen.mv...</span>
          </div>
        )}

        {/* Feed items */}
        <div className="space-y-4">
          {feedItems.map((item, i) => {
            const imageGenerated = generatedImages.has(item.link);
            const isGenerating = generatingFor === item.link;
            const isSending = sendingFor === item.link;
            const isSent = sentItems.has(item.link);
            const isFbSending = fbSendingFor === item.link;
            const isFbSent = fbSentItems.has(item.link);
            const isIftttSending = iftttSendingFor === item.link;
            const isIftttSent = iftttSentItems.has(item.link);

            return (
              <GlassCard key={`${item.link}-${i}`} className="p-4 sm:p-5 animate-fade-in">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Thumbnail */}
                  {item.imageUrl && (
                    <div className="shrink-0 w-full sm:w-32 h-32 sm:h-24 rounded-lg overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium leading-snug mb-1.5 dhivehi-output">{item.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {item.pubDate && (
                        <span className="text-xs text-gray-400">
                          {new Date(item.pubDate).toLocaleDateString()}
                        </span>
                      )}
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View
                      </a>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => generateImage(item)}
                        disabled={isGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Image className="w-3 h-3" />
                        )}
                        {imageGenerated ? "Regenerate" : "Generate"}
                      </button>

                      {imageGenerated && (
                        <>
                          <button
                            onClick={() => sendToTelegram(item)}
                            disabled={isSending || isSent}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                              isSent
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : "bg-gradient-to-r from-[#1a1a1a] to-[#333] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white disabled:opacity-50"
                            }`}
                          >
                            {isSending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isSent ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            {isSent ? "Sent" : "Send to Telegram"}
                          </button>
                          <button
                            onClick={() => sendToFacebook(item)}
                            disabled={isFbSending || isFbSent}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                              isFbSent
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : "bg-gradient-to-r from-[#1a1a1a] to-[#333] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white disabled:opacity-50"
                            }`}
                          >
                            {isFbSending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isFbSent ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Facebook className="w-3 h-3" />
                            )}
                            {isFbSent ? "Posted" : "Facebook"}
                          </button>
                          <button
                            onClick={() => sendToIFTTT(item)}
                            disabled={isIftttSending || isIftttSent}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                              isIftttSent
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : "bg-gradient-to-r from-[#1a1a1a] to-[#333] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] text-white disabled:opacity-50"
                            }`}
                            title="Fan out to all connected IFTTT applets (Instagram, X, etc.)"
                          >
                            {isIftttSending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isIftttSent ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Zap className="w-3 h-3" />
                            )}
                            {isIftttSent ? "Sent" : "IFTTT"}
                          </button>
                          <a
                            href={generatedImages.get(item.link)!}
                            download={`social-${Date.now()}.png`}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f0ede8] hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-all active:scale-[0.97]"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Social text field */}
                {imageGenerated && (
                  <div className="mt-3">
                    <textarea
                      value={socialTexts.get(item.link) || ""}
                      onChange={(e) => setSocialTexts((prev) => new Map(prev).set(item.link, e.target.value))}
                      placeholder="Social media text (leave empty to use headline)"
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1a1a1a] transition-all resize-none dhivehi-output"
                      rows={2}
                    />
                  </div>
                )}

                {/* Generated image preview */}
                {imageGenerated && (
                  <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={generatedImages.get(item.link)!}
                      alt="Generated social image"
                      className="w-full max-w-md mx-auto"
                    />
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>

        {/* Empty state */}
        {!loading && feedItems.length === 0 && !error && (
          <GlassCard className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="p-5 bg-gray-50 rounded-3xl mb-5">
                <Share2 className="w-12 h-12 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-500 mb-2">No Feed Items</h3>
              <p className="text-sm text-gray-400 max-w-sm">
                Could not load the RSS feed from dhen.mv. Click Refresh to try again.
              </p>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
