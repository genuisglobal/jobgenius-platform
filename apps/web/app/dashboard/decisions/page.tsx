import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DecisionsClient from "./DecisionsClient";

export default async function DecisionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.userType !== "am") {
    redirect("/dashboard");
  }
  return <DecisionsClient />;
}
