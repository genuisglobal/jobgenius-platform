import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";

const FLAG_COLUMNS =
  "id, account_manager_id, week_start, kind, streak_weeks, evidence, status, resolved_by, resolved_at, resolution_note, created_at";

const STATUSES = ["open", "acknowledged", "dismissed"] as const;

/**
 * GET /api/am/productivity-reviews?status=open
 *
 * People managers see every flag. Everyone else sees only their own —
 * being flagged is something you should be able to read about yourself,
 * but a flag on a colleague is a judgement mid-review and is nobody
 * else's business.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const canSeeAll = isPeopleManagerRole(auth.user.role);
  const status = new URL(request.url).searchParams.get("status");

  let query = supabaseAdmin
    .from("productivity_review_flags")
    .select(FLAG_COLUMNS)
    .order("week_start", { ascending: false })
    .limit(200);

  if (!canSeeAll) query = query.eq("account_manager_id", auth.user.id);
  if (status && STATUSES.includes(status as (typeof STATUSES)[number])) {
    query = query.eq("status", status);
  }

  const { data: flags, error } = await query;

  if (error) {
    console.error("[productivity-reviews:get]", error);
    return NextResponse.json(
      { error: "Failed to load review flags." },
      { status: 500 }
    );
  }

  const rows = flags ?? [];
  const amIds = Array.from(
    new Set([
      ...rows.map((f) => f.account_manager_id as string),
      ...rows
        .map((f) => f.resolved_by as string | null)
        .filter((id): id is string => Boolean(id)),
    ])
  );

  const { data: managers } = amIds.length
    ? await supabaseAdmin
        .from("account_managers")
        .select("id, name, email")
        .in("id", amIds)
    : { data: [] };

  const nameById = new Map(
    (managers ?? []).map((m) => {
      const name = typeof m.name === "string" ? m.name.trim() : "";
      const email = typeof m.email === "string" ? m.email.trim() : "";
      return [m.id as string, name || email || "Unknown AM"];
    })
  );

  return NextResponse.json({
    can_resolve: canSeeAll,
    scope: canSeeAll ? "team" : "self",
    flags: rows.map((flag) => ({
      ...flag,
      am_name: nameById.get(flag.account_manager_id as string) ?? "Unknown AM",
      resolved_by_name: flag.resolved_by
        ? nameById.get(flag.resolved_by as string) ?? null
        : null,
    })),
  });
}

/**
 * PATCH /api/am/productivity-reviews  { id, status, note? }
 *
 * Closes a flag once a human has looked at it. `dismissed` is a
 * first-class outcome, not a failure mode: the most common right answer
 * to "their numbers are low" is a reason the numbers never knew about.
 */
export async function PATCH(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only a people manager can resolve a review flag." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const status = body.status;
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  if (
    typeof status !== "string" ||
    !STATUSES.includes(status as (typeof STATUSES)[number]) ||
    status === "open"
  ) {
    return NextResponse.json(
      { error: "status must be acknowledged or dismissed." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("productivity_review_flags")
    .update({
      status,
      resolved_by: auth.user.id,
      resolved_at: new Date().toISOString(),
      resolution_note:
        typeof body.note === "string" && body.note.trim() !== ""
          ? body.note.trim()
          : null,
    })
    .eq("id", id)
    .select(FLAG_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[productivity-reviews:patch]", error);
    return NextResponse.json(
      { error: "Failed to update the review flag." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Flag not found." }, { status: 404 });
  }

  return NextResponse.json({ flag: data });
}
