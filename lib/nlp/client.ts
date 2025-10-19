// lib/nlp/client.ts
// calls OpenAI API

// import 'dotenv/config'; // enable in scripts if needed
/**
import OpenAI from 'openai';
import { z } from 'zod';
import { greenhouseAdapter } from '../adapters/greenhouse';
import { dbJobFeatures } from '../db/jobFeatures';
import {extractGhFeaturesFromMetadata, extractSalaryFromText, htmlToPlainText} from '../normalizers/greenhouse';
import { fetchJobFromUrl } from "../adapters"; // <— new: single entry point
import type { AdapterJob } from "../adapters/types";

// ---- OpenAI client ----
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error(
    'OPENAI_API_KEY missing. Put it in .env (scripts) or .env.local .'
  );
}
const client = new OpenAI({ apiKey });

// call database jobFeatures fields 
type DBFeatures = dbJobFeatures;

// enforce with zod 
const ZJobNLP = z.object({
  location: z.string().nullable(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_mid: z.number().nullable(),
  remote_policy: z.enum(['onsite', 'hybrid', 'remote']).nullable(),
  seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'manager']).nullable(),
  time_type: z.enum(['full-time', 'part-time', 'contract']).nullable(),
  currency: z.string().nullable(),
  timezone_requirement: z.string().nullable(),
});
export type JobNLP = z.infer<typeof ZJobNLP>;

// Return type: DB features + NLP fields where NLP focused fields are optional (via Partial<> type)
export type Combined = Partial<DBFeatures> & Partial<JobNLP>;

const EMPTY_NLP: JobNLP = {
  location: null,
  salary_min: null,
  salary_max: null,
  salary_mid: null,
  remote_policy: null,
  seniority: null,
  time_type: null,
  currency: null,
  timezone_requirement: null,
};

// ---- helpers ----
function pickMetadata(rawJob: any): unknown {
  return rawJob?.metadata ?? rawJob?.raw_json?.metadata ?? null;
}
function pickContent(rawJob: any): string {
  const c1 = rawJob?.content;
  const c2 = rawJob?.raw_json?.content;
  return typeof c1 === 'string' ? c1 : typeof c2 === 'string' ? c2 : '';
}
function pickLocationName(rawJob: any): string | null {
  // normalized adapter sets job.location (string) and raw_json.location?.name may exist on raw payloads
  if (typeof rawJob?.location === 'string' && rawJob.location) return rawJob.location;
  const name = rawJob?.location?.name ?? rawJob?.raw_json?.location?.name;
  return typeof name === 'string' && name ? name : null;
}
function normalizeEmploymentType(timeType?: string | null): JobNLP['time_type'] {
  const s = (timeType ?? '').toLowerCase();
  if (/full[-\s]?time/.test(s)) return 'full-time';
  if (/part[-\s]?time/.test(s)) return 'part-time';
  if (/contract|temp|temporary|cont(ractor)?/.test(s)) return 'contract';
  return null;
}

// ---- Core: NLP over a provided job (raw GH payload or normalized AdapterJob) ----
export async function analyzeGreenhouseJob(rawJob: any): Promise<Combined> {
  // 1) call job feature database fields 
    let features: Partial<DBFeatures> = {};

    //extract features from meta data 
    try {
        features = extractGhFeaturesFromMetadata(pickMetadata(rawJob));
    } catch {
        features = {};
    }

  // 2) Prepare plain text and fill salary gaps from prose (doesn't overwrite existing)
// fill salary gaps from text (only if a range is found; your function already guards)
  // 2) plain text + salary from prose (pure or cloned)
  const raw = htmlToPlainText(pickContent(rawJob)).trim();
  const plainText = raw.slice(0, 20_000);
  if (plainText.length > 20) {
    const f2 = { ...features };
    extractSalaryFromText(plainText, f2 as any);
    features = f2;
  }

  if (plainText.length < 20) {
    return { ...features, ...EMPTY_NLP };
  }

// 4) Ask model for qualitative fields (strict keys)
try {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      location: { type: ['string', 'null'] },
      salary_min: { type: ['number', 'null'] },
      salary_max: { type: ['number', 'null'] },
      salary_mid: { type: ['number', 'null'] },
      remote_policy: { type: ['string', 'null'], enum: ['onsite', 'hybrid', 'remote'] },
      seniority: { type: ['string', 'null'], enum: ['intern','junior','mid','senior','lead','manager'] },
      time_type: { type: ['string', 'null'], enum: ['full-time','part-time','contract'] },
      currency: {type: ['string', 'null']},
      timezone_requirement: { type: ['string', 'null'] },
    },
    required: ['location', 'salary_max', 'salary_min', 'salary_mid', 'remote_policy','seniority','time_type','currency','timezone_requirement'],
  } as const;
  const callOnce = async () => {
    const resp = await client.responses.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content:
            'You are a structured information extractor for job postings. ' + 
            'Return ONLY valid JSON that matches the provided JSON Schema. ' + 
            'If a value is not explicitly stated, return null. Never invent values.' + 
            'location must be a human-readable geography (city + state/province + country if present). Ignore suites, floors, building codes, room numbers, and internal IDs. If multiple, choose the primary city.' +
            'Salary must be cross referenced with the value in salary min/max/mid field if avaiable, else extract salary and fill in',
        },
        { role: 'user', content: 'Full job text: ' + plainText },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'job_info',
          schema,
          strict: true,
        },
      },
    });

    const raw = resp.output_text ?? "{}";
    const obj = JSON.parse(raw);
    const parsed = ZJobNLP.safeParse(obj);
    if (!parsed.success) throw new Error('validation failed');
    return parsed.data;
  };

  // Call the model (retry once if validation fails)
  let aiData: JobNLP;
  try {
    aiData = await callOnce();
  } catch {
    aiData = await callOnce();
  }

  // 5) Fill from adapter fields if model left blanks
  aiData.location ??= pickLocationName(rawJob);
  aiData.time_type ??= normalizeEmploymentType(features.time_type ?? null);

  return { ...features, ...aiData };
} 
catch (err) {
  console.warn('NLP call failed; returning deterministic features only:', err);
  return { ...features, ...EMPTY_NLP };
}}

// ---- Convenience: adapter + NLP from tenant/id ----
export async function analyzeGreenhousePosting(
  tenant: string,
  jobId: string
): Promise<Combined | null> {
  const job = await greenhouseAdapter(tenant, jobId);
  if (!job) return null;
  return analyzeGreenhouseJob(job);
}

// ---- Convenience: adapter + NLP from a Greenhouse URL ----
export async function analyzeGreenhouseUrl(urlStr: string): Promise<Combined | null> {
  const parsed = parseGreenhouseUrl(urlStr);
  if (!parsed) return null;
  return analyzeGreenhousePosting(parsed.tenant, parsed.jobId);
}

// Supports both UI and API Greenhouse URLs
function parseGreenhouseUrl(
  urlStr: string
): { tenant: string; jobId: string } | null {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return null;
  }
  const path = u.pathname.replace(/\/+$/, '');

  // API form: /v1/boards/<tenant>/jobs/<id>
  let m = path.match(/^\/v1\/boards\/([^/]+)\/jobs\/(\d+)$/i);
  if (m) return { tenant: m[1], jobId: m[2] };

  // UI form: /<tenant>/jobs/<id>(/.*)?
  m = path.match(/^\/([^/]+)\/jobs\/(\d+)(?:\/.*)?$/i);
  if (m) return { tenant: m[1], jobId: m[2] };

  return null;
}

*/


