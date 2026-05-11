"use client";

// ─── Fact-Check Panel ───────────────────────────────────────
// Calls POST /api/fact-check and renders the AI's claim list with
// verdicts and source links. Drop this anywhere editorially-final
// content lives (the /article output, or the /manual editor).

import { useState, useCallback } from "react";
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  XCircle,
  ExternalLink,
  Scale,
} from "lucide-react";

interface ClaimVerdict {
  claim: string;
  verdict: "verified" | "unverified" | "contested" | "false";
  evidence?: string;
  sources?: { title?: string; uri: string }[];
}

interface Props {
  title?: string;
  content: string;
}

export default function FactCheckPanel({ title, content }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [claims, setClaims] = useState<ClaimVerdict[] | null>(null);
  const [citations, setCitations] = useState<{ title?: string; uri: string }[]>([]);

  const run = useCallback(async () => {
    if (!content.trim()) return;
    setLoading(true);
    setError("");
    setWarning("");
    setClaims(null);
    setCitations([]);
    try {
      const res = await fetch("/api/fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setClaims(Array.isArray(data.claims) ? data.claims : []);
      setCitations(Array.isArray(data.citations) ? data.citations : []);
      if (data.warning) setWarning(data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fact-check failed");
    } finally {
      setLoading(false);
    }
  }, [content, title]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>Run an AI fact-check pass with live web search.</span>
        </div>
        <button
          onClick={run}
          disabled={loading || !content.trim()}
          className="glass-btn flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" />
          )}
          {loading ? "Checking…" : "Fact-check"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {warning && claims && claims.length === 0 && (
        <div className="glass-soft rounded-xl p-3 text-xs text-muted">{warning}</div>
      )}

      {claims && claims.length > 0 && (
        <div className="space-y-2">
          {claims.map((c, i) => (
            <ClaimRow key={i} claim={c} />
          ))}
          <Summary claims={claims} />
        </div>
      )}

      {claims && claims.length === 0 && !warning && !error && (
        <p className="text-sm text-muted text-center py-4">No claims extracted.</p>
      )}

      {citations.length > 0 && (
        <details className="glass-soft rounded-xl">
          <summary className="cursor-pointer px-3 py-2 text-xs text-muted">
            All sources cited ({citations.length})
          </summary>
          <div className="px-3 pb-3 space-y-1">
            {citations.map((c, i) => (
              <a
                key={i}
                href={c.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-secondary hover:text-primary"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{c.title || c.uri}</span>
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ClaimRow({ claim }: { claim: ClaimVerdict }) {
  const { icon, color, label } = verdictStyle(claim.verdict);
  return (
    <div className="glass-soft rounded-2xl p-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5" style={{ color }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color }}
            >
              {label}
            </span>
          </div>
          <p className="text-sm text-primary mb-2">{claim.claim}</p>
          {claim.evidence && (
            <p className="text-xs text-secondary">{claim.evidence}</p>
          )}
          {claim.sources && claim.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {claim.sources.map((s, i) => (
                <a
                  key={i}
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-primary px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent-soft)" }}
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[160px]">{hostOf(s.uri)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ claims }: { claims: ClaimVerdict[] }) {
  const counts = {
    verified: 0,
    unverified: 0,
    contested: 0,
    false: 0,
  };
  for (const c of claims) counts[c.verdict]++;
  const flagged = counts.unverified + counts.contested + counts.false;
  return (
    <div className="glass-soft rounded-xl p-3 flex items-center gap-3 text-xs flex-wrap">
      <Scale className="w-3.5 h-3.5 text-muted" />
      <span className="text-muted">
        {claims.length} claim{claims.length === 1 ? "" : "s"} reviewed —
      </span>
      <span className="flex items-center gap-1 text-emerald-600">
        <CheckCircle2 className="w-3 h-3" /> {counts.verified} verified
      </span>
      {flagged > 0 && (
        <span className="flex items-center gap-1 text-amber-600">
          <HelpCircle className="w-3 h-3" /> {flagged} flagged
        </span>
      )}
    </div>
  );
}

function verdictStyle(v: ClaimVerdict["verdict"]) {
  switch (v) {
    case "verified":
      return { icon: <CheckCircle2 className="w-4 h-4" />, color: "#10b981", label: "Verified" };
    case "unverified":
      return { icon: <HelpCircle className="w-4 h-4" />, color: "#f59e0b", label: "Unverified" };
    case "contested":
      return { icon: <Scale className="w-4 h-4" />, color: "#f59e0b", label: "Contested" };
    case "false":
      return { icon: <XCircle className="w-4 h-4" />, color: "#ef4444", label: "False" };
  }
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}
