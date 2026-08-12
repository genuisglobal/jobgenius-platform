import { getAccountManagerFromRequest } from "@/lib/am-access";
import { normalizeLearningSkills, toSkillSlug } from "@/lib/learning/target-mapper";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: track, error } = await supabaseServer
    .from("learning_tracks")
    .select(`
      *,
      job_seekers ( id, full_name, email ),
      job_posts ( id, title, company ),
      learning_lessons ( * )
    `)
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id)
    .single();

  if (error || !track) {
    return Response.json({ success: false, error: "Track not found." }, { status: 404 });
  }

  return Response.json({ success: true, track });
}

export async function PATCH(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    category?: string;
    status?: string;
    creation_mode?: string;
    target_skill?: string | null;
    focus_skills?: string[] | null;
    job_post_id?: string | null;
    sort_order?: number;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const validCategories = ["technical", "behavioral", "industry", "tools", "general"];
  if (body.category && validCategories.includes(body.category)) {
    updates.category = body.category;
  }

  const validCreationModes = ["blank", "job_gap_refresh", "manual_skill_refresh"];
  if (body.creation_mode && validCreationModes.includes(body.creation_mode)) {
    updates.creation_mode = body.creation_mode;
  }

  if (body.job_post_id !== undefined) {
    updates.job_post_id = body.job_post_id;
  }

  if (body.target_skill !== undefined || body.focus_skills !== undefined) {
    const focusSkills = normalizeLearningSkills([
      body.target_skill ?? undefined,
      ...(Array.isArray(body.focus_skills) ? body.focus_skills : []),
    ]);
    const primarySkill = focusSkills[0] ?? null;
    updates.target_skill = primarySkill;
    updates.target_skill_slug = primarySkill ? toSkillSlug(primarySkill) : null;
    updates.focus_skills = focusSkills;
  }

  const validStatuses = ["draft", "published", "archived"];
  if (body.status && validStatuses.includes(body.status)) {
    updates.status = body.status;
  }

  const { data: track, error } = await supabaseServer
    .from("learning_tracks")
    .update(updates)
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id)
    .select("*")
    .single();

  if (error || !track) {
    return Response.json({ success: false, error: "Failed to update track." }, { status: 500 });
  }

  return Response.json({ success: true, track });
}

export async function DELETE(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { error } = await supabaseServer
    .from("learning_tracks")
    .delete()
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id);

  if (error) {
    return Response.json({ success: false, error: "Failed to delete track." }, { status: 500 });
  }

  return Response.json({ success: true });
}
