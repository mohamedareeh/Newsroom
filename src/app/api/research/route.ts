// ─── AI Research with Google Search Grounding ─────────────
// POST /api/research
// Sends a query to Gemini with the googleSearch tool enabled.
// Returns the AI-written answer plus a list of citations.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSharedSettings } from "@/lib/sharedSettings";

interface ResearchRequest {
  query: string;
  language?: "en" | "dv";
}

interface Citation {
  title?: string;
  uri: string;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ResearchRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (body.query || "").trim();
  const language = body.language === "dv" ? "dv" : "en";

  if (!query) {
    return NextResponse.json({ error: "Please provide a query" }, { status: 400 });
  }

  const shared = await getSharedSettings();
  const apiKey = shared.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured. Ask an admin to set one in Settings." },
      { status: 400 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = shared.composeModel || "gemini-2.5-flash";

  const languageInstruction =
    language === "dv"
      ? "Answer in Dhivehi (Thaana script). If the source material is in English, translate the key facts into Dhivehi."
      : "Answer in clear, concise English.";

  const prompt = `You are a meticulous research assistant for a journalist. Search the web for up-to-date, reliable information about the query below and write a focused briefing.

RULES:
- ${languageInstruction}
- Be factual and source-grounded. Do not speculate.
- Lead with a one-paragraph summary that directly answers the query.
- Follow with key facts as a short bulleted list (3–7 bullets, each one line).
- If the subject is a person, include: role, organisation, nationality, age/DOB when known, notable recent activity.
- If the subject is an event, include: what, when, where, who, why.
- Use only what the search results support. If something is unclear or contested, say so plainly.

QUERY:
${query}`;

  // We don't stream this — answer + groundingMetadata both come back at the end
  // with the tool result, and the citations are easier to extract after completion.
  try {
    // Cast to any because the SDK's TS types don't yet expose `tools: [{ googleSearch: {} }]`,
    // but the REST contract supports it (per https://ai.google.dev/gemini-api/docs/grounding).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelConfig: any = {
      model: modelId,
      tools: [{ googleSearch: {} }],
    };
    const model = genAI.getGenerativeModel(modelConfig);

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text() || "";

    // Extract citations from grounding metadata
    const citations: Citation[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = (response as any).candidates;
    const gm = candidates?.[0]?.groundingMetadata;
    const chunks = gm?.groundingChunks || gm?.grounding_chunks || [];
    for (const c of chunks) {
      const web = c?.web;
      if (web?.uri) {
        citations.push({ title: web.title, uri: web.uri });
      }
    }
    // De-duplicate by URI
    const seen = new Set<string>();
    const uniqueCitations = citations.filter((c) => {
      if (seen.has(c.uri)) return false;
      seen.add(c.uri);
      return true;
    });

    return NextResponse.json({ answer: text, citations: uniqueCitations });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Research request failed";
    // Detect "tool not supported" failure modes from older models and try a plain
    // generation as a graceful fallback.
    if (/tool|grounding|googleSearch/i.test(message)) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(
          prompt + "\n\n(Note: live web search is not available — answer from training data and clearly flag any uncertainty.)"
        );
        return NextResponse.json({
          answer: result.response.text() || "",
          citations: [],
          warning:
            "Search grounding unavailable on this model; answer is from training data only.",
        });
      } catch (e2) {
        return NextResponse.json(
          { error: e2 instanceof Error ? e2.message : message },
          { status: 500 }
        );
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
