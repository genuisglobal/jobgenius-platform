"use client";

import { useEffect, useState } from "react";
import LocationMultiSelect from "../../components/LocationMultiSelect";
import BooleanToggle from "../../components/BooleanToggle";
import type { ProfileData } from "../OnboardingWizard";

interface WorkStyleDistribution {
  remote: number;
  hybrid: number;
  onsite: number;
  sampleSize: number;
}

interface LocationPreference {
  work_type: "remote" | "hybrid" | "onsite";
  locations: string[];
}

const WORK_TYPES: {
  value: "remote" | "hybrid" | "onsite";
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  selectedBg: string;
  icon: string;
  description: string;
  subTip: string;
  defaultLocations: string[];
}[] = [
  {
    value: "remote",
    label: "Remote",
    color: "text-violet-700",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-300",
    selectedBg: "bg-violet-100",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    description: "Work from anywhere with timezone flexibility.",
    subTip: "Remote roles let you work from any location. Consider specifying timezone preferences.",
    defaultLocations: ["Anywhere in USA"],
  },
  {
    value: "hybrid",
    label: "Hybrid",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-300",
    selectedBg: "bg-green-100",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
    description: "Mix of office and remote work.",
    subTip: "Hybrid roles typically offer 2-3 days remote per week.",
    defaultLocations: [],
  },
  {
    value: "onsite",
    label: "On-site",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    selectedBg: "bg-amber-100",
    icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
    description: "Full-time at the office.",
    subTip: "On-site candidates are hired 1.5x faster on average.",
    defaultLocations: [],
  },
];

