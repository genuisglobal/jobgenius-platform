import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

// Archived Job Hub jobs. The retention job archives a job ~2 weeks after it was
// discovered and permanently deletes it ~2 weeks after that (unless it has an
// application/queue reference). This is the read-only window into that archive.

interface ArchivedJob {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  archived_at: string | null;
  created_at: string | null;
}

function daysUntilDelete(archivedAt: string | null): number | null {
  if (!archivedAt) return null;
  const deleteAt = new Date(archivedAt).getTime() + 14 * 86400000;
  return Math.max(0, Math.ceil((deleteAt - Date.now()) / 86400000));
}

export default async function ArchivedJobsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") redirect("/dashboard");

  const { data } = await supabaseAdmin
    .from("job_posts")
    .select("id, title, company, location, url, archived_at, created_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(200);

  const jobs = (data ?? []) as ArchivedJob[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Archived Jobs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Jobs archived from the Job Hub. They&apos;re permanently deleted ~2 weeks after
            archival unless they have an application on record.
          </p>
        </div>
        <Link
          href="/dashboard/pipeline"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Back to Job Hub
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No archived jobs.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Archived</th>
                <th className="px-4 py-2 font-medium">Deletes in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => {
                const days = daysUntilDelete(job.archived_at);
                return (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-violet-700 hover:underline"
                      >
                        {job.title || "Untitled"}
                      </a>
                      {job.company ? (
                        <span className="text-gray-400"> · {job.company}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{job.location ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {job.archived_at ? new Date(job.archived_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {days === null ? (
                        <span className="text-gray-400">—</span>
                      ) : days === 0 ? (
                        <span className="font-medium text-red-600">soon</span>
                      ) : (
                        <span className={days <= 3 ? "text-orange-600" : "text-gray-600"}>
                          {days} day{days === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
