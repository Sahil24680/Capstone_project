// Main orchestrator that coordinates scraper, NLP, scoring, and DB

import { scrapeJobFromUrl } from "@/app/other/scraper";
import { getJobByCompositeKey, insertIntoJobTable, InsertStructuredJobFeatures } from "@/utils/supabase/action";
import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeAdapterJob, Combined } from "@/app/api/data-ingestion/nlp/client";
import { analysisWithLLM } from "@/app/api/data-ingestion/nlp/index";
import { scoreJob, type AtsJobInput, type AtsJobFeatures } from "@/app/scoring/score";
import type { analysis } from "@/app/api/data-ingestion/nlp/index";

export type Tier = "Low" | "Medium" | "High";

export interface RiskResult {
  score: number;
  tier: Tier;
  redFlags: string[];
  recommendations: string[];
}

/**
 * Analyze a job URL and return scoring results
 * This is the main orchestrator that coordinates all components
 */
export async function analyzeJob(
  jobUrl: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{
  success: boolean;
  jobId?: string;
  score?: RiskResult;
  features?: Combined;
  nlpAnalysis?: analysis;
  error?: string;
}> {
  try {
    // 1. Scrape the job to get composite key components
    const adapterJob = await scrapeJobFromUrl(jobUrl);
    
    if (!adapterJob) {
      return { success: false, error: "Unable to access this job posting. The website may be blocking automated access, or the URL may be invalid. Please try using the 'Apply Now' link from the company's careers page instead." };
    }

    const { ats_provider, tenant_slug, external_job_id } = adapterJob;

    // 2. Check if job exists in DB by composite key
    const existingJob = await getJobByCompositeKey(
      supabase,
      ats_provider,
      tenant_slug,
      external_job_id
    );

    let jobId: string;
    let features: Combined;

    // Type for job returned from database
    type JobWithFeatures = {
      id: string;
      last_seen: string | null;
      job_features?: Array<Combined>;
    };

    // Helper function to check if job data is fresh (< 24 hours)
    const isJobFresh = (job: JobWithFeatures): boolean => {
      const lastSeen = job.last_seen;
      if (!lastSeen) return false; // Null means not fresh
      
      const hoursSinceSeen = 
        (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60);
      return hoursSinceSeen < 24;
    };

    // For ATS jobs: check cache and persist to DB
    // For web jobs: ephemeral only, don't persist to DB
    if (ats_provider === "greenhouse") {
      if (existingJob && isJobFresh(existingJob) && existingJob.job_features?.[0]) {
        // 3a. ATS job exists, is fresh, and has features - use cached data
        jobId = existingJob.id;
        
        // Extract features from DB
        const dbFeatures = existingJob.job_features[0] as Combined;
        features = dbFeatures;
        
        console.log(`[analyzeJob] Using cached ATS job: ${jobId}`);
      } else {
        // 3b. New ATS job OR stale ATS job - scrape and save/update
        // Upsert will create new row or update existing, returns ID
        jobId = await insertIntoJobTable(supabase, adapterJob);
        
        if (!jobId) {
          return { success: false, error: "Failed to save job to database" };
        }

        // Run NLP analysis to get features
        const nlpFeatures = await analyzeAdapterJob(adapterJob);
        features = nlpFeatures;
        
        // Save features to DB
        await InsertStructuredJobFeatures(supabase, jobId, adapterJob);
        
        if (existingJob) {
          console.log(`[analyzeJob] Updated stale ATS job: ${jobId}`);
        } else {
          console.log(`[analyzeJob] Scraped and saved new ATS job: ${jobId}`);
        }
      }
    } else {
      // Web jobs: ephemeral only, don't persist to DB
      // Generate a temporary ID for the response (won't be saved)
      jobId = `web-${Date.now()}`;
      
      // Run NLP analysis to get features
      const nlpFeatures = await analyzeAdapterJob(adapterJob);
      features = nlpFeatures;
      
      console.log(`[analyzeJob] Processed ephemeral web job: ${jobId}`);
    }

    // 4. Run ephemeral NLP analysis (skills, buzzwords, etc.)
    // Convert HTML to plain text and truncate to 20K chars
    const { htmlToPlainText } = await import("@/app/api/data-ingestion/adapters/util");
    const rawText = adapterJob.content || "";
    const plainText = htmlToPlainText(rawText).slice(0, 20_000);
    console.log(`[analyzeJob] Content length for NLP: ${rawText.length} chars raw -> ${plainText.length} chars plain`);
    
    const nlpAnalysis = await analysisWithLLM({
      text: plainText,
      metadata: {
        time_type: features?.time_type as string | null,
        currency: features?.currency as string | null
      }
    });
    
    console.log(`[analyzeJob] NLP extracted ${nlpAnalysis.skills.length} skills:`, nlpAnalysis.skills.map(s => s.name).slice(0, 5));

    // 5. Combine features with NLP analysis for scoring
    const scoringInput: AtsJobInput = {
      source: (ats_provider === "web" ? "web" : "ats") as "ats" | "web",
      absolute_url: adapterJob.absolute_url,
      first_published: adapterJob.first_published,
      updated_at: adapterJob.updated_at,
      features: features as AtsJobFeatures,
      // For web jobs, if successfully scraped, the link is valid
      // For ATS jobs, if successfully got the job, the link is valid
      link_ok: true, // Both web and ATS jobs passed
      link_loop: false,
      nlp_analysis: {
        skills: nlpAnalysis.skills,
        buzzwords: nlpAnalysis.buzzwords,
        comp_period_detected: nlpAnalysis.comp_period_detected
      }
    };

    // 6. Score the job
    const scoreResult = await scoreJob(scoringInput);
    console.log(`[analyzeJob] Score breakdown:`, scoreResult.breakdown);
    const tier: Tier = scoreResult.score < 0.4 ? "High" : scoreResult.score < 0.7 ? "Medium" : "Low";

    return {
      success: true,
      jobId,
      score: {
        score: scoreResult.score,
        tier,
        redFlags: Object.keys(scoreResult.breakdown).filter(k => scoreResult.breakdown[k] < 0.5),
        recommendations: []
      },
      features,
      nlpAnalysis
    };

  } catch (error: any) {
    console.error("[analyzeJob] Error:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}