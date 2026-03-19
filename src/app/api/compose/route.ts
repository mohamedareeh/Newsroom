// ─── AI Article Composer ─────────────────────────────────────
// POST /api/compose
// Takes bullet points / key facts from the user and generates
// a well-researched original Dhivehi article using Gemini.
// Supports article type (news/opinion/report) and word count.
// Output follows the same structured format as the rewrite
// endpoint: TITLE, CONTENT, article_LATIN, SOCIAL_TEXT.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";

// ── Request body shape ──
interface ComposeRequest {
  points: string;
  articleType?: "news" | "opinion" | "report";
  wordCount?: number;
}

export async function POST(req: NextRequest) {
  // ── Auth guard ──
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ComposeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { points, articleType, wordCount } = body;

  if (!points || !points.trim()) {
    return NextResponse.json({ error: "Please provide key points to write about" }, { status: 400 });
  }

  // Read shared settings from KV (admin-configured)
  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured. Ask an admin to set one in Settings." },
      { status: 400 }
    );
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // ────────────────────────────────────────────────────────
    // Build tone/style instructions based on article type
    // ────────────────────────────────────────────────────────
    const typeInstructions = {
      news: "Use a formal, professional journalistic tone appropriate for a national news outlet. Write in inverted pyramid style (most important information first, least important last).",
      opinion: "Write as an opinion/editorial piece. Use an analytical, persuasive tone. Present a clear argument or perspective. Structure with a thesis statement, supporting arguments with evidence, and a strong conclusion.",
      report: "Write as a detailed investigative report. Use a data-driven, comprehensive tone. Include thorough analysis, background context, and multiple perspectives where relevant. Structure with an executive summary lead, detailed findings, and implications.",
    }[articleType || "news"];

    const wordCountInstruction = wordCount
      ? `The article should be approximately ${wordCount} words long.`
      : "";

    // ────────────────────────────────────────────────────────
    // Build the compose prompt
    // ────────────────────────────────────────────────────────
    const prompt = `You are an expert Dhivehi journalist. Your task is to write a well-researched, original article in Dhivehi (the language of the Maldives, written in Thaana script) based on the key points provided below.

RULES:
- ${typeInstructions}
- ${wordCountInstruction}
- Write a compelling Dhivehi headline that captures the essence of the story.
- Start the article with a one-sentence lead that covers who, what, when, where, and why.
- Expand on the provided points with context, background, and detail to create a comprehensive article.
- All article output (TITLE and CONTENT) MUST be in Dhivehi (Thaana script). Do NOT include any English text in TITLE or CONTENT.
- Transliterate the Dhivehi headline into Latin alphabet (write the Thaana in English letters) for article_LATIN. Do NOT add a period/fullstop at the end.
- Write a short 1-2 sentence social media text in Dhivehi for SOCIAL_TEXT.
- Maintain factual accuracy — only use information from the provided points. Do not fabricate facts.

OUTPUT FORMAT (you MUST use exactly these labels):
TITLE: Dhivehi headline
CONTENT: Dhivehi article (lead sentence + body)
article_LATIN: headline in English letters
SOCIAL_TEXT: Dhivehi social media text

KEY POINTS TO WRITE ABOUT:
${points}

OUTPUT:`;

    // ────────────────────────────────────────────────────────
    // Call Gemini API with streaming
    // ────────────────────────────────────────────────────────
    const modelId = shared.composeModel || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelId });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send metadata
          const meta = JSON.stringify({
            type: "meta",
            originalTitle: "AI Generated Article",
            originalLength: points.length,
            sourceUrl: "",
          });
          controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

          // Stream Gemini response
          const result = await model.generateContentStream(prompt);
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              const payload = JSON.stringify({ type: "chunk", text });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Streaming failed";
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
  } catch (err: unknown) {
    console.error("Compose API error:", err);
    const message = err instanceof Error ? err.message : "Article generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
