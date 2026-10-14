"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zonedWallTimeToDate, zonedWallTimeToIso } from "@/lib/zoned-time";

type RecentApplication = { jobPostId: string; label: string };

// Employers state interview times in the client's zone; AMs often work in WAT.
const TIME_ZONES: Array<{ value: string; label: string }> = [
  { value: "America/New_York", label: "US Eastern (ET)" },
  { value: "America/Chicago", label: "US Central (CT)" },
  { value: "America/Denver", label: "US Mountain (MT)" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "US Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "Africa/Lagos", label: "West Africa (WAT)" },
  { value: "Europe/London", label: "UK" },
];

const NEW_JOB = "__new__";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const labelClass = "block text-xs font-semibold text-gray-700 mb-1";

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function QuickLogPanel({
  seekerId,
  recentApplications,
}: {
  seekerId: string;
  recentApplications: RecentApplication[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"closed" | "interview" | "application">("closed");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState(false);

  // Shared job fields
  const [jobChoice, setJobChoice] = useState(recentApplications[0]?.jobPostId ?? NEW_JOB);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  // Interview fields
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [zone, setZone] = useState("America/New_York");
  const [interviewType, setInterviewType] = useState<"video" | "phone" | "in_person">("video");
  const [duration, setDuration] = useState("30");
  const [meetingLink, setMeetingLink] = useState("");
  const [round, setRound] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [noteForEmi, setNoteForEmi] = useState("");
  const [emiPrep, setEmiPrep] = useState(true);

  // Application fields
  const [appliedDate, setAppliedDate] = useState(todayIso());

  const amZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const localPreview = useMemo(() => {
    if (!date || !time) return null;
    const instant = zonedWallTimeToDate(date, time, zone);
    if (!instant || zone === amZone) return null;
    return instant.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }, [date, time, zone, amZone]);

  function reset() {
    setCompany("");
    setTitle("");
    setUrl("");
    setDate("");
    setTime("");
    setMeetingLink("");
    setRound("");
    setInterviewer("");
    setNoteForEmi("");
    setEmiPrep(true);
    setAppliedDate(todayIso());
    setPendingDuplicate(false);
  }

  async function post(path: string, body: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } finally {
      setSaving(false);
    }
  }

  async function submitInterview(e: React.FormEvent) {
    e.preventDefault();
    const scheduledAt = zonedWallTimeToIso(date, time, zone);
    if (!scheduledAt) {
      setMessage({ kind: "error", text: "Enter the interview date and time." });
      return;
    }
    const useExisting = jobChoice !== NEW_JOB;
    const { ok, data } = await post("interview-log", {
      ...(useExisting ? { job_post_id: jobChoice } : { company, title, url }),
      scheduled_at: scheduledAt,
      interview_type: interviewType,
      duration_min: Number(duration),
      meeting_link: interviewType === "video" ? meetingLink : undefined,
      phone_number: interviewType === "phone" ? meetingLink : undefined,
      address: interviewType === "in_person" ? meetingLink : undefined,
      round,
      interviewer,
      note_for_emi: noteForEmi,
      emi_prep_enabled: emiPrep,
    });
    if (!ok) {
      setMessage({ kind: "error", text: data.error || "Could not log the interview." });
      return;
    }
    setMessage({ kind: "ok", text: "Interview logged." });
    reset();
    setMode("closed");
    router.refresh();
  }

  async function submitApplication(e: React.FormEvent) {
    e.preventDefault();
    const appliedAt = zonedWallTimeToIso(appliedDate, "12:00", amZone);
    const { ok, status, data } = await post("manual-applications", {
      company,
      title,
      url,
      applied_at: appliedAt,
      confirm_duplicate: pendingDuplicate,
    });
    if (!ok && status === 409 && data.duplicate) {
      setPendingDuplicate(true);
      setMessage({ kind: "error", text: data.error });
      return;
    }
    if (!ok) {
      setMessage({ kind: "error", text: data.error || "Could not log the application." });
      return;
    }
    setMessage({ kind: "ok", text: `Application logged: ${title} at ${company}.` });
    reset();
    setMode("closed");
    router.refresh();
  }

  const jobFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Company</label>
        <input className={inputClass} value={company} onChange={(e) => { setCompany(e.target.value); setPendingDuplicate(false); }} required />
      </div>
      <div>
        <label className={labelClass}>Role / job title</label>
        <input className={inputClass} value={title} onChange={(e) => { setTitle(e.target.value); setPendingDuplicate(false); }} required />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>Job link (optional)</label>
        <input
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
        />
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-semibold text-gray-900">Log work done outside the platform</p>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "interview" ? "closed" : "interview");
            setMessage(null);
          }}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${
            mode === "interview" ? "bg-violet-700 text-white" : "bg-violet-600 text-white hover:bg-violet-700"
          }`}
        >
          + Interview
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "application" ? "closed" : "application");
            setMessage(null);
          }}
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            mode === "application"
              ? "border-violet-600 bg-violet-50 text-violet-700"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          + Manual application
        </button>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
          {message.text}
        </p>
      )}

      {mode === "interview" && (
        <form onSubmit={submitInterview} className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Which application?</label>
            <select className={inputClass} value={jobChoice} onChange={(e) => setJobChoice(e.target.value)}>
              {recentApplications.map((a) => (
                <option key={a.jobPostId} value={a.jobPostId}>
                  {a.label}
                </option>
              ))}
              <option value={NEW_JOB}>Another job (type it in)</option>
            </select>
          </div>
          {jobChoice === NEW_JOB && jobFields}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Time</label>
              <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Time zone of that time</label>
              <select className={inputClass} value={zone} onChange={(e) => setZone(e.target.value)}>
                {TIME_ZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
                {!TIME_ZONES.some((z) => z.value === amZone) && <option value={amZone}>My time zone ({amZone})</option>}
              </select>
            </div>
          </div>
          {localPreview && <p className="-mt-2 text-xs text-gray-500">That is {localPreview} for you.</p>}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Format</label>
              <select
                className={inputClass}
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value as typeof interviewType)}
              >
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Length (minutes)</label>
              <input
                type="number"
                min={5}
                max={480}
                className={inputClass}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Round</label>
              <input
                className={inputClass}
                value={round}
                onChange={(e) => setRound(e.target.value)}
                placeholder="Recruiter screen, 2nd round…"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>
                {interviewType === "video" ? "Meeting link" : interviewType === "phone" ? "Phone number" : "Address"}
              </label>
              <input className={inputClass} value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Interviewer (optional)</label>
              <input
                className={inputClass}
                value={interviewer}
                onChange={(e) => setInterviewer(e.target.value)}
                placeholder="Name, title"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Note for Emi&apos;s prep call (optional, never shown to the client)</label>
            <textarea
              rows={2}
              className={inputClass}
              value={noteForEmi}
              onChange={(e) => setNoteForEmi(e.target.value)}
              placeholder="e.g. nervous about salary questions; panel with the CISO"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={emiPrep} onChange={(e) => setEmiPrep(e.target.checked)} />
            Emi may call the client to prep for this interview
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Saving…" : "Log interview"}
          </button>
        </form>
      )}

      {mode === "application" && (
        <form onSubmit={submitApplication} className="mt-4 space-y-4">
          {jobFields}
          <div className="sm:w-1/3">
            <label className={labelClass}>Applied on</label>
            <input
              type="date"
              className={inputClass}
              value={appliedDate}
              max={todayIso()}
              onChange={(e) => setAppliedDate(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Saving…" : pendingDuplicate ? "Log it anyway" : "Log application"}
          </button>
        </form>
      )}
    </div>
  );
}
