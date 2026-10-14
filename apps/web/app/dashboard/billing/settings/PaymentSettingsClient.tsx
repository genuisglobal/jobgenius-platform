"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PaymentSetting {
  id: string;
  method: string;
  display_name: string;
  details: string;
  is_active: boolean;
}

interface PaymentSettingsClientProps {
  settings: PaymentSetting[];
}

const METHOD_ICONS: Record<string, string> = {
  bank: "🏦",
  cashapp: "💸",
  zelle: "⚡",
  paypal: "🅿️",
};

export default function PaymentSettingsClient({ settings }: PaymentSettingsClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, Partial<PaymentSetting>>>(
    Object.fromEntries(settings.map((s) => [s.method, { ...s }]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async (method: string) => {
    setSaving(method);
    setError(null);
    setSuccess(null);
    try {
      const form = forms[method];
      const res = await fetch("/api/admin/billing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          displayName: form.display_name,
          details: form.details,
          isActive: form.is_active,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save.");
        return;
      }
      setSuccess(`${method} settings saved.`);
      setEditing(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <a href="/dashboard/billing" className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Payment Method Settings</h1>
        </div>
        <a
          href="/dashboard/billing/settings/promo-codes"
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Promo Codes
        </a>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Configure payment details for each method. These details will be sent to clients automatically when they request payment information.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      <div className="space-y-4">
        {settings.map((setting) => {
          const form = forms[setting.method] ?? setting;
          const isEditing = editing === setting.method;
          return (
            <div key={setting.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{METHOD_ICONS[setting.method]}</span>
                  <div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={form.display_name ?? ""}
                        onChange={(e) =>
                          setForms((prev) => ({
                            ...prev,
                            [setting.method]: { ...prev[setting.method], display_name: e.target.value },
                          }))
                        }
                        className="border border-gray-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    ) : (
                      <h3 className="font-semibold text-gray-900">{form.display_name}</h3>
                    )}
                    <p className="text-xs text-gray-500 capitalize">{setting.method}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active ?? true}
                      onChange={(e) =>
                        setForms((prev) => ({
                          ...prev,
                          [setting.method]: { ...prev[setting.method], is_active: e.target.checked },
                        }))
                      }
                      disabled={!isEditing}
                      className="rounded text-violet-600"
                    />
                    <span className="text-sm text-gray-600">Active</span>
                  </label>
                  {!isEditing ? (
                    <button
                      onClick={() => setEditing(setting.method)}
                      className="text-sm text-violet-600 hover:underline"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setForms((prev) => ({ ...prev, [setting.method]: { ...setting } }));
                          setEditing(null);
                        }}
                        className="text-sm text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(setting.method)}
                        disabled={saving === setting.method}
                        className="text-sm text-white bg-violet-600 px-3 py-1 rounded-md hover:bg-violet-700 transition-colors disabled:opacity-50"
                      >
                        {saving === setting.method ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Details (sent to client)</label>
                {isEditing ? (
                  <textarea
                    rows={4}
                    value={form.details ?? ""}
                    onChange={(e) =>
                      setForms((prev) => ({
                        ...prev,
                        [setting.method]: { ...prev[setting.method], details: e.target.value },
                      }))
                    }
                    placeholder="Enter payment details exactly as they should appear to the client..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                ) : (
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-mono whitespace-pre-wrap text-gray-800">
                    {form.details || "(No details configured)"}
                  </pre>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
