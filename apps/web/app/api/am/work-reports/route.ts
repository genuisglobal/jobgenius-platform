import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import {
  getDailyWorkReportBundle,
  upsertDailyWorkReport,
  WorkReportError,
} from "@/lib/work-reports-server";

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const reportDate = searchParams.get("date");
    const bundle = await getDailyWorkReportBundle(auth.user.id, reportDate);
    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof WorkReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[work-reports:get]", error);
    return NextResponse.json({ error: "Failed to load work report." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const bundle = await upsertDailyWorkReport({
      accountManagerId: auth.user.id,
      reportDateInput: typeof body?.reportDate === "string" ? body.reportDate : null,
      summaryComment:
        typeof body?.summaryComment === "string" ? body.summaryComment : null,
      blockersComment:
        typeof body?.blockersComment === "string" ? body.blockersComment : null,
      focusNextComment:
        typeof body?.focusNextComment === "string" ? body.focusNextComment : null,
      submit: body?.submit === true,
    });

    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof WorkReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[work-reports:post]", error);
    return NextResponse.json({ error: "Failed to save work report." }, { status: 500 });
  }
}

