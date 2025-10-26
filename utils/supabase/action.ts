"use server";
import { createClient } from "./server";
import { redirect } from "next/navigation";
import type { AdapterJob } from "@/app/api/data-ingestion/adapters/types";   
import type { dbJobFeatures } from "@/app/db/jobFeatures";   
import {analyzeAdapterJob} from "@/app/api/data-ingestion/nlp/client";
import type { SupabaseClient } from '@supabase/supabase-js';

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { error } : { success: true };
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signUp({ email, password });
  return error ? { error } : { success: true };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? { error } : { success: true };
}

export async function updateName(
  userId: string,
  firstName: string,
  lastName: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName.trim(), last_name: lastName.trim() })
    .eq("id", userId);
  return error ? { error } : { success: true };
}

export async function uploadProfilePicture(userId: string, file: File) {
  const supabase = await createClient();

  const fileExt = file.name.split(".").pop();
  const filePath = `${userId}/${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("profile-pictures")
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) return { error: uploadError };
  const { data } = supabase.storage
    .from("profile-pictures")
    .getPublicUrl(filePath);
  const publicUrl = data?.publicUrl;

  const { error: dbError } = await supabase
    .from("profiles")
    .update({ profile_picture: publicUrl })
    .eq("id", userId);
  return dbError ? { error: dbError } : { success: true, url: publicUrl };
}

export async function getUser() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return { error: error.message };
    }
    return data.user;
  } catch (error) {
    // @ts-ignore
    return { error: error.message };
  }
}

export async function request_lock_and_tokens(userId: string) {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("request_lock")
    .select("is_available, tokens_remaining")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[request_lock_and_tokens] select error:", error);
    throw error;
  }

  if (!row) {
    const { data: created, error: insertErr } = await supabase
      .from("request_lock")
      .insert({ user_id: userId, is_available: true, tokens_remaining: 3 })
      .select("is_available, tokens_remaining")
      .single();

    if (insertErr) throw insertErr;
    return {
      is_available: created!.is_available,
      tokens: created.tokens_remaining,
    };
  }

  return { is_available: row.is_available, tokens: row.tokens_remaining };
}

export async function set_request_lock(userId: string) {
  const supabase = await createClient();
  // set the lock
  const { data, error } = await supabase
    .from("request_lock")
    .update({ is_available: false })
    .eq("user_id", userId)
    .eq("is_available", true)
    .select("tokens_remaining")
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  // decrement token
  const { error: decErr } = await supabase
    .from("request_lock")
    .update({ tokens_remaining: data.tokens_remaining - 1 })
    .eq("user_id", userId);

  if (decErr) {
    // prevent a stuck lock if decrement fails
    await supabase
      .from("request_lock")
      .update({ is_available: true })
      .eq("user_id", userId);
    throw decErr;
  }
  return true;
}

export async function release_request_lock(userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("request_lock")
    .update({ is_available: true })
    .eq("user_id", userId);
  if (error) console.error("[release_request_lock] release error:", error);
}



export async function insertIntoJobTable(supabase: SupabaseClient, jobDetails: AdapterJob) {

  const {
  ats_provider,
  tenant_slug,
  external_job_id,
  title,
  company_name,
  location,
  absolute_url,
  first_published,
  updated_at,
  requisition_id,
  content,
  raw_json,
} = jobDetails //jobFeatures is not in the jobs table so take it out

const jobInsert = {
  ats: ats_provider, // ats_provider in database
  tenant_slug,
  external_job_id,
  title,
  company_name,
  location,
  absolute_url,
  first_published,
  updated_at,
  requisition_id,
  content,
  raw_json,
}
  
  const { data: jobId, error } = await supabase
    .from('jobs')
    .upsert([jobInsert], { onConflict: 'ats,tenant_slug,external_job_id' }) // composite key either returns new key or reuse if duplicate
    .select('id'); 

  if (error) {
    console.error("Error during upsert:", error);
    return null; 
  }
  
  if (!jobId || jobId.length === 0) {
    console.error("Upsert succeeded but did not return an ID.");
    return null;
  }

  // jobId is an object array and will contain one object for id
  return jobId[0].id;
}


export async function InsertToJobUpdatesTable(supabase: SupabaseClient, job_Id: string, jobDetails: AdapterJob) {
    const { updated_at: incomingAtsUpdatedAt } = jobDetails;

    // 1. Fetch the job row (only need existing updated_at)
    const { data: jobRow, error: fetchError } = await supabase
        .from("jobs")
        .select("updated_at")
        .eq("id", job_Id)
        .single(); // Use single since we know the ID exists

    if (fetchError || !jobRow) {
        console.error("[updateJobTimeline] Failed to fetch job timeline data:", fetchError);
        return false;
    }

    const existingUpdatedAt = jobRow.updated_at;
    const incomingTime = new Date(incomingAtsUpdatedAt).getTime();
    const existingTime = new Date(existingUpdatedAt).getTime();

    // 2. Insert into job_updates ONLY if incoming is newer
    if (incomingTime > existingTime) {
      const { error: updateError } = await supabase
        .from("job_updates")
        .insert({
          job_id: job_Id,
          ats_updated_at: incomingAtsUpdatedAt
        });

      if (updateError) {
        console.error("[InsertToJobUpdates] Failed to insert job_update:", updateError);
      }
    }

  // Step 3: Always update last_seen
  const { error: seenError } = await supabase
    .from("jobs")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", job_Id);

  if (seenError) {
    console.error("[InsertToJobUpdates] Failed to update last_seen:", seenError);
  }
}




export async function InsertIntoJobFeaturesTable(supabase: SupabaseClient, jobFeatures:dbJobFeatures) {
  const { job_id, ...featureFields } = jobFeatures;

  const { error } = await supabase.from('job_features').upsert(
    [
       {
        job_id,
        ...featureFields,
       },
    ],
    { onConflict: 'job_id' }
  );
  
  if (error) {
    console.error("Error upserting job_features:", error);
  }
}

export async function InsertStructuredJobFeatures(supabase: SupabaseClient, job_Id: string, jobDetails: AdapterJob) {

  const featuresNormalized = await analyzeAdapterJob(jobDetails);

  const sanitized: dbJobFeatures = {
    job_id: job_Id,
    time_type: featuresNormalized.time_type ?? null,
    salary_min: featuresNormalized.salary_min ?? null,
    salary_mid: featuresNormalized.salary_mid ?? null,
    salary_max: featuresNormalized.salary_max ?? null,
    currency: featuresNormalized.currency ?? null,
    department: featuresNormalized.department ?? null,
    salary_source: featuresNormalized.salary_source ?? null,
  };

  await InsertIntoJobFeaturesTable(supabase, sanitized);
}

//This function is primarily for the job ingestion workflow
//Accepts jobDetails as input
//Gets the current user and job ID and Links them in user_job_check
//Returns a success flag
export async function InsertIntoUserJobCheckTable(supabase: SupabaseClient, user_Id: string, job_Id: string, job_ats_updated_at: string | null) {
  const { error } = await supabase.from('user_job_checks').upsert([
    {
      user_id: user_Id,
      job_id: job_Id,
      ats_updated_at: job_ats_updated_at,
    },
  ], { onConflict: 'user_id,job_id' });
  
  if (error) {
    console.error('Failed to link user to job:', error);
    return false;
  }
  
  return true;
}

/**
 * Get job from database by composite key
 * Returns job with features and updates table info
 */
export async function getJobByCompositeKey(
  supabase: SupabaseClient,
  ats: string,
  tenant_slug: string,
  external_job_id: string
) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`
      *,
      job_features(*),
      job_updates(*)
    `)
    .eq('ats', ats)
    .eq('tenant_slug', tenant_slug)
    .eq('external_job_id', external_job_id)
    .maybeSingle();
    
  if (error) {
    console.error("Error getting job by composite key:", error);
    return null;
  }
  
  return data;
}







