import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { logAdminAction } from "@/lib/audit";
import {
  CLIENT_DELIVERY_BLOCKER_TYPES,
  type ClientDeliveryBlockerType,
} from "@/lib/client-delivery";
import {
  ClientDeliveryError,
  createClientDeliveryBlocker,
  getClientDeliveryCaseBundleForSeeker,
} from "@/lib/client-delivery-server";

type RouteContext = {
  params: {
    seekerId: string;
  };
};

function isBlockerType(value: unknown): value is ClientDeliveryBlockerType {
  return (
    typeof value === "string" &&
    CLIENT_DELIVERY_BLOCKER_TYPES.includes(value as ClientDeliveryBlockerType)
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

    if (!isBlockerType(body?.blocker_type)) {
      return NextResponse.json({ error: "Invalid blocker type." }, { status: 400 });
    }

    if (typeof body?.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json({ error: "Blocker title is required." }, { status: 400 });
    }

    if (body?.description !== undefined && typeof body.description !== "string" && body.description !== null) {
      return NextResponse.json({ error: "Blocker description must be text." }, { status: 400 });
    }

    if (body?.due_at !== undefined && body.due_at !== null && typeof body.due_at !== "string") {
      return NextResponse.json({ error: "Blocker due date is invalid." }, { status: 400 });
    }

    await createClientDeliveryBlocker({
      jobSeekerId: seekerId,
      actorAccountManagerId: auth.user.id,
      blockerType: body.blocker_type,
      title: body.title,
      description: body.description ?? null,
      dueAt: body.due_at ?? null,
      escalated: Boolean(body.escalated),
    });

    const bundle = await getClientDeliveryCaseBundleForSeeker(
      { accountManagerId: auth.user.id, role: auth.user.role },
      seekerId
    );

    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "delivery.blocker_create",
      targetType: "job_seeker",
      targetId: seekerId,
      details: {
        blocker_type: body.blocker_type,
        title: body.title,
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

    console.error("[am:delivery:blockers:create]", error);
    return NextResponse.json(
      { error: "Failed to create blocker." },
      { status: 500 }
    );
  }
}
