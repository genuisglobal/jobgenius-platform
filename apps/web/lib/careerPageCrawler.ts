/**
 * Career Page Crawler
 *
 * Fetches jobs from monitored company career pages (Greenhouse/Lever/Ashby/
 * Workday/SmartRecruiters) and upserts them into the external_jobs table.
 */

import { supabaseAdmin } from "@/lib/auth";
import { crawlCareerPageJobs, resolveCareerPageSource } from "@/lib/career-page-sources";

export async function crawlCareerPages(): Promise<{
  pages_crawled: number;
  total_jobs: number;
}> {
  const { data: pages } = await supabaseAdmin
    .from("company_career_pages")
    .select("*")
    .eq("is_active", true);

  if (!pages || pages.length === 0) {
    return { pages_crawled: 0, total_jobs: 0 };
  }

  let totalJobs = 0;

  for (const page of pages) {
    try {
      const { isSupported } = resolveCareerPageSource(page);
      if (!isSupported) continue;
      const jobs = await crawlCareerPageJobs(page);

      if (jobs.length > 0) {
        const rows = jobs.map((j) => ({
          external_id: j.external_id,
          source: j.source,
          title: j.title,
          company_name: j.company_name,
          company_logo: j.company_logo,
          location: j.location,
          salary: j.salary,
          job_type: j.job_type,
          category: j.category,
          url: j.url,
          fetched_at: j.fetched_at,
          is_stale: false,
        }));

        await supabaseAdmin
          .from("external_jobs")
          .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: false });
      }

      await supabaseAdmin
        .from("company_career_pages")
        .update({
          last_checked_at: new Date().toISOString(),
          jobs_found: jobs.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", page.id);

      totalJobs += jobs.length;
    } catch (err) {
      console.error(`Career crawl failed for ${page.company_name}:`, err);
    }
  }

  return { pages_crawled: pages.length, total_jobs: totalJobs };
}
