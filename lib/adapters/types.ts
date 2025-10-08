// lib/types.ts
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

export type AdapterJob = {
  ats_provider: AtsProvider;
  tenant_slug: string;            
  external_job_id: string;        
  title: string;
  company_name: string;
  location: string;
  absolute_url: string;
  first_published: string | null; // ISO 8601
  updated_at: string | null;      // ISO 8601
  requisition_id: string | null;
  content: string | null;         // raw HTML
  raw_json: {
    source?: "web" | "greenhouse";
    // HTTP + fetch metadata (debugging, dedup, cacheing)
    http?: {
      status: number;
      fetched_at: string;         // ISO when fetched
      content_length: number | null; // bytes (from header or computed)
      sha256: string;             // checksum of body
    };
    canonical_candidate?: {
      ats: AtsProvider;
      tenant_slug: string;
      external_job_id: string;
      absolute_url: string;
      provenance: "jsonld" | "text_only" | "mixed";
    };
    // as-captured JSON-LD
    jsonld?: any;
    // any source-specific leftovers
    [k: string]: any;
  };
  // ingestion hints that the downstream pipeline can read
  _ingest?: {
    needs_nlp: boolean;           // true = queue this doc for NLP enrichment
    reason?: string;              // short reason for triage
  };
};
