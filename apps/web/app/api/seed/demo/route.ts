// Disabled permanently: this route used to seed demo/fixture data (DemoCorp
// jobs, a "Demo Job Seeker") directly into shared production tables, with no
// isolation from real records. An env-var toggle (ALLOW_SEED_ENDPOINTS) made
// it possible to run in production by misconfiguration, and it did — leaving
// thousands of orphaned job_match_scores rows and job_posts that retention
// could never archive (see the blockedIds logic in
// app/api/ops/retention/run/route.ts, which treats any historical queue/run
// reference as permanent, regardless of status). Cleaned up 2026-07-16.
// If demo data is needed again, seed a local/staging database directly —
// never through a deployed API route.
export async function POST() {
  return Response.json({ success: false, error: "Not found." }, { status: 404 });
}
