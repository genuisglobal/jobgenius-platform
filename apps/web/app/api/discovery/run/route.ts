import { supabaseServer } from "@/lib/supabase/server";
import { getAccountManagerFromRequest } from "@/lib/am-access";

type RunDiscoveryPayload = {
  source_name: string;
  search_url: string;
  job_seeker_id?: string;
  options?: {
    max_pages?: number;
    max_jobs?: number;
    fetch_descriptions?: boolean;
  };
};

/**
 * POST /api/discovery/run
 *
 * Triggers an ad-hoc job discovery run.
 * This endpoint queues the discovery to be processed by the runner.
 *
 * For immediate results, use the runner's CLI directly:
 *   node src/discovery-cli.js linkedin "https://linkedin.com/jobs/search?..."
 *   node src/discovery-cli.js smartrecruiters "https://jobs.smartrecruiters.com/Stripe"
 *   node src/discovery-cli.js workday "https://wd5.myworkdaysite.com/recruiting/company/careers"
 */
export async function POST(request: Request) {
  let payload: RunDiscoveryPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload.source_name || !payload.search_url) {
    return Response.json(
      { success: false, error: "Missing required fields: source_name, search_url." },
      { status: 400 }
    );
  }

  // Auth check
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  // Validate source exists
  const { data: source, error: sourceError } = await supabaseServer
    .from("job_sources")
    .select("id, name, enabled")
    .eq("name", payload.source_name)
    .single();

  if (sourceError || !source) {
    return Response.json(
      { success: false, error: `Unknown job source: ${payload.source_name}` },
      { status: 400 }
    );
  }

  if (!source.enabled) {
    return Response.json(
      { success: false, error: `Job source ${payload.source_name} is disabled.` },
      { status: 400 }
    );
  }

  // Create a discovery run record
  const { data: run, error: runError } = await supabaseServer
    .from("job_discovery_runs")
    .insert({
      search_id: null, // Ad-hoc run, no associated search
      source_name: payload.source_name,
      status: "PENDING",
      metadata: {
        search_url: payload.search_url,
        options: payload.options,
        triggered_by: amResult.accountManager.email,
        ad_hoc: true,
      },
    })
    .select()
    .single();

  if (runError) {
    return Response.json(
      { success: false, error: "Failed to create discovery run." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    run_id: run.id,
    message: "Discovery run queued. Use GET /api/discovery/runs/[id] to check status.",
    instructions: {
      runner_cli: `cd apps/runner && node src/discovery-cli.js ${payload.source_name} "${payload.search_url}"`,
      note: "For immediate results, run the discovery CLI directly on the runner.",
    },
  });
}

/**
 * GET /api/discovery/run
 *
 * Returns information about the discovery system.
 */
export async function GET() {
  const { data: sources } = await supabaseServer
    .from("job_sources")
    .select("name, base_url, enabled")
    .eq("enabled", true);

  return Response.json({
    success: true,
    available_sources: sources ?? [],
    usage: {
      endpoint: "POST /api/discovery/run",
      body: {
        source_name: "linkedin | indeed | glassdoor | greenhouse | lever | ashby | workday | smartrecruiters",
        search_url: "Full search URL from the job board or ATS career page",
        job_seeker_id: "(optional) Associate discovered jobs with a seeker",
        options: {
          max_pages: "Maximum pages to scrape (default: 5)",
          max_jobs: "Maximum jobs to collect (default: 50)",
          fetch_descriptions: "Also fetch full job descriptions (default: true)",
        },
      },
    },
    example: {
      source_name: "smartrecruiters",
      search_url: "https://jobs.smartrecruiters.com/Stripe",
      options: {
        max_jobs: 50,
      },
    },
  });
}
