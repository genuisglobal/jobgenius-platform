import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import {
  addManualWorkActivity,
  WorkReportError,
} from "@/lib/work-reports-server";
import { isManualWorkActivityType } from "@/lib/work-reports";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const activityType = body?.activityType;
    const quantity = Number(body?.quantity ?? 0);

    if (!isManualWorkActivityType(activityType)) {
      return NextResponse.json({ error: "Invalid activity type." }, { status: 400 });
    }

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      return NextResponse.json({ error: "Quantity must be a positive whole number." }, { status: 400 });
    }

    const bundle = await addManualWorkActivity({
      accountManagerId: auth.user.id,
      reportDateInput: typeof body?.reportDate === "string" ? body.reportDate : null,
      activityType,
      quantity,
      note: typeof body?.note === "string" ? body.note : null,
    });

    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof WorkReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[work-reports:manual-activities:post]", error);
    return NextResponse.json(
      { error: "Failed to add manual activity." },
      { status: 500 }
    );
  }
}

