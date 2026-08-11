import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type ThresholdPayload = {
  match_threshold?: number;
};

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  let payload: ThresholdPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const jobSeekerId = context.params.id;
  if (!jobSeekerId) {
    return Response.json(
      { success: false, error: "Missing job seeker id." },
      { status: 400 }
    );
  }

  const threshold = payload.match_threshold;
  if (typeof threshold !== "number" || threshold < 0 || threshold > 100) {
    return Response.json(
      { success: false, error: "Invalid match_threshold value." },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { error } = await supabaseServer
    .from("job_seekers")
    .update({ match_threshold: threshold })
    .eq("id", jobSeekerId);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to update threshold." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
