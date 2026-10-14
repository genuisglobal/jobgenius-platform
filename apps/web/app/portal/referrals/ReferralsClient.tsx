"use client";

import { useState } from "react";

type ReferralStatus = "signed_up" | "placed" | "rewarded";
type CreditStatus =
  | "earned"
  | "partially_applied"
  | "applied"
  | "expired"
  | "voided";

interface ReferralRow {
  id: string;
  referred_initial: string;
  status: ReferralStatus;
  signed_up_at: string;
  placed_at: string | null;
  credit_amount: number | null;
  credit_status: CreditStatus | null;
  credited_at: string | null;
}

interface Stats {
  totalReferred: number;
  signedUp: number;
  inReview: number;
  credited: number;
  totalCreditsEarned: number;
  availableCredits: number;
  appliedCredits: number;
  registrationBalanceRemaining: number | null;
}

interface Props {
  referralCode: string;
  stats: Stats;
  referrals: ReferralRow[];
}

const STATUS_BADGE: Record<ReferralStatus, string> = {
  signed_up: "bg-violet-100 text-violet-700",
  placed: "bg-amber-100 text-amber-700",
  rewarded: "bg-emerald-100 text-emerald-700",
};

const STATUS_LABEL: Record<ReferralStatus, string> = {
  signed_up: "Signed up",
  placed: "Approved and paying",
  rewarded: "Credit earned",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

const FAQ_ITEMS = [
  {
    q: "How does the referral program work?",
    a: "Share your referral link. When a friend signs up with it, is approved, and completes their first registration payment, you earn a 5% registration credit.",
  },
  {
    q: "What does the credit apply to?",
    a: "Credits reduce your own registration balance first. If your registration is already fully paid, unused credits stay in your wallet for future product use.",
  },
  {
    q: "When is credit created?",
    a: "Credit is created only after the referred seeker completes their first confirmed registration payment.",
  },
  {
    q: "Do referral credits expire?",
    a: "Not in this first version. If policy changes later, we will surface that clearly in the portal before any expiration is enforced.",
  },
];

export default function ReferralsClient({ referralCode, stats, referrals }: Props) {
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "";

  const referralLink = referralCode ? `${appUrl}/signup?ref=${referralCode}` : "";

  function handleCopy() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const shareText = encodeURIComponent(
    "JobGenius manages the job search for me. Use my referral link to unlock signup pricing:"
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Share your link and earn 5% registration credits when approved referrals
          complete their first payment.
        </p>
      </div>

      <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-1">Your Referral Link</h2>
        <p className="text-violet-100 text-sm mb-4">
          Every successful referral can reduce your own registration balance.
        </p>

        {referralCode ? (
          <>
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-4 py-3 mb-4">
              <span className="flex-1 text-sm font-mono truncate">{referralLink}</span>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 px-3 py-1.5 bg-white text-violet-700 text-xs font-semibold rounded-md hover:bg-violet-50 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(referralLink)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
              >
                WhatsApp
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
              >
                LinkedIn
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(referralLink)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
              >
                X / Twitter
              </a>
              <a
                href={`mailto:?subject=Join me on JobGenius&body=Use my referral link to unlock signup pricing: ${referralLink}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
              >
                Email
              </a>
            </div>
          </>
        ) : (
          <p className="text-violet-100 text-sm">
            Your referral code is being generated. Please refresh the page.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Referred", value: stats.totalReferred, color: "text-gray-900" },
          { label: "Approved Path", value: stats.inReview, color: "text-amber-600" },
          { label: "Credits Earned", value: stats.credited, color: "text-emerald-600" },
          {
            label: "Wallet Balance",
            value: formatCurrency(stats.availableCredits),
            color: "text-violet-600",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-4 text-center"
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Total credits earned
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {formatCurrency(stats.totalCreditsEarned)}
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Applied so far: {formatCurrency(stats.appliedCredits)}
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm font-semibold text-violet-900">
            Registration balance remaining
          </p>
          <p className="mt-1 text-2xl font-bold text-violet-700">
            {stats.registrationBalanceRemaining == null
              ? "No contract yet"
              : formatCurrency(stats.registrationBalanceRemaining)}
          </p>
          <p className="mt-1 text-sm text-violet-800">
            Available credits apply to this balance automatically when eligible.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Your Referrals</h2>
        </div>
        {referrals.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">
              No referrals yet. Share your link to start earning registration credit.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Person
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Signed Up
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Credit Earned
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Credited On
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referrals.map((referral) => (
                  <tr key={referral.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-semibold">
                          {referral.referred_initial}
                        </div>
                        <span className="text-sm text-gray-500">Friend</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[referral.status]}`}
                      >
                        {STATUS_LABEL[referral.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(referral.signed_up_at)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {referral.credit_amount != null
                        ? formatCurrency(referral.credit_amount)
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(referral.credited_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Frequently Asked Questions
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {FAQ_ITEMS.map((item, index) => (
            <div key={item.q}>
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">{item.q}</span>
                <span className="text-gray-400">{openFaq === index ? "-" : "+"}</span>
              </button>
              {openFaq === index && (
                <div className="px-6 pb-4">
                  <p className="text-sm text-gray-600">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
