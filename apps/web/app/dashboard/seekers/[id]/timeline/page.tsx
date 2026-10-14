import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import TimelineClient, { type TimelineRow } from "./TimelineClient";

interface PageProps {
  params: { id: string };
}

export default async function ClientTimelinePage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am") redirect("/portal");

  const allowed = await hasJobSeekerAccess(user.id, params.id);
  if (!allowed) redirect("/dashboard");

  const [{ data: seeker }, { data: rowsRaw }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("id, full_name, email")
      .eq("id", params.id)
      .maybeSingle(),
    supabaseAdmin
      .from("v_client_timeline")
      .select("kind, at, title, body, link, meta")
      .eq("job_seeker_id", params.id)
      .order("at", { ascending: false })
      .limit(200),
  ]);

  if (!seeker) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">Seeker not found.</p>
      </div>
    );
  }

  const rows = (rowsRaw ?? []) as TimelineRow[];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <a
          href={`/dashboard/seekers/${params.id}`}
          className="text-sm text-violet-600 hover:text-violet-700 font-medium"
        >
          ← {seeker.full_name ?? seeker.email}
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Client OS Timeline</h1>
        <p className="text-sm text-gray-500 mt-1">
          Unified feed of resume changes, applications, outreach, interviews,
          payments, contracts, payslips, AI outputs, and feedback. Use{" "}
          <strong>Suggest next action</strong> to get an LLM-curated 1-3 step
          plan based on the most recent 40 events, then save a suggestion
          directly into the delivery case or turn it into a blocker.
        </p>
      </div>

      <TimelineClient seekerId={params.id} initialRows={rows} />
    </div>
  );
}
