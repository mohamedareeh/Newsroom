// ─── AI Spin Engine ────────────────────────────────────────
// POST /api/process
// 1. Scrapes article text from the given URL using cheerio
// 2. Sends the text + user settings to Gemini 2.0 Flash
// 3. Returns the AI-rewritten Dhivehi article
// 4. Marks the URL as processed in Vercel KV (48h TTL)

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { kv } from "@vercel/kv";

// ── Request body shape ──
interface ProcessRequest {
  url: string;
  paraphrasingLevel: "light" | "heavy";
  tone: "formal" | "casual" | "sensational";
  length: "match" | "summary";
  geminiApiKey?: string;
}

export async function POST(req: NextRequest) {
  // ── Auth guard ──
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ProcessRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, paraphrasingLevel, tone, length, geminiApiKey } = body;

  if (!url) {
    return NextResponse.json({ error: "Missing article URL" }, { status: 400 });
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
    // STEP 1: Scrape the article text
    // ────────────────────────────────────────────────────────
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "CreativeNetworkNewsDesk/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!pageRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch article: HTTP ${pageRes.status}` },
        { status: 502 }
      );
    }

    const html = await pageRes.text();
    const $ = cheerio.load(html);

    // Remove noise: scripts, styles, nav, ads, sidebars
    $(
      "script, style, nav, header, footer, aside, .sidebar, .ad, .advertisement, .social-share, .comments, .related-posts, noscript, iframe"
    ).remove();

    // Extract the article title
    const title =
      $("article h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Untitled Article";

    // Extract article body — try common selectors first
    let articleText = "";
    const articleSelectors = [
      "article",
      '[role="main"]',
      ".post-content",
      ".entry-content",
      ".article-body",
      ".story-body",
      "main",
    ];

    for (const selector of articleSelectors) {
      const content = $(selector).text().trim();
      if (content && content.length > 200) {
        articleText = content;
        break;
      }
    }

    // Fallback: grab all <p> tags
    if (!articleText || articleText.length < 200) {
      articleText = $("p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 30)
        .join("\n\n");
    }

    if (!articleText || articleText.length < 100) {
      return NextResponse.json(
        { error: "Could not extract meaningful article text from the URL" },
        { status: 422 }
      );
    }

    // Truncate very long articles to avoid token limits
    const maxChars = 12000;
    if (articleText.length > maxChars) {
      articleText = articleText.slice(0, maxChars) + "\n\n[Article truncated]";
    }

    // ────────────────────────────────────────────────────────
    // STEP 2: Build the Gemini prompt based on user settings
    // ────────────────────────────────────────────────────────
    const paraphrasingInstructions =
      paraphrasingLevel === "light"
        ? "Lightly paraphrase the content, keeping the structure and key phrases similar to the original."
        : "Heavily rewrite the content with completely new sentence structures and vocabulary. The output must read as an entirely original piece.";

    const toneInstructions = {
      formal:
        "Use a formal, professional journalistic tone appropriate for a national news broadcast.",
      casual:
        "Use a casual, conversational tone that feels approachable and easy to read.",
      sensational:
        "Use a dramatic, attention-grabbing sensational tone with strong, impactful language.",
    }[tone];

    const lengthInstructions =
      length === "match"
        ? "The output length should approximately match the original article."
        : "Condense the article into a concise bullet-point summary with 5-8 key points.";

    const prompt = `You are an expert Dhivehi journalist and translator. Your task is to rewrite the following English news article completely into Dhivehi (the language of the Maldives, written in Thaana script).

RULES:
- ${paraphrasingInstructions}
- ${toneInstructions}
- ${lengthInstructions}
- The entire output MUST be in Dhivehi (Thaana script). Do NOT include any English text in the output.
- Include a compelling Dhivehi headline at the top.
- Maintain factual accuracy — do not fabricate information.
- Format the output cleanly with proper paragraphs.

ORIGINAL ARTICLE TITLE: ${title}

ORIGINAL ARTICLE TEXT:
${articleText}

OUTPUT (in Dhivehi only):`;

    // ────────────────────────────────────────────────────────
    // STEP 3: Call Gemini API
    // ────────────────────────────────────────────────────────
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
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
    // STEP 4: Mark URL as processed in Vercel KV (48h TTL)
    // ────────────────────────────────────────────────────────
    try {
      await kv.set(`processed:${url}`, Date.now(), { ex: 172800 }); // 48 hours
    } catch {
      // KV unavailable — non-fatal, just skip caching
      console.warn("Vercel KV unavailable — skipping memory bank write");
    }

    // ────────────────────────────────────────────────────────
    // STEP 5: Return the result
    // ────────────────────────────────────────────────────────
    return NextResponse.json({
      originalTitle: title,
      originalLength: articleText.length,
      rewrittenText,
      sourceUrl: url,
      processedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("Process API error:", err);
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
