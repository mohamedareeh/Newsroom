// ─── Multi-User Auth ──────────────────────────────────────
// Cookie-based session with multi-user support.
// Users stored in Vercel KV. Env var admin is always available as fallback.

import { cookies } from "next/headers";
import { kv } from "@vercel/kv";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "newsdesk2024";
const SESSION_COOKIE = "newsdesk_session";
const SESSION_TOKEN = "authenticated";
const KV_USERS_KEY = "newsdesk_users";

// ── Types ──
interface StoredUser {
  username: string;
  passwordHash: string;
  salt: string;
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
export async function validateCredentials(
  username: string,
  password: string
): Promise<boolean> {
  // Check env var admin first
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return true;
  }

  // Check KV users
  try {
    const users = await kv.get<StoredUser[]>(KV_USERS_KEY);
    if (!users) return false;
    const user = users.find((u) => u.username === username);
    if (!user) return false;
    const hash = await hashWithSalt(password, user.salt);
    return hash === user.passwordHash;
  } catch {
    // KV unavailable — only env admin works
    return false;
  }
}

// ── Check if the current request is authenticated ──
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session?.value === SESSION_TOKEN;
}

// ── User management ──
export async function getUsers(): Promise<string[]> {
  const usernames = [ADMIN_USERNAME];
  try {
    const users = await kv.get<StoredUser[]>(KV_USERS_KEY);
    if (users) {
      for (const u of users) {
        if (!usernames.includes(u.username)) {
          usernames.push(u.username);
        }
      }
    }
  } catch {
    // KV unavailable
  }
  return usernames;
}

export async function addUser(
  username: string,
  password: string
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
    users.push({ username, passwordHash, salt });
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
export const SESSION_TOKEN_VALUE = SESSION_TOKEN;
