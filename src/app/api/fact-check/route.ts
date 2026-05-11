// ─── AI Fact-Check Pass ────────────────────────────────────
// POST /api/fact-check
// Extracts the factual claims from an article and verifies each
// against live Google Search via Gemini grounding. Returns a list
// of claims with verdicts and source links.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";

interface FactCheckRequest {
  title?: string;
  content: string;
}

interface ClaimVerdict {
  claim: string;
  verdict: "verified" | "unverified" | "contested" | "false";
  evidence?: string;
  sources?: { title?: string; uri: string }[];
}

function parseJsonLoose(text: string): unknown | null {
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Strip ```json fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // Pull first { ... } block
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try { return JSON.parse(obj[0]); } catch {}
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FactCheckRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = (body.content || "").trim();
  const title = (body.title || "").trim();
  if (!content) {
    return NextResponse.json({ error: "Provide article content to check." }, { status: 400 });
  }

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured." },
      { status: 400 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = shared.composeModel || "gemini-2.5-flash";

  // Use grounded search if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelConfig: any = {
    model: modelId,
    tools: [{ googleSearch: {} }],
  };
  const model = genAI.getGenerativeModel(modelConfig);

  const prompt = `You are a meticulous fact-checker for a Dhivehi newsroom. Read the article below (may be in Dhivehi or English) and verify its factual claims against live web search.

STEPS:
1. Identify the 3-8 most important VERIFIABLE factual claims (specific numbers, names, dates, events, attributions). Skip generic statements or opinions.
2. For each claim, search the web. Decide one of these verdicts:
   - "verified"   — multiple reliable sources confirm the claim as stated
   - "unverified" — couldn't find clear corroboration; needs reporter follow-up
   - "contested"  — credible sources disagree on the claim
   - "false"      — sources contradict the claim
3. For each, write a one-sentence "evidence" note in English explaining what the search showed.

Reply with ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{
  "claims": [
    { "claim": "string (in original language)", "verdict": "verified|unverified|contested|false", "evidence": "string in English" }
  ]
}

ARTICLE TITLE: ${title || "(none)"}

ARTICLE:
${content}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = (response.text() || "").trim();

    // Collect citations from grounding metadata, keyed by their URI.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = (response as any).candidates;
    const gm = candidates?.[0]?.groundingMetadata;
    const chunks = gm?.groundingChunks || gm?.grounding_chunks || [];
    const supports = gm?.groundingSupports || gm?.grounding_supports || [];

    const citationsByUri = new Map<string, { title?: string; uri: string }>();
    for (const c of chunks) {
      const web = c?.web;
      if (web?.uri && !citationsByUri.has(web.uri)) {
        citationsByUri.set(web.uri, { uri: web.uri, title: web.title });
      }
    }

    const parsed = parseJsonLoose(text);
    const rawClaims = (parsed as { claims?: unknown })?.claims;
    let claims: ClaimVerdict[] = [];

    if (Array.isArray(rawClaims)) {
      claims = rawClaims
        .map((c) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const obj = c as any;
          const verdict = (obj?.verdict || "").toLowerCase();
          if (!obj?.claim || !["verified", "unverified", "contested", "false"].includes(verdict)) {
            return null;
          }
          return {
            claim: String(obj.claim),
            verdict: verdict as ClaimVerdict["verdict"],
            evidence: obj.evidence ? String(obj.evidence) : undefined,
            sources: [],
          } as ClaimVerdict;
        })
        .filter((x): x is ClaimVerdict => x !== null);
    }

    // Attach top citations to each claim (best-effort: distribute the global list)
    // If groundingSupports map claims to chunks we use that; otherwise we just
    // append the global citation list to the response.
    const allCitations = Array.from(citationsByUri.values());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of supports as any[]) {
      const idx = s?.segment?.partIndex ?? null;
      const chunkIdx: number[] = s?.groundingChunkIndices || [];
      if (idx === null) continue;
      // We don't have a strict claim->segment map without more structure;
      // just attach to the closest claim by sequential index.
      const target = claims[idx % Math.max(1, claims.length)];
      if (target) {
        target.sources = target.sources || [];
        for (const ci of chunkIdx) {
          const web = chunks[ci]?.web;
          if (web?.uri && !target.sources.some((x) => x.uri === web.uri)) {
            target.sources.push({ uri: web.uri, title: web.title });
          }
        }
      }
    }

    if (claims.length === 0) {
      return NextResponse.json({
        claims: [],
        citations: allCitations,
        warning: "Couldn't extract structured claims from the model output.",
        raw: text.slice(0, 500),
      });
    }

    return NextResponse.json({ claims, citations: allCitations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fact-check failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const maxDuration = 60;
