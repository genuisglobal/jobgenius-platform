import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAM(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPeopleManagerRole(auth.user.role)) return NextResponse.json({ error: "People manager access required." }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Invalid recognition ID." }, { status: 400 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const status = raw && typeof raw === "object" ? (raw as Record<string, unknown>).status : null;
  if (status !== "approved" && status !== "declined") return NextResponse.json({ error: "Choose approve or decline." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("am_peer_recognitions")
    .update({ status, reviewed_by_am_id: auth.user.id, reviewed_at: new Date().toISOString() })
    .eq("id", params.id).eq("status", "pending").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not review recognition." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Recognition is unavailable or already reviewed." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
