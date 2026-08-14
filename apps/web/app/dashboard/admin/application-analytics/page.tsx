import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import ApplicationAnalyticsClient from "./ApplicationAnalyticsClient";

export default async function ApplicationAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  return <ApplicationAnalyticsClient />;
}
