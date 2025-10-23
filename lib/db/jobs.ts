//core database layer for job persistence
//upserts a job into the database (jobs table)

import { getAdminClient } from './client';
import type { AdapterJob } from '../adapters/types';


//Uses the composite key (ats, tenant_slug, external_job_id) for idempotency.
//If job exists: updates fields and bumps last_seen to now()
//If job is new: inserts with first_seen = last_seen = now()

//paramters: The AdapterJob object from the scraper
//returns:  an object containing the job's UUID, first_seen, last_seen, and updated_at (based off the persistance layer guidance doc)

//we get an error if job is not from Greenhouse or if database operation fails



export async function upsertJob(job: AdapterJob): Promise<{ id: string; first_seen: string; last_seen: string; updated_at: string }> {
    //check to make sure its only from Greenhouse ats 
    if (job.ats_provider !== 'greenhouse') {
        throw new Error('Only Greenhouse jobs are supported');
    }


    //get admin client to bypass RLS. since we need unrestricted access to insert or update jobs. 
    //bc from what I understand when we save a job we are not doing it as a "specific user", we need unrestricted access to just insert and updated the jobs into the table which isn't tied to any individual users session
    const supabase = getAdminClient();


    //check if job already exists
    //reason for this is to try to avoid overwriting the first_seen timestamp when job is updated
    const { data: existing } = await supabase
        .from('jobs')
        .select('id, first_seen')
        .eq('ats', job.ats_provider)
        .eq('tenant_slug', job.tenant_slug)
        .eq('external_job_id', job.external_job_id)
        .maybeSingle();

    const now = new Date().toISOString();


    //map AdapterJob fields to database schema
    //note: ats_provider → ats (database column name)
    const jobRecord = {
        ats: job.ats_provider,
        tenant_slug: job.tenant_slug,
        external_job_id: job.external_job_id,
        title: job.title,
        company_name: job.company_name,
        location: job.location,
        absolute_url: job.absolute_url,
        first_published: job.first_published,
        updated_at: job.updated_at,
        requisition_id: job.requisition_id,
        content: job.content,
        raw_json: job.raw_json,
        // provenance: job.raw_json.canonical_candidate?.provenance || null, // Optional extract from raw_json
        
        // Set timestamps based on whether job exists
        first_seen: existing ? existing.first_seen : now, //keep original timestamp if exists, else set it to now
        last_seen: now, //always update to now
        
        // is_active: true, //I assume database handles this by default 
    };


    //upsert to jobs table
    //onConflict specifies the composite unique key (ats, tenant_slug, external_job_id)
    const { data, error } = await supabase
        .from('jobs')
        .upsert([jobRecord], {
            onConflict: 'ats,tenant_slug,external_job_id',
            ignoreDuplicates: false, //always update on conflict
        })
        .select('id, first_seen, last_seen, updated_at') //fetching back these 4 fields
        .single();


    if (error) {
        console.error('[upsertJob] Database error:', error);   
        throw new Error(`Failed to upsert job: ${error.message}`);
    }


    if (!data) {
        throw new Error('Upsert succeeded but no data returned');
    }


    //returns object with all the time fields as said by persistance layer doc 
    return {
        id: data.id,
        first_seen: data.first_seen,
        last_seen: data.last_seen,
        updated_at: data.updated_at,
    };
}


