// ─── Resilient page fetcher ────────────────────────────────
// Many news sites (Cloudflare / bot-protected) return 403/429 to
// requests that only send a bare User-Agent. This helper sends a
// full, realistic browser header set and retries once with an
// alternate User-Agent + the site's own origin as Referer.

const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const UA_FALLBACK =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

function browserHeaders(url: string, ua: string): Record<string, string> {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    /* ignore */
  }
  return {
    "User-Agent": ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not(A:Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    ...(origin ? { Referer: origin + "/" } : {}),
  };
}

export interface FetchPageResult {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  error?: string;
}

export async function fetchPage(
  url: string,
  timeoutMs = 15000
): Promise<FetchPageResult> {
  const attempt = async (ua: string): Promise<FetchPageResult> => {
    try {
      const res = await fetch(url, {
        headers: browserHeaders(url, ua),
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        return { ok: false, status: res.status, text: "", finalUrl: res.url || url };
      }
      const text = await res.text();
      return { ok: true, status: res.status, text, finalUrl: res.url || url };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        text: "",
        finalUrl: url,
        error: err instanceof Error ? err.message : "fetch failed",
      };
    }
  };

  const blocked = (s: number) => s === 403 || s === 429 || s === 0 || s === 503 || s === 401;

  let result = await attempt(UA_DESKTOP);
  // Retry once with a different UA on the classic anti-bot codes.
  if (!result.ok && blocked(result.status)) {
    await new Promise((r) => setTimeout(r, 400));
    const retry = await attempt(UA_FALLBACK);
    if (retry.ok) return retry;
    result = retry.status ? retry : result;
  }

  // Final fallback: route through the Jina reader proxy. Many Cloudflare-
  // fronted MV outlets block datacenter IPs (e.g. Vercel) outright — the
  // direct fetch 403s no matter the headers. Jina fetches from its own
  // infrastructure and returns simplified HTML, which cheerio can still
  // parse for links / article text.
  if (!result.ok && blocked(result.status)) {
    try {
      const proxied = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          "x-return-format": "html",
          "User-Agent": UA_DESKTOP,
          Accept: "text/html,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(Math.max(timeoutMs, 25000)),
      });
      if (proxied.ok) {
        const text = await proxied.text();
        if (text && text.length > 100) {
          return { ok: true, status: 200, text, finalUrl: url };
        }
      }
    } catch {
      /* proxy failed too — fall through to the original error */
    }
  }

  return result;
}

export function describeFetchError(r: FetchPageResult): string {
  if (r.error) return r.error;
  if (r.status === 403) return "403 Forbidden — the source blocked the request (bot protection).";
  if (r.status === 429) return "429 Too Many Requests — the source is rate-limiting us.";
  if (r.status === 503) return "503 — the source is temporarily unavailable.";
  if (r.status) return `HTTP ${r.status}`;
  return "Network error";
}
