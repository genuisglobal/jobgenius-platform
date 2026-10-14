// ============================================================
// Fuzzy duplicate-application gate.
//
// The exact-duplicate check in /api/apply/start only guards the same
// queue item. Job boards constantly repost the same opening under a
// new external id ("Acme, Inc." today, "Acme Inc" next week; "Sr.
// Software Engineer (Remote)" vs "Senior Software Engineer"), and the
// discovery pipeline promotes each repost as a fresh job_post — so a
// seeker could be re-applied to the same job days apart. Applying
// twice looks careless to the employer and burns the client's
// credibility, which is the product.
//
// This module normalizes (company, title) into an identity key and
// checks a seeker's recent runs (default 30 days, cross-channel) for
// a match before an apply is allowed to proceed. Enforced:
//   * at claim time in lib/apply/claim-task.ts and GET /api/apply/next
//     (duplicate runs are auto-CANCELLED with reason
//     DUPLICATE_APPLICATION and the claimer moves on), and
//   * at run creation in POST /api/apply/start.
// ============================================================

/** Legal-entity suffixes stripped (repeatedly) from the END of a company name. */
const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "llp",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "plc",
  "sa",
  "ag",
  "pty",
  "pvt",
  "bv",
  "oy",
  "ab",
]);

/** Title tokens that describe the arrangement, not the role. */
const TITLE_NOISE_WORDS = new Set([
  "remote",
  "hybrid",
  "onsite",
  "on-site",
  "contract",
  "contractor",
  "fulltime",
  "full-time",
  "parttime",
  "part-time",
  "permanent",
  "urgent",
  "immediate",
  "new",
]);

/** Common abbreviation → canonical form, applied token-wise to titles. */
const TITLE_TOKEN_ALIASES: Record<string, string> = {
  "sr": "senior",
  "sr.": "senior",
  "jr": "junior",
  "jr.": "junior",
  "mgr": "manager",
  "engr": "engineer",
  "eng": "engineer",
  "dev": "developer",
  "swe": "software engineer",
};

