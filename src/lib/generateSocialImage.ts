// ─── Social Image Generator (shared) ─────────────────────────
// Same 1500×1500 PNG generation logic used by both /api/generate-image
// (interactive) and /api/cron/auto-post-fb (background). Returns a
// PNG Buffer so callers can serve it, base64 it, or send it to a
// social API.

import sharp from "sharp";
import { createCanvas, registerFont } from "canvas";
import { readFile } from "fs/promises";
import { join } from "path";

const FONT_PATH = join(process.cwd(), "public", "fonts", "MVWaheed.otf");
let fontRegistered = false;
function ensureFont() {
  if (fontRegistered) return;
  try {
    registerFont(FONT_PATH, { family: "MVWaheed" });
    fontRegistered = true;
  } catch {
    // Non-fatal — canvas will fall back to a default font.
  }
}

export interface GenerateSocialImageOptions {
  title: string;
  imageUrl?: string;
  /** Override the default fetch UA when downloading the featured image. */
  fetchUserAgent?: string;
}

export async function generateSocialImage(opts: GenerateSocialImageOptions): Promise<Buffer> {
  const { title, imageUrl, fetchUserAgent } = opts;
  if (!title || !title.trim()) {
    throw new Error("generateSocialImage: title required");
  }

  ensureFont();

  const W = 1500;
  const H = 1500;
  const fontSize = 70;
  const lineHeightMultiplier = 1.86;
  const lineHeightPx = fontSize * lineHeightMultiplier;

  // 1. Background
  const solidFallback = () =>
    sharp({
      create: { width: W, height: H, channels: 4, background: { r: 27, g: 35, b: 50, alpha: 1 } },
    });

  let baseImage: sharp.Sharp;
  if (imageUrl) {
    try {
      const res = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            fetchUserAgent ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        baseImage = sharp(buf).resize(W, H, { fit: "cover", position: "center" });
      } else {
        baseImage = solidFallback();
      }
    } catch {
      baseImage = solidFallback();
    }
  } else {
    baseImage = solidFallback();
  }

  // 2. Watermark overlay
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
    // No watermark — non-fatal
  }

  // 3. Title text on canvas
  const titleBoxWidth = W;
  const titleBoxHeight = 400;
  const bottomMargin = 30;
  const paddingX = 50;
  const paddingY = 20;

  const textCanvas = createCanvas(titleBoxWidth, titleBoxHeight);
  const ctx = textCanvas.getContext("2d");
  const fontSizePt = 0.75 * fontSize;
  ctx.font = `${fontSizePt}pt MVWaheed`;
  ctx.fillStyle = "white";
  ctx.textBaseline = "alphabetic";

  const boxWidth = titleBoxWidth - paddingX * 2;
  const words = title.trim().split(" ");
  const lines: string[] = [];
  let currentLine = words[0] ?? "";
  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + " " + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width >= boxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const textHeight = lines.length * lineHeightPx;
  const yAlign = (titleBoxHeight - paddingY * 2) / 2 - textHeight / 2;
  const baseline = 0.2;
  const yShift = lineHeightPx * (1 - baseline);

  for (let n = 0; n < lines.length; n++) {
    const lineMetrics = ctx.measureText(lines[n]);
    const lineWidth = lineMetrics.width;
    const xAlign = (boxWidth - lineWidth) / 2;
    const x = paddingX + xAlign;
    const y = paddingY + yAlign + yShift + n * lineHeightPx;
    ctx.fillText(lines[n], x, y);
  }

  const textPng = textCanvas.toBuffer("image/png");
  const titleBoxY = H - titleBoxHeight - bottomMargin;
  composites.push({ input: textPng, top: titleBoxY, left: 0 });

  return baseImage.composite(composites).png({ quality: 90 }).toBuffer();
}
