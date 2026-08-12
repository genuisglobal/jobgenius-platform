import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDueReviewQueue } from "@/lib/learning/review-queue";

function prettifySkill(skillSlug: string | null) {
  if (!skillSlug) {
    return null;
  }

  return skillSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function LearningReviewQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { items, summary } = await getDueReviewQueue(user.id);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Work through due refresh lessons before they fade further.
          </p>
        </div>
        <Link
          href="/portal/learning"
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          &larr; Back to Learning
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard label="Due Now" value={summary.totalItems} />
        <StatCard label="Tracks" value={summary.totalTracks} />
        <StatCard
          label="Mastery Avg"
          value={summary.masteryAverage !== null ? `${summary.masteryAverage}%` : "N/A"}
        />
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">No reviews are due right now.</p>
          <p className="text-sm text-gray-400">
            Keep studying and your next scheduled refresh will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={`${item.track.id}:${item.lessonId}`}
              href={`/portal/learning/${item.track.id}?lessonId=${item.lessonId}`}
              className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-amber-700 px-2 py-0.5 bg-amber-50 rounded">
                      Due review
                    </span>
                    <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
                      {item.contentType}
                    </span>
                    {item.track.targetSkill && (
                      <span className="text-xs text-violet-600 px-2 py-0.5 bg-violet-50 rounded">
                        {item.track.targetSkill}
                      </span>
                    )}
                    {item.skillSlug && (
                      <span className="text-xs text-gray-500">
                        {prettifySkill(item.skillSlug)}
                      </span>
                    )}
                  </div>

                  <h2 className="text-base font-semibold text-gray-900 mt-2 truncate">
                    {item.lessonTitle}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {item.track.title}
                    {item.track.jobPost?.title
                      ? ` - ${item.track.jobPost.title}${
                          item.track.jobPost.company
                            ? ` @ ${item.track.jobPost.company}`
                            : ""
                        }`
                      : ""}
                  </p>

                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                    <span>~{item.estimatedMinutes} min</span>
                    <span>Review stage {item.reviewStage}</span>
                    {item.quizScore !== null && <span>Latest quiz {item.quizScore}%</span>}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  {item.masteryScore !== null && (
                    <p className="text-sm font-bold text-gray-900">
                      {item.masteryScore}%
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {item.nextReviewAt
                      ? new Date(item.nextReviewAt).toLocaleDateString()
                      : "Now"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
