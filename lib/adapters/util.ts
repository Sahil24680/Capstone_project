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
    baseDelayMs = 250,               
    userAgent = "JobBusters/0.1 (+contact@example.com)", // placeholder
    timeoutMs = 15_000,              
    maxBackoffMs = 10_000,           
  }: {
    retries?: number;
    baseDelayMs?: number;
    userAgent?: string;
    timeoutMs?: number;
    maxBackoffMs?: number;
  } = {}
): Promise<Response> {
  // Normalize headers once; copy them per attempt so caller input doesn't mutate.
  const baseHeaders = new Headers(opts.headers || {});
  if (!baseHeaders.has("User-Agent")) baseHeaders.set("User-Agent", userAgent);
  if (!baseHeaders.has("Accept")) baseHeaders.set("Accept", "application/json,text/html;q=0.9,*/*;q=0.8");

  // If caller passed a signal, race it with per-attempt timeout signals.
  const callerSignal: AbortSignal | null | undefined = opts.signal;

  // Helper: sleep
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  // Helper: create user-friendly error messages
  const createUserFriendlyError = (originalError: unknown, totalAttempts: number): Error => {
    const errorMessage = (originalError instanceof Error ? originalError.message : String(originalError)).toLowerCase();
    
    // Check for common error types and provide friendly messages
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return new Error(`Request timed out after ${totalAttempts} attempts. Please check your connection and try again.`);
    }
    
    if (errorMessage.includes('failed to fetch') || errorMessage.includes('network request failed') || errorMessage.includes('network error')) {
      return new Error(`Unable to connect to the server after ${totalAttempts} attempts. Please check your internet connection.`);
    }
    
    if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
      return new Error(`Server is temporarily busy. Please wait a moment and try again.`);
    }
    
    if (errorMessage.includes('500') || errorMessage.includes('internal server error') || errorMessage.includes('server error')) {
      return new Error(`Server error occurred after ${totalAttempts} attempts. Please try again later.`);
    }
    
    // Generic fallback
    return new Error(`Request failed after ${totalAttempts} attempts. Please try again.`);
  };

  // Helper: compute exponential backoff with capping
  const backoff = (attempt: number) => {
    const raw = Math.min(maxBackoffMs, baseDelayMs * Math.pow(2, Math.max(0, attempt)));
    return raw;
  };

  // Helper: parse Retry-After (seconds or HTTP-date)
  const parseRetryAfter = (hdr: string | null): number | null => {
    if (!hdr) return null;
    const sec = Number(hdr);
    if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
    const t = Date.parse(hdr);
    if (Number.isFinite(t)) {
      const ms = t - Date.now();
      return ms > 0 ? ms : 0;
    }
    return null;
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Per-attempt timeout controller
    const attemptController = new AbortController();
    const timeoutId = setTimeout(() => attemptController.abort(), timeoutMs);

    // Compose signals: caller signal (if any) + per-attempt timeout
    let signal: AbortSignal = attemptController.signal;
    if (callerSignal) {
      // AbortSignal.any is in modern runtimes; fallback if missing
      // Controlled usage of any; not used for general type avoidance
      if ((AbortSignal as any).any) {
        signal = (AbortSignal as any).any([callerSignal, attemptController.signal]);
      } else {
        // Fallback: if caller aborts, abort our per-attempt controller
        if (callerSignal.aborted) attemptController.abort();
        else callerSignal.addEventListener("abort", () => attemptController.abort(), { once: true });
      }
    }

    try {
      // Fresh headers object each attempt
      const headers = new Headers(baseHeaders);

      const res = await fetch(url, { ...opts, headers, signal });

      // Retry on 429 and 5xx (transient errors)
      const shouldRetry =
        res.status === 429 || (res.status >= 500 && res.status <= 599);

      if (shouldRetry && attempt < retries) {
        let waitMs = backoff(attempt);
        if (res.status === 429) {
          const ra = parseRetryAfter(res.headers.get("Retry-After"));
          if (ra != null) waitMs = Math.max(waitMs, ra);
        }
        clearTimeout(timeoutId);
        await sleep(waitMs);
        continue;
      }

      clearTimeout(timeoutId);
      return res;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (callerSignal?.aborted) {
        throw new Error("Request was cancelled");
      }

      // If per-attempt timeout or a transient network error: retry if budget remains
      const canRetry = attempt < retries;
      if (canRetry) {
        await sleep(backoff(attempt));
        continue;
      }

      // Out of retries: create user-friendly error
      const userFriendlyError = createUserFriendlyError(err, attempt + 1);
      throw userFriendlyError;
    }
  }

  // Should be unreachable because the loop either returns or throws.
  throw new Error("An unexpected error occurred. Please try again.");
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
