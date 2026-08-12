"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SOCIAL_CANDIDATE_STATUSES,
  SOCIAL_ELECTION_STATUSES,
  SOCIAL_LEAD_TERM_STATUSES,
  labelizePeopleValue,
} from "@/lib/people";

interface EmployeeRow {
  id: string;
  role_title: string | null;
  worker: {
    full_name: string;
    email: string | null;
  } | null;
}

interface ElectionRow {
  id: string;
  title: string;
  term_start: string;
  term_end: string;
  nominations_open_at: string | null;
  nominations_close_at: string | null;
  voting_open_at: string | null;
  voting_close_at: string | null;
  status: string;
  notes: string | null;
}

interface CandidateRow {
  id: string;
  election_id: string;
  employee_id: string;
  status: string;
  eligibility_snapshot: Record<string, unknown>;
  employee: EmployeeRow | null;
  nominator: EmployeeRow | null;
  vote_count: number;
}

interface TermRow {
  id: string;
  employee_id: string;
  term_number: number;
  term_start: string;
  term_end: string;
  status: string;
  removal_reason: string | null;
  employee: EmployeeRow | null;
  election: ElectionRow | null;
}

interface EligibilityRow {
  employee: EmployeeRow;
  tenureMonths: number;
  averageScore: number | null;
  hasActiveDisciplinaryIssue: boolean;
  hasIntegrityBlock: boolean;
  completedTerms: number;
  activeTerm: boolean;
  eligible: boolean;
  reasons: string[];
}

const EMPTY_ELECTION_FORM = {
  id: "",
  title: "",
  term_start: "",
  term_end: "",
  nominations_open_at: "",
  nominations_close_at: "",
  voting_open_at: "",
  voting_close_at: "",
  status: "draft",
  notes: "",
};

function toDateTimeLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function getEmployeeLabel(employee: EmployeeRow | null): string {
  return employee?.worker?.full_name || employee?.role_title || employee?.id || "Unknown employee";
}

