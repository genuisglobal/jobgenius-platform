import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { parseJobPostSmart } from "@/lib/matching";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { normalizeJobUrl } from "@/lib/job-url";
import { computeDiscoveredJobContentHash } from "@/lib/discovery/content-hash";
import {
  areLikelyMirroredDiscoveredJobs,
  cleanDiscoveredJobRecord,
} from "@/lib/discovery/job-cleaning";

type DiscoveredJob = {
  external_id: string | null;
  source_name: string;
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  posted_at: string | null;
  description_text: string | null;
  description_html: string | null;
};

type SaveJobsPayload = {
  run_id: string | null;
  jobs: DiscoveredJob[];
};

type ExistingJobPost = {
  id: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  description_text: string | null;
  external_id: string | null;
  source_name: string | null;
  posted_at: string | null;
  times_seen: number | null;
  content_hash: string | null;
};

function preferIncomingText(incoming: string | null | undefined, existing: string | null | undefined) {
  const trimmed = incoming?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : (existing ?? null);
}

function parseDiscoveryTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function buildParsedData(job: {
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  description_text: string | null;
}) {
  if (!job.description_text && !job.salary) {
    return { parsedData: {}, parsedAt: null as string | null };
  }

  return {
    parsedData: await parseJobPostSmart(
      job.title,
      job.company,
      job.location,
      job.description_text,
      job.salary
    ),
    parsedAt: new Date().toISOString(),
  };
}

