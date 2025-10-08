// lib/adapters/web.ts
import crypto from "node:crypto";
import type { AdapterJob } from "./types";
import { fetchWithRetry, sha1Hex } from "./util";

/**
 * Small utility: canonical-ish domain name
 */
function domainToCompany(host: string): string {
  const h = host.replace(/^www\./, "");
  return h.split(".")[0].replace(/-/g, " ");
}

/**
 * Grab the first <title>...</title> for a fallback title
 */
function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

/**
 * Try to find JSON-LD blocks and pull a JobPosting-like object.
 * Returns the first object that looks like a JobPosting (or null).
 */
function tryParseJsonLd(html: string): any | null {
  const blocks = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )];

  for (const b of blocks) {
    const raw = b[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);

      // JSON-LD can be an object or an array or @graph
      const candidates: any[] = Array.isArray(parsed)
        ? parsed
        : parsed?.["@graph"] && Array.isArray(parsed["@graph"])
        ? parsed["@graph"]
        : [parsed];

      for (const c of candidates) {
        const t = (c?.["@type"] || c?.type || "").toString().toLowerCase();
        if (t === "jobposting" || t.includes("jobposting")) {
          return c;
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }
  return null;
}

/**
 * Coerce possibly weird date strings to ISO (or null).
 */
function safeIsoDate(s: any): string | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s);
  return isNaN(d.valueOf()) ? null : d.toISOString();
}

/**
 * Build location string from JSON-LD jobLocation(s).
 */
function locationFromJsonLd(jsonld: any): string {
  try {
    const jl = jsonld?.jobLocation;
    const arr = Array.isArray(jl) ? jl : jl ? [jl] : [];
    const seen = new Set<string>();
    for (const node of arr) {
      const addr = node?.address || node?.jobLocation?.address;
      if (!addr) continue;
      const city = addr.addressLocality || addr.addressRegion || "";
      const region = addr.addressRegion || "";
      const country = addr.addressCountry || "";
      const parts = [city, region, country].filter(Boolean);
      if (parts.length) seen.add(parts.join(", "));
    }
    if (seen.size) return [...seen].join(" • ");
  } catch {}
  return "";
}

/**
 * Company display name from JSON-LD
 */
function companyFromJsonLd(jsonld: any, host: string): string {
  const org = jsonld?.hiringOrganization;
  const maybeName =
    (typeof org === "string" && org) ||
    org?.name ||
    jsonld?.industry ||
    jsonld?.department ||
    null;
  return (maybeName || domainToCompany(host));
}

/**
 * ---------- key helpers ----------
 */
export function buildWebJobKey(rawUrl: string): {
  ats_provider: "web";
  tenant_slug: string;
  external_job_id: string;
} {
  const u = new URL(rawUrl);
  const host = u.host.toLowerCase();
  // Stable, deterministic id for the exact URL
  const hash = crypto
    .createHash("sha1")
    .update(u.toString())
    .digest("hex")
    .slice(0, 16);
  return {
    ats_provider: "web",
    tenant_slug: host,
    external_job_id: hash,
  };
}

/**
 * Main adapter for arbitrary job pages on the public web.
 * Strategy: fetch → prefer JSON-LD JobPosting → fallback to light HTML signals
 */
export async function webAdapter(rawUrl: string): Promise<AdapterJob | null> {
  const startedAt = new Date();
  const { ats_provider, tenant_slug, external_job_id } = buildWebJobKey(rawUrl);

  // fetch
 const res = await fetchWithRetry(rawUrl, {
  headers: {
    "user-agent": "Mozilla/5.0 (compatible; CapstoneJobIngest/1.0; +https://example.invalid)",
    accept: "text/html,application/xhtml+xml,application/json,application/ld+json;q=0.9,*/*;q=0.8",
  },
});


  // body text (even for non-200, keep it around for debugging/NLP retries)
  const body = await res.text();
  const finishedAt = new Date();

  // record content metrics for dedupe/debug/auditing
  const contentLength = Buffer.byteLength(body, "utf8");
  const bodySha1 = crypto.createHash("sha1").update(body).digest("hex");

  // scrape-ish: JSON-LD first
  const jsonld = tryParseJsonLd(body);

  const u = new URL(rawUrl);
  const host = u.host.toLowerCase();

  // Title
  const titleFromJsonld =
    (jsonld?.title ||
      jsonld?.name ||
      (typeof jsonld?.identifier === "string" ? null : jsonld?.identifier?.name)) ??
    null;
  const title =
    (typeof titleFromJsonld === "string" && titleFromJsonld.trim()) ||
    extractHtmlTitle(body) ||
    "Job";

  // Company
  const company_name = companyFromJsonLd(jsonld, host);

  // Location
  const location =
    (typeof jsonld?.jobLocation === "string" && jsonld.jobLocation) ||
    locationFromJsonLd(jsonld) ||
    "";

  // Dates
  const first_published =
    safeIsoDate(jsonld?.datePosted) ||
    safeIsoDate(jsonld?.datePublished) ||
    null;

  // Requisition id (if spotted in jsonld.identifier/#)
  let requisition_id: string | null = null;
  if (jsonld?.identifier) {
    if (typeof jsonld.identifier === "string") {
      requisition_id = jsonld.identifier.trim() || null;
    } else if (typeof jsonld.identifier === "object") {
      requisition_id =
        jsonld.identifier?.value ||
        jsonld.identifier?.id ||
        jsonld.identifier?.name ||
        null;
      if (requisition_id && typeof requisition_id !== "string") {
        requisition_id = String(requisition_id);
      }
    }
  }

  // Canonical candidate provenance (jsonld vs text_only)
  const provenance = jsonld ? "jsonld" : "text_only";

  // Build the AdapterJob
  const job: AdapterJob = {
    ats_provider,                    // "web"
    tenant_slug: host,               // domain as "tenant"
    external_job_id,                 // deterministic hash of URL
    title,
    company_name,
    location,
    absolute_url: u.toString(),
    first_published,
    updated_at: finishedAt.toISOString(),
    requisition_id,
    content: body,                   // raw HTML; NLP will derive clean text later
    raw_json: {
      source: "web",
      canonical_candidate: {
        ats: "web",
        tenant_slug: host,
        external_job_id,
        absolute_url: u.toString(),
        provenance,
      },
      // --- fetch/ingest diagnostics ---
      fetch: {
        status: res.status,                // HTTP status code
        ok: res.ok,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        elapsed_ms: finishedAt.getTime() - startedAt.getTime(),
      },
      content_metrics: {
        length_bytes: contentLength,       // size of HTML in bytes (helps spot truncated pages)
        sha1: bodySha1,                    // stable fingerprint for dedupe/change detection
      },
      jsonld: jsonld || undefined,         // keep the parsed JSON-LD if present
      _ingest: {
        // Signal to downstream that this page still needs semantic extraction.
        // Set to true unless all must-have fields already filled elsewhere.
        needsnlp: true,
      },
    },
  };

  return job;
}
