// ─── Auto-Post-FB Cron ──────────────────────────────────────
// GET|POST /api/cron/auto-post-fb?secret=<CRON_SECRET>
// Hit this URL periodically (cron-job.org, UptimeRobot, GitHub Actions).
// Each invocation:
//   1. Verifies the secret (rejects 401 otherwise).
//   2. Reads the configured RSS feed from shared settings.
//   3. Compares against the "seen" set in Vercel KV.
//   4. For each new item, generates the social image and posts it to
//      the configured Facebook Page via the Graph API.
//   5. Adds processed links to the "seen" set and logs to publication log.
//
// First-run safety: if KV has no prior "seen" set, we treat ALL the current
// RSS items as already-seen and post nothing on this invocation. Subsequent
// invocations only post genuinely-new items.

import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { kv } from "@vercel/kv";
import { getSharedSettings } from "@/lib/sharedSettings";
import { fetchPage, describeFetchError } from "@/lib/fetchPage";
import { generateSocialImage } from "@/lib/generateSocialImage";
import { appendPublication } from "@/lib/publicationLog";

const KV_SEEN_KEY = "autopost_fb_seen_links";
const KV_SEEN_LIMIT = 200; // keep the most recent 200 to bound memory

const parser = new Parser({
  timeout: 12000,
  customFields: { item: [["media:content", "mediaContent"]] },
});

interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  imageUrl?: string;
}

