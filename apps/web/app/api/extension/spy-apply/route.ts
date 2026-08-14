import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { getActorFromHeaders } from "@/lib/actor";
import { detectAtsType } from "@/lib/apply";
import { isActiveClient } from "@/lib/intake";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { parseJobPostSmart } from "@/lib/matching";
import { normalizeJobUrl } from "@/lib/job-url";

type SpyApplyPayload = {
  job?: {
    title?: string;
    url?: string;
    source?: string | null;
    company?: string | null;
    location?: string | null;
    raw_text?: string | null;
  };
  note?: string | null;
  job_seeker_id?: string | null;
};

export async function POST(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    let payload: SpyApplyPayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const jobSeekerId = payload.job_seeker_id ?? session.active_job_seeker_id;
    if (!jobSeekerId) {
      return NextResponse.json(
        { error: "No active job seeker selected." },
        { status: 400 }
      );
    }

    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", session.account_manager_id)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Not authorized for this job seeker." },
        { status: 403 }
      );
    }

    if (!(await isActiveClient(jobSeekerId))) {
      return NextResponse.json(
        { error: "Live applications are only allowed for active clients." },
        { status: 409 }
      );
    }

    const title = payload.job?.title?.trim();
    const rawUrl = payload.job?.url?.trim();
    if (!title || !rawUrl) {
      return NextResponse.json(
        { error: "Missing required job fields: title and url." },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeJobUrl(rawUrl);
    if (!normalizedUrl) {
      return NextResponse.json(
        { error: "Invalid job URL." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const rawText = payload.job?.raw_text?.trim() || null;
    const company = payload.job?.company?.trim() || null;
    const location = payload.job?.location?.trim() || null;
    const source = payload.job?.source?.trim() || "extension_spy";

    let jobPostId: string | null = null;

    const { data: existingPost } = await supabaseAdmin
      .from("job_posts")
      .select("id, title, company, location, description_text")
      .eq("url", normalizedUrl)
      .maybeSingle();

    if (existingPost?.id) {
      jobPostId = existingPost.id;
      const patch: Record<string, unknown> = {
        last_seen_at: nowIso,
        is_active: true,
      };

      if (!existingPost.title && title) {
        patch.title = title;
      }
      if (!existingPost.company && company) {
        patch.company = company;
      }
      if (!existingPost.location && location) {
        patch.location = location;
      }
      if (!existingPost.description_text && rawText) {
        patch.description_text = rawText;
      }

      await supabaseAdmin.from("job_posts").update(patch).eq("id", existingPost.id);
    } else {
      const parsedData = rawText
        ? await parseJobPostSmart(title, company, location, rawText)
        : null;

      const { data: insertedPost, error: insertPostError } = await supabaseAdmin
        .from("job_posts")
        .insert({
          title,
          url: normalizedUrl,
          source,
          company,
          location,
          description_text: rawText,
          scraped_by_am_id: session.account_manager_id,
          source_type: "extension_spy",
          ...(parsedData ?? {}),
          parsed_at: rawText ? nowIso : null,
          last_seen_at: nowIso,
          is_active: true,
        })
        .select("id")
        .single();

      if (insertPostError || !insertedPost?.id) {
        return NextResponse.json(
          { error: "Failed to save job post." },
          { status: 500 }
        );
      }

      jobPostId = insertedPost.id;
    }

    await supabaseAdmin.from("saved_jobs").upsert(
      {
        title,
        url: normalizedUrl,
        source,
        raw_text: rawText,
      },
      { onConflict: "url" }
    );

    if (!jobPostId) {
      return NextResponse.json(
        { error: "Failed to resolve tracked job post." },
        { status: 500 }
      );
    }

    const { data: existingRun } = await supabaseAdmin
      .from("application_runs")
      .select("id, queue_id, status, current_step")
      .eq("job_seeker_id", jobSeekerId)
      .eq("job_post_id", jobPostId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const actor = getActorFromHeaders(request.headers);
    const note = payload.note?.trim() || "Tracked as applied by JobGenius Spy.";

    if (existingRun?.id) {
      const status = String(existingRun.status || "").toUpperCase();
      if (status === "APPLIED" || status === "COMPLETED") {
        return NextResponse.json({
          success: true,
          already_tracked: true,
          job_post_id: jobPostId,
          run_id: existingRun.id,
          status,
        });
      }

      const { error: updateRunError } = await supabaseAdmin
        .from("application_runs")
        .update({
          status: "APPLIED",
          needs_attention_reason: null,
          last_seen_url: normalizedUrl,
          locked_at: null,
          locked_by: null,
          claim_token: null,
          last_error: null,
          last_error_code: null,
          updated_at: nowIso,
        })
        .eq("id", existingRun.id);

      if (updateRunError) {
        return NextResponse.json(
          { error: "Failed to update existing application run." },
          { status: 500 }
        );
      }

      if (existingRun.queue_id) {
        await supabaseAdmin
          .from("application_queue")
          .update({
            status: "APPLIED",
            category: "applied",
            last_error: null,
            updated_at: nowIso,
          })
          .eq("id", existingRun.queue_id);
      }

      await supabaseAdmin.from("application_step_events").insert({
        run_id: existingRun.id,
        step: existingRun.current_step || "CONFIRMATION",
        event_type: "APPLIED",
        message: note,
      });

      await supabaseAdmin.from("apply_run_events").insert({
        run_id: existingRun.id,
        level: "INFO",
        event_type: "APPLIED",
        actor,
        payload: { note, spy: true },
      });

      return NextResponse.json({
        success: true,
        updated_existing_run: true,
        job_post_id: jobPostId,
        run_id: existingRun.id,
        status: "APPLIED",
      });
    }

    let queueId: string | null = null;
    const { data: existingQueue } = await supabaseAdmin
      .from("application_queue")
      .select("id")
      .eq("job_seeker_id", jobSeekerId)
      .eq("job_post_id", jobPostId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingQueue?.id) {
      queueId = existingQueue.id;
      await supabaseAdmin
        .from("application_queue")
        .update({
          status: "APPLIED",
          category: "manual_spy",
          last_error: null,
          updated_at: nowIso,
        })
        .eq("id", queueId);
    } else {
      const { data: insertedQueue, error: queueError } = await supabaseAdmin
        .from("application_queue")
        .insert({
          job_post_id: jobPostId,
          job_seeker_id: jobSeekerId,
          status: "APPLIED",
          category: "manual_spy",
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (queueError || !insertedQueue?.id) {
        return NextResponse.json(
          { error: "Failed to create application queue record." },
          { status: 500 }
        );
      }

      queueId = insertedQueue.id;
    }

    const atsType = detectAtsType(source, normalizedUrl);
    const { data: createdRun, error: runError } = await supabaseAdmin
      .from("application_runs")
      .insert({
        queue_id: queueId,
        job_seeker_id: jobSeekerId,
        job_post_id: jobPostId,
        ats_type: atsType,
        status: "APPLIED",
        current_step: "CONFIRMATION",
        last_seen_url: normalizedUrl,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (runError || !createdRun?.id) {
      return NextResponse.json(
        { error: "Failed to create applied run." },
        { status: 500 }
      );
    }

    await supabaseAdmin.from("application_step_events").insert({
      run_id: createdRun.id,
      step: "CONFIRMATION",
      event_type: "APPLIED",
      message: note,
    });

    await supabaseAdmin.from("apply_run_events").insert({
      run_id: createdRun.id,
      level: "INFO",
      event_type: "APPLIED",
      actor,
      payload: { note, spy: true },
    });

    return NextResponse.json({
      success: true,
      job_post_id: jobPostId,
      run_id: createdRun.id,
      status: "APPLIED",
      source: "job_spy",
    });
  } catch (error) {
    console.error("Extension spy-apply error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
