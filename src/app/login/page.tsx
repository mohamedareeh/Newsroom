"use client";

// ─── Login Page ────────────────────────────────────────────
// Clean light-themed sign-in page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, ShieldCheck, Loader2, AlertCircle, User, Lock } from "lucide-react";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa]">
      <div className="bg-white shadow-lg rounded-2xl p-12 max-w-md w-full mx-4 border border-gray-100">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <Newspaper className="w-10 h-10 text-[#5D87FF]" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">
          Creative Network
        </h1>
        <p className="text-gray-400 text-sm mb-8 text-center">
          News Desk — Internal Tool
        </p>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 mb-6 text-amber-600 text-xs">
          <ShieldCheck className="w-4 h-4" />
          <span>Authorized personnel only</span>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
              className="w-full bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#5D87FF] hover:bg-[#4A70E0] text-white font-medium py-3.5 px-6 rounded-xl transition-all duration-300 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="mt-6 text-gray-400 text-xs text-center">
          Access restricted to authorized administrators
        </p>
      </div>
    </div>
  );
}
