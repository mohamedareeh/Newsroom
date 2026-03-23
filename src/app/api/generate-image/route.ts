// ─── Social Image Generator API ───────────────────────────
// POST /api/generate-image
// Composites a 1500x1500 PNG: background image + postwater overlay
// + pre-rendered text overlay (from client-side canvas).
// The client renders Dhivehi text using the browser's text engine
// (which properly handles Thaana script shaping/joining) and sends
// it as a transparent PNG. This route composites all layers with sharp.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import sharp from "sharp";
import { readFile } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageUrl, textImageBase64 } = await req.json();
  if (!textImageBase64) {
    return NextResponse.json({ error: "Missing textImageBase64" }, { status: 400 });
  }

  try {
    const W = 1500;
    const H = 1500;

    // 1. Start with background: featured image or solid color
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
      // No watermark — skip
    }

    // 3. Add text overlay (pre-rendered by client with proper Thaana shaping)
    const textBuffer = Buffer.from(textImageBase64, "base64");
    // Resize text overlay to match canvas dimensions
    const textResized = await sharp(textBuffer)
      .resize(W, H, { fit: "fill" })
      .png()
      .toBuffer();
    composites.push({ input: textResized, top: 0, left: 0 });

    // 4. Composite and export
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
