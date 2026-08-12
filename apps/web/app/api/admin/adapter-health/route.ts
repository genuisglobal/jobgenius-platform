import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { getAdapterHealthStats, getFailureBreakdown } from "@/lib/adapter-health";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const days = parseInt(searchParams.get("days") ?? "30");

  if (action === "breakdown") {
    const atsType = searchParams.get("ats_type");
    if (!atsType) {
      return NextResponse.json({ error: "ats_type required" }, { status: 400 });
    }
    const breakdown = await getFailureBreakdown(atsType, days);
    return NextResponse.json(breakdown);
  }

  const stats = await getAdapterHealthStats(days);
  return NextResponse.json({ adapters: stats });
}
