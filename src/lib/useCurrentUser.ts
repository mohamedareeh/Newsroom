"use client";

// ─── Current User Hook ───────────────────────────────────
// Fetches the current user's username and role from /api/me.
// Returns { username, role, isAdmin, loaded }.

import { useState, useEffect } from "react";

interface CurrentUserState {
  username: string;
  role: "admin" | "user";
  isAdmin: boolean;
  loaded: boolean;
}

export function useCurrentUser(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({
    username: "",
    role: "user",
    isAdmin: false,
    loaded: false,
  });

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.username) {
          setState({
            username: data.username,
            role: data.role || "user",
            isAdmin: data.role === "admin",
            loaded: true,
          });
        } else {
          setState((prev) => ({ ...prev, loaded: true }));
        }
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loaded: true }));
      });
  }, []);

  return state;
}
