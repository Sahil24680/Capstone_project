import type { AdapterJob } from "../adapters/types";
import { analyzeAdapterJob } from "../nlp/client";
import {insertIntoJobTable,InsertIntoJobFeaturesTable,InsertToJobUpdatesTable,} from "@/utils/supabase/action"; // adjust paths as needed

type IngestionResult = {
  jobId: string | null;
  status: "inserted" | "skipped" | "errored";
  error?: string;
};

export async function ingestJobBatch(jobs: AdapterJob[]): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];

  for (const job of jobs) {
    try {
      // Step 1: Validate required fields
      if (!job.ats_provider || !job.tenant_slug || !job.external_job_id) {
        results.push({ jobId: null, status: "skipped", error: "Missing required identifiers" });
        continue;
      }

      // Step 2: Insert or upsert job
      const jobId = await insertIntoJobTable(job);
      if (!jobId) {
        results.push({ jobId: null, status: "errored", error: "Failed to insert job" });
        continue;
      }

      // Step 3: Normalize features
      const features = await analyzeAdapterJob(job);
      const sanitized = {
        job_id: jobId,
        time_type: features.time_type ?? null,
        salary_min: features.salary_min ?? null,
        salary_mid: features.salary_mid ?? null,
        salary_max: features.salary_max ?? null,
        currency: features.currency ?? null,
        department: features.department ?? null,
        salary_source: features.salary_source ?? null,
      };

      // Step 4: Insert job features
      await InsertIntoJobFeaturesTable(sanitized);

      // Step 5: Insert job update if needed
      await InsertToJobUpdatesTable(job);

      results.push({ jobId, status: "inserted" });
    } catch (err: any) {
      console.error("[ingestJobBatch] Error processing job:", err);
      results.push({ jobId: null, status: "errored", error: err.message });
    }
  }

  return results;
}
