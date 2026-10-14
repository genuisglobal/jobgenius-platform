"use client";

import { useState } from "react";

type SlotOffer = {
  id: string;
  slot_id: string;
  is_selected: boolean;
  start_at: string;
  end_at: string;
  duration_min: number;
};

type Props = {
  token: string;
  interviewId: string;
  offers: SlotOffer[];
  interviewType: string;
  meetingLink: string | null;
  phoneNumber: string | null;
  address: string | null;
  duration: number;
  jobTitle: string;
  company: string | null;
};

export default function ConfirmClient({
  token,
  offers,
  interviewType,
  meetingLink,
  phoneNumber,
  address,
  duration,
  jobTitle,
  company,
}: Props) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [icsContent, setIcsContent] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selectedSlotId) return;
    setConfirming(true);
    setError(null);

    try {
      const res = await fetch("/api/interview-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, slot_id: selectedSlotId }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Something went wrong.");
        setConfirming(false);
        return;
      }

      setConfirmed(true);
      setConfirmedAt(data.interview?.scheduled_at ?? null);

      // Build ICS for download
      if (data.interview?.scheduled_at) {
        const start = new Date(data.interview.scheduled_at);
        const end = new Date(start.getTime() + duration * 60_000);
        const uid = `${Date.now()}@joblinca.com`;
        const toIcs = (d: Date) =>
          d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

        const loc = meetingLink ?? address ?? "";
        const lines = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Joblinca//Interview//EN",
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${toIcs(new Date())}`,
          `DTSTART:${toIcs(start)}`,
          `DTEND:${toIcs(end)}`,
          `SUMMARY:Interview: ${jobTitle}${company ? ` at ${company}` : ""}`,
          `DESCRIPTION:${interviewType.replace("_", "-")} interview`,
          loc ? `LOCATION:${loc}` : "",
          "END:VEVENT",
          "END:VCALENDAR",
        ]
          .filter(Boolean)
          .join("\r\n");

        setIcsContent(lines);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setConfirming(false);
  }

  function downloadIcs() {
    if (!icsContent) return;
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (confirmed) {
    const dateStr = confirmedAt
      ? new Date(confirmedAt).toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Confirmed";

    return (
      <div>
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: 16,
            margin: "16px 0",
          }}
        >
          <h2 style={{ margin: "0 0 8px" }}>Interview Confirmed!</h2>
          <p style={{ margin: 0 }}>
            <strong>Date &amp; Time:</strong> {dateStr}
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <strong>Duration:</strong> {duration} minutes
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <strong>Type:</strong> {interviewType.replace("_", "-")}
          </p>
          {meetingLink && (
            <p style={{ margin: "8px 0 0" }}>
              <strong>Meeting Link:</strong>{" "}
              <a href={meetingLink}>{meetingLink}</a>
            </p>
          )}
          {phoneNumber && (
            <p style={{ margin: "8px 0 0" }}>
              <strong>Phone:</strong> {phoneNumber}
            </p>
          )}
          {address && (
            <p style={{ margin: "8px 0 0" }}>
              <strong>Location:</strong> {address}
            </p>
          )}
        </div>
        {icsContent && (
          <button
            onClick={downloadIcs}
            style={{
              padding: "10px 20px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Add to Calendar
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>
        Select a time slot and confirm your interview:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {offers.map((offer) => {
          const d = new Date(offer.start_at);
          const dateLabel = d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          const timeLabel = d.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
          const isSelected = selectedSlotId === offer.slot_id;

          return (
            <button
              key={offer.slot_id}
              onClick={() => setSelectedSlotId(offer.slot_id)}
              style={{
                padding: "12px 16px",
                border: isSelected ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                borderRadius: 8,
                background: isSelected ? "#eff6ff" : "#fff",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 14,
              }}
            >
              <strong>{dateLabel}</strong> at {timeLabel} ({offer.duration_min} min)
            </button>
          );
        })}
      </div>

      {error && (
        <p style={{ color: "#dc2626", marginTop: 12 }}>{error}</p>
      )}

      <button
        onClick={handleConfirm}
        disabled={!selectedSlotId || confirming}
        style={{
          marginTop: 16,
          padding: "10px 24px",
          background: selectedSlotId ? "#7c3aed" : "#9ca3af",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: selectedSlotId ? "pointer" : "not-allowed",
          fontSize: 14,
        }}
      >
        {confirming ? "Confirming..." : "Confirm This Time"}
      </button>
    </div>
  );
}
