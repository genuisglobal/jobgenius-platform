"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces the failing route + digest in the browser console and any
    // client error reporting. The full stack is in the server logs, keyed by digest.
    console.error("[dashboard] render error", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">
          Something went wrong loading this page
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          A server-side error occurred. You can retry, and if it keeps happening
          share the reference code below with the team.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-gray-400">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Back to overview
          </a>
        </div>
      </div>
    </div>
  );
}
