import { NextResponse } from "next/server";
import {
  consumeRecruiterWorkspaceMagicLink,
  setRecruiterPartnerSessionCookie,
} from "@/lib/recruiter-partner-auth";

type RouteContext = {
  params: { token: string };
};

export async function GET(request: Request, { params }: RouteContext) {
  const origin = new URL(request.url).origin;
  const result = await consumeRecruiterWorkspaceMagicLink(params.token);

  if (result.state === "invalid") {
    return NextResponse.redirect(
      `${origin}/hire/partner/error?reason=invalid`
    );
  }

  if (result.state === "expired") {
    return NextResponse.redirect(
      `${origin}/hire/partner/error?reason=expired`
    );
  }

  if (result.state === "used") {
    return NextResponse.redirect(
      `${origin}/hire/partner/error?reason=used`
    );
  }

  await setRecruiterPartnerSessionCookie({
    rawToken: result.sessionToken,
    expiresAt: result.sessionExpiresAt,
  });

  return NextResponse.redirect(`${origin}/hire/partner`);
}
