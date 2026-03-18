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

// ── Request body shape ──
interface ComposeRequest {
  points: string;
  articleType?: "news" | "opinion" | "report";
  wordCount?: number;
  geminiApiKey?: string;
  geminiModel?: string;
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

  const { points, articleType, wordCount, geminiApiKey, geminiModel } = body;

  if (!points || !points.trim()) {
    return NextResponse.json({ error: "Please provide key points to write about" }, { status: 400 });
  }

  // Resolve Gemini API key: body → env
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured. Add one in Settings or set GEMINI_API_KEY env var." },
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
    // Call Gemini API
    // ────────────────────────────────────────────────────────
    const modelId = geminiModel || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelId });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const rewrittenText = response.text();

    if (!rewrittenText) {
      return NextResponse.json(
        { error: "Gemini returned an empty response" },
        { status: 500 }
      );
    }

    // ────────────────────────────────────────────────────────
    // Return the result (compatible with process endpoint shape)
    // ────────────────────────────────────────────────────────
    return NextResponse.json({
      originalTitle: "AI Generated Article",
      originalLength: points.length,
      rewrittenText,
      sourceUrl: "",
      processedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("Compose API error:", err);
    const message = err instanceof Error ? err.message : "Article generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
