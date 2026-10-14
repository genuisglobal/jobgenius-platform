import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

// GET: List all pending matches for AM's network contacts
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") || "pending";

  // Get AM's contact IDs first
  const { data: contacts } = await supabaseAdmin
    .from("network_contacts")
    .select("id")
    .eq("account_manager_id", auth.user.id)
    .eq("status", "active");

  const contactIds = (contacts || []).map((c) => c.id);
  if (contactIds.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from("network_contact_matches")
    .select(`
      id, network_contact_id, job_post_id, job_seeker_id,
      match_reason, status, created_at,
      network_contacts (id, full_name, contact_type, company_name, email),
      job_posts (id, title, company, url),
      job_seekers (id, full_name, email)
    `, { count: "exact" })
    .in("network_contact_id", contactIds)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load matches." }, { status: 500 });
  }

  return NextResponse.json({
    matches: data || [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}

// PUT: Update match status
export async function PUT(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { match_id: string; status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.match_id || !body.status) {
    return NextResponse.json(
      { error: "match_id and status are required." },
      { status: 400 }
    );
  }

  const validStatuses = ["pending", "contacted", "responded", "dismissed"];
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // Verify ownership via network_contacts join
  const { data: match } = await supabaseAdmin
    .from("network_contact_matches")
    .select("id, network_contact_id, network_contacts (account_manager_id)")
    .eq("id", body.match_id)
    .single();

  if (
    !match ||
    (match.network_contacts as unknown as { account_manager_id: string })
      ?.account_manager_id !== auth.user.id
  ) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("network_contact_matches")
    .update({ status: body.status })
    .eq("id", body.match_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update match." }, { status: 500 });
  }

  return NextResponse.json({ match: updated });
}