// lib/nlp/client.ts

// Take a unified AdapterJob (from any source: Greenhouse or generic web), extract reliable structured fields using deterministic rules first, 
// then LLM for the fuzzy stuff, and return a single merged object ready for DB insertion/scoring.

import OpenAI from "openai";
import { z } from "zod";
import { fetchJobFromUrl } from "../adapters"; // <— new: single entry point
import type { AdapterJob } from "../adapters/types";
import { dbJobFeatures } from "../db/jobFeatures";
import { extractGhFeaturesFromMetadata, extractSalaryFromText, htmlToPlainText } from "../normalizers/greenhouse";

// ---- OpenAI client ----
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY missing. Put it in .env/.env.local.");
const client = new OpenAI({ apiKey });

// Types
type DBFeatures = dbJobFeatures;

const ZJobNLP = z.object({
  location: z.string().nullable(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_mid: z.number().nullable(),
  remote_policy: z.enum(["onsite","hybrid","remote"]).nullable(),
  seniority: z.enum(["intern","junior","mid","senior","lead","manager"]).nullable(),
  time_type: z.enum(["full-time","part-time","contract"]).nullable(),
  currency: z.string().nullable(),
  timezone_requirement: z.string().nullable(),
});
export type JobNLP = z.infer<typeof ZJobNLP>;
export type Combined = Partial<DBFeatures> & Partial<JobNLP>;

const EMPTY_NLP: JobNLP = {
  location: null, salary_min: null, salary_max: null, salary_mid: null,
  remote_policy: null, seniority: null, time_type: null,
  currency: null, timezone_requirement: null,
};

// ---- helpers (adapter-agnostic) ----
function pickMetadata(job: AdapterJob): unknown {
  // GH adapter puts provider payload into raw_json; metadata may be null/undefined
  return (job as any)?.raw_json?.metadata ?? (job as any)?.metadata ?? null;
}
function pickContent(job: AdapterJob): string {
  // Both adapters set .content; GH uses job.content; web has raw HTML in content too
  return typeof job?.content === "string" ? job.content : "";
}
function pickLocationName(job: AdapterJob): string | null {
  if (typeof job?.location === "string" && job.location) return job.location;
  const name = (job as any)?.raw_json?.location?.name;
  return typeof name === "string" && name ? name : null;
}

function pickLocationFromJsonLd(job: AdapterJob): string | null {
  const jl = (job as any)?.raw_json?.jsonld;
  if (!Array.isArray(jl)) return null;

  for (const item of jl) {
    const o = item as any;
    const types = Array.isArray(o?.["@type"]) ? o["@type"] : [o?.["@type"]];
    const lower = types.filter(Boolean).map((t: any) => String(t).toLowerCase());
    if (!lower.includes("jobposting")) continue;

    // jobLocation can be an object or array; normalize to an array
    const locs = Array.isArray(o?.jobLocation) ? o.jobLocation : [o?.jobLocation].filter(Boolean);
    for (const loc of locs) {
      const addr = loc?.address ?? o?.hiringOrganization?.address;
      const parts = [
        addr?.addressLocality,
        addr?.addressRegion,
        addr?.addressCountry,
      ].filter((x) => typeof x === "string" && x.trim());
      if (parts.length) return parts.join(", ");
    }

    // Some schemas put it flat
    const addr = o?.jobLocation?.address ?? o?.address;
    const parts = [
      addr?.addressLocality,
      addr?.addressRegion,
      addr?.addressCountry,
    ].filter((x) => typeof x === "string" && x.trim());
    if (parts.length) return parts.join(", ");
  }
  return null;
}

function normalizeEmploymentType(timeType?: string | null): JobNLP["time_type"] {
  const s = (timeType ?? "").toLowerCase();
  if (/full[-\s]?time/.test(s)) return "full-time";
  if (/part[-\s]?time/.test(s)) return "part-time";
  if (/contract|temp|temporary|cont(ractor)?/.test(s)) return "contract";
  return null;
}

function mergePreferDeterministic<T extends object, U extends object>(det: T, ai: U): T & U {
  const out: any = { ...ai };
  for (const [k, v] of Object.entries(det)) {
    if (v !== undefined && v !== null) out[k] = v; // deterministic wins if defined
  }
  return out;
}

function unitHints(text: string): { hour: boolean; year: boolean } {
  const hour = /\b(hourly|per\s*hour|\/\s*(?:hr|hour)|\bhr\b)\b/i.test(text);
  const year =
    /\b(annual|per\s*(?:year|yr)|\/\s*(?:year|yr)|salary)\b/i.test(text) ||
    /\$\s*\d{2,3}\s*[kK]\b/.test(text) ||         // $170k, 150k
    /\$\s*\d{5,}/.test(text);                      // $170000
  return { hour, year };
}


// ---- Core: analyze an AdapterJob ----
export async function analyzeAdapterJob(job: AdapterJob): Promise<Combined> {
    // 1) Start with deterministic features (from GH metadata only if GH)
    // What: If this job came from Greenhouse, try to pull the structured fields from their metadata array.
    // features now contains any fields we could deterministically extract (may be empty).
    let features: Partial<DBFeatures> = {};
    
    if (job.ats_provider === "greenhouse") {
        try {
        features = extractGhFeaturesFromMetadata(pickMetadata(job));
        } catch {
        features = {};
        }
    }

    // 2) Convert the adapter’s HTML/content into plain text. If there’s enough text, run heuristics to find salary ranges and set salary_min/max (and possibly related flags).
    //If text is too short we bail early with whatever we have and a “blank” NLP block —no need to call the LLM.
    const rawText = htmlToPlainText(pickContent(job)).trim();
    const plainText = rawText.slice(0, 20_000);

    if (plainText.length <= 20) {
    return { ...features, ...EMPTY_NLP };
    }
    const f2 = { ...features };
    extractSalaryFromText(plainText, f2 as any);

    // ---- sanity: use f2 (NOT features) ----
    const { hour, year } = unitHints(plainText);

    // If numbers are tiny (e.g., 9–25) but no explicit hourly words → drop them
    if ((f2 as any).salary_min != null && (f2 as any).salary_max != null) {
    const min = Number((f2 as any).salary_min);
    const max = Number((f2 as any).salary_max);
    const tinyRange = max <= 100; // classic hourly-shaped range

    if (tinyRange && !hour) {
        delete (f2 as any).salary_min;
        delete (f2 as any).salary_max;
        delete (f2 as any).salary_mid;
        delete (f2 as any).comp_period;
        delete (f2 as any).salary_source;
    }
    }

    // If the text screams “year” and your period is 'hour' with tiny numbers → drop
    if (year && !hour && (f2 as any).comp_period === "hour") {
    delete (f2 as any).salary_min;
    delete (f2 as any).salary_max;
    delete (f2 as any).salary_mid;
    delete (f2 as any).comp_period;
    delete (f2 as any).salary_source;
    }

    // now commit
    features = f2;


    // 3) LLM Schema with fields
    const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
        location: { type: ["string","null"] },
        salary_min: { type: ["number","null"] },
        salary_max: { type: ["number","null"] },
        salary_mid: { type: ["number","null"] },
        remote_policy: { type: ["string","null"], enum: ["onsite","hybrid","remote"] },
        seniority: { type: ["string","null"], enum: ["intern","junior","mid","senior","lead","manager"] },
        time_type: { type: ["string","null"], enum: ["full-time","part-time","contract"] },
        currency: { type: ["string","null"] },
        timezone_requirement: { type: ["string","null"] },
        },
        required: ["location","salary_max","salary_min","salary_mid","remote_policy","seniority","time_type","currency","timezone_requirement"],
    } as const;
    // The schema enforces allowed keys and types; temperature is low for consistency; results are validated (and retried once) 
    const callOnce = async (): Promise<JobNLP> => {
        const resp = await client.responses.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        input: [
            {
            role: "system",
            content:
                "You are a structured information extractor for job postings. " +
                "Return ONLY valid JSON that matches the provided JSON Schema. " +
                "If a value is not explicitly stated, return null. Never invent values. " +
                "location must be a human-readable geography (city + state/province + country if present). " +
                "Ignore suites/floors/building codes/internal IDs. If multiple, choose the primary city.",
            },
            { role: "user", content: "Full job text: " + plainText },
        ],
        text: {
            format: { type: "json_schema", name: "job_info", schema, strict: true },
        },
        });

    const raw = resp.output_text ?? "{}";
    const obj = JSON.parse(raw);
    const parsed = ZJobNLP.safeParse(obj);
    if (!parsed.success) throw new Error("validation failed");
    return parsed.data;
  };

   let aiData: JobNLP;
    try {
        aiData = await callOnce();
    } catch (e) {
        try {
            aiData = await callOnce();
        } catch (e2) {
            // If the second attempt fails, log/handle and fall back to the empty NLP block.
            console.error("LLM failed twice:", e, e2);
            aiData = EMPTY_NLP;
        }
    }

    // If the LLM didn’t give a location, try to pull a deterministic one from the adapter. Then normalize time_type to your enum.
    aiData.location ??= pickLocationFromJsonLd(job) ?? pickLocationName(job);

    // Merge features and aiData with a rule that deterministic values are priority if they’re defined. Then compute salary_mid if we have min/max.
    const merged = mergePreferDeterministic(features, aiData);

    const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

    // after: const merged = mergePreferDeterministic(features, aiData);
    if (isNum(merged.salary_min) && isNum(merged.salary_max)) {
    const min = merged.salary_min, max = merged.salary_max;
    const needsFix =
        !isNum(merged.salary_mid) ||
        merged.salary_mid <= min ||
        merged.salary_mid >= max;

    if (needsFix) {
        merged.salary_mid = (min + max) / 2; // 210000 here
    }
    }

    // FINAL guard: compute mid if min & max exist
    if (
    merged.salary_mid == null &&
    typeof merged.salary_min === "number" &&
    Number.isFinite(merged.salary_min) &&
    typeof merged.salary_max === "number" &&
    Number.isFinite(merged.salary_max)
    ) {
    merged.salary_mid = (merged.salary_min + merged.salary_max) / 2;
    }
    merged.time_type = normalizeEmploymentType(merged.time_type ?? null) ?? merged.time_type ?? null;


    return merged;
}

// ---- Convenience: analyze from URL using the dispatcher ----
export async function analyzeJobFromUrl(url: string): Promise<Combined | null> {
  const job = await fetchJobFromUrl(url);
  if (!job) return null;
  return analyzeAdapterJob(job);
}
