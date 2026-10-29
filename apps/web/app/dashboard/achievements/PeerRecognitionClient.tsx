"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONTRIBUTION_LABELS, type ContributionType } from "@/lib/peer-recognition";

export type RecognitionView = {
  id: string;
  nomineeName: string;
  nominatorName: string;
  contributionType: ContributionType;
  detail: string;
  status: "pending" | "approved" | "declined";
};

export default function PeerRecognitionClient({ candidates, own, approved, pending, canNominate, canReview }: {
  candidates: Array<{ id: string; name: string }>;
  own: RecognitionView[];
  approved: RecognitionView[];
  pending: RecognitionView[];
  canNominate: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [nomineeAmId, setNomineeAmId] = useState("");
  const [contributionType, setContributionType] = useState<ContributionType>("client_help");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/am/peer-recognitions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomineeAmId, contributionType, detail }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save recognition.");
      setNomineeAmId(""); setDetail(""); setSuccess("Recognition sent to a people manager for review."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save recognition."); }
    finally { setBusy(false); }
  }

  async function review(id: string, status: "approved" | "declined") {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/am/peer-recognitions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not review recognition.");
      setSuccess(status === "approved" ? "Recognition approved." : "Recognition declined."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review recognition."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
    <div><h2 className="font-semibold text-gray-900">Helping each other</h2><p className="mt-1 text-sm text-gray-600">Recognize a specific contribution to client progress or teamwork. People managers review submissions before they appear here.</p></div>
    {canNominate && <form onSubmit={submit} className="grid gap-3 rounded-lg bg-purple-50 p-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-gray-700">Teammate<select required value={nomineeAmId} onChange={(event) => setNomineeAmId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="">Choose an AM</option>{candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="text-sm font-medium text-gray-700">Contribution<select value={contributionType} onChange={(event) => setContributionType(event.target.value as ContributionType)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">{Object.entries(CONTRIBUTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-medium text-gray-700 sm:col-span-2">What did they do?<textarea required minLength={20} maxLength={500} rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Describe the help and the difference it made; avoid private client details" className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
      <div className="flex items-center gap-3 sm:col-span-2"><button disabled={busy || !candidates.length} className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit recognition</button><span className="text-xs text-gray-600">Up to two teammates per week; no self nominations.</span></div>
    </form>}
    {own.length > 0 && <div><h3 className="text-sm font-semibold text-gray-800">Your submissions</h3><ul className="mt-2 space-y-1 text-sm text-gray-600">{own.map((item) => <li key={item.id}>{item.nomineeName} · {CONTRIBUTION_LABELS[item.contributionType]} · {item.status}</li>)}</ul></div>}
    {canReview && pending.length > 0 && <div><h3 className="text-sm font-semibold text-gray-800">Awaiting manager review</h3><div className="mt-2 space-y-3">{pending.map((item) => <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">{item.nominatorName} recognized {item.nomineeName}</p><p className="mt-1 text-gray-700">{CONTRIBUTION_LABELS[item.contributionType]}: {item.detail}</p><div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => review(item.id, "approved")} className="rounded-lg bg-green-700 px-3 py-1.5 text-white disabled:opacity-50">Approve</button><button disabled={busy} onClick={() => review(item.id, "declined")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50">Decline</button></div></div>)}</div></div>}
    {approved.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{approved.map((item) => <div key={item.id} className="rounded-lg border border-green-200 bg-green-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-green-800">{CONTRIBUTION_LABELS[item.contributionType]}</p><p className="mt-1 font-semibold text-gray-900">{item.nomineeName}</p><p className="mt-1 text-sm text-gray-700">{item.detail}</p><p className="mt-2 text-xs text-gray-500">Recognized by {item.nominatorName}</p></div>)}</div> : <p className="text-sm text-gray-500">Approved recognitions will appear here for the Friday review.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{success && <p role="status" className="text-sm text-green-700">{success}</p>}
  </section>;
}
