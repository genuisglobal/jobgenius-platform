import Link from "next/link";
import MarketingShell from "@/app/components/MarketingShell";
import { getRecruiterResponseTokenPreview } from "@/lib/recruiter-partner-server";
import { RECRUITER_RESPONSE_ACTION_LABELS } from "@/lib/recruiter-partners";
import RecruiterActionConfirm from "./RecruiterActionConfirm";

type PageProps = {
  params: { token: string };
};

export const dynamic = "force-dynamic";

function followUpCopy(actionType: keyof typeof RECRUITER_RESPONSE_ACTION_LABELS) {
  switch (actionType) {
    case "send_profiles":
      return "We will move this request to the front of the review queue and follow up directly by email with the next step.";
    case "add_details":
      return "We will mark this request for follow-up so you can reply with any extra context that helps us target the right candidates.";
    case "refer_teammate":
      return "We will mark this request for follow-up so you can reply with the teammate who should own it.";
    case "not_hiring":
      return "We will close this request for now and stop treating it as active demand.";
    case "wrong_contact":
      return "We will close this request and stop treating this email as the active hiring contact.";
    default:
      return "We will record your response and update the hiring request.";
  }
}

export default async function RecruiterResponsePage({ params }: PageProps) {
  const preview = await getRecruiterResponseTokenPreview(params.token);

  return (
    <MarketingShell>
      <section className="bg-gradient-to-b from-violet-50 to-white pb-24 pt-32 sm:pt-40">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[36px] bg-[#1f1147] px-6 py-8 text-white shadow-[0_30px_90px_rgba(31,17,71,0.24)] sm:px-8 sm:py-10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
              Recruiter Response
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Respond to your JobGenius hiring request
            </h1>
            <p className="mt-4 text-base leading-7 text-violet-100">
              We use a confirmation step here so email link scanners do not accidentally mark a live request with the wrong action.
            </p>
          </div>

          <div className="mt-8">
            {preview.state === "invalid" ? (
              <StatusCard
                title="That response link is not valid."
                body="Open the latest email from JobGenius or reply directly to the team if you still need help."
              />
            ) : preview.state === "expired" ? (
              <StatusCard
                title="That response link expired."
                body="Reply to the original email and we will update the request manually."
              />
            ) : preview.state === "already_used" ? (
              <StatusCard
                title={`${RECRUITER_RESPONSE_ACTION_LABELS[preview.token.action_type]} was already recorded.`}
                body="You do not need to do anything else. If something changed, reply to the original email and we will update the request."
                requestMeta={preview.roleRequest}
              />
            ) : (
              <div className="space-y-6">
                <StatusCard
                  title={RECRUITER_RESPONSE_ACTION_LABELS[preview.token.action_type]}
                  body="Confirm the action below and we will update the request immediately."
                  requestMeta={preview.roleRequest}
                />
                <RecruiterActionConfirm
                  token={params.token}
                  actionLabel={RECRUITER_RESPONSE_ACTION_LABELS[preview.token.action_type]}
                  followUpNote={followUpCopy(preview.token.action_type)}
                />
              </div>
            )}
          </div>

          <div className="mt-6 text-sm text-gray-500">
            <Link href="/hire" className="font-medium text-violet-600 hover:text-violet-800">
              Back to hire page
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function StatusCard({
  title,
  body,
  requestMeta,
}: {
  title: string;
  body: string;
  requestMeta?: {
    company_name?: string | null;
    role_title?: string | null;
    location?: string | null;
    submitted_by_email?: string | null;
  } | null;
}) {
  return (
    <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
      <p className="mt-3 text-base leading-7 text-gray-600">{body}</p>

      {requestMeta ? (
        <div className="mt-6 rounded-[24px] border border-violet-100 bg-violet-50/60 px-5 py-5 text-sm text-gray-700">
          <p>
            <span className="font-semibold text-gray-900">Company:</span>{" "}
            {requestMeta.company_name || "-"}
          </p>
          <p className="mt-2">
            <span className="font-semibold text-gray-900">Role:</span>{" "}
            {requestMeta.role_title || "Not provided"}
          </p>
          <p className="mt-2">
            <span className="font-semibold text-gray-900">Location:</span>{" "}
            {requestMeta.location || "-"}
          </p>
          <p className="mt-2">
            <span className="font-semibold text-gray-900">Contact:</span>{" "}
            {requestMeta.submitted_by_email || "-"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
