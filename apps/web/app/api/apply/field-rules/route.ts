import { NextResponse } from "next/server";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import {
  lookupFieldRule,
  recordFieldClassification,
  recordFieldHit,
  type FieldDescriptor,
} from "@/lib/learned-fields";

/**
 * GET /api/apply/field-rules?ats=X&host=Y&label=Z&type=text&options=a,b,c
 * Runner cache lookup. Returns 200 with { rule } or { rule: null }.
 *
 * POST /api/apply/field-rules
 * Body: { ats_type, url_host, field: { label, type, options }, mapping, source?, confidence? }
 * Records a new classification or bumps an existing one's hits.
 *
 * Both use bearer-runner auth (same as /api/apply/* family).
 */

function parseOptions(raw: string | null): string[] | null {
  if (!raw) return null;
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

export async function GET(request: Request) {
  const auth = await getAccountManagerFromRequest(request.headers);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const atsType = url.searchParams.get("ats");
  const urlHost = url.searchParams.get("host");
  const label = url.searchParams.get("label");
  const type = url.searchParams.get("type");
  const options = parseOptions(url.searchParams.get("options"));

  if (!atsType || !urlHost || !label) {
    return NextResponse.json(
      { error: "ats, host, and label are required." },
      { status: 400 }
    );
  }

  const field: FieldDescriptor = { label, type, options };
  const rule = await lookupFieldRule({ atsType, urlHost, field });

  // Record a hit on cache use so promotion happens correctly. Best-effort.
  if (rule?.id) {
    void recordFieldHit(rule.id);
  }

  return NextResponse.json({ rule });
}

export async function POST(request: Request) {
  const auth = await getAccountManagerFromRequest(request.headers);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: {
    ats_type?: unknown;
    url_host?: unknown;
    field?: { label?: unknown; type?: unknown; options?: unknown };
    mapping?: unknown;
    source?: unknown;
    confidence?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const atsType = typeof body.ats_type === "string" ? body.ats_type : null;
  const urlHost = typeof body.url_host === "string" ? body.url_host : null;
  const label =
    body.field && typeof body.field.label === "string" ? body.field.label : null;
  if (!atsType || !urlHost || !label) {
    return NextResponse.json(
      { error: "ats_type, url_host, and field.label are required." },
      { status: 400 }
    );
  }

  const field: FieldDescriptor = {
    label,
    type:
      body.field && typeof body.field.type === "string" ? body.field.type : null,
    options:
      body.field && Array.isArray(body.field.options)
        ? (body.field.options as unknown[]).filter(
            (v): v is string => typeof v === "string"
          )
        : null,
  };

  const mapping =
    body.mapping && typeof body.mapping === "object"
      ? (body.mapping as Record<string, unknown>)
      : null;
  if (!mapping) {
    return NextResponse.json({ error: "mapping is required." }, { status: 400 });
  }

  const result = await recordFieldClassification({
    atsType,
    urlHost,
    field,
    mapping,
    source:
      body.source === "llm" || body.source === "rule" || body.source === "am_fix" || body.source === "promoted"
        ? body.source
        : "llm",
    confidence: typeof body.confidence === "number" ? body.confidence : undefined,
    createdBy: auth.accountManager.id,
  });

  if (!result) {
    return NextResponse.json({ error: "Failed to record rule." }, { status: 500 });
  }

  return NextResponse.json({ rule: result }, { status: 201 });
}
