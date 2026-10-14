import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import AdapterHealthClient from "./AdapterHealthClient";

export default async function AdapterHealthPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  return <AdapterHealthClient />;
}
