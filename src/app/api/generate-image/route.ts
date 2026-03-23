// ─── Social Image Generator API ───────────────────────────
// POST /api/generate-image
// Generates a 1500x1500 PNG: background image + postwater overlay
// + Dhivehi title text using node-canvas for text rendering
// and sharp for image compositing.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import { readFile } from "fs/promises";
import { join } from "path";

// Register MVWaheed font
const fontPath = join(process.cwd(), "public", "fonts", "MVWaheed.otf");
try {
  registerFont(fontPath, { family: "MVWaheed" });
} catch {
  console.warn("Could not register MVWaheed font");
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, imageUrl } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const W = 1500;
    const H = 1500;

    // 1. Background: featured image or solid color (via sharp)
    let baseImage: sharp.Sharp;
    if (imageUrl) {
      try {
        const res = await fetch(imageUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          baseImage = sharp(buf).resize(W, H, { fit: "cover", position: "center" });
        } else {
          baseImage = sharp({
            create: { width: W, height: H, channels: 4, background: { r: 27, g: 35, b: 50, alpha: 1 } },
          });
        }
      } catch {
        baseImage = sharp({
          create: { width: W, height: H, channels: 4, background: { r: 27, g: 35, b: 50, alpha: 1 } },
        });
      }
    } else {
      baseImage = sharp({
        create: { width: W, height: H, channels: 4, background: { r: 27, g: 35, b: 50, alpha: 1 } },
      });
    }

    // 2. Load watermark overlay
    const composites: sharp.OverlayOptions[] = [];
    try {
      const watermarkPath = join(process.cwd(), "public", "postwater.png");
      const watermarkBuf = await readFile(watermarkPath);
      const watermarkResized = await sharp(watermarkBuf)
        .resize(W, H, { fit: "fill" })
        .png()
        .toBuffer();
      composites.push({ input: watermarkResized, top: 0, left: 0 });
    } catch {
      // No watermark
    }

    // 3. Render text using node-canvas (transparent PNG)
    const textCanvas = createCanvas(W, H);
    const ctx = textCanvas.getContext("2d");

    const fontSize = 72;
    const lineHeight = fontSize * 1.8;
    const padding = 100;
    const maxWidth = W - padding * 2;
    const bottomPadding = 100;

    ctx.font = `${fontSize}px MVWaheed`;
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.direction = "rtl";
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;

    // Word-wrap using measureText
    const words = title.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Draw lines centered, anchored to bottom
    const totalHeight = lines.length * lineHeight;
    const startY = H - bottomPadding - totalHeight + lineHeight;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, startY + i * lineHeight);
    }

    const textPng = textCanvas.toBuffer("image/png");
    composites.push({ input: textPng, top: 0, left: 0 });

    // 4. Composite all layers
    const pngBuffer = await baseImage
      .composite(composites)
      .png({ quality: 90 })
      .toBuffer();

    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="social-${Date.now()}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    console.error("Image generation error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
