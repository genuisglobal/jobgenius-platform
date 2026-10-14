"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Supabase's recovery flow returns the session in the URL *hash*
  // (#access_token=...&type=recovery), or an error hash on a bad/expired link
  // (#error=access_denied&error_code=otp_expired). The hash is not available to
  // useSearchParams, so read it from window.location on the client.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const tokenFromHash = hash.get("access_token");
    const tokenFromQuery = searchParams.get("access_token");
    if (tokenFromHash || tokenFromQuery) {
      setAccessToken(tokenFromHash ?? tokenFromQuery);
    }
    const errDescription = hash.get("error_description") || hash.get("error");
    if (errDescription) {
      setLinkError(decodeURIComponent(errDescription.replace(/\+/g, " ")));
    }
  }, [searchParams]);

  const isResetMode = !!accessToken;

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("If an account exists with this email, you will receive a password reset link.");
        setEmail("");
      } else {
        setError(data.error || "Failed to send reset email.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, newPassword }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("Password updated successfully. Redirecting to login...");
        setTimeout(() => router.push("/login"), 2000);
      } else {
        setError(data.error || "Failed to update password.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isResetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <Link href="/" className="block text-center text-3xl font-bold text-gray-900 hover:text-violet-600 transition-colors">
              JobGenius
            </Link>
            <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
              Set new password
            </h2>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleUpdatePassword}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                {success}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-800">
                  New password
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                  placeholder="********"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Must be at least 8 characters
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-800">
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                  placeholder="********"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Updating..." : "Update password"}
              </button>
            </div>

            <div className="text-center text-sm text-gray-600">
              <Link href="/login" className="font-medium text-violet-600 hover:text-violet-500">
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Link href="/" className="block text-center text-3xl font-bold text-gray-900 hover:text-violet-600 transition-colors">
            JobGenius
          </Link>
          <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
            Reset your password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleRequestReset}>
          {linkError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded">
              Your reset link is invalid or has expired. Request a new one below.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              {success}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-800">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </div>

          <div className="text-center text-sm text-gray-600">
            <Link href="/login" className="font-medium text-violet-600 hover:text-violet-500">
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

