import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import {
  deleteManualWorkActivity,
  WorkReportError,
} from "@/lib/work-reports-server";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const bundle = await deleteManualWorkActivity({
      accountManagerId: auth.user.id,
      activityId: context.params.id,
    });

    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof WorkReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[work-reports:manual-activities:delete]", error);
    return NextResponse.json(
      { error: "Failed to delete manual activity." },
      { status: 500 }
    );
  }
}

