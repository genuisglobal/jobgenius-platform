import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole, normalizeAMRole } from "@/lib/auth/roles";
import { getRangeBounds, shiftSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { loadAmDeliveryData } from "@/lib/am-delivery-server";
import { composeDailyDeliveryEmail, composeFridayDeliveryEmail, summarizeDelivery } from "@/lib/am-weekly-delivery";
import { amProgressNotificationHtml } from "@/lib/email-templates/am-progress-notification";
import { previewMeasuredProductivity } from "@/lib/productivity-digest";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: { am?: string; kind?: string; date?: string } };

function previewDate(value: string | undefined, today: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return today;
  return value <= today && value >= shiftSheetDate(today, -90) ? value : today;
}

export default async function AmEmailPreviewPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") redirect("/login");
  if (!isPeopleManagerRole(user.role)) redirect("/dashboard");

  const { data: staff, error } = await supabaseAdmin.from("account_managers")
    .select("id, name, email, role, status").eq("status", "approved").order("name");
  if (error) throw new Error("Could not load AM email preview recipients.");
  const managers = (staff ?? []).filter((person) => normalizeAMRole(person.role as string | null) === "am");
  const selected = managers.find((person) => person.id === searchParams?.am) ?? managers[0];
  const today = watDate();
  const date = previewDate(searchParams?.date, today);
  const kind = searchParams?.kind === "weekly" ? "weekly" : "daily";
  let message: { subject: string; body: string } | null = null;
  let html: string | null = null;
  if (selected) {
    const start = getRangeBounds(date, "week").start;
    const previousStart = shiftSheetDate(start, -7);
    const previousEnd = kind === "daily" ? shiftSheetDate(start, -3) : shiftSheetDate(date, -7);
    const delivery = await loadAmDeliveryData(start, kind === "daily" ? shiftSheetDate(date, -1) : date, previousStart, previousEnd);
    const current = summarizeDelivery(selected.id as string, start, delivery.assignments, delivery.current);
    const previous = summarizeDelivery(selected.id as string, previousStart, delivery.assignments, delivery.previous);
    const name = (selected.name as string | null)?.trim() || (selected.email as string).split("@")[0];
    if (kind === "daily") {
      message = composeDailyDeliveryEmail(name, date, current, previous);
    } else {
      const weekly = composeFridayDeliveryEmail(name, current, previous);
      const productivity = await previewMeasuredProductivity(selected.id as string, { start, end: date });
      message = {
        subject: weekly.subject,
        body: productivity
          ? `${weekly.body}\n\nYour measured productivity details:\n${productivity.body}`
          : `${weekly.body}\n\nNo measured attendance or sheet activity was available for your productivity rate this week.`,
      };
    }
    html = amProgressNotificationHtml(message.subject, message.body,
      kind === "daily" ? "/dashboard/today" : `/dashboard/productivity?start=${start}&end=${date}`,
      kind === "weekly");
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">AM email preview</h1>
      <p className="mt-1 text-sm text-gray-600">Review the current draft for an AM. Viewing this page does not queue or send an email.</p>
      <p className="mt-1 text-xs text-gray-500">Figures reflect the activity sheet and attendance records available now. Scheduled emails may change if those records are updated.</p>
    </div>
    <form method="get" className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <label className="flex min-w-48 flex-col gap-1 text-sm font-medium text-gray-700">Account manager
        <select name="am" defaultValue={selected?.id ?? ""} className="rounded-lg border border-gray-300 px-3 py-2">
          {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name?.trim() || manager.email}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Email
        <select name="kind" defaultValue={kind} className="rounded-lg border border-gray-300 px-3 py-2">
          <option value="daily">Daily progress</option><option value="weekly">Friday review</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">As of date
        <input name="date" type="date" min={shiftSheetDate(today, -90)} max={today} defaultValue={date} className="rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <button type="submit" className="rounded-lg bg-purple-700 px-4 py-2 font-semibold text-white hover:bg-purple-800">Update preview</button>
    </form>
    {html && message ? <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm text-gray-600"><strong>To:</strong> {selected.email} <span className="mx-2">·</span> <strong>Subject:</strong> {message.subject}</p>
      <iframe title="AM email preview" srcDoc={html} sandbox="" className="h-[900px] w-full rounded-lg border border-gray-200 bg-white" />
    </div> : <p className="rounded-lg bg-white p-6 text-gray-600">No approved AMs are available to preview.</p>}
  </div>;
}
