// ─── Social Image Generator API ───────────────────────────
// POST /api/generate-image
// Generates a 1500x1500 PNG: background image + postwater overlay
// + Dhivehi title text. Uses node-canvas with TTF font and manual
// RTL string reversal (same approach as the WordPress plugin).
// node-canvas uses FreeType which properly shapes Thaana glyphs.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import { readFile } from "fs/promises";
import { join } from "path";

// Register MVAWaheed TTF font (TTF works better than OTF with node-canvas)
const fontPath = join(process.cwd(), "public", "fonts", "MVAWaheed.ttf");
try {
  registerFont(fontPath, { family: "MVAWaheed" });
} catch {
  console.warn("Could not register MVAWaheed font at", fontPath);
}

// ── RTL string reversal (same logic as WordPress plugin) ──
// GD/FreeType renders LTR, so we reverse the Unicode string for RTL display.
// Numbers, dates, and special chars are preserved in correct order.
function utf8StrRev(str: string): string {
  // Split into individual Unicode characters and reverse
  const chars = Array.from(str);
  let line = chars.reverse().join("");

  // Fix numbers/dates that got reversed — keep them in original order
  const numMatches = str.match(/[\d:%-/،$]+/g) || [];
  for (const num of numMatches) {
    const reversed = Array.from(num).reverse().join("");
    if (reversed !== num) {
      line = line.replace(reversed, num);
    }
  }

  // Fix parentheses direction
  line = line.replace(/\)(.*?)\(/g, "($1)");

  return line;
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
    const fontSize = 70;
    const lineHeightMultiplier = 1.86; // (70 + 60) / 70, same as plugin for Thaana
    const lineHeightPx = fontSize * lineHeightMultiplier;

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

    // 3. Render text using node-canvas (same approach as WordPress plugin)
    const titleBoxWidth = W;
    const titleBoxHeight = 400;
    const bottomMargin = 30;
    const paddingX = 50;
    const paddingY = 20;

    const textCanvas = createCanvas(titleBoxWidth, titleBoxHeight);
    const ctx = textCanvas.getContext("2d");

    // Font size in points (0.75 * pixels, same as plugin)
    const fontSizePt = 0.75 * fontSize;
    ctx.font = `${fontSizePt}pt MVAWaheed`;
    ctx.fillStyle = "white";
    ctx.textBaseline = "alphabetic";

    // Word-wrap text using measureText (same logic as plugin's wrapTextWithOverflow)
    const boxWidth = titleBoxWidth - paddingX * 2;
    const words = title.split(" ");
    const lines: string[] = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + " " + words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width >= boxWidth) {
        // Reverse the line for RTL (same as plugin's utf8StrRev)
        lines.push(utf8StrRev(currentLine));
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(utf8StrRev(currentLine));

    // Calculate vertical alignment (center within text box)
    const textHeight = lines.length * lineHeightPx;
    const yAlign = (titleBoxHeight - paddingY * 2) / 2 - textHeight / 2;
    const baseline = 0.2;
    const yShift = lineHeightPx * (1 - baseline);

    // Draw each line centered
    for (let n = 0; n < lines.length; n++) {
      const lineMetrics = ctx.measureText(lines[n]);
      const lineWidth = lineMetrics.width;
      const xAlign = (boxWidth - lineWidth) / 2;

      const x = paddingX + xAlign;
      const y = paddingY + yAlign + yShift + n * lineHeightPx;

      ctx.fillText(lines[n], x, y);
    }

    // Convert text canvas to PNG and position at bottom
    const textPng = textCanvas.toBuffer("image/png");
    const titleBoxY = H - titleBoxHeight - bottomMargin;
    composites.push({ input: textPng, top: titleBoxY, left: 0 });

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
