import crypto from "crypto";
import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Learned field rules cache (learned_field_rules, migration 082).
//
// The runner's field classifier checks lookupFieldRule before calling
// the LLM. Cache misses fall through to LLM; LLM successes are written
// back via recordFieldClassification.
//
// After 3 successful uses an LLM-sourced rule auto-promotes (raising its
// confidence and source='promoted'), making it visible as a candidate
// for admin review in a future UI surface.
// ============================================================

const log = createLogger("learned-fields");

const PROMOTION_HITS = 3;

export type LearnedFieldSource =
  | "llm"
  | "rule"
  | "am_fix"
  | "promoted"
  | "user_confirmed";

export interface FieldDescriptor {
  /** The visible label as rendered in the form. */
  label: string;
  /** HTML input type / role — "text", "select", "radio", "checkbox", "file", etc. */
  type?: string | null;
  /** Distinct option values (for select/radio). Used in the signature. */
  options?: string[] | null;
}

export interface LearnedFieldRule {
  id: string;
  ats_type: string;
  url_host: string;
  field_signature: string;
  field_label: string | null;
  field_type: string | null;
  mapping: Record<string, unknown>;
  source: LearnedFieldSource;
  confidence: number;
  hits: number;
  last_used_at: string | null;
}

/**
 * Stable signature key. Same label+type+option-set on the same host →
 * same signature even if option ORDER varies.
 */
export function computeFieldSignature(field: FieldDescriptor): string {
  const labelKey = (field.label ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const typeKey = (field.type ?? "").toLowerCase();
  const optsKey = Array.isArray(field.options)
    ? [...field.options]
        .map((v) => v.toLowerCase().trim())
        .sort()
        .join("|")
    : "";
  const seed = `${labelKey}::${typeKey}::${optsKey}`;
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase();
}

function normalizeAts(ats: string | null | undefined): string {
  return (ats ?? "UNKNOWN").trim().toUpperCase();
}

/**
 * Best-effort lookup; never throws.
 * Returns null on a miss so the caller can fall through to its LLM path.
 */
export async function lookupFieldRule(args: {
  atsType: string | null | undefined;
  urlHost: string | null | undefined;
  field: FieldDescriptor;
}): Promise<LearnedFieldRule | null> {
  const atsType = normalizeAts(args.atsType);
  const urlHost = normalizeHost(args.urlHost);
  if (!urlHost) return null;
  const signature = computeFieldSignature(args.field);

  try {
    const { data, error } = await supabaseAdmin
      .from("learned_field_rules")
      .select("*")
      .eq("ats_type", atsType)
      .eq("url_host", urlHost)
      .eq("field_signature", signature)
      .maybeSingle();
    if (error) {
      log.warn("lookupFieldRule failed", { error: error.message });
      return null;
    }
    if (!data) return null;
    return data as LearnedFieldRule;
  } catch (err) {
    log.warn("lookupFieldRule threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Increment hit count + last_used_at after the runner successfully used
 * a cached rule. Auto-promotes 'llm' → 'promoted' once hits >= PROMOTION_HITS.
 */
export async function recordFieldHit(ruleId: string): Promise<void> {
  try {
    const { data: row } = await supabaseAdmin
      .from("learned_field_rules")
      .select("hits, source, confidence")
      .eq("id", ruleId)
      .maybeSingle();
    if (!row) return;

    const nextHits = (row.hits ?? 0) + 1;
    const shouldPromote = row.source === "llm" && nextHits >= PROMOTION_HITS;

    const updates: Record<string, unknown> = {
      hits: nextHits,
      last_used_at: new Date().toISOString(),
    };
    if (shouldPromote) {
      updates.source = "promoted";
      updates.confidence = Math.min(1, Math.max(Number(row.confidence) || 0.5, 0.75));
    }

    await supabaseAdmin.from("learned_field_rules").update(updates).eq("id", ruleId);
  } catch (err) {
    log.warn("recordFieldHit threw", {
      ruleId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Persist a new classification. Idempotent on the (ats, host, signature)
 * uniqueness; an existing row gets its hit count bumped instead.
 */
export async function recordFieldClassification(args: {
  atsType: string | null | undefined;
  urlHost: string | null | undefined;
  field: FieldDescriptor;
  mapping: Record<string, unknown>;
  source?: LearnedFieldSource;
  confidence?: number;
  createdBy?: string | null;
}): Promise<LearnedFieldRule | null> {
  const atsType = normalizeAts(args.atsType);
  const urlHost = normalizeHost(args.urlHost);
  if (!urlHost) return null;
  const signature = computeFieldSignature(args.field);
  const source = args.source ?? "llm";
  const confidence =
    typeof args.confidence === "number" ? Math.max(0, Math.min(1, args.confidence)) : 0.5;

  try {
    // Try insert; on conflict, bump hits + last_used_at.
    const insertPayload = {
      ats_type: atsType,
      url_host: urlHost,
      field_signature: signature,
      field_label: args.field.label ?? null,
      field_type: args.field.type ?? null,
      mapping: args.mapping,
      source,
      confidence,
      hits: 1,
      last_used_at: new Date().toISOString(),
      created_by: args.createdBy ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("learned_field_rules")
      .upsert(insertPayload, {
        onConflict: "ats_type,url_host,field_signature",
        ignoreDuplicates: false,
      })
      .select("*")
      .single();

    if (error) {
      log.warn("recordFieldClassification failed", { error: error.message });
      return null;
    }
    return data as LearnedFieldRule;
  } catch (err) {
    log.warn("recordFieldClassification threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
