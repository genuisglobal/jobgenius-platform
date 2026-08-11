import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobSeekerId = searchParams.get("jobSeekerId");

  if (!jobSeekerId) {
    return Response.json(
      { success: false, error: "Missing jobSeekerId." },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data, error } = await supabaseServer
    .from("otp_inbox")
    .select("id, code, channel, received_at, used_at")
    .eq("job_seeker_id", jobSeekerId)
    .is("used_at", null)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json(
      { success: false, error: "Failed to fetch OTP." },
      { status: 500 }
    );
  }

  if (!data) {
    return Response.json({ success: true, code: null });
  }

  return Response.json({
    success: true,
    id: data.id,
    code: data.code,
    channel: data.channel,
    received_at: data.received_at,
  });
}
