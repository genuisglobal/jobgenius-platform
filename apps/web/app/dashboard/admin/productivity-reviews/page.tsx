import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import ProductivityReviewsClient from "./ProductivityReviewsClient";

export default async function ProductivityReviewsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }
  if (!isPeopleManagerRole(user.role)) {
    redirect("/dashboard");
  }

  return <ProductivityReviewsClient />;
}
