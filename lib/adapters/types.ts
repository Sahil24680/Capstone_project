// lib/adapters/types.ts
export type AtsProvider = "greenhouse" | "web";

// Minimal “features” bag to enrich later (or with NLP)
export type GHCanon = {
  time_type?: string;
  salary_min?: number;
  salary_mid?: number;
  salary_max?: number;
  currency?: string;
  department?: string;
  salary_source?: "metadata" | "text" | "jsonld";
};

// A generic adapter function type for the registry and callers.
export type Adapter = (...args: any[]) => Promise<AdapterJob | null>;

export type AdapterJob = {
  ats_provider: AtsProvider;          
  tenant_slug: string;                
  external_job_id: string;           
  title: string;
  company_name: string;
  location: string;
  absolute_url: string;
  first_published: string | null;     // ISO
  updated_at: string | null;          // ISO
  requisition_id: string | null;
  content: string | null;             // raw HTML

  raw_json: {
    source?: "web" | "greenhouse";

    // Provenance of the canonical candidate
    canonical_candidate?: {
      ats: AtsProvider;
      tenant_slug: string;
      external_job_id: string;
      absolute_url: string;
      provenance: "api" | "jsonld" | "text_only" | "mixed";
    };

    // HTTP/fetch diagnostics for observability & retries
    fetch?: {
      status: number;
      ok: boolean;
      started_at: string;             // ISO
      finished_at: string;            // ISO
      elapsed_ms: number;
    };

    // Body metrics for dedupe/change detection
    content_metrics?: {
      length_bytes: number;           // size of body (utf8)
      sha1: string;                   // checksum of body
    };

    // If page provided JSON-LD JobPosting, keep it verbatim for NLP
    jsonld?: any;

    // room for provider-specific fields (GH payload, etc.)
    [k: string]: any;
  };

  // Ingestion hints for downstream pipeline
  _ingest?: {
    needs_nlp: boolean;               // If true, queue for NLP enrichment
    reason?: string;                  // optional triage note
  };
};
