"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AgreementClient({
  html,
  signed,
  signedAt,
  signatureName,
  requested,
  clientName,
}: {
  html: string;
  signed: boolean;
  signedAt: string | null;
  signatureName: string | null;
  requested: boolean;
  clientName: string;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState(clientName || "");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setError(null);
    if (!accepted) {
      setError("Please confirm you have read and agree to the terms.");
      return;
    }
    if (signature.trim().length < 2) {
      setError("Please type your full name as your signature.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_name: signature.trim(), accepted: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not record your acceptance. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not record your acceptance. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Service Agreement</h1>
        <p className="mt-1 text-sm text-gray-500">
          Please review the Client Collaboration &amp; Placement Fee Agreement below.
        </p>
      </div>

      {!signed && !requested && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-violet-800">
            <p className="font-semibold">Preview only.</p>
            <p className="mt-0.5 text-violet-700">
              This is how JobGenius is paid — a one-time Campaign Setup &amp; Execution Fee due at
              campaign activation, plus a 5% placement fee only when you accept a job we help you land.
              Your account manager will share this agreement for signature when the time is right.
            </p>
          </div>
        </div>
      )}

      {signed && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-sm text-green-800">
            <p className="font-semibold">Agreement signed.</p>
            <p className="mt-0.5 text-green-700">
              Accepted by <strong>{signatureName}</strong>
              {signedAt ? ` on ${new Date(signedAt).toLocaleString()}` : ""}.
            </p>
          </div>
        </div>
      )}

      {/* Agreement document (isolated so its styles don't leak) */}
      <iframe
        title="Client Collaboration & Placement Fee Agreement"
        srcDoc={html}
        className="h-[60vh] w-full rounded-xl border border-gray-200 bg-white shadow-sm"
      />

      {requested && !signed && (
        <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-5">
          <h2 className="text-sm font-semibold text-gray-900">Electronic acceptance</h2>
          <p className="mt-1 text-xs text-gray-600">
            Typing your full name below and accepting acts as your electronic signature.
          </p>

          <label className="mt-4 block text-sm font-medium text-gray-800">
            Type your full name (signature)
          </label>
          <input
            type="text"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Your full legal name"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-violet-500"
          />

          <label className="mt-4 flex items-start gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span>
              I have read, understood, and agree to the terms of this Agreement, including the
              Campaign Setup &amp; Execution Fee due at activation and the 5% placement fee on an
              accepted placement.
            </span>
          </label>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {submitting ? "Recording…" : "Accept & sign agreement"}
          </button>
        </div>
      )}
    </div>
  );
}
