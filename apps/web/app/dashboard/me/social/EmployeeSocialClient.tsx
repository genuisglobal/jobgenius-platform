"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { labelizePeopleValue } from "@/lib/people";

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

interface EmployeeRow {
  id: string;
  role_title: string | null;
  worker: {
    full_name: string;
    email: string | null;
  } | null;
}

interface CandidateRow {
  id: string;
  election_id: string;
  employee_id: string;
  status: string;
  employee: EmployeeRow | null;
}

interface VoteRow {
  id: string;
  election_id: string;
  voter_employee_id: string;
  candidate_employee_id: string;
}

interface TermRow {
  id: string;
  employee_id: string;
  term_number: number;
  term_start: string;
  term_end: string;
  status: string;
  employee: EmployeeRow | null;
  election: ElectionRow | null;
}

interface EligibilityRow {
  tenureMonths: number;
  averageScore: number | null;
  completedTerms: number;
  eligible: boolean;
  reasons: string[];
}

function getEmployeeLabel(employee: EmployeeRow | null): string {
  return employee?.worker?.full_name || employee?.role_title || employee?.id || "Unknown employee";
}

export default function EmployeeSocialClient({
  currentEmployeeId,
  elections,
  candidates,
  votes,
  terms,
  eligibility,
}: {
  currentEmployeeId: string;
  elections: ElectionRow[];
  candidates: CandidateRow[];
  votes: VoteRow[];
  terms: TermRow[];
  eligibility: EligibilityRow | null;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"nominate" | "vote" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState("");

  const activeElection = useMemo(
    () =>
      elections.find((election) =>
        ["nominations_open", "voting_open", "closed"].includes(election.status)
      ) ?? elections[0] ?? null,
    [elections]
  );

  const activeCandidates = useMemo(
    () =>
      activeElection
        ? candidates.filter((candidate) => candidate.election_id === activeElection.id)
        : [],
    [activeElection, candidates]
  );

  const approvedCandidates = useMemo(
    () => activeCandidates.filter((candidate) => candidate.status === "approved"),
    [activeCandidates]
  );

  const myCandidate = useMemo(
    () =>
      activeElection
        ? activeCandidates.find((candidate) => candidate.employee_id === currentEmployeeId) ?? null
        : null,
    [activeCandidates, activeElection, currentEmployeeId]
  );

  const myVote = useMemo(
    () =>
      activeElection
        ? votes.find(
            (vote) =>
              vote.election_id === activeElection.id &&
              vote.voter_employee_id === currentEmployeeId
          ) ?? null
        : null,
    [activeElection, currentEmployeeId, votes]
  );

  const activeTerms = useMemo(
    () => terms.filter((term) => term.status === "active"),
    [terms]
  );
  const effectiveCandidateId = selectedCandidateId || myVote?.candidate_employee_id || "";

  async function handleNominate() {
    if (!activeElection) return;
    setBusyAction("nominate");
    setMessage(null);
    try {
      const response = await fetch("/api/me/employee/social-leads/nominate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ election_id: activeElection.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to submit nomination.");
      }
      setMessage({
        type: "success",
        text: "Your nomination was submitted for management review.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to submit nomination.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVote() {
    if (!activeElection || !effectiveCandidateId) return;
    setBusyAction("vote");
    setMessage(null);
    try {
      const response = await fetch("/api/me/employee/social-leads/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          election_id: activeElection.id,
          candidate_employee_id: effectiveCandidateId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to cast vote.");
      }
      setMessage({ type: "success", text: "Your vote was recorded." });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to cast vote.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Current Social Leads</h2>
            <p className="text-xs text-gray-500 mt-1">
              Elected every 3 months to help coordinate social events without unrestricted financial control.
            </p>
          </div>
          {activeTerms.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No active Social Lead terms right now.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activeTerms.map((term) => (
                <div key={term.id} className="px-5 py-4">
                  <p className="font-medium text-gray-900">{getEmployeeLabel(term.employee)}</p>
                  <p className="text-sm text-gray-500">
                    Term {term.term_number} / {term.term_start} to {term.term_end}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {term.election?.title || "Certified term"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Election Status</h2>
            <p className="text-xs text-gray-500 mt-1">
              Elections move from nominations to voting to certification.
            </p>
          </div>
          {!activeElection ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No election cycle has been published yet.
            </div>
          ) : (
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="font-medium text-gray-900">{activeElection.title}</p>
                <p className="text-sm text-gray-500">
                  {activeElection.term_start} to {activeElection.term_end}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {labelizePeopleValue(activeElection.status)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Eligibility</p>
                  <p className="font-semibold text-gray-900 mt-1">
                    {eligibility?.eligible ? "Eligible" : "Not eligible"}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Avg score</p>
                  <p className="font-semibold text-gray-900 mt-1">
                    {eligibility?.averageScore ?? "n/a"}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Terms served</p>
                  <p className="font-semibold text-gray-900 mt-1">
                    {eligibility?.completedTerms ?? 0}
                  </p>
                </div>
              </div>

              {!eligibility?.eligible && (eligibility?.reasons?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {eligibility?.reasons.join(" ")}
                </div>
              )}

              {activeElection.status === "nominations_open" && (
                <div className="space-y-3">
                  {myCandidate ? (
                    <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
                      Your candidacy is currently {labelizePeopleValue(myCandidate.status)}.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNominate}
                      disabled={!eligibility?.eligible || busyAction === "nominate"}
                      className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
                    >
                      {busyAction === "nominate" ? "Submitting..." : "Stand for election"}
                    </button>
                  )}
                </div>
              )}

              {activeElection.status === "voting_open" && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Vote for a candidate</span>
                    <select
                      value={effectiveCandidateId}
                      onChange={(event) => setSelectedCandidateId(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select candidate</option>
                      {approvedCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.employee_id}>
                          {getEmployeeLabel(candidate.employee)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {myVote && (
                    <p className="text-xs text-gray-500">
                      Your current vote is on record. You can update it while voting remains open.
                    </p>
                  )}
                    <button
                      type="button"
                      onClick={handleVote}
                      disabled={!effectiveCandidateId || busyAction === "vote"}
                      className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                    >
                    {busyAction === "vote" ? "Saving..." : "Submit vote"}
                  </button>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <h3 className="font-medium text-gray-900">Approved candidates</h3>
                </div>
                {approvedCandidates.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-400 text-center">
                    No approved candidates published yet.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {approvedCandidates.map((candidate) => (
                      <div key={candidate.id} className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {getEmployeeLabel(candidate.employee)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {labelizePeopleValue(candidate.status)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
