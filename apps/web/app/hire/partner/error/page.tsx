import Link from "next/link";
import MarketingShell from "@/app/components/MarketingShell";

type PageProps = {
  searchParams?: { reason?: string };
};

function getMessage(reason?: string) {
  switch (reason) {
    case "expired":
      return {
        title: "That workspace link expired.",
        body: "Reply to the latest JobGenius email or ask your account contact to send a fresh workspace link.",
      };
    case "used":
      return {
        title: "That workspace link was already used.",
        body: "If you need access again, ask JobGenius to send a fresh partner workspace link.",
      };
    default:
      return {
        title: "That workspace link is not valid.",
        body: "Open the latest JobGenius email or reply directly if you still need workspace access.",
      };
  }
}

export default function RecruiterPartnerErrorPage({ searchParams }: PageProps) {
  const message = getMessage(searchParams?.reason);

  return (
    <MarketingShell>
      <section className="bg-gradient-to-b from-violet-50 to-white pb-24 pt-32 sm:pt-40">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[36px] bg-[#1f1147] px-6 py-8 text-white shadow-[0_30px_90px_rgba(31,17,71,0.24)] sm:px-8 sm:py-10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
              Partner Workspace
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {message.title}
            </h1>
            <p className="mt-4 text-base leading-7 text-violet-100">{message.body}</p>
          </div>

          <div className="mt-6">
            <Link href="/hire" className="text-sm font-medium text-violet-600 hover:text-violet-800">
              Back to hire page
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