export function normalizeCompanyName(company: unknown): string {
  const cleaned = String(company ?? "")
    .toLowerCase()
    .replace(/[&]/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const tokens = cleaned.split(" ");
  // Strip legal suffixes from the end only ("Co" in "Co Robotics" is not a
  // suffix), and never strip the whole name away.
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

export function normalizeJobTitle(title: unknown): string {
  let cleaned = String(title ?? "")
    .toLowerCase()
    // Drop parenthesized/bracketed qualifiers: "(Remote)", "[Contract]".
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    // Drop requisition ids: "#12345", "req 12345", "job id 9-876".
    .replace(/#\s*[a-z0-9-]+/g, " ")
    .replace(/\b(?:req|requisition|job\s*id)\s*[:#]?\s*[a-z0-9-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const tokens = cleaned
    .split(" ")
    .map((t) => TITLE_TOKEN_ALIASES[t] ?? t)
    .filter((t) => t && !TITLE_NOISE_WORDS.has(t));

  // NOTE: level markers (ii, iii, 2, 3, senior/junior after aliasing) are
  // deliberately KEPT — "Engineer II" and "Engineer III" are different jobs.
  return tokens.join(" ");
}

/**
 * Stable identity for "the same opening", or null when either half is
 * missing — we never call something a duplicate on partial information.
 */
export function jobIdentityKey(company: unknown, title: unknown): string | null {
  const c = normalizeCompanyName(company);
  const t = normalizeJobTitle(title);
  if (!c || !t) return null;
  return `${c}::${t}`;
}

export type RunForDupCheck = {
  id: string;
  job_post_id: string;
  status: string;
  company: unknown;
  title: unknown;
};

/** Run statuses that mean "this seeker applied or is applying". READY is
 *  excluded (queued-not-started: first claim wins), as are terminal
 *  failures/cancellations. */
export const APPLIED_OR_APPLYING_STATUSES = [
  "RUNNING",
  "RETRYING",
  "NEEDS_ATTENTION",
  "COMPLETED",
  "APPLIED",
  "SUBMITTED",
];

/**
 * Pure matcher: first prior run whose (company, title) identity matches the
 * target job. Same-job_post_id runs are excluded — that exact case is the
 * /start queue-item guard's job, and at claim time the candidate itself
 * would trivially match.
 */
export function findDuplicateInRuns(
  target: { jobPostId: string; company: unknown; title: unknown },
  priorRuns: RunForDupCheck[]
): RunForDupCheck | null {
  const targetKey = jobIdentityKey(target.company, target.title);
  if (!targetKey) return null;

  for (const run of priorRuns) {
    if (run.job_post_id === target.jobPostId) continue;
    if (jobIdentityKey(run.company, run.title) === targetKey) return run;
  }
  return null;
}

export type DuplicateMatch = {
  duplicate_run_id: string;
  duplicate_job_post_id: string;
  duplicate_status: string;
  company: string;
  title: string;
};

const DEFAULT_WINDOW_DAYS = 30;

/**
 * DB check: does `jobSeekerId` have an applied/applying run in the last
 * `windowDays` for the same normalized (company, title) as `jobPostId`?
 * Fails open (returns null) on any load error — a broken dup check must
 * not halt applying; the velocity/claim layers still function.
 */
export async function findRecentDuplicateRun(
  jobSeekerId: string,
  jobPostId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS
): Promise<DuplicateMatch | null> {
  // Lazy import so the pure normalizers above stay importable without
  // Supabase env (unit tests) — same pattern as lib/apply/velocity.ts.
  const { supabaseServer } = await import("@/lib/supabase/server");

  const { data: targetPost } = await supabaseServer
    .from("job_posts")
    .select("id, company, title")
    .eq("id", jobPostId)
    .maybeSingle();
  if (!targetPost || !jobIdentityKey(targetPost.company, targetPost.title)) {
    return null;
  }

  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: runs, error: runsError } = await supabaseServer
    .from("application_runs")
    .select("id, job_post_id, status, created_at")
    .eq("job_seeker_id", jobSeekerId)
    .in("status", APPLIED_OR_APPLYING_STATUSES)
    .gte("created_at", since);
  if (runsError || !runs || runs.length === 0) return null;

  const priorPostIds = Array.from(
    new Set(
      runs
        .map((r) => r.job_post_id as string)
        .filter((id) => id && id !== jobPostId)
    )
  );
  if (priorPostIds.length === 0) return null;

  // Two-step fetch (ids first, then posts) — see MEMORY: never feed a
  // query builder into .in(), and avoid relying on PostgREST embeds.
  const { data: posts } = await supabaseServer
    .from("job_posts")
    .select("id, company, title")
    .in("id", priorPostIds);
  const postById = new Map((posts ?? []).map((p) => [p.id as string, p]));

  const priorRuns: RunForDupCheck[] = runs
    .map((r) => {
      const post = postById.get(r.job_post_id as string);
      return post
        ? {
            id: r.id as string,
            job_post_id: r.job_post_id as string,
            status: r.status as string,
            company: post.company,
            title: post.title,
          }
        : null;
    })
    .filter((r): r is RunForDupCheck => r !== null);

  const match = findDuplicateInRuns(
    {
      jobPostId,
      company: targetPost.company,
      title: targetPost.title,
    },
    priorRuns
  );
  if (!match) return null;

  return {
    duplicate_run_id: match.id,
    duplicate_job_post_id: match.job_post_id,
    duplicate_status: match.status,
    company: String(match.company ?? ""),
    title: String(match.title ?? ""),
  };
}

/**
 * Terminal-cancel a locked run that turned out to be a fuzzy duplicate, and
 * release its queue item, with an audit event. Used by the claim paths.
 */
export async function cancelDuplicateRun(
  run: { id: string; queue_id?: string | null },
  duplicate: DuplicateMatch,
  actor: string
): Promise<void> {
  const { supabaseServer } = await import("@/lib/supabase/server");
  const nowIso = new Date().toISOString();
  const message = `Duplicate of run ${duplicate.duplicate_run_id} (${duplicate.company} — ${duplicate.title}, ${duplicate.duplicate_status}).`;

  await supabaseServer
    .from("application_runs")
    .update({
      status: "CANCELLED",
      last_error: message,
      last_error_code: "DUPLICATE_APPLICATION",
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (run.queue_id) {
    await supabaseServer
      .from("application_queue")
      .update({
        status: "CANCELLED",
        last_error: message,
        updated_at: nowIso,
      })
      .eq("id", run.queue_id);
  }

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "WARN",
    event_type: "DUPLICATE_CANCELLED",
    actor,
    payload: {
      reason: "DUPLICATE_APPLICATION",
      duplicate_run_id: duplicate.duplicate_run_id,
      duplicate_job_post_id: duplicate.duplicate_job_post_id,
      company: duplicate.company,
      title: duplicate.title,
    },
  });
}
