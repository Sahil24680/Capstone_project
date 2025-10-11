// lib/normalizers/web.ts
import { z } from "zod";
import { asNum } from "../adapters/util";

export type WebCompPeriod = "hour" | "year";
export type WebFeatures = {
  salary_min?: number;
  salary_mid?: number;
  salary_max?: number;
  currency?: string;
  comp_period?: WebCompPeriod;
  salary_source?: "jsonld" | "text";
};

export function htmlToPlainText(html: string): string {
  if (!html) return "";

  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  const decodeEntities = (s: string) =>
    s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_m, g1: string) => {
      if (g1[0] === "#") {
        const hex = g1[1]?.toLowerCase() === "x";
        const code = parseInt(hex ? g1.slice(2) : g1.slice(1), hex ? 16 : 10);
        if (Number.isFinite(code)) return String.fromCodePoint(code);
        return _m;
      }
      return Object.prototype.hasOwnProperty.call(named, g1) ? named[g1] : _m;
    });

  let text = decodeEntities(String(html));

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n");

  text = text.replace(/<[^>]+>/g, "");

  text = text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/* ------------------------------ Zod Schemas ------------------------------ */
/** https://schema.org/QuantitativeValue */
const ZQuantitativeValue = z
  .object({
    "@type": z.string().optional(),
    minValue: z.union([z.number(), z.string()]).optional(),
    maxValue: z.union([z.number(), z.string()]).optional(),
    value: z.union([z.number(), z.string()]).optional(),
    unitText: z.string().optional(), // e.g., HOUR, YEAR
  })
  .catchall(z.unknown());

/** https://schema.org/MonetaryAmount */
const ZMonetaryAmount = z
  .object({
    "@type": z.string().optional(),
    currency: z.string().optional(), // e.g., USD
    value: z
      .union([
        ZQuantitativeValue, // object
        z.number(), // simple number
        z.string(), // sometimes stringy number
      ])
      .optional(),
  })
  .catchall(z.unknown());

/** Minimal JobPosting subset of concern */
const ZJobPosting = z
  .object({
    "@type": z.string().optional(), // "JobPosting"
    title: z.string().optional(),
    hiringOrganization: z
      .object({
        name: z.string().optional(),
      })
      .catchall(z.unknown())
      .optional(),
    baseSalary: ZMonetaryAmount.optional(),
  })
  .catchall(z.unknown());

/** Accept an object or array of objects; only care about JobPosting items */
const ZJsonLdTop = z.union([ZJobPosting, z.array(z.union([ZJobPosting, z.unknown()]))]);

/* ----------------------- Salary helpers / finalization -------------------- */
function finalizeSalary(features: WebFeatures) {
  const has = (n: unknown) => typeof n === "number" && Number.isFinite(n);

  let min = features.salary_min;
  let mid = features.salary_mid;
  let max = features.salary_max;

  // Keep ordering sane if both provided
  if (has(min) && has(max) && (min as number) > (max as number)) {
    const t = min as number;
    min = max as number;
    max = t;
  }

  // Only compute midpoint when both bounds exist
  if (!has(mid) && has(min) && has(max)) {
    mid = ((min as number) + (max as number)) / 2;
  }

  // Do not infer a missing bound from midpoint
  // Do not mirror a single bound into the other
  // Do not clamp mid to [min, max]

  if (has(min)) features.salary_min = min as number;
  if (has(mid)) features.salary_mid = mid as number;
  if (has(max)) features.salary_max = max as number;
}

