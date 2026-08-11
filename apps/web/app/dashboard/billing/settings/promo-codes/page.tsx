import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import PromoCodesClient from "./PromoCodesClient";

export default async function PromoCodesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !["admin", "superadmin"].includes(user.role ?? "")) {
    redirect("/dashboard");
  }

  const { data: promoCodes } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  return <PromoCodesClient promoCodes={promoCodes ?? []} />;
}
