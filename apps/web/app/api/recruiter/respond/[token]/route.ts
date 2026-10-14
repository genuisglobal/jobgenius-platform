import { NextResponse } from "next/server";
import { consumeRecruiterResponseToken } from "@/lib/recruiter-partner-server";
import { RECRUITER_RESPONSE_ACTION_LABELS } from "@/lib/recruiter-partners";

type RouteContext = {
  params: { token: string };
};

export async function POST(_request: Request, { params }: RouteContext) {
  const result = await consumeRecruiterResponseToken(params.token);

  if (result.state === "invalid") {
    return NextResponse.json({ error: "That response link is not valid." }, { status: 404 });
  }

  if (result.state === "expired") {
    return NextResponse.json(
      { error: "That response link expired. Please reply to the email instead." },
      { status: 410 }
    );
  }

  if (result.state === "already_used") {
    return NextResponse.json({
      ok: true,
      status: "already_used",
      action_label: RECRUITER_RESPONSE_ACTION_LABELS[result.token.action_type],
    });
  }

  return NextResponse.json({
    ok: true,
    status: "applied",
    action_label: RECRUITER_RESPONSE_ACTION_LABELS[result.token.action_type],
  });
}
