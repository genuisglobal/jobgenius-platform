import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import HostRulesClient, { type HostRuleRow } from "./HostRulesClient";

export default async function HostRulesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const { data } = await supabaseAdmin
    .from("host_automation_rules")
    .select("*")
    .order("status", { ascending: true })
    .order("rule_id", { ascending: true });

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Host Automation Rules</h1>
      <p className="text-sm text-gray-500 mb-6">
        Per-host rules that drive the apply pipeline. Edit here without a deploy
        — the runner picks up changes within 5 minutes. Use <strong>pending_review</strong>{" "}
        for L2 auto-proposed rules that need a human before they go live.
      </p>
      <HostRulesClient initialRules={(data ?? []) as HostRuleRow[]} />
    </div>
  );
}
