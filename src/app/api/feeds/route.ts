// ─── RSS Feed Fetcher API ──────────────────────────────────
// GET /api/feeds?url=<rss-feed-url>
// Fetches the top 10 headlines from an RSS feed using rss-parser,
// then filters out any URLs that were already processed in the
// last 48 hours (checked against Vercel KV).

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import Parser from "rss-parser";
import { kv } from "@vercel/kv";
import { fetchPage, describeFetchError } from "@/lib/fetchPage";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  customFields: {
    item: [["media:content", "mediaContent"]],
  },
});

export async function GET(req: NextRequest) {
  // ── Auth guard ──
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedUrl = req.nextUrl.searchParams.get("url");
  const count = Math.min(parseInt(req.nextUrl.searchParams.get("count") || "10"), 30);
  if (!feedUrl) {
    return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
  }

  try {
    // Fetch the feed XML ourselves with browser-like headers + retry
    // (rss-parser's parseURL only sends a bare UA and gets 403'd a lot),
    // then hand the raw XML to the parser.
    const page = await fetchPage(feedUrl, 12000);
    if (!page.ok) {
      return NextResponse.json(
        { error: `Couldn't fetch feed (${new URL(feedUrl).hostname}): ${describeFetchError(page)}` },
        { status: 502 }
      );
    }
    const feed = await parser.parseString(page.text);
    const items = (feed.items || []).slice(0, count + 10); // grab extra for filtering

    // Check each item against the 48-hour memory bank
    const headlines: Array<{ title: string; link: string; pubDate?: string; alreadyProcessed: boolean; imageUrl?: string }> = [];

    for (const item of items) {
      if (!item.link || !item.title) continue;

      // Check if this URL was already processed
      let alreadyProcessed = false;
      try {
        const exists = await kv.get(`processed:${item.link}`);
        alreadyProcessed = !!exists;
      } catch {
        // KV unavailable — skip filtering (dev mode)
      }

      // Extract featured image: enclosure > media:content > first <img> in content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageUrl =
        item.enclosure?.url ||
        (item as any).mediaContent?.$.url ||
        (item as any).mediaContent?.url ||
        item.content?.match(/<img[^>]+src="([^"]+)"/)?.[1] ||
        "";

      headlines.push({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate || item.isoDate || undefined,
        alreadyProcessed,
        imageUrl: imageUrl || undefined,
      });

      if (headlines.length >= count) break;
    }

    return NextResponse.json({
      feedTitle: feed.title || feedUrl,
      headlines,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch feed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
