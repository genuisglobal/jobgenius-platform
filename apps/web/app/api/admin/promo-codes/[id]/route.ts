import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { normalizeOfferCode } from "@/lib/offers";

type RouteParams = {
  params: { id: string };
};

type PromoCodeUpdateBody = {
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

function normalizePercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value / 100));
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: PromoCodeUpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const normalizedCode = normalizeOfferCode(body.code);
    if (!normalizedCode) {
      return NextResponse.json({ error: "Invalid promo code." }, { status: 400 });
    }
    updates.code = normalizedCode;
  }
  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label) {
      return NextResponse.json({ error: "Label is required." }, { status: 400 });
    }
    updates.label = label;
  }
  if (body.status !== undefined) {
    updates.status = body.status;
  }

  const essentialsPercent = normalizePercent(body.discountPercentEssentials);
  if (essentialsPercent !== undefined) {
    updates.discount_percent_essentials = essentialsPercent;
  }

  const premiumPercent = normalizePercent(body.discountPercentPremium);
  if (premiumPercent !== undefined) {
    updates.discount_percent_premium = premiumPercent;
  }

  if (body.startsAt !== undefined) {
    updates.starts_at = body.startsAt || null;
  }
  if (body.endsAt !== undefined) {
    updates.ends_at = body.endsAt || null;
  }
  if (body.maxRedemptions !== undefined) {
    updates.max_redemptions =
      typeof body.maxRedemptions === "number" && body.maxRedemptions > 0
        ? Math.trunc(body.maxRedemptions)
        : null;
  }
  if (body.singleUsePerEmail !== undefined) {
    updates.single_use_per_email = body.singleUsePerEmail;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update promo code." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, promoCode: data });
}
