import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";

interface RouteParams {
  params: { id: string };
}

// GET /api/am/seekers/[id]/auto-schedule
// Returns available interview slots that overlap with seeker's weekly availability
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  const amId = auth.user.id;

  if (!(await hasJobSeekerAccess(amId, seekerId))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Get seeker's weekly availability (active slots)
  const { data: availability } = await supabaseAdmin
    .from("job_seeker_availability")
    .select("day_of_week, start_time, end_time, timezone")
    .eq("job_seeker_id", seekerId)
    .eq("is_active", true);

  if (!availability || availability.length === 0) {
    return NextResponse.json({ slots: [], availability_set: false });
  }

  // Get this AM's unbooked future slots (next 4 weeks)
  const now = new Date();
  const fourWeeksOut = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  const { data: amSlots } = await supabaseAdmin
    .from("interview_slots")
    .select("id, start_at, end_at, duration_min")
    .eq("account_manager_id", amId)
    .eq("is_booked", false)
    .gte("start_at", now.toISOString())
    .lte("start_at", fourWeeksOut.toISOString())
    .order("start_at", { ascending: true });

  if (!amSlots || amSlots.length === 0) {
    return NextResponse.json({ slots: [], availability_set: true, am_slots_available: false });
  }

  // Match slots: day_of_week (0=Mon...6=Sun) + time overlap
  // We use the seeker's first timezone as the reference
  const seekerTz = availability[0].timezone || "UTC";

  const matchedSlots = amSlots.filter((slot) => {
    const slotDate = new Date(slot.start_at);

    // Convert slot to seeker's timezone to get day-of-week + time
    const slotInSeeker = new Intl.DateTimeFormat("en-CA", {
      timeZone: seekerTz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(slotDate);

    const weekdayPart = slotInSeeker.find((p) => p.type === "weekday")?.value;
    const hourPart = slotInSeeker.find((p) => p.type === "hour")?.value;
    const minutePart = slotInSeeker.find((p) => p.type === "minute")?.value;

    if (!weekdayPart || !hourPart || !minutePart) return false;

    // Map short weekday to 0=Mon...6=Sun
    const weekdayMap: Record<string, number> = {
      Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
    };
    const slotDow = weekdayMap[weekdayPart];
    if (slotDow === undefined) return false;

    const hours = parseInt(hourPart, 10);
    const minutes = parseInt(minutePart, 10);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return false;

    const slotTimeMinutes = hours * 60 + minutes;
    const slotEndMinutes = slotTimeMinutes + (slot.duration_min || 60);

    return availability.some((avail) => {
      if (avail.day_of_week !== slotDow) return false;
      const aParts = (avail.start_time ?? "").split(":");
      const eParts = (avail.end_time ?? "").split(":");
      if (aParts.length < 2 || eParts.length < 2) return false;
      const aH = parseInt(aParts[0], 10);
      const aM = parseInt(aParts[1], 10);
      const eH = parseInt(eParts[0], 10);
      const eM = parseInt(eParts[1], 10);
      if ([aH, aM, eH, eM].some((v) => isNaN(v))) return false;
      const availStart = aH * 60 + aM;
      const availEnd = eH * 60 + eM;
      // Slot must fit within availability window
      return slotTimeMinutes >= availStart && slotEndMinutes <= availEnd;
    });
  });

  return NextResponse.json({
    slots: matchedSlots,
    availability_set: true,
    am_slots_available: amSlots.length > 0,
    seeker_timezone: seekerTz,
  });
}

// POST /api/am/seekers/[id]/auto-schedule
// Books an interview slot for the seeker
export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  const amId = auth.user.id;

  if (!(await hasJobSeekerAccess(amId, seekerId))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { slot_id, interview_type = "video_call", notes_for_candidate, job_post_id } = body;

  if (!slot_id) {
    return NextResponse.json({ error: "slot_id is required" }, { status: 400 });
  }

  // Verify slot is unbooked and belongs to this AM
  const { data: slot } = await supabaseAdmin
    .from("interview_slots")
    .select("id, start_at, end_at, duration_min, is_booked, account_manager_id")
    .eq("id", slot_id)
    .single();

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  if (slot.account_manager_id !== amId) {
    return NextResponse.json({ error: "Not your slot" }, { status: 403 });
  }
  if (slot.is_booked) {
    return NextResponse.json({ error: "Slot already booked" }, { status: 409 });
  }

  // Create interview + mark slot as booked
  const [{ data: interview, error: interviewErr }] = await Promise.all([
    supabaseAdmin.from("interviews").insert({
      job_seeker_id: seekerId,
      account_manager_id: amId,
      interview_slot_id: slot_id,
      scheduled_at: slot.start_at,
      duration_min: slot.duration_min || 60,
      interview_type,
      status: "SCHEDULED",
      notes_for_candidate: notes_for_candidate || null,
      job_post_id: job_post_id || null,
    }).select("id, scheduled_at, duration_min, interview_type, status").single(),
  ]);

  if (interviewErr || !interview) {
    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }

  // Mark slot booked
  const { error: slotError } = await supabaseAdmin
    .from("interview_slots")
    .update({ is_booked: true })
    .eq("id", slot_id);

  if (slotError) {
    console.error("[am:auto-schedule] failed to mark slot as booked:", slotError);
  }

  return NextResponse.json({ interview }, { status: 201 });
}