/* ------------------------------ JSON-LD parse ----------------------------- */
export function extractWebFeaturesFromJsonLd(jsonld: unknown): WebFeatures {
  const features: WebFeatures = {};

  const parsed = ZJsonLdTop.safeParse(jsonld);
  if (!parsed.success) return features;

  type UnknownObj = { [k: string]: unknown };
  const isJobPostingLite = (u: unknown): u is UnknownObj =>
    !!u && typeof u === "object" && "@type" in (u as UnknownObj);

const items: Array<z.infer<typeof ZJobPosting>> = Array.isArray(parsed.data)
  ? parsed.data.filter((it): it is z.infer<typeof ZJobPosting> =>
      isJobPostingLite(it) && it["@type"] === "JobPosting")
  : [parsed.data];


  for (const jp of items) {
    const ma = jp.baseSalary;
    if (!ma) continue;

    let currency = (ma.currency ?? "").toString().trim().toUpperCase() || undefined;

    let min: number | undefined;
    let mid: number | undefined;
    let max: number | undefined;
    let period: WebCompPeriod | undefined;

   type Quantitative = z.infer<typeof ZQuantitativeValue>;

  if (ma.value && typeof ma.value === "object" && !Array.isArray(ma.value)) {
    const qv = ma.value as Quantitative;
    const minV = asNum(qv.minValue);
    const maxV = asNum(qv.maxValue);
    const valV = asNum(qv.value);

    const unitText = (qv.unitText ?? "").toString().toUpperCase();
      if (unitText.includes("HOUR")) period = "hour";
      else if (unitText.includes("YEAR") || unitText.includes("ANNUAL")) period = "year";

      if (minV !== undefined) min = minV;
      if (maxV !== undefined) max = maxV;
      if (valV !== undefined) mid = valV; // treat lone value as midpoint
    } else {
      // Flat number or string number on MonetaryAmount.value
      const flat = asNum(ma.value as unknown);
      if (flat !== undefined) {
        mid = flat;
      }
    }

    // Heuristic fallback for comp period if still unknown:
    if (!period && (min ?? mid ?? max) !== undefined) {
      const probe = (min ?? mid ?? max)!;
      period = probe <= 300 ? "hour" : "year";
    }

    // Commit into features (don't overwrite existing if already set)
    if (min !== undefined && features.salary_min == null) features.salary_min = min;
    if (mid !== undefined && features.salary_mid == null) features.salary_mid = mid;
    if (max !== undefined && features.salary_max == null) features.salary_max = max;
    if (currency && !features.currency) features.currency = currency;
    if (period && !features.comp_period) features.comp_period = period;

    if (min !== undefined || mid !== undefined || max !== undefined) {
      features.salary_source ??= "jsonld";
    }
  }

  finalizeSalary(features);
  return features;
}

/* ------------------------------ Text fallback ---------------------------- */
export function extractWebFeaturesFromText(text: string): WebFeatures {
  const features: WebFeatures = {};
  if (!text) return features;
  const s = String(text);

  // "$170,000 - $250,000" (or "170,000 to 250,000")
  const dollarsRange = /\$?\s?(\d{2,3}(?:,\d{3})?)\s*(?:-|–|to)\s*\$?\s?(\d{2,3}(?:,\d{3})?)/i;
  // "170k - 250k"
  const kRange = /(\d{2,3})\s*k\s*(?:-|–|to)\s*(\d{2,3})\s*k/i;
  // Single-point "$19.30"
  const singleDollar = /\$\s?(\d{1,3}(?:,\d{3})?(?:\.\d{1,2})?)/;

  let loNum: number | null = null;
  let hiNum: number | null = null;
  let sawDollarSymbol = false;

  const m1 = s.match(dollarsRange);
  if (m1) {
    loNum = parseFloat(m1[1].replace(/,/g, ""));
    hiNum = parseFloat(m1[2].replace(/,/g, ""));
    sawDollarSymbol = /\$/.test(m1[0]);
  } else {
    const m2 = s.match(kRange);
    if (m2) {
      const lo = parseFloat(m2[1]);
      const hi = parseFloat(m2[2]);
      if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
        loNum = lo * 1000;
        hiNum = hi * 1000;
      }
    } else {
      const m3 = s.match(singleDollar);
      if (m3) {
        const v = parseFloat(m3[1].replace(/,/g, ""));
        if (Number.isFinite(v)) {
          loNum = v;
          hiNum = v;
          sawDollarSymbol = true;
        }
      }
    }
  }

  if (loNum == null || hiNum == null || Number.isNaN(loNum) || Number.isNaN(hiNum)) {
    return features;
  }

  features.salary_min = loNum;
  features.salary_max = hiNum;
  if (sawDollarSymbol) features.currency = "USD";
  features.salary_source = "text";

  // Infer comp period heuristically if not obvious
  const probe = loNum ?? hiNum;
  if (probe != null) {
    features.comp_period = probe <= 300 ? "hour" : "year";
  }

  finalizeSalary(features);
  return features;
}

/* ------------------------------ Merge helper ----------------------------- */

const MERGE_KEYS = [
  "salary_min",
  "salary_mid",
  "salary_max",
  "currency",
  "comp_period",
  "salary_source",
] as const satisfies readonly (keyof WebFeatures)[];

// helper to keep TS happy per-key
function setIfMissing<K extends keyof WebFeatures>(
  target: WebFeatures,
  source: WebFeatures,
  key: K
) {
  if (target[key] == null && source[key] != null) {
    // TS: source[key] is compatible with target[key] by construction
    target[key] = source[key] as WebFeatures[K];
  }
}

export function mergeWebFeatures(a: WebFeatures, b: WebFeatures): WebFeatures {
  // b fills gaps; a wins on conflicts
  const out: WebFeatures = { ...a };
  for (const k of MERGE_KEYS) setIfMissing(out, b, k);
  return out;
}