async function findExistingJob(normalizedUrl: string, externalId: string | null, sourceName: string) {
  const baseSelect =
    "id, url, title, company, location, description_text, external_id, source_name, posted_at, times_seen, content_hash";

  const { data: existingByUrl } = await supabaseServer
    .from("job_posts")
    .select(baseSelect)
    .eq("url", normalizedUrl)
    .maybeSingle();

  if (existingByUrl) {
    return existingByUrl as ExistingJobPost;
  }

  if (!externalId) {
    return null;
  }

  const { data: existingByExtId } = await supabaseServer
    .from("job_posts")
    .select(baseSelect)
    .eq("external_id", externalId)
    .eq("source_name", sourceName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (existingByExtId as ExistingJobPost | null) ?? null;
}

async function findMirroredExistingJob(job: {
  title: string;
  company: string | null;
  location: string | null;
  description_text: string | null;
  posted_at: string | null;
}) {
  const baseSelect =
    "id, url, title, company, location, description_text, external_id, source_name, posted_at, times_seen, content_hash";

  let query = supabaseServer
    .from("job_posts")
    .select(baseSelect)
    .eq("title", job.title)
    .order("last_seen_at", { ascending: false })
    .limit(15);

  query = job.company ? query.eq("company", job.company) : query.is("company", null);
  query = job.location ? query.eq("location", job.location) : query.is("location", null);

  const { data } = await query;
  const candidates = (data ?? []) as ExistingJobPost[];

  return (
    candidates.find((candidate) =>
      areLikelyMirroredDiscoveredJobs(job, {
        title: candidate.title,
        company: candidate.company,
        location: candidate.location,
        description_text: candidate.description_text,
        posted_at: candidate.posted_at,
      })
    ) ?? null
  );
}

/**
 * POST /api/discovery/jobs/save
 *
 * Saves discovered jobs to the database.
 * Handles deduplication by external_id and URL.
 */
export async function POST(request: Request) {
  const authResult = requireOpsAuth(request.headers);
  if (!authResult.ok) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let payload: SaveJobsPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload.jobs || !Array.isArray(payload.jobs)) {
    return Response.json(
      { success: false, error: "Missing or invalid jobs array." },
      { status: 400 }
    );
  }

  let saved = 0;
  let updated = 0;
  let unchanged = 0;
  let duplicates = 0;
  let mirrored = 0;
  let errors = 0;
  const rematchJobIds: string[] = [];

  for (const job of payload.jobs) {
    const cleanedJob = cleanDiscoveredJobRecord(job);
    const normalizedUrl = cleanedJob.url ? normalizeJobUrl(cleanedJob.url) : "";
    const nowIso = new Date().toISOString();

    // Skip jobs without a valid URL or title
    if (!normalizedUrl || !cleanedJob.title) {
      errors++;
      continue;
    }

    try {
      const existing = await findExistingJob(
        normalizedUrl,
        cleanedJob.external_id,
        cleanedJob.source_name
      );
      const mirroredExisting =
        existing ??
        (await findMirroredExistingJob({
          title: cleanedJob.title,
          company: cleanedJob.company,
          location: cleanedJob.location,
          description_text: cleanedJob.description_text,
          posted_at: cleanedJob.posted_at,
        }));
      const matchType = existing ? "direct" : mirroredExisting ? "mirror" : "new";

      if (mirroredExisting) {
        const mergedJob = {
          title: cleanedJob.title,
          company: preferIncomingText(cleanedJob.company, mirroredExisting.company),
          location: preferIncomingText(cleanedJob.location, mirroredExisting.location),
          salary: cleanedJob.salary,
          description_text: preferIncomingText(
            cleanedJob.description_text,
            mirroredExisting.description_text
          ),
          external_id:
            matchType === "mirror"
              ? mirroredExisting.external_id
              : cleanedJob.external_id ?? mirroredExisting.external_id,
          posted_at:
            parseDiscoveryTimestamp(cleanedJob.posted_at) ?? mirroredExisting.posted_at,
        };
        const existingHash =
          mirroredExisting.content_hash ??
          computeDiscoveredJobContentHash({
            title: mirroredExisting.title,
            company: mirroredExisting.company,
            location: mirroredExisting.location,
            salary: null,
            description_text: mirroredExisting.description_text,
          });
        const mergedHash = computeDiscoveredJobContentHash(mergedJob);
        const contentChanged = mergedHash !== existingHash;
        const postedAtChanged = mergedJob.posted_at !== mirroredExisting.posted_at;
        const needsRefresh = contentChanged || postedAtChanged;
        const { parsedData, parsedAt } = await buildParsedData(mergedJob);

        const updatePayload: Record<string, unknown> = {
          external_id:
            matchType === "mirror" && mirroredExisting.external_id
              ? mirroredExisting.external_id
              : mergedJob.external_id,
          discovery_run_id: payload.run_id,
          last_seen_at: nowIso,
          is_active: true,
          times_seen: (mirroredExisting.times_seen ?? 1) + 1,
          content_hash: mergedHash,
          last_discovery_status:
            matchType === "mirror"
              ? needsRefresh
                ? "mirrored_updated"
                : "mirrored_duplicate"
              : needsRefresh
              ? "updated"
              : "unchanged",
        };

        if (postedAtChanged) {
          updatePayload.posted_at = mergedJob.posted_at;
        }

        if (contentChanged) {
          Object.assign(updatePayload, {
            title: mergedJob.title,
            company: mergedJob.company,
            location: mergedJob.location,
            description_text: mergedJob.description_text,
            last_content_change_at: nowIso,
          });
          if (parsedAt) {
            Object.assign(updatePayload, {
              ...parsedData,
              parsed_at: parsedAt,
            });
          }
        }

        const { error: updateError } = await supabaseServer
          .from("job_posts")
          .update(updatePayload)
          .eq("id", mirroredExisting.id);

        if (updateError) {
          errors++;
          continue;
        }

        if (needsRefresh) {
          updated++;
          rematchJobIds.push(mirroredExisting.id);
        } else {
          unchanged++;
        }
        if (matchType === "mirror") {
          mirrored++;
        }
        continue;
      }

      const insertedJob = {
        title: cleanedJob.title,
        company: cleanedJob.company,
        location: cleanedJob.location,
        salary: cleanedJob.salary,
        description_text: cleanedJob.description_text,
      };
      const contentHash = computeDiscoveredJobContentHash(insertedJob);
      const { parsedData, parsedAt } = await buildParsedData(insertedJob);

      // Insert new job
      const { data: insertedPost, error: insertError } = await supabaseServer
        .from("job_posts")
        .insert({
          url: normalizedUrl,
          title: cleanedJob.title,
          company: cleanedJob.company,
          location: cleanedJob.location,
          description_text: cleanedJob.description_text,
          external_id: cleanedJob.external_id,
          source_name: cleanedJob.source_name,
          source: cleanedJob.source_name, // Also set the legacy source field
          discovery_run_id: payload.run_id,
          discovered_at: nowIso,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          is_active: true,
          times_seen: 1,
          content_hash: contentHash,
          last_content_change_at: nowIso,
          last_discovery_status: "inserted",
          posted_at: parseDiscoveryTimestamp(cleanedJob.posted_at),
          // Parsed structured data
          ...parsedData,
          parsed_at: parsedAt,
        })
        .select("id")
        .single();

      if (insertError) {
        // Check if it's a unique constraint violation (race condition)
        if (insertError.code === "23505") {
          duplicates++;
        } else {
          errors++;
        }
      } else {
        saved++;
        if (insertedPost?.id) {
          rematchJobIds.push(insertedPost.id);
        }
      }
    } catch (e) {
      errors++;
    }
  }

  // Auto-match inserted or materially updated jobs against all active seekers.
  if (rematchJobIds.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < rematchJobIds.length; i += chunkSize) {
      const chunk = rematchJobIds.slice(i, i + chunkSize);
      enqueueBackgroundJob("AUTO_MATCH_JOB_POSTS", {
        job_post_ids: chunk,
      }).catch((err) => console.error("Discovery auto-match enqueue failed:", err));
    }
  }

  return Response.json({
    success: true,
    saved,
    updated,
    unchanged,
    duplicates,
    mirrored,
    errors,
    total: payload.jobs.length,
  });
}
