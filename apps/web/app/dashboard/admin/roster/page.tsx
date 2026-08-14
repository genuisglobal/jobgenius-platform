import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import RosterClient from "./RosterClient";

export default async function RosterPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }
  if (!isPeopleManagerRole(user.role)) {
    redirect("/dashboard");
  }

  return <RosterClient />;
}
