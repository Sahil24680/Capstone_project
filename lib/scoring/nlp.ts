// nlp.ts
// Wrapper function that calls both database fields and extra fields for backend scoring logic 
// input -  url 
//output - json of combined data


import {scrapeJobFromUrl} from '../scoring/scraper';
import {analyzeAdapterJob, Combined} from "../nlp/client";
import {htmlToPlainText} from "../normalizers/greenhouse";
import {dbJobFeatures} from "../db/jobFeatures"; // for db fields 
import {analysis, analysisWithLLM} from "../nlp/index"; // for extra fields 
import type { AdapterJob } from "../adapters/types"; 



export type scoringTypes = {
    featuresNormalized: Partial<dbJobFeatures>; // DB-ish fields (still just JSON)
    analysis: analysis;                     // the extra fields from LLM
};


const isStr = (v: unknown): v is string => typeof v === "string";
const pickContent = (job: any): string =>
  [job?.content, job?.raw_json?.content].find(isStr) ?? "";

export async function scoreItems(
  url: string,
): Promise<scoringTypes> {

    const job = await scrapeJobFromUrl(url);
    if (!job) throw new Error("Failed to fetch/dispatch adapter for URL.");

    // NOTE: The scraper's return type is loose, so we cast it to the expected AdapterJob type.
    const jobData = job as AdapterJob;

    const ids = {
        ats: job.ats_provider === "greenhouse" ? "greenhouse" as const : "other" as const, 
        tenant: job.tenant_slug,
        external_job_id: job.external_job_id,                 // the extra fields from LLM
    };
        
    
    // 1) DB-ish fields
    const features: Combined = await analyzeAdapterJob(jobData);
       
    if (!features) {
        // If feature analysis fails, Throw an error
        throw new Error("Failed to extract features (analyzeAdapterJob returned null).");
    }

    // 2) take Plain text again for other LLM call
    const html = pickContent(job);
    const plainText = htmlToPlainText(html).slice(0, 20_000);

    // 3) Scoring-only analysis (one extra LLM call)
    const analysis = await analysisWithLLM({
        text: plainText,
        metadata: {
        time_type: features.time_type ?? null,
        currency: (features.currency ?? null) as string | null,
        },
    });

    // 4) Normalizes DB-ish into a patch (still just JSON)
    const featuresNormalized: Partial<dbJobFeatures> = {
        time_type: features.time_type ?? null,
        salary_min: features.salary_min ?? null,
        salary_mid: features.salary_mid ?? null,
        salary_max: features.salary_max ?? null,
        currency: (features.currency ?? null)?.toUpperCase()?.slice(0, 3) ?? null,
        department: (features as any).department ?? null,
        salary_source: (features as any).salary_source ?? null,
    };

    return {
        featuresNormalized,
        analysis,
  };
}