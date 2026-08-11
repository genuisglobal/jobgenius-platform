import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

const DEFAULT_MAX_INSTALLMENTS = 3;
const DEFAULT_WINDOW_DAYS = 31;
const FLEX_MAX_INSTALLMENTS = 12;
const FLEX_MAX_WINDOW_DAYS = 365;

type RequestPayload = {
  requested_installment_count?: number;
  requested_window_days?: number;
  requested_note?: string;
  requested_schedule?: unknown;
};

type RequestedScheduleItemInput = {
  amount?: number | string;
  proposed_date?: string;
  proposedDate?: string;
};

type RequestedScheduleItem = {
  installment_number: number;
  amount: number;
  proposed_date: string;
};

function isFlexTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; details?: string };
  const code = row.code ?? "";
  const text = `${row.message ?? ""} ${row.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    text.includes("registration_flex_requests") ||
    text.includes("requested_schedule")
  );
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const intValue = Math.trunc(value);
  return intValue > 0 ? intValue : null;
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function addDays(date: Date, days: number) {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: flexRequest, error } = await supabaseAdmin
    .from("registration_flex_requests")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isFlexTableMissingError(error)) {
      return NextResponse.json({
        request: null,
        unavailable: true,
        error:
          "Flexible registration requests are not available yet. Please run migrations 053 and 055.",
      });
    }
    return NextResponse.json(
      { error: "Failed to load flexible registration request." },
      { status: 500 }
    );
  }

  return NextResponse.json({ request: flexRequest ?? null });
}

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: RequestPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestedScheduleInput = Array.isArray(body.requested_schedule)
    ? (body.requested_schedule as RequestedScheduleItemInput[])
    : null;
  const requestedInstallmentCount =
    toPositiveInt(body.requested_installment_count) ??
    requestedScheduleInput?.length ??
    null;
  const requestedWindowDays = toPositiveInt(body.requested_window_days);
  const requestedNote =
    typeof body.requested_note === "string" ? body.requested_note.trim() : "";

  if (!requestedNote || requestedNote.length < 15) {
    return NextResponse.json(
      { error: "Please provide at least 15 characters explaining the request." },
      { status: 400 }
    );
  }

  if (!requestedScheduleInput || requestedScheduleInput.length === 0) {
    return NextResponse.json(
      {
        error:
          "Please include proposed installment amounts and payment dates for your request.",
      },
      { status: 400 }
    );
  }

  if (requestedInstallmentCount === null) {
    return NextResponse.json(
      {
        error:
          "Please include how many installments you are requesting and provide a matching schedule.",
      },
      { status: 400 }
    );
  }

  if (
    requestedInstallmentCount < 1 ||
    requestedInstallmentCount > FLEX_MAX_INSTALLMENTS
  ) {
    return NextResponse.json(
      {
        error: `Requested installment count must be between 1 and ${FLEX_MAX_INSTALLMENTS}.`,
      },
      { status: 400 }
    );
  }

  if (requestedScheduleInput.length !== requestedInstallmentCount) {
    return NextResponse.json(
      {
        error:
          "Proposed schedule entries must match your requested installment count.",
      },
      { status: 400 }
    );
  }

  if (
    requestedWindowDays !== null &&
    (requestedWindowDays < 7 || requestedWindowDays > FLEX_MAX_WINDOW_DAYS)
  ) {
    return NextResponse.json(
      {
        error: `Requested payment window must be between 7 and ${FLEX_MAX_WINDOW_DAYS} days.`,
      },
      { status: 400 }
    );
  }

  if (
    (requestedInstallmentCount ?? DEFAULT_MAX_INSTALLMENTS) <=
      DEFAULT_MAX_INSTALLMENTS &&
    (requestedWindowDays ?? DEFAULT_WINDOW_DAYS) <= DEFAULT_WINDOW_DAYS
  ) {
    return NextResponse.json(
      {
        error:
          "Your request must exceed the default registration terms (up to 3 installments within 31 days).",
      },
      { status: 400 }
    );
  }

  const [{ data: existingPending, error: pendingError }, { data: contract }] =
    await Promise.all([
      supabaseAdmin
        .from("registration_flex_requests")
        .select("id")
        .eq("job_seeker_id", auth.user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("job_seeker_contracts")
        .select("id, registration_fee")
        .eq("job_seeker_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (pendingError) {
    if (isFlexTableMissingError(pendingError)) {
      return NextResponse.json(
        {
          unavailable: true,
          error:
            "Flexible registration requests are not enabled yet. Please contact support.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to check current request status." },
      { status: 500 }
    );
  }

  if (existingPending) {
    return NextResponse.json(
      { error: "You already have a pending flexible registration request." },
      { status: 409 }
    );
  }

  if (!contract?.id) {
    return NextResponse.json(
      { error: "Please sign your contract first before requesting flexible registration terms." },
      { status: 400 }
    );
  }

  const contractFeeRaw =
    typeof contract.registration_fee === "number"
      ? contract.registration_fee
      : Number(contract.registration_fee);
  const contractFeeCents = Math.round(contractFeeRaw * 100);

  if (!Number.isFinite(contractFeeRaw) || contractFeeRaw <= 0 || contractFeeCents <= 0) {
    return NextResponse.json(
      { error: "Unable to verify your registration fee for this request." },
      { status: 500 }
    );
  }

  const effectiveRequestedWindowDays = requestedWindowDays ?? DEFAULT_WINDOW_DAYS;
  const todayUtc = startOfTodayUtc();
  const maxRequestedDateUtc = addDays(todayUtc, effectiveRequestedWindowDays);

  const requestedSchedule: RequestedScheduleItem[] = [];
  let scheduleTotalCents = 0;

  for (let index = 0; index < requestedScheduleInput.length; index += 1) {
    const row = requestedScheduleInput[index] ?? {};
    const amountRaw =
      typeof row.amount === "number" ? row.amount : Number(row.amount);
    const amountCents = Math.round(amountRaw * 100);
    const proposedDateRaw = row.proposed_date ?? row.proposedDate ?? "";

    if (!Number.isFinite(amountRaw) || amountCents <= 0) {
      return NextResponse.json(
        {
          error: `Installment ${index + 1} must include a valid amount greater than 0.`,
        },
        { status: 400 }
      );
    }

    if (typeof proposedDateRaw !== "string" || !proposedDateRaw) {
      return NextResponse.json(
        {
          error: `Installment ${index + 1} must include a valid proposed payment date.`,
        },
        { status: 400 }
      );
    }

    const proposedDate = parseDateOnly(proposedDateRaw);
    if (!proposedDate) {
      return NextResponse.json(
        {
          error: `Installment ${index + 1} has an invalid date format (use YYYY-MM-DD).`,
        },
        { status: 400 }
      );
    }

    if (proposedDate < todayUtc || proposedDate > maxRequestedDateUtc) {
      return NextResponse.json(
        {
          error: `Installment ${index + 1} date must be within ${effectiveRequestedWindowDays} days from today.`,
        },
        { status: 400 }
      );
    }

    scheduleTotalCents += amountCents;
    requestedSchedule.push({
      installment_number: index + 1,
      amount: amountCents / 100,
      proposed_date: proposedDateRaw,
    });
  }

  if (Math.abs(scheduleTotalCents - contractFeeCents) > 1) {
    return NextResponse.json(
      {
        error: `Requested schedule total must equal your registration fee (${(contractFeeCents / 100).toFixed(2)}).`,
      },
      { status: 400 }
    );
  }

  const { data: flexRequest, error } = await supabaseAdmin
    .from("registration_flex_requests")
    .insert({
      job_seeker_id: auth.user.id,
      contract_id: contract.id,
      requested_installment_count: requestedInstallmentCount,
      requested_window_days: requestedWindowDays,
      requested_note: requestedNote,
      requested_schedule: requestedSchedule,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !flexRequest) {
    if (isFlexTableMissingError(error)) {
      return NextResponse.json(
        {
          unavailable: true,
          error:
            "Flexible registration requests are not enabled yet. Please contact support.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to submit flexible registration request." },
      { status: 500 }
    );
  }

  const [{ data: seeker }, { data: admins }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("full_name, email")
      .eq("id", auth.user.id)
      .maybeSingle(),
    supabaseAdmin
      .from("account_managers")
      .select("email, name")
      .in("role", ["admin", "superadmin"]),
  ]);

  if (admins && admins.length > 0) {
    const seekerName = seeker?.full_name || auth.user.email;
    const requestedCountLabel =
      requestedInstallmentCount !== null
        ? `${requestedInstallmentCount}`
        : "not specified";
    const requestedWindowLabel =
      requestedWindowDays !== null ? `${requestedWindowDays}` : "not specified";
    const scheduleLines = requestedSchedule
      .map(
        (item) =>
          `<li>#${item.installment_number}: <strong>$${item.amount.toFixed(2)}</strong> on <strong>${item.proposed_date}</strong></li>`
      )
      .join("");

    await Promise.all(
      admins.map((admin) =>
        sendAndLogEmail({
          to: admin.email,
          subject: `Flexible registration request: ${seekerName}`,
          html: `
            <p>Hello ${admin.name ?? "Admin"},</p>
            <p><strong>${seekerName}</strong> requested a flexible registration payment plan.</p>
            <p>Requested installment count: <strong>${requestedCountLabel}</strong></p>
            <p>Requested payment window (days): <strong>${requestedWindowLabel}</strong></p>
            <p>Proposed schedule:</p>
            <ol>${scheduleLines}</ol>
            <p>Reason:</p>
            <blockquote style="border-left:3px solid #d1d5db;padding-left:12px;margin:8px 0;">${requestedNote}</blockquote>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing">Review in Billing Dashboard</a></p>
          `,
          job_seeker_id: auth.user.id,
          template_key: "billing-registration-flex-requested",
        }).catch((err) => { console.error("[billing] send flex request email failed:", err); return null; })
      )
    );
  }

  return NextResponse.json({ ok: true, request: flexRequest }, { status: 201 });
}
