import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  updateDailyWorkReportReviewStatus,
  WorkReportError,
} from "@/lib/work-reports-server";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json({ error: "People manager access required." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const nextStatus = body?.status;

    if (nextStatus !== "locked" && nextStatus !== "submitted") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const bundle = await updateDailyWorkReportReviewStatus({
      reportId: context.params.id,
      nextStatus,
      actorAccountManagerId: auth.user.id,
    });

    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof WorkReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[people:work-reports:status]", error);
    return NextResponse.json(
      { error: "Failed to update work report status." },
      { status: 500 }
    );
  }
}

