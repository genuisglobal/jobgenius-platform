import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { isActiveClient } from "@/lib/intake";
import { parseJobPostSmart } from "@/lib/matching";
import { normalizeJobUrl } from "@/lib/job-url";

type CaptureJobPayload = {
  url?: string;
  title?: string;
  company?: string | null;
  location?: string | null;
  description_text?: string | null;
  source?: string | null;
};

/**
 * POST /api/extension/capture-job
 *
 * Lightweight "promote" used by Mode 3 live autofill: persists an
 * out-of-the-blue (often unmatched) job so its link + description survive and
 * yield a job_post_id — which resume tailoring (tailored_resumes) and tracking
 * both key on. Deduped by normalized URL, mirroring spy-apply's capture, but
 * WITHOUT marking the job APPLIED (autofill is fill-only; the human submits and
 * marks applied via the spy banner).
 *
 * Auth: extension Bearer session; the active seeker must be assigned to the
 * session's AM and be an active client (same gate as live apply).
 */
export async function POST(request: Request) {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  let payload: CaptureJobPayload;
  try {
    payload = (await request.json()) as CaptureJobPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId = session.active_job_seeker_id;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "No active job seeker selected." }, { status: 400 });
  }

  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", session.account_manager_id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Not authorized for this job seeker." }, { status: 403 });
  }

  if (!(await isActiveClient(jobSeekerId))) {
    return NextResponse.json(
      { error: "Live applications are only allowed for active clients." },
      { status: 409 }
    );
  }

  const title = payload.title?.trim();
  const rawUrl = payload.url?.trim();
  if (!title || !rawUrl) {
    return NextResponse.json(
      { error: "Missing required job fields: title and url." },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeJobUrl(rawUrl);
  if (!normalizedUrl) {
    return NextResponse.json({ error: "Invalid job URL." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const rawText = payload.description_text?.trim() || null;
  const company = payload.company?.trim() || null;
  const location = payload.location?.trim() || null;
  const source = payload.source?.trim() || "manual_autofill";

  let jobPostId: string | null = null;
  let created = false;

  const { data: existingPost } = await supabaseAdmin
    .from("job_posts")
    .select("id, title, company, location, description_text")
    .eq("url", normalizedUrl)
    .maybeSingle();

  if (existingPost?.id) {
    jobPostId = existingPost.id;
    const patch: Record<string, unknown> = { last_seen_at: nowIso, is_active: true };

    if (!existingPost.title && title) patch.title = title;
    if (!existingPost.company && company) patch.company = company;
    if (!existingPost.location && location) patch.location = location;
    // Backfill + parse the description only if we now have one and didn't before.
    if (!existingPost.description_text && rawText) {
      patch.description_text = rawText;
      Object.assign(patch, await parseJobPostSmart(title, company, location, rawText), {
        parsed_at: nowIso,
      });
    }

    await supabaseAdmin.from("job_posts").update(patch).eq("id", existingPost.id);
  } else {
    const parsed = rawText ? await parseJobPostSmart(title, company, location, rawText) : null;

    const { data: insertedPost, error: insertError } = await supabaseAdmin
      .from("job_posts")
      .insert({
        title,
        url: normalizedUrl,
        source,
        company,
        location,
        description_text: rawText,
        scraped_by_am_id: session.account_manager_id,
        source_type: "manual_autofill",
        ...(parsed ?? {}),
        parsed_at: rawText ? nowIso : null,
        last_seen_at: nowIso,
        is_active: true,
      })
      .select("id")
      .single();

    if (insertError || !insertedPost?.id) {
      return NextResponse.json({ error: "Failed to save job post." }, { status: 500 });
    }

    jobPostId = insertedPost.id;
    created = true;
  }

  // Also land it in the seeker-agnostic bank (mirrors spy-apply).
  await supabaseAdmin.from("saved_jobs").upsert(
    {
      title,
      url: normalizedUrl,
      source,
      raw_text: rawText,
    },
    { onConflict: "url" }
  );

  return NextResponse.json({
    success: true,
    job_post_id: jobPostId,
    created,
    already_existed: !created,
  });
}
