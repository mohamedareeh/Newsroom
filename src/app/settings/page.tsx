"use client";

// ─── Settings Page ─────────────────────────────────────────
// Manage news sources, AI behavior, prompt template, API keys,
// auto-scrape, WordPress publishing, and general preferences.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Newspaper,
  Rss,
  Globe,
  Sparkles,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
  Key,
  Users,
  UserPlus,
  Shield,
  Eye,
  EyeOff,
  Timer,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  RotateCcw,
  LayoutDashboard,
  Settings2,
  LogOut,
  PenTool,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import GlassSelect from "@/components/GlassSelect";
import GlassToggle from "@/components/GlassToggle";
import { useSettings } from "@/lib/useSettings";
import {
  DHIVEHI_NEWS_SOURCES,
  NewsSource,
  getEffectiveSources,
  AutoScrapeInterval,
  DEFAULT_PROMPT_TEMPLATE,
  GEMINI_MODELS,
} from "@/lib/config";

export default function SettingsPage() {
  const router = useRouter();
  const { settings, updateSettings, loaded } = useSettings();

  // Custom source form state
  const [newLabel, setNewLabel] = useState("");
  const [newRssUrl, setNewRssUrl] = useState("");
  const [newScrapeUrl, setNewScrapeUrl] = useState("");

  // API key visibility
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showWpPassword, setShowWpPassword] = useState(false);

  // WP test connection
  const [wpTesting, setWpTesting] = useState(false);
  const [wpTestResult, setWpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // User management
  const [users, setUsers] = useState<string[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [userError, setUserError] = useState("");
  const [userAdding, setUserAdding] = useState(false);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch { /* ignore */ }
    finally { setUsersLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAddUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setUserAdding(true);
    setUserError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", username: newUsername.trim(), password: newPassword }),
      });
      const data = await res.json();
      if (data.error) { setUserError(data.error); }
      else { setNewUsername(""); setNewPassword(""); fetchUsers(); }
    } catch { setUserError("Network error"); }
    finally { setUserAdding(false); }
  };

  const handleRemoveUser = async (username: string) => {
    setUserError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", username }),
      });
      const data = await res.json();
      if (data.error) { setUserError(data.error); }
      else { fetchUsers(); }
    } catch { setUserError("Network error"); }
  };

  // Logout handler
  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <Loader2 className="w-8 h-8 text-[#5D87FF] animate-spin" />
      </div>
    );
  }

  const effectiveSources = getEffectiveSources(settings);
  const rssSources = effectiveSources.filter((s) => s.rssUrl);

  const allRssEnabled = rssSources.length > 0 && rssSources.every((s) => settings.enabledRssFeeds.includes(s.id));
  const allScrapeEnabled = effectiveSources.length > 0 && effectiveSources.every((s) => settings.enabledScrapeSources.includes(s.id));

  const toggleRssSource = (id: string) => {
    const current = settings.enabledRssFeeds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    updateSettings({ enabledRssFeeds: next });
  };

  const toggleScrapeSource = (id: string) => {
    const current = settings.enabledScrapeSources;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    updateSettings({ enabledScrapeSources: next });
  };

  const toggleAllRss = () => {
    updateSettings({
      enabledRssFeeds: allRssEnabled ? [] : rssSources.map((s) => s.id),
    });
  };

  const toggleAllScrape = () => {
    updateSettings({
      enabledScrapeSources: allScrapeEnabled ? [] : effectiveSources.map((s) => s.id),
    });
  };

  // ── Custom source management ──
  const addCustomSource = () => {
    if (!newLabel.trim() || !newScrapeUrl.trim()) return;
    const id = "custom-" + Date.now();
    const source: NewsSource = {
      id,
      label: newLabel.trim(),
      rssUrl: newRssUrl.trim() || undefined,
      scrapeUrl: newScrapeUrl.trim(),
    };
    updateSettings({
      customSources: [...(settings.customSources || []), source],
      enabledScrapeSources: [...settings.enabledScrapeSources, id],
      enabledRssFeeds: source.rssUrl
        ? [...settings.enabledRssFeeds, id]
        : settings.enabledRssFeeds,
    });
    setNewLabel("");
    setNewRssUrl("");
    setNewScrapeUrl("");
  };

  const removeSource = (source: NewsSource) => {
    const isDefault = DHIVEHI_NEWS_SOURCES.some((s) => s.id === source.id);
    if (isDefault) {
      updateSettings({
        removedDefaultSourceIds: [...settings.removedDefaultSourceIds, source.id],
        enabledRssFeeds: settings.enabledRssFeeds.filter((x) => x !== source.id),
        enabledScrapeSources: settings.enabledScrapeSources.filter((x) => x !== source.id),
      });
    } else {
      updateSettings({
        customSources: (settings.customSources || []).filter((s) => s.id !== source.id),
        enabledRssFeeds: settings.enabledRssFeeds.filter((x) => x !== source.id),
        enabledScrapeSources: settings.enabledScrapeSources.filter((x) => x !== source.id),
      });
    }
  };

  const restoreDefaults = () => {
    updateSettings({
      removedDefaultSourceIds: [],
      enabledRssFeeds: DHIVEHI_NEWS_SOURCES.filter((s) => s.rssUrl).map((s) => s.id),
      enabledScrapeSources: DHIVEHI_NEWS_SOURCES.map((s) => s.id),
    });
  };

  // ── WP test connection ──
  const testWpConnection = async () => {
    setWpTesting(true);
    setWpTestResult(null);
    try {
      const res = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "categories", wordpress: settings.wordpress }),
      });
      const data = await res.json();
      if (data.error) {
        setWpTestResult({ ok: false, msg: data.error });
      } else {
        setWpTestResult({ ok: true, msg: `Connected! ${data.categories?.length || 0} categories found.` });
      }
    } catch {
      setWpTestResult({ ok: false, msg: "Network error" });
    } finally {
      setWpTesting(false);
    }
  };

  // Common input class
  const inputCls = "w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-[#4F6DF5] focus:ring-2 focus:ring-[#4F6DF5]/10 transition-all duration-200";

  return (
    <div className="min-h-screen flex bg-[#f0f2f5]">
      {/* ════════════════════════════════════════════════════════ */}
      {/* SIDEBAR                                                 */}
      {/* ════════════════════════════════════════════════════════ */}
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
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/50 hover:bg-white/[0.04] hover:text-white/70 text-sm transition-all duration-200"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <Link
            href="/writer"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/50 hover:bg-white/[0.04] hover:text-white/70 text-sm transition-all duration-200"
          >
            <PenTool className="w-4 h-4" />
            AI Writer
          </Link>
          <Link
            href="/settings"
            className="relative flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.08] text-[#8BA3F9] text-sm font-medium"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#4F6DF5] rounded-r-full" />
            <Settings2 className="w-4 h-4" />
            Settings
          </Link>
        </nav>
        <div className="px-4 py-4 border-t border-white/[0.06]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-white/40 hover:bg-white/[0.04] hover:text-red-400 text-sm transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT                                            */}
      {/* ════════════════════════════════════════════════════════ */}
      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-gray-200/60 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-sm font-bold text-gray-900">Settings</h1>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <LogOut className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Page Title */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">Settings</h2>
            <p className="text-sm text-gray-500">Manage sources, AI, auto-scrape & WordPress</p>
          </div>

          <div className="space-y-6">
            {/* ════════════════════════════════════════════════════ */}
            {/* User Management                                      */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Users className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  User Management
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Add or remove users who can log in to the dashboard.
              </p>

              {userError && (
                <div className="flex items-center gap-2 p-2.5 mb-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {userError}
                </div>
              )}

              {/* Current users */}
              <div className="space-y-1.5 mb-5">
                {usersLoading && users.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  </div>
                ) : (
                  users.map((username, i) => {
                    const isAdmin = i === 0;
                    return (
                      <div
                        key={username}
                        className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-700">{username}</p>
                          {isAdmin && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px]">
                              <Shield className="w-2.5 h-2.5" />
                              Admin
                            </span>
                          )}
                        </div>
                        {!isAdmin && (
                          <button
                            onClick={() => handleRemoveUser(username)}
                            className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            title="Remove user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add user form */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Add User
                </p>
                <input
                  type="text"
                  placeholder="Username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className={inputCls}
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputCls}
                />
                <button
                  onClick={handleAddUser}
                  disabled={!newUsername.trim() || !newPassword.trim() || userAdding}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.97] rounded-lg text-sm text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {userAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Add User
                </button>
              </div>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* Source Management                                    */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-500" />
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    News Sources
                  </h2>
                </div>
                {settings.removedDefaultSourceIds.length > 0 && (
                  <button
                    onClick={restoreDefaults}
                    className="text-xs text-[#5D87FF] hover:underline transition-colors"
                  >
                    Restore defaults
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Manage all news sources. Remove defaults or add custom websites.
              </p>

              {/* Current sources list */}
              <div className="space-y-1.5 mb-5">
                {effectiveSources.map((source) => {
                  const isCustom = !DHIVEHI_NEWS_SOURCES.some((s) => s.id === source.id);
                  return (
                    <div
                      key={source.id}
                      className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700">
                          {source.label}
                          {isCustom && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded-full">
                              Custom
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{source.scrapeUrl}</p>
                      </div>
                      <button
                        onClick={() => removeSource(source)}
                        className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                        title="Remove source"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add custom source form */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Add Custom Source
                </p>
                <input
                  type="text"
                  placeholder="Source name (e.g. MyNews)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className={inputCls}
                />
                <input
                  type="url"
                  placeholder="RSS Feed URL (optional)"
                  value={newRssUrl}
                  onChange={(e) => setNewRssUrl(e.target.value)}
                  className={inputCls}
                />
                <input
                  type="url"
                  placeholder="Website URL (required)"
                  value={newScrapeUrl}
                  onChange={(e) => setNewScrapeUrl(e.target.value)}
                  className={inputCls}
                />
                <button
                  onClick={addCustomSource}
                  disabled={!newLabel.trim() || !newScrapeUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.97] rounded-lg text-sm text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Add Source
                </button>
              </div>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* RSS Feed Toggles                                     */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Rss className="w-4 h-4 text-orange-500" />
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    RSS Feed Sources
                  </h2>
                </div>
                <button
                  onClick={toggleAllRss}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {allRssEnabled ? <ToggleRight className="w-4 h-4 text-blue-500" /> : <ToggleLeft className="w-4 h-4" />}
                  {allRssEnabled ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="space-y-1.5">
                {rssSources.map((source) => (
                  <GlassToggle
                    key={source.id}
                    label={source.label}
                    description={source.rssUrl}
                    checked={settings.enabledRssFeeds.includes(source.id)}
                    onChange={() => toggleRssSource(source.id)}
                  />
                ))}
                {rssSources.length === 0 && (
                  <p className="text-xs text-gray-400 py-2">No sources with RSS feeds.</p>
                )}
              </div>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* Direct Scrape Toggles                                */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-500" />
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Direct Scrape Sources
                  </h2>
                </div>
                <button
                  onClick={toggleAllScrape}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {allScrapeEnabled ? <ToggleRight className="w-4 h-4 text-blue-500" /> : <ToggleLeft className="w-4 h-4" />}
                  {allScrapeEnabled ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="space-y-1.5">
                {effectiveSources.map((source) => (
                  <GlassToggle
                    key={source.id}
                    label={source.label}
                    description={source.scrapeUrl}
                    checked={settings.enabledScrapeSources.includes(source.id)}
                    onChange={() => toggleScrapeSource(source.id)}
                  />
                ))}
              </div>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* AI Settings                                          */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  AI Spin Engine
                </h2>
              </div>
              <div className="space-y-4">
                <GlassSelect
                  label="Rewrite Model"
                  value={settings.geminiModel || "gemini-2.5-flash"}
                  onChange={(v) => updateSettings({ geminiModel: v })}
                  options={GEMINI_MODELS.map((m) => ({ label: m.label, value: m.value }))}
                />
                <GlassSelect
                  label="AI Writer Model"
                  value={settings.composeModel || "gemini-2.5-flash"}
                  onChange={(v) => updateSettings({ composeModel: v })}
                  options={GEMINI_MODELS.map((m) => ({ label: m.label, value: m.value }))}
                />
                <GlassSelect
                  label="Paraphrasing Level"
                  value={settings.paraphrasingLevel}
                  onChange={(v) => updateSettings({ paraphrasingLevel: v as "light" | "heavy" })}
                  options={[
                    { label: "Heavy Rewrite", value: "heavy" },
                    { label: "Light Touch", value: "light" },
                  ]}
                />
                <GlassSelect
                  label="Tone"
                  value={settings.tone}
                  onChange={(v) => updateSettings({ tone: v as "formal" | "casual" | "sensational" })}
                  options={[
                    { label: "Formal", value: "formal" },
                    { label: "Casual", value: "casual" },
                    { label: "Sensational", value: "sensational" },
                  ]}
                />
                <GlassSelect
                  label="Output Length"
                  value={settings.length}
                  onChange={(v) => updateSettings({ length: v as "match" | "summary" })}
                  options={[
                    { label: "Match Original", value: "match" },
                    { label: "Bullet Point Summary", value: "summary" },
                  ]}
                />
              </div>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* AI Prompt Template                                   */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-500" />
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    AI Prompt Template
                  </h2>
                </div>
                {settings.promptTemplate && (
                  <button
                    onClick={() => updateSettings({ promptTemplate: "" })}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Default
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Customize the prompt sent to Gemini. Use placeholders:{" "}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{"{{paraphrasingInstructions}}"}</code>{" "}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{"{{toneInstructions}}"}</code>{" "}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{"{{lengthInstructions}}"}</code>{" "}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{"{{title}}"}</code>{" "}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{"{{articleText}}"}</code>
              </p>
              <textarea
                value={settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE}
                onChange={(e) => updateSettings({ promptTemplate: e.target.value })}
                rows={12}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 font-mono placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all resize-y"
              />
              <p className="mt-2 text-[11px] text-gray-400">
                Leave empty or reset to use the built-in default prompt.
              </p>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* API Keys                                             */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Key className="w-4 h-4 text-violet-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  API Keys
                </h2>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gemini API Key
                </label>
                <div className="relative">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    value={settings.geminiApiKey}
                    onChange={(e) => updateSettings({ geminiApiKey: e.target.value })}
                    placeholder="Enter your Gemini API key"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">
                  Overrides the GEMINI_API_KEY environment variable when set.
                </p>
              </div>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* General Preferences                                  */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  General
                </h2>
              </div>
              <div className="space-y-4">
                <GlassSelect
                  label="Default Headlines to Fetch"
                  value={String(settings.defaultHeadlineCount)}
                  onChange={(v) => updateSettings({ defaultHeadlineCount: parseInt(v) })}
                  options={[
                    { label: "5 headlines", value: "5" },
                    { label: "10 headlines", value: "10" },
                    { label: "15 headlines", value: "15" },
                    { label: "20 headlines", value: "20" },
                  ]}
                />
                <GlassSelect
                  label="Auto-Scrape Interval"
                  value={settings.autoScrapeInterval}
                  onChange={(v) => updateSettings({ autoScrapeInterval: v as AutoScrapeInterval })}
                  options={[
                    { label: "Disabled", value: "disabled" },
                    { label: "Every 5 minutes", value: "5" },
                    { label: "Every 15 minutes", value: "15" },
                    { label: "Every 30 minutes", value: "30" },
                    { label: "Every 60 minutes", value: "60" },
                  ]}
                />
                <GlassToggle
                  label="Auto-exclude processed articles"
                  description="Hide articles that were already processed in the last 48 hours"
                  checked={settings.autoExcludeProcessed}
                  onChange={(v) => updateSettings({ autoExcludeProcessed: v })}
                />
              </div>
            </GlassCard>

            {/* ════════════════════════════════════════════════════ */}
            {/* WordPress Publishing                                 */}
            {/* ════════════════════════════════════════════════════ */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Send className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  WordPress Publishing
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                Connect to a WordPress site using Application Passwords to publish drafts directly.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Site URL
                  </label>
                  <input
                    type="url"
                    value={settings.wordpress.siteUrl}
                    onChange={(e) =>
                      updateSettings({ wordpress: { ...settings.wordpress, siteUrl: e.target.value } })
                    }
                    placeholder="https://yoursite.com"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </label>
                  <input
                    type="text"
                    value={settings.wordpress.username}
                    onChange={(e) =>
                      updateSettings({ wordpress: { ...settings.wordpress, username: e.target.value } })
                    }
                    placeholder="admin"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Application Password
                  </label>
                  <div className="relative">
                    <input
                      type={showWpPassword ? "text" : "password"}
                      value={settings.wordpress.appPassword}
                      onChange={(e) =>
                        updateSettings({ wordpress: { ...settings.wordpress, appPassword: e.target.value } })
                      }
                      placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                      className={`${inputCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowWpPassword(!showWpPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showWpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Test Connection */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={testWpConnection}
                    disabled={wpTesting || !settings.wordpress.siteUrl || !settings.wordpress.username || !settings.wordpress.appPassword}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.97] rounded-lg text-sm text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {wpTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Timer className="w-4 h-4" />}
                    Test Connection
                  </button>
                  {wpTestResult && (
                    <span
                      className={`flex items-center gap-1.5 text-xs ${
                        wpTestResult.ok ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {wpTestResult.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {wpTestResult.msg}
                    </span>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}
