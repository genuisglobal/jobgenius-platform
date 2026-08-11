import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import CopilotClient, { type PriorityItem, type Scorecard } from "./CopilotClient";

type TaskRow = {
  kind: string;
  task_key: string;
  title: string;
  body: string | null;
  priority: number;
  due_at: string | null;
  link_url: string | null;
};

type DecisionRow = {
  id: string;
  job_seeker_id: string;
  verdict: string;
  recommended_action: string | null;
  subject_type: string;
  job_seekers: { full_name?: string } | { full_name?: string }[] | null;
};

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  attention_item: { label: "Attention", cls: "bg-amber-100 text-amber-700" },
  billing_overdue: { label: "Billing", cls: "bg-red-100 text-red-700" },
  payslip_sign: { label: "Payslip", cls: "bg-emerald-100 text-emerald-700" },
  outreach_reply: { label: "Reply", cls: "bg-violet-100 text-violet-700" },
  interview_upcoming: { label: "Interview", cls: "bg-purple-100 text-purple-700" },
};

const VERDICT_BADGE: Record<string, { label: string; cls: string }> = {
  escalate: { label: "Escalate", cls: "bg-red-100 text-red-700" },
  ask: { label: "Ask client", cls: "bg-amber-100 text-amber-700" },
  pause: { label: "Pause", cls: "bg-violet-100 text-violet-700" },
};

function seekerName(d: DecisionRow): string {
  const s = Array.isArray(d.job_seekers) ? d.job_seekers[0] : d.job_seekers;
  return s?.full_name ?? "Unknown";
}

export default async function CopilotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am") redirect("/portal");

  const admin = isAdminRole(user.role);

  // Reuse the existing AM task view for attention / replies / interviews / billing / payslips.
  const { data: taskRows } = await supabaseAdmin
    .from("v_am_tasks")
    .select("kind, task_key, title, body, priority, due_at, link_url")
    .eq("am_id", user.id)
    .order("priority", { ascending: false })
    .limit(200);
  const tasks = (taskRows ?? []) as TaskRow[];

  // The Act/Ask/Escalate decision layer (Org Singularity).
  let decQ = supabaseAdmin
    .from("consultant_decisions")
    .select("id, job_seeker_id, verdict, recommended_action, subject_type, job_seekers(full_name)")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!admin) {
    const { data: assignments } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", user.id);
    const ids = (assignments ?? []).map((r) => r.job_seeker_id as string);
    decQ = decQ.in(
      "job_seeker_id",
      ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]
    );
  }

  const { data: decRows } = await decQ;
  const decisions = (decRows ?? []) as DecisionRow[];

  // Build the priority matrix (course M1L5 "Priority Matrix for Daily Work").
  const now = Date.now();
  const dayMs = 86_400_000;
  const p1: PriorityItem[] = [];
  const p2: PriorityItem[] = [];
  const p3: PriorityItem[] = [];

  for (const d of decisions) {
    const vb = VERDICT_BADGE[d.verdict];
    if (!vb) continue;
    const item: PriorityItem = {
      id: `d-${d.id}`,
      source: "decision",
      badge: vb.label,
      badgeClass: vb.cls,
      title: seekerName(d),
      detail: d.recommended_action,
      href: "/dashboard/decisions",
      when: null,
    };
    if (d.verdict === "escalate") p1.push(item);
    else if (d.verdict === "ask") p2.push(item);
    else p3.push(item);
  }

  for (const t of tasks) {
    const kb = KIND_BADGE[t.kind] ?? { label: t.kind, cls: "bg-gray-100 text-gray-700" };
    const due = t.due_at ? new Date(t.due_at).getTime() : null;
    const dueSoon = due !== null && due - now <= dayMs;
    const item: PriorityItem = {
      id: `t-${t.task_key}`,
      source: "task",
      badge: kb.label,
      badgeClass: kb.cls,
      title: t.title,
      detail: t.body,
      href: t.link_url,
      when: t.due_at,
    };
    if (t.priority >= 8 || dueSoon) p1.push(item);
    else if (t.priority >= 4 || (due !== null && due - now <= 7 * dayMs)) p2.push(item);
    else p3.push(item);
  }

  const scorecard: Scorecard = {
    escalations: decisions.filter((d) => d.verdict === "escalate").length,
    asks: decisions.filter((d) => d.verdict === "ask").length,
    pauses: decisions.filter((d) => d.verdict === "pause").length,
    attention: tasks.filter((t) => t.kind === "attention_item").length,
    interviews: tasks.filter((t) => t.kind === "interview_upcoming").length,
    replies: tasks.filter((t) => t.kind === "outreach_reply").length,
  };

  return (
    <CopilotClient
      amName={user.name ?? user.email}
      p1={p1}
      p2={p2}
      p3={p3}
      scorecard={scorecard}
    />
  );
}
