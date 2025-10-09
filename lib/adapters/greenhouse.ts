// lib/adapters/greenhouse.ts
import type { AdapterJob } from "./types";
import { fetchWithRetry, sha1Hex } from "./util";

/** Some tenants put placeholder text in requisition_id. Normalize to null. */
const isPlaceholderReqId = (v?: string | null) =>
  !v || /^see opening id$/i.test(v) || /^n\/a$/i.test(v) || /^none$/i.test(v);

/**
 * Fetch a Greenhouse job detail and normalize to AdapterJob shape.
 * Includes fetch timing + content metrics for observability & dedupe.
 */
export async function greenhouseAdapter(
  tenant_slug: string,
  external_job_id: string
): Promise<AdapterJob | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${tenant_slug}/jobs/${external_job_id}`;

  const started = new Date();
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        // Helps with some edge CDN filters; keep it tame and identifiable
        "User-Agent": "jobbusters/0.1 (+https://example.com)",
        Accept: "application/json",
      },
    },
    {
      retries: 2,          // small, polite retry
      baseDelayMs: 300,    // backoff base
      timeoutMs: 12_000,   // Sane ceiling
    }
  );
  const finished = new Date();

  if (!res.ok) {
    // Keep a consistent null contract on failures (caller can decide to log)
    return null;
  }

  const payload = await res.json();

  const contentHtml = typeof payload.content === "string" ? payload.content : "";
  const buf = Buffer.from(contentHtml, "utf8");

  // Build the normal form
  const normalized: AdapterJob = {
    ats_provider: "greenhouse",
    tenant_slug,
    external_job_id: String(payload.id ?? external_job_id),

    title: payload.title ?? "",
    company_name: payload.company_name ?? tenant_slug,
    location: payload.location?.name ?? "",
    absolute_url:
      payload.absolute_url ??
      `https://boards.greenhouse.io/${tenant_slug}/jobs/${external_job_id}`,

    // GH often gives both; prefer first_published, fall back to updated_at
    first_published: payload.first_published ?? payload.updated_at ?? null,
    updated_at: payload.updated_at ?? finished.toISOString(),

    requisition_id: isPlaceholderReqId(payload.requisition_id)
      ? null
      : (payload.requisition_id as string | null),

    // keep raw HTML so the NLP layer can do extraction later
    content: contentHtml || null,

    raw_json: {
      // Keep the original GH payload for auditing & future features
      ...payload,

      // Provenance (for your pipeline’s “canonical candidate” checks)
      canonical_candidate: {
        ats: "greenhouse",
        tenant_slug,
        external_job_id: String(payload.id ?? external_job_id),
        absolute_url:
          payload.absolute_url ??
          `https://boards.greenhouse.io/${tenant_slug}/jobs/${external_job_id}`,
        provenance: "api", // came from GH API, not scraped HTML
      },

      // Fetch diagnostics (helpful for debugging & SLOs)
      fetch: {
        status: res.status,
        ok: res.ok,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        elapsed_ms: Math.max(0, finished.getTime() - started.getTime()),
      },

      // Content fingerprinting (dedupe, change detection, truncated bodies)
      content_metrics: {
        length_bytes: buf.byteLength, // bytes of the HTML body
        sha1: sha1Hex(buf),          // stable fingerprint
      },

      // Downstream ingestion hint: this page still needs semantic enrichment
      _ingest: { needsnlp: true },
    },
  };

  return normalized;
}
