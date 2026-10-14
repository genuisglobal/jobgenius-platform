"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaymentRequestModal from "./PaymentRequestModal";
import ScreenshotUploadModal from "./ScreenshotUploadModal";
import ReportOfferModal from "./ReportOfferModal";
import ContractStep from "../onboarding/steps/ContractStep";
import InstallmentPlanStep from "../onboarding/steps/InstallmentPlanStep";

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
  message?: string;
}

interface Contract {
  id: string;
  plan_type: string;
  registration_fee: number;
  base_registration_fee?: number | null;
  final_registration_fee?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  discount_source?: string | null;
  discount_code?: string | null;
  commission_rate: number;
  agreed_at: string | null;
  contract_html: string | null;
}

interface RegistrationPayment {
  id: string;
  total_amount: number;
  amount_paid: number;
  credit_applied_amount?: number | null;
  status: string;
  payment_deadline: string | null;
  work_started: boolean;
}

interface RegistrationFlexRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  requested_installment_count: number | null;
  requested_window_days: number | null;
  requested_note: string;
  requested_schedule:
    | { installment_number: number; amount: number; proposed_date: string }[]
    | null;
  approved_max_installments: number | null;
  approved_window_days: number | null;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Installment {
  id: string;
  installment_number: number;
  amount: number;
  proposed_date: string;
  status: string;
  paid_at: string | null;
}

interface JobOffer {
  id: string;
  company: string;
  role: string;
  base_salary: number;
  offer_accepted_at: string;
  status: string;
  commission_amount: number | null;
  commission_due_date: string | null;
  commission_status: string;
  seeker_confirmed_at: string | null;
}

interface PaymentRequest {
  id: string;
  method: string;
  status: string;
  installment_id: string | null;
  offer_id: string | null;
  created_at: string;
}

interface IntakeState {
  status: string;
  capacity_month?: string | null;
  offer_path?: "discount" | "strategy_preview" | null;
  selected_plan?: PlanType | null;
  base_registration_fee?: number | string | null;
  final_registration_fee?: number | string | null;
  preview_expires_at?: string | null;
}

