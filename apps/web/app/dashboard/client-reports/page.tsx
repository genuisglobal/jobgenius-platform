import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ClientReportsClient from "./ClientReportsClient";

export default async function ClientReportsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/dashboard");
  }

  return <ClientReportsClient />;
}
