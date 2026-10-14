import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import {
  summarizeOutcomes,
  type OutcomeRow,
} from "@/lib/application-outcomes-summary";
import ConversionClient from "./ConversionClient";

export const dynamic = "force-dynamic";

export default async function InterviewConversionPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  const daysRaw = Number(searchParams?.days ?? 90);
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 3650 ? daysRaw : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from("application_outcomes")
    .select(
      "outcome, resume_tailored, match_score, ats_type, account_manager_id, ai_answer_count"
    )
    .gte("submitted_at", since);

  const rows = (data ?? []) as OutcomeRow[];
  const summary = summarizeOutcomes(rows);

  const amIds = summary.by_am.map((s) => s.key);
  const amNames: Record<string, string> = {};
  if (amIds.length > 0) {
    const { data: ams } = await supabaseAdmin
      .from("account_managers")
      .select("id, name, email")
      .in("id", amIds);
    for (const a of ams ?? []) {
      amNames[a.id] = a.name || a.email || a.id;
    }
  }

  return (
    <ConversionClient
      summary={summary}
      amNames={amNames}
      days={days}
      totalApplications={rows.length}
    />
  );
}
