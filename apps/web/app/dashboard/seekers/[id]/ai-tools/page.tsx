import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import AiToolsClient, { type JobOption, type InterviewOption } from "./AiToolsClient";

interface PageProps {
  params: { id: string };
}

export default async function SeekerAiToolsPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am") redirect("/portal");

  const allowed = await hasJobSeekerAccess(user.id, params.id);
  if (!allowed) redirect("/dashboard");

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!seeker) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">Seeker not found.</p>
      </div>
    );
  }

  // Recent matches — used to populate the cover-letter job picker.
  type RawMatchRow = {
    job_post_id: string;
    score?: number | null;
    job_posts:
      | { title: string | null; company: string | null }
      | Array<{ title: string | null; company: string | null }>
      | null;
  };

  const { data: matchesRaw } = await supabaseAdmin
    .from("job_match_scores")
    .select("job_post_id, score, job_posts(title, company)")
    .eq("job_seeker_id", params.id)
    .order("score", { ascending: false })
    .limit(50);

  const matches = (matchesRaw ?? []) as unknown as RawMatchRow[];

  const jobOptions: JobOption[] = matches.map((row) => {
    const post = Array.isArray(row.job_posts) ? row.job_posts[0] : row.job_posts;
    return {
      id: row.job_post_id,
      title: post?.title ?? "(untitled)",
      company: post?.company ?? "—",
      score: typeof row.score === "number" ? row.score : null,
    };
  });

  // Interviews for this seeker.
  const { data: interviewsRaw } = await supabaseAdmin
    .from("interviews")
    .select("id, company, role, scheduled_at")
    .eq("job_seeker_id", params.id)
    .order("scheduled_at", { ascending: false })
    .limit(30);

  const interviewOptions: InterviewOption[] = (interviewsRaw ?? []).map((row) => ({
    id: row.id as string,
    company: (row.company as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    scheduled_at: (row.scheduled_at as string | null) ?? null,
  }));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <a
          href={`/dashboard/seekers/${params.id}`}
          className="text-sm text-violet-600 hover:text-violet-700 font-medium"
        >
          ← {seeker.full_name ?? seeker.email}
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">AI Tools</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generators that go through the HITL queue. Drafts persist as{" "}
          <code>ai_outputs</code> (pending) and surface for review at{" "}
          <a href="/dashboard/admin/ai-outputs" className="text-violet-600 hover:text-violet-700">
            /dashboard/admin/ai-outputs
          </a>
          .
        </p>
        <div className="mt-3 flex gap-2 text-xs">
          <a
            href={`/dashboard/seekers/${params.id}/timeline`}
            className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            → Timeline
          </a>
        </div>
      </div>

      <AiToolsClient
        seekerId={params.id}
        jobOptions={jobOptions}
        interviewOptions={interviewOptions}
      />
    </div>
  );
}
