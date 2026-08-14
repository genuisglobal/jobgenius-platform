"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_JOBGENIUS_REPORT_SETTINGS,
  type JobGeniusReportSettings,
} from "@/lib/jobgenius/report";

type ReportSettings = JobGeniusReportSettings & {
  updated_at?: string;
};

export default function ReportsSettingsClient({
  initialSettings,
  initialError,
}: {
  initialSettings: ReportSettings;
  initialError: string | null;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<ReportSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/reports/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: settings.system_prompt,
          outputInstructions: settings.output_instructions,
          defaultGoal: settings.default_goal,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to save JobGenius report settings.");
        return;
      }

      setSettings((prev) => ({
        ...prev,
        updated_at: data.settings?.updated_at || new Date().toISOString(),
      }));
      setSuccess("JobGenius report settings saved.");
      router.refresh();
    } catch {
      setError("Network error while saving settings.");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setSettings((prev) => ({
      ...prev,
      system_prompt: DEFAULT_JOBGENIUS_REPORT_SETTINGS.system_prompt,
      output_instructions: DEFAULT_JOBGENIUS_REPORT_SETTINGS.output_instructions,
      default_goal: DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal,
    }));
    setSuccess(null);
    setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">JobGenius Report Settings</h1>
          <p className="text-sm text-gray-600 mt-1">
            Admin prompt controls for seeker report generation. These settings drive analysis,
            action steps, and suggestions in the JobGenius report output.
          </p>
          {settings.updated_at && (
            <p className="text-xs text-gray-500 mt-2">
              Last updated: {new Date(settings.updated_at).toLocaleString()}
            </p>
          )}
        </div>
        <a
          href="/dashboard/admin"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Back To Admin
        </a>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">System Prompt</label>
          <textarea
            rows={7}
            value={settings.system_prompt}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, system_prompt: event.target.value }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Sets model behavior and strategic lens for the report.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Output Instructions
          </label>
          <textarea
            rows={6}
            value={settings.output_instructions}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                output_instructions: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Defines formatting and quality constraints for analysis, actions, and suggestions.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Default Goal</label>
          <input
            type="text"
            value={settings.default_goal}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, default_goal: event.target.value }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Applied when AM/admin does not provide a per-report goal.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={resetDefaults}
            type="button"
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Reset To Defaults
          </button>
          <button
            onClick={handleSave}
            type="button"
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
