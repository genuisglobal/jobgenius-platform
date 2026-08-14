import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { getCapacityMonthStart, getCapacitySnapshot } from "@/lib/intake";

function normalizeCapacityMonth(input?: string | null) {
  if (!input) return getCapacityMonthStart();
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : getCapacityMonthStart();
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const capacityMonth = normalizeCapacityMonth(url.searchParams.get("month"));

  try {
    const snapshot = await getCapacitySnapshot(capacityMonth);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Failed to load capacity snapshot." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    accountManagerId?: string;
    capacityMonth?: string;
    monthlyNewClientLimit?: number;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const accountManagerId = body.accountManagerId;
  const capacityMonth = normalizeCapacityMonth(body.capacityMonth);
  const monthlyNewClientLimit = Number(body.monthlyNewClientLimit);
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;

  if (!accountManagerId) {
    return NextResponse.json(
      { error: "accountManagerId is required." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(monthlyNewClientLimit) || monthlyNewClientLimit < 0) {
    return NextResponse.json(
      { error: "monthlyNewClientLimit must be 0 or greater." },
      { status: 400 }
    );
  }

  const { data: accountManager } = await supabaseAdmin
    .from("account_managers")
    .select("id")
    .eq("id", accountManagerId)
    .maybeSingle();

  if (!accountManager?.id) {
    return NextResponse.json(
      { error: "Account manager not found." },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("account_manager_capacity")
    .upsert(
      {
        account_manager_id: accountManagerId,
        capacity_month: capacityMonth,
        monthly_new_client_limit: Math.trunc(monthlyNewClientLimit),
        notes,
        created_by: auth.user.id,
      },
      {
        onConflict: "account_manager_id,capacity_month",
      }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save capacity override." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, capacity: data });
}
