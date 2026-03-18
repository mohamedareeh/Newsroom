// ─── WordPress REST API Proxy ─────────────────────────────
// POST /api/wordpress
// Actions: "categories" — fetch WP categories
//          "publish"    — create a draft post

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSharedSettings } from "@/lib/sharedSettings";

interface WPRequest {
  action: "categories" | "publish";
  title?: string;
  content?: string;
  categoryId?: number;
  customFields?: Record<string, string>;
}

interface WPCreds {
  siteUrl: string;
  username: string;
  appPassword: string;
}

function wpAuth(wp: WPCreds) {
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

  // Read WordPress credentials from shared settings (KV)
  const shared = await getSharedSettings();
  const wordpress = shared.wordpress;
  const { action } = body;
  if (!wordpress?.siteUrl || !wordpress?.username || !wordpress?.appPassword) {
    return NextResponse.json({ error: "WordPress not configured. Ask an admin to set it up in Settings." }, { status: 400 });
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
      const hasMeta = Object.keys(meta).length > 0;

      // Step 1: Create the draft post (include meta in case fields are registered for REST)
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
          ...(hasMeta ? { meta } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `WP publish error: ${res.status} — ${text}` }, { status: 502 });
      }
      const post = await res.json();

      // Step 2: Set custom fields individually via WP REST meta endpoint
      // This handles cases where meta keys are registered for REST API
      if (hasMeta && post.id) {
        // Check if meta was already saved in Step 1
        const savedMeta = post.meta || {};
        const unsavedMeta: Record<string, string> = {};
        for (const [key, value] of Object.entries(meta)) {
          if (savedMeta[key] !== value) {
            unsavedMeta[key] = value;
          }
        }

        // If any meta wasn't saved, try a PATCH update
        if (Object.keys(unsavedMeta).length > 0) {
          try {
            await fetch(`${siteUrl}/wp-json/wp/v2/posts/${post.id}`, {
              method: "PATCH",
              headers: {
                Authorization: wpAuth(wordpress),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ meta: unsavedMeta }),
              signal: AbortSignal.timeout(10000),
            });
          } catch {
            // Non-fatal: custom fields may require register_post_meta() on WP side
            console.warn("Could not save custom fields via REST — ensure meta keys are registered with show_in_rest in WordPress");
          }
        }
      }

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
