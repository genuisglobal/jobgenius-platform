import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import SchedulingLinksClient from "./SchedulingLinksClient";

export default async function SchedulingLinksPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/dashboard");
  }

  return <SchedulingLinksClient />;
}
