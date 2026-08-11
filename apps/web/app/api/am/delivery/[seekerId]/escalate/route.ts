import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { logAdminAction } from "@/lib/audit";
import {
  CLIENT_DELIVERY_ESCALATION_REASONS,
  type ClientDeliveryEscalationReason,
} from "@/lib/client-delivery";
import {
  ClientDeliveryError,
  createClientDeliveryEscalation,
  getClientDeliveryCaseBundleForSeeker,
} from "@/lib/client-delivery-server";

type RouteContext = {
  params: {
    seekerId: string;
  };
};

function isEscalationReason(
  value: unknown
): value is ClientDeliveryEscalationReason {
  return (
    typeof value === "string" &&
    CLIENT_DELIVERY_ESCALATION_REASONS.includes(
      value as ClientDeliveryEscalationReason
    )
  );
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = context.params.seekerId;
  const allowed = await hasJobSeekerAccess(auth.user.id, seekerId);
  if (!allowed) {
    return NextResponse.json(
      { error: "Not authorized for this seeker." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    if (!isEscalationReason(body?.reason)) {
      return NextResponse.json(
        { error: "Invalid escalation reason." },
        { status: 400 }
      );
    }

    if (
      body?.details !== undefined &&
      body?.details !== null &&
      typeof body.details !== "string"
    ) {
      return NextResponse.json(
        { error: "Escalation details must be text." },
        { status: 400 }
      );
    }

    await createClientDeliveryEscalation({
      jobSeekerId: seekerId,
      actorAccountManagerId: auth.user.id,
      reason: body.reason,
      details: body.details ?? null,
    });

    const bundle = await getClientDeliveryCaseBundleForSeeker(
      { accountManagerId: auth.user.id, role: auth.user.role },
      seekerId
    );

    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "delivery.escalation_create",
      targetType: "job_seeker",
      targetId: seekerId,
      details: {
        reason: body.reason,
      },
      ip:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ bundle });
  } catch (error) {
    if (error instanceof ClientDeliveryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[am:delivery:escalate]", error);
    return NextResponse.json(
      { error: "Failed to escalate delivery case." },
      { status: 500 }
    );
  }
}
