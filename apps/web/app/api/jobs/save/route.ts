import { supabaseServer } from "@/lib/supabase/server";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { authenticateRequest } from "@/lib/auth";
import { parseJobPostSmart } from "@/lib/matching";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { normalizeJobUrl } from "@/lib/job-url";

type SaveJobPayload = {
  title?: string;
  url?: string;
  source?: string;
  company?: string | null;
  location?: string | null;
  raw_html?: string | null;
  raw_text?: string | null;
};

/**
 * POST /api/jobs/save
 *
 * Saves a job to the central Job Bank (job_posts table).
 * Parses structured data from descriptions when available.
 * Enqueues auto-matching for all active seekers assigned to the AM.
 */
export async function POST(request: Request) {
  let payload: SaveJobPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.title || !payload?.url) {
    return Response.json(
      { success: false, error: "Missing required fields: title, url." },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeJobUrl(payload.url);
  if (!normalizedUrl) {
    return Response.json(
      { success: false, error: "Invalid URL." },
      { status: 400 }
    );
  }

  // Try to extract AM ID from Bearer token (extension auth) or session auth
  let scrapedByAmId: string | null = null;
  let sourceType = "manual";

  // First try extension session auth
  const session = await verifyExtensionSession(request);
  if (session) {
    scrapedByAmId = session.account_manager_id;
    sourceType = "extension_scrape";
  } else {
    const auth = await authenticateRequest(request);
    if (auth.authenticated && auth.user.userType === "am") {
      scrapedByAmId = auth.user.id;
      sourceType = "manual";
    }
  }

  const { data: existingPost, error: existingError } = await supabaseServer
    .from("job_posts")
    .select("id")
    .eq("url", normalizedUrl)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { success: false, error: "Failed to check existing job post." },
      { status: 500 }
    );
  }

  let insertedId: string | null = null;

  if (!existingPost) {
    // Parse structured data from description if available
    let parsedData: { [key: string]: unknown } = {};
    if (payload.raw_text) {
      const parsed = await parseJobPostSmart(
        payload.title,
        payload.company ?? null,
        payload.location ?? null,
        payload.raw_text
      );
      parsedData = { ...parsed };
    }

    const { data: insertedPost, error: insertError } = await supabaseServer
      .from("job_posts")
      .insert({
        title: payload.title,
        url: normalizedUrl,
        source: payload.source ?? "extension",
        company: payload.company ?? null,
        location: payload.location ?? null,
        description_text: payload.raw_text ?? null,
        scraped_by_am_id: scrapedByAmId,
        source_type: sourceType,
        ...parsedData,
        parsed_at: payload.raw_text ? new Date().toISOString() : null,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      })
      .select("id")
      .single();

    if (insertError) {
      return Response.json(
        { success: false, error: "Failed to save job." },
        { status: 500 }
      );
    }

    insertedId = insertedPost.id;

    // Auto-match: enqueue matching for all active seekers assigned to this AM
    if (insertedId && scrapedByAmId) {
      enqueueBackgroundJob("AUTO_MATCH_JOB_POST", {
        job_post_id: insertedId,
        am_id: scrapedByAmId,
      }).catch((err) => console.error("Auto-match enqueue failed:", err));
    }
  } else {
    // Update existing job's last_seen_at
    await supabaseServer
      .from("job_posts")
      .update({
        last_seen_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", existingPost.id);
  }

  const { error: savedJobsError } = await supabaseServer.from("saved_jobs").upsert(
    {
      title: payload.title,
      url: normalizedUrl,
      source: payload.source ?? "extension",
      raw_html: payload.raw_html ?? null,
      raw_text: payload.raw_text ?? null,
    },
    { onConflict: "url" }
  );

  if (savedJobsError) {
    return Response.json(
      { success: false, error: "Failed to save job." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    id: insertedId || existingPost?.id,
    duplicate: Boolean(existingPost),
    needs_attention: false,
  });
}
