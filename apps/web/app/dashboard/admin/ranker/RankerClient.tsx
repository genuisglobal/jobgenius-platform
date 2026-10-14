"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RankerModelRow {
  id: string;
  family: string;
  version: number;
  weights: Record<string, number>;
  training_size: number | null;
  training_positive: number | null;
  training_negative: number | null;
  metrics: Record<string, unknown>;
  status: "pending" | "active" | "archived" | "rolled_back";
  promoted_at: string | null;
  archived_at: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-500",
  rolled_back: "bg-red-100 text-red-700",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function fmtNumber(value: unknown, digits = 3): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function weightBar(value: number, max: number): { width: string; color: string } {
  const ratio = max === 0 ? 0 : Math.min(1, Math.abs(value) / max);
  return {
    width: `${ratio * 100}%`,
    color: value >= 0 ? "bg-emerald-500" : "bg-red-500",
  };
}

export default function RankerClient({
  initialModels,
  labelledCount,
  totalFeatures,
}: {
  initialModels: RankerModelRow[];
  labelledCount: number;
  totalFeatures: number;
}) {
  const router = useRouter();
  const [models, setModels] = useState(initialModels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainingNotes, setTrainingNotes] = useState("");

  async function train() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ranker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "train",
          notes: trainingNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Training failed.");
        return;
      }
      setModels((prev) => [data.model as RankerModelRow, ...prev]);
      setTrainingNotes("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(model: RankerModelRow, action: "promote" | "archive" | "rollback") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ranker/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Failed to ${action}.`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const readyToTrain = labelledCount >= 20;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Labelled examples</p>
          <p className="text-2xl font-bold text-gray-900">{labelledCount}</p>
          <p className="text-[11px] text-gray-400 mt-1">need ≥20 to train</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total feature snapshots</p>
          <p className="text-2xl font-bold text-gray-900">{totalFeatures}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Active model</p>
          <p className="text-lg font-bold text-gray-900">
            {models.find((m) => m.status === "active")
              ? `v${models.find((m) => m.status === "active")!.version}`
              : "none"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Train a new model</h2>
        <p className="text-xs text-gray-500 mb-3">
          Pulls the latest labelled <code>match_features</code> (outcome in{" "}
          <code>interview / offer / rejection / ghosted</code>), runs 200 epochs
          of gradient descent with L2=0.001, and writes a new <code>pending</code>{" "}
          model. Promote when the holdout accuracy beats the live model.
        </p>
        <textarea
          value={trainingNotes}
          onChange={(e) => setTrainingNotes(e.target.value)}
          placeholder="Optional notes about this training run…"
          className="w-full text-sm border border-gray-300 rounded-lg p-2 mb-3"
          rows={2}
        />
        <button
          onClick={train}
          disabled={busy || !readyToTrain}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? "Training…" : `Train v${(models[0]?.version ?? 0) + 1}`}
        </button>
        {!readyToTrain && (
          <span className="ml-3 text-xs text-amber-700">
            Need at least 20 labelled examples ({labelledCount} so far).
          </span>
        )}
        {error && <p className="text-red-700 text-xs mt-2">{error}</p>}
      </div>

      <div className="space-y-3">
        {models.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No models trained yet.
          </div>
        ) : (
          models.map((model) => {
            const weightKeys = [
              "skills",
              "title",
              "experience",
              "salary",
              "location",
              "company_fit",
              "penalties",
            ];
            const maxAbs = Math.max(
              ...weightKeys.map((k) => Math.abs(Number(model.weights[k]) || 0)),
              0.01
            );
            const metrics = model.metrics ?? {};
            return (
              <div key={model.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-gray-900">v{model.version}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        STATUS_STYLES[model.status]
                      }`}
                    >
                      {model.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      trained {fmtDateTime(model.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {model.status === "pending" && (
                      <button
                        onClick={() => setStatus(model, "promote")}
                        disabled={busy}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        Promote to active
                      </button>
                    )}
                    {model.status === "active" && (
                      <button
                        onClick={() => setStatus(model, "rollback")}
                        disabled={busy}
                        className="px-3 py-1.5 border border-red-300 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        Rollback to previous
                      </button>
                    )}
                    {(model.status === "pending" || model.status === "archived") && (
                      <button
                        onClick={() => setStatus(model, "archive")}
                        disabled={busy}
                        className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs">
                  <div>
                    <p className="text-gray-500">Training size</p>
                    <p className="font-medium text-gray-900">{model.training_size ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Pos / Neg</p>
                    <p className="font-medium text-gray-900">
                      {model.training_positive ?? "—"} / {model.training_negative ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Holdout acc</p>
                    <p className="font-medium text-gray-900">{fmtPct(metrics.holdout_accuracy)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">AUC (approx)</p>
                    <p className="font-medium text-gray-900">{fmtNumber(metrics.auc_approx)}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 text-gray-500">intercept</span>
                    <span className="w-16 text-right font-mono text-gray-700">
                      {fmtNumber(model.weights.intercept)}
                    </span>
                  </div>
                  {weightKeys.map((k) => {
                    const val = Number(model.weights[k]) || 0;
                    const bar = weightBar(val, maxAbs);
                    return (
                      <div key={k} className="flex items-center gap-2 text-[11px]">
                        <span className="w-24 text-gray-500">{k}</span>
                        <span className="w-16 text-right font-mono text-gray-700">
                          {fmtNumber(val)}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded relative overflow-hidden">
                          <div className={`h-full ${bar.color}`} style={{ width: bar.width }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {model.notes && (
                  <p className="text-[11px] text-gray-500 italic mt-3">“{model.notes}”</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
