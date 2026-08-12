import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { logAdminAction } from "@/lib/audit";
import {
  CLIENT_DELIVERY_ACTION_TYPES,
  CLIENT_DELIVERY_RISK_LEVELS,
  CLIENT_DELIVERY_STAGES,
  type ClientDeliveryActionType,
  type ClientDeliveryRiskLevel,
  type ClientDeliveryStage,
} from "@/lib/client-delivery";
import {
  ClientDeliveryError,
  getClientDeliveryCaseBundleForSeeker,
  saveClientDeliveryCase,
} from "@/lib/client-delivery-server";

type RouteContext = {
  params: {
    seekerId: string;
  };
};

function isRiskLevel(value: unknown): value is ClientDeliveryRiskLevel {
  return (
    typeof value === "string" &&
    CLIENT_DELIVERY_RISK_LEVELS.includes(value as ClientDeliveryRiskLevel)
  );
}

function isStage(value: unknown): value is ClientDeliveryStage {
  return (
    typeof value === "string" &&
    CLIENT_DELIVERY_STAGES.includes(value as ClientDeliveryStage)
  );
}

function isActionType(value: unknown): value is ClientDeliveryActionType {
  return (
    typeof value === "string" &&
    CLIENT_DELIVERY_ACTION_TYPES.includes(value as ClientDeliveryActionType)
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

    if (
      body?.risk_level !== undefined &&
      body?.risk_level !== null &&
      !isRiskLevel(body.risk_level)
    ) {
      return NextResponse.json({ error: "Invalid risk level." }, { status: 400 });
    }

    if (body?.paused !== undefined && typeof body.paused !== "boolean") {
      return NextResponse.json({ error: "Paused must be a boolean." }, { status: 400 });
    }

    if (body?.stage_override !== null && body?.stage_override !== undefined && !isStage(body.stage_override)) {
      return NextResponse.json({ error: "Invalid stage override." }, { status: 400 });
    }

    if (
      body?.next_action_type !== null &&
      body?.next_action_type !== undefined &&
      !isActionType(body.next_action_type)
    ) {
      return NextResponse.json({ error: "Invalid next action type." }, { status: 400 });
    }

    if (body?.next_action_title !== undefined && typeof body.next_action_title !== "string" && body.next_action_title !== null) {
      return NextResponse.json({ error: "Next action title must be text." }, { status: 400 });
    }

    if (body?.next_action_notes !== undefined && typeof body.next_action_notes !== "string" && body.next_action_notes !== null) {
      return NextResponse.json({ error: "Next action notes must be text." }, { status: 400 });
    }

    if (body?.manager_notes !== undefined && typeof body.manager_notes !== "string" && body.manager_notes !== null) {
      return NextResponse.json({ error: "Manager notes must be text." }, { status: 400 });
    }

    if (body?.next_action_due_at !== undefined && body.next_action_due_at !== null && typeof body.next_action_due_at !== "string") {
      return NextResponse.json({ error: "Next action due value is invalid." }, { status: 400 });
    }

    if (body?.complete_next_action !== undefined && typeof body.complete_next_action !== "boolean") {
      return NextResponse.json({ error: "Complete flag must be a boolean." }, { status: 400 });
    }

    await saveClientDeliveryCase({
      jobSeekerId: seekerId,
      actorAccountManagerId: auth.user.id,
      riskLevel: body.risk_level ?? undefined,
      paused: body.paused ?? undefined,
      stageOverride:
        body?.stage_override === undefined ? undefined : body.stage_override ?? null,
      nextActionType:
        body?.next_action_type === undefined ? undefined : body.next_action_type ?? null,
      nextActionTitle:
        body?.next_action_title === undefined ? undefined : body.next_action_title ?? null,
      nextActionNotes:
        body?.next_action_notes === undefined ? undefined : body.next_action_notes ?? null,
      nextActionDueAt:
        body?.next_action_due_at === undefined ? undefined : body.next_action_due_at ?? null,
      managerNotes:
        body?.manager_notes === undefined ? undefined : body.manager_notes ?? null,
      completeNextAction: Boolean(body.complete_next_action),
    });

    const bundle = await getClientDeliveryCaseBundleForSeeker(
      { accountManagerId: auth.user.id, role: auth.user.role },
      seekerId
    );

    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "delivery.case_update",
      targetType: "job_seeker",
      targetId: seekerId,
      details: {
        risk_level: body.risk_level,
        paused: body.paused,
        stage_override: body.stage_override ?? null,
        next_action_type: body.next_action_type ?? null,
        next_action_due_at: body.next_action_due_at ?? null,
        complete_next_action: Boolean(body.complete_next_action),
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

    console.error("[am:delivery:case]", error);
    return NextResponse.json(
      { error: "Failed to update delivery case." },
      { status: 500 }
    );
  }
}
