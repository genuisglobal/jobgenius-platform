import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { normalizeCompanyDomain } from "@/lib/network/matching";
import type { UpdateNetworkContactInput } from "@/lib/network/types";

// GET: Single contact with matches and activity
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: contact, error } = await supabaseAdmin
    .from("network_contacts")
    .select("*")
    .eq("id", params.id)
    .eq("account_manager_id", auth.user.id)
    .single();

  if (error || !contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  // Fetch matches with job post and seeker details
  const { data: matches } = await supabaseAdmin
    .from("network_contact_matches")
    .select(`
      id, network_contact_id, job_post_id, job_seeker_id,
      match_reason, status, created_at,
      job_posts (id, title, company, url),
      job_seekers (id, full_name, email)
    `)
    .eq("network_contact_id", params.id)
    .order("created_at", { ascending: false });

  // Fetch activity log
  const { data: activity } = await supabaseAdmin
    .from("network_contact_activity")
    .select("*")
    .eq("network_contact_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    contact,
    matches: matches || [],
    activity: activity || [],
  });
}

// PUT: Update contact
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from("network_contacts")
    .select("id, company_name")
    .eq("id", params.id)
    .eq("account_manager_id", auth.user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  let body: UpdateNetworkContactInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.full_name !== undefined) updates.full_name = body.full_name;
  if (body.email !== undefined) updates.email = body.email || null;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.linkedin_url !== undefined) updates.linkedin_url = body.linkedin_url || null;
  if (body.company_name !== undefined) {
    updates.company_name = body.company_name || null;
    updates.company_domain = body.company_name
      ? normalizeCompanyDomain(body.company_name)
      : null;
  }
  if (body.company_domain !== undefined) updates.company_domain = body.company_domain || null;
  if (body.job_title !== undefined) updates.job_title = body.job_title || null;
  if (body.industries !== undefined) updates.industries = body.industries || [];
  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.contact_type !== undefined) updates.contact_type = body.contact_type;

  const { data: contact, error } = await supabaseAdmin
    .from("network_contacts")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update contact." }, { status: 500 });
  }

  // Re-trigger matching if company changed
  const companyChanged =
    body.company_name !== undefined && body.company_name !== existing.company_name;
  if (companyChanged) {
    await enqueueBackgroundJob("MATCH_NETWORK_CONTACTS", {
      network_contact_id: params.id,
    });
  }

  // Log status change activity
  if (body.status !== undefined) {
    const { error: activityError } = await supabaseAdmin.from("network_contact_activity").insert({
      network_contact_id: params.id,
      activity_type: "status_changed",
      details: { new_status: body.status },
    });

    if (activityError) {
      console.error("[am:network] failed to log status change activity:", activityError);
    }
  }

  return NextResponse.json({ contact });
}

// DELETE: Soft-delete (set status to 'inactive')
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await supabaseAdmin
    .from("network_contacts")
    .update({ status: "inactive" })
    .eq("id", params.id)
    .eq("account_manager_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete contact." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
