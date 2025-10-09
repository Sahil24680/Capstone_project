// lib/normalizers/web.ts
export type WebFeatures = {
  // salary
  salary_min?: number;
  salary_mid?: number;
  salary_max?: number;
  currency?: string;
  salary_source?: "text" | "jsonld";

  // misc (best-effort; leave blank if unknown)
  title?: string;
  company_name?: string;
  location?: string;
  posted_at?: string;          // ISO string if it can be inferred
  employment_type?: string;    // e.g., "Full-time"
};

export function mergeWebFeatures<T extends Record<string, any>>(
  primary: T | undefined,
  fallback: T | undefined
): T {
  const a = primary ?? ({} as T);
  const b = fallback ?? ({} as T);
  const out: Record<string, any> = { ...b, ...a };
  return out as T;
}

/**
 * Minimal HTML → plain text (safe for job content).
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  let s = html;

  // remove script/style
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");

  // block-level tags to newline
  s = s.replace(/<\/(p|div|h\d|li|ul|ol|br|section|article|header|footer)>/gi, "\n");

  // strip tags
  s = s.replace(/<[^>]+>/g, " ");

  // decode a few common entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // normalize whitespace
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

  // "170,000" | "170" + k
function parseMoneyPart(numStr: string, kFlag?: string): number | undefined {
  const n = Number(String(numStr).replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  return kFlag ? n * 1000 : n;
}

function detectCurrencySymbolOrCode(chunk: string): string | undefined {
  if (/[€]/.test(chunk)) return "EUR";
  if (/[£]/.test(chunk)) return "GBP";
  if (/\$/.test(chunk)) return "USD";
  // fallbacks on codes
  if (/usd\b/i.test(chunk)) return "USD";
  if (/\beur\b/i.test(chunk)) return "EUR";
  if (/\bgbp\b/i.test(chunk)) return "GBP";
  return undefined;
}

/**
 * Extract features from text only (no DOM, no JSON-LD).
 * Returns an object; never mutates external state.
 */
export function extractWebFeaturesFromText(text: string): WebFeatures {
  const out: WebFeatures = {};
  if (!text) return out;

  // Try salary range first:
  // e.g. "$170,000 - $250,000", "170k – 250k", "$170k to $250k USD", "£80,000—£95,000"
  const rangeRe =
    /(?:[\$£€]\s*)?(\d{2,3}(?:,\d{3})?)(\s*[kK])?\s*(?:-|–|—|to)\s*(?:[\$£€]\s*)?(\d{2,3}(?:,\d{3})?)(\s*[kK])?(?:\s*(USD|EUR|GBP))?/;
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    const [, loStr, loK, hiStr, hiK, code] = rangeMatch;
    const lo = parseMoneyPart(loStr, loK);
    const hi = parseMoneyPart(hiStr, hiK);
    if (lo && hi) {
      out.salary_min = lo;
      out.salary_max = hi;
      out.salary_mid = Math.round((lo + hi) / 2);
      out.currency = code || detectCurrencySymbolOrCode(rangeMatch[0]);
      out.salary_source = "text";
      return out;
    }
  }

  // Single-figure salary (treat as midpoint if clearly labeled as salary/comp):
  // e.g. "base salary: $200,000" or "compensation: 220k USD"
  const singleRe =
    /(salary|base|compensation)\s*[:\-]?\s*(?:is\s*)?(?:[\$£€]\s*)?(\d{2,3}(?:,\d{3})?)(\s*[kK])?(?:\s*(USD|EUR|GBP))?/i;
  const singleMatch = text.match(singleRe);
  if (singleMatch) {
    const [, , numStr, k, code] = singleMatch;
    const mid = parseMoneyPart(numStr, k);
    if (mid) {
      out.salary_mid = mid;
      out.currency = code || detectCurrencySymbolOrCode(singleMatch[0]);
      out.salary_source = "text";
    }
  }

  // Best-effort employment type keywords
  if (/full[\s-]?time/i.test(text)) out.employment_type = "Full-time";
  else if (/part[\s-]?time/i.test(text)) out.employment_type = "Part-time";
  else if (/contract/i.test(text)) out.employment_type = "Contract";

  return out;
}

/**
 * Extract features from a JSON-LD JobPosting blob (if a site exposes it).
 * Returns an object; never mutates external state.
 */
export function extractWebFeaturesFromJsonLd(jsonld: any): WebFeatures {
  const out: WebFeatures = {};
  if (!jsonld || typeof jsonld !== "object") return out;

  // Title / org / location / employment type
  if (typeof jsonld.title === "string") out.title = jsonld.title;
  if (jsonld.hiringOrganization?.name) out.company_name = String(jsonld.hiringOrganization.name);
  if (jsonld.employmentType) out.employment_type = String(jsonld.employmentType);

  // Locations can be an object or array
  const loc = Array.isArray(jsonld.jobLocation) ? jsonld.jobLocation[0] : jsonld.jobLocation;
  if (loc?.address) {
    const parts = [
      loc.address.addressLocality,
      loc.address.addressRegion,
      loc.address.addressCountry,
    ].filter(Boolean);
    if (parts.length) out.location = parts.join(", ");
  }

  // Posted date
  if (jsonld.datePosted) {
    const d = new Date(jsonld.datePosted);
    if (!isNaN(d.valueOf())) out.posted_at = d.toISOString();
  }

  // Salary (schema.org MonetaryAmount / MonetaryAmountDistribution variants)
  const bs = jsonld.baseSalary;
  if (bs && typeof bs === "object") {
    const currency = bs.currency || bs?.value?.currency;
    const unitText = bs?.value?.unitText;
    const v = bs.value;

    // QuantitativeValue: value, minValue, maxValue
    const min = v?.minValue ?? v?.minvalue ?? undefined;
    const max = v?.maxValue ?? v?.maxvalue ?? undefined;
    const val = v?.value ?? v?.amount ?? undefined;

    const num = (x: any) =>
      typeof x === "number" ? x :
      typeof x === "string" ? Number(x.replace(/,/g, "")) :
      undefined;

    const nMin = num(min);
    const nMax = num(max);
    const nVal = num(val);

    if (nMin != null) out.salary_min = nMin;
    if (nMax != null) out.salary_max = nMax;
    if (nVal != null) out.salary_mid = nVal;

    // If only min/max, compute midpoint
    if (out.salary_min != null && out.salary_max != null && out.salary_mid == null) {
      out.salary_mid = Math.round((out.salary_min + out.salary_max) / 2);
    }

    if (currency) out.currency = String(currency);
    if (out.salary_min || out.salary_mid || out.salary_max) {
      out.salary_source = "jsonld";
    }
  }

  return out;
}
