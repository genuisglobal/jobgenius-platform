"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface HostRuleRow {
  id: string;
  rule_id: string;
  hosts: string[];
  apply_entry_hints: string[];
  submit_hints: string[];
  requires_apply_entry: boolean;
  prefer_popup_handoff: boolean;
  status: string;
  priority: number;
  notes: string | null;
  reviewer_id: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  pending_review: "bg-amber-100 text-amber-700",
};

interface EditableRule {
  rule_id: string;
  hosts: string;            // comma-separated for the form
  apply_entry_hints: string; // comma-separated
  submit_hints: string;
  requires_apply_entry: boolean;
  prefer_popup_handoff: boolean;
  status: string;
  priority: string;
  notes: string;
}

function fromRow(r: HostRuleRow): EditableRule {
  return {
    rule_id: r.rule_id,
    hosts: r.hosts.join(", "),
    apply_entry_hints: r.apply_entry_hints.join(", "),
    submit_hints: r.submit_hints.join(", "),
    requires_apply_entry: r.requires_apply_entry,
    prefer_popup_handoff: r.prefer_popup_handoff,
    status: r.status,
    priority: String(r.priority),
    notes: r.notes ?? "",
  };
}

function emptyRule(): EditableRule {
  return {
    rule_id: "",
    hosts: "",
    apply_entry_hints: "apply now, apply",
    submit_hints: "next, continue, submit application, submit",
    requires_apply_entry: true,
    prefer_popup_handoff: false,
    status: "active",
    priority: "0",
    notes: "",
  };
}

function toPayload(e: EditableRule): Record<string, unknown> {
  const splitClean = (s: string) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  return {
    rule_id: e.rule_id.trim().toUpperCase(),
    hosts: splitClean(e.hosts).map((h) => h.toLowerCase()),
    apply_entry_hints: splitClean(e.apply_entry_hints).map((h) => h.toLowerCase()),
    submit_hints: splitClean(e.submit_hints).map((h) => h.toLowerCase()),
    requires_apply_entry: e.requires_apply_entry,
    prefer_popup_handoff: e.prefer_popup_handoff,
    status: e.status,
    priority: Number(e.priority) || 0,
    notes: e.notes.trim() || null,
  };
}

export default function HostRulesClient({
  initialRules,
}: {
  initialRules: HostRuleRow[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableRule>(emptyRule());
  const [creating, setCreating] = useState(false);
  const [newRule, setNewRule] = useState<EditableRule>(emptyRule());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(row: HostRuleRow) {
    setEditingId(row.id);
    setEditing(fromRow(row));
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/host-rules/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editing)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
        return;
      }
      setRules((prev) => prev.map((r) => (r.id === editingId ? (data.rule as HostRuleRow) : r)));
      setEditingId(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/host-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(newRule)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create.");
        return;
      }
      setRules((prev) => [data.rule as HostRuleRow, ...prev]);
      setNewRule(emptyRule());
      setCreating(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(row: HostRuleRow) {
    if (!confirm(`Delete ${row.rule_id}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/host-rules/${row.id}`, { method: "DELETE" });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== row.id));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row: HostRuleRow, status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/host-rules/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setRules((prev) => prev.map((r) => (r.id === row.id ? (data.rule as HostRuleRow) : r)));
      }
    } finally {
      setBusy(false);
    }
  }

  function RuleForm({
    state,
    onChange,
  }: {
    state: EditableRule;
    onChange: (next: EditableRule) => void;
  }) {
    function set<K extends keyof EditableRule>(k: K, v: EditableRule[K]) {
      onChange({ ...state, [k]: v });
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Rule ID (A-Z, 0-9, _)</span>
          <input className={INPUT} value={state.rule_id} onChange={(e) => set("rule_id", e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Hosts (comma-separated)</span>
          <input className={INPUT} value={state.hosts} onChange={(e) => set("hosts", e.target.value)} placeholder="greenhouse.io" />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-gray-600 mb-1">Apply-entry hints</span>
          <input className={INPUT} value={state.apply_entry_hints} onChange={(e) => set("apply_entry_hints", e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-gray-600 mb-1">Submit hints</span>
          <input className={INPUT} value={state.submit_hints} onChange={(e) => set("submit_hints", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={state.requires_apply_entry}
            onChange={(e) => set("requires_apply_entry", e.target.checked)}
          />
          Requires apply-entry click
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={state.prefer_popup_handoff}
            onChange={(e) => set("prefer_popup_handoff", e.target.checked)}
          />
          Prefer popup handoff
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Status</span>
          <select className={INPUT} value={state.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending_review">Pending review</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Priority</span>
          <input
            className={INPUT}
            type="number"
            value={state.priority}
            onChange={(e) => set("priority", e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-gray-600 mb-1">Notes</span>
          <textarea className={INPUT} value={state.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </label>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setCreating((c) => !c)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
        >
          {creating ? "Cancel" : "+ New rule"}
        </button>
      </div>

      {creating && (
        <form onSubmit={createRule} className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">New host rule</h2>
          <RuleForm state={newRule} onChange={setNewRule} />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Create rule"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No host rules yet.
          </div>
        ) : (
          rules.map((row) => {
            const isEditing = editingId === row.id;
            return (
              <div key={row.id} className="bg-white rounded-xl border border-gray-200">
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {row.rule_id}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          STATUS_STYLES[row.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {row.status}
                      </span>
                      {row.priority !== 0 && (
                        <span className="text-[10px] text-gray-400">priority {row.priority}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">
                      hosts: <code>{row.hosts.join(", ")}</code>
                    </p>
                    {row.notes && <p className="text-[11px] text-gray-500 mt-0.5 italic">{row.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => startEdit(row)}
                          className="text-xs text-violet-600 hover:text-violet-700"
                        >
                          Edit
                        </button>
                        {row.status === "pending_review" && (
                          <button
                            onClick={() => setStatus(row, "active")}
                            disabled={busy}
                            className="text-xs text-green-600 hover:text-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {row.status === "active" && (
                          <button
                            onClick={() => setStatus(row, "inactive")}
                            disabled={busy}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                          >
                            Disable
                          </button>
                        )}
                        {row.status === "inactive" && (
                          <button
                            onClick={() => setStatus(row, "active")}
                            disabled={busy}
                            className="text-xs text-green-600 hover:text-green-700 disabled:opacity-50"
                          >
                            Enable
                          </button>
                        )}
                        <button
                          onClick={() => deleteRule(row)}
                          disabled={busy}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                    <RuleForm state={editing} onChange={setEditing} />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-gray-500 text-xs font-medium hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={busy}
                        className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
