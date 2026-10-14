"use client";

import { useState } from "react";
import { isUpcomingInterview } from "@/lib/portal/interview-bucketing";

interface JobPost {
  id: string;
  title: string | null;
  company: string | null;
}

interface Interview {
  id: string;
  job_post_id?: string | null;
  job_posts?: JobPost | JobPost[] | null;
  interview_type?: string;
  // Null until a time is actually booked (e.g. the AM has a scheduling link
  // but hasn't confirmed a slot yet) — a real interviews.scheduled_at state,
  // not an edge case.
  scheduled_at: string | null;
  status: string;
  meeting_link?: string | null;
  phone_number?: string | null;
  address?: string | null;
  notes_for_candidate?: string | null;
}

function getJobPost(jp: JobPost | JobPost[] | null | undefined): JobPost | null {
  if (!jp) return null;
  if (Array.isArray(jp)) return jp[0] || null;
  return jp;
}

interface PrepItem {
  id: string;
  interview_id: string;
  section_title?: string;
  content?: string;
}

export default function InterviewsClient({
  initialInterviews,
  initialPrep,
  resumeByJobPostId,
}: {
  initialInterviews: Interview[];
  initialPrep: Record<string, unknown>[];
  resumeByJobPostId: Record<string, { url: string; source: string | null }>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const upcoming = initialInterviews.filter((i) =>
    isUpcomingInterview(i.status, i.scheduled_at)
  );
  const past = initialInterviews.filter((i) => !upcoming.includes(i));

  const prepByInterview = (initialPrep as unknown as PrepItem[]).reduce(
    (acc, p) => {
      if (!acc[p.interview_id]) acc[p.interview_id] = [];
      acc[p.interview_id].push(p);
      return acc;
    },
    {} as Record<string, PrepItem[]>
  );

  const InterviewCard = ({ interview }: { interview: Interview }) => {
    const isExpanded = expandedId === interview.id;
    const prep = prepByInterview[interview.id] || [];
    const jobPost = getJobPost(interview.job_posts);
    const dateObj = interview.scheduled_at ? new Date(interview.scheduled_at) : null;
    const resume = interview.job_post_id
      ? resumeByJobPostId[interview.job_post_id]
      : null;

    return (
      <div className="bg-white rounded-lg shadow">
        <div
          className="p-5 cursor-pointer"
          onClick={() => setExpandedId(isExpanded ? null : interview.id)}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">
                {jobPost?.company || "Company pending"}
              </h3>
              <p className="text-sm text-gray-600">{jobPost?.title || "Role pending"}</p>
              {interview.interview_type && (
                <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800 capitalize">
                  {interview.interview_type}
                </span>
              )}
            </div>
            <div className="text-right">
              {dateObj ? (
                <>
                  <p className="text-sm font-medium text-gray-900">
                    {dateObj.toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </>
              ) : (
                <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">
                  Awaiting scheduled time
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {interview.meeting_link && (
              <a
                href={interview.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-violet-600 hover:text-violet-800"
              >
                Join Meeting
              </a>
            )}
            {!interview.meeting_link && interview.phone_number && (
              <span className="text-sm text-gray-600">
                Call: {interview.phone_number}
              </span>
            )}
            {!interview.meeting_link && !interview.phone_number && interview.address && (
              <span className="text-sm text-gray-600">{interview.address}</span>
            )}
            {resume?.url && (
              <a
                href={resume.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-purple-700 hover:text-purple-900"
              >
                Resume Used{resume.source ? ` (${resume.source === "TAILORED" ? "Tailored" : "Base"})` : ""}
              </a>
            )}
            {prep.length > 0 && (
              <span className="text-sm text-gray-500">
                {prep.length} prep section{prep.length !== 1 ? "s" : ""}
              </span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t px-5 py-4 space-y-4">
            {interview.notes_for_candidate && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
                <p className="text-sm text-gray-600">{interview.notes_for_candidate}</p>
              </div>
            )}
            {prep.length > 0 ? (
              prep.map((p) => (
                <div key={p.id}>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">
                    {p.section_title || "Prep Material"}
                  </h4>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {p.content || "No content yet."}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">
                No preparation materials available yet.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Interviews</h2>

      {initialInterviews.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No interviews scheduled yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Interviews will appear here as you progress through applications.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Upcoming</h3>
              <div className="space-y-3">
                {upcoming.map((i) => (
                  <InterviewCard key={i.id} interview={i} />
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Past</h3>
              <div className="space-y-3">
                {past.map((i) => (
                  <InterviewCard key={i.id} interview={i} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
