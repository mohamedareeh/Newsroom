// ─── Multi-Publish Pipeline ────────────────────────────────
// POST /api/multi-publish
// 1. Accept a list of URLs.
// 2. Scrape each, extract the publish date, pick the 5 most recent.
// 3. For each: generate a Dhivehi translation and an English paraphrase.
// 4. Publish DV to wordpressDhivehi, EN to wordpressEnglish.
// 5. Log every publication to KV (daily-report consumes this).
// Streams progress via SSE so the UI can show per-step status.

import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings, resolveWP, WordPressCreds } from "@/lib/sharedSettings";
import { fetchPage, describeFetchError } from "@/lib/fetchPage";
import { appendPublication, PublicationRecord } from "@/lib/publicationLog";

interface MultiPublishRequest {
  /** Exact list of URLs to translate and publish. Caller does the curation. */
  urls: string[];
}

interface ScrapedArticle {
  url: string;
  title: string;
  text: string;
  publishedAt?: number; // epoch ms
  source: string;
}

// ── Date extraction from HTML ───────────────────────────────
function extractPublishDate($: cheerio.CheerioAPI): number | undefined {
  const tryAttrs = [
    ['meta[property="article:published_time"]', "content"],
    ['meta[property="og:published_time"]', "content"],
    ['meta[name="article:published_time"]', "content"],
    ['meta[name="pubdate"]', "content"],
    ['meta[name="publishdate"]', "content"],
    ['meta[name="date"]', "content"],
    ['meta[name="dc.date.issued"]', "content"],
    ['meta[itemprop="datePublished"]', "content"],
    ['time[datetime]', "datetime"],
  ] as const;

  for (const [selector, attr] of tryAttrs) {
    const raw = $(selector).first().attr(attr);
    if (!raw) continue;
    const t = Date.parse(raw);
    if (!isNaN(t)) return t;
  }

  // Look for JSON-LD blocks with datePublished
  const ldNodes = $('script[type="application/ld+json"]');
  for (let i = 0; i < ldNodes.length; i++) {
    const txt = $(ldNodes[i]).text();
    if (!txt) continue;
    try {
      const json = JSON.parse(txt);
      const candidates = Array.isArray(json) ? json : [json];
      for (const obj of candidates) {
        const d = obj?.datePublished || obj?.dateCreated || obj?.uploadDate;
        if (typeof d === "string") {
          const t = Date.parse(d);
          if (!isNaN(t)) return t;
        }
      }
    } catch {}
  }

  return undefined;
}

