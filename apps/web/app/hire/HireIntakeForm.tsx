"use client";

import { useState, useTransition } from "react";

type PersonaType = "in_house" | "agency";

type FormState = {
  fullName: string;
  workEmail: string;
  companyName: string;
  roleTitle: string;
  jobUrl: string;
  location: string;
  linkedinUrl: string;
  clientCompanyName: string;
  hiringUrgency: string;
  details: string;
};

const INITIAL_FORM: FormState = {
  fullName: "",
  workEmail: "",
  companyName: "",
  roleTitle: "",
  jobUrl: "",
  location: "",
  linkedinUrl: "",
  clientCompanyName: "",
  hiringUrgency: "standard",
  details: "",
};

const PERSONA_COPY: Record<
  PersonaType,
  {
    title: string;
    description: string;
    companyLabel: string;
    locationLabel: string;
    cta: string;
  }
> = {
  in_house: {
    title: "Hiring for my company",
    description: "Internal talent teams, founders, and hiring managers who need candidates fast.",
    companyLabel: "Company name",
    locationLabel: "Role location",
    cta: "Request candidates",
  },
  agency: {
    title: "Hiring for clients",
    description: "Recruitment agencies, staffing partners, and search firms filling client reqs.",
    companyLabel: "Agency name",
    locationLabel: "Hiring market or location",
    cta: "Get matched candidates",
  },
};

export default function HireIntakeForm() {
  const [personaType, setPersonaType] = useState<PersonaType>("in_house");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const copy = PERSONA_COPY[personaType];

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(INITIAL_FORM);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/marketing/hire-intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            personaType,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          setError(data.error || "Could not submit your request.");
          return;
        }

        setSuccessEmail(form.workEmail);
        resetForm();
      } catch {
        setError("Network error while submitting your request.");
      }
    });
  }

  if (successEmail) {
    return (
      <div className="rounded-[32px] border border-emerald-200 bg-emerald-50 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
          Request Received
        </p>
        <h3 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
          Got it. We'll review this and reply quickly.
        </h3>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-700">
          No account setup is required. We sent a confirmation to{" "}
          <span className="font-semibold text-gray-900">{successEmail}</span>. If we
          need more detail or have relevant candidates, we'll email you directly.
        </p>
        <button
          type="button"
          onClick={() => setSuccessEmail(null)}
          className="mt-6 inline-flex rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
        >
          Submit another role
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-[32px] bg-[#1f1147] p-8 text-white shadow-[0_30px_90px_rgba(31,17,71,0.24)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
          Choose Your Lane
        </p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight">
          One short form. No password. No software setup first.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-violet-100">
          Recruiters do not need another platform to configure before seeing value.
          Share a live role or tell us what you need, and we handle the follow-up by email.
        </p>

        <div className="mt-8 grid gap-4">
          {(Object.keys(PERSONA_COPY) as PersonaType[]).map((option) => {
            const optionCopy = PERSONA_COPY[option];
            const active = option === personaType;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setPersonaType(option)}
                className={`rounded-[24px] border px-5 py-5 text-left transition-all ${
                  active
                    ? "border-orange-300 bg-white text-gray-900 shadow-lg"
                    : "border-violet-700 bg-violet-900/40 text-white hover:border-violet-500"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">{optionCopy.title}</p>
                    <p
                      className={`mt-2 text-sm leading-6 ${
                        active ? "text-gray-600" : "text-violet-100"
                      }`}
                    >
                      {optionCopy.description}
                    </p>
                  </div>
                  <span
                    className={`mt-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-bold uppercase tracking-wide ${
                      active
                        ? "border-orange-200 bg-orange-50 text-orange-600"
                        : "border-violet-600 text-violet-200"
                    }`}
                  >
                    {active ? "Selected" : "Choose"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            "No long intake form",
            "No account creation required",
            "Optional partner access later",
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-violet-700 bg-violet-950/40 px-4 py-4 text-sm text-violet-100"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <form
        id="hire-form"
        onSubmit={handleSubmit}
        className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-600">
              {copy.title}
            </p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
              Tell us what you're hiring for
            </h3>
          </div>
          <div className="rounded-full bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-600">
            Typical reply: within 1 business day
          </div>
        </div>

        <div className="mt-8 grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Your name"
              value={form.fullName}
              onChange={(value) => updateField("fullName", value)}
              placeholder="Jane Doe"
            />
            <Field
              label="Work email"
              required
              value={form.workEmail}
              onChange={(value) => updateField("workEmail", value)}
              placeholder="jane@company.com"
              type="email"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={copy.companyLabel}
              required
              value={form.companyName}
              onChange={(value) => updateField("companyName", value)}
              placeholder={personaType === "agency" ? "Atlas Search" : "Acme Inc."}
            />
            <Field
              label={copy.locationLabel}
              required
              value={form.location}
              onChange={(value) => updateField("location", value)}
              placeholder="Remote, New York, London"
            />
          </div>

          {personaType === "agency" && (
            <Field
              label="Client company name"
              value={form.clientCompanyName}
              onChange={(value) => updateField("clientCompanyName", value)}
              placeholder="Optional"
            />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Role title"
              value={form.roleTitle}
              onChange={(value) => updateField("roleTitle", value)}
              placeholder="Senior Product Manager"
            />
            <Field
              label="Job link"
              value={form.jobUrl}
              onChange={(value) => updateField("jobUrl", value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="LinkedIn profile"
              value={form.linkedinUrl}
              onChange={(value) => updateField("linkedinUrl", value)}
              placeholder="linkedin.com/in/..."
            />
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Hiring urgency
              </label>
              <select
                value={form.hiringUrgency}
                onChange={(event) => updateField("hiringUrgency", event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              >
                <option value="standard">Standard</option>
                <option value="urgent">Urgent</option>
                <option value="immediate">Immediate</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Anything we should know?
            </label>
            <textarea
              rows={4}
              value={form.details}
              onChange={(event) => updateField("details", event.target.value)}
              placeholder="Target profile, timing, must-have experience, or anything else that helps."
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-gray-500">
            Submit one live role and we'll take it from there. Repeat partners can get
            portal access later if they need it.
          </p>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-full bg-orange-500 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Submitting..." : copy.cta}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-900">
        {label} {required ? <span className="text-orange-600">*</span> : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
      />
    </div>
  );
}
