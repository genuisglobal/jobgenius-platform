import { supabaseServer } from "@/lib/supabase/server";

export type BackgroundJobType =
  | "AUTO_MATCH_JOB_POST"
  | "AUTO_MATCH_JOB_POSTS"
  | "TAILOR_RESUME"
  | "AUTO_START_RUN"
  | "AUTO_OUTREACH"
  | "SCAN_INBOX"
  | "INTERVIEW_PREP_READY"
  | "MATCH_NETWORK_CONTACTS"
  | "VOICE_DISPATCH"
  | "VOICE_RETRY"
  | "VOICE_FOLLOWUP"
  | "DIAGNOSE_FAILURE";

export type BackgroundJobPayload = {
  job_post_id?: string;
  job_post_ids?: string[];
  am_id?: string | null;
  job_seeker_id?: string;
  interview_id?: string;
  queue_id?: string;
  contact_ids?: string[];
  network_contact_id?: string;
  voice_call_id?: string;
  lead_submission_id?: string;
  call_type?: string;
  run_id?: string;
};

type EnqueueOptions = {
  runAt?: Date;
  maxAttempts?: number;
};

export async function enqueueBackgroundJob(
  type: BackgroundJobType,
  payload: BackgroundJobPayload,
  options?: EnqueueOptions
) {
  const nowIso = new Date().toISOString();
  const runAtIso = options?.runAt?.toISOString() ?? nowIso;

  const { data, error } = await supabaseServer
    .from("background_jobs")
    .insert({
      type,
      payload,
      status: "QUEUED",
      run_at: runAtIso,
      max_attempts: options?.maxAttempts ?? 3,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
