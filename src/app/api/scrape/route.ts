// ─── Homepage Scraper API ──────────────────────────────────
// GET /api/scrape?url=<homepage-url>
// Scrapes a news homepage using cheerio to extract headline links.
// Filters out already-processed URLs via Vercel KV memory bank.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import * as cheerio from "cheerio";
import { kv } from "@vercel/kv";

export async function GET(req: NextRequest) {
  // ── Auth guard ──
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUrl = req.nextUrl.searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
  }

  try {
    // Fetch the homepage HTML
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "CreativeNetworkNewsDesk/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract all <a> tags that look like article links
    const baseUrl = new URL(targetUrl);
    const seen = new Set<string>();
    const rawLinks: Array<{ title: string; link: string }> = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href || !text || text.length < 15) return; // skip short/nav links

      // Resolve relative URLs
      let fullUrl: string;
      try {
        fullUrl = new URL(href, baseUrl.origin).toString();
      } catch {
        return;
      }

      // Skip non-article links (anchors, mailto, social, etc.)
      if (
        fullUrl.includes("#") ||
        fullUrl.includes("mailto:") ||
        fullUrl.includes("javascript:") ||
        fullUrl.includes("/tag/") ||
        fullUrl.includes("/category/") ||
        fullUrl.includes("/author/")
      ) return;

      // Deduplicate
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      rawLinks.push({ title: text.slice(0, 200), link: fullUrl });
    });

    // Check already-processed status via KV
    const headlines: Array<{ title: string; link: string; alreadyProcessed: boolean }> = [];
    for (const item of rawLinks.slice(0, 20)) {
      let alreadyProcessed = false;
      try {
        const exists = await kv.get(`processed:${item.link}`);
        alreadyProcessed = !!exists;
      } catch {
        // KV unavailable — skip filtering
      }
      headlines.push({ ...item, alreadyProcessed });
      if (headlines.length >= 10) break;
    }

    return NextResponse.json({ headlines });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to scrape";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
