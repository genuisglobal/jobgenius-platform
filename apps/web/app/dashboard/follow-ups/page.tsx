import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import FollowUpsClient from "./FollowUpsClient";

export default async function FollowUpsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/dashboard");
  }

  return <FollowUpsClient />;
}
