import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { normalizeCompanyDomain } from "@/lib/network/matching";
import type { CreateNetworkContactInput } from "@/lib/network/types";

// GET: List network contacts for the current AM
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get("type");

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from("network_contacts")
    .select("*", { count: "exact" })
    .eq("account_manager_id", auth.user.id)
    .neq("status", "inactive")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (typeFilter === "recruiter" || typeFilter === "referral") {
    query = query.eq("contact_type", typeFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load contacts." }, { status: 500 });
  }

  // Fetch match counts per contact
  const contactIds = (data || []).map((c) => c.id);
  let matchCounts: Record<string, number> = {};
  if (contactIds.length > 0) {
    const { data: matches } = await supabaseAdmin
      .from("network_contact_matches")
      .select("network_contact_id")
      .in("network_contact_id", contactIds)
      .eq("status", "pending");

    if (matches) {
      for (const m of matches) {
        matchCounts[m.network_contact_id] =
          (matchCounts[m.network_contact_id] || 0) + 1;
      }
    }
  }

  const contacts = (data || []).map((c) => ({
    ...c,
    pending_match_count: matchCounts[c.id] || 0,
  }));

  return NextResponse.json({
    contacts,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}

// POST: Create a new network contact
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: CreateNetworkContactInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.full_name || !body.contact_type) {
    return NextResponse.json(
      { error: "full_name and contact_type are required." },
      { status: 400 }
    );
  }

  if (body.contact_type !== "recruiter" && body.contact_type !== "referral") {
    return NextResponse.json(
      { error: "contact_type must be 'recruiter' or 'referral'." },
      { status: 400 }
    );
  }

  const companyDomain = body.company_domain ||
    (body.company_name ? normalizeCompanyDomain(body.company_name) : null);

  const { data: contact, error } = await supabaseAdmin
    .from("network_contacts")
    .insert({
      account_manager_id: auth.user.id,
      contact_type: body.contact_type,
      full_name: body.full_name,
      email: body.email || null,
      phone: body.phone || null,
      linkedin_url: body.linkedin_url || null,
      company_name: body.company_name || null,
      company_domain: companyDomain || null,
      job_title: body.job_title || null,
      industries: body.industries || [],
      notes: body.notes || null,
      source: body.source || "manual",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create contact." }, { status: 500 });
  }

  // Trigger background matching
  await enqueueBackgroundJob("MATCH_NETWORK_CONTACTS", {
    network_contact_id: contact.id,
  });

  return NextResponse.json({ contact }, { status: 201 });
}
