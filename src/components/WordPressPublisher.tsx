"use client";

import { useState, useEffect } from "react";
import { WordPressSettings } from "@/lib/config";
import { Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface Category {
  id: number;
  name: string;
}

export default function WordPressPublisher({
  title,
  content,
  wordpress,
  customFields,
}: {
  title: string;
  content: string;
  wordpress: WordPressSettings;
  customFields?: Record<string, string>;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ editUrl?: string; error?: string } | null>(null);

  const isConfigured = wordpress.siteUrl && wordpress.username && wordpress.appPassword;

  useEffect(() => {
    if (!isConfigured) return;
    setLoading(true);
    fetch("/api/wordpress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "categories", wordpress }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.categories) setCategories(data.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isConfigured, wordpress]);

  const handlePublish = async () => {
    setPublishing(true);
    setResult(null);
    try {
      const res = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          wordpress,
          title,
          content,
          categoryId: selectedCategory || undefined,
          customFields: customFields || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ error: data.error });
      } else {
        setResult({ editUrl: data.editUrl });
      }
    } catch {
      setResult({ error: "Network error" });
    } finally {
      setPublishing(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        Configure WordPress credentials in Settings to publish.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-gray-50/80 border border-gray-200/60 rounded-xl">
      <h4 className="text-sm font-medium text-gray-700">Publish to WordPress</h4>

      {/* Category selector */}
      <div className="flex items-center gap-2">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(Number(e.target.value))}
          disabled={loading}
          className="flex-1 appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 transition-all"
        >
          <option value={0}>No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          onClick={handlePublish}
          disabled={publishing}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4F6DF5] to-[#6C5BF5] hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.97] rounded-lg text-sm text-white transition-all duration-200 disabled:opacity-50"
        >
          {publishing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Publish Draft
        </button>
      </div>

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
              Draft published!{" "}
              {result.editUrl && (
                <a
                  href={result.editUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-green-900"
                >
                  Edit in WordPress
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
