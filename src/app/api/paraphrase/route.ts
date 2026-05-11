// ─── AI Paraphraser ──────────────────────────────────────
// POST /api/paraphrase
// Takes raw text (Dhivehi or English) and returns a paraphrased
// Dhivehi version. Optionally generates a headline if requested.
// Streams via SSE. When generateTitle=true, the output is the
// structured form:
//   TITLE: ...
//   CONTENT: ...
// When generateTitle=false, the output is just the paraphrased
// CONTENT body.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";
import { glossaryPromptBlock, GlossaryPayload } from "@/lib/useGlossary";

interface ParaphraseRequest {
  text: string;
  paraphrasingLevel?: "light" | "heavy";
  tone?: "formal" | "casual" | "sensational";
  generateTitle?: boolean;
  glossary?: GlossaryPayload;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ParaphraseRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const level = body.paraphrasingLevel || "light";
  const tone = body.tone || "formal";
  const generateTitle = !!body.generateTitle;
  const glossaryBlock = glossaryPromptBlock(
    (body.glossary || []).map((g, i) => ({
      id: String(i),
      term: g.term,
      fullForm: g.fullForm,
      role: g.role,
      createdAt: 0,
      updatedAt: 0,
    }))
  );

  if (!text) {
    return NextResponse.json({ error: "Please provide text to paraphrase" }, { status: 400 });
  }

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured. Ask an admin to set one in Settings." },
      { status: 400 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = shared.composeModel || "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({ model: modelId });

  const levelInstruction =
    level === "heavy"
      ? "Rewrite the text substantially — restructure sentences, vary the vocabulary, and re-express the ideas in your own words while preserving every fact."
      : "Lightly rephrase the text — swap synonyms and adjust phrasing for clarity, keeping the structure close to the original.";

  const toneInstruction = {
    formal: "Use a formal, professional journalistic tone.",
    casual: "Use a conversational, accessible tone.",
    sensational: "Use a punchy, attention-grabbing tone suitable for headlines.",
  }[tone];

  const prompt = generateTitle
    ? `You are an expert Dhivehi journalist and editor. Paraphrase the following text into clean, natural Dhivehi (Thaana script), and write a compelling Dhivehi headline for it.

RULES:
- ${levelInstruction}
- ${toneInstruction}
- Preserve every fact, name, number, and quote from the original.
- All output (TITLE and CONTENT) MUST be in Dhivehi (Thaana script). No English.
- The TITLE should be a punchy headline that captures the story.
- If the original text is in English, translate AND paraphrase into Dhivehi.

OUTPUT FORMAT (use exactly these labels, nothing else):
TITLE: Dhivehi headline
CONTENT: Dhivehi paraphrased article

ORIGINAL TEXT:
${text}${glossaryBlock}

OUTPUT:`
    : `You are an expert Dhivehi journalist and editor. Paraphrase the following text into clean, natural Dhivehi (Thaana script).

RULES:
- ${levelInstruction}
- ${toneInstruction}
- Preserve every fact, name, number, and quote from the original.
- Output ONLY the paraphrased Dhivehi text. No labels, no English, no commentary.
- If the original text is in English, translate AND paraphrase into Dhivehi.

ORIGINAL TEXT:
${text}${glossaryBlock}

PARAPHRASED DHIVEHI TEXT:`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          const t = chunk.text();
          if (t) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: t })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Paraphrasing failed";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
