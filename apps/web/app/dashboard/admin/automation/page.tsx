import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import AutomationPoliciesClient from "./AutomationPoliciesClient";

export default async function AutomationPoliciesPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  return <AutomationPoliciesClient />;
}
