import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";

export default async function PeopleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "am" || !isPeopleManagerRole(user.role)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
