"use client";

// ─── Settings Hook ─────────────────────────────────────────
// Reads/writes application settings to localStorage.
// SSR-safe — returns defaults on the server.

import { useState, useCallback, useEffect } from "react";
import { AppSettings, DEFAULT_SETTINGS } from "./config";

const STORAGE_KEY = "newsdesk_settings";

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage full or unavailable
      }
      return next;
    });
  }, []);

  return { settings, updateSettings, loaded };
}
