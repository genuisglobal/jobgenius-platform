import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import QaReviewClient from "./QaReviewClient";

export default async function QaReviewPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  return <QaReviewClient />;
}
