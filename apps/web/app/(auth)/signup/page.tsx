"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import MultiCheckbox from "../../portal/components/MultiCheckbox";

type UserType = "am" | "job_seeker";

type ParsedResume = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  bio?: string;
  skills?: string[];
  work_history?: unknown[];
  education?: unknown[];
};

type JobSeekerProfilePrefill = {
  location?: string;
  phone?: string;
  bio?: string;
  linkedin_url?: string;
  address_line1?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  address_country?: string;
  target_titles?: string[];
  work_type_preferences?: string[];
  employment_type_preferences?: string[];
  preferred_locations?: string[];
  preferred_industries?: string[];
  salary_min?: number;
  salary_max?: number;
  years_experience?: number;
  open_to_relocation?: boolean;
  available_for_travel?: boolean;
  authorized_to_work?: boolean;
  requires_visa_sponsorship?: boolean;
  citizenship_status?: string;
  non_compete_subject?: boolean;
};

function splitList(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function SignUpForm() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userType, setUserType] = useState<UserType>("job_seeker");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [preferredLocations, setPreferredLocations] = useState("");
  const [preferredIndustries, setPreferredIndustries] = useState("");
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [authorizedToWork, setAuthorizedToWork] = useState(false);
  const [requiresVisaSponsorship, setRequiresVisaSponsorship] = useState(false);
  const [citizenshipStatus, setCitizenshipStatus] = useState("");
  const [openToRelocation, setOpenToRelocation] = useState(false);
  const [availableForTravel, setAvailableForTravel] = useState(false);
  const [nonCompete, setNonCompete] = useState(false);
  const [extraNotes, setExtraNotes] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [consentVoice, setConsentVoice] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [parsedRawText, setParsedRawText] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState("");
  const [resumeNotice, setResumeNotice] = useState("");
  useEffect(() => {
    const incomingCode = searchParams.get("code") ?? searchParams.get("ref");
    if (incomingCode) setOfferCode(incomingCode.trim().toUpperCase());
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  const buildJobSeekerProfilePrefill = (): JobSeekerProfilePrefill => ({
    location: normalizeOptionalText(location),
    phone: normalizeOptionalText(phone),
    bio: normalizeOptionalText(extraNotes),
    linkedin_url: normalizeOptionalText(linkedinUrl),
    address_line1: normalizeOptionalText(addressLine1),
    address_city: normalizeOptionalText(addressCity),
    address_state: normalizeOptionalText(addressState),
    address_zip: normalizeOptionalText(addressZip),
    address_country: "United States",
    target_titles: splitList(targetRoles),
    work_type_preferences: workTypes.length > 0 ? workTypes : undefined,
    employment_type_preferences: splitList(employmentTypes),
    preferred_locations: splitList(preferredLocations),
    preferred_industries: splitList(preferredIndustries),
    salary_min: toOptionalNumber(salaryMin),
    salary_max: toOptionalNumber(salaryMax),
    years_experience: toOptionalNumber(yearsExperience),
    open_to_relocation: openToRelocation,
    available_for_travel: availableForTravel,
    authorized_to_work: authorizedToWork,
    requires_visa_sponsorship: requiresVisaSponsorship,
    citizenship_status: normalizeOptionalText(citizenshipStatus),
    non_compete_subject: nonCompete,
  });

  const handleResumeUpload = async (file: File) => {
    setResumeError("");
    setResumeNotice("");
    setResumeParsing(true);
    setResumeFile(file);
    setResumeFileName(file.name);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/public/parse-resume", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setParsedResume(null);
        setParsedRawText(null);
        const rawError =
          typeof data?.error === "string" ? data.error : "We could not read that file.";
        const isSoftFailure =
          res.status === 401 ||
          res.status >= 500 ||
          /auth/i.test(rawError) ||
          /temporar/i.test(rawError);

        if (isSoftFailure) {
          setResumeNotice(
            "Resume attached. Auto-fill is unavailable right now, but you can keep going."
          );
        } else {
          setResumeError(rawError);
        }
        return;
      }

      const parsed: ParsedResume = data.parsed || {};
      setParsedResume(parsed);
      setParsedRawText(typeof data.raw_text === "string" ? data.raw_text : null);

      if (parsed.full_name && !name) setName(parsed.full_name);
      if (parsed.email && !email) setEmail(parsed.email);
      if (parsed.phone && !phone) setPhone(parsed.phone);
    } catch {
      setParsedResume(null);
      setParsedRawText(null);
      setResumeNotice(
        "Resume attached. Auto-fill is unavailable right now, but you can keep going."
      );
    } finally {
      setResumeParsing(false);
    }
  };

  const handleResumeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleResumeUpload(file);
  };

  const handleResumeDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleResumeUpload(file);
  };

  const clearResume = () => {
    setResumeFile(null);
    setResumeFileName(null);
    setParsedResume(null);
    setParsedRawText(null);
    setResumeError("");
    setResumeNotice("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAccountManagerSubmit = async () => {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name,
        userType: "am",
      }),
    });

    const data = await response.json();
    if (!data.success) {
      setError(data.error || "Signup failed.");
      return;
    }

    window.location.href = "/dashboard";
  };

  const handleJobSeekerSubmit = async () => {
    if (!name.trim()) {
      setError("Full name is required.");
      return;
    }

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }

    if (!resumeFile) {
      setError("Please upload your resume first.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!consentVoice) {
      setError("Please confirm we can contact you about your job search.");
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        name: name.trim(),
        userType: "job_seeker",
        offerCode: offerCode.trim() || undefined,
        resume: parsedResume
          ? {
              full_name: parsedResume.full_name,
              phone: parsedResume.phone,
              location: parsedResume.location,
              linkedin_url: parsedResume.linkedin_url,
              bio: parsedResume.bio,
              skills: parsedResume.skills,
              work_history: parsedResume.work_history,
              education: parsedResume.education,
              raw_text: parsedRawText,
            }
          : undefined,
        profile: buildJobSeekerProfilePrefill(),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      setError(data.error || "Could not create your account. Please try again.");
      return;
    }

    // The signup response sets the session cookies, so we can now attach the
    // resume file to the new account. Best-effort: the onboarding flow lets the
    // seeker re-upload if this fails.
    try {
      const resumeForm = new FormData();
      resumeForm.append("file", resumeFile);
      await fetch("/api/portal/resume/upload", {
        method: "POST",
        body: resumeForm,
      });
    } catch {
      // Non-fatal â€” continue into onboarding regardless.
    }

    window.location.href = "/portal/onboarding";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (userType === "am") {
        await handleAccountManagerSubmit();
      } else {
        await handleJobSeekerSubmit();
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const jobSeekerSteps = [
    "Share your resume, contact details, search preferences, and any promo or referral code.",
    "Create your login and we take you straight into onboarding to finish your profile.",
    "An account manager reviews your profile and reaches out to plan your search.",
    "Agreements and payment come later, only when you decide to activate a paid campaign.",
  ];

  const amSteps = [
    "Review seekers, target roles, and queue state from one workspace.",
    "Coordinate outreach, interview prep, and client updates without losing context.",
    "Use the portal as the operating system for every active search.",
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.10),_transparent_35%),linear-gradient(to_bottom,_#faf5ff,_#ffffff_30%,_#fff7ed)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="pt-4 lg:pt-10">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-violet-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-violet-700 shadow-sm backdrop-blur hover:border-violet-300 hover:text-violet-800"
            >
              JobGenius
            </Link>

            <button
              type="button"
              onClick={() => {
                setUserType((current) => (current === "job_seeker" ? "am" : "job_seeker"));
                setError("");
              }}
              className="text-sm font-medium text-violet-700 hover:text-violet-900"
            >
              {userType === "job_seeker"
                ? "Account manager? Create team access"
                : "Back to job seeker intake"}
            </button>
          </div>

          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
            {userType === "am" ? "Account manager workspace" : "Managed job search"}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {userType === "am"
              ? "Create the workspace you will use to run client searches."
              : "Start with your resume. Create your account and jump into onboarding."}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-gray-600">
            {userType === "am"
              ? "Use this account to review seekers, manage applications, coordinate outreach, and keep every pipeline visible."
              : "Share your resume and search preferences, create your login, and we will take you straight into onboarding to finish your profile. Agreements and payment come later, once you decide to activate a campaign."}
          </p>

          {offerCode && userType === "job_seeker" && (
            <p className="mt-4 inline-flex items-center rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
              Offer code ready: {offerCode}
            </p>
          )}

          <div className="mt-8 rounded-3xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-violet-100/60 backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {userType === "am" ? "What this unlocks" : "What happens next"}
            </p>
            <div className="mt-5 space-y-4">
              {(userType === "am" ? amSteps : jobSeekerSteps).map((item, index) => (
                <div key={item} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white shadow-lg shadow-violet-200">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-sm leading-relaxed text-gray-700">{item}</p>
                </div>
              ))}
            </div>

            {userType === "job_seeker" && (
              <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 text-sm text-orange-900">
                Creating your account is free. Paid campaign activation starts at{" "}
                <strong>$300 for Essentials</strong> or <strong>$600 for Premium</strong>, and
                that only happens after consultation, strategy review, and your decision to move
                forward.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-violet-100/70 sm:p-8">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                {userType === "am" ? "Workspace access" : "Create your account"}
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-gray-900">
                {userType === "am" ? "Create your account" : "Create your account"}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {userType === "am"
                  ? "Sign up as an account manager to start managing job seekers."
                  : "Tell us about your search and create your login. We will take you straight into onboarding."}
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                  {error}
                </div>
              )}

              {userType === "am" ? (
                <>
                  <div>
                    <a
                      href="/api/auth/oauth/google/start?userType=am"
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                      </svg>
                      Continue with Google
                    </a>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-xs uppercase tracking-wider text-gray-500">or use email</span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-semibold text-gray-800">
                        Full name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="John Doe"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="location" className="block text-sm font-semibold text-gray-800">
                          Location
                        </label>
                        <input
                          id="location"
                          name="location"
                          type="text"
                          autoComplete="address-level2"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="City, State"
                        />
                      </div>

                      <div>
                        <label htmlFor="linkedinUrl" className="block text-sm font-semibold text-gray-800">
                          LinkedIn URL
                        </label>
                        <input
                          id="linkedinUrl"
                          name="linkedinUrl"
                          type="url"
                          value={linkedinUrl}
                          onChange={(e) => setLinkedinUrl(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="https://linkedin.com/in/..."
                        />
                      </div>
                    </div>

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
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="you@example.com"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-sm font-semibold text-gray-800">
                        Password
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="********"
                      />
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-800">
                        Confirm password
                      </label>
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="********"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          Upload your resume first
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                          We will use it to pre-fill your profile and give your account manager context for your search.
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        Required
                      </span>
                    </div>

                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleResumeDrop}
                      className="mt-3 rounded-md border border-violet-200 bg-white p-3"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
                        onChange={handleResumeInputChange}
                        className="hidden"
                      />

                      {!resumeFileName && !resumeParsing && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-violet-700 hover:text-violet-900"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9 5 5 0 019.9-1A5.5 5.5 0 0118.5 16H7zM12 12v6m0 0l-2-2m2 2l2-2" />
                          </svg>
                          Choose file or drag &amp; drop - PDF, DOCX
                        </button>
                      )}

                      {resumeParsing && (
                        <div className="flex items-center gap-2 py-2 text-sm text-gray-700">
                          <svg className="h-4 w-4 animate-spin text-violet-600" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.3" />
                            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" fill="none" />
                          </svg>
                          Reading {resumeFileName}&hellip;
                        </div>
                      )}

                      {!resumeParsing && resumeFileName && (
                        <div className="py-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2 text-sm text-green-700">
                              <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span className="truncate font-medium">{resumeFileName}</span>
                            </div>
                            <button
                              type="button"
                              onClick={clearResume}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Remove
                            </button>
                          </div>
                          {parsedResume && (
                            <p className="mt-1 text-xs text-gray-600">
                              Pulled in:&nbsp;
                              {[
                                parsedResume.full_name && "name",
                                parsedResume.email && "email",
                                parsedResume.phone && "phone",
                                parsedResume.linkedin_url && "LinkedIn",
                                parsedResume.skills?.length ? `${parsedResume.skills.length} skills` : null,
                              ]
                                .filter(Boolean)
                                .join(", ") || "resume text"}
                            </p>
                          )}
                        </div>
                      )}

                      {resumeNotice && (
                        <p className="mt-2 text-xs text-amber-700">{resumeNotice}</p>
                      )}
                      {resumeError && <p className="mt-2 text-xs text-red-600">{resumeError}</p>}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-semibold text-gray-800">
                        Full name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="John Doe"
                      />
                    </div>

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
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="you@example.com"
                      />
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-semibold text-gray-800">
                        Phone number
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="(555) 555-5555"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="addressLine1" className="block text-sm font-semibold text-gray-800">
                          Street address
                        </label>
                        <input
                          id="addressLine1"
                          name="addressLine1"
                          type="text"
                          value={addressLine1}
                          onChange={(e) => setAddressLine1(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="123 Main St"
                        />
                      </div>
                      <div>
                        <label htmlFor="addressCity" className="block text-sm font-semibold text-gray-800">
                          City
                        </label>
                        <input
                          id="addressCity"
                          name="addressCity"
                          type="text"
                          value={addressCity}
                          onChange={(e) => setAddressCity(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <label htmlFor="addressState" className="block text-sm font-semibold text-gray-800">
                          State
                        </label>
                        <input
                          id="addressState"
                          name="addressState"
                          type="text"
                          value={addressState}
                          onChange={(e) => setAddressState(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="State"
                        />
                      </div>
                      <div>
                        <label htmlFor="addressZip" className="block text-sm font-semibold text-gray-800">
                          Postal code
                        </label>
                        <input
                          id="addressZip"
                          name="addressZip"
                          type="text"
                          value={addressZip}
                          onChange={(e) => setAddressZip(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="Postal code"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="targetRoles" className="block text-sm font-semibold text-gray-800">
                        Target roles
                      </label>
                      <input
                        id="targetRoles"
                        name="targetRoles"
                        type="text"
                        value={targetRoles}
                        onChange={(e) => setTargetRoles(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="e.g. Data Analyst, Azure DBA, SOC Analyst"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800">
                          Work type
                        </label>
                        <div className="mt-1">
                          <MultiCheckbox
                            options={[
                              { value: "remote", label: "Remote" },
                              { value: "hybrid", label: "Hybrid" },
                              { value: "onsite", label: "On-site" },
                            ]}
                            selected={workTypes}
                            onChange={setWorkTypes}
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="salaryMin" className="block text-sm font-semibold text-gray-800">
                          Salary min
                        </label>
                        <input
                          id="salaryMin"
                          name="salaryMin"
                          type="number"
                          value={salaryMin}
                          onChange={(e) => setSalaryMin(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="75000"
                        />
                      </div>
                      <div>
                        <label htmlFor="salaryMax" className="block text-sm font-semibold text-gray-800">
                          Salary max
                        </label>
                        <input
                          id="salaryMax"
                          name="salaryMax"
                          type="number"
                          value={salaryMax}
                          onChange={(e) => setSalaryMax(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="120000"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label htmlFor="yearsExperience" className="block text-sm font-semibold text-gray-800">
                          Years of experience
                        </label>
                        <input
                          id="yearsExperience"
                          name="yearsExperience"
                          type="number"
                          value={yearsExperience}
                          onChange={(e) => setYearsExperience(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="5"
                        />
                      </div>
                      <div>
                        <label htmlFor="preferredLocations" className="block text-sm font-semibold text-gray-800">
                          Preferred locations
                        </label>
                        <input
                          id="preferredLocations"
                          name="preferredLocations"
                          type="text"
                          value={preferredLocations}
                          onChange={(e) => setPreferredLocations(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="Remote, Texas, Ontario"
                        />
                      </div>
                      <div>
                        <label htmlFor="preferredIndustries" className="block text-sm font-semibold text-gray-800">
                          Preferred industries
                        </label>
                        <input
                          id="preferredIndustries"
                          name="preferredIndustries"
                          type="text"
                          value={preferredIndustries}
                          onChange={(e) => setPreferredIndustries(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="Healthcare, FinTech, SaaS"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="employmentTypes" className="block text-sm font-semibold text-gray-800">
                          Employment types
                        </label>
                        <input
                          id="employmentTypes"
                          name="employmentTypes"
                          type="text"
                          value={employmentTypes}
                          onChange={(e) => setEmploymentTypes(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="Full-time, contract"
                        />
                      </div>
                      <div>
                        <label htmlFor="citizenshipStatus" className="block text-sm font-semibold text-gray-800">
                          Work authorization
                        </label>
                        <select
                          id="citizenshipStatus"
                          value={citizenshipStatus}
                          onChange={(e) => setCitizenshipStatus(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        >
                          <option value="">Select</option>
                          <option value="US Citizen">US Citizen</option>
                          <option value="Green Card Holder">Green Card Holder</option>
                          <option value="Canadian Citizen">Canadian Citizen</option>
                          <option value="Canadian PR">Canadian Permanent Resident</option>
                          <option value="H1B Visa">H1B Visa</option>
                          <option value="EAD">EAD</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={authorizedToWork}
                          onChange={(e) => setAuthorizedToWork(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span>I am legally authorized to work where I apply.</span>
                      </label>
                      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={requiresVisaSponsorship}
                          onChange={(e) => setRequiresVisaSponsorship(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span>I need visa sponsorship now or in the future.</span>
                      </label>
                      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={openToRelocation}
                          onChange={(e) => setOpenToRelocation(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span>I am open to relocation.</span>
                      </label>
                      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={availableForTravel}
                          onChange={(e) => setAvailableForTravel(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span>I am available for travel if needed.</span>
                      </label>
                      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={nonCompete}
                          onChange={(e) => setNonCompete(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span>I have a non-compete or other restriction.</span>
                      </label>
                    </div>

                    <div>
                      <label htmlFor="extraNotes" className="block text-sm font-semibold text-gray-800">
                        Other details
                      </label>
                      <textarea
                        id="extraNotes"
                        value={extraNotes}
                        onChange={(e) => setExtraNotes(e.target.value)}
                        rows={3}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="Anything else the team should know"
                      />
                    </div>

                    <div>
                      <label htmlFor="offerCode" className="block text-sm font-semibold text-gray-800">
                        Referral or promo code
                      </label>
                      <input
                        id="offerCode"
                        name="offerCode"
                        type="text"
                        value={offerCode}
                        onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
                        className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                        placeholder="Optional"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Optional. We will carry this into your account and apply it when you activate a campaign.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="password" className="block text-sm font-semibold text-gray-800">
                          Password
                        </label>
                        <input
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="At least 8 characters"
                        />
                      </div>
                      <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-800">
                          Confirm password
                        </label>
                        <input
                          id="confirmPassword"
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                          placeholder="Re-enter your password"
                        />
                      </div>
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={consentVoice}
                        onChange={(e) => setConsentVoice(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span>
                        I agree to let JobGenius contact me by call or text about my job search and onboarding.
                      </span>
                    </label>
                  </div>
                </>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md border border-transparent bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? "Creating account..."
                    : userType === "am"
                      ? "Create account"
                      : "Create account & continue"}
                </button>
                {userType === "job_seeker" ? (
                  <p className="mt-3 text-center text-xs text-gray-500">
                    We will take you straight into onboarding to finish setting up your profile.
                  </p>
                ) : (
                  <p className="mt-3 text-center text-xs text-gray-500">
                    Once approved, you will get full dashboard access.
                  </p>
                )}
              </div>

              <div className="text-center text-sm text-gray-600">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-violet-700 hover:text-violet-600">
                  Sign in
                </Link>
              </div>
            </form>
          </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
