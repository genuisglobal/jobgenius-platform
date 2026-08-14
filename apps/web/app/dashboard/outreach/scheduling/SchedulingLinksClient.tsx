"use client";

import { useCallback, useEffect, useState } from "react";

type RecentJob = { job_post_id: string; title: string; company: string };

type SchedulingLink = {
  message_id: string;
  thread_id: string;
  job_seeker_id: string | null;
  seeker_name: string;
  recruiter_name: string;
  recruiter_company: string | null;
  scheduling_link: string;
  scheduling_provider: string;
  body_excerpt: string;
  created_at: string;
  recent_jobs: RecentJob[];
};

type FormState = {
  job_post_id: string;
  scheduled_at: string; // datetime-local value
  interview_type: "phone" | "video" | "in_person";
  notes_internal: string;
};

const EMPTY_FORM: FormState = {
  job_post_id: "",
  scheduled_at: "",
  interview_type: "video",
  notes_internal: "",
};

export default function SchedulingLinksClient() {
  const [links, setLinks] = useState<SchedulingLink[]>([]);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/outreach/scheduling-links");
      const data = await res.json();
      if (res.ok) setLinks(data.links ?? []);
      else setMsg({ type: "error", text: data.error || "Failed to load scheduling links." });
    } catch {
      setMsg({ type: "error", text: "Network error loading scheduling links." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const formFor = (id: string): FormState => forms[id] ?? EMPTY_FORM;
  const setForm = (id: string, patch: Partial<FormState>) =>
    setForms((prev) => ({ ...prev, [id]: { ...formFor(id), ...patch } }));

  async function dismiss(link: SchedulingLink) {
    setBusy(link.message_id);
    setMsg(null);
    try {
      const res = await fetch("/api/am/outreach/scheduling-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: link.message_id, action: "dismissed" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to dismiss." });
      } else {
        setLinks((prev) => prev.filter((l) => l.message_id !== link.message_id));
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setBusy(null);
    }
  }

  async function createInterview(link: SchedulingLink) {
    const form = formFor(link.message_id);
    if (!form.job_post_id) {
      setMsg({ type: "error", text: "Pick which role this interview is for." });
      return;
    }
    if (!link.job_seeker_id) {
      setMsg({ type: "error", text: "Missing seeker on this link — cannot create." });
      return;
    }

    setBusy(link.message_id);
    setMsg(null);
    try {
      const interviewRes = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: link.job_seeker_id,
          job_post_id: form.job_post_id,
          meeting_link: link.scheduling_link,
          interview_type: form.interview_type,
          notes_internal: form.notes_internal || null,
          ...(form.scheduled_at
            ? { scheduled_at: new Date(form.scheduled_at).toISOString() }
            : {}),
        }),
      });
      const interviewData = await interviewRes.json();
      if (!interviewRes.ok || !interviewData.success) {
        setMsg({ type: "error", text: interviewData.error || "Failed to create interview." });
        return;
      }

      await fetch("/api/am/outreach/scheduling-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: link.message_id, action: "converted" }),
      });

      setMsg({
        type: "success",
        text: form.scheduled_at
          ? `Interview created for ${link.seeker_name}.`
          : `Interview created for ${link.seeker_name} — awaiting a scheduled time.`,
      });
      setLinks((prev) => prev.filter((l) => l.message_id !== link.message_id));
    } catch {
      setMsg({ type: "error", text: "Network error creating interview." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Scheduling Links</h1>
      <p className="text-sm text-gray-500 mb-6">
        Recruiter replies that included a scheduling link (Calendly, HubSpot Meetings,
        etc.) — open the link, book the slot, then record it here.
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
      ) : links.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-700 font-medium">Nothing pending 🎉</p>
          <p className="text-sm text-gray-500 mt-1">
            New scheduling links are detected automatically as recruiter replies come in.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {links.map((link) => {
            const form = formFor(link.message_id);
            const isOpen = openForm === link.message_id;
            return (
              <div
                key={link.message_id}
                className="bg-white border border-gray-200 rounded-xl p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {link.seeker_name}
                      <span className="mx-1.5 text-gray-300">·</span>
                      <span className="font-normal text-gray-600">
                        {link.recruiter_name}
                        {link.recruiter_company ? ` @ ${link.recruiter_company}` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(link.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                    {link.scheduling_provider}
                  </span>
                </div>

                {link.body_excerpt && (
                  <p className="text-sm text-gray-500 italic mb-3">&ldquo;{link.body_excerpt}…&rdquo;</p>
                )}

                <a
                  href={link.scheduling_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-violet-600 hover:underline mb-3 break-all"
                >
                  {link.scheduling_link} ↗
                </a>

                {!isOpen ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setOpenForm(link.message_id)}
                      className="px-3 py-1.5 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                    >
                      Create interview
                    </button>
                    <button
                      onClick={() => dismiss(link)}
                      disabled={busy === link.message_id}
                      className="px-3 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-gray-100 pt-3 mt-1 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Role (required)
                      </label>
                      <select
                        value={form.job_post_id}
                        onChange={(e) => setForm(link.message_id, { job_post_id: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                      >
                        <option value="">Select the role…</option>
                        {link.recent_jobs.map((job) => (
                          <option key={job.job_post_id} value={job.job_post_id}>
                            {job.title} @ {job.company}
                          </option>
                        ))}
                      </select>
                      {link.recent_jobs.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          No recent applications found for this seeker — confirm the role
                          manually before booking.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Scheduled time (once booked on the link)
                        </label>
                        <input
                          type="datetime-local"
                          value={form.scheduled_at}
                          onChange={(e) => setForm(link.message_id, { scheduled_at: e.target.value })}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Type
                        </label>
                        <select
                          value={form.interview_type}
                          onChange={(e) =>
                            setForm(link.message_id, {
                              interview_type: e.target.value as FormState["interview_type"],
                            })
                          }
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                        >
                          <option value="video">Video</option>
                          <option value="phone">Phone</option>
                          <option value="in_person">In person</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => createInterview(link)}
                        disabled={busy === link.message_id}
                        className="px-4 py-1.5 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                      >
                        {busy === link.message_id ? "Creating…" : "Save interview"}
                      </button>
                      <button
                        onClick={() => setOpenForm(null)}
                        className="px-3 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
