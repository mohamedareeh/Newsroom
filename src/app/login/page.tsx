"use client";

// ─── Login Page ────────────────────────────────────────────
// Liquid glass centered card on aurora background.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, Loader2, AlertCircle, Lock, User } from "lucide-react";
import GlassCard from "@/components/GlassCard";

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-8">
          <div
            className="p-3 rounded-2xl glass shadow-lg"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            <Newspaper className="w-7 h-7" />
          </div>
        </div>

        <GlassCard variant="strong" className="p-8">
          <h1 className="text-xl font-semibold text-primary text-center mb-1 tracking-tight">
            Welcome back
          </h1>
          <p className="text-muted text-sm text-center mb-8">
            Sign in to your account
          </p>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm mb-5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  className="glass-input w-full rounded-xl py-3 pl-11 pr-4 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="glass-input w-full rounded-xl py-3 pl-11 pr-4 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-btn w-full flex items-center justify-center gap-2 font-medium py-3 px-6 rounded-xl mt-1"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
            </button>
          </form>
        </GlassCard>

        <p className="text-center text-faint text-xs mt-6">
          Access restricted to authorized administrators
        </p>
      </div>
    </div>
  );
}
