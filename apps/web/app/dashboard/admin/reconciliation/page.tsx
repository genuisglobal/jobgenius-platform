import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { getRangeBounds, normalizeSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import ReconciliationClient from "./ReconciliationClient";

type PageProps = {
  searchParams?: { start?: string; end?: string };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReconciliationPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }
  if (!isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  const month = getRangeBounds(normalizeSheetDate(watDate()), "month");
  const start =
    searchParams?.start && ISO_DATE.test(searchParams.start)
      ? searchParams.start
      : month.start;
  const end =
    searchParams?.end && ISO_DATE.test(searchParams.end)
      ? searchParams.end
      : month.end;

  return <ReconciliationClient initialStart={start} initialEnd={end} />;
}
