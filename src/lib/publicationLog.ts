// ─── Publication Log (Server-side KV) ─────────────────────
// Stores a record of every article auto-published through the
// multi-publish pipeline. Keyed by UTC date so the daily report
// page can fetch a single day's activity in one lookup.

import { kv } from "@vercel/kv";

export interface PublicationRecord {
  id: string;
  sourceUrl: string;
  sourceTitle?: string;
  sourceDate?: string; // ISO date pulled from source
  publishedAt: number; // epoch ms
  backdatedTo?: string; // ISO date the WP post was dated, when backdated
  // Per-language outputs
  dv?: {
    title: string;
    site: string;
    postId?: number;
    postUrl?: string;
    editUrl?: string;
    error?: string;
    note?: string;
  };
  en?: {
    title: string;
    site: string;
    postId?: number;
    postUrl?: string;
    editUrl?: string;
    error?: string;
    note?: string;
  };
}

const PREFIX = "newsdesk_pubs_v1:";

function utcDateKey(d = new Date()): string {
  // YYYY-MM-DD in UTC
  return d.toISOString().slice(0, 10);
}

export function dateKeyFromTimestamp(ts: number): string {
  return utcDateKey(new Date(ts));
}

function kvKey(dateStr: string): string {
  return `${PREFIX}${dateStr}`;
}

export async function appendPublication(record: PublicationRecord): Promise<void> {
  try {
    const key = kvKey(dateKeyFromTimestamp(record.publishedAt));
    const existing = (await kv.get<PublicationRecord[]>(key)) || [];
    existing.push(record);
    await kv.set(key, existing);
  } catch {
    // KV unavailable — silently no-op so the pipeline doesn't crash on logging.
  }
}

export async function getPublicationsForDate(
  dateStr: string
): Promise<PublicationRecord[]> {
  try {
    const list = await kv.get<PublicationRecord[]>(kvKey(dateStr));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function getPublicationsInRange(
  startDate: string,
  endDate: string
): Promise<{ date: string; records: PublicationRecord[] }[]> {
  const result: { date: string; records: PublicationRecord[] }[] = [];
  // Walk day by day inclusive. Bound to 90 days to stay safe.
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const oneDay = 24 * 60 * 60 * 1000;
  const max = 90;
  for (let i = 0, t = start.getTime(); t <= end.getTime() && i < max; i++, t += oneDay) {
    const d = new Date(t);
    const ds = utcDateKey(d);
    const recs = await getPublicationsForDate(ds);
    result.push({ date: ds, records: recs });
  }
  return result;
}

export function todayUTC(): string {
  return utcDateKey();
}
