import { NextResponse } from "next/server";
import { clearRecruiterPartnerSessionCookie } from "@/lib/recruiter-partner-auth";

export async function POST() {
  await clearRecruiterPartnerSessionCookie();
  return NextResponse.json({ ok: true });
}
