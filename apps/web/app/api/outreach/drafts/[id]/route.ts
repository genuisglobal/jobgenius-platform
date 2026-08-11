import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type DraftUpdatePayload = {
  subject?: string;
  body?: string;
};

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  let payload: DraftUpdatePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const draftId = context.params.id;
  if (!draftId) {
    return Response.json(
      { success: false, error: "Missing draft id." },
      { status: 400 }
    );
  }

  const { data: draft, error: draftError } = await supabaseServer
    .from("outreach_drafts")
    .select("id, job_seeker_id")
    .eq("id", draftId)
    .single();

  if (draftError || !draft) {
    return Response.json(
      { success: false, error: "Draft not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, draft.job_seeker_id);
  if (!access.ok) return access.response;

  const updates: { subject?: string; body?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof payload.subject === "string") {
    updates.subject = payload.subject;
  }

  if (typeof payload.body === "string") {
    updates.body = payload.body;
  }

  const { error: updateError } = await supabaseServer
    .from("outreach_drafts")
    .update(updates)
    .eq("id", draftId);

  if (updateError) {
    return Response.json(
      { success: false, error: "Failed to update draft." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
