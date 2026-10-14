import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { isAdminRole, isPeopleManagerRole } from "@/lib/auth/roles";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { logAdminAction } from "@/lib/audit";
import {
  ClientDeliveryError,
  getClientDeliveryCaseBundleForSeeker,
  markClientDeliveryCaseReviewed,
} from "@/lib/client-delivery-server";

type RouteContext = {
  params: {
    seekerId: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isPeopleManagerRole(auth.user.role) && !isAdminRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Manager review access is required." },
      { status: 403 }
    );
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
    await markClientDeliveryCaseReviewed({
      jobSeekerId: seekerId,
      actorAccountManagerId: auth.user.id,
    });

    const bundle = await getClientDeliveryCaseBundleForSeeker(
      { accountManagerId: auth.user.id, role: auth.user.role },
      seekerId
    );

    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "delivery.case_review",
      targetType: "job_seeker",
      targetId: seekerId,
      details: {
        review_type: "manager_review",
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

    console.error("[am:delivery:review]", error);
    return NextResponse.json(
      { error: "Failed to mark delivery case reviewed." },
      { status: 500 }
    );
  }
}
