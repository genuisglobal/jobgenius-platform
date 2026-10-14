import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { crawlCareerPageJobs, resolveCareerPageSource } from "@/lib/career-page-sources";
import { requireOpsAuth } from "@/lib/ops-auth";

/**
 * POST /api/admin/career-crawl
 *
 * Crawl monitored company career pages (Greenhouse/Lever/Ashby/Workday/
 * SmartRecruiters boards) and upsert discovered jobs into external_jobs.
 *
 * Auth: Admin AM or OPS key.
 */
export async function POST(request: Request) {
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { data: amData } = await supabaseAdmin
      .from("account_managers")
      .select("role")
      .eq("id", amResult.accountManager.id)
      .single();
    if (!amData || !isAdminRole(amData.role)) {
      return Response.json({ error: "Admin access required." }, { status: 403 });
    }
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from("company_career_pages")
    .select("*")
    .eq("is_active", true);

  if (pagesError || !pages) {
    return Response.json({ error: "Failed to load career pages." }, { status: 500 });
  }

  const results: Array<{ company: string; ats: string; jobs_found: number; error?: string }> = [];
  let totalJobs = 0;

  for (const page of pages) {
    try {
      const { isSupported } = resolveCareerPageSource(page);
      if (!isSupported) {
        results.push({
          company: page.company_name,
          ats: page.ats_type ?? "unknown",
          jobs_found: 0,
          error: "Unsupported ATS or missing board_token",
        });
        continue;
      }
      const jobs = await crawlCareerPageJobs(page);

      if (jobs.length > 0) {
        const rows = jobs.map((job) => ({
          external_id: job.external_id,
          source: job.source,
          title: job.title,
          company_name: job.company_name,
          company_logo: job.company_logo,
          location: job.location,
          salary: job.salary,
          job_type: job.job_type,
          category: job.category,
          url: job.url,
          fetched_at: job.fetched_at,
          is_stale: false,
        }));

        const { error: upsertError } = await supabaseAdmin
          .from("external_jobs")
          .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: false });

        if (upsertError) {
          results.push({
            company: page.company_name,
            ats: page.ats_type ?? "unknown",
            jobs_found: 0,
            error: upsertError.message,
          });
          continue;
        }
      }

      const { error: pageUpdateError } = await supabaseAdmin
        .from("company_career_pages")
        .update({
          last_checked_at: new Date().toISOString(),
          jobs_found: jobs.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", page.id);

      if (pageUpdateError) {
        console.error("[career-crawl] failed to update career page metadata:", pageUpdateError);
      }

      totalJobs += jobs.length;
      results.push({
        company: page.company_name,
        ats: page.ats_type ?? "unknown",
        jobs_found: jobs.length,
      });
    } catch (err) {
      results.push({
        company: page.company_name,
        ats: page.ats_type ?? "unknown",
        jobs_found: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    pages_crawled: pages.length,
    total_jobs: totalJobs,
    results,
  });
}
