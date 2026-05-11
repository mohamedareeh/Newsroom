// ─── Multi-Source Synthesis ────────────────────────────────
// POST /api/synthesize
// Take 2-5 article URLs covering the same story, scrape each, and
// have Gemini fuse them into a single Dhivehi article that reconciles
// facts across the sources. Streams via SSE in the same shape as
// /api/process and /api/compose.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";

interface SynthesizeRequest {
  urls: string[];
  paraphrasingLevel?: "light" | "heavy";
  tone?: "formal" | "casual" | "sensational";
  length?: "match" | "summary";
}

interface Extracted {
  url: string;
  title: string;
  text: string;
  source: string;
}

async function scrape(url: string): Promise<Extracted | { error: string; url: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}`, url };
    const html = await res.text();
    const $ = cheerio.load(html);
    $(
      "script, style, nav, header, footer, aside, .sidebar, .ad, .advertisement, .social-share, .comments, .related-posts, noscript, iframe"
    ).remove();
    const title =
      $("article h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      url;

    let text = "";
    for (const sel of ["article", '[role="main"]', ".post-content", ".entry-content", ".article-body", ".story-body", "main"]) {
      const t = $(sel).text().trim();
      if (t && t.length > 200) {
        text = t;
        break;
      }
    }
    if (!text || text.length < 200) {
      text = $("p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 30)
        .join("\n\n");
    }
    if (!text || text.length < 100) {
      return { error: "Couldn't extract text", url };
    }
    // Trim very long
    if (text.length > 6000) text = text.slice(0, 6000) + "\n[truncated]";

    let source = url;
    try { source = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    return { url, title: title.slice(0, 200), text, source };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Fetch failed", url };
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SynthesizeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string" && u.trim()).slice(0, 5) : [];
  if (urls.length < 2) {
    return NextResponse.json({ error: "Pick at least 2 article URLs to synthesize." }, { status: 400 });
  }

  const tone = body.tone || "formal";
  const length = body.length || "match";
  const level = body.paraphrasingLevel || "heavy";

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured. Ask an admin to set one in Settings." },
      { status: 400 }
    );
  }

  // Scrape all in parallel
  const settled = await Promise.allSettled(urls.map((u) => scrape(u)));
  const sources: Extracted[] = [];
  const failures: { url: string; error: string }[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if ("error" in r.value) failures.push(r.value);
      else sources.push(r.value);
    } else {
      failures.push({ url: "unknown", error: r.reason?.message || "fetch rejected" });
    }
  }

  if (sources.length < 2) {
    return NextResponse.json(
      {
        error: `Need at least 2 sources to synthesize. Successfully read ${sources.length}.`,
        failures,
      },
      { status: 422 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = shared.composeModel || "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({ model: modelId });

  const levelInst =
    level === "heavy"
      ? "Re-express every fact in your own words. The result must NOT mirror the phrasing of any single source."
      : "Lightly rephrase. Vary vocabulary but keep the structure recognisable.";
  const toneInst = {
    formal: "Formal, professional journalistic tone.",
    casual: "Conversational, accessible tone.",
    sensational: "Punchy, attention-grabbing tone.",
  }[tone];
  const lengthInst =
    length === "summary"
      ? "Condense into a tight ~300-word piece focused on the key facts."
      : "Aim for a complete article (~500-700 words) covering all important details.";

  const sourcesBlock = sources
    .map((s, i) => `--- SOURCE ${i + 1}: ${s.source} ---\nTITLE: ${s.title}\nTEXT: ${s.text}`)
    .join("\n\n");

  const prompt = `You are an expert Dhivehi journalist synthesising multiple news sources into a single comprehensive article in Dhivehi (Thaana script).

RULES:
- ${levelInst}
- ${toneInst}
- ${lengthInst}
- Reconcile facts across sources. Where sources agree, state the fact plainly. Where they DISAGREE on a number, name, time, or detail, present both versions and attribute each one ("X reports… while Y reports…").
- Do NOT introduce facts that aren't supported by at least one of the sources.
- Lead with a one-sentence lead that covers who/what/when/where/why.
- Invert pyramid for the rest: most important first.
- TITLE and CONTENT must be in Dhivehi (Thaana script). No English.
- Transliterate the Dhivehi headline into Latin for article_LATIN. No trailing period.
- Punchy Dhivehi social caption for SOCIAL_TEXT. Headline-style.
- 3 Dhivehi tags for TAGS, comma-separated.

OUTPUT FORMAT (exactly these labels):
TITLE: Dhivehi headline
CONTENT: Dhivehi synthesised article
article_LATIN: headline in Latin
SOCIAL_TEXT: Dhivehi social text
TAGS: tag1, tag2, tag3

SOURCES:
${sourcesBlock}

OUTPUT:`;

  const encoder = new TextEncoder();
  const sourceLabels = sources.map((s) => s.source).join(", ");

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const meta = JSON.stringify({
          type: "meta",
          originalTitle: `Synthesised from ${sources.length} sources`,
          originalLength: sources.reduce((sum, s) => sum + s.text.length, 0),
          sourceUrl: sources[0]?.url || "",
          extraSources: sources.map((s) => ({ url: s.url, source: s.source, title: s.title })),
        });
        controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

        if (failures.length > 0) {
          const warn = JSON.stringify({
            type: "warning",
            message: `Skipped ${failures.length} URL(s) that couldn't be fetched: ${failures.map((f) => f.url).join(", ")}`,
          });
          controller.enqueue(encoder.encode(`data: ${warn}\n\n`));
        }

        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          const t = chunk.text();
          if (t) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: t })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", sourceLabels })}\n\n`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Synthesis failed";
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
