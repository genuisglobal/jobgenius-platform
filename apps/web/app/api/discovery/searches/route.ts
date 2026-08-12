import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type CreateSearchPayload = {
  job_seeker_id: string;
  source_name: string;
  search_name: string;
  search_url: string;
  keywords?: string[];
  location?: string;
  filters?: Record<string, unknown>;
  run_frequency_hours?: number;
};

/**
 * GET /api/discovery/searches
 *
 * Returns discovery searches for a job seeker.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobSeekerId = searchParams.get("job_seeker_id");

  if (!jobSeekerId) {
    return Response.json(
      { success: false, error: "Missing job_seeker_id parameter." },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data: searches, error } = await supabaseServer
    .from("job_discovery_searches")
    .select(`
      *,
      job_sources (name, base_url)
    `)
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json(
      { success: false, error: "Failed to fetch searches." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    searches: searches ?? [],
  });
}

/**
 * POST /api/discovery/searches
 *
 * Creates a new discovery search for a job seeker.
 */
export async function POST(request: Request) {
  let payload: CreateSearchPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload.job_seeker_id || !payload.source_name || !payload.search_name || !payload.search_url) {
    return Response.json(
      { success: false, error: "Missing required fields: job_seeker_id, source_name, search_name, search_url." },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, payload.job_seeker_id);
  if (!access.ok) return access.response;

  // Get source ID from name
  const { data: source, error: sourceError } = await supabaseServer
    .from("job_sources")
    .select("id")
    .eq("name", payload.source_name)
    .single();

  if (sourceError || !source) {
    return Response.json(
      { success: false, error: `Unknown job source: ${payload.source_name}` },
      { status: 400 }
    );
  }

  // Create the search
  const { data: search, error } = await supabaseServer
    .from("job_discovery_searches")
    .insert({
      job_seeker_id: payload.job_seeker_id,
      source_id: source.id,
      search_name: payload.search_name,
      search_url: payload.search_url,
      keywords: payload.keywords ?? [],
      location: payload.location,
      filters: payload.filters ?? {},
      run_frequency_hours: payload.run_frequency_hours ?? 24,
      enabled: true,
    })
    .select()
    .single();

  if (error) {
    return Response.json(
      { success: false, error: "Failed to create search." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    search,
  });
}
