"use client";

import { useState } from "react";
import MultiCheckbox from "../../components/MultiCheckbox";
import type { ProfileData } from "../OnboardingWizard";

const SENIORITY_OPTIONS = [
  { value: "entry", label: "Entry Level" },
  { value: "mid", label: "Mid Level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP" },
  { value: "c-level", label: "C-Level" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "temporary", label: "Temporary" },
];

const INDUSTRY_OPTIONS = [
  { value: "technology", label: "Technology" },
  { value: "finance", label: "Finance & Banking" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "retail", label: "Retail & E-Commerce" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "consulting", label: "Consulting" },
  { value: "media", label: "Media & Entertainment" },
  { value: "government", label: "Government" },
  { value: "nonprofit", label: "Non-Profit" },
  { value: "real-estate", label: "Real Estate" },
  { value: "energy", label: "Energy & Utilities" },
];

export default function JobPreferencesStep({
  profile,
  update,
  saving,
  saveFields,
  onContinue,
  onBack,
}: {
  profile: ProfileData;
  update: (key: keyof ProfileData, value: unknown) => void;
  saving: boolean;
  saveFields: (fields: Partial<ProfileData>) => Promise<boolean>;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [titleInput, setTitleInput] = useState("");
  const [skillInput, setSkillInput] = useState("");

  const addTitle = () => {
    const t = titleInput.trim();
    if (t && !(profile.target_titles || []).includes(t)) {
      update("target_titles", [...(profile.target_titles || []), t]);
    }
    setTitleInput("");
  };

  const removeTitle = (title: string) => {
    update("target_titles", (profile.target_titles || []).filter((t) => t !== title));
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !(profile.skills || []).includes(s)) {
      update("skills", [...(profile.skills || []), s]);
    }
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    update("skills", (profile.skills || []).filter((s) => s !== skill));
  };

  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    const ok = await saveFields({
      seniority: profile.seniority,
      target_titles: profile.target_titles,
      skills: profile.skills,
      preferred_industries: profile.preferred_industries,
      employment_type_preferences: profile.employment_type_preferences,
    });
    if (ok) onContinue();
    else setError("Couldn't save your changes. Please check your connection and try again.");
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Job Preferences</h2>
      <p className="text-sm text-gray-600 mb-6">Help us find the right roles for you.</p>

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-6">
        <p className="text-sm text-violet-800">
          Add 3-5 target job titles to maximize matches. Be specific &mdash; &quot;Senior Frontend Engineer&quot; works better than just &quot;Engineer&quot;.
        </p>
      </div>

      <div className="space-y-5">
        {/* Seniority */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Seniority Level</label>
          <select
            value={profile.seniority || ""}
            onChange={(e) => update("seniority", e.target.value)}
            className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          >
            <option value="">Select...</option>
            {SENIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Target Titles */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Target Job Titles</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTitle())}
              placeholder="Add a target title..."
              className="flex-1 px-3 py-2 border border-gray-400 bg-white text-gray-900 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
            <button onClick={addTitle} className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200">Add</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(profile.target_titles || []).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-3 py-1 bg-violet-100 text-violet-800 rounded-full text-sm">
                {t}<button onClick={() => removeTitle(t)} className="hover:text-violet-600">&times;</button>
              </span>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Skills</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
              placeholder="Add a skill..."
              className="flex-1 px-3 py-2 border border-gray-400 bg-white text-gray-900 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
            <button onClick={addSkill} className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200">Add</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(profile.skills || []).map((s) => (
              <span key={s} className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                {s}<button onClick={() => removeSkill(s)} className="hover:text-green-600">&times;</button>
              </span>
            ))}
          </div>
        </div>

        {/* Industries */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Preferred Industries</label>
          <MultiCheckbox
            options={INDUSTRY_OPTIONS}
            selected={profile.preferred_industries || []}
            onChange={(v) => update("preferred_industries", v)}
          />
        </div>

        {/* Employment Types */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Employment Type (select all that apply)</label>
          <MultiCheckbox
            options={EMPLOYMENT_TYPE_OPTIONS}
            selected={profile.employment_type_preferences || []}
            onChange={(v) => update("employment_type_preferences", v)}
          />
        </div>
      </div>

      {error && (
        <p className="mt-6 text-sm text-red-600" role="alert">{error}</p>
      )}

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="px-6 py-2 text-sm font-medium text-gray-800 bg-gray-100 rounded-lg hover:bg-gray-200">
          Back
        </button>
        <button onClick={handleContinue} disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
