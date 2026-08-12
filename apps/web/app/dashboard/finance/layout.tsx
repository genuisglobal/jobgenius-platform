import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessFinanceModule } from "@/lib/people-server";

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!canAccessFinanceModule(user)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
