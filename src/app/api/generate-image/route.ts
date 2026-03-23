// ─── Social Image Generator API ───────────────────────────
// POST /api/generate-image
// Generates a 1500x1500 PNG using Puppeteer (headless Chrome).
// Chrome's text engine properly handles Thaana script shaping,
// RTL layout, and font rendering — unlike node-canvas/satori.
// Layers: background image + postwater overlay + Dhivehi title.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import sharp from "sharp";
import { readFile } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, imageUrl } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  let browser;
  try {
    // Load font as base64 for embedding in HTML
    const fontPath = join(process.cwd(), "public", "fonts", "MVAWaheed.ttf");
    const fontData = await readFile(fontPath);
    const fontBase64 = fontData.toString("base64");

    // Load watermark as base64
    let watermarkBase64 = "";
    try {
      const watermarkPath = join(process.cwd(), "public", "postwater.png");
      const watermarkData = await readFile(watermarkPath);
      watermarkBase64 = `data:image/png;base64,${watermarkData.toString("base64")}`;
    } catch {
      // No watermark
    }

    // Fetch background image as base64
    let bgBase64 = "";
    if (imageUrl) {
      try {
        const res = await fetch(imageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          // Resize to 1500x1500 JPEG to reduce base64 payload
          const resized = await sharp(buf)
            .resize(1500, 1500, { fit: "cover", position: "center" })
            .jpeg({ quality: 85 })
            .toBuffer();
          bgBase64 = `data:image/jpeg;base64,${resized.toString("base64")}`;
        }
      } catch {
        // Image fetch failed
      }
    }

    const escaped = title
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Build HTML page that looks exactly like the final image
    const html = `<!DOCTYPE html>
<html>
<head>
<style>
  @font-face {
    font-family: 'MVAWaheed';
    src: url('data:font/truetype;base64,${fontBase64}') format('truetype');
    font-weight: normal;
    font-style: normal;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1500px;
    height: 1500px;
    overflow: hidden;
    position: relative;
  }
  .bg {
    position: absolute;
    top: 0; left: 0;
    width: 1500px;
    height: 1500px;
    object-fit: cover;
  }
  .bg-solid {
    position: absolute;
    top: 0; left: 0;
    width: 1500px;
    height: 1500px;
    background: #1B2332;
  }
  .overlay {
    position: absolute;
    top: 0; left: 0;
    width: 1500px;
    height: 1500px;
  }
  .text-container {
    position: absolute;
    bottom: 30px;
    left: 0;
    right: 0;
    height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 50px;
  }
  .title {
    font-family: 'MVAWaheed', sans-serif;
    font-size: 70px;
    line-height: 1.86;
    color: white;
    direction: rtl;
    text-align: center;
    max-width: 1400px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
  }
</style>
</head>
<body>
  ${bgBase64 ? `<img class="bg" src="${bgBase64}" />` : '<div class="bg-solid"></div>'}
  ${watermarkBase64 ? `<img class="overlay" src="${watermarkBase64}" />` : ''}
  <div class="text-container">
    <div class="title">${escaped}</div>
  </div>
</body>
</html>`;

    // Launch headless Chrome
    // In production (Vercel): use @sparticuz/chromium
    // In development: use locally installed Chrome
    const isDev = process.env.NODE_ENV === "development";
    browser = await puppeteer.launch({
      args: isDev ? ["--no-sandbox"] : chromium.args,
      executablePath: isDev
        ? (await (async () => {
            try {
              const puppeteerFull = await import("puppeteer");
              return puppeteerFull.default.executablePath();
            } catch {
              return "/usr/bin/google-chrome-stable";
            }
          })())
        : await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1500, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 120000 });
    // Wait a moment for images to render
    await new Promise(r => setTimeout(r, 1000));

    // Wait for font to load
    await page.evaluate(() => document.fonts.ready);

    const pngBuffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1500, height: 1500 },
    });

    await browser.close();
    browser = null;

    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="social-${Date.now()}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    const message = err instanceof Error ? err.message : "Image generation failed";
    console.error("Image generation error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
