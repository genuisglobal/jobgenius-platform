import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getIntakeStateByJobSeekerId } from "@/lib/intake";
import PortalShell from "./portal-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "job_seeker") {
    redirect("/dashboard");
  }

  const intakeState = await getIntakeStateByJobSeekerId(user.id);
  const showBillingNav = Boolean(
    intakeState &&
      [
        "approved_payment_pending",
        "approved_preview",
        "preview_active",
        "preview_expired",
        "active_client",
      ].includes(intakeState.status)
  );

  return (
    <PortalShell userName={user.name || user.email} showBillingNav={showBillingNav}>
      {children}
    </PortalShell>
  );
}
