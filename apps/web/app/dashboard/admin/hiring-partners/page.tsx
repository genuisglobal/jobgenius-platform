import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import {
  buildRecruiterPartnerReport,
  type RecruiterPartnerInsightActivity,
  type RecruiterPartnerInsightRecruiter,
  type RecruiterPartnerInsightRequest,
} from "@/lib/recruiter-partner-insights";
import HiringPartnersQueueClient from "./HiringPartnersQueueClient";

type RoleRequestRow = {
  id: string;
  recruiter_id: string;
  submitted_by_name: string | null;
  submitted_by_email: string;
  persona_type: string;
  company_name: string;
  client_company_name: string | null;
  role_title: string | null;
  job_url: string | null;
  location: string;
  hiring_urgency: string | null;
  details: string | null;
  internal_note: string | null;
  status: string;
  assigned_account_manager_id: string | null;
  first_response_at: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  last_inbound_action_type: string | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
};

type RecruiterRow = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  partner_type: string | null;
  intake_source: string | null;
  do_not_contact: boolean | null;
  owner_account_manager_id: string | null;
  status: string;
};

type AccountManagerRow = {
  id: string;
  name: string | null;
  email: string;
};

type ActivityRow = {
  recruiter_id: string;
  activity_type: string;
  source: string;
  created_at: string;
};

export default async function HiringPartnersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !["admin", "superadmin"].includes(user.role ?? "")) {
    redirect("/dashboard");
  }

  const [{ data: requests }, { data: accountManagers }] = await Promise.all([
    supabaseAdmin
      .from("recruiter_role_requests")
      .select(
        "id, recruiter_id, submitted_by_name, submitted_by_email, persona_type, company_name, client_company_name, role_title, job_url, location, hiring_urgency, details, internal_note, status, assigned_account_manager_id, first_response_at, last_outbound_at, last_inbound_at, last_inbound_action_type, closed_reason, created_at, updated_at"
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("account_managers")
      .select("id, name, email")
      .eq("status", "approved")
      .order("name", { ascending: true }),
  ]);

  const roleRequests = (requests ?? []) as RoleRequestRow[];
  const recruiterIds = Array.from(new Set(roleRequests.map((row) => row.recruiter_id)));

  const [{ data: recruiters }, { data: activities }] = recruiterIds.length
    ? await Promise.all([
        supabaseAdmin
          .from("recruiters")
          .select(
            "id, name, company, email, linkedin_url, company_domain, partner_type, intake_source, do_not_contact, owner_account_manager_id, status"
          )
          .in("id", recruiterIds),
        supabaseAdmin
          .from("recruiter_partner_activity")
          .select("recruiter_id, activity_type, source, created_at")
          .in("recruiter_id", recruiterIds)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] as RecruiterRow[] }, { data: [] as ActivityRow[] }];

  const recruiterMap = new Map(
    ((recruiters ?? []) as RecruiterRow[]).map((recruiter) => [recruiter.id, recruiter])
  );
  const managerMap = new Map(
    ((accountManagers ?? []) as AccountManagerRow[]).map((manager) => [manager.id, manager])
  );

  const hydratedRequests = roleRequests.map((request) => {
    const recruiter = recruiterMap.get(request.recruiter_id) ?? null;
    const assignedAccountManager = request.assigned_account_manager_id
      ? managerMap.get(request.assigned_account_manager_id) ?? null
      : recruiter?.owner_account_manager_id
      ? managerMap.get(recruiter.owner_account_manager_id) ?? null
      : null;

    return {
      ...request,
      recruiter,
      assignedAccountManager,
    };
  });

  const report = buildRecruiterPartnerReport({
    recruiters: ((recruiters ?? []) as RecruiterRow[]).map((recruiter) => ({
      id: recruiter.id,
      name: recruiter.name,
      company: recruiter.company,
      email: recruiter.email,
      partner_type: recruiter.partner_type,
      do_not_contact: recruiter.do_not_contact,
      owner_account_manager_id: recruiter.owner_account_manager_id,
      status: recruiter.status,
    })) as RecruiterPartnerInsightRecruiter[],
    requests: roleRequests.map((request) => ({
      id: request.id,
      recruiter_id: request.recruiter_id,
      persona_type: request.persona_type,
      client_company_name: request.client_company_name,
      hiring_urgency: request.hiring_urgency,
      status: request.status,
      first_response_at: request.first_response_at,
      last_outbound_at: request.last_outbound_at,
      last_inbound_at: request.last_inbound_at,
      created_at: request.created_at,
      updated_at: request.updated_at,
    })) as RecruiterPartnerInsightRequest[],
    activities: (activities ?? []) as RecruiterPartnerInsightActivity[],
    accountManagers: (accountManagers ?? []) as AccountManagerRow[],
  });

  return (
    <HiringPartnersQueueClient
      initialRequests={hydratedRequests}
      accountManagers={(accountManagers ?? []) as AccountManagerRow[]}
      report={report}
    />
  );
}