function MarketInsightChart({ distribution }: { distribution: WorkStyleDistribution | null }) {
  if (!distribution || distribution.sampleSize === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 mb-6 animate-pulse">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Current Job Market Distribution</h3>
        <div className="space-y-2">
          {["Remote", "Hybrid", "On-site"].map((label) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-14">{label}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-3" />
              <span className="text-xs font-medium text-gray-400 w-8">--</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { remote, hybrid, onsite, sampleSize } = distribution;

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Current Job Market Distribution</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-14">Remote</span>
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div className="bg-violet-500 h-3 rounded-full" style={{ width: `${remote}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8">{remote}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-14">Hybrid</span>
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div className="bg-green-500 h-3 rounded-full" style={{ width: `${hybrid}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8">{hybrid}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-14">On-site</span>
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div className="bg-amber-500 h-3 rounded-full" style={{ width: `${onsite}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8">{onsite}%</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Based on {sampleSize.toLocaleString()} active job listings on the platform.
      </p>
    </div>
  );
}

function SmartGuidance({
  activeTypes,
  openToRelocation,
  hybridPercentage,
}: {
  activeTypes: string[];
  openToRelocation?: boolean;
  hybridPercentage: number | null;
}) {
  if (activeTypes.length === 0) return null;

  let message = "";
  let type: "info" | "success" | "warning" = "info";

  if (activeTypes.length === 3) {
    message = "Great choice! You'll have maximum opportunities across all work styles.";
    type = "success";
  } else if (activeTypes.length === 1 && activeTypes[0] === "remote") {
    message =
      hybridPercentage !== null
        ? `Consider also adding Hybrid — it makes up ${hybridPercentage}% of active listings and could significantly increase your matches.`
        : "Consider also adding Hybrid to significantly increase your matches.";
    type = "info";
  } else if (activeTypes.length === 1 && activeTypes[0] === "onsite" && !openToRelocation) {
    message = "Make sure to add locations near where you currently live, since you're not open to relocation.";
    type = "warning";
  } else if (activeTypes.length === 2) {
    const missing = WORK_TYPES.find((wt) => !activeTypes.includes(wt.value));
    if (missing) {
      message = `You're open to ${activeTypes.length} work styles. Adding "${missing.label}" would maximize your opportunities.`;
      type = "info";
    }
  }

  if (!message) return null;

  const colors = {
    info: "bg-violet-50 border-violet-200 text-violet-800",
    success: "bg-green-50 border-green-200 text-green-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
  };

  return (
    <div className={`border rounded-lg p-3 mt-4 ${colors[type]}`}>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default function WorkStyleLocationStep({
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
  // Derive active work types from location_preferences
  const prefs: LocationPreference[] = profile.location_preferences || [];
  const activeTypes = prefs.map((p) => p.work_type);

  const [distribution, setDistribution] = useState<WorkStyleDistribution | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/job-market-stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.stats) setDistribution(data.stats);
      })
      .catch(() => {
        // Leave distribution null; MarketInsightChart falls back to a loading state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleWorkType = (wt: "remote" | "hybrid" | "onsite") => {
    if (activeTypes.includes(wt)) {
      // Remove this work type
      update("location_preferences", prefs.filter((p) => p.work_type !== wt));
    } else {
      // Add this work type with defaults
      const config = WORK_TYPES.find((w) => w.value === wt)!;
      update("location_preferences", [...prefs, { work_type: wt, locations: config.defaultLocations }]);
    }
  };

  const updateLocationsForType = (wt: string, locations: string[]) => {
    update(
      "location_preferences",
      prefs.map((p) => (p.work_type === wt ? { ...p, locations } : p))
    );
  };

  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    // Derive flat fields for backward compatibility
    const derivedWorkTypes = Array.from(new Set(prefs.map((p) => p.work_type)));
    const derivedLocations = Array.from(new Set(prefs.flatMap((p) => p.locations)));

    const ok = await saveFields({
      location_preferences: prefs,
      work_type_preferences: derivedWorkTypes,
      preferred_locations: derivedLocations,
      work_type: derivedWorkTypes[0] || undefined,
      open_to_relocation: profile.open_to_relocation,
    });
    if (ok) onContinue();
    else setError("Couldn't save your changes. Please check your connection and try again.");
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Work Style & Location</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose how and where you want to work. This is one of the most important factors for matching.
      </p>

      <MarketInsightChart distribution={distribution} />

      {/* Work Type Cards */}
      <div className="space-y-3">
        {WORK_TYPES.map((wt) => {
          const isActive = activeTypes.includes(wt.value);
          const pref = prefs.find((p) => p.work_type === wt.value);

          return (
            <div key={wt.value} className={`border-2 rounded-lg transition-all ${isActive ? `${wt.borderColor} ${wt.selectedBg}` : "border-gray-200"}`}>
              <button
                type="button"
                onClick={() => toggleWorkType(wt.value)}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isActive ? wt.bgColor : "bg-gray-100"}`}>
                  <svg className={`w-5 h-5 ${isActive ? wt.color : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={wt.icon} />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isActive ? wt.color : "text-gray-700"}`}>{wt.label}</span>
                    {isActive && (
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{wt.description}</p>
                </div>
              </button>

              {/* Expanded location picker */}
              {isActive && pref && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-gray-600 mb-2">{wt.subTip}</p>
                  <LocationMultiSelect
                    selected={pref.locations}
                    onChange={(locs) => updateLocationsForType(wt.value, locs)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SmartGuidance
        activeTypes={activeTypes}
        openToRelocation={profile.open_to_relocation}
        hybridPercentage={distribution?.sampleSize ? distribution.hybrid : null}
      />

      {/* Relocation Toggle */}
      <div className="mt-6 border-t pt-4">
        <BooleanToggle
          label="Open to relocation?"
          value={profile.open_to_relocation}
          onChange={(v) => update("open_to_relocation", v)}
        />
        {profile.open_to_relocation === true && (
          <p className="text-xs text-gray-500 mt-1">
            Being open to relocation opens up opportunities in new markets and shows employers flexibility.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-6 text-sm text-red-600" role="alert">{error}</p>
      )}

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
          Back
        </button>
        <button onClick={handleContinue} disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
