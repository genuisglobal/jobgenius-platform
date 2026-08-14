import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { logAdminAction } from "@/lib/audit";
import {
  CLIENT_DELIVERY_BLOCKER_STATUSES,
  type ClientDeliveryBlockerStatus,
} from "@/lib/client-delivery";
import {
  ClientDeliveryError,
  getClientDeliveryBlockerContext,
  getClientDeliveryCaseBundleForSeeker,
  updateClientDeliveryBlocker,
} from "@/lib/client-delivery-server";

type RouteContext = {
  params: {
    blockerId: string;
  };
};

function isBlockerStatus(value: unknown): value is ClientDeliveryBlockerStatus {
  return (
    typeof value === "string" &&
    CLIENT_DELIVERY_BLOCKER_STATUSES.includes(value as ClientDeliveryBlockerStatus)
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const blockerContext = await getClientDeliveryBlockerContext(
      context.params.blockerId
    );
    if (!blockerContext) {
      return NextResponse.json({ error: "Blocker not found." }, { status: 404 });
    }

    const allowed = await hasJobSeekerAccess(
      auth.user.id,
      blockerContext.jobSeekerId
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Not authorized for this seeker." },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (
      body?.status !== undefined &&
      body.status !== null &&
      !isBlockerStatus(body.status)
    ) {
      return NextResponse.json({ error: "Invalid blocker status." }, { status: 400 });
    }

    if (
      body?.title !== undefined &&
      (typeof body.title !== "string" || body.title.trim().length === 0)
    ) {
      return NextResponse.json({ error: "Blocker title is invalid." }, { status: 400 });
    }

    if (
      body?.description !== undefined &&
      typeof body.description !== "string" &&
      body.description !== null
    ) {
      return NextResponse.json({ error: "Blocker description must be text." }, { status: 400 });
    }

    if (
      body?.due_at !== undefined &&
      body.due_at !== null &&
      typeof body.due_at !== "string"
    ) {
      return NextResponse.json({ error: "Blocker due date is invalid." }, { status: 400 });
    }

    if (
      body?.escalated !== undefined &&
      typeof body.escalated !== "boolean"
    ) {
      return NextResponse.json({ error: "Escalated must be a boolean." }, { status: 400 });
    }

    await updateClientDeliveryBlocker({
      blockerId: context.params.blockerId,
      actorAccountManagerId: auth.user.id,
      status: body.status ?? undefined,
      title: body.title ?? undefined,
      description: body.description ?? undefined,
      dueAt: body.due_at ?? undefined,
      escalated: body.escalated ?? undefined,
    });

    const bundle = await getClientDeliveryCaseBundleForSeeker(
      { accountManagerId: auth.user.id, role: auth.user.role },
      blockerContext.jobSeekerId
    );

    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "delivery.blocker_update",
      targetType: "job_seeker",
      targetId: blockerContext.jobSeekerId,
      details: {
        blocker_id: context.params.blockerId,
        status: body.status ?? null,
        escalated: body.escalated ?? null,
        due_at: body.due_at ?? null,
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

    console.error("[am:delivery:blockers:update]", error);
    return NextResponse.json(
      { error: "Failed to update blocker." },
      { status: 500 }
    );
  }
}
