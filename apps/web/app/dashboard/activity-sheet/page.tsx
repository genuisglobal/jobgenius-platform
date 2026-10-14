import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { normalizeSheetDate } from "@/lib/activity-sheet";
import ActivitySheetClient from "./ActivitySheetClient";

type PageProps = {
  searchParams?: {
    date?: string;
    range?: string;
  };
};

export default async function ActivitySheetPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  return (
    <ActivitySheetClient
      initialDate={normalizeSheetDate(searchParams?.date)}
      initialRange={searchParams?.range === "day" || searchParams?.range === "month" ? searchParams.range : "week"}
    />
  );
}
