"use client";

import { useState, useEffect, useCallback } from "react";
import { Send, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface Category {
  id: number;
  name: string;
}

// Publication targets → API credential slots.
// Dhen = dhivehi site (dhen.mv), Maldives Insight = english site (maldivesinsight.com).
type Slot = "dhivehi" | "english";
const PUBLICATIONS: { slot: Slot; label: string }[] = [
  { slot: "dhivehi", label: "Dhen" },
  { slot: "english", label: "Maldives Insight" },
];

export default function WordPressPublisher({
  title,
  content,
  customFields,
  tags,
}: {
  title: string;
  content: string;
  customFields?: Record<string, string>;
  tags?: string[];
}) {
  const [site, setSite] = useState<Slot>("dhivehi");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState<"draft" | "publish" | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [result, setResult] = useState<{
    editUrl?: string;
    link?: string;
    status?: string;
    error?: string;
  } | null>(null);

  // Load categories for the currently-selected publication.
  const loadCategories = useCallback(() => {
    setLoading(true);
    setCategories([]);
    setSelectedCategory(0);
    setConfigured(null);
    setResult(null);
    fetch("/api/wordpress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "categories", slot: site }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.categories) {
          setCategories(data.categories);
          setConfigured(true);
          // Default to "ޚަބަރު" (news) category if it exists (Dhivehi site)
          const newsCategory = data.categories.find(
            (c: Category) => c.name === "ޚަބަރު"
          );
          if (newsCategory) setSelectedCategory(newsCategory.id);
        } else {
          setConfigured(false);
        }
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, [site]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handlePublish = async (status: "draft" | "publish") => {
    setPublishing(status);
    setResult(null);
    try {
      const res = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          slot: site,
          status,
          title,
          content,
          categoryId: selectedCategory || undefined,
          customFields: customFields || undefined,
          tags: tags || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ error: data.error });
      } else {
        setResult({ editUrl: data.editUrl, link: data.link, status: data.status });
      }
    } catch {
      setResult({ error: "Network error" });
    } finally {
      setPublishing(null);
    }
  };

  const activeLabel = PUBLICATIONS.find((p) => p.slot === site)?.label ?? "";

  return (
    <div className="space-y-3 p-4 bg-[#f5f3f0] border border-gray-200/60 rounded-xl">
      <h4 className="text-sm font-medium text-gray-700">Publish to WordPress</h4>

      {/* Publication selector */}
      <div className="flex gap-1.5">
        {PUBLICATIONS.map((p) => (
          <button
            key={p.slot}
            onClick={() => setSite(p.slot)}
            disabled={publishing !== null}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
              site === p.slot
                ? "bg-[#1a1a1a] text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {configured === false ? (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          {activeLabel} (WordPress) is not configured. Add its site URL, username, and
          Application Password in Settings.
        </div>
      ) : (
        <>
          {/* Category selector */}
          <div>
            <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(Number(e.target.value))}
              disabled={loading || publishing !== null}
              className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#1a1a1a] transition-all disabled:opacity-50"
            >
              <option value={0}>{loading ? "Loading categories…" : "No category"}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions: Save draft or Publish live */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePublish("draft")}
              disabled={publishing !== null || loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 active:scale-[0.97] rounded-lg text-sm text-gray-700 transition-all duration-200 disabled:opacity-50"
            >
              {publishing === "draft" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Save Draft
            </button>

            <button
              onClick={() => handlePublish("publish")}
              disabled={publishing !== null || loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#333] hover:shadow-lg hover:shadow-black/10 active:scale-[0.97] rounded-lg text-sm text-white transition-all duration-200 disabled:opacity-50"
            >
              {publishing === "publish" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Publish to {activeLabel}
            </button>
          </div>
        </>
      )}

      {/* Tags preview */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider mr-1 self-center">Tags:</span>
          {tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 bg-[#f0ede8] text-[#1a1a1a] rounded-full text-[11px] font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
            result.error
              ? "bg-red-50 border border-red-200 text-red-600"
              : "bg-green-50 border border-green-200 text-green-700"
          }`}
        >
          {result.error ? (
            <>
              <AlertCircle className="w-4 h-4 shrink-0" />
              {result.error}
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 shrink-0" />
              {result.status === "publish" ? "Published live!" : "Draft saved!"}{" "}
              {result.status === "publish" && result.link ? (
                <a
                  href={result.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-green-900"
                >
                  View post
                </a>
              ) : (
                result.editUrl && (
                  <a
                    href={result.editUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-green-900"
                  >
                    Edit in WordPress
                  </a>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
