"use client";

import { useState } from "react";
import { generateContractHTML } from "@/lib/contract-template";

type PlanType = "essentials" | "premium";

interface OfferQuote {
  planType: PlanType;
  code: string | null;
  source: "promo_code" | "seeker_referral" | null;
  applied: boolean;
  invalidCode: boolean;
  baseFee: number;
  discountPercent: number;
  discountAmount: number;
  finalFee: number;
}

interface ContractStepProps {
  seekerName: string;
  seekerEmail: string;
  planType: PlanType;
  offerCode: string | null;
  quote: OfferQuote;
  onContinue: (registrationFee: number) => void;
  onBack: () => void;
}

export default function ContractStep({
  seekerName,
  seekerEmail,
  planType,
  offerCode,
  quote,
  onContinue,
  onBack,
}: ContractStepProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contractHTML = generateContractHTML({
    seekerName,
    seekerEmail,
    planType,
    registrationFee: quote.finalFee,
    baseRegistrationFee: quote.baseFee,
    discountAmount: quote.discountAmount,
    discountPercent: quote.discountPercent,
    discountCode: quote.code,
    discountLabel:
      quote.source === "promo_code"
        ? "Promo code"
        : quote.source === "seeker_referral"
        ? "Referral code"
        : null,
    commissionRate: 0.05,
    agreedDate: new Date().toISOString(),
  });

  const handleContinue = async () => {
    if (!agreed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/billing/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planType,
          offerCode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to sign contract. Please try again.");
        return;
      }
      onContinue(
        typeof data.registrationFee === "number"
          ? data.registrationFee
          : quote.finalFee
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          Client Engagement Agreement
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          Review the agreement, including your final registration fee, before you
          continue.
        </p>
      </div>

      <div
        className="border border-gray-300 rounded-lg overflow-auto bg-white mb-4"
        style={{ height: "420px" }}
      >
        <div dangerouslySetInnerHTML={{ __html: contractHTML }} className="p-1" />
      </div>

      <label className="flex items-start gap-3 cursor-pointer mb-4 select-none">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
        />
        <span className="text-sm text-gray-700">
          I have read and agree to the registration fee, discount terms, commission
          terms, extension policy, and termination conditions in this agreement.
        </span>
      </label>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!agreed || saving}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "I Agree - Continue"}
        </button>
      </div>
    </div>
  );
}
