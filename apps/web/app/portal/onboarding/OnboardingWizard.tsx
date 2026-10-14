"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WelcomeResumeStep from "./steps/WelcomeResumeStep";
import AboutYouStep from "./steps/AboutYouStep";
import JobPreferencesStep from "./steps/JobPreferencesStep";
import WorkStyleLocationStep from "./steps/WorkStyleLocationStep";
import SalaryAvailabilityStep from "./steps/SalaryAvailabilityStep";
import ReviewFinishStep from "./steps/ReviewFinishStep";

interface LocationPreference {
  work_type: "remote" | "hybrid" | "onsite";
  locations: string[];
}

type PlanType = "essentials" | "premium";
type StepId =
  | "welcome"
  | "about"
  | "preferences"
  | "workstyle"
  | "salary"
  | "review";

export interface ProfileData {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  bio?: string;
  seniority?: string;
  work_type?: string;
  work_type_preferences?: string[];
  employment_type_preferences?: string[];
  salary_min?: number;
  salary_max?: number;
  non_compete_subject?: boolean;
  target_titles?: string[];
  skills?: string[];
  years_experience?: number;
  preferred_industries?: string[];
  preferred_locations?: string[];
  location_preferences?: LocationPreference[];
  open_to_relocation?: boolean;
  requires_visa_sponsorship?: boolean;
  authorized_to_work?: boolean;
  citizenship_status?: string;
  start_date?: string;
  notice_period?: string;
  offer_code?: string | null;
  plan_type?: PlanType | null;
  onboarding_completed_at?: string;
}

export interface DocRecord {
  id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

interface StepDefinition {
  id: StepId;
  label: string;
  hidden?: boolean;
}

function buildSteps(): StepDefinition[] {
  return [
    { id: "welcome", label: "Welcome" },
    { id: "about", label: "About You" },
    { id: "preferences", label: "Job Preferences" },
    { id: "workstyle", label: "Work Style" },
    { id: "salary", label: "Salary & Availability" },
    { id: "review", label: "Review" },
  ];
}

function ProgressBar({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: StepDefinition[];
}) {
  const visibleSteps = steps.filter((step) => !step.hidden);
  const matchedVisibleStepIndex = visibleSteps.findIndex((step) => step.id === steps[currentStep]?.id);
  const currentVisibleStepIndex =
    matchedVisibleStepIndex >= 0 ? matchedVisibleStepIndex : visibleSteps.length - 1;
  const activeVisibleStep =
    visibleSteps[currentVisibleStepIndex] ?? visibleSteps[visibleSteps.length - 1];

  return (
    <>
      <div className="hidden sm:flex items-center justify-between mb-8">
        {visibleSteps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  index < currentVisibleStepIndex
                    ? "bg-green-500 text-white"
                    : index === currentVisibleStepIndex
                    ? "bg-violet-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {index < currentVisibleStepIndex ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`text-xs mt-1 ${
                  index === currentVisibleStepIndex
                    ? "text-violet-600 font-medium"
                    : "text-gray-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < visibleSteps.length - 1 && (
              <div
                className={`w-12 lg:w-20 h-0.5 mx-1 ${
                  index < currentVisibleStepIndex ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="sm:hidden mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Step {currentVisibleStepIndex + 1} of {visibleSteps.length}
          </span>
          <span className="text-sm text-gray-500">{activeVisibleStep?.label}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-violet-600 h-2 rounded-full transition-all"
            style={{
              width: `${((currentVisibleStepIndex + 1) / visibleSteps.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </>
  );
}

export default function OnboardingWizard({
  profile: initial,
  documents: initialDocs,
  userEmail,
}: {
  profile: ProfileData;
  documents: DocRecord[];
  userEmail: string;
}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState<ProfileData>(initial);
  const [docs, setDocs] = useState<DocRecord[]>(initialDocs);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const steps = useMemo(() => buildSteps(), []);
  const currentStepId = steps[currentStep]?.id ?? steps[0].id;

  const summaryStepIndexes = useMemo(() => {
    const findStepIndex = (stepId: StepId) =>
      Math.max(
        0,
        steps.findIndex((step) => step.id === stepId)
      );

    return {
      about: findStepIndex("about"),
      preferences: findStepIndex("preferences"),
      workstyle: findStepIndex("workstyle"),
      salary: findStepIndex("salary"),
    };
  }, [steps]);

  const update = useCallback((key: keyof ProfileData, value: unknown) => {
    setProfile((current) => ({ ...current, [key]: value }));
  }, []);

  const updateMany = useCallback((fields: Partial<ProfileData>) => {
    setProfile((current) => ({ ...current, ...fields }));
  }, []);

  const saveFields = useCallback(async (fields: Partial<ProfileData>): Promise<boolean> => {
    // Drop undefined values: JSON.stringify omits them anyway, and a payload of
    // only-undefined fields (e.g. a step left blank) would serialize to {} and
    // be rejected by the API with 400. Nothing to save → treat as success so the
    // step can advance instead of dead-ending.
    const payload = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined)
    );
    if (Object.keys(payload).length === 0) return true;

    setSaving(true);
    try {
      const response = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return false;
      const { profile: updated } = await response.json();
      setProfile(updated);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const goNext = useCallback(() => {
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  }, [steps.length]);

  const goBack = useCallback(() => {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }, []);

  const goToStep = useCallback(
    (step: number) => {
      if (step >= 0 && step < steps.length) {
        setCurrentStep(step);
      }
    },
    [steps.length]
  );

  const handleSkip = () => {
    document.cookie = "jg_onboarding_skipped=1; path=/; max-age=86400; SameSite=Lax";
    router.push("/portal");
  };

  const handleFinish = async () => {
    setFinishError(null);
    setFinishing(true);
    const completedAt = new Date().toISOString();
    const onboardingSaved = await saveFields({ onboarding_completed_at: completedAt });

    if (!onboardingSaved) {
      setFinishError("Could not save your onboarding details. Please try again.");
      setFinishing(false);
      return;
    }

    try {
      const response = await fetch("/api/portal/intake/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setFinishError(
          data?.error || "Could not submit your profile for review. Please try again."
        );
        setFinishing(false);
        return;
      }

      router.push("/portal");
    } catch {
      setFinishError(
        "Could not submit your profile for review. Please check your connection and try again."
      );
      setFinishing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Set Up Your Profile</h1>
        <button
          onClick={handleSkip}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Skip for now
        </button>
      </div>

      <ProgressBar currentStep={currentStep} steps={steps} />

      {currentStepId === "welcome" && (
        <WelcomeResumeStep
          profile={profile}
          docs={docs}
          setDocs={setDocs}
          updateMany={updateMany}
          onContinue={goNext}
          userName={profile.full_name || userEmail}
        />
      )}

      {currentStepId === "about" && (
        <AboutYouStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}

      {currentStepId === "preferences" && (
        <JobPreferencesStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}

      {currentStepId === "workstyle" && (
        <WorkStyleLocationStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}

      {currentStepId === "salary" && (
        <SalaryAvailabilityStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}

      {currentStepId === "review" && (
        <ReviewFinishStep
          profile={profile}
          summaryStepIndexes={summaryStepIndexes}
          saving={saving || finishing}
          finishError={finishError}
          goToStep={goToStep}
          onFinish={handleFinish}
          onBack={goBack}
        />
      )}
    </div>
  );
}
