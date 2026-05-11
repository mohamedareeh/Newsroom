// ─── Inline AI Edit on Selection ───────────────────────────
// POST /api/edit-selection
// Takes a chunk of text (typically the user's current selection)
// plus an intent and returns the AI's rewrite. Non-streaming for
// simplicity — selections are usually short and the latency is fine.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";
import { glossaryPromptBlock, GlossaryPayload } from "@/lib/useGlossary";

type Intent = "rewrite" | "shorten" | "expand" | "fix" | "translate_dv" | "translate_en";

interface EditRequest {
  text: string;
  intent: Intent;
  /** Optional surrounding article text so the model has context. */
  context?: string;
  glossary?: GlossaryPayload;
}

const INTENT_PROMPTS: Record<Intent, string> = {
  rewrite:
    "Rewrite the selected text more clearly in the same language as the original. Keep the meaning and every fact intact. Preserve length within ±15%.",
  shorten:
    "Shorten the selected text. Aim for roughly half the length while keeping every fact. Same language as the original.",
  expand:
    "Expand the selected text with more detail and richer phrasing. Keep every fact from the original. Same language as the original. Aim for 1.5–2x length.",
  fix:
    "Fix grammar, spelling, punctuation and awkward phrasing in the selected text. Preserve the original meaning, language and length. Do not change facts.",
  translate_dv:
    "Translate the selected text into clean, natural Dhivehi (Thaana script). Preserve every fact and proper noun. No transliteration — Thaana script only.",
  translate_en:
    "Translate the selected text into clear, idiomatic English. Preserve every fact and proper noun.",
};

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EditRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const context = (body.context || "").trim();
  const intent = body.intent;

  if (!text) {
    return NextResponse.json({ error: "No text selected to edit." }, { status: 400 });
  }
  if (!INTENT_PROMPTS[intent]) {
    return NextResponse.json({ error: `Unsupported intent: ${intent}` }, { status: 400 });
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
  const model = genAI.getGenerativeModel({ model: modelId });

  const glossaryEntries = (body.glossary || []).map((g, i) => ({
    id: String(i),
    term: g.term,
    fullForm: g.fullForm,
    role: g.role,
    createdAt: 0,
    updatedAt: 0,
  }));
  const glossaryBlock = glossaryPromptBlock(glossaryEntries);

  const contextBlock = context
    ? `\n\nSURROUNDING ARTICLE CONTEXT (for reference only — do not output this):\n${context.slice(0, 4000)}`
    : "";

  const prompt = `You are an experienced editor at a Dhivehi newsroom. ${INTENT_PROMPTS[intent]}

IMPORTANT:
- Output ONLY the replacement text. No preamble. No "here is the rewrite:". No quotes around the result.
- Do not include any meta-commentary.${glossaryBlock}

SELECTED TEXT:
${text}${contextBlock}

REPLACEMENT:`;

  try {
    const result = await model.generateContent(prompt);
    let out = (result.response.text() || "").trim();
    // Strip leading/trailing wrapping quotes the model sometimes adds.
    if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
      out = out.slice(1, -1).trim();
    }
    if (!out) {
      return NextResponse.json({ error: "Empty result" }, { status: 502 });
    }
    return NextResponse.json({ result: out, intent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Edit failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
