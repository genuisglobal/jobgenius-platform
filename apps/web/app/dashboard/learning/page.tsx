import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LearningTracksPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: tracks } = await supabaseServer
    .from("learning_tracks")
    .select(`
      *,
      job_seekers ( id, full_name, email ),
      job_posts ( id, title, company ),
      learning_lessons ( id )
    `)
    .eq("account_manager_id", user.id)
    .order("updated_at", { ascending: false });

  // Group tracks by seeker
  const seekerMap = new Map<
    string,
    {
      seeker: { id: string; full_name: string | null; email: string | null };
      tracks: typeof tracks;
    }
  >();

  for (const track of tracks ?? []) {
    const seeker = track.job_seekers as { id: string; full_name: string | null; email: string | null } | null;
    if (!seeker) continue;
    if (!seekerMap.has(seeker.id)) {
      seekerMap.set(seeker.id, { seeker, tracks: [] });
    }
    seekerMap.get(seeker.id)!.tracks!.push(track);
  }
  const seekerGroups: Array<{
    seeker: { id: string; full_name: string | null; email: string | null };
    tracks: typeof tracks;
  }> = [];
  seekerMap.forEach((value) => {
    seekerGroups.push(value);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learning Tracks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage learning tracks for your job seekers
          </p>
        </div>
        <Link
          href="/dashboard/learning/create"
          className="px-4 py-2.5 sm:py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors text-center"
        >
          Create Track
        </Link>
      </div>

      {seekerMap.size === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">No learning tracks yet.</p>
          <p className="text-sm text-gray-400">
            Create a learning track for one of your assigned job seekers to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {seekerGroups.map(({ seeker, tracks: seekerTracks }) => (
            <div key={seeker.id}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                {seeker.full_name || seeker.email}
              </h2>
              <div className="space-y-3">
                {(seekerTracks ?? []).map((track) => {
                  const lessons = (track.learning_lessons as { id: string }[]) ?? [];
                  const jobPost = track.job_posts as { title: string; company: string | null } | null;
                  return (
                    <Link
                      key={track.id}
                      href={`/dashboard/learning/${track.id}`}
                      className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {track.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              track.status === "published"
                                ? "bg-green-100 text-green-700"
                                : track.status === "archived"
                                ? "bg-gray-100 text-gray-500"
                                : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {track.status}
                            </span>
                            <span className="text-xs text-gray-400">
                              {track.category}
                            </span>
                            <span className="text-xs text-gray-400">
                              {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
                            </span>
                            {track.creation_mode && (
                              <span className="text-xs text-gray-400">
                                {String(track.creation_mode).replace(/_/g, " ")}
                              </span>
                            )}
                            {track.target_skill && (
                              <span className="text-xs text-violet-600">
                                Focus: {track.target_skill}
                              </span>
                            )}
                            {jobPost && (
                              <span className="text-xs text-gray-400 truncate max-w-[150px] sm:max-w-none">
                                {jobPost.title}{jobPost.company ? ` @ ${jobPost.company}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(track.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
