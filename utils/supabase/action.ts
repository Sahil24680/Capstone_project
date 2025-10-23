"use server";
import { createClient } from "./server";
import { redirect } from "next/navigation";
import type { AdapterJob } from "@/lib/adapters/types";   
import type { dbJobFeatures } from "@/lib/db/jobFeatures.ts";   
import {analyzeAdapterJob} from "@/lib/nlp/client";

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



export async function insertIntoJobTable(jobDetails: AdapterJob) {

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

  const supabase = await createClient()
  
  const { data: jobId, error } = await supabase
    .from('jobs')
    .upsert([jobInsert], { onConflict: 'ats,tenant_slug,external_job_id' }) // composite key either returns new key or reuse if duplicate
    .select('id'); 

  if (error) {
    console.error("Error during upsert:", error);
    return null; // Return null or handle the error
  }

  // jobId is an object array and will contain one object for now Id (subject to change)
  return jobId[0].id;
}


export async function InsertToJobUpdatesTable(jobDetails: AdapterJob) {
  const supabase = await createClient();

  const {
    ats_provider,
    tenant_slug,
    external_job_id,
    updated_at: incomingAtsUpdatedAt,
  } = jobDetails;

  // Step 1: Fetch the job row
  const { data: jobRow, error: fetchError } = await supabase
    .from("jobs")
    .select("id, updated_at")
    .eq("ats", ats_provider)
    .eq("tenant_slug", tenant_slug)
    .eq("external_job_id", external_job_id)
    .maybeSingle();

  if (fetchError || !jobRow) {
    console.error("[InsertToJobUpdates] Failed to fetch job:", fetchError);
    return null;
  }

  const jobId = jobRow.id;
  const existingUpdatedAt = jobRow.updated_at;
  const incomingTime = new Date(incomingAtsUpdatedAt).getTime();
  const existingTime = new Date(existingUpdatedAt).getTime();

  // Step 2: Insert into job_updates if incoming is older
  if (incomingTime < existingTime) {
    const { error: updateError } = await supabase
      .from("job_updates")
      .insert({
        job_id: jobId,
        ats_updated_at: incomingAtsUpdatedAt,
        seen_at: new Date().toISOString(),
      });

    if (updateError) {
      console.error("[InsertToJobUpdates] Failed to insert job_update:", updateError);
    }
  }

  // Step 3: Always update last_seen
  const { error: seenError } = await supabase
    .from("jobs")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", jobId);

  if (seenError) {
    console.error("[InsertToJobUpdates] Failed to update last_seen:", seenError);
  }

  return jobId;
}



export async function InsertIntoJobFeaturesTable(jobFeatures:dbJobFeatures) {
  const supabase = await createClient()


    const { job_id, ...featureFields } = jobFeatures

  await supabase.from('job_features').upsert(
      [
        {
          job_id,
          ...featureFields,
        },
      ],
      { onConflict: 'job_id' }
    )
}

export async function InsertStructuredJobFeatures(jobDetails: AdapterJob) {
  const jobId = await insertIntoJobTable(jobDetails);

  const featuresNormalized = await analyzeAdapterJob(jobDetails);

  const sanitized: dbJobFeatures = {
    job_id: jobId,
    time_type: featuresNormalized.time_type ?? null,
    salary_min: featuresNormalized.salary_min ?? null,
    salary_mid: featuresNormalized.salary_mid ?? null,
    salary_max: featuresNormalized.salary_max ?? null,
    currency: featuresNormalized.currency ?? null,
    department: featuresNormalized.department ?? null,
    salary_source: featuresNormalized.salary_source ?? null,
  };

  await InsertIntoJobFeaturesTable(sanitized);

  return jobId;
}

//This function is primarily for the job ingestion workflow
//Accepts jobDetails as input
//Gets the current user and job ID and Links them in user_job_check
//Returns a success flag

export async function InsertIntoUserJobCheckTable(jobDetails: AdapterJob) {
  const supabase = await createClient()
  const jobId = await insertIntoJobTable(jobDetails)
  const user = await getUser()

  if (!jobId || 'error' in user) {
    console.error('Failed to link user to job:', jobId, user)
    return false
  }

  await supabase.from('user_job_check').upsert([
    {
      user_id: user.id,
      job_id: jobId,
    },
  ], { onConflict: 'user_id,job_id' })

  return true
}


//If the job is new, it gets inserted and linked.
//If the job already exists, it just links the current user.
//Won’t get duplicate jobs or links.
export async function saveJobFromDetails(jobDetails: AdapterJob) {
  const jobId = await insertIntoJobTable(jobDetails)
  const user = await getUser()

  if (!jobId || 'error' in user) {
    console.error('Failed to save job:', jobId, user)
    return false
  }

  return await SaveJob(user.id, jobId)
}


// Link an existing job to a user (saving a job)
export async function SaveJob(userId: string, jobId: string) {
  const supabase = await createClient()

  await supabase.from('user_job_check').upsert([
    {
      user_id: userId,
      job_id: jobId,
    },
  ], { onConflict: 'user_id,job_id' })

}

export async function unsaveJob(userId: string, jobId: string) {
  const supabase = await createClient()
  return await supabase
    .from('user_job_check')
    .delete()
    .eq('user_id', userId)
    .eq('job_id', jobId)
}

export async function getSavedJobs(userId: string) {
  const supabase = await createClient()
  return await supabase
    .from('user_job_check')
    .select('job_id, jobs(*)')
    .eq('user_id', userId)
}
