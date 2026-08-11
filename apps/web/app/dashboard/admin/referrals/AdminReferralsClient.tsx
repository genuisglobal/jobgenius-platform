"use client";

import { useState } from "react";

type ReferralStatus = "signed_up" | "placed" | "rewarded";

interface ReferralRow {
  id: string;
  referrer_id: string;
  referrer_name: string;
  referred_id: string | null;
  referred_name: string | null;
  status: ReferralStatus;
  reward_amount: number | null;
  reward_paid_at: string | null;
  reward_notes: string | null;
  signed_up_at: string;
  placed_at: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  signed_up: number;
  placed: number;
  rewarded: number;
  total_paid: number;
  pending_payout: number;
}

interface Props {
  stats: Stats;
  referrals: ReferralRow[];
}

const STATUS_BADGE: Record<ReferralStatus, string> = {
  signed_up: "bg-violet-100 text-violet-700",
  placed: "bg-green-100 text-green-700",
  rewarded: "bg-purple-100 text-purple-700",
};

const STATUS_LABEL: Record<ReferralStatus, string> = {
  signed_up: "Signed Up",
  placed: "Placed",
  rewarded: "Credited",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type FilterTab = "all" | ReferralStatus;

export default function AdminReferralsClient({ stats, referrals: initialReferrals }: Props) {
  const [referrals, setReferrals] = useState<ReferralRow[]>(initialReferrals);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReward, setEditReward] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editMarkPaid, setEditMarkPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const filtered = filter === "all" ? referrals : referrals.filter((r) => r.status === filter);

  function openEdit(r: ReferralRow) {
    setEditingId(r.id);
    setEditReward(r.reward_amount != null ? String(r.reward_amount) : "");
    setEditNotes(r.reward_notes ?? "");
    setEditMarkPaid(false);
    setSaveError("");
  }

  function closeEdit() {
    setEditingId(null);
    setSaveError("");
  }

  async function handleSave() {
    if (!editingId) return;
    setSaving(true);
    setSaveError("");

    const body: Record<string, unknown> = {};
    if (editReward !== "") body.reward_amount = parseFloat(editReward) || 0;
    if (editNotes !== "") body.reward_notes = editNotes;
    if (editMarkPaid) body.mark_paid = true;

    try {
      const res = await fetch(`/api/admin/referrals/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save");
        setSaving(false);
        return;
      }

      const updated = data.referral;
      setReferrals((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? {
                ...r,
                reward_amount: updated.reward_amount,
                reward_paid_at: updated.reward_paid_at,
                reward_notes: updated.reward_notes,
                status: updated.status,
              }
            : r
        )
      );
      closeEdit();
    } catch {
      setSaveError("An error occurred");
    } finally {
      setSaving(false);
    }
  }

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "signed_up", label: "Signed Up", count: stats.signed_up },
    { key: "placed", label: "Placed", count: stats.placed },
    { key: "rewarded", label: "Credited", count: stats.rewarded },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track referral conversions and the registration credits they generated.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total", value: stats.total, color: "text-gray-900" },
          { label: "Signed Up", value: stats.signed_up, color: "text-violet-600" },
          { label: "Placed", value: stats.placed, color: "text-green-600" },
          { label: "Credited", value: stats.rewarded, color: "text-purple-600" },
          { label: "Credits Issued", value: `$${stats.total_paid.toFixed(2)}`, color: "text-purple-600" },
          { label: "Awaiting Credit", value: `$${stats.pending_payout.toFixed(2)}`, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-400">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">No referrals found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Referrer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Referred</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Signed Up</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Placed</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Credit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Issued</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.referrer_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.referred_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(r.signed_up_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(r.placed_at)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {r.reward_amount != null ? `$${r.reward_amount.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.reward_paid_at ? formatDate(r.reward_paid_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(r)}
                        className="text-xs font-medium text-violet-600 hover:text-violet-700"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingId && (() => {
        const row = referrals.find((r) => r.id === editingId);
        if (!row) return null;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Edit Referral Credit</h2>
                <button onClick={closeEdit} className="p-1 rounded hover:bg-gray-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="text-sm text-gray-600">
                <span className="font-medium">{row.referrer_name}</span> → {row.referred_name ?? "Unknown"}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editReward}
                  onChange={(e) => setEditReward(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="e.g. 250.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  placeholder="Optional notes about this reward..."
                />
              </div>

              {!row.reward_paid_at && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editMarkPaid}
                    onChange={(e) => setEditMarkPaid(e.target.checked)}
                    className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Mark as credited</span>
                </label>
              )}

              {saveError && (
                <p className="text-sm text-red-600">{saveError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeEdit}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