async function readSeen(): Promise<string[]> {
  try {
    const raw = await kv.get<string[]>(KV_SEEN_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
async function writeSeen(list: string[]) {
  try {
    await kv.set(KV_SEEN_KEY, list.slice(0, KV_SEEN_LIMIT));
  } catch { /* ignore */ }
}

async function postToFacebook(
  pageId: string,
  accessToken: string,
  imageBuffer: Buffer,
  caption: string
): Promise<{ ok: true; postId?: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append("access_token", accessToken);
    if (caption) form.append("message", caption);
    form.append(
      "source",
      new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }),
      "social.png"
    );
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error.message || "Facebook API error" };
    return { ok: true, postId: data.post_id || data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

function renderCaption(template: string, item: FeedItem): string {
  return (template || "{title}\n\n{link}")
    .replace(/\{title\}/g, item.title || "")
    .replace(/\{link\}/g, item.link || "")
    .trim();
}

async function handle(req: NextRequest) {
  // ── 1. Secret check ──
  const expected = process.env.CRON_SECRET || "";
  const provided =
    req.nextUrl.searchParams.get("secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    "";
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET env var not configured on the deployment." },
      { status: 500 }
    );
  }
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Read settings ──
  const shared = await getSharedSettings();
  const cfg = shared.autoPostFb;
  if (!cfg?.enabled) {
    return NextResponse.json({ skipped: true, reason: "autoPostFb disabled in Settings" });
  }
  const rssUrl = cfg.rssUrl?.trim();
  if (!rssUrl) {
    return NextResponse.json({ skipped: true, reason: "no RSS URL configured" });
  }
  const pageId = shared.facebook?.pageId?.trim();
  const pageAccessToken = shared.facebook?.pageAccessToken?.trim();
  if (!pageId || !pageAccessToken) {
    return NextResponse.json(
      { error: "Facebook Page not configured (Settings → Facebook Page)." },
      { status: 400 }
    );
  }

  // ── 3. Fetch the feed ──
  const page = await fetchPage(rssUrl, 12000);
  if (!page.ok) {
    return NextResponse.json(
      { error: `Couldn't fetch feed: ${describeFetchError(page)}` },
      { status: 502 }
    );
  }
  let feed;
  try {
    feed = await parser.parseString(page.text);
  } catch (err) {
    return NextResponse.json(
      { error: `Couldn't parse feed XML: ${err instanceof Error ? err.message : "parse error"}` },
      { status: 502 }
    );
  }
  const items: FeedItem[] = (feed.items || [])
    .filter((it) => it.link && it.title)
    .slice(0, 20) // process at most 20 per cron tick
    .map((it) => ({
      title: String(it.title!).trim(),
      link: String(it.link!).trim(),
      pubDate: it.pubDate || it.isoDate,
      imageUrl:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        it.enclosure?.url || (it as any).mediaContent?.$.url || (it as any).mediaContent?.url ||
        (it.content?.match(/<img[^>]+src="([^"]+)"/) || [])[1] ||
        undefined,
    }));

  // ── 4. First-run handling ──
  const seen = await readSeen();
  if (seen.length === 0) {
    // Bootstrap — mark current items as seen, post nothing this tick.
    await writeSeen(items.map((i) => i.link));
    return NextResponse.json({
      bootstrapped: true,
      seenInitial: items.length,
      message: "First run — recorded current RSS items as seen. Next ticks will post genuinely new items.",
    });
  }

  const seenSet = new Set(seen);
  let newItems = items.filter((i) => !seenSet.has(i.link));
  if (newItems.length === 0) {
    return NextResponse.json({ posted: 0, scanned: items.length, message: "No new items." });
  }

  // Enforce per-tick cap (default 2). Pick the OLDEST unposted items so a backlog
  // drains chronologically — extras roll over to the next tick.
  const maxPerTick = Math.max(1, Math.min(20, cfg.maxPerTick ?? 2));
  const pending = newItems.length;
  if (newItems.length > maxPerTick) {
    // RSS feeds are typically newest-first; reverse so we pick the oldest tail.
    const ordered = newItems.slice().reverse();
    newItems = ordered.slice(0, maxPerTick).reverse();
  }
  const deferred = Math.max(0, pending - newItems.length);

  // ── 5. Post each new item ──
  const results: Array<{
    link: string;
    title: string;
    posted: boolean;
    postId?: string;
    error?: string;
  }> = [];

  // Post oldest first so the feed reads chronologically on FB.
  for (const item of newItems.reverse()) {
    try {
      const imageBuffer = await generateSocialImage({
        title: item.title,
        imageUrl: item.imageUrl,
      });
      const caption = renderCaption(cfg.captionTemplate, item);
      const fbResult = await postToFacebook(pageId, pageAccessToken, imageBuffer, caption);

      if (fbResult.ok) {
        results.push({ link: item.link, title: item.title, posted: true, postId: fbResult.postId });
        seenSet.add(item.link);
        await appendPublication({
          id: `autofb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          sourceUrl: item.link,
          sourceTitle: item.title,
          sourceDate: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
          publishedAt: Date.now(),
          // Reuse the dv slot as the FB post record (publication log is generic)
          dv: {
            title: item.title,
            site: `facebook:${pageId}`,
            // postId in publicationLog is a number — FB returns a string id,
            // so we stash it in postUrl instead and leave postId undefined.
            postUrl: fbResult.postId
              ? `https://www.facebook.com/${fbResult.postId}`
              : undefined,
          },
        });
      } else {
        results.push({ link: item.link, title: item.title, posted: false, error: fbResult.error });
        // Don't add to seen so it'll retry next tick. But if the error is
        // permanent (e.g. duplicate post), the user can clear the seen set.
        // Stop processing further items on auth errors so we don't repeat.
        if (/OAuth|access token|expired/i.test(fbResult.error)) {
          break;
        }
      }
    } catch (err) {
      results.push({
        link: item.link,
        title: item.title,
        posted: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Persist the updated seen list (cap at the most recent N).
  const updatedSeen = Array.from(seenSet).slice(0, KV_SEEN_LIMIT);
  await writeSeen(updatedSeen);

  const postedCount = results.filter((r) => r.posted).length;
  return NextResponse.json({
    posted: postedCount,
    failed: results.length - postedCount,
    deferred,
    capPerTick: maxPerTick,
    scanned: items.length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

export const maxDuration = 300;
export const dynamic = "force-dynamic";
