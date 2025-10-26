
// Comprehensive scoring with metadata, content, and NLP signals.
// - Works for both ATS-backed jobs and WebFeatures from the web adapter.
// - Produces a ScoreResult { score: number in [0,1], breakdown: Record<string, number> }.
//
// The overall score is a weighted average of the features found in `breakdown`.
// If no weights apply (or sum to 0), we fall back to a simple average of the
// available breakdown values. This guarantees that non-zero breakdowns cannot
// produce an overall score of 0.

export type SalarySource = "metadata" | "content" | "jsonld" | "text" | "both" | "unknown";
export type CompPeriod = "hour" | "year" | "month" | "week" | "day" | "unknown";

// Import NLP analysis type
export type NlpAnalysis = {
  skills: { name: string }[];
  buzzwords: { hits: string[]; count: number };
  comp_period_detected: "hour" | "year" | null;
};

export interface AtsJobFeatures {
  salary_min?: number | null;
  salary_mid?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  comp_period?: CompPeriod | null;
  salary_source?: SalarySource | null;
}

export interface AtsJobInput {
  source: "ats" | "web";
  absolute_url?: string;
  first_published?: string | Date | null;
  updated_at?: string | Date | null;
  features: AtsJobFeatures;
  host_hint?: string | null;

  // link flags are boolean—use resolver upstream (scraper or adapter)
  link_ok?: boolean;
  link_loop?: boolean;
  
  // NLP analysis (optional for backward compatibility)
  nlp_analysis?: NlpAnalysis;
}

export interface WebFeaturesInput {
  absolute_url?: string;
  first_published?: string | Date | null;
  updated_at?: string | Date | null;
  features: {
    salary_min?: number;
    salary_mid?: number;
    salary_max?: number;
    currency?: string;
    comp_period?: CompPeriod;
    salary_source?: SalarySource;
  };
  // NLP analysis (optional for backward compatibility)
  nlp_analysis?: NlpAnalysis;
}

export interface ScoreWeights {
  freshness: number;
  link_integrity: number;
  salary_disclosure: number;
  salary_min_present: number;
  source_credibility: number;
  // NLP signals
  skills_present: number;
  buzzword_penalty: number;
  comp_period_clarity: number;
}

// Sensible defaults; override per-call if needed
export const DEFAULT_WEIGHTS: ScoreWeights = {
  freshness: 0.20,
  link_integrity: 0.10,
  salary_disclosure: 0.25,
  salary_min_present: 0.15,
  source_credibility: 0.10,
  // NLP signals
  skills_present: 0.10,
  buzzword_penalty: 0.05,
  comp_period_clarity: 0.05,
};

export interface ScoreResult {
  score: number; // 0..1
  breakdown: Record<string, number>; // each 0..1
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function toDate(d?: string | Date | null): Date | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isFinite(d.valueOf()) ? d : null;
  const dt = new Date(d);
  return Number.isFinite(dt.valueOf()) ? dt : null;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

// --- Feature extractors ------------------------------------------------------

/** Freshness: newer is better. 1 at 0 days; ~0 by 90+ days (linear decay). */
function featureFreshness(firstPublished?: string | Date | null): number {
  const pub = toDate(firstPublished);
  if (!pub) return 0.5; // unknown: neutral-ish
  const now = new Date();
  const age = daysBetween(now, pub);
  const score = 1 - Math.min(age / 90, 1); // 0 at 90d+
  return clamp01(score);
}

/** Link integrity: 1 if link_ok and not loop; 0 otherwise (unknown treated as ok=false). */
function featureLinkIntegrity(flags: { link_ok?: boolean; link_loop?: boolean }): number {
  const ok = !!flags.link_ok;
  const loop = !!flags.link_loop;
  if (!ok) return 0;
  if (loop) return 0;
  return 1;
}

/** Salary disclosure: 1 if any salary present; 0.5 for only max; 0 if none. */
function featureSalaryDisclosure(f: AtsJobFeatures): number {
  const hasMin = typeof f.salary_min === "number" && f.salary_min !== null;
  const hasMax = typeof f.salary_max === "number" && f.salary_max !== null;
  if (hasMin) return 1;
  if (!hasMin && hasMax) return 0.5;
  return 0;
}

/** Salary min present explicitly (helps reduce ghostiness). */
function featureSalaryMinPresent(f: AtsJobFeatures): number {
  return typeof f.salary_min === "number" && f.salary_min !== null ? 1 : 0;
}

/** Source credibility: ATS/company domains a bit higher; unknown/text-only slightly lower. */
const ATS_HOST_HINTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "icims.com",
]);

function hostOf(u?: string | null): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function featureSourceCredibility(
  f: AtsJobFeatures,
  hostHint?: string | null
): number {
  const src = f.salary_source ?? "unknown";
  // A tiny nudge for structured/ATS sources
  const srcBoost =
    src === "metadata" || src === "both" ? 0.1 :
    src === "text" ? -0.1 :
    0;

  let base = 0.5;
  if (hostHint) {
    if (ATS_HOST_HINTS.has(hostHint) || endsWithHost(hostHint, ATS_HOST_HINTS)) {
      base = 0.9;
    } else if (hostHint.includes("careers.") || hostHint.endsWith(".jobs")) {
      base = 0.7;
    } else {
      base = 0.6; // unknown/other site: slightly above neutral
    }
  }

  return clamp01(base + srcBoost);
}

