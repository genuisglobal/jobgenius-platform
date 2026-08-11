"use client";

import { useState } from "react";
import Field from "../../components/Field";
import type { ProfileData } from "../OnboardingWizard";

const SAVE_ERROR = "Couldn't save your changes. Please check your connection and try again.";

export default function AboutYouStep({
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
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    const ok = await saveFields({
      full_name: profile.full_name,
      phone: profile.phone,
      location: profile.location,
      linkedin_url: profile.linkedin_url,
      bio: profile.bio,
      years_experience: profile.years_experience,
    });
    if (ok) onContinue();
    else setError(SAVE_ERROR);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">About You</h2>
      <p className="text-sm text-gray-600 mb-6">Tell us a bit about yourself so employers can find you.</p>

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-6">
        <p className="text-sm text-violet-800">
          Candidates with a LinkedIn URL receive 40% more recruiter responses.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full Name" value={profile.full_name} onChange={(v) => update("full_name", v)} />
        <Field label="Phone" value={profile.phone} onChange={(v) => update("phone", v)} type="tel" />
        <Field label="Location" value={profile.location} onChange={(v) => update("location", v)} placeholder="City, State" />
        <Field label="LinkedIn URL" value={profile.linkedin_url} onChange={(v) => update("linkedin_url", v)} placeholder="https://linkedin.com/in/..." type="url" />
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Years of Experience</label>
          <input
            type="number"
            value={profile.years_experience ?? ""}
            onChange={(e) => update("years_experience", e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="e.g. 5"
            className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-semibold text-gray-800 mb-1">Bio / Summary</label>
        <textarea
          value={profile.bio || ""}
          onChange={(e) => update("bio", e.target.value)}
          placeholder="A short summary about yourself, your experience, and what you're looking for..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
        />
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
