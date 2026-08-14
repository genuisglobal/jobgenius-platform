"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VOICE_CALL_TYPES, type VoiceCallType } from "@/lib/voice/types";

type VoicePlaybook = {
  id: string;
  call_type: string;
  name: string;
  is_active: boolean;
  pathway_id: string | null;
  retell_agent_id: string | null;
  system_prompt: string;
  assistant_goal: string | null;
  guardrails: string | null;
  escalation_rules: Record<string, unknown>;
  max_retry_attempts: number;
  retry_backoff_minutes: number;
  updated_at?: string;
};

type LeadImportBatch = {
  id: string;
  file_name: string;
  source: string;
  status: string;
  total_rows: number;
  inserted_rows: number;
  error_rows: number;
  created_at: string;
};

type VoiceCall = {
  id: string;
  call_type: string;
  status: string;
  direction: string;
  to_number: string;
  contact_name: string | null;
  created_at: string;
};

type PlaybookDraft = {
  name: string;
  is_active: boolean;
  pathway_id: string;
  retell_agent_id: string;
  system_prompt: string;
  assistant_goal: string;
  guardrails: string;
  escalation_rules_json: string;
  max_retry_attempts: number;
  retry_backoff_minutes: number;
};

type MessageState = {
  type: "success" | "error" | "warning";
  text: string;
};

type DispatchResult = {
  success?: boolean;
  queued?: number;
  skipped?: number;
  details?: Array<{
    phone?: string;
    call_type?: string;
    voice_call_id?: string;
    skip_reason?: string;
  }>;
  error?: string;
};

const AUTO_DISPATCH_TYPES = new Set<VoiceCallType>([
  "lead_qualification",
  "onboarding",
  "interview_warmup",
]);

