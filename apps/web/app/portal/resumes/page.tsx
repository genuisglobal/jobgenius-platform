import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

// Read-only transparency into the resume-optimization service the client is
// paying for (per the Client Collaboration Agreement): their base resume plus
// the versions JobGenius tailors for each application.

interface TailoredRow {
  id: string;
  job_post_id: string | null;
  changes_summary: string | null;
  resume_url: string | null;
  updated_at: string | null;
  job_posts: { title: string | null; company: string | null } | null;
}

function summaryLines(summary: string | null): string[] {
  if (!summary) return [];
  return summary
    .split(/\n|•|^- |(?<=\.)\s+(?=[A-Z])/gm)
    .map((s) => s.replace(/^[-•\s]+/, "").trim())
    .filter((s) => s.length > 3)
    .slice(0, 5);
}

export default async function ResumesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("resume_url, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: tailoredRows } = await supabaseAdmin
    .from("tailored_resumes")
    .select("id, job_post_id, changes_summary, resume_url, updated_at, job_posts(title, company)")
    .eq("job_seeker_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  const tailored = (tailoredRows ?? []) as unknown as TailoredRow[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Your Resumes</h1>
        <p className="mt-1 text-sm text-gray-500">
          JobGenius optimizes your resume and tailors a version for each application so it matches the
          role and passes automated screening.
        </p>
      </div>

      {/* Base resume */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Base resume</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              The optimized master we tailor from for every job.
            </p>
          </div>
          {seeker?.resume_url ? (
            <a
              href={seeker.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              View
            </a>
          ) : (
            <span className="text-xs text-gray-400">Not uploaded yet</span>
          )}
        </div>
      </div>

      {/* Tailored versions */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Tailored for your applications ({tailored.length})
        </h2>

        {tailored.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No tailored versions yet. As JobGenius applies to roles for you, a job-specific resume is
            created for each one and will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {tailored.map((t) => {
              const lines = summaryLines(t.changes_summary);
              return (
                <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {t.job_posts?.title ?? "Tailored resume"}
                        {t.job_posts?.company ? (
                          <span className="font-normal text-gray-400"> · {t.job_posts.company}</span>
                        ) : null}
                      </p>
                      {t.updated_at ? (
                        <p className="mt-0.5 text-xs text-gray-400">
                          Updated {new Date(t.updated_at).toLocaleDateString()}
                        </p>
                      ) : null}
                    </div>
                    {t.resume_url ? (
                      <a
                        href={t.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                      >
                        View PDF
                      </a>
                    ) : null}
                  </div>

                  {lines.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="text-xs font-medium text-gray-500">What we adjusted</p>
                      <ul className="mt-1 space-y-1">
                        {lines.map((line, i) => (
                          <li key={i} className="flex gap-2 text-xs text-gray-600">
                            <span className="mt-0.5 text-violet-500">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
