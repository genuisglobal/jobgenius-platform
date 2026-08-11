import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { loadAdminOutcomeDashboard } from "@/lib/outcome-analytics-server";
import OutcomesClient from "./OutcomesClient";

interface PageProps {
  searchParams?: {
    lead?: string;
  };
}

export default async function AdminOutcomesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  const data = await loadAdminOutcomeDashboard(searchParams?.lead ?? null);

  return <OutcomesClient data={data} />;
}
