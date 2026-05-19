// ─── Article Analyzer ─────────────────────────────────────
// POST /api/analyze-articles
// Scrapes each URL and asks Gemini to produce a short factual
// metadata sheet per article: topics, main subjects, and whether
// each major subject is portrayed positively / neutrally /
// negatively in the original source. This is *descriptive* — the
// model is told to label what the source already does, not to
// recommend or rewrite. The /multi-publish UI uses these labels
// so a human editor can scan and tick the 5 they want.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";
import { fetchPage, describeFetchError } from "@/lib/fetchPage";

interface AnalyzeRequest {
  urls: string[];
}

interface SubjectTone {
  subject: string;
  tone: "positive" | "negative" | "neutral";
}

interface ArticleAnalysis {
  url: string;
  ok: true;
  title: string;
  source: string;
  summary: string;          // 1-2 sentence factual summary of the source
  topics: string[];         // e.g. "Islamic affairs", "India-Maldives", "economy"
  subjects: SubjectTone[];  // descriptive tone in the source, per major subject
  publishedAt?: string;
  // Original scraped text kept short — the publish step re-fetches.
  excerpt: string;
}

interface ArticleFailure {
  url: string;
  ok: false;
  error: string;
}

function parseJsonLoose(text: string): unknown | null {
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch {} }
  return null;
}

function extractPublishDate($: cheerio.CheerioAPI): string | undefined {
  const tryAttrs = [
    ['meta[property="article:published_time"]', "content"],
    ['meta[property="og:published_time"]', "content"],
    ['meta[name="pubdate"]', "content"],
    ['meta[itemprop="datePublished"]', "content"],
    ['time[datetime]', "datetime"],
  ] as const;
  for (const [selector, attr] of tryAttrs) {
    const raw = $(selector).first().attr(attr);
    if (raw) return raw;
  }
  return undefined;
}

async function scrape(url: string): Promise<
  | { ok: true; title: string; text: string; source: string; publishedAt?: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetchPage(url, 12000);
    if (!res.ok) return { ok: false, error: describeFetchError(res) };
    const html = res.text;
    const $ = cheerio.load(html);
    const publishedAt = extractPublishDate($);
    $(
      "script, style, nav, header, footer, aside, .sidebar, .ad, .advertisement, .social-share, .comments, .related-posts, noscript, iframe"
    ).remove();
    const title =
      $("article h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").text().trim() ||
      url;
    let text = "";
    for (const sel of [
      "article",
      '[role="main"]',
      ".post-content",
      ".entry-content",
      ".article-body",
      ".story-body",
      "main",
    ]) {
      const t = $(sel).text().trim();
      if (t && t.length > 200) { text = t; break; }
    }
    if (!text || text.length < 200) {
      text = $("p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 30)
        .join("\n\n");
    }
    if (!text || text.length < 100) return { ok: false, error: "Couldn't extract text" };
    if (text.length > 5000) text = text.slice(0, 5000) + "\n[truncated]";
    let source = url;
    try { source = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    return { ok: true, title: title.slice(0, 250), text, source, publishedAt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: AnalyzeRequest;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const urls = Array.isArray(body.urls)
    ? Array.from(new Set(body.urls.map((u) => String(u).trim()).filter(Boolean))).slice(0, 30)
    : [];
  if (urls.length === 0) {
    return NextResponse.json({ error: "Provide at least one URL" }, { status: 400 });
  }

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API key not configured" }, { status: 400 });
  }

  // Scrape all in parallel
  const settled = await Promise.allSettled(urls.map((u) => scrape(u).then((r) => ({ url: u, ...r }))));
  const failures: ArticleFailure[] = [];
  type Scraped = { url: string; title: string; text: string; source: string; publishedAt?: string };
  const scraped: Scraped[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value.ok) {
      scraped.push(r.value as Scraped);
    } else if (r.status === "fulfilled") {
      failures.push({ url: r.value.url, ok: false, error: (r.value as { error: string }).error });
    } else {
      failures.push({ url: "unknown", ok: false, error: r.reason?.message || "rejected" });
    }
  }

  if (scraped.length === 0) {
    return NextResponse.json({ analyses: [], failures });
  }

  // Send all in one batched classification call
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = shared.composeModel || "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({ model: modelId });

  const articlesBlock = scraped
    .map(
      (a, i) =>
        `--- ARTICLE ${i + 1} ---\nURL: ${a.url}\nSOURCE: ${a.source}\nTITLE: ${a.title}\nTEXT: ${a.text}`
    )
    .join("\n\n");

  const prompt = `You are a newsroom assistant labeling articles so an editor can scan them quickly. Read each article below and produce a factual, descriptive metadata sheet — DO NOT recommend, rewrite, or rank. Just label what is in the source.

For each article, output:
- "summary": one or two factual sentences in English summarising what the source says.
- "topics": an array of 1-4 short topic labels (e.g. "Islamic affairs", "India-Maldives relations", "economy", "diplomacy", "elections", "sports", "education", "security", "climate", "tourism", "crime").
- "subjects": an array describing how the SOURCE itself portrays its major subjects. Each item: { "subject": string, "tone": "positive" | "negative" | "neutral" }. "subject" is a country, person, organisation or community mentioned prominently (e.g. "India", "China", "Pakistan", "Maldives government", "Islamic community"). Only include subjects the article meaningfully covers. "tone" reflects how the source treats that subject; if you can't tell, use "neutral".

Output ONLY valid JSON in this exact shape, no markdown fences:
{
  "items": [
    { "index": 1, "summary": "...", "topics": ["..."], "subjects": [{ "subject": "...", "tone": "..." }] }
  ]
}

${articlesBlock}`;

  let analyses: ArticleAnalysis[] = [];
  try {
    const result = await model.generateContent(prompt);
    const raw = (result.response.text() || "").trim();
    const parsed = parseJsonLoose(raw) as { items?: unknown } | null;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];

    analyses = scraped.map((a, i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = (items as any[]).find((it) => Number(it?.index) === i + 1);
      const topics = Array.isArray(found?.topics)
        ? (found.topics as unknown[]).map(String).slice(0, 5)
        : [];
      const subjects: SubjectTone[] = Array.isArray(found?.subjects)
        ? (found.subjects as unknown[])
            .map((s) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const o = s as any;
              const tone = ["positive", "negative", "neutral"].includes(o?.tone)
                ? o.tone
                : "neutral";
              return o?.subject ? { subject: String(o.subject), tone } : null;
            })
            .filter((x): x is SubjectTone => x !== null)
            .slice(0, 6)
        : [];
      const summary = typeof found?.summary === "string" ? found.summary : "";
      return {
        url: a.url,
        ok: true as const,
        title: a.title,
        source: a.source,
        publishedAt: a.publishedAt,
        summary,
        topics,
        subjects,
        excerpt: a.text.slice(0, 400),
      };
    });
  } catch (err) {
    // Even if classification fails, return scraped data so the user can pick.
    analyses = scraped.map((a) => ({
      url: a.url,
      ok: true as const,
      title: a.title,
      source: a.source,
      publishedAt: a.publishedAt,
      summary: "",
      topics: [],
      subjects: [],
      excerpt: a.text.slice(0, 400),
    }));
    return NextResponse.json({
      analyses,
      failures,
      warning: err instanceof Error ? err.message : "Classification failed",
    });
  }

  return NextResponse.json({ analyses, failures });
}

export const maxDuration = 120;
export const dynamic = "force-dynamic";