function toCallTypeLabel(callType: string) {
  return callType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toPlaybookDraft(playbook: VoicePlaybook): PlaybookDraft {
  return {
    name: playbook.name ?? "Default",
    is_active: Boolean(playbook.is_active),
    pathway_id: playbook.pathway_id ?? "",
    retell_agent_id: playbook.retell_agent_id ?? "",
    system_prompt: playbook.system_prompt ?? "",
    assistant_goal: playbook.assistant_goal ?? "",
    guardrails: playbook.guardrails ?? "",
    escalation_rules_json: JSON.stringify(playbook.escalation_rules ?? {}, null, 2),
    max_retry_attempts: Number.isFinite(playbook.max_retry_attempts)
      ? playbook.max_retry_attempts
      : 3,
    retry_backoff_minutes: Number.isFinite(playbook.retry_backoff_minutes)
      ? playbook.retry_backoff_minutes
      : 120,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const normalizedText = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < normalizedText.length; i += 1) {
    const ch = normalizedText[i];
    const next = normalizedText[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell.trim());
      if (row.some((entry) => entry.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell.trim());
  if (row.some((entry) => entry.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function csvRowsToObjects(rows: string[][]): Array<Record<string, unknown>> {
  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0]
    .map((header) => header.trim())
    .filter((header) => header.length > 0);
  if (headers.length === 0) {
    return [];
  }

  return rows.slice(1).map((row) => {
    const mapped: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) {
      mapped[headers[i]] = row[i]?.trim() ?? "";
    }
    return mapped;
  });
}

function splitTargetLine(line: string): string[] {
  const parsed = parseCsv(line);
  return parsed[0] ?? [];
}

function parseDispatchTargets(
  text: string,
  defaultCallType: VoiceCallType
): Array<Record<string, unknown>> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const targets: Array<Record<string, unknown>> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const cells = splitTargetLine(line).map((entry) => entry.trim());
    if (cells.length === 0) {
      continue;
    }

    const firstCell = (cells[0] ?? "").toLowerCase();
    if (index === 0 && (firstCell === "phone" || firstCell === "phone_number")) {
      continue;
    }

    const target: Record<string, unknown> = {};
    if (cells[0]) target.phone_number = cells[0];
    if (cells[1]) target.full_name = cells[1];
    if (cells[2]) target.job_seeker_id = cells[2];
    if (cells[3]) target.lead_submission_id = cells[3];
    if (cells[4]) target.account_manager_id = cells[4];
    if (cells[5]) {
      target.call_type = cells[5];
    } else {
      target.call_type = defaultCallType;
    }

    if (
      typeof target.phone_number === "string" ||
      typeof target.job_seeker_id === "string" ||
      typeof target.lead_submission_id === "string"
    ) {
      targets.push(target);
    }
  }

  return targets;
}

export default function VoiceAutomationClient({
  initialPlaybooks,
  initialBatches,
  initialCalls,
  initialWarnings,
}: {
  initialPlaybooks: VoicePlaybook[];
  initialBatches: LeadImportBatch[];
  initialCalls: VoiceCall[];
  initialWarnings: string[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<MessageState | null>(null);
  const [playbooks, setPlaybooks] = useState<VoicePlaybook[]>(initialPlaybooks);
  const [drafts, setDrafts] = useState<Record<string, PlaybookDraft>>(() =>
    Object.fromEntries(initialPlaybooks.map((playbook) => [playbook.id, toPlaybookDraft(playbook)]))
  );
  const [savingPlaybookId, setSavingPlaybookId] = useState<string | null>(null);

  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const [dispatchType, setDispatchType] = useState<VoiceCallType>("lead_qualification");
  const [dispatchLimit, setDispatchLimit] = useState(25);
  const [dispatchWindowHours, setDispatchWindowHours] = useState(24);
  const [dispatchTargetsText, setDispatchTargetsText] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);

  const previewRows = useMemo(() => importRows.slice(0, 3), [importRows]);

  function updateDraft(id: string, updates: Partial<PlaybookDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {
          name: "Default",
          is_active: true,
          pathway_id: "",
          retell_agent_id: "",
          system_prompt: "",
          assistant_goal: "",
          guardrails: "",
          escalation_rules_json: "{}",
          max_retry_attempts: 3,
          retry_backoff_minutes: 120,
        }),
        ...updates,
      },
    }));
  }

  async function savePlaybook(playbookId: string) {
    const draft = drafts[playbookId];
    if (!draft) {
      return;
    }

    let escalationRules: Record<string, unknown> = {};
    const rawRules = draft.escalation_rules_json.trim();
    if (rawRules) {
      try {
        const parsed = JSON.parse(rawRules);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setMessage({
            type: "error",
            text: `${toCallTypeLabel(
              playbooks.find((playbook) => playbook.id === playbookId)?.call_type ?? "playbook"
            )}: escalation rules must be a JSON object.`,
          });
          return;
        }
        escalationRules = parsed as Record<string, unknown>;
      } catch {
        setMessage({
          type: "error",
          text: `${toCallTypeLabel(
            playbooks.find((playbook) => playbook.id === playbookId)?.call_type ?? "playbook"
          )}: escalation rules JSON is invalid.`,
        });
        return;
      }
    }

    setSavingPlaybookId(playbookId);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/voice/playbooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: playbookId,
          name: draft.name,
          is_active: draft.is_active,
          pathway_id: draft.pathway_id || null,
          retell_agent_id: draft.retell_agent_id || null,
          system_prompt: draft.system_prompt,
          assistant_goal: draft.assistant_goal || null,
          guardrails: draft.guardrails || null,
          escalation_rules: escalationRules,
          max_retry_attempts: draft.max_retry_attempts,
          retry_backoff_minutes: draft.retry_backoff_minutes,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        playbook?: VoicePlaybook;
      };
      if (!response.ok || !data.playbook) {
        setMessage({
          type: "error",
          text: data.error || "Failed to save playbook.",
        });
        return;
      }

      setPlaybooks((prev) =>
        prev.map((item) => (item.id === playbookId ? data.playbook! : item))
      );
      setDrafts((prev) => ({
        ...prev,
        [playbookId]: toPlaybookDraft(data.playbook!),
      }));
      setMessage({
        type: "success",
        text: `${toCallTypeLabel(data.playbook.call_type)} playbook saved.`,
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while saving playbook." });
    } finally {
      setSavingPlaybookId(null);
    }
  }

  async function loadImportFile(file: File) {
    setMessage(null);
    setImportSummary(null);
    setImportRows([]);
    setImportFileName(file.name);

    try {
      const text = await file.text();
      const lowerName = file.name.toLowerCase();
      let rows: Array<Record<string, unknown>> = [];

      if (lowerName.endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          setMessage({ type: "error", text: "JSON file must be an array of objects." });
          return;
        }
        rows = parsed
          .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
          .map((entry) => entry as Record<string, unknown>);
      } else {
        const csvRows = parseCsv(text);
        rows = csvRowsToObjects(csvRows);
      }

      if (rows.length === 0) {
        setMessage({
          type: "warning",
          text: "No valid rows were found in this file.",
        });
        return;
      }

      setImportRows(rows);
      setMessage({
        type: "success",
        text: `Loaded ${rows.length} row${rows.length === 1 ? "" : "s"} from ${file.name}.`,
      });
    } catch {
      setMessage({
        type: "error",
        text: "Failed to read file. Upload CSV with header row or JSON array.",
      });
    }
  }

  async function submitImport() {
    if (importRows.length === 0) {
      setMessage({ type: "error", text: "Load a CSV/JSON file before importing." });
      return;
    }

    setImporting(true);
    setMessage(null);
    setImportSummary(null);

    try {
      const response = await fetch("/api/admin/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: importFileName || `lead-import-${Date.now()}.csv`,
          source: "excel_import",
          rows: importRows,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        inserted_rows?: number;
        error_rows?: number;
        total_rows?: number;
      };
      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.error || "Failed to import leads.",
        });
        return;
      }

      setImportSummary(
        `Imported ${data.inserted_rows ?? 0} of ${data.total_rows ?? importRows.length} row(s). Errors: ${data.error_rows ?? 0}.`
      );
      setMessage({ type: "success", text: "Lead import completed." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while importing leads." });
    } finally {
      setImporting(false);
    }
  }

  async function runDispatch() {
    setDispatching(true);
    setMessage(null);
    setDispatchResult(null);

    try {
      const manualTargets = parseDispatchTargets(dispatchTargetsText, dispatchType);
      if (manualTargets.length === 0 && !AUTO_DISPATCH_TYPES.has(dispatchType)) {
        setMessage({
          type: "error",
          text: `${toCallTypeLabel(
            dispatchType
          )} requires manual targets. Add target rows or choose an auto call type.`,
        });
        return;
      }

      const payload: Record<string, unknown> = {
        call_type: dispatchType,
        limit: dispatchLimit,
        window_hours: dispatchWindowHours,
      };
      if (manualTargets.length > 0) {
        payload.targets = manualTargets;
      }

      const response = await fetch("/api/admin/voice/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as DispatchResult;

      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.error || "Voice dispatch failed.",
        });
        setDispatchResult(data);
        return;
      }

      setDispatchResult(data);
      setMessage({
        type: "success",
        text: `Dispatch complete. Queued ${data.queued ?? 0}, skipped ${data.skipped ?? 0}.`,
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while running dispatch." });
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voice Automation</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage Retell voice playbooks, import lead sheets, and dispatch automation runs.
          </p>
        </div>
        <a
          href="/dashboard/admin"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Back To Admin
        </a>
      </div>

      {initialWarnings.length > 0 && (
        <div className="space-y-2">
          {initialWarnings.map((warning) => (
            <div
              key={warning}
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {warning}
            </div>
          ))}
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : message.type === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Playbooks</h2>
            <p className="text-xs text-gray-600 mt-1">
              Prompt and control settings for each call type.
            </p>
          </div>
        </div>

        {playbooks.length === 0 ? (
          <p className="text-sm text-gray-500">No voice playbooks found.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {playbooks.map((playbook) => {
              const draft = drafts[playbook.id] ?? toPlaybookDraft(playbook);
              return (
                <div
                  key={playbook.id}
                  className="rounded-lg border border-gray-200 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {toCallTypeLabel(playbook.call_type)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Updated{" "}
                        {playbook.updated_at
                          ? new Date(playbook.updated_at).toLocaleString()
                          : "recently"}
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(event) =>
                          updateDraft(playbook.id, { is_active: event.target.checked })
                        }
                      />
                      Active
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          updateDraft(playbook.id, { name: event.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Retell Agent ID
                      </label>
                      <input
                        value={draft.retell_agent_id}
                        onChange={(event) =>
                          updateDraft(playbook.id, { retell_agent_id: event.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        placeholder="agent_xxxxxxxx"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      System Prompt
                    </label>
                    <textarea
                      rows={5}
                      value={draft.system_prompt}
                      onChange={(event) =>
                        updateDraft(playbook.id, { system_prompt: event.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Assistant Goal
                      </label>
                      <textarea
                        rows={2}
                        value={draft.assistant_goal}
                        onChange={(event) =>
                          updateDraft(playbook.id, { assistant_goal: event.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Guardrails
                      </label>
                      <textarea
                        rows={2}
                        value={draft.guardrails}
                        onChange={(event) =>
                          updateDraft(playbook.id, { guardrails: event.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Max Retry Attempts
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={draft.max_retry_attempts}
                        onChange={(event) =>
                          updateDraft(playbook.id, {
                            max_retry_attempts: Number(event.target.value || 0),
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Retry Backoff (minutes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={draft.retry_backoff_minutes}
                        onChange={(event) =>
                          updateDraft(playbook.id, {
                            retry_backoff_minutes: Number(event.target.value || 1),
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Escalation Rules JSON
                    </label>
                    <textarea
                      rows={5}
                      value={draft.escalation_rules_json}
                      onChange={(event) =>
                        updateDraft(playbook.id, {
                          escalation_rules_json: event.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => savePlaybook(playbook.id)}
                      disabled={savingPlaybookId === playbook.id}
                      className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                    >
                      {savingPlaybookId === playbook.id ? "Saving..." : "Save Playbook"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lead Import</h2>
          <p className="text-xs text-gray-600 mt-1">
            Upload CSV/JSON from marketing sheets and feed lead qualification calls.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void loadImportFile(file);
            }}
            className="text-sm"
          />
          <button
            onClick={submitImport}
            disabled={importing || importRows.length === 0}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import Leads"}
          </button>
        </div>

        {importFileName && (
          <p className="text-xs text-gray-600">
            File: <span className="font-medium">{importFileName}</span>{" "}
            {importRows.length > 0
              ? `(${importRows.length} parsed row${importRows.length === 1 ? "" : "s"})`
              : ""}
          </p>
        )}

        {importSummary && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {importSummary}
          </div>
        )}

        {previewRows.length > 0 && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs text-gray-600">
              Preview (first {previewRows.length} rows)
            </div>
            <pre className="px-3 py-3 text-xs text-gray-700 overflow-x-auto">
              {JSON.stringify(previewRows, null, 2)}
            </pre>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Dispatch</h2>
          <p className="text-xs text-gray-600 mt-1">
            Trigger voice runs manually. Auto mode supports lead qualification, onboarding, and
            interview prep.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Call Type</label>
            <select
              value={dispatchType}
              onChange={(event) => setDispatchType(event.target.value as VoiceCallType)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {VOICE_CALL_TYPES.map((callType) => (
                <option key={callType} value={callType}>
                  {toCallTypeLabel(callType)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Limit</label>
            <input
              type="number"
              min={1}
              max={200}
              value={dispatchLimit}
              onChange={(event) => setDispatchLimit(Number(event.target.value || 1))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Interview Window (hours)
            </label>
            <input
              type="number"
              min={1}
              max={168}
              value={dispatchWindowHours}
              onChange={(event) => setDispatchWindowHours(Number(event.target.value || 24))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Manual Targets (optional)
          </label>
          <textarea
            rows={5}
            value={dispatchTargetsText}
            onChange={(event) => setDispatchTargetsText(event.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
            placeholder="phone,full_name,job_seeker_id,lead_submission_id,account_manager_id,call_type"
          />
          <p className="text-xs text-gray-500 mt-1">
            If empty, auto mode runs for the selected call type. Manual format: one target per line
            using CSV fields.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={runDispatch}
            disabled={dispatching}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {dispatching ? "Dispatching..." : "Run Dispatch"}
          </button>
        </div>

        {dispatchResult && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs text-gray-600">
              Result: queued {dispatchResult.queued ?? 0}, skipped {dispatchResult.skipped ?? 0}
            </div>
            <pre className="px-3 py-3 text-xs text-gray-700 overflow-x-auto">
              {JSON.stringify(dispatchResult.details ?? [], null, 2)}
            </pre>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Lead Imports</h2>
          {initialBatches.length === 0 ? (
            <p className="text-sm text-gray-500">No lead imports yet.</p>
          ) : (
            <div className="space-y-2">
              {initialBatches.map((batch) => (
                <div key={batch.id} className="border rounded-lg px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{batch.file_name}</p>
                  <p className="text-xs text-gray-600">
                    {batch.source} - {batch.status} - {batch.inserted_rows}/{batch.total_rows}{" "}
                    inserted - errors {batch.error_rows}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(batch.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Voice Calls</h2>
          {initialCalls.length === 0 ? (
            <p className="text-sm text-gray-500">No voice calls yet.</p>
          ) : (
            <div className="space-y-2">
              {initialCalls.map((call) => (
                <div key={call.id} className="border rounded-lg px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">
                    {toCallTypeLabel(call.call_type)} - {call.status}
                  </p>
                  <p className="text-xs text-gray-600">
                    {call.direction} - {call.contact_name || call.to_number}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(call.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

