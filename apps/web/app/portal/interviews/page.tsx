import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import InterviewsClient from "./InterviewsClient";

export default async function InterviewsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select(`
      *,
      job_posts (
        id, title, company
      )
    `)
    .eq("job_seeker_id", user.id)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  const interviewIds = (interviews || []).map((i: { id: string }) => i.id);
  let prep: Record<string, unknown>[] = [];
  if (interviewIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("interview_prep")
      .select("*")
      .in("interview_id", interviewIds);
    prep = data || [];
  }

  const jobPostIds = (interviews || [])
    .map((i: { job_post_id?: string | null }) => i.job_post_id)
    .filter(Boolean) as string[];

  let resumeByJobPostId: Record<string, { url: string; source: string | null }> = {};
  if (jobPostIds.length > 0) {
    const { data: runResumes } = await supabaseAdmin
      .from("application_runs")
      .select("job_post_id, resume_url_used, resume_source, updated_at")
      .eq("job_seeker_id", user.id)
      .in("job_post_id", jobPostIds)
      .order("updated_at", { ascending: false });

    for (const row of runResumes || []) {
      if (row.job_post_id && row.resume_url_used && !resumeByJobPostId[row.job_post_id]) {
        resumeByJobPostId[row.job_post_id] = {
          url: row.resume_url_used,
          source: row.resume_source ?? null,
        };
      }
    }
  }

  return (
    <InterviewsClient
      initialInterviews={interviews || []}
      initialPrep={prep}
      resumeByJobPostId={resumeByJobPostId}
    />
  );
}
