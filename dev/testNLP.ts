// dev/testNLP.ts
// dev/testNLP.ts
/** 
import { analyzeGreenhouseUrl } from "../lib/nlp/client";


(async () => {
  try {
    const url = 'https://job-boards.greenhouse.io/doordashusa/jobs/7258239';
    const out = await analyzeGreenhouseUrl(url); // Combined | null

    if (!out) {
      console.error('No result (bad URL/tenant/id, or fetch failed).');
      process.exit(1);
    }

    console.log('NLP + deterministic features:\n');
    console.dir(out, { depth: null });
  } catch (err) {
    console.error('testNLP error:', err);
    process.exit(1);
  }
})();

*/





// random values between 0 and 1 for confidence values 
// dev/testNLP_both.ts
/** 
import { fetchJobFromUrl } from "../lib/adapters";
import { analyzeAdapterJob } from "../lib/nlp/client";
import { htmlToPlainText } from "../lib/adapters/util";
import { analysisWithLLM } from "../lib/nlp/index";

function pickContent(job: any): string {
  return typeof job?.content === "string" ? job.content : "";
}

(async () => {
  try {
    const url =
      process.argv[2] ??
      "https://explore.jobs.netflix.net/careers?pid=790304901333&domain=netflix.com&sort_by=relevance";

    console.log("URL:", url);

    // 1) Use dispatcher (GH or Web automatically)
    const job = await fetchJobFromUrl(url);
    if (!job) {
      console.error("No job returned (adapter not found or fetch failed).");
      process.exit(1);
    }
    console.log("Adapter:", job.ats_provider);
    console.log("Fetch status:", job.raw_json?.fetch?.status, "ok:", job.raw_json?.fetch?.ok);

    // 2) Plain text from whatever we got
    const plainText = htmlToPlainText(pickContent(job)).slice(0, 20_000);
    console.log("Content length:", job.raw_json?.content_metrics?.length_bytes, "text chars:", plainText.length);

    // 3) Structured extraction (NLP + deterministic)
    const combined = await analyzeAdapterJob(job);

    // 4) Optional: your scoring-only pass
    const insights = await analysisWithLLM({
      text: plainText,
      metadata: {
        time_type: combined.time_type ?? null,
        currency: (combined.currency ?? null) as string | null,
      },
      buzzwordList: ["builder mindset", "move fast", "ownership"],
      model: "gpt-4o-mini",
      temperature: 0.2,
    });

    console.log("\n=== Combined (features + NLP) ===");
    console.dir(combined, { depth: null });

    console.log("\n=== Insights (scoring-only) ===");
    console.dir(insights, { depth: null });

    console.log("\nCONTENT (first 400 chars):");
    console.log(plainText.slice(0, 400));
  } catch (err) {
    console.error("testNLP_both error:", err);
    process.exit(1);
  }
})();
*/


/** 

import { greenhouseAdapter } from "../lib/adapters/greenhouse";
import { scoreItems } from "../lib/nlp/schema";

function parseGreenhouseUrl(urlStr: string) {
  const u = new URL(urlStr);
  const path = u.pathname.replace(/\/+$/, "");
  let m = path.match(/^\/v1\/boards\/([^/]+)\/jobs\/(\d+)$/i);
  if (m) return { tenant: m[1], jobId: m[2] };
  m = path.match(/^\/([^/]+)\/jobs\/(\d+)(?:\/.*)?$/i);
  if (m) return { tenant: m[1], jobId: m[2] };
  return null;
}

(async () => {
  const url = "https://job-boards.greenhouse.io/doordashusa/jobs/7258239";
  const parsed = parseGreenhouseUrl(url)!;
  const rawJob = await greenhouseAdapter(parsed.tenant, parsed.jobId);

  const bundle = await scoreItems(
    rawJob,
    { ats: "greenhouse", tenant: parsed.tenant, external_job_id: parsed.jobId },
  );

  console.log("\n=== Analysis Pieces ===");
  console.dir(bundle, { depth: null });

  // If your teammate has a scorer:
  // const score = scoreJob(bundle);
  // console.log("Ghost Score:", score);
})();





/*
// dev/testAdapter.ts
import { fetchJobFromUrl } from "../lib/adapters";
import type { AdapterJob } from "../lib/adapters/types";

function pick(obj: any, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (obj as any)?.[k];
  return out;
}

async function main() {
  const url = "https://explore.jobs.netflix.net/careers/apply?domain=netflix.com&pid=790312532029&sort_by=relevance";
  if (!url) {
    console.error("Usage: npx tsx dev/testAdapter.ts <job-url>");
    process.exit(1);
  }

  console.log("Fetching:", url, "\n");
  const job: AdapterJob | null = await fetchJobFromUrl(url);

  if (!job) {
    console.error("No job returned (adapter not found or fetch failed).");
    process.exit(2);
  }

  // Keep the console readable; print core fields + a few meta stats.
  const core = pick(job, [
    "ats_provider",
    "tenant_slug",
    "external_job_id",
    "title",
    "company_name",
    "location",
    "absolute_url",
    "first_published",
    "updated_at",
    "requisition_id",
  ]);

  const meta = {
    content_len: job.content?.length ?? 0,
    raw_sha1: job.raw_json?.content_metrics?.sha1,
    provenance: job.raw_json?.canonical_candidate?.provenance,
    fetch_status: job.raw_json?.fetch?.status,
    fetch_ok: job.raw_json?.fetch?.ok,
  };

  console.log("CORE:");
  console.dir(core, { depth: null });
  console.log("\nMETA:");
  console.dir(meta, { depth: null });

  // Optional: dump first 500 chars of content for sanity
  if (job.content) {
    console.log("\nCONTENT (first 500 chars):");
    console.log(job.content.slice(0, 500));
  }

  // Exit cleanly
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(99);
});
*/

import { scoreItems } from "../lib/nlp/schema";

(async () => {
  try{
  const data = await scoreItems(
   // "https://jobs.nyulangone.org/job/22543655/ultrasound-technician-fgp-brooklyn-brooklyn-ny/?utm_campaign=google_jobs_apply&utm_source=google_jobs_apply&utm_medium=organic"
    //"https://www.disneycareers.com/en/job/lake-buena-vista/senior-manager-electric-operations/391/87376529808"
    //"https://explore.jobs.netflix.net/careers?pid=790304901333&domain=netflix.com&sort_by=relevance"
     "https://job-boards.greenhouse.io/doordashusa/jobs/7258239"
  );

  if (!data) {
    console.log("not fetched :(");
    return;
  }

  console.log("Combined features:");
  console.dir(data, { depth: null });

  // upsert `data` into job_features here
} catch (error) {
    console.error("Test failed to score item.");
    console.error(error);
  }
})();
