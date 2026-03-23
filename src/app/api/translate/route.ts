// ─── Translate API ────────────────────────────────────────
// POST /api/translate
// Translates text into Dhivehi using Gemini AI.
// Accepts either a URL (scrapes then translates) or raw text.
// Streams the response for real-time display.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSharedSettings } from "@/lib/sharedSettings";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from "cheerio";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url, rawText } = await req.json();
  if (!url && !rawText) {
    return NextResponse.json({ error: "Provide either url or rawText" }, { status: 400 });
  }

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API key not configured" }, { status: 400 });
  }

  try {
    // Get text to translate
    let textToTranslate = rawText || "";
    let sourceTitle = "";

    if (url) {
      // Scrape the article
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Failed to fetch: HTTP ${res.status}`);
      const html = await res.text();
      const $ = cheerio.load(html);

      // Remove noise
      $("script, style, nav, footer, header, aside, .ad, .advertisement, .social-share, .comments").remove();

      sourceTitle = $("title").text().trim() || $("h1").first().text().trim() || "";
      const article = $("article").first();
      textToTranslate = article.length ? article.text().trim() : $("body").text().trim();

      if (textToTranslate.length > 12000) {
        textToTranslate = textToTranslate.substring(0, 12000);
      }
    }

    if (!textToTranslate.trim()) {
      return NextResponse.json({ error: "No text found to translate" }, { status: 400 });
    }

    // Build prompt
    const prompt = `You are a professional translator. Translate the following text into Dhivehi (Maldivian language written in Thaana script).

Rules:
- Translate accurately while keeping the meaning intact
- Use natural Dhivehi phrasing, not word-by-word translation
- Keep proper nouns (names of people, places, organizations) as-is or transliterate them
- Keep numbers in their original form
- Output ONLY the translated text, no explanations

Text to translate:
${textToTranslate}`;

    // Stream response from Gemini
    const modelId = shared.geminiModel || "gemini-2.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });

    const result = await model.generateContentStream(prompt);

    // Stream via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send meta
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "meta", sourceTitle })}\n\n`)
        );

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
