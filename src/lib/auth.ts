// ─── Multi-User Auth with Role-Based Access ─────────────
// Cookie-based session with multi-user support and roles.
// Users stored in Vercel KV. Env var admin is always available as fallback.
// Roles: "admin" (full access) | "user" (limited settings)

import { cookies } from "next/headers";
import { kv } from "@vercel/kv";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "newsdesk2024";
const SESSION_COOKIE = "newsdesk_session";
const KV_USERS_KEY = "newsdesk_users";

// ── Types ──
export type UserRole = "admin" | "user";

interface StoredUser {
  username: string;
  passwordHash: string;
  salt: string;
  role?: UserRole; // Optional for backward compat — defaults to "user"
}

export interface CurrentUser {
  username: string;
  role: UserRole;
}

// ── Password hashing with Web Crypto ──
async function hashWithSalt(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Validate credentials (env admin + KV users) ──
// Returns the username on success (needed for cookie)
export async function validateCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; username: string }> {
  // Check env var admin first
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return { valid: true, username: ADMIN_USERNAME };
  }

  // Check KV users
  try {
    const users = await kv.get<StoredUser[]>(KV_USERS_KEY);
    if (!users) return { valid: false, username: "" };
    const user = users.find((u) => u.username === username);
    if (!user) return { valid: false, username: "" };
    const hash = await hashWithSalt(password, user.salt);
    if (hash === user.passwordHash) {
      return { valid: true, username: user.username };
    }
    return { valid: false, username: "" };
  } catch {
    // KV unavailable — only env admin works
    return { valid: false, username: "" };
  }
}

// ── Check if the current request is authenticated ──
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return !!session?.value && session.value.length > 0;
}

// ── Get current user info (username + role) ──
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  if (!session?.value) return null;

  const username = session.value;

  // Env var admin
  if (username === ADMIN_USERNAME) {
    return { username, role: "admin" };
  }

  // KV user
  try {
    const users = await kv.get<StoredUser[]>(KV_USERS_KEY);
    if (!users) return null;
    const user = users.find((u) => u.username === username);
    if (!user) return null;
    return { username: user.username, role: user.role || "user" };
  } catch {
    return null;
  }
}

// ── Check if current user is admin ──
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

// ── User management ──
export async function getUsers(): Promise<Array<{ username: string; role: UserRole }>> {
  const result: Array<{ username: string; role: UserRole }> = [
    { username: ADMIN_USERNAME, role: "admin" },
  ];
  try {
    const users = await kv.get<StoredUser[]>(KV_USERS_KEY);
    if (users) {
      for (const u of users) {
        if (u.username !== ADMIN_USERNAME) {
          result.push({ username: u.username, role: u.role || "user" });
        }
      }
    }
  } catch {
    // KV unavailable
  }
  return result;
}

export async function addUser(
  username: string,
  password: string,
  role: UserRole = "user"
): Promise<{ ok: boolean; error?: string }> {
  if (!username.trim() || !password.trim()) {
    return { ok: false, error: "Username and password are required" };
  }
  if (username === ADMIN_USERNAME) {
    return { ok: false, error: "Cannot create user with the admin username" };
  }
  try {
    const users = (await kv.get<StoredUser[]>(KV_USERS_KEY)) || [];
    if (users.some((u) => u.username === username)) {
      return { ok: false, error: "Username already exists" };
    }
    const salt = generateSalt();
    const passwordHash = await hashWithSalt(password, salt);
    users.push({ username, passwordHash, salt, role });
    await kv.set(KV_USERS_KEY, users);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save user (KV unavailable)" };
  }
}

export async function removeUser(
  username: string
): Promise<{ ok: boolean; error?: string }> {
  if (username === ADMIN_USERNAME) {
    return { ok: false, error: "Cannot remove the admin account" };
  }
  try {
    const users = (await kv.get<StoredUser[]>(KV_USERS_KEY)) || [];
    const filtered = users.filter((u) => u.username !== username);
    if (filtered.length === users.length) {
      return { ok: false, error: "User not found" };
    }
    await kv.set(KV_USERS_KEY, filtered);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to remove user (KV unavailable)" };
  }
}

// ── Cookie config exports ──
export const SESSION_COOKIE_NAME = SESSION_COOKIE;
