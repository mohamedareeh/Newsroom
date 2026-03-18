"use client";

// ─── Login Page ────────────────────────────────────────────
// Premium split-panel sign-in page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, ShieldCheck, Loader2, AlertCircle, User, Lock, Rss, PenTool, Globe } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-[#4F6DF5] focus:ring-2 focus:ring-[#4F6DF5]/10 transition-all duration-200";

  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel: Branding (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[480px] bg-gradient-to-br from-[#1B2332] via-[#232F42] to-[#141B27] relative overflow-hidden flex-col justify-between p-12">
        {/* Decorative circles */}
        <div className="absolute top-[-80px] right-[-60px] w-[300px] h-[300px] rounded-full border border-white/[0.04]" />
        <div className="absolute bottom-[-120px] left-[-80px] w-[400px] h-[400px] rounded-full border border-white/[0.03]" />
        <div className="absolute top-[40%] right-[20%] w-[180px] h-[180px] rounded-full bg-[#4F6DF5]/[0.04]" />

        {/* Logo + branding */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="p-2.5 bg-gradient-to-br from-[#4F6DF5] to-[#7C5BF5] rounded-xl">
              <Newspaper className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg tracking-tight">Creative Network</h2>
              <p className="text-white/30 text-xs">News Desk</p>
            </div>
          </div>

          <h1 className="text-white/90 text-3xl font-bold leading-tight mb-4">
            AI-Powered<br />Dhivehi News Engine
          </h1>
          <p className="text-white/40 text-sm leading-relaxed max-w-[320px]">
            Discover, rewrite, and publish news articles in Dhivehi with the power of AI.
          </p>
        </div>

        {/* Feature pills */}
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-3 text-white/40 text-xs">
            <div className="p-1.5 bg-white/[0.06] rounded-lg">
              <Rss className="w-3.5 h-3.5" />
            </div>
            <span>Multi-source RSS & scraping</span>
          </div>
          <div className="flex items-center gap-3 text-white/40 text-xs">
            <div className="p-1.5 bg-white/[0.06] rounded-lg">
              <PenTool className="w-3.5 h-3.5" />
            </div>
            <span>AI article generation</span>
          </div>
          <div className="flex items-center gap-3 text-white/40 text-xs">
            <div className="p-1.5 bg-white/[0.06] rounded-lg">
              <Globe className="w-3.5 h-3.5" />
            </div>
            <span>WordPress publishing</span>
          </div>
        </div>
      </div>

      {/* ── Right Panel: Login Form ── */}
      <div className="flex-1 flex flex-col">
        {/* Gradient accent bar (mobile only) */}
        <div className="lg:hidden h-1.5 bg-gradient-to-r from-[#4F6DF5] to-[#7C5BF5]" />

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-[400px]">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <div className="p-3 bg-gradient-to-br from-[#4F6DF5] to-[#7C5BF5] rounded-2xl shadow-lg shadow-blue-500/20">
                <Newspaper className="w-8 h-8 text-white" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center lg:text-left">
              Welcome back
            </h1>
            <p className="text-gray-400 text-sm mb-8 text-center lg:text-left">
              Sign in to your News Desk account
            </p>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-sm mb-4 animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Login form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.97] text-white font-medium py-3.5 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="flex items-center justify-center gap-2 mt-8 text-gray-300 text-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Access restricted to authorized administrators</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
