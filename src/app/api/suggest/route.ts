// ─── AI Suggestions (Headlines + Tags) ─────────────────────
// POST /api/suggest
// Generate alternative headlines or tag sets from existing article
// content. Returns a JSON list of N short suggestions.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";
import { glossaryPromptBlock, GlossaryPayload } from "@/lib/useGlossary";

interface SuggestRequest {
  content: string;
  kind: "headlines" | "tags";
  count?: number;
  title?: string;
  glossary?: GlossaryPayload;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SuggestRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = (body.content || "").trim();
  const kind = body.kind === "tags" ? "tags" : "headlines";
  const count = Math.max(1, Math.min(8, body.count || (kind === "tags" ? 5 : 5)));
  const title = (body.title || "").trim();

  if (!content && !title) {
    return NextResponse.json(
      { error: "Provide article content (or at least a working title)." },
      { status: 400 }
    );
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

  // Build prompt. Convert glossary client payload to GlossaryEntry-ish for the helper.
  const glossaryEntries = (body.glossary || []).map((g, i) => ({
    id: String(i),
    term: g.term,
    fullForm: g.fullForm,
    role: g.role,
    createdAt: 0,
    updatedAt: 0,
  }));
  const glossaryBlock = glossaryPromptBlock(glossaryEntries);

  const prompt =
    kind === "headlines"
      ? `You are a Dhivehi headline writer. Read the article below and propose ${count} ALTERNATIVE headline options, each in Dhivehi (Thaana script).

RULES:
- Each headline on its own line.
- No numbering, no bullets, no quotes around them.
- Vary the angle: one straightforward, one punchy, one question-style, one with a strong verb, etc.
- Keep each under 14 words.
- No English mixed in.${glossaryBlock}

WORKING TITLE: ${title || "(none)"}

ARTICLE:
${content || "(no content yet — use the working title only)"}

HEADLINES:`
      : `You are a Dhivehi tag suggester for a WordPress news site. Read the article below and propose ${count} relevant tags in Dhivehi (Thaana script).

RULES:
- Output a comma-separated list. Nothing else.
- Each tag is 1-3 Dhivehi words. No English.
- Tags are about the SUBJECT (person, place, topic) — not adjectives.
- No hashtags, no numbering.${glossaryBlock}

TITLE: ${title || "(none)"}

ARTICLE:
${content}

TAGS:`;

  try {
    const result = await model.generateContent(prompt);
    const text = (result.response.text() || "").trim();

    let suggestions: string[];
    if (kind === "headlines") {
      suggestions = text
        .split("\n")
        .map((line) => line.replace(/^[-*•\d.)\s]+/, "").replace(/^["']|["']$/g, "").trim())
        .filter(Boolean)
        .slice(0, count);
    } else {
      suggestions = text
        .split(",")
        .map((t) => t.replace(/^[#\s]+|\s+$/g, "").trim())
        .filter(Boolean)
        .slice(0, count);
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ error: "No suggestions returned" }, { status: 502 });
    }

    return NextResponse.json({ suggestions, kind });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Suggestion failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
