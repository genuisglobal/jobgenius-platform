import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import TrackerClient from "./TrackerClient";

export default async function TrackerPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "job_seeker") redirect("/login");

  return <TrackerClient />;
}
