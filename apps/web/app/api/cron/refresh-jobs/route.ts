import { NextResponse } from 'next/server';
import { runJobRefresh } from '@/lib/jobRefreshAgent';
import { crawlCareerPages } from '@/lib/careerPageCrawler';

/**
 * GET /api/cron/refresh-jobs
 *
 * Vercel Cron endpoint (runs daily at 06:00 UTC).
 * Also callable from GitHub Actions with Authorization: Bearer <CRON_SECRET>.
 *
 * 1. Fetches from all external job APIs (12 providers)
 * 2. Crawls monitored company career pages (Greenhouse/Lever/Ashby/Workday/SmartRecruiters)
 *
 * Auth: checked via CRON_SECRET env var. In development (NODE_ENV !== 'production'),
 * requests from localhost are allowed without a secret.
 */
export async function GET(request: Request) {
  // Verify CRON_SECRET (Vercel sets this automatically for cron routes)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    if (!isVercelCron && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Production without a secret configured — block for safety
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 });
  }

  try {
    // Phase 1: Refresh from external APIs
    const summary = await runJobRefresh('vercel-cron');

    // Phase 2: Crawl monitored career pages (non-blocking on failure)
    let careerCrawlResult = { pages_crawled: 0, total_jobs: 0 };
    try {
      careerCrawlResult = await crawlCareerPages();
    } catch (err) {
      console.error('Career page crawl failed:', err);
    }

    return NextResponse.json({
      success: true,
      ...summary,
      career_crawl: careerCrawlResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
