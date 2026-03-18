// ─── WordPress REST API Proxy ─────────────────────────────
// POST /api/wordpress
// Actions: "categories" — fetch WP categories
//          "publish"    — create a draft post

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { WordPressSettings } from "@/lib/config";

interface WPRequest {
  action: "categories" | "publish";
  wordpress: WordPressSettings;
  title?: string;
  content?: string;
  categoryId?: number;
  customFields?: Record<string, string>;
}

function wpAuth(wp: WordPressSettings) {
  return "Basic " + Buffer.from(`${wp.username}:${wp.appPassword}`).toString("base64");
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WPRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, wordpress } = body;
  if (!wordpress?.siteUrl || !wordpress?.username || !wordpress?.appPassword) {
    return NextResponse.json({ error: "WordPress credentials incomplete" }, { status: 400 });
  }

  // Normalize site URL
  const siteUrl = wordpress.siteUrl.replace(/\/+$/, "");

  try {
    if (action === "categories") {
      const res = await fetch(`${siteUrl}/wp-json/wp/v2/categories?per_page=100`, {
        headers: { Authorization: wpAuth(wordpress) },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `WP API error: ${res.status} — ${text}` }, { status: 502 });
      }
      const categories = await res.json();
      return NextResponse.json({
        categories: categories.map((c: { id: number; name: string }) => ({
          id: c.id,
          name: c.name,
        })),
      });
    }

    if (action === "publish") {
      if (!body.title || !body.content) {
        return NextResponse.json({ error: "Missing title or content" }, { status: 400 });
      }
      // Build meta fields from customFields
      const meta: Record<string, string> = {};
      if (body.customFields) {
        for (const [key, value] of Object.entries(body.customFields)) {
          if (value) meta[key] = value;
        }
      }

      const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          Authorization: wpAuth(wordpress),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: body.title,
          content: body.content,
          status: "draft",
          categories: body.categoryId ? [body.categoryId] : [],
          ...(Object.keys(meta).length > 0 ? { meta } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `WP publish error: ${res.status} — ${text}` }, { status: 502 });
      }
      const post = await res.json();
      return NextResponse.json({
        postId: post.id,
        editUrl: post.link ? `${siteUrl}/wp-admin/post.php?post=${post.id}&action=edit` : undefined,
        link: post.link,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "WordPress API request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
