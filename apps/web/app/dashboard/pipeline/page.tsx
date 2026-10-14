import { notFound } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import PipelineClient from "./PipelineClient";

async function loadPipelineSeekers(seekerIds: string[]) {
  const primary = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, match_threshold, resume_text, resume_template_id")
    .in("id", seekerIds);

  if (!primary.error) {
    return primary.data ?? [];
  }

  // Backward-compatible fallback for environments that have not added optional resume columns yet.
  const fallback = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, match_threshold")
    .in("id", seekerIds);

  if (fallback.error) {
    console.error("Failed to load pipeline seekers:", {
      primary: primary.error.message,
      fallback: fallback.error.message,
    });
    return [];
  }

  return (fallback.data ?? []).map((seeker) => ({
    ...seeker,
    resume_text: null,
    resume_template_id: null,
  }));
}

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") return notFound();

  const adminAccessAll = isAdminRole(user.role);

  let seekerIds: string[] = [];
  if (adminAccessAll) {
    const { data: allSeekers } = await supabaseAdmin
      .from("job_seekers")
      .select("id");

    seekerIds = (allSeekers || []).map((row) => row.id);
  } else {
    // AMs see only their assigned seekers.
    const { data: assignments } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", user.id);

    seekerIds = (assignments || []).map((a) => a.job_seeker_id);
  }

  if (seekerIds.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Job Hub</h1>
        <p className="text-gray-500">
          {adminAccessAll
            ? "No job seekers found."
            : "No job seekers assigned. Assign seekers to get started."}
        </p>
      </div>
    );
  }

  // Fetch seeker profiles (with compatibility fallback for optional columns).
  const seekers = await loadPipelineSeekers(seekerIds);

  // Fetch match scores across all seekers (exclude archived/cleaned matches so
  // the active Job Hub reflects the weekly cleaner + retention).
  const { data: matchScores } = await supabaseAdmin
    .from("job_match_scores")
    .select(`
      id, score, recommendation, reasons, created_at, job_seeker_id,
      job_posts (id, title, company, location, url, salary_min, salary_max, required_skills, preferred_skills, description_text)
    `)
    .in("job_seeker_id", seekerIds)
    .is("archived_at", null)
    .order("score", { ascending: false })
    .limit(500);

  const { count: availableJobsCount } = await supabaseAdmin
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  // Fetch routing decisions
  const { data: routingDecisions } = await supabaseAdmin
    .from("job_routing_decisions")
    .select("job_post_id, job_seeker_id, decision, note")
    .in("job_seeker_id", seekerIds);

  // Fetch queue items
  const { data: queueItems } = await supabaseAdmin
    .from("application_queue")
    .select(`
      id, status, category, created_at, updated_at, last_error, job_seeker_id, job_post_id,
      job_posts (id, title, company, location, url, salary_min, salary_max, required_skills, preferred_skills, description_text),
      job_seekers (id, full_name)
    `)
    .in("job_seeker_id", seekerIds)
    .order("created_at", { ascending: false });

  // Fetch application runs
  const { data: runRows } = await supabaseAdmin
    .from("application_runs")
    .select(`
      id, status, current_step, last_error, ats_type, needs_attention_reason, created_at, updated_at, job_seeker_id, job_post_id, queue_id
    `)
    .in("job_seeker_id", seekerIds)
    .order("updated_at", { ascending: false });

  const runJobPostIds = Array.from(
    new Set((runRows ?? []).map((run) => run.job_post_id).filter(Boolean))
  );
  const runJobPostMap = new Map<
    string,
    { id: string; title: string; company: string | null; location: string | null; url: string }
  >();
  if (runJobPostIds.length > 0) {
    const { data: runJobPosts } = await supabaseAdmin
      .from("job_posts")
      .select("id, title, company, location, url")
      .in("id", runJobPostIds);
    for (const post of runJobPosts ?? []) {
      runJobPostMap.set(post.id, {
        id: post.id,
        title: post.title,
        company: post.company ?? null,
        location: post.location ?? null,
        url: post.url,
      });
    }
  }

  const seekerMap = new Map(
    (seekers ?? []).map((seeker) => [
      seeker.id,
      { id: seeker.id, full_name: seeker.full_name ?? null },
    ])
  );
  const runs = (runRows ?? []).map((run) => ({
    ...run,
    job_posts: run.job_post_id ? runJobPostMap.get(run.job_post_id) ?? null : null,
    job_seekers: seekerMap.get(run.job_seeker_id) ?? null,
  }));

  // Fetch outreach contacts
  const { data: outreachContacts } = await supabaseAdmin
    .from("outreach_contacts")
    .select("id, role, full_name, email, job_post_id, job_seeker_id")
    .in("job_seeker_id", seekerIds);

  // Fetch outreach drafts
  const { data: outreachDrafts } = await supabaseAdmin
    .from("outreach_drafts")
    .select(`
      id, subject, body, status, created_at, sent_at, job_seeker_id,
      job_posts (id, title, company),
      outreach_contacts (id, full_name, email, role)
    `)
    .in("job_seeker_id", seekerIds)
    .order("created_at", { ascending: false });

  // Fetch tailored resumes
  const { data: tailoredResumes } = await supabaseAdmin
    .from("tailored_resumes")
    .select("id, job_seeker_id, job_post_id, tailored_text, changes_summary, tailored_data, template_id, resume_url")
    .in("job_seeker_id", seekerIds);

  return (
    <PipelineClient
      seekers={(seekers || []) as Parameters<typeof PipelineClient>[0]["seekers"]}
      matchScores={(matchScores || []) as unknown as Parameters<typeof PipelineClient>[0]["matchScores"]}
      availableJobsCount={availableJobsCount ?? 0}
      routingDecisions={(routingDecisions || []) as Parameters<typeof PipelineClient>[0]["routingDecisions"]}
      queueItems={(queueItems || []) as unknown as Parameters<typeof PipelineClient>[0]["queueItems"]}
      runs={runs as unknown as Parameters<typeof PipelineClient>[0]["runs"]}
      outreachContacts={(outreachContacts || []) as Parameters<typeof PipelineClient>[0]["outreachContacts"]}
      outreachDrafts={(outreachDrafts || []) as unknown as Parameters<typeof PipelineClient>[0]["outreachDrafts"]}
      tailoredResumes={(tailoredResumes || []) as Parameters<typeof PipelineClient>[0]["tailoredResumes"]}
    />
  );
}
