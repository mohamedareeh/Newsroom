"use client";

// ─── Social Media Page ────────────────────────────────────
// Fetch news from dhen.mv RSS, generate branded 1500x1500 images,
// preview, and send to Telegram channel.

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Newspaper,
  LayoutDashboard,
  PenTool,
  Settings2,
  LogOut,
  Share2,
  Image,
  Send,
  Download,
  Loader2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";

// ─── Types ─────────────────────────────────────────────────
interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  imageUrl?: string;
}

export default function SocialPage() {
  const router = useRouter();

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
      const caption = `${item.title}\n\n${item.link}`;
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
  }, [generatedImages]);

  // ── Logout handler ──
  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

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
          <Link href="/writer" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/50 hover:bg-white/[0.04] hover:text-white/70 text-sm transition-all duration-200">
            <PenTool className="w-4 h-4" />
            AI Writer
          </Link>
          <Link href="/social" className="relative flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.08] text-[#8BA3F9] text-sm font-medium">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#4F6DF5] rounded-r-full" />
            <Share2 className="w-4 h-4" />
            Social Media
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
            <div className="p-2 bg-gradient-to-br from-[#4F6DF5] to-[#7C5BF5] rounded-xl">
              <Newspaper className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-sm font-bold text-gray-900">Social Media</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/" className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200">
              <LayoutDashboard className="w-4 h-4 text-gray-400" />
            </Link>
            <Link href="/settings" className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200">
              <Settings2 className="w-4 h-4 text-gray-400" />
            </Link>
            <button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200">
              <LogOut className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          {/* Page title */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Social Media</h2>
              <p className="text-sm text-gray-400">Generate images &amp; share to Telegram</p>
            </div>
            <button
              onClick={fetchFeed}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.97] text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
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
              <Loader2 className="w-6 h-6 text-[#4F6DF5] animate-spin" />
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
                          className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 transition-colors"
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.97] text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
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
                                  : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:shadow-lg hover:shadow-cyan-500/15 active:scale-[0.97] text-white disabled:opacity-50"
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
                            <a
                              href={generatedImages.get(item.link)!}
                              download={`social-${Date.now()}.png`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-all active:scale-[0.97]"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

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
      </main>
    </div>
  );
}
