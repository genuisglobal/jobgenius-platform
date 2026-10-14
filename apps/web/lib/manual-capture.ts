// AM quick-log for work that happens off-platform (WhatsApp, company portals,
// recruiter calls): manual applications and interviews. Both need a job_posts
// row; when the AM has no link we create one with a placeholder URL so the
// existing interviews/applications model (job_post_id NOT NULL) still holds.

import { randomUUID } from "crypto";
import { jobIdentityKey } from "@/lib/apply/duplicate-check";

/** Statuses that mean an application was actually submitted. */
export const SUCCESSFUL_APPLICATION_STATUSES = ["APPLIED", "COMPLETED"];

export const MANUAL_JOB_URL_PREFIX = "manual-log:";

export function normalizeJobUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isManualPlaceholderUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith(MANUAL_JOB_URL_PREFIX));
}

function clean(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

export type ManualJobInput = {
  company: unknown;
  title: unknown;
  url?: unknown;
  location?: unknown;
};

export type ValidatedJob = { company: string; title: string; url: string | null; location: string | null };

export function validateManualJob(input: ManualJobInput): ValidatedJob | { error: string } {
  const company = clean(input.company);
  const title = clean(input.title);
  if (!company) return { error: "Company is required." };
  if (!title) return { error: "Role / job title is required." };
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  const url = normalizeJobUrl(rawUrl);
  if (rawUrl && !url) return { error: "Job link must be a web address (https://…)." };
  return { company, title, url, location: clean(input.location) };
}

/**
 * Reuse the job post the seeker already applied to (same link, or same
 * normalized company + title among their runs), else create one.
 */
export async function findOrCreateJobPost(
  jobSeekerId: string,
  job: ValidatedJob
): Promise<{ id: string; created: boolean }> {
  // Lazy so the validators above stay importable without Supabase env (tests).
  const { supabaseServer } = await import("@/lib/supabase/server");

  if (job.url) {
    const { data: existing } = await supabaseServer
      .from("job_posts")
      .select("id")
      .eq("url", job.url)
      .maybeSingle();
    if (existing?.id) return { id: existing.id as string, created: false };
  }

  const key = jobIdentityKey(job.company, job.title);
  if (key) {
    const { data: runs } = await supabaseServer
      .from("application_runs")
      .select("job_post_id, job_posts(company, title)")
      .eq("job_seeker_id", jobSeekerId)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const run of (runs ?? []) as unknown as Array<{
      job_post_id: string;
      job_posts: { company: string | null; title: string | null } | null;
    }>) {
      if (run.job_posts && jobIdentityKey(run.job_posts.company, run.job_posts.title) === key) {
        return { id: run.job_post_id, created: false };
      }
    }
  }

  const { data: created, error } = await supabaseServer
    .from("job_posts")
    .insert({
      url: job.url ?? `${MANUAL_JOB_URL_PREFIX}${randomUUID()}`,
      title: job.title,
      company: job.company,
      location: job.location,
      source: "manual_log",
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    // A concurrent insert of the same link wins the unique constraint; reuse it.
    if (job.url) {
      const { data: raced } = await supabaseServer
        .from("job_posts")
        .select("id")
        .eq("url", job.url)
        .maybeSingle();
      if (raced?.id) return { id: raced.id as string, created: false };
    }
    throw new Error(error?.message ?? "Could not create the job record.");
  }
  return { id: created.id as string, created: true };
}

/** Parse an ISO timestamp that must carry a timezone (the form sends one). */
export function parseZonedDateTime(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(raw.trim())) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
