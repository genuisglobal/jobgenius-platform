"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { labelizePeopleValue, type ScorecardCategory } from "@/lib/people";

interface ScorecardRecord {
  id: string;
  review_month: string;
  status: string;
  final_total: number;
  overall_comments: string | null;
  reviewed_at: string | null;
  acknowledged_at: string | null;
  items: Array<{
    id: string;
    numeric_score: number;
    manager_comments: string | null;
    evidence_notes: string | null;
    attachment_url: string | null;
    category: ScorecardCategory | null;
  }>;
}

interface LeadershipRecord {
  id: string;
  review_month: string;
  average_score: number | null;
  auto_flagged: boolean;
  has_blocking_issue: boolean;
  status: string;
  notes: string | null;
}

function formatDate(value: string | null, withTime = false): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function getStatusTone(status: string): string {
  switch (status) {
    case "acknowledged":
      return "bg-emerald-100 text-emerald-700";
    case "finalized":
      return "bg-violet-100 text-violet-700";
    case "submitted":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function PerformanceReviewsClient({
  employeeName,
  leadershipStatus,
  scorecards: initialScorecards,
  leadershipRecords: initialLeadershipRecords,
}: {
  employeeName: string;
  leadershipStatus: string;
  scorecards: ScorecardRecord[];
  leadershipRecords: LeadershipRecord[];
}) {
  const router = useRouter();
  const [scorecards, setScorecards] = useState(initialScorecards);
  const [leadershipRecords, setLeadershipRecords] = useState(initialLeadershipRecords);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    setScorecards(initialScorecards);
  }, [initialScorecards]);

  useEffect(() => {
    setLeadershipRecords(initialLeadershipRecords);
  }, [initialLeadershipRecords]);

  const latestScorecard = scorecards[0] ?? null;
  const acknowledgedCount = scorecards.filter(
    (scorecard) => scorecard.status === "acknowledged"
  ).length;
  const averageLastThree = useMemo(() => {
    if (!scorecards.length) return null;
    const recent = scorecards
      .filter((scorecard) => scorecard.status === "finalized" || scorecard.status === "acknowledged")
      .slice(0, 3);
    if (!recent.length) return null;
    return Math.round(
      (recent.reduce((sum, scorecard) => sum + (Number(scorecard.final_total) || 0), 0) /
        recent.length) *
        100
    ) / 100;
  }, [scorecards]);
  const latestLeadershipRecord = leadershipRecords[0] ?? null;

  async function acknowledgeScorecard(id: string) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/me/employee/scorecards/${id}/acknowledge`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "Failed to acknowledge scorecard.",
        });
        return;
      }
      setMessage({ type: "success", text: "Scorecard acknowledged." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Scorecards</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review your monthly performance history, track leadership readiness, and
          acknowledge finalized reviews.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Latest total
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">
            {latestScorecard ? `${latestScorecard.final_total}%` : "n/a"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Acknowledged
          </p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">{acknowledgedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Last 3 average
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">
            {averageLastThree !== null ? `${averageLastThree}%` : "n/a"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Leadership status
          </p>
          <p className="text-lg font-bold text-gray-900 mt-2">
            {labelizePeopleValue(leadershipStatus)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="space-y-4">
          {scorecards.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
              No scorecards have been posted yet.
            </div>
          ) : (
            scorecards.map((scorecard) => (
              <div
                key={scorecard.id}
                className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {employeeName} - {scorecard.review_month}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Reviewed {formatDate(scorecard.reviewed_at, true)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusTone(
                        scorecard.status
                      )}`}
                    >
                      {labelizePeopleValue(scorecard.status)}
                    </span>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {scorecard.final_total}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {scorecard.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {item.category?.label || "Category"}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Score: {item.numeric_score}%
                          </p>
                        </div>
                        {item.attachment_url && (
                          <a
                            href={item.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-violet-600 hover:text-violet-700"
                          >
                            Reference
                          </a>
                        )}
                      </div>
                      {(item.manager_comments || item.evidence_notes) && (
                        <div className="mt-3 space-y-2 text-sm text-gray-600">
                          {item.manager_comments && <p>{item.manager_comments}</p>}
                          {item.evidence_notes && (
                            <p className="text-xs text-gray-500">{item.evidence_notes}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {scorecard.overall_comments && (
                  <p className="text-sm text-gray-600">{scorecard.overall_comments}</p>
                )}

                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-gray-400">
                    Acknowledged {formatDate(scorecard.acknowledged_at, true)}
                  </p>
                  {scorecard.status === "finalized" && !scorecard.acknowledged_at && (
                    <button
                      onClick={() => acknowledgeScorecard(scorecard.id)}
                      disabled={busyId === scorecard.id}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {busyId === scorecard.id ? "Acknowledging..." : "Acknowledge review"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900">Leadership readiness</h2>
            <p className="text-sm text-gray-500 mt-1">
              JobGenuis flags leadership potential from consistent scorecards plus clean
              conduct, not from one strong month alone.
            </p>
            {latestLeadershipRecord ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-violet-50 border border-violet-100 p-4">
                  <p className="text-xs uppercase tracking-wide text-violet-600">
                    Latest evaluation
                  </p>
                  <p className="text-lg font-semibold text-violet-900 mt-1">
                    {labelizePeopleValue(latestLeadershipRecord.status)}
                  </p>
                  <p className="text-sm text-violet-800 mt-2">
                    {latestLeadershipRecord.notes || "No leadership note recorded yet."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Review month
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {latestLeadershipRecord.review_month}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Average score
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {latestLeadershipRecord.average_score !== null
                        ? `${latestLeadershipRecord.average_score}%`
                        : "n/a"}
                    </p>
                  </div>
                </div>
                {latestLeadershipRecord.has_blocking_issue && (
                  <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-700">
                    An active conduct or integrity blocker is currently preventing automatic
                    leadership promotion.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-6 text-sm text-gray-500">
                Leadership readiness will appear here once scorecard history exists.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
