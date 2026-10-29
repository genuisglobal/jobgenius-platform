import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";
import { getRangeBounds } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { parsePeerRecognition } from "@/lib/peer-recognition";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (normalizeAMRole(auth.user.role) !== "am") return NextResponse.json({ error: "AM access required." }, { status: 403 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const nomination = parsePeerRecognition(raw);
  if (!nomination) return NextResponse.json({ error: "Choose a teammate and describe their contribution in 20–500 characters." }, { status: 400 });
  if (nomination.nomineeAmId === auth.user.id) return NextResponse.json({ error: "Choose another AM." }, { status: 400 });
  const weekStart = getRangeBounds(watDate(), "week").start;
  const [{ data: nominee, error: nomineeError }, { count, error: countError }] = await Promise.all([
    supabaseAdmin.from("account_managers").select("id, role, status").eq("id", nomination.nomineeAmId).maybeSingle(),
    supabaseAdmin.from("am_peer_recognitions").select("id", { count: "exact", head: true }).eq("week_start", weekStart).eq("nominator_am_id", auth.user.id),
  ]);
  if (nomineeError || countError) return NextResponse.json({ error: "Could not check recognition eligibility." }, { status: 500 });
  if (!nominee || nominee.status !== "approved" || normalizeAMRole(nominee.role as string | null) !== "am") return NextResponse.json({ error: "Choose an approved AM." }, { status: 400 });
  if ((count ?? 0) >= 2) return NextResponse.json({ error: "You can submit up to two recognitions each week." }, { status: 409 });
  const { error } = await supabaseAdmin.from("am_peer_recognitions").insert({
    week_start: weekStart, nominator_am_id: auth.user.id, nominee_am_id: nomination.nomineeAmId,
    contribution_type: nomination.contributionType, detail: nomination.detail,
  });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "You already recognized this AM this week." : error.code === "23514" ? "You can submit up to two recognitions each week." : "Could not save recognition." }, { status: error.code === "23505" || error.code === "23514" ? 409 : 500 });
  return NextResponse.json({ ok: true, week_start: weekStart }, { status: 201 });
}
