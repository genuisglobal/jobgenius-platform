import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRangeBounds, normalizeSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import ProductivityClient from "./ProductivityClient";

type PageProps = {
  searchParams?: { start?: string; end?: string };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ProductivityPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  // Defaults match the route's: the calendar month containing today.
  const month = getRangeBounds(normalizeSheetDate(watDate()), "month");
  const start =
    searchParams?.start && ISO_DATE.test(searchParams.start)
      ? searchParams.start
      : month.start;
  const end =
    searchParams?.end && ISO_DATE.test(searchParams.end)
      ? searchParams.end
      : month.end;

  return <ProductivityClient initialStart={start} initialEnd={end} />;
}
