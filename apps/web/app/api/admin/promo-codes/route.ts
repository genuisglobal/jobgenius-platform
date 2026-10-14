import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { normalizeOfferCode } from "@/lib/offers";

type PromoCodeBody = {
  code?: string;
  label?: string;
  status?: "active" | "inactive" | "expired";
  discountPercentEssentials?: number;
  discountPercentPremium?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  singleUsePerEmail?: boolean;
};

function normalizePercent(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value / 100));
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load promo codes." }, { status: 500 });
  }

  return NextResponse.json({ promoCodes: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: PromoCodeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const code = normalizeOfferCode(body.code);
  const label = body.label?.trim();
  if (!code || !label) {
    return NextResponse.json(
      { error: "Code and label are required." },
      { status: 400 }
    );
  }

  const payload = {
    code,
    label,
    status: body.status ?? "active",
    discount_percent_essentials: normalizePercent(
      body.discountPercentEssentials,
      0.2
    ),
    discount_percent_premium: normalizePercent(body.discountPercentPremium, 0.25),
    starts_at: body.startsAt || null,
    ends_at: body.endsAt || null,
    max_redemptions:
      typeof body.maxRedemptions === "number" && body.maxRedemptions > 0
        ? Math.trunc(body.maxRedemptions)
        : null,
    single_use_per_email: body.singleUsePerEmail ?? true,
    created_by: auth.user.id,
  };

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create promo code." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, promoCode: data }, { status: 201 });
}