interface BillingClientProps {
  contract: Contract | null;
  registrationPayment: RegistrationPayment | null;
  installments: Installment[];
  offers: JobOffer[];
  paymentRequests: PaymentRequest[];
  flexRequest: RegistrationFlexRequest | null;
  intakeState: IntakeState | null;
  seekerId: string;
  seekerName: string | null;
  userEmail: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  partial: "bg-violet-100 text-violet-800",
  complete: "bg-green-100 text-green-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  legal: "bg-red-200 text-red-900",
  reported: "bg-gray-100 text-gray-700",
  confirmed: "bg-violet-100 text-violet-700",
  accepted: "bg-green-100 text-green-800",
  details_sent: "bg-purple-100 text-purple-800",
  screenshot_uploaded: "bg-indigo-100 text-indigo-800",
  acknowledged: "bg-green-100 text-green-800",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function BillingClient({
  contract,
  registrationPayment,
  installments,
  offers,
  paymentRequests,
  flexRequest,
  intakeState,
  seekerId,
  seekerName,
  userEmail,
}: BillingClientProps) {
  const router = useRouter();
  const [showPaymentRequest, setShowPaymentRequest] = useState<{
    installmentId?: string;
    offerId?: string;
    label?: string;
  } | null>(null);
  const [showScreenshotUpload, setShowScreenshotUpload] = useState<{
    installmentId?: string;
    offerId?: string;
    paymentRequestId?: string;
    label?: string;
  } | null>(null);
  const [showReportOffer, setShowReportOffer] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [previewQuote, setPreviewQuote] = useState<OfferQuote | null>(null);
  const [previewConversionLoading, setPreviewConversionLoading] = useState(false);
  const [previewConversionError, setPreviewConversionError] = useState<string | null>(
    null
  );

  const refresh = () => router.refresh();

  // Find payment request for an installment
  const getRequestForInstallment = (installmentId: string) =>
    paymentRequests.find((r) => r.installment_id === installmentId);

  const getRequestForOffer = (offerId: string) =>
    paymentRequests.find((r) => r.offer_id === offerId);

  const creditAppliedAmount = Number(
    registrationPayment?.credit_applied_amount ?? 0
  );
  const remainingRegistrationBalance = registrationPayment
    ? Math.max(
        0,
        Number(registrationPayment.total_amount) -
          Number(registrationPayment.amount_paid) -
          creditAppliedAmount
      )
    : 0;
  const intakeBanner = getIntakeBanner(intakeState);
  const previewPlanType =
    intakeState?.selected_plan === "essentials" || intakeState?.selected_plan === "premium"
      ? intakeState.selected_plan
      : null;
  const previewExpiryLabel = intakeState?.preview_expires_at
    ? new Date(intakeState.preview_expires_at).toLocaleDateString()
    : null;
  const canConvertPreview =
    !contract &&
    intakeState?.offer_path === "strategy_preview" &&
    Boolean(previewPlanType) &&
    ["approved_preview", "preview_active", "preview_expired"].includes(
      intakeState?.status ?? ""
    );

  async function handlePreviewConversion() {
    setPreviewConversionLoading(true);
    setPreviewConversionError(null);

    try {
      const response = await fetch("/api/portal/strategy-preview/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.quote) {
        setPreviewConversionError(
          data?.error || "Could not prepare your full-service agreement."
        );
        return;
      }

      setPreviewQuote(data.quote as OfferQuote);
    } catch {
      setPreviewConversionError(
        "Network error while preparing your full-service agreement."
      );
    } finally {
      setPreviewConversionLoading(false);
    }
  }

  if (!contract) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>
        {canConvertPreview && previewPlanType ? (
          <div className="space-y-6">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-6">
              <p className="text-violet-800 font-medium mb-2">
                Strategy preview conversion
              </p>
              <p className="text-sm text-violet-900/80 mb-4">
                Your preview path is active. Generate the full-service agreement to
                move from planning into live applications, recruiter outreach, and
                managed execution.
              </p>
              <div className="grid gap-4 sm:grid-cols-3 text-sm mb-5">
                <div>
                  <p className="text-violet-700">Plan</p>
                  <p className="font-semibold text-violet-950 capitalize">
                    {previewPlanType}
                  </p>
                </div>
                <div>
                  <p className="text-violet-700">Standard registration fee</p>
                  <p className="font-semibold text-violet-950">
                    $
                    {Number(
                      intakeState?.base_registration_fee ??
                        intakeState?.final_registration_fee ??
                        0
                    ).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-violet-700">Preview window</p>
                  <p className="font-semibold text-violet-950">
                    {previewExpiryLabel ? `Ends ${previewExpiryLabel}` : "Active"}
                  </p>
                </div>
              </div>

              {previewConversionError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {previewConversionError}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handlePreviewConversion}
                  disabled={previewConversionLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {previewConversionLoading
                    ? "Preparing agreement..."
                    : "Generate Full-Service Agreement"}
                </button>
                <a
                  href="/portal/profile"
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-violet-700 bg-white border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
                >
                  Review Profile
                </a>
              </div>
            </div>

            {previewQuote && (
              <ContractStep
                seekerName={seekerName || userEmail}
                seekerEmail={userEmail}
                planType={previewPlanType}
                offerCode={null}
                quote={previewQuote}
                onContinue={(_registrationFee) => {
                  refresh();
                }}
                onBack={() => setPreviewQuote(null)}
              />
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-amber-800 font-medium mb-2">No contract on file</p>
            <p className="text-sm text-amber-700 mb-4">
              Please complete the onboarding process to select a plan and sign your contract.
            </p>
            <a
              href="/portal/onboarding"
              className="inline-block px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
            >
              Go to Onboarding
            </a>
          </div>
        )}
      </div>
    );
  }

  const normalizedPlanType =
    contract.plan_type === "premium" || contract.plan_type === "essentials"
      ? contract.plan_type
      : null;
  const canCreatePaymentPlan =
    Boolean(normalizedPlanType) &&
    installments.length === 0 &&
    (registrationPayment == null ||
      !["complete", "paid"].includes(registrationPayment.status));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <button
          onClick={() => setShowReportOffer(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
        >
          Report Job Offer
        </button>
      </div>

      {intakeBanner && (
        <div className={`rounded-xl border p-4 text-sm ${intakeBanner.className}`}>
          <p className="font-semibold">{intakeBanner.title}</p>
          <p className="mt-1">{intakeBanner.body}</p>
        </div>
      )}

      {/* Work Started Banner */}
      {registrationPayment &&
        !registrationPayment.work_started &&
        intakeState?.status !== "approved_payment_pending" && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
          <strong>Services Pending:</strong> Your Account Manager will begin working on your job search once your registration funding is confirmed.
        </div>
      )}

      {flexRequest && (
        <div
          className={`rounded-xl p-4 text-sm border ${
            flexRequest.status === "approved"
              ? "bg-green-50 border-green-300 text-green-800"
              : flexRequest.status === "rejected"
              ? "bg-red-50 border-red-300 text-red-800"
              : "bg-amber-50 border-amber-300 text-amber-800"
          }`}
        >
          {flexRequest.status === "approved" ? (
            <p>
              Flexible registration terms approved: up to{" "}
              <strong>{flexRequest.approved_max_installments ?? "-"}</strong>{" "}
              installments within{" "}
              <strong>{flexRequest.approved_window_days ?? "-"}</strong> days.
            </p>
          ) : flexRequest.status === "rejected" ? (
            <p>Your flexible registration request was not approved.</p>
          ) : (
            <p>Your flexible registration request is pending admin review.</p>
          )}
          {flexRequest.admin_note && (
            <p className="mt-1">Admin note: {flexRequest.admin_note}</p>
          )}
          {Array.isArray(flexRequest.requested_schedule) &&
            flexRequest.requested_schedule.length > 0 && (
              <div className="mt-2 rounded-md border border-current/20 bg-white/60 p-2">
                <p className="text-xs font-semibold">Requested payment schedule</p>
                <div className="mt-1 space-y-1 text-xs">
                  {flexRequest.requested_schedule.map((inst, index) => (
                    <p key={`${flexRequest.id}-schedule-${index}`}>
                      #{inst.installment_number || index + 1}: $
                      {Number(inst.amount).toFixed(2)} on {inst.proposed_date}
                    </p>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Plan & Contract Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Plan</h2>
          <button
            onClick={() => setShowContract(true)}
            className="text-sm text-violet-600 hover:underline"
          >
            View Contract
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Plan</p>
            <p className="font-semibold text-gray-900 capitalize">{contract.plan_type}</p>
          </div>
          <div>
            <p className="text-gray-500">Registration Fee</p>
            <p className="font-semibold text-gray-900">
              ${Number(contract.registration_fee).toLocaleString()}
            </p>
          </div>
          {Number(contract.discount_amount ?? 0) > 0 && (
            <div>
              <p className="text-gray-500">Discount</p>
              <p className="font-semibold text-emerald-700">
                -${Number(contract.discount_amount).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">
                {contract.discount_source === "promo_code"
                  ? "Promo code"
                  : contract.discount_source === "seeker_referral"
                  ? "Referral code"
                  : "Offer applied"}
                {contract.discount_code ? `: ${contract.discount_code}` : ""}
              </p>
            </div>
          )}
          <div>
            <p className="text-gray-500">Commission Rate</p>
            <p className="font-semibold text-gray-900">
              {(Number(contract.commission_rate) * 100).toFixed(0)}% of year 1 salary
            </p>
          </div>
          {contract.agreed_at && (
            <div>
              <p className="text-gray-500">Signed</p>
              <p className="font-medium text-gray-900">
                {new Date(contract.agreed_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Registration Payment & Installments */}
      {canCreatePaymentPlan && normalizedPlanType && (
        <InstallmentPlanStep
          registrationFee={Number(contract.registration_fee)}
          onContinue={refresh}
          onBack={() => {}}
          showBackButton={false}
        />
      )}

      {registrationPayment && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Registration Payment</h2>
            <StatusBadge status={registrationPayment.status} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm mb-5">
            <div>
              <p className="text-gray-500">Total Due</p>
              <p className="font-semibold text-gray-900">${Number(registrationPayment.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Paid</p>
              <p className="font-semibold text-green-600">${Number(registrationPayment.amount_paid).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Remaining</p>
              <p className="font-semibold text-gray-900">
                ${remainingRegistrationBalance.toLocaleString()}
              </p>
            </div>
          </div>

          {creditAppliedAmount > 0 && (
            <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Referral credit applied: <strong>${creditAppliedAmount.toLocaleString()}</strong>
            </div>
          )}

          {/* Installments */}
          <div className="space-y-3">
            {installments.map((inst) => {
              const req = getRequestForInstallment(inst.id);
              return (
                <div key={inst.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Installment {inst.installment_number} — ${Number(inst.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Due: {new Date(inst.proposed_date).toLocaleDateString()}
                      {inst.paid_at && ` · Paid: ${new Date(inst.paid_at).toLocaleDateString()}`}
                    </p>
                    {req && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Payment request: <StatusBadge status={req.status} />
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={inst.status} />
                    {inst.status === "pending" && !req && (
                      <button
                        onClick={() => setShowPaymentRequest({
                          installmentId: inst.id,
                          label: `Installment ${inst.installment_number} ($${Number(inst.amount).toLocaleString()})`,
                        })}
                        className="text-xs px-2 py-1 bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-colors"
                      >
                        Request Details
                      </button>
                    )}
                    {req && req.status === "details_sent" && (
                      <button
                        onClick={() => setShowScreenshotUpload({
                          installmentId: inst.id,
                          paymentRequestId: req.id,
                          label: `Installment ${inst.installment_number}`,
                        })}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      >
                        Upload Proof
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job Offers & Commission */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Job Offers & Commission</h2>
        </div>

        {offers.length === 0 ? (
          <p className="text-sm text-gray-500">No job offers reported yet. Use the &quot;Report Job Offer&quot; button above when you accept an offer.</p>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => {
              const req = getRequestForOffer(offer.id);
              const pendingConfirm = offer.status === "reported" && !offer.seeker_confirmed_at;
              return (
                <div key={offer.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{offer.role}</p>
                      <p className="text-sm text-gray-600">{offer.company}</p>
                    </div>
                    <StatusBadge status={offer.status} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                      <p className="text-gray-500">Base Salary</p>
                      <p className="font-medium">${Number(offer.base_salary).toLocaleString()}</p>
                    </div>
                    {offer.commission_amount && (
                      <div>
                        <p className="text-gray-500">Commission Due</p>
                        <p className="font-medium text-orange-700">
                          ${Number(offer.commission_amount).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {offer.commission_due_date && (
                      <div>
                        <p className="text-gray-500">Due Date</p>
                        <p className="font-medium">
                          {new Date(offer.commission_due_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                  {offer.commission_amount && (
                    <div className="flex items-center gap-2">
                      <StatusBadge status={offer.commission_status} />
                      {offer.commission_status === "pending" && !req && (
                        <button
                          onClick={() => setShowPaymentRequest({
                            offerId: offer.id,
                            label: `Commission for ${offer.company}`,
                          })}
                          className="text-xs px-2 py-1 bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-colors"
                        >
                          Request Payment Details
                        </button>
                      )}
                      {req && req.status === "details_sent" && (
                        <button
                          onClick={() => setShowScreenshotUpload({
                            offerId: offer.id,
                            paymentRequestId: req.id,
                            label: `Commission — ${offer.company}`,
                          })}
                          className="text-xs px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                          Upload Payment Proof
                        </button>
                      )}
                    </div>
                  )}
                  {pendingConfirm && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      Your Account Manager reported this offer. Please confirm it&apos;s accurate to start the commission clock.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showPaymentRequest && (
        <PaymentRequestModal
          installmentId={showPaymentRequest.installmentId}
          offerId={showPaymentRequest.offerId}
          installmentLabel={showPaymentRequest.label}
          onClose={() => setShowPaymentRequest(null)}
          onSuccess={() => {
            setShowPaymentRequest(null);
            refresh();
          }}
        />
      )}
      {showScreenshotUpload && (
        <ScreenshotUploadModal
          installmentId={showScreenshotUpload.installmentId}
          offerId={showScreenshotUpload.offerId}
          paymentRequestId={showScreenshotUpload.paymentRequestId}
          label={showScreenshotUpload.label}
          onClose={() => setShowScreenshotUpload(null)}
          onSuccess={() => {
            setShowScreenshotUpload(null);
            refresh();
          }}
        />
      )}
      {showReportOffer && (
        <ReportOfferModal
          onClose={() => setShowReportOffer(false)}
          onSuccess={() => {
            setShowReportOffer(false);
            refresh();
          }}
        />
      )}

      {/* Contract viewer modal */}
      {showContract && contract.contract_html && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Client Engagement Agreement</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (w) { w.document.write(contract.contract_html!); w.document.close(); w.print(); }
                  }}
                  className="text-sm text-violet-600 hover:underline"
                >
                  Print / Save PDF
                </button>
                <button onClick={() => setShowContract(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded ml-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-auto p-4"
              dangerouslySetInnerHTML={{ __html: contract.contract_html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getIntakeBanner(intakeState: IntakeState | null): {
  title: string;
  body: string;
  className: string;
} | null {
  const previewExpiryLabel = intakeState?.preview_expires_at
    ? new Date(intakeState.preview_expires_at).toLocaleDateString()
    : null;

  switch (intakeState?.status ?? null) {
    case "pending_review":
    case "submitted":
      return {
        title: "Profile under review",
        body: "We review fit before a spot is reserved. You can keep your billing details ready while our team reviews this intake.",
        className: "border-amber-200 bg-amber-50 text-amber-900",
      };
    case "waitlisted":
      return {
        title: "Waitlisted for the next onboarding window",
        body: "This month's account manager capacity is currently full. No spot is reserved until a team member moves you out of the waitlist.",
        className: "border-violet-200 bg-violet-50 text-violet-900",
      };
    case "approved_payment_pending":
      return {
        title: "Spot reserved, payment still required",
        body: "Your onboarding spot has been approved. Live applications and outreach begin after registration funding is confirmed.",
        className: "border-green-200 bg-green-50 text-green-900",
      };
    case "rejected":
      return {
        title: "Search not approved yet",
        body: "Your intake is not currently approved for a managed onboarding spot. Update your profile before making any additional billing decisions.",
        className: "border-red-200 bg-red-50 text-red-900",
      };
    case "approved_preview":
      return {
        title: "Strategy preview approved",
        body: "Your preview slot is approved. Generate your full-service agreement whenever you are ready to move from planning into live execution.",
        className: "border-green-200 bg-green-50 text-green-900",
      };
    case "call_completed":
      return {
        title: "First call complete",
        body: "We have the information needed to move your preview forward. Preview approval still comes next, before any financial commitment.",
        className: "border-cyan-200 bg-cyan-50 text-cyan-900",
      };
    case "preview_active":
      return {
        title: "Strategy preview active",
        body: previewExpiryLabel
          ? `Your account manager is handling the planning work now. This preview window ends on ${previewExpiryLabel}.`
          : "Your account manager is handling the planning work now. Live execution still waits until payment is confirmed.",
        className: "border-green-200 bg-green-50 text-green-900",
      };
    case "preview_expired":
      return {
        title: "Strategy preview expired",
        body: "Convert to full service to reserve a spot and move into live search execution.",
        className: "border-amber-200 bg-amber-50 text-amber-900",
      };
    default:
      return null;
  }
}
