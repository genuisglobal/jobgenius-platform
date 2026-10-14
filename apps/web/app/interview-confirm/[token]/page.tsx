import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import ConfirmClient from "./ConfirmClient";

type PageProps = {
  params: { token: string };
};

type SlotOffer = {
  id: string;
  slot_id: string;
  is_selected: boolean;
  interview_slots:
    | { start_at: string; end_at: string; duration_min: number }
    | Array<{ start_at: string; end_at: string; duration_min: number }>
    | null;
};

export default async function InterviewConfirmPage({ params }: PageProps) {
  const { data: interview, error } = await supabaseServer
    .from("interviews")
    .select(
      "id, candidate_token, status, interview_type, duration_min, meeting_link, phone_number, address, scheduled_at, notes_for_candidate, confirmed_at, job_posts (title, company), job_seekers (full_name), interview_slot_offers (id, slot_id, is_selected, interview_slots (start_at, end_at, duration_min))"
    )
    .eq("candidate_token", params.token)
    .single();

  if (error || !interview) {
    return (
      <main style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
        <p style={{ marginBottom: 24 }}>
          <Link href="/" style={{ color: "#7c3aed", textDecoration: "none", fontWeight: 600 }}>
            JobGenius
          </Link>
        </p>
        <h1>Interview Not Found</h1>
        <p>This link is invalid or has expired.</p>
      </main>
    );
  }

  const jobPost = Array.isArray(interview.job_posts)
    ? interview.job_posts[0]
    : interview.job_posts;
  const seeker = Array.isArray(interview.job_seekers)
    ? interview.job_seekers[0]
    : interview.job_seekers;

  const offers = (
    (interview.interview_slot_offers ?? []) as SlotOffer[]
  ).map((o) => {
    const slot = Array.isArray(o.interview_slots)
      ? o.interview_slots[0]
      : o.interview_slots;
    return {
      id: o.id,
      slot_id: o.slot_id,
      is_selected: o.is_selected,
      start_at: slot?.start_at ?? "",
      end_at: slot?.end_at ?? "",
      duration_min: slot?.duration_min ?? 30,
    };
  });

  if (interview.status === "confirmed") {
    const dateStr = interview.scheduled_at
      ? new Date(interview.scheduled_at).toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "TBD";

    return (
      <main style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
        <p style={{ marginBottom: 24 }}>
          <Link href="/" style={{ color: "#7c3aed", textDecoration: "none", fontWeight: 600 }}>
            JobGenius
          </Link>
        </p>
        <h1>Interview Confirmed</h1>
        <p>
          <strong>{jobPost?.title ?? "Position"}</strong>
          {jobPost?.company ? ` at ${jobPost.company}` : ""}
        </p>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 16, margin: "16px 0" }}>
          <p style={{ margin: 0 }}>
            <strong>Date &amp; Time:</strong> {dateStr}
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <strong>Duration:</strong> {interview.duration_min} minutes
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <strong>Type:</strong> {interview.interview_type.replace("_", "-")}
          </p>
          {interview.meeting_link && (
            <p style={{ margin: "8px 0 0" }}>
              <strong>Meeting Link:</strong>{" "}
              <a href={interview.meeting_link}>{interview.meeting_link}</a>
            </p>
          )}
          {interview.phone_number && (
            <p style={{ margin: "8px 0 0" }}>
              <strong>Phone:</strong> {interview.phone_number}
            </p>
          )}
          {interview.address && (
            <p style={{ margin: "8px 0 0" }}>
              <strong>Location:</strong> {interview.address}
            </p>
          )}
        </div>
        {interview.notes_for_candidate && (
          <p>
            <em>Note:</em> {interview.notes_for_candidate}
          </p>
        )}
      </main>
    );
  }

  if (interview.status === "cancelled") {
    return (
      <main style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
        <p style={{ marginBottom: 24 }}>
          <Link href="/" style={{ color: "#7c3aed", textDecoration: "none", fontWeight: 600 }}>
            JobGenius
          </Link>
        </p>
        <h1>Interview Cancelled</h1>
        <p>This interview has been cancelled. Please contact the hiring team for more information.</p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
      <p style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: "#7c3aed", textDecoration: "none", fontWeight: 600 }}>
          JobGenius
        </Link>
      </p>
      <h1>Choose Your Interview Time</h1>
      <p>
        <strong>{jobPost?.title ?? "Position"}</strong>
        {jobPost?.company ? ` at ${jobPost.company}` : ""}
      </p>
      <p>
        <strong>Type:</strong> {interview.interview_type.replace("_", "-")} |{" "}
        <strong>Duration:</strong> {interview.duration_min} minutes
      </p>
      {interview.notes_for_candidate && (
        <p>
          <em>Note from the interviewer:</em> {interview.notes_for_candidate}
        </p>
      )}
      <ConfirmClient
        token={params.token}
        interviewId={interview.id}
        offers={offers}
        interviewType={interview.interview_type}
        meetingLink={interview.meeting_link}
        phoneNumber={interview.phone_number}
        address={interview.address}
        duration={interview.duration_min}
        jobTitle={jobPost?.title ?? "Position"}
        company={jobPost?.company ?? null}
      />
    </main>
  );
}
