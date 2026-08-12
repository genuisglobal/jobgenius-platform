"use client";

import { useState, useEffect } from "react";

interface Achievement {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

interface ProgressData {
  profile_completion: number;
  sections: Record<string, boolean>;
  xp_points: number;
  level: string;
  achievements: Achievement[];
  stats: {
    references: number;
    answers: number;
    resumes: number;
    applications: number;
    interviews: number;
  };
}

const SECTION_LABELS: Record<string, string> = {
  basic_info: "Basic Info",
  phone: "Phone Number",
  location: "Location",
  address: "Mailing Address",
  linkedin: "LinkedIn",
  seniority: "Seniority Level",
  work_type: "Work Type",
  salary: "Salary Range",
  target_titles: "Target Titles",
  skills: "Skills",
  work_history: "Work History",
  education: "Education",
};

const LEVEL_THRESHOLDS = [
  { name: "Newcomer", min: 0 },
  { name: "Active Seeker", min: 100 },
  { name: "Job Hunter", min: 250 },
  { name: "Career Pro", min: 500 },
];

export default function ProgressClient() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/progress")
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch((err) => console.error("[progress] fetch progress failed:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
          <div className="h-48 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-500">Failed to load progress data.</p>
      </div>
    );
  }

  const currentLevelIdx = LEVEL_THRESHOLDS.findLastIndex(
    (l) => data.xp_points >= l.min
  );
  const nextLevel = LEVEL_THRESHOLDS[currentLevelIdx + 1];
  const currentLevelMin = LEVEL_THRESHOLDS[currentLevelIdx]?.min ?? 0;
  const xpToNext = nextLevel ? nextLevel.min - data.xp_points : 0;
  const levelProgress = nextLevel
    ? ((data.xp_points - currentLevelMin) / (nextLevel.min - currentLevelMin)) * 100
    : 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Your Progress</h2>

      {/* Level + XP */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{data.level}</h3>
            <p className="text-sm text-gray-500">{data.xp_points} XP</p>
          </div>
          {nextLevel && (
            <p className="text-sm text-gray-500">
              {xpToNext} XP to {nextLevel.name}
            </p>
          )}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-violet-500 to-purple-500 h-3 rounded-full transition-all"
            style={{ width: `${Math.min(levelProgress, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          {LEVEL_THRESHOLDS.map((l) => (
            <span
              key={l.name}
              className={data.xp_points >= l.min ? "text-violet-600 font-medium" : ""}
            >
              {l.name}
            </span>
          ))}
        </div>
      </div>

      {/* Profile Completion Ring */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Completion</h3>
        <div className="flex items-center gap-8">
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18" cy="18" r="15.915"
                fill="none" stroke="#e5e7eb" strokeWidth="2.5"
              />
              <circle
                cx="18" cy="18" r="15.915"
                fill="none"
                stroke={data.profile_completion === 100 ? "#22c55e" : "#8b5cf6"}
                strokeWidth="2.5"
                strokeDasharray={`${data.profile_completion} ${100 - data.profile_completion}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-900">
              {data.profile_completion}%
            </span>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2">
            {Object.entries(data.sections).map(([key, done]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                {done ? (
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                <span className={done ? "text-gray-900" : "text-gray-400"}>
                  {SECTION_LABELS[key] || key}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Achievements</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.achievements.map((a) => (
            <div
              key={a.key}
              className={`p-4 rounded-lg border-2 ${
                a.unlocked
                  ? "border-yellow-300 bg-yellow-50"
                  : "border-gray-200 bg-gray-50 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {a.unlocked ? (
                    {
                      profile_pioneer: "🌟",
                      resume_ready: "📄",
                      reference_champion: "🏆",
                      answer_master: "💬",
                      application_starter: "🚀",
                      interview_pro: "🎤",
                      fully_loaded: "👑",
                    }[a.key] || "🏅"
                  ) : (
                    "🔒"
                  )}
                </span>
                <div>
                  <p className="font-medium text-gray-900">{a.label}</p>
                  <p className="text-sm text-gray-500">{a.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Stats</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          {[
            { label: "References", value: data.stats.references },
            { label: "Q&A Answers", value: data.stats.answers },
            { label: "Resumes", value: data.stats.resumes },
            { label: "Applications", value: data.stats.applications },
            { label: "Interviews", value: data.stats.interviews },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
