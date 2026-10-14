import { NextResponse } from "next/server";
import { getPublicCapacitySummary } from "@/lib/intake";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getPublicCapacitySummary();
  return NextResponse.json(summary);
}
