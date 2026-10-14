import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import Link from "next/link";

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Get all bookmarks with lesson + track info
  const { data: bookmarks } = await supabaseAdmin
    .from("learning_bookmarks")
    .select(`
      id,
      note,
      created_at,
      learning_lessons!inner (
        id,
        title,
        content_type,
        estimated_minutes,
        track_id,
        learning_tracks!inner (
          id,
          title
        )
      )
    `)
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  // Get progress for bookmarked lessons
  const lessonIds = (bookmarks ?? []).map(
    (b) => (b.learning_lessons as unknown as { id: string }).id
  );

  const { data: progress } = await supabaseAdmin
    .from("learning_progress")
    .select("lesson_id, status")
    .eq("job_seeker_id", user.id)
    .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["__none__"]);

  const progressMap = new Map(
    (progress ?? []).map((p) => [p.lesson_id, p])
  );

  type BookmarkItem = {
    id: string;
    note: string | null;
    bookmarked_at: string;
    lesson: { id: string; title: string; content_type: string; estimated_minutes: number; status: string };
    track: { id: string; title: string };
  };

  const items: BookmarkItem[] = (bookmarks ?? []).map((b) => {
    const lesson = b.learning_lessons as unknown as {
      id: string;
      title: string;
      content_type: string;
      estimated_minutes: number;
      track_id: string;
      learning_tracks: { id: string; title: string };
    };
    return {
      id: b.id,
      note: b.note,
      bookmarked_at: b.created_at,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        content_type: lesson.content_type,
        estimated_minutes: lesson.estimated_minutes,
        status: progressMap.get(lesson.id)?.status ?? "not_started",
      },
      track: {
        id: lesson.learning_tracks.id,
        title: lesson.learning_tracks.title,
      },
    };
  });

  // Group by track
  const byTrack = new Map<string, { track: { id: string; title: string }; items: BookmarkItem[] }>();
  for (const item of items) {
    const existing = byTrack.get(item.track.id);
    if (existing) {
      existing.items.push(item);
    } else {
      byTrack.set(item.track.id, { track: item.track, items: [item] });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bookmarks</h1>
        <Link
          href="/portal/learning"
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          &larr; Back to Learning
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">No bookmarks yet.</p>
          <p className="text-sm text-gray-400">
            Bookmark lessons while studying to find them here later.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(byTrack.values()).map(({ track, items: trackItems }) => (
            <div key={track.id}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {track.title}
              </h2>
              <div className="space-y-2">
                {trackItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/portal/learning/${item.track.id}`}
                    className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {item.lesson.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                            {item.lesson.content_type}
                          </span>
                          <span className="text-xs text-gray-400">
                            ~{item.lesson.estimated_minutes} min
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              item.lesson.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : item.lesson.status === "in_progress"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {item.lesson.status.replace("_", " ")}
                          </span>
                        </div>
                        {item.note && (
                          <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">
                            {item.note}
                          </p>
                        )}
                      </div>
                      <span className="text-yellow-500 flex-shrink-0">
                        <svg className="w-5 h-5" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                          />
                        </svg>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
