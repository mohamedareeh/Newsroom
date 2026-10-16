// ─── Site Report API ──────────────────────────────────────
// GET /api/site-report?date=YYYY-MM-DD
// Lists every post published on Dhen (Dhivehi) and Maldives Insight
// (English) on the given Maldives-local day, straight from each site's
// WordPress REST API. Also counts pipeline posts that were run on that
// day but backdated (so they don't show under that day on the sites).

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSharedSettings, resolveWP, WordPressCreds } from "@/lib/sharedSettings";
import { getPublicationsForDate } from "@/lib/publicationLog";

const MV_OFFSET_MS = 5 * 60 * 60 * 1000; // Maldives is UTC+5, no DST

function maldivesToday(): string {
  return new Date(Date.now() + MV_OFFSET_MS).toISOString().slice(0, 10);
}

interface ReportPost {
  id: number;
  title: string;
  link: string;
  date: string; // site-local "YYYY-MM-DDTHH:mm:ss"
  categories: string[];
}

interface SiteReport {
  key: "dv" | "en";
  name: string;
  site: string | null;
  posts: ReportPost[];
  error?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function fetchSitePosts(wp: WordPressCreds, date: string): Promise<ReportPost[]> {
  const siteUrl = wp.siteUrl.replace(/\/+$/, "");
  const auth = "Basic " + Buffer.from(`${wp.username}:${wp.appPassword}`).toString("base64");
  // `after`/`before` are compared against the site-local post date. One
  // second either side so posts at exactly 00:00:00 / 23:59:59 are included.
  const prev = new Date(new Date(date + "T00:00:00Z").getTime() - 1000).toISOString().slice(0, 19);
  const next = new Date(new Date(date + "T00:00:00Z").getTime() + 86400_000).toISOString().slice(0, 19);

  const raw: { id: number; date: string; link: string; title?: { rendered?: string }; categories?: number[] }[] = [];
  for (let page = 1; page <= 5; page++) {
    const qs = new URLSearchParams({
      after: prev,
      before: next,
      status: "publish",
      per_page: "100",
      page: String(page),
      orderby: "date",
      order: "desc",
      _fields: "id,date,link,title,categories",
    });
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts?${qs}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 400 && page > 1) break; // past the last page
      const t = await res.text();
      throw new Error(`WP ${res.status} — ${t.slice(0, 150)}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    raw.push(...batch);
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    if (page >= totalPages) break;
  }

  // Belt and braces: keep only posts whose local date is the requested day.
  const posts = raw.filter((p) => typeof p.date === "string" && p.date.startsWith(date));

  // Resolve category names in one request.
  const catIds = Array.from(new Set(posts.flatMap((p) => p.categories || [])));
  const catNames = new Map<number, string>();
  if (catIds.length > 0) {
    try {
      const res = await fetch(
        `${siteUrl}/wp-json/wp/v2/categories?include=${catIds.join(",")}&per_page=100&_fields=id,name`,
        { headers: { Authorization: auth }, signal: AbortSignal.timeout(10000), cache: "no-store" }
      );
      if (res.ok) {
        const cats = await res.json();
        if (Array.isArray(cats)) for (const c of cats) catNames.set(c.id, decodeEntities(String(c.name)));
      }
    } catch {
      // names are nice-to-have
    }
  }

  return posts.map((p) => ({
    id: p.id,
    title: decodeEntities(p.title?.rendered || "") || "(no title)",
    link: p.link,
    date: p.date,
    categories: (p.categories || []).map((id) => catNames.get(id)).filter((x): x is string => !!x),
  }));
}

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date") || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : maldivesToday();

  const shared = await getSharedSettings();
  const targets: { key: "dv" | "en"; name: string; wp: WordPressCreds | null }[] = [
    { key: "dv", name: "Dhen", wp: resolveWP(shared, "dv") },
    { key: "en", name: "Maldives Insight", wp: resolveWP(shared, "en") },
  ];

  const sites: SiteReport[] = await Promise.all(
    targets.map(async (t): Promise<SiteReport> => {
      const site = t.wp ? t.wp.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null;
      if (!t.wp) return { key: t.key, name: t.name, site, posts: [], error: "Site not configured in Settings" };
      try {
        return { key: t.key, name: t.name, site, posts: await fetchSitePosts(t.wp, date) };
      } catch (err) {
        return { key: t.key, name: t.name, site, posts: [], error: err instanceof Error ? err.message : "Fetch failed" };
      }
    })
  );

  // Pipeline runs logged on this day (log is keyed by UTC day; close enough
  // for a daily count) that were backdated to an earlier date.
  const logs = await getPublicationsForDate(date);
  let backdatedDv = 0;
  let backdatedEn = 0;
  for (const r of logs) {
    if (!r.backdatedTo) continue;
    if (r.dv && !r.dv.error) backdatedDv++;
    if (r.en && !r.en.error) backdatedEn++;
  }

  return NextResponse.json({ date, sites, backdated: { dv: backdatedDv, en: backdatedEn } });
}

export const dynamic = "force-dynamic";
