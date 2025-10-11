// lib/adapters/util.ts
import crypto from "node:crypto";

export function sha1Hex(buf: Buffer | string): string {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

export async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  {
    retries = 2,
    baseDelayMs = 250, // small backoff
    userAgent = "JobBusters/0.1 (+contact@example.com)",
    timeoutMs = 15000,
  }: {
    retries?: number;
    baseDelayMs?: number;
    userAgent?: string;
    timeoutMs?: number;
  } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(opts.headers || {});
  if (!headers.has("User-Agent")) headers.set("User-Agent", userAgent);
  if (!headers.has("Accept")) headers.set("Accept", "text/html,application/json;q=0.9,*/*;q=0.8");

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { ...opts, headers, signal: controller.signal });
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt < retries) {
          const wait = baseDelayMs * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, wait));
          attempt++;
          continue;
        }
      }
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      if (attempt < retries) {
        const wait = baseDelayMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, wait));
        attempt++;
        continue;
      }
      clearTimeout(timer);
      throw err;
    }
  }
}

export function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}


/**
 * Coerce number-ish strings like "100000" or "100,000.00" to numbers.
 * Returns `undefined` when the input isn't a finite number.
 */
export function asNum(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[, ]+/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// simple, safe-ish HTML→text (not overdone pre-NLP)
export function htmlToPlainText(html: string): string {
  // remove script/style
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  // collapse tags to spaces, decode a few entities
  const textish = stripped
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r?\n\s*\r?\n/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  return textish;
}