async function scrape(url: string): Promise<ScrapedArticle | { url: string; error: string }> {
  try {
    const res = await fetchPage(url, 15000);
    if (!res.ok) return { url, error: describeFetchError(res) };
    const html = res.text;
    const $ = cheerio.load(html);

    const publishedAt = extractPublishDate($);

    // Remove noise *after* extracting metadata.
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
    if (!text || text.length < 100) return { url, error: "Couldn't extract text" };
    if (text.length > 9000) text = text.slice(0, 9000) + "\n[truncated]";

    let source = url;
    try {
      source = new URL(url).hostname.replace(/^www\./, "");
    } catch {}

    return {
      url,
      title: title.slice(0, 250),
      text,
      publishedAt,
      source,
    };
  } catch (err) {
    return { url, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

// ── Gemini structured output ────────────────────────────────
interface StructuredOut {
  title: string;
  content: string;
  latin?: string;
  social?: string;
  tags: string[];
}

function parseStructured(raw: string): StructuredOut {
  const t = raw.trim();
  const titleMatch = t.match(/TITLE:\s*([\s\S]*?)(?=\nCONTENT:|$)/i);
  const contentMatch = t.match(/CONTENT:\s*([\s\S]*?)(?=\narticle_LATIN:|\nLATIN:|\nSOCIAL_TEXT:|\nTAGS:|$)/i);
  const latinMatch = t.match(/(?:article_LATIN|LATIN):\s*([\s\S]*?)(?=\nSOCIAL_TEXT:|\nTAGS:|$)/i);
  const socialMatch = t.match(/SOCIAL_TEXT:\s*([\s\S]*?)(?=\nTAGS:|$)/i);
  const tagsMatch = t.match(/TAGS:\s*([\s\S]*?)$/i);
  const tagsStr = tagsMatch?.[1]?.trim() || "";
  return {
    title: titleMatch?.[1]?.trim() || "",
    content: contentMatch?.[1]?.trim() || "",
    latin: latinMatch?.[1]?.trim() || undefined,
    social: socialMatch?.[1]?.trim() || undefined,
    tags: tagsStr ? tagsStr.split(",").map((x) => x.trim()).filter(Boolean) : [],
  };
}

async function generateForLanguage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  article: ScrapedArticle,
  language: "dv" | "en"
): Promise<StructuredOut> {
  const promptDV = `You are an expert Dhivehi journalist. Translate and paraphrase the article below into a polished Dhivehi (Thaana script) news piece.

RULES:
- Translate AND paraphrase — re-express the ideas in your own words. Preserve every fact, name, number, and quote.
- Use a formal, professional journalistic tone.
- Match the original length approximately.
- TITLE and CONTENT must be in Dhivehi (Thaana). No English in those fields.
- Transliterate the Dhivehi headline into Latin letters for article_LATIN. No trailing period.
- Punchy Dhivehi SOCIAL_TEXT, headline-style (no sentence endings).
- 3 Dhivehi TAGS, comma-separated.

OUTPUT FORMAT (exact labels):
TITLE:
CONTENT:
article_LATIN:
SOCIAL_TEXT:
TAGS:

ORIGINAL TITLE: ${article.title}

ORIGINAL ARTICLE:
${article.text}

OUTPUT:`;

  const promptEN = `You are an expert English newsroom editor. Read the article below and produce a paraphrased English version suitable for publication.

RULES:
- Paraphrase — re-express in your own words. Keep every fact, name, number, and quote.
- Use a clear, professional journalistic tone (inverted pyramid; lead paragraph covers who/what/when/where/why).
- Roughly match the original length.
- Output TITLE and CONTENT in English.
- SOCIAL_TEXT is a short English caption (no period at the end).
- 3 English TAGS, comma-separated.

OUTPUT FORMAT (exact labels):
TITLE:
CONTENT:
SOCIAL_TEXT:
TAGS:

ORIGINAL TITLE: ${article.title}

ORIGINAL ARTICLE:
${article.text}

OUTPUT:`;

  const prompt = language === "dv" ? promptDV : promptEN;
  const result = await model.generateContent(prompt);
  const raw = result.response.text() || "";
  const out = parseStructured(raw);
  if (!out.title || !out.content) {
    throw new Error(`Gemini returned no ${language === "dv" ? "Dhivehi" : "English"} TITLE/CONTENT`);
  }
  return out;
}

// ── WordPress publish helpers ───────────────────────────────
function wpAuthHeader(wp: WordPressCreds) {
  return "Basic " + Buffer.from(`${wp.username}:${wp.appPassword}`).toString("base64");
}

async function resolveTagIds(siteUrl: string, wp: WordPressCreds, tagNames: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of tagNames) {
    const n = name.trim();
    if (!n) continue;
    try {
      const search = await fetch(
        `${siteUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(n)}&per_page=5`,
        { headers: { Authorization: wpAuthHeader(wp) }, signal: AbortSignal.timeout(5000) }
      );
      const existing = await search.json();
      const match = Array.isArray(existing) && existing.find(
        (t: { name: string }) => t.name.toLowerCase() === n.toLowerCase()
      );
      if (match) ids.push(match.id);
      else {
        const create = await fetch(`${siteUrl}/wp-json/wp/v2/tags`, {
          method: "POST",
          headers: { Authorization: wpAuthHeader(wp), "Content-Type": "application/json" },
          body: JSON.stringify({ name: n }),
          signal: AbortSignal.timeout(5000),
        });
        if (create.ok) {
          const created = await create.json();
          ids.push(created.id);
        }
      }
    } catch {
      // skip
    }
  }
  return ids;
}

async function resolveCategoryId(
  siteUrl: string,
  wp: WordPressCreds,
  name: string
): Promise<number | undefined> {
  const n = name.trim();
  if (!n) return undefined;
  try {
    const search = await fetch(
      `${siteUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(n)}&per_page=10`,
      { headers: { Authorization: wpAuthHeader(wp) }, signal: AbortSignal.timeout(5000) }
    );
    if (search.ok) {
      const existing = await search.json();
      const match = Array.isArray(existing)
        && existing.find((c: { name: string }) => c.name.toLowerCase() === n.toLowerCase());
      if (match) return match.id;
    }
    const create = await fetch(`${siteUrl}/wp-json/wp/v2/categories`, {
      method: "POST",
      headers: { Authorization: wpAuthHeader(wp), "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
      signal: AbortSignal.timeout(5000),
    });
    if (create.ok) {
      const created = await create.json();
      return created.id;
    }
  } catch {
    // fall through — return undefined so publish still proceeds without the category
  }
  return undefined;
}

async function publishDraft(
  wp: WordPressCreds,
  payload: { title: string; content: string; customFields?: Record<string, string>; tags?: string[] }
): Promise<{ postId?: number; editUrl?: string; postUrl?: string; error?: string }> {
  const siteUrl = wp.siteUrl.replace(/\/+$/, "");
  try {
    const tagIds = payload.tags?.length ? await resolveTagIds(siteUrl, wp, payload.tags) : [];
    const categoryId = wp.defaultCategoryName
      ? await resolveCategoryId(siteUrl, wp, wp.defaultCategoryName)
      : undefined;
    const meta: Record<string, string> = {};
    if (payload.customFields) {
      for (const [k, v] of Object.entries(payload.customFields)) if (v) meta[k] = v;
    }
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { Authorization: wpAuthHeader(wp), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        content: payload.content,
        status: "draft",
        ...(categoryId ? { categories: [categoryId] } : {}),
        ...(tagIds.length ? { tags: tagIds } : {}),
        ...(Object.keys(meta).length ? { meta } : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: `WP publish ${res.status} — ${text.slice(0, 200)}` };
    }
    const post = await res.json();
    return {
      postId: post.id,
      editUrl: `${siteUrl}/wp-admin/post.php?post=${post.id}&action=edit`,
      postUrl: post.link,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "WP publish failed" };
  }
}

// ── Route handler ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: MultiPublishRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? Array.from(new Set(body.urls.map((u) => String(u).trim()).filter(Boolean))).slice(0, 10)
    : [];

  if (urls.length === 0) {
    return new Response(JSON.stringify({ error: "Provide at least one URL" }), { status: 400 });
  }

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Gemini API key not configured" }), { status: 400 });
  }
  const wpDV = resolveWP(shared, "dv");
  const wpEN = resolveWP(shared, "en");

  if (!wpDV && !wpEN) {
    return new Response(
      JSON.stringify({
        error:
          "No WordPress credentials configured. Add Dhivehi (dhen.mv) and English (maldivesinsight.com) WordPress credentials in Settings.",
      }),
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, type: string, data: object = {}) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        send(controller, "started", {
          urlsCount: urls.length,
          dvSite: wpDV ? wpDV.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null,
          enSite: wpEN ? wpEN.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null,
        });
        if (!wpDV) {
          send(controller, "warning", {
            message:
              "Dhivehi site not configured — Dhivehi drafts will be skipped. Set it in Settings → Multi-Publish Pipeline Sites.",
          });
        }
        if (!wpEN) {
          send(controller, "warning", {
            message:
              "English site not configured — English drafts will be skipped (English is NOT sent to the Dhivehi site). Set the English site in Settings → Multi-Publish Pipeline Sites.",
          });
        }

        // Step 1: scrape all in parallel — keep the order the caller passed in.
        const settled = await Promise.allSettled(urls.map((u) => scrape(u)));
        const picked: ScrapedArticle[] = [];
        const failures: { url: string; error: string }[] = [];
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i];
          if (r.status === "fulfilled") {
            if ("error" in r.value) failures.push(r.value);
            else picked.push(r.value);
          } else {
            failures.push({ url: urls[i], error: r.reason?.message || "scrape rejected" });
          }
        }
        send(controller, "scraped", {
          ok: picked.length,
          failed: failures.length,
          failures,
        });

        send(controller, "selected", {
          items: picked.map((a) => ({
            url: a.url,
            title: a.title,
            source: a.source,
            publishedAt: a.publishedAt,
          })),
        });

        if (picked.length === 0) {
          send(controller, "error", { error: "None of the selected URLs could be scraped." });
          controller.close();
          return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const modelId = shared.composeModel || "gemini-2.5-flash";
        const model = genAI.getGenerativeModel({ model: modelId });

        // Step 3: process each sequentially to keep memory + WP rate sane
        for (let i = 0; i < picked.length; i++) {
          const article = picked[i];
          const record: PublicationRecord = {
            id: `pub_${Date.now().toString(36)}_${i}`,
            sourceUrl: article.url,
            sourceTitle: article.title,
            sourceDate: article.publishedAt ? new Date(article.publishedAt).toISOString() : undefined,
            publishedAt: Date.now(),
          };

          // Dhivehi
          if (wpDV) {
            try {
              send(controller, "step", { index: i, step: "translating-dv", url: article.url });
              const dv = await generateForLanguage(model, article, "dv");
              send(controller, "step", { index: i, step: "publishing-dv", url: article.url });
              const pub = await publishDraft(wpDV, {
                title: dv.title,
                content: dv.content,
                customFields: {
                  ...(dv.latin ? { article_latin: dv.latin } : {}),
                  ...(dv.social ? { article_social_text: dv.social } : {}),
                },
                tags: dv.tags,
              });
              record.dv = {
                title: dv.title,
                site: wpDV.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
                postId: pub.postId,
                editUrl: pub.editUrl,
                postUrl: pub.postUrl,
                error: pub.error,
              };
            } catch (err) {
              record.dv = {
                title: "",
                site: wpDV.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
                error: err instanceof Error ? err.message : "DV failed",
              };
            }
          }

          // English
          if (wpEN) {
            try {
              send(controller, "step", { index: i, step: "paraphrasing-en", url: article.url });
              const en = await generateForLanguage(model, article, "en");
              send(controller, "step", { index: i, step: "publishing-en", url: article.url });
              const pub = await publishDraft(wpEN, {
                title: en.title,
                content: en.content,
                customFields: en.social ? { article_social_text: en.social } : undefined,
                tags: en.tags,
              });
              record.en = {
                title: en.title,
                site: wpEN.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
                postId: pub.postId,
                editUrl: pub.editUrl,
                postUrl: pub.postUrl,
                error: pub.error,
              };
            } catch (err) {
              record.en = {
                title: "",
                site: wpEN.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
                error: err instanceof Error ? err.message : "EN failed",
              };
            }
          }

          await appendPublication(record);
          send(controller, "item-done", { index: i, record });
        }

        send(controller, "done", {});
      } catch (err) {
        send(controller, "error", { error: err instanceof Error ? err.message : "Pipeline failed" });
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

export const maxDuration = 300;
export const dynamic = "force-dynamic";
