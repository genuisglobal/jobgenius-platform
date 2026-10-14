import { resolveJobTargetUrl } from "@/lib/job-url";

type AtsType =
  | "LINKEDIN"
  | "GREENHOUSE"
  | "WORKDAY"
  | "LEVER"
  | "SMARTRECRUITERS"
  | "INDEED"
  | "GENERIC";

const STEP_SETS: Record<AtsType, string[]> = {
  LINKEDIN: [
    "OPEN_JOB",
    "CLICK_EASY_APPLY",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
  GREENHOUSE: [
    "OPEN_JOB",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
  WORKDAY: [
    "OPEN_JOB",
    "START_APPLY",
    "LOGIN_OR_CONTINUE",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "REVIEW",
    "SUBMIT",
    "CONFIRMATION",
  ],
  LEVER: [
    "OPEN_JOB",
    "TRY_APPLY_ENTRY",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
  SMARTRECRUITERS: [
    "OPEN_JOB",
    "TRY_APPLY_ENTRY",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
  INDEED: [
    "OPEN_JOB",
    "TRY_APPLY_ENTRY",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
  GENERIC: [
    "OPEN_JOB",
    "TRY_APPLY_ENTRY",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
};

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function detectAtsType(source?: string | null, url?: string | null): AtsType {
  const sourceValue = (source ?? "").toLowerCase();
  const rawUrlValue = (url ?? "").toLowerCase();
  const resolvedUrlValue = resolveJobTargetUrl(url ?? "").toLowerCase();
  const combined = `${sourceValue} ${rawUrlValue} ${resolvedUrlValue}`;

  if (combined.includes("greenhouse")) {
    return "GREENHOUSE";
  }

  if (combined.includes("workday") || combined.includes("myworkdayjobs")) {
    return "WORKDAY";
  }

  if (combined.includes("linkedin")) {
    return "LINKEDIN";
  }

  if (combined.includes("lever.co")) {
    return "LEVER";
  }

  if (combined.includes("smartrecruiters")) {
    return "SMARTRECRUITERS";
  }

  if (
    combined.includes("ashby") ||
    combined.includes("jobvite") ||
    combined.includes("icims") ||
    combined.includes("workable") ||
    combined.includes("recruitee") ||
    combined.includes("bamboohr") ||
    combined.includes("successfactors") ||
    combined.includes("taleo") ||
    combined.includes("oraclecloud") ||
    combined.includes("personio") ||
    combined.includes("breezy.hr") ||
    combined.includes("applytojob.com") ||
    combined.includes("jazzhr")
  ) {
    return "GENERIC";
  }

  // Job board aggregators — these redirect to company career pages
  if (
    combined.includes("themuse.com") ||
    combined.includes("arbeitnow.com") ||
    combined.includes("remotive.com") ||
    combined.includes("remoteok.com") ||
    combined.includes("jobicy.com") ||
    combined.includes("himalayas.app") ||
    combined.includes("startup.jobs") ||
    combined.includes("wellfound.com") ||
    combined.includes("builtin.com") ||
    combined.includes("findwork.dev") ||
    combined.includes("glassdoor.com")
  ) {
    return "GENERIC";
  }

  // Indeed LAST among named boards: an Indeed link that resolves (via
  // resolveJobTargetUrl) to a real ATS keeps the more specific type above —
  // INDEED means "the application actually happens on Indeed/SmartApply".
  if (combined.includes("indeed.com")) {
    return "INDEED";
  }

  return "GENERIC";
}

export function getStepsForAts(atsType: AtsType) {
  return STEP_SETS[atsType];
}

export function getNextStep(atsType: AtsType, currentStep: string) {
  const steps = getStepsForAts(atsType);
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex === -1) {
    return steps[0];
  }
  return steps[currentIndex + 1] ?? null;
}

export function buildExecutionContract({
  runId,
  status,
  atsType,
  currentStep,
}: {
  runId: string;
  status: string;
  atsType: AtsType;
  currentStep: string;
}) {
  const notes = `Execute step ${currentStep} for ${atsType}.`;

  return {
    run_id: runId,
    status,
    ats_type: atsType,
    current_step: currentStep,
    instructions: {
      action: currentStep,
      notes,
    },
  };
}

export function getInitialStep(atsType: AtsType) {
  const steps = getStepsForAts(atsType);
  return steps[0] ?? "OPEN_JOB";
}

export function getErrorCodeHint(code?: string | null) {
  if (!hasValue(code)) {
    return "UNKNOWN";
  }
  return code;
}
