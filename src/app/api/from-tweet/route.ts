// ─── News-From-Tweet ────────────────────────────────────────
// POST /api/from-tweet
// Take a tweet (URL or pasted text) and write a structured Dhivehi
// news article based on it. Streams via SSE in the same shape as
// /api/process and /api/compose so the /article view can render it.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";

interface FromTweetRequest {
  url?: string;
  text?: string;
  extraContext?: string;
  articleType?: "news" | "opinion" | "report";
  wordCount?: number;
  clarifyOnly?: boolean;
}

interface OEmbedResp {
  html?: string;
  author_name?: string;
  author_url?: string;
  url?: string;
}

// Pull plain text out of Twitter oEmbed HTML.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTweetViaOEmbed(url: string): Promise<{ text: string; author?: string } | null> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&hide_thread=true&dnt=true`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsDeskBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OEmbedResp;
    if (!data.html) return null;
    const text = stripHtml(data.html);
    if (!text) return null;
    return { text, author: data.author_name };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FromTweetRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const inputUrl = (body.url || "").trim();
  let tweetText = (body.text || "").trim();
  const extraContext = (body.extraContext || "").trim();
  const wordCount = body.wordCount || 400;
  const articleType = body.articleType || "news";
  const clarifyOnly = !!body.clarifyOnly;

  let author: string | undefined;
  let sourceUrl = inputUrl;

  if (inputUrl && !tweetText) {
    const fetched = await fetchTweetViaOEmbed(inputUrl);
    if (!fetched) {
      return NextResponse.json(
        {
          error:
            "Couldn't fetch that tweet automatically. Paste the tweet text in the box below and try again.",
        },
        { status: 422 }
      );
    }
    tweetText = fetched.text;
    author = fetched.author;
  }

  if (!tweetText) {
    return NextResponse.json(
      { error: "Provide a tweet URL or paste the tweet text." },
      { status: 400 }
    );
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

  // ── CLARIFY PHASE ─────────────────────────────────────────
  // Quick non-streaming pass: ask the model whether it has enough
  // information to write the article, or whether it should ask
  // clarifying questions of the editor first.
  if (clarifyOnly) {
    const contextLine = extraContext ? `\nADDITIONAL EDITOR CONTEXT: ${extraContext}` : "";
    const authorLine = author ? `Posted by ${author}.` : "";
    const clarifyPrompt = `You are an editor reviewing a tweet that another journalist plans to turn into a Dhivehi news article. Your only job here is to decide if you have enough information to write a fair, accurate news piece, or if you need to ask the journalist for more facts first.

OUTPUT RULES (follow EXACTLY one of these two formats — no other prose):
- If you are confident you can write a fair article with what's provided, reply:
READY

- If the tweet is ambiguous, missing key facts, makes claims that need verification, has unclear pronouns/subjects, or otherwise needs more context, reply:
QUESTIONS:
- short, specific question 1
- short, specific question 2
- short, specific question 3

Ask 1 to 4 questions. Each question must be one line, specific, in English, and answerable in a sentence or two. Do not invent details. Do not include numbering. Do not add anything after the questions.

TWEET TEXT:
${tweetText}
${authorLine}${contextLine}`;

    try {
      const result = await model.generateContent(clarifyPrompt);
      const text = (result.response.text() || "").trim();
      if (/^READY\b/i.test(text)) {
        return NextResponse.json({ ready: true, questions: [], author, sourceUrl });
      }
      // Parse questions
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const questions: string[] = [];
      for (const line of lines) {
        if (/^questions?\s*:?$/i.test(line)) continue;
        // strip leading -, *, •, numbers
        const cleaned = line.replace(/^[-*•\d.)\s]+/, "").trim();
        if (cleaned) questions.push(cleaned);
      }
      if (questions.length === 0) {
        return NextResponse.json({ ready: true, questions: [], author, sourceUrl });
      }
      return NextResponse.json({
        ready: false,
        questions: questions.slice(0, 4),
        author,
        sourceUrl,
      });
    } catch (err) {
      // Don't block on clarify failures — let the user proceed.
      return NextResponse.json({
        ready: true,
        questions: [],
        author,
        sourceUrl,
        warning: err instanceof Error ? err.message : "Clarify check failed",
      });
    }
  }

  const typeInstructions = {
    news: "Use a formal, professional journalistic tone appropriate for a national news outlet.",
    opinion: "Write as an opinion/editorial piece. Use an analytical, persuasive tone.",
    report: "Write as a detailed report with comprehensive analysis.",
  }[articleType];

  const authorLine = author ? `The tweet was posted by ${author}.` : "";
  const contextBlock = extraContext
    ? `\n\nADDITIONAL CONTEXT FROM EDITOR:\n${extraContext}`
    : "";

  const prompt = `You are an expert Dhivehi journalist. Turn the tweet below into a Dhivehi news article in Thaana script.

RULES:
- ${typeInstructions}
- Approximately ${wordCount} words.
- ${authorLine}
- Attribute the claim to its author in the lead sentence ("X claimed that…", "According to X…"). Do NOT present the tweet's claim as fact unless the additional context supports it.
- If the claim is unverified, say so clearly.
- All TITLE and CONTENT in Dhivehi (Thaana script). No English.
- Transliterate the headline into Latin for article_LATIN. No trailing period.
- Punchy Dhivehi social caption for SOCIAL_TEXT. Headline-style, no sentence endings.
- 3 Dhivehi tags for TAGS, comma-separated.
- Maintain factual accuracy. Do not fabricate.

OUTPUT FORMAT (use these labels exactly):
TITLE: Dhivehi headline
CONTENT: Dhivehi article
article_LATIN: headline in Latin
SOCIAL_TEXT: Dhivehi social text
TAGS: tag1, tag2, tag3

TWEET TEXT:
${tweetText}${contextBlock}

OUTPUT:`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const meta = JSON.stringify({
          type: "meta",
          originalTitle: author ? `Tweet by ${author}` : "Tweet-derived article",
          originalLength: tweetText.length,
          sourceUrl: sourceUrl || "",
        });
        controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          const t = chunk.text();
          if (t) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: t })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed";
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
