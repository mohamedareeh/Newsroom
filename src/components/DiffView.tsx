"use client";

// ─── Article Diff View ─────────────────────────────────────
// Side-by-side "before / after" with token-level inline diff
// highlighting. Pure-client, no dependencies — uses a simple LCS
// to compute the diff over whitespace-separated tokens.

import { useMemo } from "react";

interface Props {
  before: string;
  after: string;
  /** RTL for Dhivehi. */
  rtl?: boolean;
  /** Optional title shown above the panels. */
  label?: string;
  beforeLabel?: string;
  afterLabel?: string;
}

type DiffOp = { type: "equal" | "del" | "ins"; text: string };

// Split into tokens but preserve whitespace so we can recombine cleanly.
function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) || [];
}

// Compute LCS-based diff between two token arrays.
function diffTokens(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;

  // For very large inputs we fall back to a coarser line-diff to stay snappy.
  if (n * m > 800_000) {
    return diffByLines(a.join(""), b.join(""));
  }

  // Build LCS length table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Walk to produce ops
  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: a[i] });
      i++;
    } else {
      ops.push({ type: "ins", text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", text: a[i++] });
  while (j < m) ops.push({ type: "ins", text: b[j++] });
  // Coalesce consecutive ops
  return coalesce(ops);
}

function coalesce(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

// Fallback line-level diff for very large texts.
function diffByLines(a: string, b: string): DiffOp[] {
  const aLines = a.split(/(\n)/);
  const bLines = b.split(/(\n)/);
  return diffTokens(aLines, bLines);
}

export default function DiffView({
  before,
  after,
  rtl,
  label,
  beforeLabel = "Before",
  afterLabel = "After",
}: Props) {
  const ops = useMemo(() => diffTokens(tokenize(before), tokenize(after)), [before, after]);

  // Rebuild for display: Before pane shows equals + dels; After pane shows equals + ins.
  const beforeNodes: React.ReactNode[] = [];
  const afterNodes: React.ReactNode[] = [];
  let keyCounter = 0;
  for (const op of ops) {
    const k = ++keyCounter;
    if (op.type === "equal") {
      beforeNodes.push(<span key={`b${k}`}>{op.text}</span>);
      afterNodes.push(<span key={`a${k}`}>{op.text}</span>);
    } else if (op.type === "del") {
      beforeNodes.push(
        <span
          key={`b${k}`}
          className="rounded px-0.5"
          style={{ background: "rgba(239, 68, 68, 0.18)", color: "#ef4444" }}
        >
          {op.text}
        </span>
      );
    } else {
      afterNodes.push(
        <span
          key={`a${k}`}
          className="rounded px-0.5"
          style={{ background: "rgba(16, 185, 129, 0.18)", color: "#10b981" }}
        >
          {op.text}
        </span>
      );
    }
  }

  // Stats
  const dels = ops.filter((o) => o.type === "del").length;
  const ins = ops.filter((o) => o.type === "ins").length;

  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
          <p className="text-[10px] text-faint">
            <span className="text-red-500">{dels} removed</span>
            {" · "}
            <span className="text-emerald-500">{ins} added</span>
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="glass-soft rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">
            {beforeLabel}
          </p>
          <div
            className={`whitespace-pre-wrap text-sm text-secondary ${rtl ? "dhivehi-output" : ""} max-h-[60vh] overflow-y-auto`}
            dir={rtl ? "rtl" : "ltr"}
          >
            {beforeNodes}
          </div>
        </div>
        <div className="glass-soft rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">
            {afterLabel}
          </p>
          <div
            className={`whitespace-pre-wrap text-sm text-primary ${rtl ? "dhivehi-output" : ""} max-h-[60vh] overflow-y-auto`}
            dir={rtl ? "rtl" : "ltr"}
          >
            {afterNodes}
          </div>
        </div>
      </div>
    </div>
  );
}
