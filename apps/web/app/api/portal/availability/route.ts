import { NextRequest, NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

// ─── GET /api/portal/availability ────────────────────────────────────────────
// Returns the seeker's full weekly availability + whether this week is confirmed.
export async function GET(req: NextRequest) {
  const auth = await requireJobSeeker(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;

  // Fetch availability slots
  const { data: slots, error: slotsErr } = await supabaseAdmin
    .from("job_seeker_availability")
    .select("id, day_of_week, start_time, end_time, timezone, is_active")
    .eq("job_seeker_id", seekerId)
    .order("day_of_week")
    .order("start_time");

  if (slotsErr) {
    return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 });
  }

  // Check if this week is already confirmed (week_start = ISO Monday of current week)
  const weekStart = getISOMonday(new Date());
  const { data: confirmation } = await supabaseAdmin
    .from("job_seeker_availability_confirmations")
    .select("confirmed_at")
    .eq("job_seeker_id", seekerId)
    .eq("week_start", weekStart)
    .maybeSingle();

  return NextResponse.json({
    slots: slots ?? [],
    week_start: weekStart,
    confirmed_this_week: !!confirmation,
    confirmed_at: confirmation?.confirmed_at ?? null,
  });
}

// ─── POST /api/portal/availability ───────────────────────────────────────────
// Replaces the seeker's entire weekly availability with the submitted slots.
// Body: { timezone: string; slots: { day_of_week: 0-6; start_time: string; end_time: string }[] }
export async function POST(req: NextRequest) {
  const auth = await requireJobSeeker(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { timezone, slots } = body as {
    timezone: string;
    slots: { day_of_week: number; start_time: string; end_time: string }[];
  };

  if (!timezone || typeof timezone !== "string") {
    return NextResponse.json({ error: "timezone is required" }, { status: 400 });
  }
  if (!Array.isArray(slots)) {
    return NextResponse.json({ error: "slots must be an array" }, { status: 400 });
  }

  // Validate each slot
  for (const slot of slots) {
    if (slot.day_of_week < 0 || slot.day_of_week > 6) {
      return NextResponse.json({ error: "day_of_week must be 0-6" }, { status: 400 });
    }
    if (!slot.start_time || !slot.end_time) {
      return NextResponse.json({ error: "start_time and end_time are required" }, { status: 400 });
    }
    if (slot.start_time >= slot.end_time) {
      return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });
    }
  }

  // Delete existing slots for this seeker, then insert new ones
  const { error: delErr } = await supabaseAdmin
    .from("job_seeker_availability")
    .delete()
    .eq("job_seeker_id", seekerId);

  if (delErr) {
    return NextResponse.json({ error: "Failed to update availability" }, { status: 500 });
  }

  if (slots.length > 0) {
    const rows = slots.map((s) => ({
      job_seeker_id: seekerId,
      timezone,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      is_active: true,
    }));

    const { error: insErr } = await supabaseAdmin
      .from("job_seeker_availability")
      .insert(rows);

    if (insErr) {
      return NextResponse.json({ error: "Failed to save availability" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, saved: slots.length });
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function getISOMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
