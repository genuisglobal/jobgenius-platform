import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/auth";
import { getCurrentRecruiterPartnerSession } from "@/lib/recruiter-partner-auth";
import RecruiterPartnerWorkspaceClient from "./RecruiterPartnerWorkspaceClient";

type RecruiterRow = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  partner_type: string | null;
};

type RoleRequestRow = {
  id: string;
  role_title: string | null;
  job_url: string | null;
  location: string;
  client_company_name: string | null;
  hiring_urgency: string | null;
  details: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export const metadata: Metadata = {
  title: "Hiring Partner Workspace | JobGenius",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function RecruiterPartnerWorkspacePage() {
  const session = await getCurrentRecruiterPartnerSession();

  if (!session) {
    return (
      <WorkspaceShell>
        <AccessCard
          title="Partner workspace access is invite-only."
          body="We send this by email after your first request or when you start managing repeat roles with us. No password is required."
        />
      </WorkspaceShell>
    );
  }

  const [{ data: recruiter }, { data: requests }] = await Promise.all([
    supabaseAdmin
      .from("recruiters")
      .select("id, name, email, company, partner_type")
      .eq("id", session.recruiterId)
      .maybeSingle(),
    supabaseAdmin
      .from("recruiter_role_requests")
      .select(
        "id, role_title, job_url, location, client_company_name, hiring_urgency, details, status, created_at, updated_at"
      )
      .eq("recruiter_id", session.recruiterId)
      .order("updated_at", { ascending: false })
      .limit(25),
  ]);

  if (!recruiter?.id) {
    return (
      <WorkspaceShell>
        <AccessCard
          title="We couldn't load this workspace."
          body="The access session is valid, but the partner record could not be found. Reply to the latest JobGenius email and we will re-issue access."
        />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <section className="rounded-[36px] bg-[#1f1147] px-6 py-8 text-white shadow-[0_30px_90px_rgba(31,17,71,0.24)] sm:px-8 sm:py-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
            Hiring Partner Workspace
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Lightweight repeat-partner access
          </h1>
          <p className="mt-4 text-base leading-7 text-violet-100">
            This is intentionally narrow: recent requests in one place and a faster way to
            submit another live role without going back through the public intake form.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <RecruiterPartnerWorkspaceClient
          recruiter={recruiter as RecruiterRow}
          initialRequests={(requests ?? []) as RoleRequestRow[]}
        />
      </section>
    </WorkspaceShell>
  );
}

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(233,213,255,0.42),_transparent_34%),linear-gradient(to_bottom,_#f5f3ff,_#ffffff_42%)]">
      <header className="border-b border-violet-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="JobGenius"
              width={140}
              height={40}
              className="h-9 w-auto"
              priority
            />
            <span className="hidden rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 sm:inline-flex">
              Partner Workspace
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/hire"
              className="inline-flex rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Public hire page
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function AccessCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-3xl rounded-[36px] border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-600">
        Access Required
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">{body}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          "No password setup",
          "Shared by private email link",
          "Used only for repeat roles",
        ].map((item) => (
          <div
            key={item}
            className="rounded-[24px] border border-violet-100 bg-violet-50/70 px-4 py-4 text-sm font-medium text-gray-700"
          >
            {item}
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/hire"
          className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Go to hire page
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-full border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
