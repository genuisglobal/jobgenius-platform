"use client";

import { useCallback, useEffect, useState } from "react";

type Policy = {
  key: string;
  enabled: boolean;
  note: string | null;
  updated_at: string | null;
};

const KEY_LABELS: Record<string, string> = {
  GLOBAL_APPLY: "ALL application automation (master switch)",
};

function labelFor(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  if (key.startsWith("ATS:")) return `${key.slice(4)} applications`;
  return key;
}

export default function AutomationPoliciesClient() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/automation-policies");
      const data = await res.json();
      if (res.ok) setPolicies(data.policies ?? []);
      else setMsg({ type: "error", text: data.error || "Failed to load policies." });
    } catch {
      setMsg({ type: "error", text: "Network error loading policies." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(policy: Policy) {
    const disabling = policy.enabled;
    let note: string | null = policy.note;
    if (disabling) {
      note = window.prompt(
        `Disable ${labelFor(policy.key)}?\n\nNew claims stop on the next runner poll (running applications finish). Optional note (why):`,
        policy.note ?? ""
      );
      if (note === null) return; // cancelled
    }

    setBusy(policy.key);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/automation-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: policy.key,
          enabled: !policy.enabled,
          note: note ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to save." });
      } else {
        setMsg({
          type: "success",
          text: disabling
            ? `${labelFor(policy.key)} HALTED — new claims stop on the next poll.`
            : `${labelFor(policy.key)} re-enabled.`,
        });
        setPolicies((prev) =>
          prev.map((p) =>
            p.key === policy.key
              ? { ...p, enabled: !policy.enabled, note: note ?? p.note }
              : p
          )
        );
      }
    } catch {
      setMsg({ type: "error", text: "Network error saving policy." });
    } finally {
      setBusy(null);
    }
  }

  const globalPolicy = policies.find((p) => p.key === "GLOBAL_APPLY");
  const atsPolicies = policies.filter((p) => p.key !== "GLOBAL_APPLY");

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Automation Kill Switches</h1>
      <p className="text-sm text-gray-500 mb-6">
        Flipping a switch stops NEW run claims and creation within one runner poll
        (&lt;60s). Applications already running finish normally — stopping mid-wizard
        risks half-submitted applications.
      </p>

      {msg && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm py-12 text-center">Loading…</p>
      ) : (
        <div className="space-y-6">
          {globalPolicy && (
            <PolicyRow
              policy={globalPolicy}
              busy={busy === globalPolicy.key}
              onToggle={() => toggle(globalPolicy)}
              emphasized
            />
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">
              Per-ATS switches
            </h2>
            <div className="space-y-2">
              {atsPolicies.map((policy) => (
                <PolicyRow
                  key={policy.key}
                  policy={policy}
                  busy={busy === policy.key}
                  onToggle={() => toggle(policy)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyRow({
  policy,
  busy,
  onToggle,
  emphasized,
}: {
  policy: Policy;
  busy: boolean;
  onToggle: () => void;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
        !policy.enabled
          ? "bg-red-50 border-red-300"
          : emphasized
            ? "bg-white border-gray-300 shadow-sm"
            : "bg-white border-gray-200"
      }`}
    >
      <div>
        <p className={`font-medium ${!policy.enabled ? "text-red-800" : "text-gray-900"}`}>
          {labelFor(policy.key)}
          {!policy.enabled && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-600 text-white">
              HALTED
            </span>
          )}
        </p>
        {policy.note && !policy.enabled && (
          <p className="text-xs text-red-700 mt-0.5">{policy.note}</p>
        )}
        {policy.updated_at && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            Updated {new Date(policy.updated_at).toLocaleString()}
          </p>
        )}
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${
          policy.enabled
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {busy ? "Saving…" : policy.enabled ? "Halt" : "Re-enable"}
      </button>
    </div>
  );
}
