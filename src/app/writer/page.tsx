"use client";

// ─── AI Writer Page ───────────────────────────────────────
// Two modes:
//   • Bullet Points — compose an article from key facts
//   • From Tweet     — turn a tweet (URL or pasted text) into a Dhivehi article

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PenTool,
  Loader2,
  AlertCircle,
  Twitter,
  ListChecks,
  HelpCircle,
  ArrowLeft,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";
import GlassSelect from "@/components/GlassSelect";
import BottomNav from "@/components/BottomNav";
import { useSettings } from "@/lib/useSettings";

type WriterMode = "points" | "tweet";

export default function WriterPage() {
  const router = useRouter();
  const { loaded } = useSettings();

  const [mode, setMode] = useState<WriterMode>("points");

  // Bullet points mode
  const [writerPoints, setWriterPoints] = useState("");

  // Tweet mode
  const [tweetUrl, setTweetUrl] = useState("");
  const [tweetText, setTweetText] = useState("");
  const [tweetContext, setTweetContext] = useState("");

  // Shared options
  const [articleType, setArticleType] = useState("news");
  const [wordCount, setWordCount] = useState("400");
  const [processError, setProcessError] = useState("");

  // Tweet clarification flow
  const [checking, setChecking] = useState(false);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);

  const composeFromPoints = useCallback(() => {
    if (!writerPoints.trim()) return;
    sessionStorage.setItem("articleRequest", JSON.stringify({
      endpoint: "/api/compose",
      body: {
        points: writerPoints,
        articleType,
        wordCount: parseInt(wordCount),
      },
    }));
    sessionStorage.removeItem("articleResult");
    router.push("/article");
  }, [writerPoints, articleType, wordCount, router]);

  // Build the editor-context block by combining manual context + Q&A answers
  const buildExtraContext = useCallback(
    (extraAnswers?: string[]) => {
      let combined = tweetContext.trim();
      const list = extraAnswers ?? answers;
      if (questions && list.some((a) => a.trim())) {
        const qa = questions
          .map((q, i) => `Q: ${q}\nA: ${(list[i] || "(no answer)").trim()}`)
          .join("\n\n");
        combined = combined ? `${combined}\n\nEDITOR ANSWERS:\n${qa}` : `EDITOR ANSWERS:\n${qa}`;
      }
      return combined;
    },
    [tweetContext, questions, answers]
  );

  const proceedToCompose = useCallback(
    (finalAnswers?: string[]) => {
      sessionStorage.setItem(
        "articleRequest",
        JSON.stringify({
          endpoint: "/api/from-tweet",
          body: {
            url: tweetUrl.trim(),
            text: tweetText.trim(),
            extraContext: buildExtraContext(finalAnswers),
            articleType,
            wordCount: parseInt(wordCount),
          },
        })
      );
      sessionStorage.removeItem("articleResult");
      router.push("/article");
    },
    [tweetUrl, tweetText, articleType, wordCount, buildExtraContext, router]
  );

  const composeFromTweet = useCallback(async () => {
    if (!tweetUrl.trim() && !tweetText.trim()) {
      setProcessError("Paste a tweet URL or the tweet text.");
      return;
    }
    setProcessError("");
    setChecking(true);
    try {
      const res = await fetch("/api/from-tweet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: tweetUrl.trim(),
          text: tweetText.trim(),
          extraContext: tweetContext.trim(),
          clarifyOnly: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProcessError(data.error || `Check failed (${res.status})`);
        setChecking(false);
        return;
      }
      if (data.ready || !Array.isArray(data.questions) || data.questions.length === 0) {
        // No questions needed — go straight to composing
        setChecking(false);
        proceedToCompose();
        return;
      }
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(""));
      setChecking(false);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Check failed");
      setChecking(false);
    }
  }, [tweetUrl, tweetText, tweetContext, proceedToCompose]);

  const submitAnswers = useCallback(() => {
    proceedToCompose(answers);
  }, [proceedToCompose, answers]);

  const skipQuestions = useCallback(() => {
    proceedToCompose(new Array(questions?.length ?? 0).fill(""));
  }, [proceedToCompose, questions]);

  const cancelQuestions = useCallback(() => {
    setQuestions(null);
    setAnswers([]);
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <BottomNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight flex items-center gap-2">
            <PenTool className="w-6 h-6" />
            AI Writer
          </h2>
          <p className="text-sm text-muted mt-1">
            Generate original Dhivehi articles from key points or a tweet.
          </p>
        </div>

        {/* Mode tabs */}
        <div className="glass-soft rounded-2xl p-1 flex gap-1 mb-4">
          <ModeTab
            active={mode === "points"}
            onClick={() => setMode("points")}
            icon={<ListChecks className="w-4 h-4" />}
            label="Bullet Points"
          />
          <ModeTab
            active={mode === "tweet"}
            onClick={() => setMode("tweet")}
            icon={<Twitter className="w-4 h-4" />}
            label="From Tweet"
          />
        </div>

        {/* Shared options */}
        <GlassCard className="p-5 sm:p-6 mb-4">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
            Article Options
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassSelect
              label="Article Type"
              value={articleType}
              onChange={setArticleType}
              options={[
                { label: "News Report", value: "news" },
                { label: "Opinion / Editorial", value: "opinion" },
                { label: "Investigative Report", value: "report" },
              ]}
            />
            <GlassSelect
              label="Word Count"
              value={wordCount}
              onChange={setWordCount}
              options={[
                { label: "~200 words (Short)", value: "200" },
                { label: "~400 words (Medium)", value: "400" },
                { label: "~600 words (Standard)", value: "600" },
                { label: "~800 words (Long)", value: "800" },
                { label: "~1000 words (Extended)", value: "1000" },
              ]}
            />
          </div>
        </GlassCard>

        {/* Mode body */}
        {mode === "points" && (
          <GlassCard className="p-5 sm:p-6">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
              Key Points
            </h3>
            <textarea
              value={writerPoints}
              onChange={(e) => setWriterPoints(e.target.value)}
              placeholder={"Enter the key points to write about…\n\nExample:\n- President announced new housing project\n- 5000 units in Hulhumale Phase 3\n- Construction starts Q2 2026\n- Partnership with foreign investors"}
              rows={10}
              className="glass-input w-full rounded-xl p-4 text-sm resize-y mb-4"
            />
            <button
              onClick={composeFromPoints}
              disabled={!writerPoints.trim()}
              className="glass-btn w-full flex items-center justify-center gap-2 font-medium py-3 rounded-xl"
            >
              <PenTool className="w-4 h-4" />
              Generate Article
            </button>
          </GlassCard>
        )}

        {mode === "tweet" && !questions && (
          <GlassCard className="p-5 sm:p-6">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
              Tweet Source
            </h3>

            <label className="text-[11px] font-medium text-muted mb-1.5 block">
              Tweet URL
            </label>
            <input
              type="url"
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/username/status/123…"
              className="glass-input w-full rounded-xl px-4 py-3 text-sm mb-4"
            />

            <label className="text-[11px] font-medium text-muted mb-1.5 block">
              Or paste tweet text
              <span className="ml-1.5 text-faint normal-case font-normal">
                (used if the URL can't be fetched)
              </span>
            </label>
            <textarea
              value={tweetText}
              onChange={(e) => setTweetText(e.target.value)}
              placeholder="Paste the tweet text here if the URL isn't accessible…"
              rows={4}
              className="glass-input w-full rounded-xl p-4 text-sm resize-y mb-4"
            />

            <label className="text-[11px] font-medium text-muted mb-1.5 block">
              Editor's Context
              <span className="ml-1.5 text-faint normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={tweetContext}
              onChange={(e) => setTweetContext(e.target.value)}
              placeholder="Background facts you want included — e.g., the company has 200 employees, the policy took effect last month, etc."
              rows={3}
              className="glass-input w-full rounded-xl p-4 text-sm resize-y mb-4"
            />

            <button
              onClick={composeFromTweet}
              disabled={checking || (!tweetUrl.trim() && !tweetText.trim())}
              className="glass-btn w-full flex items-center justify-center gap-2 font-medium py-3 rounded-xl"
            >
              {checking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Twitter className="w-4 h-4" />
              )}
              {checking ? "Reviewing the tweet…" : "Generate Article From Tweet"}
            </button>

            <p className="text-[11px] text-faint mt-3">
              The AI reviews the tweet first — if it has doubts, it'll ask you for context before writing.
            </p>
          </GlassCard>
        )}

        {mode === "tweet" && questions && (
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <HelpCircle className="w-4 h-4" />
                Editor — please clarify
              </h3>
              <button
                onClick={cancelQuestions}
                className="text-xs text-muted hover:text-primary flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </div>
            <p className="text-xs text-muted mb-4">
              The AI flagged a few uncertainties in the tweet. Answer what you can — leave blanks
              if unknown and we'll caveat them in the article.
            </p>
            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={i}>
                  <label className="text-sm font-medium text-primary mb-1.5 block">
                    {i + 1}. {q}
                  </label>
                  <textarea
                    value={answers[i] || ""}
                    onChange={(e) => {
                      const next = [...answers];
                      next[i] = e.target.value;
                      setAnswers(next);
                    }}
                    placeholder="Your answer (optional)…"
                    rows={2}
                    className="glass-input w-full rounded-xl p-3 text-sm resize-y"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-5">
              <button
                onClick={submitAnswers}
                className="glass-btn flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              >
                <Twitter className="w-4 h-4" />
                Generate With My Answers
              </button>
              <button
                onClick={skipQuestions}
                className="glass-btn-ghost flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              >
                Skip — Generate Anyway
              </button>
            </div>
          </GlassCard>
        )}

        {processError && (
          <GlassCard className="p-5 animate-fade-in mt-4">
            <div className="flex items-start gap-3 text-red-600">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Generation Failed</p>
                <p className="text-sm text-red-500 mt-1">{processError}</p>
              </div>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
        active ? "shadow-sm" : "text-muted hover:text-primary"
      }`}
      style={active ? { background: "var(--glass-bg-strong)", color: "var(--text-primary)" } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}
