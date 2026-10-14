import { supabaseServer } from "@/lib/supabase/server";

export type FactSensitivity = "standard" | "sensitive" | "legal";
export type FactProvenance =
  | "client_confirmed"
  | "am_entered"
  | "ai_inferred"
  | "imported";

export type FactDefinition = {
  fact_key: string;
  label: string;
  category: string;
  sensitivity: FactSensitivity;
  value_type: string;
  default_ttl_days: number | null;
  ai_inference_allowed: boolean;
  applies_to: string;
};

export type ClientFact = {
  id: string;
  job_seeker_id: string;
  fact_key: string;
  fact_value: string | null;
  provenance: FactProvenance;
  confidence: number | null;
  source_ref: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  expires_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FactResolution =
  | { status: "confirmed"; value: string; provenance: FactProvenance; expiresAt: string | null }
  | { status: "needs_confirmation"; reason: "missing" | "stale" | "unconfirmed_provenance" }
  | { status: "escalate"; reason: "legal_category" };

let definitionsCache: Map<string, FactDefinition> | null = null;

export async function loadFactDefinitions(): Promise<Map<string, FactDefinition>> {
  if (definitionsCache) return definitionsCache;
  const { data } = await supabaseServer.from("fact_definitions").select("*");
  const map = new Map<string, FactDefinition>();
  for (const row of (data ?? []) as FactDefinition[]) {
    map.set(row.fact_key, row);
  }
  definitionsCache = map;
  return map;
}

function isFresh(fact: ClientFact): boolean {
  if (!fact.expires_at) return true;
  return new Date(fact.expires_at).getTime() > Date.now();
}

/**
 * Pure gate rule (fail-closed). Decides whether automation may assert a fact.
 */
export function resolveFromFact(
  def: FactDefinition | undefined,
  fact: ClientFact | undefined
): FactResolution {
  const sensitivity: FactSensitivity = def?.sensitivity ?? "standard";

  // Legal/EEO/contractual facts are never auto-answered.
  if (sensitivity === "legal") {
    return { status: "escalate", reason: "legal_category" };
  }

  if (!fact || !fact.fact_value) {
    return { status: "needs_confirmation", reason: "missing" };
  }

  const trusted: FactProvenance[] =
    sensitivity === "sensitive"
      ? ["client_confirmed", "am_entered"]
      : ["client_confirmed", "am_entered", "imported"];
  if (sensitivity === "standard" && def?.ai_inference_allowed) {
    trusted.push("ai_inferred");
  }

  if (!trusted.includes(fact.provenance)) {
    return { status: "needs_confirmation", reason: "unconfirmed_provenance" };
  }
  if (!isFresh(fact)) {
    return { status: "needs_confirmation", reason: "stale" };
  }

  return {
    status: "confirmed",
    value: fact.fact_value,
    provenance: fact.provenance,
    expiresAt: fact.expires_at,
  };
}

export async function getActiveFacts(jobSeekerId: string): Promise<Map<string, ClientFact>> {
  const { data } = await supabaseServer
    .from("client_facts")
    .select("*")
    .eq("job_seeker_id", jobSeekerId)
    .eq("status", "active");

  const map = new Map<string, ClientFact>();
  for (const row of (data ?? []) as ClientFact[]) {
    map.set(row.fact_key, row);
  }
  return map;
}

export async function resolveFacts(
  jobSeekerId: string,
  keys: string[]
): Promise<Record<string, FactResolution>> {
  const [defs, active] = await Promise.all([
    loadFactDefinitions(),
    getActiveFacts(jobSeekerId),
  ]);
  const out: Record<string, FactResolution> = {};
  for (const key of keys) {
    out[key] = resolveFromFact(defs.get(key), active.get(key));
  }
  return out;
}

export async function resolveFact(
  jobSeekerId: string,
  factKey: string
): Promise<FactResolution> {
  const resolved = await resolveFacts(jobSeekerId, [factKey]);
  return resolved[factKey];
}

/** Returns the subset of requiredKeys that are NOT confirmed (i.e. need Ask/Escalate). */
export async function getMissingRequiredFacts(
  jobSeekerId: string,
  requiredKeys: string[]
): Promise<string[]> {
  const resolved = await resolveFacts(jobSeekerId, requiredKeys);
  return requiredKeys.filter((k) => resolved[k]?.status !== "confirmed");
}

/**
 * Record/confirm a fact. Supersedes the prior active row and writes a fresh one
 * with computed freshness (expiry) from the registry's default_ttl_days.
 */
export async function upsertFact(input: {
  jobSeekerId: string;
  factKey: string;
  value: string;
  provenance: FactProvenance;
  confirmedBy?: string | null;
  sourceRef?: string | null;
  confidence?: number | null;
}): Promise<ClientFact> {
  const defs = await loadFactDefinitions();
  const ttl = defs.get(input.factKey)?.default_ttl_days ?? null;
  const nowIso = new Date().toISOString();
  const expiresAt = ttl ? new Date(Date.now() + ttl * 86_400_000).toISOString() : null;

  await supabaseServer
    .from("client_facts")
    .update({ status: "superseded", updated_at: nowIso })
    .eq("job_seeker_id", input.jobSeekerId)
    .eq("fact_key", input.factKey)
    .eq("status", "active");

  const { data, error } = await supabaseServer
    .from("client_facts")
    .insert({
      job_seeker_id: input.jobSeekerId,
      fact_key: input.factKey,
      fact_value: input.value,
      provenance: input.provenance,
      confidence: input.confidence ?? null,
      source_ref: input.sourceRef ?? null,
      confirmed_at: nowIso,
      confirmed_by: input.confirmedBy ?? null,
      expires_at: expiresAt,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ClientFact;
}

/** Housekeeping: flip expired active facts to 'stale'. Freshness is also enforced lazily at read. */
export async function markStaleExpiredFacts(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await supabaseServer
    .from("client_facts")
    .update({ status: "stale", updated_at: nowIso })
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)
    .select("id");
  return data?.length ?? 0;
}
