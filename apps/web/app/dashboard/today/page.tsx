import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import TodayClient, { type AmTaskRow } from "./TodayClient";

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am") redirect("/portal");

  const { data: rowsRaw } = await supabaseAdmin
    .from("v_am_tasks")
    .select("*")
    .eq("am_id", user.id)
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true })
    .limit(200);

  const tasks = (rowsRaw ?? []) as AmTaskRow[];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Today</h1>
        <p className="text-sm text-gray-500 mt-1">
          Everything that needs your attention, in one place. Sourced from
          attention items, delivery command cases, billing escalations,
          payslip signatures, outreach replies, and upcoming interviews.
        </p>
      </div>
      <TodayClient initialTasks={tasks} amName={user.name ?? user.email} />
    </div>
  );
}
