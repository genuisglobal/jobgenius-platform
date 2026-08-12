import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

// POST /api/am/announcements/read
// Body: { announcement_id: string }
// Marks a specific announcement as read for the authenticated AM.
export async function POST(req: NextRequest) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { announcement_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.announcement_id) {
    return NextResponse.json({ error: "announcement_id is required." }, { status: 400 });
  }

  const { data: announcement } = await supabaseAdmin
    .from("system_announcements")
    .select("id, target_audience")
    .eq("id", body.announcement_id)
    .eq("status", "sent")
    .single();

  if (
    !announcement ||
    !["all_account_managers", "all_users"].includes(announcement.target_audience)
  ) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }

  const { error: upsertError } = await supabaseAdmin
    .from("announcement_reads")
    .upsert(
      {
        announcement_id: body.announcement_id,
        reader_type: "account_manager",
        reader_id: auth.user.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,reader_id" }
    );

  if (upsertError) {
    console.error("[am:announcements] failed to mark announcement read:", upsertError);
  }

  return NextResponse.json({ success: true });
}
