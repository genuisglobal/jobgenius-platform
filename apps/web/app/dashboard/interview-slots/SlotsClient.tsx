"use client";

import { useState } from "react";

type SlotRow = {
  id: string;
  account_manager_id: string;
  job_post_id: string | null;
  start_at: string;
  end_at: string;
  duration_min: number;
  is_booked: boolean;
  created_at: string;
};

type Props = {
  slots: SlotRow[];
  accountManagerId: string;
};

export default function SlotsClient({ slots, accountManagerId }: Props) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [duration, setDuration] = useState(30);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!date || !startTime || !endTime) return;
    setCreating(true);
    setError(null);

    const startAt = `${date}T${startTime}:00`;
    const endAt = `${date}T${endTime}:00`;

    try {
      const res = await fetch("/api/interview-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_manager_id: accountManagerId,
          start_at: startAt,
          end_at: endAt,
          duration_min: duration,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Failed to create slot.");
      } else {
        window.location.reload();
      }
    } catch {
      setError("Network error.");
    }
    setCreating(false);
  }

  async function handleDelete(slotId: string) {
    setBusyId(slotId);
    try {
      await fetch(`/api/interview-slots?id=${slotId}`, {
        method: "DELETE",
        headers: {},
      });
      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  const now = new Date();

  return (
    <div>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Add Availability Slot</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label>
            Date
            <br />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Start
            <br />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label>
            End
            <br />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <label>
            Duration
            <br />
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>
          <button
            onClick={handleCreate}
            disabled={creating || !date}
            style={{
              padding: "8px 16px",
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {creating ? "Creating..." : "Add Slot"}
          </button>
        </div>
        {error && <p style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
      </section>

      <h2>Your Slots</h2>
      {slots.length === 0 ? (
        <p>No availability slots created yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
          {slots.map((slot) => {
            const start = new Date(slot.start_at);
            const dateLabel = start.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const timeLabel = start.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            const endLabel = new Date(slot.end_at).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            const isPast = start < now;

            return (
              <li
                key={slot.id}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "10px 14px",
                  borderRadius: 8,
                  opacity: isPast ? 0.5 : 1,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{dateLabel}</strong> {timeLabel} – {endLabel} ({slot.duration_min} min)
                  {slot.is_booked && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        padding: "2px 6px",
                        background: "#16a34a",
                        color: "#fff",
                        borderRadius: 4,
                      }}
                    >
                      Booked
                    </span>
                  )}
                </div>
                {!slot.is_booked && !isPast && (
                  <button
                    onClick={() => handleDelete(slot.id)}
                    disabled={busyId === slot.id}
                    style={{
                      padding: "4px 12px",
                      border: "1px solid #dc2626",
                      color: "#dc2626",
                      background: "#fff",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
