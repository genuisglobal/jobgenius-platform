import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  DISCIPLINARY_RECORD_SEVERITIES,
  DISCIPLINARY_RECORD_STATUSES,
  type DisciplinaryRecordSeverity,
  type DisciplinaryRecordStatus,
} from "@/lib/people";
import { listDisciplinaryRecords } from "@/lib/people-server";
import { logAdminAction } from "@/lib/audit";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return unauthorized();
  }

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || undefined;
    const records = await listDisciplinaryRecords(employeeId);
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to load disciplinary records.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const recordId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const employeeId =
    typeof body.employee_id === "string" && body.employee_id.trim()
      ? body.employee_id.trim()
      : "";
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "";

  if (!employeeId || !title) {
    return NextResponse.json(
      { error: "Employee and record title are required." },
      { status: 400 }
    );
  }

  const severity: DisciplinaryRecordSeverity =
    typeof body.severity === "string" &&
    DISCIPLINARY_RECORD_SEVERITIES.includes(body.severity as DisciplinaryRecordSeverity)
      ? (body.severity as DisciplinaryRecordSeverity)
      : "coaching";

  const status: DisciplinaryRecordStatus =
    typeof body.status === "string" &&
    DISCIPLINARY_RECORD_STATUSES.includes(body.status as DisciplinaryRecordStatus)
      ? (body.status as DisciplinaryRecordStatus)
      : "active";

  const { data: employee, error: employeeError } = await supabaseAdmin
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const payload = {
    employee_id: employeeId,
    severity,
    category:
      typeof body.category === "string" ? body.category.trim() || null : null,
    title,
    description:
      typeof body.description === "string" ? body.description.trim() || null : null,
    status,
    opened_at:
      typeof body.opened_at === "string" && body.opened_at.trim()
        ? body.opened_at.trim()
        : nowIso,
    resolved_at:
      status === "resolved" || status === "dismissed"
        ? typeof body.resolved_at === "string" && body.resolved_at.trim()
          ? body.resolved_at.trim()
          : nowIso
        : null,
    created_by: auth.user.id,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  const query = supabaseAdmin.from("disciplinary_records");
  const result = recordId
    ? await query.update(payload).eq("id", recordId).select("*").single()
    : await query.insert(payload).select("*").single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save disciplinary record." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.disciplinary_record_update",
    targetType: "disciplinary_record",
    targetId: result.data.id,
    details: {
      employee_id: employeeId,
      severity,
      status,
      category: payload.category,
    },
  }).catch(() => {});

  return NextResponse.json({ record: result.data });
}
