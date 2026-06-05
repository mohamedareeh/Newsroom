"use client";

// ─── Settings Page ─────────────────────────────────────────
// Manage news sources, AI behavior, prompt template, API keys,
// auto-scrape, WordPress publishing, and general preferences.

import { useState, useEffect, useCallback, useRef } from "react";
import {
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
  MessageCircle,
  Facebook,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  RotateCcw,
  Settings2,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import GlassSelect from "@/components/GlassSelect";
import GlassToggle from "@/components/GlassToggle";
import BottomNav from "@/components/BottomNav";
import { useSettings } from "@/lib/useSettings";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  DHIVEHI_NEWS_SOURCES,
  NewsSource,
  AutoScrapeInterval,
  DEFAULT_PROMPT_TEMPLATE,
  GEMINI_MODELS,
} from "@/lib/config";

export default function SettingsPage() {
  const { settings, updateSettings, loaded } = useSettings();
  const { isAdmin: userIsAdmin, loaded: userLoaded } = useCurrentUser();

  // Shared settings (server-side, admin-configured)
  const [shared, setShared] = useState({
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    composeModel: "gemini-2.5-flash",
    promptTemplate: "",
    wordpress: { siteUrl: "", username: "", appPassword: "" },
    wordpressDhivehi: { siteUrl: "", username: "", appPassword: "" },
    wordpressEnglish: { siteUrl: "", username: "", appPassword: "" },
    telegram: { botToken: "", chatId: "" },
    facebook: { pageAccessToken: "", pageId: "" },
    ifttt: { webhookKey: "", defaultEvent: "news_share" },
    blobReadWriteToken: "",
    autoPostFb: {
      enabled: false,
      rssUrl: "https://dhen.mv/feed",
      captionTemplate: "{title}\n\n{link}",
    },
    customSources: [] as NewsSource[],
    removedDefaultSourceIds: [] as string[],
    enabledSourceIds: [] as string[],
  });

  const fetchShared = useCallback(async () => {
    try {
      const res = await fetch("/api/shared-settings");
      const data = await res.json();
      if (!data.error) setShared(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchShared(); }, [fetchShared]);

  // Optimistic + debounced save. The previous implementation made every
  // keystroke wait on a POST + GET round-trip — because the input's
  // `value` prop was bound to server-fetched state, the field appeared
  // frozen and characters often didn't show up at all.
  // Now we update local state instantly and debounce the persist by 450ms.
  const pendingPartial = useRef<Record<string, unknown>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateShared = useCallback((partial: Record<string, unknown>) => {
    // 1. Optimistic local update — instant UI feedback.
    setShared((prev) => {
      const next: typeof prev = { ...prev };
      for (const [k, v] of Object.entries(partial)) {
        const cur = (prev as Record<string, unknown>)[k];
        if (
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          cur &&
          typeof cur === "object" &&
          !Array.isArray(cur)
        ) {
          // Shallow-merge nested objects (e.g. ifttt, telegram, wordpressEnglish).
          (next as Record<string, unknown>)[k] = { ...(cur as object), ...(v as object) };
        } else {
          (next as Record<string, unknown>)[k] = v;
        }
      }
      return next;
    });

    // 2. Accumulate partials and debounce the persist.
    for (const [k, v] of Object.entries(partial)) {
      const existing = pendingPartial.current[k];
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        existing &&
        typeof existing === "object" &&
        !Array.isArray(existing)
      ) {
        pendingPartial.current[k] = { ...(existing as object), ...(v as object) };
      } else {
        pendingPartial.current[k] = v;
      }
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const toSend = pendingPartial.current;
      pendingPartial.current = {};
      try {
        await fetch("/api/shared-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toSend),
        });
        // No re-fetch — the local state is already authoritative.
      } catch { /* ignore — user can retry */ }
    }, 450);
  }, []);

  // Custom source form state
  const [newLabel, setNewLabel] = useState("");
  const [newRssUrl, setNewRssUrl] = useState("");
  const [newScrapeUrl, setNewScrapeUrl] = useState("");

  // API key visibility
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showWpPassword, setShowWpPassword] = useState(false);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [showFacebookToken, setShowFacebookToken] = useState(false);

  // WP test connection
  const [wpTesting, setWpTesting] = useState(false);
  const [wpTestResult, setWpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // User management
  const [users, setUsers] = useState<Array<{ username: string; role: string }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
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
        body: JSON.stringify({ action: "add", username: newUsername.trim(), password: newPassword, role: newRole }),
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

  if (!loaded || !userLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#1a1a1a] animate-spin" />
      </div>
    );
  }

  // Effective sources from shared settings
  const effectiveSources = (() => {
    const defaults = DHIVEHI_NEWS_SOURCES.filter(
      (s) => !shared.removedDefaultSourceIds.includes(s.id)
    );
    return [...defaults, ...(shared.customSources || [])];
  })();

  const enabledIds = shared.enabledSourceIds;
  const allEnabled = effectiveSources.length > 0 &&
    (enabledIds.length === 0 || effectiveSources.every((s) => enabledIds.includes(s.id)));

  const toggleSource = (id: string) => {
    // If enabledIds is empty, all are enabled — initialize with all minus this one
    if (enabledIds.length === 0) {
      const allIds = effectiveSources.map((s) => s.id).filter((x) => x !== id);
      updateShared({ enabledSourceIds: allIds });
    } else {
      const next = enabledIds.includes(id)
        ? enabledIds.filter((x) => x !== id)
        : [...enabledIds, id];
      updateShared({ enabledSourceIds: next });
    }
  };

  const toggleAllSources = () => {
    if (allEnabled) {
      updateShared({ enabledSourceIds: ["__none__"] }); // Empty but not "all"
    } else {
      updateShared({ enabledSourceIds: [] }); // Empty = all enabled
    }
  };

  const isSourceEnabled = (id: string) => {
    if (enabledIds.length === 0) return true; // empty = all
    if (enabledIds.includes("__none__")) return false;
    return enabledIds.includes(id);
  };

  // ── Custom source management (admin only, saved to KV) ──
  const addCustomSource = () => {
    if (!newLabel.trim() || !newScrapeUrl.trim()) return;
    const id = "custom-" + Date.now();
    const source: NewsSource = {
      id,
      label: newLabel.trim(),
      rssUrl: newRssUrl.trim() || undefined,
      scrapeUrl: newScrapeUrl.trim(),
    };
    // Add source and auto-enable it
    const updatedCustomSources = [...(shared.customSources || []), source];
    const updatedEnabled = enabledIds.length > 0 && !enabledIds.includes("__none__")
      ? [...enabledIds, id]
      : enabledIds;
    updateShared({
      customSources: updatedCustomSources,
      enabledSourceIds: updatedEnabled,
    });
    setNewLabel("");
    setNewRssUrl("");
    setNewScrapeUrl("");
  };

  const removeSource = (source: NewsSource) => {
    const isDefault = DHIVEHI_NEWS_SOURCES.some((s) => s.id === source.id);
    if (isDefault) {
      updateShared({
        removedDefaultSourceIds: [...shared.removedDefaultSourceIds, source.id],
      });
    } else {
      updateShared({
        customSources: (shared.customSources || []).filter((s) => s.id !== source.id),
      });
    }
  };

  const restoreDefaults = () => {
    updateShared({
      removedDefaultSourceIds: [],
      enabledSourceIds: [],
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
        body: JSON.stringify({ action: "categories" }),
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
  const inputCls = "w-full bg-[#f5f3f0] border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:bg-white focus:border-[#1a1a1a] focus:ring-2 focus:ring-black/5 transition-all";

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Page Title */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Settings2 className="w-5 h-5 text-[#1a1a1a]" />
            <h2 className="text-xl font-bold text-gray-900">Settings</h2>
          </div>
          <p className="text-sm text-gray-500">Manage sources, AI, auto-scrape & WordPress</p>
        </div>

        <div className="space-y-6">
          {/* ════════════════════════════════════════════════════ */}
          {/* User Management (Admin Only)                         */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (<>
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-4 h-4 text-[#1a1a1a]" />
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
                users.map((u) => {
                  return (
                    <div
                      key={u.username}
                      className="flex items-center justify-between gap-3 p-3 bg-[#f0ede8] border border-gray-200 rounded-xl"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-700">{u.username}</p>
                        {u.role === "admin" && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#f0ede8] text-[#1a1a1a] rounded text-[10px]">
                            <Shield className="w-2.5 h-2.5" />
                            Admin
                          </span>
                        )}
                        {u.role === "user" && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                            User
                          </span>
                        )}
                      </div>
                      {u.role !== "admin" && (
                        <button
                          onClick={() => handleRemoveUser(u.username)}
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
            <div className="p-4 bg-[#f0ede8] border border-gray-200 rounded-xl space-y-3">
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
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
                className={inputCls}
              >
                <option value="user">Regular User</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={handleAddUser}
                disabled={!newUsername.trim() || !newPassword.trim() || userAdding}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#333] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] rounded-lg text-sm text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {userAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add User
              </button>
            </div>
          </GlassCard>
          </>)}

          {/* ════════════════════════════════════════════════════ */}
          {/* Source Management (Admin Only)                       */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (<>
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  News Sources
                </h2>
              </div>
              {shared.removedDefaultSourceIds.length > 0 && (
                <button
                  onClick={restoreDefaults}
                  className="text-xs text-[#1a1a1a] hover:underline transition-colors"
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
                    className="flex items-center justify-between gap-3 p-3 bg-[#f0ede8] border border-gray-200 rounded-xl"
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
            <div className="p-4 bg-[#f0ede8] border border-gray-200 rounded-xl space-y-3">
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
                className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#333] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] rounded-lg text-sm text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Source
              </button>
            </div>
          </GlassCard>

          {/* ════════════════════════════════════════════════════ */}
          {/* Source Enable/Disable Toggles (Admin Only)           */}
          {/* ════════════════════════════════════════════════════ */}
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Rss className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Enabled Sources
                </h2>
              </div>
              <button
                onClick={toggleAllSources}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {allEnabled ? <ToggleRight className="w-4 h-4 text-[#1a1a1a]" /> : <ToggleLeft className="w-4 h-4" />}
                {allEnabled ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="space-y-1.5">
              {effectiveSources.map((source) => (
                <GlassToggle
                  key={source.id}
                  label={source.label}
                  description={source.rssUrl || source.scrapeUrl}
                  checked={isSourceEnabled(source.id)}
                  onChange={() => toggleSource(source.id)}
                />
              ))}
            </div>
          </GlassCard>
          </>)}

          {/* ════════════════════════════════════════════════════ */}
          {/* AI Settings (visible to all)                         */}
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
                value={shared.geminiModel || "gemini-2.5-flash"}
                onChange={(v) => updateShared({ geminiModel: v })}
                options={GEMINI_MODELS.map((m) => ({ label: m.label, value: m.value }))}
              />
              <GlassSelect
                label="AI Writer Model"
                value={shared.composeModel || "gemini-2.5-flash"}
                onChange={(v) => updateShared({ composeModel: v })}
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
          {/* AI Prompt Template (Admin Only)                       */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (<>
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  AI Prompt Template
                </h2>
              </div>
              {shared.promptTemplate && (
                <button
                  onClick={() => updateShared({ promptTemplate: "" })}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to Default
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Customize the prompt sent to Gemini. Use placeholders:{" "}
              <code className="px-1 py-0.5 bg-[#f0ede8] rounded text-[11px] text-gray-600">{"{{paraphrasingInstructions}}"}</code>{" "}
              <code className="px-1 py-0.5 bg-[#f0ede8] rounded text-[11px] text-gray-600">{"{{toneInstructions}}"}</code>{" "}
              <code className="px-1 py-0.5 bg-[#f0ede8] rounded text-[11px] text-gray-600">{"{{lengthInstructions}}"}</code>{" "}
              <code className="px-1 py-0.5 bg-[#f0ede8] rounded text-[11px] text-gray-600">{"{{title}}"}</code>{" "}
              <code className="px-1 py-0.5 bg-[#f0ede8] rounded text-[11px] text-gray-600">{"{{articleText}}"}</code>
            </p>
            <textarea
              value={shared.promptTemplate || DEFAULT_PROMPT_TEMPLATE}
              onChange={(e) => updateShared({ promptTemplate: e.target.value })}
              rows={12}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 font-mono placeholder:text-gray-400 focus:outline-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-black/10 transition-all resize-y"
            />
            <p className="mt-2 text-[11px] text-gray-400">
              Leave empty or reset to use the built-in default prompt.
            </p>
          </GlassCard>
          </>)}

          {/* ════════════════════════════════════════════════════ */}
          {/* API Keys (Admin Only)                                */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (<>
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
                  value={shared.geminiApiKey}
                  onChange={(e) => updateShared({ geminiApiKey: e.target.value })}
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
          </>)}

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
          {/* WordPress Publishing (Admin Only)                    */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Send className="w-4 h-4 text-[#1a1a1a]" />
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
                  value={shared.wordpress.siteUrl}
                  onChange={(e) =>
                    updateShared({ wordpress: { ...shared.wordpress, siteUrl: e.target.value } })
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
                  value={shared.wordpress.username}
                  onChange={(e) =>
                    updateShared({ wordpress: { ...shared.wordpress, username: e.target.value } })
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
                    value={shared.wordpress.appPassword}
                    onChange={(e) =>
                      updateShared({ wordpress: { ...shared.wordpress, appPassword: e.target.value } })
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
                  disabled={wpTesting || !shared.wordpress.siteUrl || !shared.wordpress.username || !shared.wordpress.appPassword}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#333] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] rounded-lg text-sm text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* Pipeline WordPress sites (Admin Only)                */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Send className="w-4 h-4 text-[#1a1a1a]" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Multi-Publish Pipeline Sites
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                The /multi-publish pipeline publishes Dhivehi drafts to the first site and English
                drafts to the second. If a slot is empty, it falls back to the main WordPress
                site above.
              </p>
              <div className="space-y-6">
                <p className="text-[11px] text-gray-500 -mt-3 mb-1">
                  Settings save automatically as you type — wait a second after pasting, then hit
                  Test Connection.
                </p>
                {([
                  {
                    label: "Dhivehi site",
                    key: "wordpressDhivehi" as const,
                    placeholder: "https://dhen.mv",
                    categoryPlaceholder: "World News",
                  },
                  {
                    label: "English site",
                    key: "wordpressEnglish" as const,
                    placeholder: "https://maldivesinsight.com",
                    categoryPlaceholder: "World News",
                  },
                ]).map(({ label, key, placeholder, categoryPlaceholder }) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const creds = (shared as any)[key] || { siteUrl: "", username: "", appPassword: "" };
                  return (
                    <div key={key} className="space-y-3">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {label}
                      </p>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Site URL</label>
                        <input
                          type="url"
                          value={creds.siteUrl}
                          onChange={(e) => updateShared({ [key]: { ...creds, siteUrl: e.target.value.trim() } })}
                          placeholder={placeholder}
                          className={inputCls}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Username</label>
                        <input
                          type="text"
                          value={creds.username}
                          onChange={(e) => updateShared({ [key]: { ...creds, username: e.target.value } })}
                          placeholder="admin"
                          className={inputCls}
                          autoComplete="off"
                          spellCheck={false}
                          name={`pipeline-${key}-user`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Application Password
                        </label>
                        <PipelineAppPasswordInput
                          value={creds.appPassword}
                          onChange={(v) => updateShared({ [key]: { ...creds, appPassword: v } })}
                          className={inputCls}
                          slotKey={key}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Default Category
                        </label>
                        <input
                          type="text"
                          value={creds.defaultCategoryName || ""}
                          onChange={(e) =>
                            updateShared({ [key]: { ...creds, defaultCategoryName: e.target.value } })
                          }
                          placeholder={categoryPlaceholder}
                          className={inputCls}
                        />
                        <p className="text-[10px] text-gray-400">
                          Pipeline drafts on this site will be filed under this category. If it doesn't exist, it'll be created.
                        </p>
                      </div>
                      <PipelineTestButton slot={key === "wordpressDhivehi" ? "dhivehi" : "english"} />
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* Telegram Channel (Admin Only)                        */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <MessageCircle className="w-4 h-4 text-[#1a1a1a]" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Telegram Channel
              </h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              Configure a Telegram bot to send social media images to your channel.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bot Token
                </label>
                <div className="relative">
                  <input
                    type={showTelegramToken ? "text" : "password"}
                    value={shared.telegram?.botToken || ""}
                    onChange={(e) =>
                      updateShared({ telegram: { ...shared.telegram, botToken: e.target.value } })
                    }
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelegramToken(!showTelegramToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showTelegramToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chat ID
                </label>
                <input
                  type="text"
                  value={shared.telegram?.chatId || ""}
                  onChange={(e) =>
                    updateShared({ telegram: { ...shared.telegram, chatId: e.target.value } })
                  }
                  placeholder="-1001234567890"
                  className={inputCls}
                />
              </div>
            </div>
          </GlassCard>
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* Facebook Page (Admin Only)                           */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Facebook className="w-4 h-4 text-[#1a1a1a]" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Facebook Page
              </h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              Post social media images to your Facebook Page using the Graph API.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Page Access Token
                </label>
                <div className="relative">
                  <input
                    type={showFacebookToken ? "text" : "password"}
                    value={shared.facebook?.pageAccessToken || ""}
                    onChange={(e) =>
                      updateShared({ facebook: { ...shared.facebook, pageAccessToken: e.target.value } })
                    }
                    placeholder="EAAxxxxxxx..."
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowFacebookToken(!showFacebookToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showFacebookToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Page ID
                </label>
                <input
                  type="text"
                  value={shared.facebook?.pageId || ""}
                  onChange={(e) =>
                    updateShared({ facebook: { ...shared.facebook, pageId: e.target.value } })
                  }
                  placeholder="123456789012345"
                  className={inputCls}
                />
              </div>
            </div>
          </GlassCard>
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* Auto-post RSS → Facebook (Admin Only)               */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Send className="w-4 h-4 text-[#1a1a1a]" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Auto-Post RSS → Facebook
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                When enabled, a background cron will watch the RSS feed and post every new item to
                the Facebook Page configured above. Trigger it from an external scheduler (e.g.
                cron-job.org) hitting:
                <br />
                <code className="bg-[#f0ede8] px-1 rounded break-all text-[10px]">
                  https://dhennews.vercel.app/api/cron/auto-post-fb?secret=&lt;CRON_SECRET&gt;
                </code>
                <br />
                <span className="text-[10px]">
                  Set <code className="bg-[#f0ede8] px-1 rounded">CRON_SECRET</code> as an env var on
                  Vercel (any random string ≥ 32 chars). The first cron tick after enabling marks
                  current items as "seen" and posts nothing — subsequent ticks post only genuinely
                  new items.
                </span>
              </p>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!shared.autoPostFb?.enabled}
                    onChange={(e) =>
                      updateShared({
                        autoPostFb: {
                          ...(shared.autoPostFb || {
                            rssUrl: "https://dhen.mv/feed",
                            captionTemplate: "{title}\n\n{link}",
                          }),
                          enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">
                    Enable auto-post (cron ticks will publish new RSS items)
                  </span>
                </label>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    RSS Feed URL
                  </label>
                  <input
                    type="url"
                    value={shared.autoPostFb?.rssUrl || ""}
                    onChange={(e) =>
                      updateShared({
                        autoPostFb: {
                          ...(shared.autoPostFb || {
                            enabled: false,
                            captionTemplate: "{title}\n\n{link}",
                          }),
                          rssUrl: e.target.value.trim(),
                        },
                      })
                    }
                    placeholder="https://dhen.mv/feed"
                    className={inputCls}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Caption Template
                  </label>
                  <textarea
                    value={shared.autoPostFb?.captionTemplate || ""}
                    onChange={(e) =>
                      updateShared({
                        autoPostFb: {
                          ...(shared.autoPostFb || {
                            enabled: false,
                            rssUrl: "https://dhen.mv/feed",
                          }),
                          captionTemplate: e.target.value,
                        },
                      })
                    }
                    placeholder={"{title}\n\n{link}"}
                    rows={3}
                    className={inputCls}
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-gray-400">
                    Variables: <code className="bg-[#f0ede8] px-1 rounded">{"{title}"}</code>{" "}
                    <code className="bg-[#f0ede8] px-1 rounded">{"{link}"}</code>
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-200/60">
                  <p className="text-[11px] text-gray-500 mb-2">
                    💡 Tip — once enabled, set up cron-job.org with a 15-minute schedule pointing at
                    the URL above. Check /report or your FB Page's posts to monitor.
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* IFTTT Webhooks (Admin Only)                          */}
          {/* ════════════════════════════════════════════════════ */}
          {userIsAdmin && (
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Send className="w-4 h-4 text-[#1a1a1a]" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  IFTTT Webhooks
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                Fan out social posts to Instagram, X, LinkedIn, Pinterest, etc. via IFTTT applets.
                Get your key at <a href="https://ifttt.com/maker_webhooks" target="_blank" rel="noopener noreferrer" className="underline">ifttt.com/maker_webhooks</a>,
                then make one applet per platform with trigger "Webhooks → Receive a web request"
                using the event name below. Each applet receives:
                {" "}<code className="bg-[#f0ede8] px-1 rounded">{"{{Value1}}"}</code> = image URL,
                {" "}<code className="bg-[#f0ede8] px-1 rounded">{"{{Value2}}"}</code> = caption,
                {" "}<code className="bg-[#f0ede8] px-1 rounded">{"{{Value3}}"}</code> = source link.
              </p>
              <p className="text-[11px] text-gray-400 mb-5">
                The generated PNG is uploaded to <strong>Vercel Blob</strong> first so IFTTT can fetch
                it. Enable it once: Vercel dashboard → your project → Storage → Create → Blob.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Webhooks Key
                  </label>
                  <IftttKeyInput
                    value={shared.ifttt?.webhookKey || ""}
                    onChange={(v) =>
                      updateShared({
                        ifttt: {
                          ...(shared.ifttt || { defaultEvent: "news_share" }),
                          webhookKey: v,
                        },
                      })
                    }
                    className={inputCls}
                  />
                  <IftttTestButton
                    saved={!!shared.ifttt?.webhookKey}
                    event={shared.ifttt?.defaultEvent || "news_share"}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Default Event Name
                  </label>
                  <input
                    type="text"
                    value={shared.ifttt?.defaultEvent || ""}
                    onChange={(e) =>
                      updateShared({
                        ifttt: {
                          ...(shared.ifttt || { webhookKey: "" }),
                          defaultEvent: e.target.value.trim(),
                        },
                      })
                    }
                    placeholder="news_share"
                    className={inputCls}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-gray-400">
                    Use the same event name in every IFTTT applet you want this button to trigger.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-gray-200/60">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Blob Token (manual override)
                  </label>
                  <IftttKeyInput
                    value={shared.blobReadWriteToken || ""}
                    onChange={(v) => updateShared({ blobReadWriteToken: v })}
                    className={inputCls}
                  />
                  <p className="text-[10px] text-gray-400">
                    Optional fallback. Paste your{" "}
                    <code className="bg-[#f0ede8] px-1 rounded">vercel_blob_rw_…</code> token here
                    if Vercel isn't injecting <code className="bg-[#f0ede8] px-1 rounded">BLOB_READ_WRITE_TOKEN</code>
                    {" "}as an env var. The env var takes precedence when present.
                  </p>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ── IFTTT key input: UNCONTROLLED with explicit Save button. ──
// Why uncontrolled: the controlled version was rendering with value
// from server-fetched state, and a stale fetch landing mid-typing
// could clobber the user's input. Uncontrolled means the DOM owns
// the value while the user is editing it, and we only push it to
// the parent when they click Save (or blur the field after editing).
function IftttKeyInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reveal, setReveal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const lastSavedRef = useRef(value);

  // When the parent value changes (e.g. after initial load), sync the field
  // ONLY if the user hasn't started editing.
  useEffect(() => {
    if (!dirty && inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
      lastSavedRef.current = value;
    }
  }, [value, dirty]);

  const save = () => {
    if (!inputRef.current) return;
    const next = inputRef.current.value.replace(/\s+/g, "");
    inputRef.current.value = next; // strip whitespace visually too
    if (next === lastSavedRef.current) {
      setDirty(false);
      return;
    }
    onChange(next);
    lastSavedRef.current = next;
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          type={reveal ? "text" : "password"}
          defaultValue={value}
          onInput={() => setDirty(true)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder="paste your Webhooks key (then click Save)"
          className={`${className} pr-12 font-mono`}
          autoComplete="off"
          spellCheck={false}
          name="ifttt-webhook-key"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={reveal ? "Hide key" : "Show key"}
        >
          {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={save}
          disabled={!dirty}
          className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#333] text-white rounded-lg transition-all disabled:opacity-40"
        >
          {dirty ? "Save key" : "Saved"}
        </button>
        {savedFlash && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-3.5 h-3.5" />
            Saved to server
          </span>
        )}
        {!savedFlash && value && !dirty && (
          <span className="text-gray-400">{value.length} characters stored</span>
        )}
        {dirty && <span className="text-amber-600">Unsaved changes — click Save (or press Enter)</span>}
      </div>
    </div>
  );
}

function IftttTestButton({ saved, event }: { saved: boolean; event: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            const res = await fetch("/api/ifttt/test", { method: "POST" });
            const data = await res.json();
            setResult({
              ok: !!data.ok,
              msg: data.ok
                ? `Webhook accepted (event: ${event}).`
                : data.message || data.error || `HTTP ${res.status}`,
            });
          } catch (err) {
            setResult({ ok: false, msg: err instanceof Error ? err.message : "Network error" });
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy || !saved}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#333] active:scale-[0.97] rounded-lg text-xs text-white transition-all disabled:opacity-40"
        title={saved ? "Send a test ping to IFTTT" : "Paste the key first"}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Timer className="w-3.5 h-3.5" />}
        Test IFTTT
      </button>
      {result && (
        <span className={`flex items-center gap-1.5 text-xs ${result.ok ? "text-green-600" : "text-red-500"}`}>
          {result.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {result.msg}
        </span>
      )}
    </div>
  );
}

// ── App Password input for a pipeline site with show/hide + paste normalisation ──
function PipelineAppPasswordInput({
  value,
  onChange,
  className,
  slotKey,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  slotKey: string;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <input
        type={reveal ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          // Normalise pasted Application Passwords — WP shows them with
          // non-breaking spaces between groups; strip stray whitespace at the
          // ends but keep the inner spaces (WP accepts both with and without
          // them via Basic auth).
          const raw = e.clipboardData.getData("text") ?? "";
          if (raw && raw !== value) {
            e.preventDefault();
            onChange(raw.replace(/^\s+|\s+$/g, ""));
          }
        }}
        placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
        className={`${className} pr-10 font-mono`}
        autoComplete="new-password"
        spellCheck={false}
        name={`pipeline-${slotKey}-pwd`}
      />
      <button
        type="button"
        onClick={() => setReveal((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label={reveal ? "Hide password" : "Show password"}
      >
        {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── Test connection button for a pipeline WP slot ─────────────
function PipelineTestButton({ slot }: { slot: "dhivehi" | "english" }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", slot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, msg: data.error || `Test failed (${res.status})` });
      } else {
        setResult({
          ok: true,
          msg: `Connected as ${data.username}${data.roles?.length ? ` (${data.roles.join(", ")})` : ""} @ ${data.siteUrl}`,
        });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        onClick={run}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#333] active:scale-[0.97] rounded-lg text-sm text-white transition-all disabled:opacity-30"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Timer className="w-4 h-4" />}
        Test Connection
      </button>
      {result && (
        <span
          className={`flex items-center gap-1.5 text-xs ${result.ok ? "text-green-600" : "text-red-500"}`}
        >
          {result.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {result.msg}
        </span>
      )}
    </div>
  );
}
