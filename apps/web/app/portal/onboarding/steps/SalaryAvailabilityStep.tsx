"use client";

import { useState } from "react";
import BooleanToggle from "../../components/BooleanToggle";
import type { ProfileData } from "../OnboardingWizard";

const START_DATE_OPTIONS = [
  { value: "Immediately", label: "Immediately" },
  { value: "1 week", label: "1 week" },
  { value: "2 weeks", label: "2 weeks" },
  { value: "1 month", label: "1 month" },
  { value: "2 months", label: "2 months" },
  { value: "3+ months", label: "3+ months" },
];

const NOTICE_PERIOD_OPTIONS = [
  { value: "None", label: "None (currently not employed)" },
  { value: "1 week", label: "1 week" },
  { value: "2 weeks", label: "2 weeks" },
  { value: "1 month", label: "1 month" },
  { value: "2 months", label: "2 months" },
  { value: "3+ months", label: "3+ months" },
];

const CITIZENSHIP_OPTIONS = [
  { value: "US Citizen", label: "US Citizen" },
  { value: "Green Card Holder", label: "Green Card / Permanent Resident" },
  { value: "H1B Visa", label: "H1B Visa" },
  { value: "H4 EAD", label: "H4 EAD" },
  { value: "L1 Visa", label: "L1 Visa" },
  { value: "OPT", label: "OPT (Optional Practical Training)" },
  { value: "CPT", label: "CPT (Curricular Practical Training)" },
  { value: "TN Visa", label: "TN Visa (NAFTA)" },
  { value: "O1 Visa", label: "O1 Visa" },
  { value: "EAD", label: "EAD (Employment Authorization)" },
  { value: "Canadian Citizen", label: "Canadian Citizen" },
  { value: "Canadian PR", label: "Canadian Permanent Resident" },
  { value: "Other", label: "Other" },
];

export default function SalaryAvailabilityStep({
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
      salary_min: profile.salary_min,
      salary_max: profile.salary_max,
      start_date: profile.start_date,
      notice_period: profile.notice_period,
      authorized_to_work: profile.authorized_to_work,
      requires_visa_sponsorship: profile.requires_visa_sponsorship,
      citizenship_status: profile.citizenship_status,
      non_compete_subject: profile.non_compete_subject,
    });
    if (ok) onContinue();
    else setError("Couldn't save your changes. Please check your connection and try again.");
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Salary & Availability</h2>
      <p className="text-sm text-gray-600 mb-6">Let us know your compensation expectations and availability.</p>

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-6">
        <p className="text-sm text-violet-800">
          Candidates with a $20k+ salary range receive more matches &mdash; it gives employers flexibility to find the right fit.
        </p>
      </div>

      <div className="space-y-5">
        {/* Salary Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Minimum Salary (USD)</label>
            <input
              type="number"
              value={profile.salary_min ?? ""}
              onChange={(e) => update("salary_min", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g. 80000"
              className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Maximum Salary (USD)</label>
            <input
              type="number"
              value={profile.salary_max ?? ""}
              onChange={(e) => update("salary_max", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g. 120000"
              className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
        </div>

        {/* Availability */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">When can you start?</label>
            <select
              value={profile.start_date || ""}
              onChange={(e) => update("start_date", e.target.value)}
              className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            >
              <option value="">Select...</option>
              {START_DATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Notice Period</label>
            <select
              value={profile.notice_period || ""}
              onChange={(e) => update("notice_period", e.target.value)}
              className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            >
              <option value="">Select...</option>
              {NOTICE_PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Work Authorization */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Work Authorization</h3>
          <div className="space-y-3 divide-y divide-gray-100">
            <BooleanToggle
              label="Are you legally authorized to work in this country?"
              value={profile.authorized_to_work}
              onChange={(v) => update("authorized_to_work", v)}
            />
            {profile.authorized_to_work === false && (
              <BooleanToggle
                label="Will you require visa sponsorship?"
                value={profile.requires_visa_sponsorship}
                onChange={(v) => update("requires_visa_sponsorship", v)}
              />
            )}
            <div className="pt-3">
              <label className="block text-sm font-semibold text-gray-800 mb-1">Citizenship / Visa Status</label>
              <select
                value={profile.citizenship_status || ""}
                onChange={(e) => update("citizenship_status", e.target.value)}
                className="w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              >
                <option value="">Select...</option>
                {CITIZENSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="pt-3">
              <BooleanToggle
                label="Are you subject to a non-compete or other restrictive covenant?"
                value={profile.non_compete_subject}
                onChange={(v) => update("non_compete_subject", v)}
              />
            </div>
          </div>
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
