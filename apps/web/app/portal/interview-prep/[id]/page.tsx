import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import InterviewPrepDetail from "./InterviewPrepDetail";

export default async function InterviewPrepDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      *,
      job_posts ( title, company )
    `)
    .eq("id", params.id)
    .eq("job_seeker_id", user.id)
    .single();

  if (!prep) {
    redirect("/portal/interview-prep");
  }

  // Get videos
  const { data: videos } = await supabaseAdmin
    .from("interview_prep_videos")
    .select("*")
    .eq("interview_prep_id", params.id)
    .order("sort_order", { ascending: true });

  // Get practice sessions
  const { data: sessions } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("*")
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  // Get linked interview if any
  let interview: { scheduled_at: string | null; status: string } | null = null;
  if (prep.job_post_id) {
    const { data: iv } = await supabaseAdmin
      .from("interviews")
      .select("scheduled_at, status")
      .eq("job_seeker_id", user.id)
      .eq("job_post_id", prep.job_post_id)
      .in("status", ["confirmed", "pending_candidate"])
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    interview = iv;
  }

  return (
    <InterviewPrepDetail
      prep={prep}
      videos={videos ?? []}
      sessions={sessions ?? []}
      interview={interview}
      initialTab={typeof searchParams?.tab === "string" ? searchParams.tab : undefined}
    />
  );
}
