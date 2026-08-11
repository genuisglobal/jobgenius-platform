import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { data, error } = await supabaseAdmin
    .from("ranker_models")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also surface counts of labelled training data so admin sees readiness.
  const { count: labelled } = await supabaseAdmin
    .from("match_features")
    .select("id", { count: "exact", head: true })
    .not("outcome", "is", null);

  return NextResponse.json({ models: data ?? [], labelled_count: labelled ?? 0 });
}

/**
 * POST /api/admin/ranker
 * Body: { action: "train", notes?: string, options?: { epochs?, learning_rate?, l2?, holdout? } }
 *
 * Runs offline training on the latest labelled match_features.
 * Inserts a new ranker_models row with status='pending'. Admin promotes
 * via PATCH /api/admin/ranker/[id].
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: {
    action?: unknown;
    notes?: unknown;
    options?: {
      epochs?: unknown;
      learning_rate?: unknown;
      l2?: unknown;
      holdout?: unknown;
    };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action !== "train") {
    return NextResponse.json({ error: "action must be 'train'." }, { status: 400 });
  }

  // Lazy import the heavy library so this route doesn't bloat other entrypoints.
  const { loadLabelledExamples, trainLogisticRegression } = await import(
    "@/lib/learned-ranker"
  );

  const examples = await loadLabelledExamples();
  if (examples.length < 20) {
    return NextResponse.json(
      {
        error: `Not enough labelled examples (${examples.length}). Need at least 20 with outcomes in interview/offer/rejection/ghosted.`,
        labelled: examples.length,
      },
      { status: 400 }
    );
  }

  const result = trainLogisticRegression(examples, {
    epochs: Number(body.options?.epochs) || undefined,
    learningRate: Number(body.options?.learning_rate) || undefined,
    l2: Number(body.options?.l2) || undefined,
    holdoutFraction: Number(body.options?.holdout) || undefined,
  });

  // Next version per family.
  const { data: latest } = await supabaseAdmin
    .from("ranker_models")
    .select("version")
    .eq("family", "logistic_regression")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((latest?.version as number | undefined) ?? 0) + 1;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("ranker_models")
    .insert({
      family: "logistic_regression",
      version: nextVersion,
      weights: result.weights,
      training_size: result.trainingSize,
      training_positive: result.positive,
      training_negative: result.negative,
      metrics: result.metrics,
      status: "pending",
      created_by: auth.user.id,
      notes: typeof body.notes === "string" ? body.notes : null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `Insert failed (${insertError.message}).` },
      { status: 500 }
    );
  }

  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "ranker_model",
    targetId: inserted.id,
    details: {
      action: "train",
      version: nextVersion,
      training_size: result.trainingSize,
      metrics: result.metrics,
    },
  });

  return NextResponse.json({ model: inserted, training_result: result }, { status: 201 });
}
