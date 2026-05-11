// ─── Audio Transcription ───────────────────────────────────
// POST /api/transcribe
// Accepts multipart/form-data with an "audio" file. Uses Gemini's
// inline audio input to transcribe the recording (preserving the
// language of the speaker). Returns plain text.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";

// Cap to keep us comfortably under Vercel limits (~4.5MB body)
const MAX_BYTES = 18 * 1024 * 1024; // 18MB — Gemini accepts up to 20MB inline

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "audio" file field' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Audio file too large (${Math.round(file.size / (1024 * 1024))}MB). Max 18MB.` },
      { status: 413 }
    );
  }

  const mimeType = file.type || "audio/mpeg";
  // Quick MIME guard — common audio types Gemini accepts
  const allowed = /^audio\/(mpeg|mp3|wav|wave|x-wav|ogg|webm|aac|flac|m4a|x-m4a|mp4)$/i;
  if (!allowed.test(mimeType) && !file.name.match(/\.(mp3|wav|m4a|ogg|aac|webm|flac)$/i)) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${mimeType || file.name}` },
      { status: 415 }
    );
  }

  const language = (form.get("language") as string) || "auto";
  const intent = (form.get("intent") as string) || "transcript"; // transcript | summary
  const speakers = (form.get("speakers") as string) || ""; // optional speaker hint

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured." },
      { status: 400 }
    );
  }

  // Read file as base64 (inline data path)
  let base64: string;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    base64 = buf.toString("base64");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read audio" },
      { status: 500 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = shared.composeModel || "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({ model: modelId });

  const langInst =
    language === "dv"
      ? "Transcribe in Dhivehi (Thaana script)."
      : language === "en"
      ? "Transcribe in English."
      : "Transcribe in the language actually spoken. If multiple languages are used, keep each segment in its original language.";

  const speakerLine = speakers ? `\nExpected speakers: ${speakers}` : "";

  const prompt =
    intent === "summary"
      ? `Summarise the following audio briefly in Dhivehi (Thaana). 5-8 bullet points covering who/what/when/where/why. Output ONLY the bullets — no preamble.${speakerLine}`
      : `Produce a clean verbatim transcript of the audio.

RULES:
- ${langInst}
- Use natural paragraph breaks at speaker turns and topic shifts.
- Label speakers as "Speaker 1:", "Speaker 2:" if multiple voices are present.
- Do NOT translate. Keep filler words minimal but preserve the meaning.
- Do NOT add commentary or headers. Output ONLY the transcript.${speakerLine}`;

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      { text: prompt },
    ]);
    const text = (result.response.text() || "").trim();
    if (!text) {
      return NextResponse.json({ error: "Empty transcription" }, { status: 502 });
    }
    return NextResponse.json({
      text,
      mimeType,
      durationHint: file.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Route segment config — App Router style
export const maxDuration = 120;
export const dynamic = "force-dynamic";
