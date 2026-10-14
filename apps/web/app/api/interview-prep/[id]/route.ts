import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const prepId = context.params.id;
  if (!prepId) {
    return Response.json(
      { success: false, error: "Missing prep id." },
      { status: 400 }
    );
  }

  const { data: prep, error: prepError } = await supabaseServer
    .from("interview_prep")
    .select(
      "id, job_seeker_id, job_post_id, content, created_at, updated_at, job_posts (title, company), job_seekers (full_name, email)"
    )
    .eq("id", prepId)
    .single();

  if (prepError || !prep) {
    return Response.json(
      { success: false, error: "Interview prep not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, prep.job_seeker_id);
  if (!access.ok) return access.response;

  return Response.json({ success: true, prep });
}
