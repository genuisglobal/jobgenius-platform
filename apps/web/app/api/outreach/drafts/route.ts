import { buildContactSuggestions, buildDraftEmail } from "@/lib/outreach";
import { getAccountManagerFromRequest, requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type DraftPayload = {
  job_seeker_id?: string;
  job_post_id?: string;
};

export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", amResult.accountManager.id);

  if (assignmentsError) {
    return Response.json(
      { success: false, error: "Failed to load job seeker assignments." },
      { status: 500 }
    );
  }

  const seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  if (seekerIds.length === 0) {
    return Response.json({ success: true, drafts: [] });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseServer
    .from("outreach_drafts")
    .select(
      "id, job_seeker_id, job_post_id, contact_id, subject, body, status, updated_at, created_at, sent_at, last_error, outreach_contacts (role, full_name, email), job_posts (title, company), job_seekers (full_name, email)",
      { count: "exact" }
    )
    .in("job_seeker_id", seekerIds)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: drafts, error: draftsError, count } = await query;

  if (draftsError) {
    return Response.json(
      { success: false, error: "Failed to load outreach drafts." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    drafts: drafts ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}

export async function POST(request: Request) {
  let payload: DraftPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id || !payload?.job_post_id) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: job_seeker_id, job_post_id.",
      },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, payload.job_seeker_id);
  if (!access.ok) return access.response;

  const { data: jobPost, error: jobError } = await supabaseServer
    .from("job_posts")
    .select("id, title, company, company_website")
    .eq("id", payload.job_post_id)
    .single();

  if (jobError || !jobPost) {
    return Response.json(
      { success: false, error: "Job post not found." },
      { status: 404 }
    );
  }

  const { data: jobSeeker, error: seekerError } = await supabaseServer
    .from("job_seekers")
    .select("id, full_name, email")
    .eq("id", payload.job_seeker_id)
    .single();

  if (seekerError || !jobSeeker) {
    return Response.json(
      { success: false, error: "Job seeker not found." },
      { status: 404 }
    );
  }

  const suggestions = buildContactSuggestions({
    companyName: jobPost.company,
    companyWebsite: jobPost.company_website,
  });

  const contactRows = suggestions.map((suggestion) => ({
    job_seeker_id: jobSeeker.id,
    job_post_id: jobPost.id,
    company_name: jobPost.company ?? null,
    role: suggestion.role,
    full_name: suggestion.full_name,
    email: suggestion.email,
    source: "generated",
  }));

  const { data: createdContacts, error: contactsError } = await supabaseServer
    .from("outreach_contacts")
    .insert(contactRows)
    .select("id, role, full_name, email");

  if (contactsError) {
    return Response.json(
      { success: false, error: "Failed to create outreach contacts." },
      { status: 500 }
    );
  }

  const nowIso = new Date().toISOString();
  const draftRows = (createdContacts ?? []).map((contact) => {
    const draft = buildDraftEmail({
      jobTitle: jobPost.title,
      companyName: jobPost.company,
      jobSeekerName: jobSeeker.full_name,
      contactRole: contact.role,
    });

    return {
      job_seeker_id: jobSeeker.id,
      job_post_id: jobPost.id,
      contact_id: contact.id,
      subject: draft.subject,
      body: draft.body,
      status: "DRAFT",
      updated_at: nowIso,
    };
  });

  const { data: drafts, error: draftError } = await supabaseServer
    .from("outreach_drafts")
    .upsert(draftRows, { onConflict: "job_seeker_id,job_post_id,contact_id" })
    .select(
      "id, job_seeker_id, job_post_id, contact_id, subject, body, status, updated_at, created_at, sent_at, last_error, outreach_contacts (role, full_name, email)"
    );

  if (draftError) {
    return Response.json(
      { success: false, error: "Failed to create outreach drafts." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, drafts: drafts ?? [] });
}
