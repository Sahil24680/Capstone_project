// app/api/data-ingestion/save-job
"use server";

import { createClient } from '@/utils/supabase/server';   // 1. Client for getting the USER'S session
import { createClient as createAdminClient } from '@supabase/supabase-js';  // 2. Client for ADMIN database operations (to bypasses RLS)
import { ingestUserJobPosting } from '@/app/db/jobs';
import type { AdapterJob } from '@/lib/adapters/types';
import { scrapeJobFromUrl } from '@/app/other/scraper';


// The function that runs on the server and handles the database work
export async function saveJobCheck(jobUrl: string) {
    // 1. Get User
    const supabaseUserClient = await createClient(); 
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
        console.error("DEBUG: Authentication Failed. Session invalid or user not logged in."); // <-- DELETE LATER (Does this affect produciton/available to users?)
        return { success: false, error: "Authentication required." };
    }
    const userId = user.id;
    console.log(`DEBUG: User authenticated. Starting ingestion for user: ${userId}`); // <-- DELETE LATER (Does this affect produciton/available to users?)

    // 2. Create ADMIN CLIENT
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Scrape URL to get job data
    let jobDetails: AdapterJob | null = null;
    
    try {
      console.log(`[${userId}] Step 3: Calling scrapeJobFromUrl for: ${jobUrl}`);  // <-- DELETE LATER (Does this affect produciton/available to users?)
      jobDetails = await scrapeJobFromUrl(jobUrl); 

      if (!jobDetails) {
        console.warn(`[${userId}] Scrape returned null. Aborting.`); // <-- DELETE LATER (Does this affect produciton/available to users?)
        return { success: false, error: "Failed to fetch job details from that URL." };
      }

      console.log(`[${userId}] Step 3: Scrape successful. Job title: ${jobDetails.title}`); // <-- DELETE LATER (Does this affect produciton/available to users?)

    } catch (e: any) {
        // This block now correctly catches errors THROWN by the scraper 
        // (like the denylist, robots.txt, or a network failure)
        console.error(`[${userId}] DEBUG: Scraper failed`, e);
        return { success: false, error: `Scrape Error: ${e.message}` };
    }

    // 4. Pass job data to the ingester function
    try {
        console.log(`[${userId}] Step 4: Calling ingestUserJobPosting...`); // <-- DELETE LATER (Does this affect produciton/available to users?)
        const result = await ingestUserJobPosting(
            supabaseAdmin,
            jobDetails, // Pass the REAL object from the scraper
            userId
        ); 

        if (!result.success) {
            console.warn(`[${userId}] Ingestion returned error: ${result.error}`); // <-- DELETE LATER (Does this affect produciton/available to users?)
            return { success: false, error: result.error };
        }

        console.log(`[${userId}] Step 4: Ingestion successful. New jobId: ${result.jobId}`); // <-- DELETE LATER (Does this affect produciton/available to users?)

        // Scoring logic placeholder 
        //const scoring = await RunScoringAnalysis(jobDetails);

        // 6. Return 
        console.log(`[${userId}] Step 5: Pipeline complete. Returning success.`); // <-- DELETE LATER (Does this affect produciton/available to users?)
        return { 
            success: true
            //scoring: score stuff idk
        };
    } catch (e: any) {
        console.error(`[${userId}] DEBUG: Ingestion failed unexpectedly`, e); // <-- DELETE LATER (Does this affect produciton/available to users?)
        return { success: false, error: `Server Error: ${e.message || "Unknown failure."}` };
    }
}