export default function SocialLeadsClient({
  initialElections,
  initialCandidates,
  initialTerms,
  eligibilityPool,
}: {
  initialElections: ElectionRow[];
  initialCandidates: CandidateRow[];
  initialTerms: TermRow[];
  eligibilityPool: EligibilityRow[];
}) {
  const router = useRouter();
  const [elections, setElections] = useState(initialElections);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [terms, setTerms] = useState(initialTerms);
  const [electionForm, setElectionForm] = useState(EMPTY_ELECTION_FORM);
  const [selectedElectionId, setSelectedElectionId] = useState(initialElections[0]?.id ?? "");
  const [candidateEmployeeId, setCandidateEmployeeId] = useState("");
  const [candidateStatus, setCandidateStatus] = useState("approved");
  const [winnerEmployeeId, setWinnerEmployeeId] = useState("");
  const [termUpdates, setTermUpdates] = useState<Record<string, { status: string; removal_reason: string }>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => setElections(initialElections), [initialElections]);
  useEffect(() => setCandidates(initialCandidates), [initialCandidates]);
  useEffect(() => setTerms(initialTerms), [initialTerms]);

  useEffect(() => {
    if (!initialElections.length) {
      setSelectedElectionId("");
      return;
    }
    if (!initialElections.some((election) => election.id === selectedElectionId)) {
      setSelectedElectionId(initialElections[0]?.id ?? "");
    }
  }, [initialElections, selectedElectionId]);

  useEffect(() => {
    const next: Record<string, { status: string; removal_reason: string }> = {};
    for (const term of initialTerms) {
      next[term.id] = {
        status: term.status,
        removal_reason: term.removal_reason || "",
      };
    }
    setTermUpdates(next);
  }, [initialTerms]);

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.election_id === selectedElectionId),
    [candidates, selectedElectionId]
  );

  const approvedCandidates = useMemo(
    () => selectedCandidates.filter((candidate) => candidate.status === "approved"),
    [selectedCandidates]
  );

  function startEditElection(election: ElectionRow) {
    setElectionForm({
      id: election.id,
      title: election.title,
      term_start: election.term_start || "",
      term_end: election.term_end || "",
      nominations_open_at: toDateTimeLocalInput(election.nominations_open_at),
      nominations_close_at: toDateTimeLocalInput(election.nominations_close_at),
      voting_open_at: toDateTimeLocalInput(election.voting_open_at),
      voting_close_at: toDateTimeLocalInput(election.voting_close_at),
      status: election.status,
      notes: election.notes || "",
    });
    setSelectedElectionId(election.id);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveElection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("save-election");
    setMessage(null);

    try {
      const response = await fetch("/api/admin/people/social-leads/elections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...electionForm,
          id: electionForm.id || undefined,
          nominations_open_at: electionForm.nominations_open_at
            ? new Date(electionForm.nominations_open_at).toISOString()
            : null,
          nominations_close_at: electionForm.nominations_close_at
            ? new Date(electionForm.nominations_close_at).toISOString()
            : null,
          voting_open_at: electionForm.voting_open_at
            ? new Date(electionForm.voting_open_at).toISOString()
            : null,
          voting_close_at: electionForm.voting_close_at
            ? new Date(electionForm.voting_close_at).toISOString()
            : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save election.");
      setMessage({ type: "success", text: "Election cycle saved." });
      setElectionForm(EMPTY_ELECTION_FORM);
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save election.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCandidate() {
    if (!selectedElectionId || !candidateEmployeeId) return;
    setBusyAction("save-candidate");
    setMessage(null);

    try {
      const response = await fetch("/api/admin/people/social-leads/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          election_id: selectedElectionId,
          employee_id: candidateEmployeeId,
          status: candidateStatus,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save candidate.");
      setMessage({ type: "success", text: "Candidate record updated." });
      setCandidateEmployeeId("");
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save candidate.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function certifyWinner() {
    if (!selectedElectionId || !winnerEmployeeId) return;
    setBusyAction("certify-winner");
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/people/social-leads/elections/${selectedElectionId}/certify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winner_employee_id: winnerEmployeeId }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to certify winner.");
      setMessage({ type: "success", text: "Social Lead winner certified." });
      setWinnerEmployeeId("");
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to certify winner.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveTerm(termId: string) {
    const draft = termUpdates[termId];
    if (!draft) return;
    setBusyAction(`term:${termId}`);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/people/social-leads/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: termId,
          status: draft.status,
          removal_reason: draft.removal_reason,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update term.");
      setMessage({ type: "success", text: "Social Lead term updated." });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update term.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Social Lead Elections</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open quarterly cycles, approve only eligible candidates, certify winners, and manage active terms.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Election cycles</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{elections.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Open nominations</p>
          <p className="text-2xl font-bold text-amber-700 mt-2">
            {elections.filter((election) => election.status === "nominations_open").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Voting open</p>
          <p className="text-2xl font-bold text-violet-700 mt-2">
            {elections.filter((election) => election.status === "voting_open").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Eligible pool</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {eligibilityPool.filter((entry) => entry.eligible).length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={saveElection} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                {electionForm.id ? "Edit election cycle" : "Create election cycle"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Open nominations first, then move the cycle into voting, then certify the winner.
              </p>
            </div>
            {electionForm.id && (
              <button
                type="button"
                onClick={() => setElectionForm(EMPTY_ELECTION_FORM)}
                className="text-sm font-medium text-violet-600 hover:text-violet-700"
              >
                Clear
              </button>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Title</span>
            <input
              value={electionForm.title}
              onChange={(event) => setElectionForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Term start</span>
              <input
                type="date"
                value={electionForm.term_start}
                onChange={(event) => setElectionForm((prev) => ({ ...prev, term_start: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Term end</span>
              <input
                type="date"
                value={electionForm.term_end}
                onChange={(event) => setElectionForm((prev) => ({ ...prev, term_end: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Nominations open</span>
              <input
                type="datetime-local"
                value={electionForm.nominations_open_at}
                onChange={(event) =>
                  setElectionForm((prev) => ({ ...prev, nominations_open_at: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Nominations close</span>
              <input
                type="datetime-local"
                value={electionForm.nominations_close_at}
                onChange={(event) =>
                  setElectionForm((prev) => ({ ...prev, nominations_close_at: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Voting open</span>
              <input
                type="datetime-local"
                value={electionForm.voting_open_at}
                onChange={(event) =>
                  setElectionForm((prev) => ({ ...prev, voting_open_at: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Voting close</span>
              <input
                type="datetime-local"
                value={electionForm.voting_close_at}
                onChange={(event) =>
                  setElectionForm((prev) => ({ ...prev, voting_close_at: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              value={electionForm.status}
              onChange={(event) => setElectionForm((prev) => ({ ...prev, status: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {SOCIAL_ELECTION_STATUSES.filter((status) => status !== "certified").map((status) => (
                <option key={status} value={status}>
                  {labelizePeopleValue(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <textarea
              rows={3}
              value={electionForm.notes}
              onChange={(event) => setElectionForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={busyAction === "save-election"}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
          >
            {busyAction === "save-election" ? "Saving..." : "Save election"}
          </button>
        </form>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Election cycles</h2>
            </div>
            {elections.length === 0 ? (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">
                No election cycles created yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {elections.map((election) => (
                  <div key={election.id} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{election.title}</p>
                      <p className="text-sm text-gray-500">
                        {election.term_start} to {election.term_end}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {election.notes || "No notes"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {labelizePeopleValue(election.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditElection(election)}
                        className="text-sm font-medium text-violet-600 hover:text-violet-700"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Candidate review</h2>
              <p className="text-sm text-gray-500 mt-1">
                Approve only eligible candidates, then certify the winner after voting.
              </p>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Selected election</span>
              <select
                value={selectedElectionId}
                onChange={(event) => setSelectedElectionId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select election</option>
                {elections.map((election) => (
                  <option key={election.id} value={election.id}>
                    {election.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Employee</span>
                <select
                  value={candidateEmployeeId}
                  onChange={(event) => setCandidateEmployeeId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select employee</option>
                  {eligibilityPool.map((entry) => (
                    <option key={entry.employee.id} value={entry.employee.id}>
                      {getEmployeeLabel(entry.employee)} {entry.eligible ? "" : "(Ineligible)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Candidate status</span>
                <select
                  value={candidateStatus}
                  onChange={(event) => setCandidateStatus(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {SOCIAL_CANDIDATE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {labelizePeopleValue(status)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={saveCandidate}
                  disabled={!selectedElectionId || !candidateEmployeeId || busyAction === "save-candidate"}
                  className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-60"
                >
                  {busyAction === "save-candidate" ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {selectedCandidates.length === 0 ? (
                <div className="px-4 py-8 text-sm text-gray-400 text-center">
                  No candidates yet for this election.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {selectedCandidates.map((candidate) => (
                    <div key={candidate.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900">
                            {getEmployeeLabel(candidate.employee)}
                          </p>
                          <p className="text-sm text-gray-500">
                            Votes {candidate.vote_count} /{" "}
                            {candidate.nominator ? `Nominated by ${getEmployeeLabel(candidate.nominator)}` : "Management entry"}
                          </p>
                          {Array.isArray(candidate.eligibility_snapshot?.reasons) &&
                            (candidate.eligibility_snapshot.reasons as string[]).length > 0 && (
                              <p className="text-xs text-red-600 mt-1">
                                {(candidate.eligibility_snapshot.reasons as string[]).join(" ")}
                              </p>
                            )}
                        </div>
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {labelizePeopleValue(candidate.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 pt-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Certify winner</span>
                <select
                  value={winnerEmployeeId}
                  onChange={(event) => setWinnerEmployeeId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select approved candidate</option>
                  {approvedCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.employee_id}>
                      {getEmployeeLabel(candidate.employee)} / {candidate.vote_count} votes
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={certifyWinner}
                  disabled={!selectedElectionId || !winnerEmployeeId || busyAction === "certify-winner"}
                  className="w-full px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busyAction === "certify-winner" ? "Certifying..." : "Certify"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Eligibility pool</h2>
            <p className="text-xs text-gray-500 mt-1">
              Minimum 3 months, 70%+ average score, no active discipline, no integrity/confidentiality blocker, max 2 terms.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {eligibilityPool.slice(0, 12).map((entry) => (
              <div key={entry.employee.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{getEmployeeLabel(entry.employee)}</p>
                  <p className="text-sm text-gray-500">
                    Avg {entry.averageScore ?? "n/a"} / Tenure {entry.tenureMonths} months / Terms {entry.completedTerms}
                  </p>
                  {!entry.eligible && (
                    <p className="text-xs text-red-600 mt-1">{entry.reasons.join(" ")}</p>
                  )}
                </div>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                    entry.eligible ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {entry.eligible ? "Eligible" : "Not eligible"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Active and past terms</h2>
          </div>
          {terms.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No Social Lead terms recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {terms.map((term) => {
                const draft = termUpdates[term.id] || {
                  status: term.status,
                  removal_reason: term.removal_reason || "",
                };
                return (
                  <div key={term.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">{getEmployeeLabel(term.employee)}</p>
                        <p className="text-sm text-gray-500">
                          Term {term.term_number} / {term.term_start} to {term.term_end}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {term.election?.title || "Certified term"}
                        </p>
                      </div>
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {labelizePeopleValue(term.status)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3">
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setTermUpdates((prev) => ({
                            ...prev,
                            [term.id]: { ...draft, status: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {SOCIAL_LEAD_TERM_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {labelizePeopleValue(status)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={draft.removal_reason}
                        onChange={(event) =>
                          setTermUpdates((prev) => ({
                            ...prev,
                            [term.id]: { ...draft, removal_reason: event.target.value },
                          }))
                        }
                        placeholder="Removal / closure notes"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => saveTerm(term.id)}
                        disabled={busyAction === `term:${term.id}`}
                        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-60"
                      >
                        {busyAction === `term:${term.id}` ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