function endsWithHost(h: string, set: Set<string>): boolean {
  for (const s of set) {
    if (h === s) return true;
    if (h.endsWith("." + s)) return true;
  }
  return false;
}

// --- NLP Feature extractors --------------------------------------------------

/** Skills present: 1 if skills found, 0.5 if few skills, 0 if none. */
function featureSkillsPresent(analysis?: NlpAnalysis): number {
  if (!analysis?.skills) return 0;
  const skillCount = analysis.skills.length;
  if (skillCount === 0) return 0;
  if (skillCount >= 5) return 1;
  return 0.5; // 1-4 skills: partial credit
}

/** Buzzword penalty: 1 if no buzzwords, decreasing penalty for more buzzwords. */
function featureBuzzwordPenalty(analysis?: NlpAnalysis): number {
  if (!analysis?.buzzwords) return 1; // No analysis: assume good
  const buzzwordCount = analysis.buzzwords.count;
  if (buzzwordCount === 0) return 1;
  if (buzzwordCount >= 5) return 0; // Heavy buzzword usage: major penalty
  return 1 - (buzzwordCount * 0.2); // Linear penalty: 1 buzzword = 0.8, 2 = 0.6, etc.
}

/** Compensation period clarity: 1 if detected, 0.5 if unclear, 0 if unknown. */
function featureCompPeriodClarity(analysis?: NlpAnalysis): number {
  if (!analysis?.comp_period_detected) return 0.5; // Unknown: neutral
  return 1; // Any detection (hour/year) is good clarity
}

// --- Aggregator (hardened) ---------------------------------------------------

/**
 * Combine per-feature scores with weights.
 * - Ignores weights for missing features (only uses keys present in `breakdown`)
 * - If sumW == 0, falls back to the simple average of available features
 * - Always returns a clamped 0..1 score
 */
function finalizeScore(
  breakdown: Record<string, number>,
  weights: Partial<ScoreWeights> | ScoreWeights
): number {
  // Use provided weights over defaults
  const w: ScoreWeights = { ...DEFAULT_WEIGHTS, ...(weights as Partial<ScoreWeights>) };

  // Only score keys that exist in the breakdown
  const keys = Object.keys(breakdown).filter((k) => typeof breakdown[k] === "number");

  let sumW = 0;
  let sum = 0;

  for (const k of keys) {
    const weight = (w as any)[k];
    const value = clamp01(breakdown[k]);
    if (typeof weight === "number" && weight > 0) {
      sumW += weight;
      sum += weight * value;
    }
  }

  if (sumW > 0) {
    return clamp01(sum / sumW);
  }

  // Fallback: plain average if all weights are zero or missing
  if (keys.length === 0) return 0;
  const avg = keys.reduce((acc, k) => acc + clamp01(breakdown[k]), 0) / keys.length;
  return clamp01(avg);
}

// --- Public scoring APIs -----------------------------------------------------

/** Score for ATS-backed jobs OR pre-normalized “web mapped to ATS-ish” inputs. */
export function scoreJob(
  input: AtsJobInput,
  weights?: Partial<ScoreWeights>
): ScoreResult {
  const breakdown: Record<string, number> = {};

  // freshness: from first_published (prefer), else updated_at
  const freshness = featureFreshness(input.first_published ?? input.updated_at);
  breakdown.freshness = freshness;

  // link integrity: rely on provided flags (scraper/adapters)
  breakdown.link_integrity = featureLinkIntegrity({
    link_ok: input.link_ok,
    link_loop: input.link_loop,
  });

  // salary features
  breakdown.salary_disclosure = featureSalaryDisclosure(input.features);
  breakdown.salary_min_present = featureSalaryMinPresent(input.features);

  // source credibility
  const host = input.host_hint ?? hostOf(input.absolute_url ?? null);
  breakdown.source_credibility = featureSourceCredibility(input.features, host);

  // NLP features
  breakdown.skills_present = featureSkillsPresent(input.nlp_analysis);
  breakdown.buzzword_penalty = featureBuzzwordPenalty(input.nlp_analysis);
  breakdown.comp_period_clarity = featureCompPeriodClarity(input.nlp_analysis);

  const score = finalizeScore(breakdown, weights ?? DEFAULT_WEIGHTS);

  return { score, breakdown };
}

/**
 * Score for web-adapter features directly (no NLP).
 * Just wraps the mapping into AtsJobInput and calls scoreJob.
 */
export function scoreWebFeatures(
  input: WebFeaturesInput,
  weights?: Partial<ScoreWeights>
): ScoreResult {
  const host = hostOf(input.absolute_url ?? null);

  const mapped: AtsJobInput = {
    source: "web",
    absolute_url: input.absolute_url,
    first_published: input.first_published ?? null,
    updated_at: input.updated_at ?? null,
    features: {
      salary_min: input.features.salary_min ?? undefined,
      salary_mid: input.features.salary_mid ?? undefined,
      salary_max: input.features.salary_max ?? undefined,
      currency: input.features.currency ?? undefined,
      comp_period: input.features.comp_period ?? undefined,
      salary_source: input.features.salary_source ?? "unknown",
    },
    host_hint: host,
    // For web features, if we reached and parsed the page we assume the link is ok.
    link_ok: true,
    link_loop: false,
    // Pass through NLP analysis
    nlp_analysis: input.nlp_analysis,
  };

  return scoreJob(mapped, weights);
}
