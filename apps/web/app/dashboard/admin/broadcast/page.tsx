import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";
import BroadcastClient from "./BroadcastClient";

export default async function BroadcastPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (normalizeAMRole(user.role) !== "superadmin") redirect("/dashboard/admin");

  // Load recent broadcasts
  const { data: broadcasts } = await supabaseAdmin
    .from("system_announcements")
    .select(
      "id, subject, body, target_audience, send_email, recipient_count, status, error_detail, sent_at, created_at, account_managers!inner(name)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  // Load recipient counts
  const [{ count: seekerCount }, { count: amCount }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("account_managers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  return (
    <BroadcastClient
      initialBroadcasts={(broadcasts ?? []) as unknown as BroadcastRecord[]}
      recipientCounts={{
        job_seekers: seekerCount ?? 0,
        account_managers: amCount ?? 0,
        all_users: (seekerCount ?? 0) + (amCount ?? 0),
      }}
    />
  );
}

export type BroadcastRecord = {
  id: string;
  subject: string;
  body: string;
  target_audience: string;
  send_email: boolean;
  recipient_count: number;
  status: string;
  error_detail: string | null;
  sent_at: string | null;
  created_at: string;
  account_managers: { full_name: string | null } | null;
};
