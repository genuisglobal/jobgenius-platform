import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import {
  loadFactDefinitions,
  getActiveFacts,
  resolveFromFact,
  upsertFact,
} from "@/lib/consultant/fact-ledger";
import { closeOpenDecisionsForFact } from "@/lib/consultant/decision-engine";

interface RouteContext {
  params: { id: string };
}

async function verifyAccess(userId: string, role: string | undefined, seekerId: string) {
  if (isAdminRole(role)) return true;
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", userId)
    .eq("job_seeker_id", seekerId)
    .maybeSingle();
  return !!assignment;
}

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await verifyAccess(user.id, user.role, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [defs, active] = await Promise.all([
    loadFactDefinitions(),
    getActiveFacts(params.id),
  ]);

  const facts = [];
  const seen = new Set<string>();

  for (const [key, def] of Array.from(defs.entries())) {
    seen.add(key);
    const fact = active.get(key);
    facts.push({
      fact_key: key,
      label: def.label,
      category: def.category,
      sensitivity: def.sensitivity,
      value_type: def.value_type,
      value: fact?.fact_value ?? null,
      provenance: fact?.provenance ?? null,
      confirmed_at: fact?.confirmed_at ?? null,
      expires_at: fact?.expires_at ?? null,
      resolution: resolveFromFact(def, fact),
    });
  }

  // Custom facts (keys not in the registry).
  for (const [key, fact] of Array.from(active.entries())) {
    if (seen.has(key)) continue;
    facts.push({
      fact_key: key,
      label: key,
      category: "custom",
      sensitivity: "standard",
      value_type: "text",
      value: fact.fact_value,
      provenance: fact.provenance,
      confirmed_at: fact.confirmed_at,
      expires_at: fact.expires_at,
      resolution: resolveFromFact(undefined, fact),
    });
  }

  return NextResponse.json({ facts });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await verifyAccess(user.id, user.role, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { fact_key?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const factKey = typeof body.fact_key === "string" ? body.fact_key.trim() : "";
  const value = typeof body.value === "string" ? body.value : "";
  if (!factKey || !value.trim()) {
    return NextResponse.json(
      { error: "fact_key and value are required" },
      { status: 400 }
    );
  }

  const fact = await upsertFact({
    jobSeekerId: params.id,
    factKey,
    value: value.trim(),
    provenance: "am_entered",
    confirmedBy: user.id,
  });

  // Confirming a fact auto-resolves any open Ask decisions waiting on it.
  await closeOpenDecisionsForFact(params.id, factKey).catch(() => {});

  const defs = await loadFactDefinitions();
  const resolution = resolveFromFact(defs.get(factKey), fact);

  return NextResponse.json({ fact, resolution });
}
