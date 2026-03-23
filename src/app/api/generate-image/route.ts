// ─── Social Image Generator API ───────────────────────────
// POST /api/generate-image
// Generates a 1500x1500 PNG with featured image background,
// postwater.png overlay, and RTL Dhivehi title using satori + resvg.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "fs/promises";
import { join } from "path";
import React from "react";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, imageUrl } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    // 1. Load Faruma font as ArrayBuffer
    const fontPath = join(process.cwd(), "public", "fonts", "Faruma.otf");
    const fontData = await readFile(fontPath);

    // 2. Fetch background image → base64 data URL
    let bgBase64 = "";
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(10000),
        });
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          bgBase64 = `data:${contentType};base64,${imgBuffer.toString("base64")}`;
        }
      } catch {
        // Image fetch failed — use solid background
      }
    }

    // 3. Load watermark overlay → base64 data URL
    let watermarkBase64 = "";
    try {
      const watermarkPath = join(process.cwd(), "public", "postwater.png");
      const watermarkBuffer = await readFile(watermarkPath);
      watermarkBase64 = `data:image/png;base64,${watermarkBuffer.toString("base64")}`;
    } catch {
      // No watermark file — skip overlay
    }

    // 4. Build the satori element tree using React.createElement
    const children: React.ReactNode[] = [];

    // Background image or solid color
    if (bgBase64) {
      children.push(
        React.createElement("img", {
          key: "bg",
          src: bgBase64,
          style: {
            position: "absolute" as const,
            top: 0,
            left: 0,
            width: 1500,
            height: 1500,
            objectFit: "cover" as const,
          },
        })
      );
    }

    // Watermark overlay
    if (watermarkBase64) {
      children.push(
        React.createElement("img", {
          key: "wm",
          src: watermarkBase64,
          style: {
            position: "absolute" as const,
            top: 0,
            left: 0,
            width: 1500,
            height: 1500,
          },
        })
      );
    }

    // Title text (RTL Dhivehi)
    children.push(
      React.createElement("div", {
        key: "title",
        style: {
          position: "absolute" as const,
          bottom: 100,
          left: 80,
          right: 80,
          fontFamily: "Faruma",
          fontSize: 64,
          color: "white",
          lineHeight: 1.5,
          textAlign: "right" as const,
          direction: "rtl" as const,
          textShadow: "0 4px 30px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.7)",
        },
      }, title)
    );

    // 5. Generate SVG with satori
    const element = React.createElement("div", {
      style: {
        width: 1500,
        height: 1500,
        position: "relative" as const,
        display: "flex",
        flexDirection: "column" as const,
        justifyContent: "flex-end" as const,
        backgroundColor: bgBase64 ? "transparent" : "#1B2332",
      },
    }, ...children);

    const svg = await satori(element, {
      width: 1500,
      height: 1500,
      fonts: [
        {
          name: "Faruma",
          data: fontData,
          style: "normal",
        },
      ],
    });

    // 6. Convert SVG to PNG
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 1500 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="social-${Date.now()}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
