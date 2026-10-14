import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { isActiveClient } from "@/lib/intake";
import { recordFieldClassification, computeFieldSignature } from "@/lib/learned-fields";
import { deriveQuestionKey } from "@/lib/apply/field-resolver";

/**
 * POST /api/extension/learn-fields
 *
 * Mode 3 learning emitter. The runner diffs what it autofilled against the
 * final DOM values at submit and sends the human's corrections / blank-fills.
 * Each event is canonicalized so the autonomous runner benefits next time:
 *
 *   - identity/PII fields  → skipped for global learning (never learn values)
 *   - known screening keys → upsert the seeker's job_seeker_screening_answers
 *                            (per-seeker; the resolver already matches by label)
 *   - novel fields         → a global learned_field_rules rule {kind:static}
 *                            with source 'user_confirmed' (upgrades the LLM cache)
 *
 * Every event is also written to learned_field_events (values hashed).
 */

type IncomingEvent = {
  label?: string;
  type?: string | null;
  options?: string[] | null;
  outcome?: "accepted" | "corrected" | "filled_blank";
  autofilled_value?: string | null;
  final_value?: string | null;
};

type LearnFieldsPayload = {
  ats_type?: string | null;
  url_host?: string | null;
  job?: { title?: string | null; company?: string | null; job_post_id?: string | null } | null;
  events?: IncomingEvent[];
};

// Free-text identity / PII fields we must never learn globally.
const IDENTITY_LABEL_PATTERNS = [
  "first name",
  "last name",
  "full name",
  "preferred name",
  "middle name",
  "email",
  "e-mail",
  "phone",
  "mobile",
  "telephone",
  "address",
  "street",
  "city",
  "state",
  "province",
  "zip",
  "postal",
  "linkedin",
  "portfolio",
  "website",
  "date of birth",
  "social security",
];

function isIdentityLabel(label: string): boolean {
  const l = label.toLowerCase();
  return IDENTITY_LABEL_PATTERNS.some((p) => l.includes(p));
}

function toAnswerType(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t === "select" || t === "radio" || t === "checkbox") return t;
  return "text";
}

// An enumerated field's value is one of a shared, non-PII option set, so it is
// safe to learn as a global rule. Free-text values may be seeker-specific.
function isEnumeratedField(
  type: string | null | undefined,
  options: string[] | null
): boolean {
  const t = (type ?? "").toLowerCase();
  return (
    t === "select" ||
    t === "radio" ||
    t === "checkbox" ||
    (Array.isArray(options) && options.length > 0)
  );
}

function sha256(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export async function POST(request: Request) {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  const jobSeekerId = session.active_job_seeker_id;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "No active job seeker selected." }, { status: 400 });
  }

  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", session.account_manager_id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Not authorized for this job seeker." }, { status: 403 });
  }

  if (!(await isActiveClient(jobSeekerId))) {
    return NextResponse.json(
      { error: "Live applications are only allowed for active clients." },
      { status: 409 }
    );
  }

  let payload: LearnFieldsPayload;
  try {
    payload = (await request.json()) as LearnFieldsPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const atsType = payload.ats_type ?? null;
  const urlHost = payload.url_host ?? null;
  const events = Array.isArray(payload.events) ? payload.events : [];

  let identitySkipped = 0;
  let freetextSkipped = 0;
  const auditRows: Record<string, unknown>[] = [];
  // Batch the learning writes (one screening upsert, parallel rule classifications)
  // instead of a round-trip per field. Screening rows are deduped by question_key
  // (last wins) so a single upsert can't hit the same conflict row twice.
  const screeningByKey = new Map<string, Record<string, unknown>>();
  const classificationTasks: Array<ReturnType<typeof recordFieldClassification>> = [];

  for (const event of events) {
    const label = event.label?.trim();
    const finalValue = event.final_value?.trim() || null;
    // We only learn from corrections and blank-fills that produced a value.
    const outcome =
      event.outcome === "corrected" || event.outcome === "filled_blank"
        ? event.outcome
        : "accepted";

    if (!label) continue;

    const field = {
      label,
      type: event.type ?? null,
      options: Array.isArray(event.options) ? event.options : null,
    };

    let mapping: Record<string, unknown> | null = null;

    if (outcome !== "accepted" && finalValue) {
      if (isIdentityLabel(label)) {
        // PII — audit only, never learn the value globally.
        identitySkipped++;
        mapping = { kind: "identity_skipped" };
      } else {
        const questionKey = deriveQuestionKey(label);
        if (questionKey) {
          // Per-seeker: the resolver matches this label to the key automatically.
          screeningByKey.set(questionKey, {
            job_seeker_id: jobSeekerId,
            question_key: questionKey,
            question_text: label,
            answer_value: finalValue,
            answer_type: toAnswerType(event.type),
            updated_at: new Date().toISOString(),
          });
          mapping = { kind: "screening_answer", key: questionKey };
        } else if (isEnumeratedField(event.type, field.options)) {
          // Novel *enumerated* field (select/radio/checkbox) → a global static
          // rule is safe: the value is a shared option, not free text. This
          // upgrades the existing global LLM cache with a human-confirmed value.
          classificationTasks.push(
            recordFieldClassification({
              atsType,
              urlHost,
              field,
              mapping: { kind: "static", value: finalValue },
              source: "user_confirmed",
              confidence: 0.8,
              createdBy: session.account_manager_id,
            })
          );
          mapping = { kind: "static", value: finalValue };
        } else {
          // Novel *free-text* field — the value may be seeker-specific PII
          // (current employer, GitHub, essays). NEVER learn it globally, or one
          // seeker's answer would be injected into every seeker on this host.
          freetextSkipped++;
          mapping = { kind: "freetext_skipped" };
        }
      }
    }

    auditRows.push({
      job_seeker_id: jobSeekerId,
      account_manager_id: session.account_manager_id,
      ats_type: atsType,
      url_host: urlHost,
      field_signature: computeFieldSignature(field),
      field_label: label,
      field_type: event.type ?? null,
      field_options: field.options,
      outcome,
      autofilled_value_hash: sha256(event.autofilled_value ?? null),
      final_value_hash: sha256(finalValue),
      mapping,
      source_mode: "live_autofill",
    });
  }

  // Execute the batched learning writes.
  let screeningUpserted = 0;
  if (screeningByKey.size > 0) {
    const { error } = await supabaseAdmin
      .from("job_seeker_screening_answers")
      .upsert(Array.from(screeningByKey.values()), {
        onConflict: "job_seeker_id,question_key",
      });
    if (!error) screeningUpserted = screeningByKey.size;
    else console.error("[learn-fields] screening upsert failed:", error.message);
  }

  const rulesLearned = (await Promise.all(classificationTasks)).filter(Boolean).length;

  if (auditRows.length > 0) {
    const { error: auditError } = await supabaseAdmin
      .from("learned_field_events")
      .insert(auditRows);
    if (auditError) {
      console.error("[learn-fields] audit insert failed:", auditError.message);
    }
  }

  return NextResponse.json({
    success: true,
    received: events.length,
    screening_upserted: screeningUpserted,
    rules_learned: rulesLearned,
    identity_skipped: identitySkipped,
    freetext_skipped: freetextSkipped,
  });
}
