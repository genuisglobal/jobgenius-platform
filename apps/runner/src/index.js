import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { fetchNextGlobal, fetchPlan, generatePlan, pauseRun, retryRun, postJson } from "./api.js";
import { runPlan } from "./engine.js";
import { linkedinAdapter } from "./adapters/linkedin_easy_apply.js";
import { greenhouseAdapter } from "./adapters/greenhouse.js";
import { workdayAdapter } from "./adapters/workday.js";
import { genericAdapter } from "./adapters/generic.js";
import { leverAdapter } from "./adapters/lever.js";
import { smartRecruitersAdapter } from "./adapters/smartrecruiters.js";
import { hostedAtsAdapters } from "./adapters/hosted-ats.js";
import { start as startDiscoveryAgent } from "./discovery/agent.js";
import { logLine } from "./logger.js";
import {
  getStateKey,
  readStorageState,
  writeStorageState,
  parseStorageStateText,
} from "./storage.js";
import { getJson } from "./api.js";

const API_BASE_URL = process.env.JOBGENIUS_API_BASE_URL;
const RUNNER_ID = (() => {
  const configured = String(process.env.RUNNER_ID ?? "").trim();
  if (configured) {
    return configured;
  }
  const hostname = String(process.env.HOSTNAME ?? "").trim();
  if (hostname) {
    return hostname;
  }
  return "cloud-runner";
})();
const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN ?? "";
const RUNNER_DEFAULT_EMAIL = process.env.RUNNER_DEFAULT_EMAIL ?? "";
const POLL_INTERVAL_MS = Number(process.env.RUNNER_POLL_INTERVAL_MS ?? 60000);
const CONCURRENCY = Number(process.env.RUNNER_CONCURRENCY ?? 5);
const JOBSEEKER_MAX_PER_HOUR = Number(process.env.JOBSEEKER_MAX_PER_HOUR ?? 8);
const WATCHDOG_TIMEOUT_MS = Number(process.env.RUNNER_WATCHDOG_TIMEOUT_MS ?? 10 * 60 * 1000);
const WATCHDOG_CHECK_MS = Number(process.env.RUNNER_WATCHDOG_CHECK_MS ?? 30000);
const METRICS_INTERVAL_MS = Number(process.env.RUNNER_METRICS_INTERVAL_MS ?? 60000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.RUNNER_HEARTBEAT_INTERVAL_MS ?? 30000);
const STATE_MAX_AGE_DAYS = Number(process.env.STATE_MAX_AGE_DAYS ?? 14);
const REAUTH_FAILURE_THRESHOLD = Number(process.env.RUNNER_REAUTH_FAILURE_THRESHOLD ?? 2);
const OPS_API_KEY = process.env.OPS_API_KEY ?? "";
const RUNNER_DRY_RUN = ["1", "true", "yes", "on"].includes(
  String(process.env.RUNNER_DRY_RUN ?? "").toLowerCase()
);
const CIRCUIT_WINDOW_MS = Number(process.env.RUNNER_CIRCUIT_WINDOW_MS ?? 30 * 60 * 1000);
const CIRCUIT_COOLDOWN_MS = Number(process.env.RUNNER_CIRCUIT_COOLDOWN_MS ?? 30 * 60 * 1000);
const CAPTCHA_THRESHOLD = Number(process.env.RUNNER_CAPTCHA_THRESHOLD ?? 3);
const OTP_SMS_THRESHOLD = Number(process.env.RUNNER_OTP_SMS_THRESHOLD ?? 3);
const REQUIRED_FIELDS_THRESHOLD = Number(process.env.RUNNER_REQUIRED_FIELDS_THRESHOLD ?? 5);
const DISCOVERY_AGENT_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.DISCOVERY_AGENT_ENABLED ?? "").toLowerCase()
);
const MIN_PLAN_VERSION = Number(process.env.RUNNER_MIN_PLAN_VERSION ?? 4);
const STATE_DIR =
  process.env.STORAGE_STATE_PATH ??
  path.join(process.cwd(), ".state");
const STATE_KEY = getStateKey();

if (!API_BASE_URL) {
  throw new Error("JOBGENIUS_API_BASE_URL is required.");
}

if (!RUNNER_AUTH_TOKEN) {
  throw new Error("RUNNER_AUTH_TOKEN is required for API access.");
}

if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

if (!STATE_KEY && process.env.NODE_ENV === "production") {
  logLine({
    level: "WARN",
    step: "CONFIG",
    msg: "STATE_ENCRYPTION_KEY not set in production; storage state will be plaintext.",
  });
}

const adapters = [linkedinAdapter, greenhouseAdapter, workdayAdapter, leverAdapter, smartRecruitersAdapter, ...hostedAtsAdapters, genericAdapter];
const activeRuns = new Set();
const jobSeekerHistory = new Map();
const jobSeekerAuthFailures = new Map();
const atsStats = new Map();
const runProgress = new Map();
const metrics = {
  claimed: 0,
  completed: 0,
  retried: 0,
  paused: {},
  stepDurations: new Map(),
};
let pollFailures = 0;
let pollBackoffUntil = 0;

function inferResumeExtension(resumeUrl, contentType) {
  const urlExt = resumeUrl ? path.extname(new URL(resumeUrl).pathname) : "";
  if (urlExt) {
    return urlExt;
  }
  const content = (contentType ?? "").toLowerCase();
  if (content.includes("pdf")) return ".pdf";
  if (content.includes("word")) return ".docx";
  if (content.includes("text")) return ".txt";
  return ".pdf";
}

async function downloadResume(resumeUrl, jobSeekerId) {
  if (!resumeUrl) return null;
  try {
    const response = await fetch(resumeUrl);
    if (!response.ok) {
      throw new Error(`Resume download failed (${response.status}).`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const ext = inferResumeExtension(resumeUrl, contentType);
    const tmpDir = path.join(STATE_DIR, ".tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const filePath = path.join(
      tmpDir,
      `resume-${jobSeekerId}-${Date.now()}${ext}`
    );
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return filePath;
  } catch (error) {
    logLine({
      level: "WARN",
      step: "RESUME",
      msg: error?.message ?? "Resume download failed.",
    });
    return null;
  }
}

async function fetchStorageState(storageStateUrl) {
  if (!storageStateUrl) return null;
  try {
    const response = await fetch(storageStateUrl);
    if (!response.ok) {
      throw new Error(`Storage state fetch failed (${response.status}).`);
    }
    // The bucket file may be plaintext or an encrypted envelope — decrypt if so.
    const text = await response.text();
    return parseStorageStateText(text);
  } catch (error) {
    logLine({
      level: "WARN",
      step: "STORAGE",
      msg: error?.message ?? "Failed to load remote storage state.",
    });
    return null;
  }
}

async function fetchScreeningAnswers(jobSeekerId) {
  if (!jobSeekerId) return [];
  try {
    const result = await getJson(
      `${API_BASE_URL}/api/apply/screening-answers?jobSeekerId=${encodeURIComponent(jobSeekerId)}`,
      {
        Authorization: `Bearer ${RUNNER_AUTH_TOKEN}`,
        "x-runner": "cloud",
        "x-runner-id": RUNNER_ID,
      }
    );
    return result?.answers ?? [];
  } catch (error) {
    logLine({
      level: "WARN",
      step: "SCREENING_ANSWERS",
      msg: `Failed to fetch screening answers: ${error?.message ?? "unknown"}`,
    });
    return [];
  }
}

// Per-tenant ATS credentials for account-gated ATSes (Workday). The server
// creates them on first use (email = seeker email, generated password) and
// stores them encrypted; see /api/apply/ats-account. Returns null when the
// endpoint is unavailable — the adapter then pauses REAUTH_REQUIRED instead
// of guessing.
async function fetchAtsAccount(jobSeekerId, targetUrl, atsType) {
  if (!jobSeekerId || !targetUrl) return null;
  let host = "";
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  try {
    const result = await postJson(
      `${API_BASE_URL}/api/apply/ats-account`,
      { job_seeker_id: jobSeekerId, host, ats_type: atsType },
      RUNNER_AUTH_TOKEN,
      null,
      RUNNER_ID
    );
    const account = result?.account;
    if (!account?.email || !account?.password) return null;
    return {
      email: account.email,
      password: account.password,
      status: account.status ?? "ACTIVE",
      created: Boolean(account.created),
      host,
      // Adapter callback: flag the stored credential as broken so the AM
      // resets it rather than the runner retrying a dead password forever.
      markFailed: async () => {
        try {
          await postJson(
            `${API_BASE_URL}/api/apply/ats-account`,
            { job_seeker_id: jobSeekerId, host, mark_failed: true },
            RUNNER_AUTH_TOKEN,
            null,
            RUNNER_ID
          );
        } catch {
          /* best effort */
        }
      },
    };
  } catch (error) {
    logLine({
      level: "WARN",
      step: "ATS_ACCOUNT",
      msg: `Failed to fetch ATS account: ${error?.message ?? "unknown"}`,
    });
    return null;
  }
}

async function checkSessionHealth(jobSeekerId, atsType, storageState) {
  if (!storageState || atsType !== "LINKEDIN") return true;
  // Check that LinkedIn cookies haven't expired
  const now = Date.now() / 1000;
  const cookies = storageState.cookies ?? [];
  const linkedinCookies = cookies.filter((c) =>
    (c.domain ?? "").includes("linkedin.com")
  );
  if (linkedinCookies.length === 0) return false;
  // Check if any critical cookies (li_at) have expired
  const liAt = linkedinCookies.find((c) => c.name === "li_at");
  if (liAt?.expires && liAt.expires > 0 && liAt.expires < now) {
    logLine({
      level: "WARN",
      step: "SESSION_HEALTH",
      msg: `LinkedIn session expired for ${jobSeekerId} (li_at expired ${Math.round(now - liAt.expires)}s ago).`,
    });
    return false;
  }
  return true;
}

function getAdapter(atsType) {
  const normalized = String(atsType ?? "").trim().toUpperCase();
  return (
    adapters.find((adapter) => adapter.name === normalized) ??
    adapters.find((adapter) => adapter.name === "GENERIC") ??
    null
  );
}

function storageStatePath(jobSeekerId) {
  return {
    encrypted: path.join(STATE_DIR, `${jobSeekerId}.json.enc`),
    legacy: path.join(STATE_DIR, `${jobSeekerId}.json`),
  };
}

function readState(jobSeekerId) {
  const paths = storageStatePath(jobSeekerId);
  const state = readStorageState({
    encryptedPath: paths.encrypted,
    legacyPath: paths.legacy,
    key: STATE_KEY,
  });
  return state ?? undefined;
}

function writeState(jobSeekerId, state) {
  const paths = storageStatePath(jobSeekerId);
  writeStorageState({
    encryptedPath: paths.encrypted,
    legacyPath: paths.legacy,
    state,
    key: STATE_KEY,
  });
}

function clearState(jobSeekerId) {
  const paths = storageStatePath(jobSeekerId);
  for (const filePath of [paths.encrypted, paths.legacy]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function isStateStale(jobSeekerId) {
  const paths = storageStatePath(jobSeekerId);
  const filePath = fs.existsSync(paths.encrypted)
    ? paths.encrypted
    : paths.legacy;

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const stat = fs.statSync(filePath);
  const ageMs = Date.now() - stat.mtimeMs;
  const maxAgeMs = STATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return ageMs > maxAgeMs;
}

function snapshotBreakerState() {
  const snapshot = {};
  for (const [atsType, stats] of atsStats.entries()) {
    snapshot[atsType] = {
      captcha: stats.captcha.length,
      otp_sms: stats.otp_sms.length,
      required_fields: stats.required_fields.length,
      open_until: stats.openUntil,
    };
  }
  return snapshot;
}

function pruneHistory(timestamps, windowMs) {
  const cutoff = Date.now() - windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

function canApplyForJobSeeker(jobSeekerId) {
  const history = jobSeekerHistory.get(jobSeekerId) ?? [];
  pruneHistory(history, 60 * 60 * 1000);
  jobSeekerHistory.set(jobSeekerId, history);
  return history.length < JOBSEEKER_MAX_PER_HOUR;
}

function recordJobSeekerApply(jobSeekerId) {
  const history = jobSeekerHistory.get(jobSeekerId) ?? [];
  history.push(Date.now());
  pruneHistory(history, 60 * 60 * 1000);
  jobSeekerHistory.set(jobSeekerId, history);
}

function getAtsStats(atsType) {
  if (!atsStats.has(atsType)) {
    atsStats.set(atsType, {
      captcha: [],
      otp_sms: [],
      required_fields: [],
      openUntil: 0,
      lastReason: null,
    });
  }
  return atsStats.get(atsType);
}

function recordBreakerEvent(atsType, reason) {
  const stats = getAtsStats(atsType);
  const now = Date.now();
  const bucket =
    reason === "CAPTCHA"
      ? stats.captcha
      : reason === "OTP_SMS"
        ? stats.otp_sms
        : stats.required_fields;
  bucket.push(now);
  pruneHistory(stats.captcha, CIRCUIT_WINDOW_MS);
  pruneHistory(stats.otp_sms, CIRCUIT_WINDOW_MS);
  pruneHistory(stats.required_fields, CIRCUIT_WINDOW_MS);

  const exceeds =
    stats.captcha.length >= CAPTCHA_THRESHOLD ||
    stats.otp_sms.length >= OTP_SMS_THRESHOLD ||
    stats.required_fields.length >= REQUIRED_FIELDS_THRESHOLD;

  if (exceeds && now >= stats.openUntil) {
    stats.openUntil = now + CIRCUIT_COOLDOWN_MS;
    stats.lastReason = reason;
    logLine({
      level: "WARN",
      step: "CIRCUIT_BREAKER_OPEN",
      msg: `Circuit breaker opened for ${atsType} (${reason}).`,
      atsType,
      window: {
        captcha: stats.captcha.length,
        otp_sms: stats.otp_sms.length,
        required_fields: stats.required_fields.length,
      },
      cooldown_ms: CIRCUIT_COOLDOWN_MS,
    });
  }
}

function isCircuitOpen(atsType) {
  const stats = getAtsStats(atsType);
  const now = Date.now();
  if (stats.openUntil > now) {
    return { open: true, reason: stats.lastReason ?? "DEGRADED" };
  }
  return { open: false, reason: null };
}

function recordStepDuration(atsType, durationMs) {
  if (!atsType || !Number.isFinite(durationMs)) {
    return;
  }
  const stats = metrics.stepDurations.get(atsType) ?? { sumMs: 0, count: 0 };
  stats.sumMs += durationMs;
  stats.count += 1;
  metrics.stepDurations.set(atsType, stats);
}

function recordPause(reason) {
  metrics.paused[reason] = (metrics.paused[reason] ?? 0) + 1;
}

function computeBackoffMs() {
  const base = 2000;
  const max = 60000;
  const delay = Math.min(max, base * 2 ** Math.min(pollFailures, 6));
  const jitter = Math.floor(Math.random() * 1000);
  return delay + jitter;
}

function summarizeErrorMessage(error, fallback = "Runner error.") {
  const raw =
    typeof error?.message === "string" && error.message.trim()
      ? error.message.trim()
      : fallback;
  return raw.length > 300 ? `${raw.slice(0, 297)}...` : raw;
}

async function executeRun(run) {
  activeRuns.add(run.run_id);
  metrics.claimed += 1;
  const runStartedAt = Date.now();
  logLine({
    level: "INFO",
    runId: run.run_id,
    jobSeekerId: run.job_seeker_id,
    step: "CLAIMED",
    msg: "Run claimed.",
  });

  let browser;
  let context;
  let page;
  let resumePath;
  let watchdogInterval;
  let watchdogTriggered = false;
  let lastProgressAt = Date.now();

  let reauthOverride = false;

  const onProgress = (payload) => {
    if (watchdogTriggered) {
      return;
    }
    lastProgressAt = Date.now();

    if (payload.type === "STEP_STARTED") {
      const progress = runProgress.get(payload.runId) ?? {
        lastStepAt: lastProgressAt,
        lastStepName: null,
        atsType: payload.atsType,
      };
      if (progress.lastStepAt && progress.lastStepName) {
        recordStepDuration(
          progress.atsType,
          lastProgressAt - progress.lastStepAt
        );
      }
      progress.lastStepAt = lastProgressAt;
      progress.lastStepName = payload.step;
      progress.atsType = payload.atsType;
      runProgress.set(payload.runId, progress);
    }

    if (payload.type === "PAUSED") {
      recordPause(payload.reason ?? "UNKNOWN");
      if (["CAPTCHA", "OTP_SMS", "REQUIRED_FIELDS"].includes(payload.reason)) {
        recordBreakerEvent(payload.atsType, payload.reason);
      }
      if (["OTP_SMS", "OTP_EMAIL"].includes(payload.reason)) {
        const count = (jobSeekerAuthFailures.get(run.job_seeker_id) ?? 0) + 1;
        jobSeekerAuthFailures.set(run.job_seeker_id, count);
        if (count >= REAUTH_FAILURE_THRESHOLD) {
          reauthOverride = true;
        }
      }
    }

    if (payload.type === "COMPLETED") {
      metrics.completed += 1;
      recordJobSeekerApply(run.job_seeker_id);
    }

    if (payload.type === "RETRIED") {
      metrics.retried += 1;
    }
  };

  try {
    const breakerState = isCircuitOpen(run.ats_type);
    if (breakerState.open) {
      recordPause("ATS_DEGRADED");
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "CIRCUIT_BREAKER",
        msg: `ATS ${run.ats_type} degraded; pausing run.`,
      });
      await pauseRun(
        API_BASE_URL,
        {
          run_id: run.run_id,
          reason: "ATS_DEGRADED",
          message: `ATS ${run.ats_type} degraded (${breakerState.reason}).`,
          step: "DETECT_ATS",
        },
        RUNNER_AUTH_TOKEN,
        run.claim_token,
        RUNNER_ID
      );
      return;
    }

    if (!canApplyForJobSeeker(run.job_seeker_id)) {
      recordPause("RATE_LIMIT_JOBSEEKER");
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "RATE_LIMIT",
        msg: "Jobseeker rate limit exceeded; pausing run.",
      });
      await pauseRun(
        API_BASE_URL,
        {
          run_id: run.run_id,
          reason: "RATE_LIMIT_JOBSEEKER",
          message: "Jobseeker max applications per hour exceeded.",
          step: "OPEN_URL",
        },
        RUNNER_AUTH_TOKEN,
        run.claim_token,
        RUNNER_ID
      );
      return;
    }

    if (isStateStale(run.job_seeker_id)) {
      clearState(run.job_seeker_id);
      recordPause("REAUTH_REQUIRED");
      await pauseRun(
        API_BASE_URL,
        {
          run_id: run.run_id,
          reason: "REAUTH_REQUIRED",
          message: "Stored session expired. Please re-authenticate.",
          step: "OPEN_URL",
        },
        RUNNER_AUTH_TOKEN,
        run.claim_token,
        RUNNER_ID
      );
      return;
    }

    const remoteState = await fetchStorageState(run.storage_state_url);
    const localState = readState(run.job_seeker_id);
    const storageState = remoteState ?? localState;

    // Session health check (proactive, before launching browser)
    const sessionHealthy = await checkSessionHealth(
      run.job_seeker_id,
      run.ats_type,
      storageState
    );
    if (!sessionHealthy) {
      clearState(run.job_seeker_id);
      recordPause("REAUTH_REQUIRED");
      await pauseRun(
        API_BASE_URL,
        {
          run_id: run.run_id,
          reason: "REAUTH_REQUIRED",
          message: "Session health check failed. Please re-authenticate.",
          step: "OPEN_URL",
        },
        RUNNER_AUTH_TOKEN,
        run.claim_token,
        RUNNER_ID
      );
      return;
    }

    // Fetch screening answers for the job seeker
    const screeningAnswers = await fetchScreeningAnswers(run.job_seeker_id);

    const resumeUrl = run.resume?.url ?? null;
    resumePath = await downloadResume(resumeUrl, run.job_seeker_id);

    // Resume URLs can expire; continue and let field checks determine if manual action is needed.
    if (resumeUrl && !resumePath) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "RESUME",
        msg: "Resume URL download failed. Continuing without resume upload.",
      });
    }

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext(
      storageState ? { storageState } : {}
    );
    page = await context.newPage();

    watchdogInterval = setInterval(async () => {
      if (watchdogTriggered) {
        return;
      }
      if (Date.now() - lastProgressAt <= WATCHDOG_TIMEOUT_MS) {
        return;
      }
      watchdogTriggered = true;
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "WATCHDOG_TIMEOUT",
        msg: "No progress events; retrying run.",
      });
      try {
        await retryRun(
          API_BASE_URL,
          {
            run_id: run.run_id,
            note: "Watchdog timeout: no progress events.",
          },
          RUNNER_AUTH_TOKEN,
          run.claim_token,
          RUNNER_ID
        );
      } catch (error) {
        logLine({
          level: "ERROR",
          runId: run.run_id,
          step: "WATCHDOG_TIMEOUT",
          msg: error?.message ?? "Failed to retry run.",
        });
      }
      try {
        await context?.close();
        await browser?.close();
      } catch (error) {
        logLine({
          level: "WARN",
          runId: run.run_id,
          step: "WATCHDOG_CLEANUP",
          msg: "Failed to close browser after watchdog.",
        });
      }
    }, WATCHDOG_CHECK_MS);

    let planResponse = await fetchPlan(
      API_BASE_URL,
      run.run_id,
      RUNNER_AUTH_TOKEN,
      run.claim_token,
      RUNNER_ID
    );

    const planVersion = Number(
      planResponse?.version ?? planResponse?.plan?.version ?? 1
    );
    const hasAutoAdvance = Boolean(
      planResponse?.plan?.steps?.some((step) => step?.name === "AUTO_ADVANCE")
    );

    if (!planResponse || planVersion < MIN_PLAN_VERSION || !hasAutoAdvance) {
      await generatePlan(
        API_BASE_URL,
        run.run_id,
        RUNNER_AUTH_TOKEN,
        run.claim_token,
        RUNNER_ID
      );
      planResponse = await fetchPlan(
        API_BASE_URL,
        run.run_id,
        RUNNER_AUTH_TOKEN,
        run.claim_token,
        RUNNER_ID
      );
    }

    const plan = planResponse?.plan;

    if (!plan) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "PLAN",
        msg: "Plan not found. Skipping.",
      });
      return;
    }

    const targetUrl = plan.metadata?.targetUrl ?? run.job?.url;
    if (!targetUrl) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "OPEN_URL",
        msg: "Missing target URL.",
      });
      return;
    }

    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    const adapter = getAdapter(run.ats_type);

    // Account-gated ATSes need per-tenant credentials before the wizard.
    const atsAccount =
      run.ats_type === "WORKDAY"
        ? await fetchAtsAccount(run.job_seeker_id, targetUrl, run.ats_type)
        : null;

    await runPlan({
      apiBaseUrl: API_BASE_URL,
      authToken: RUNNER_AUTH_TOKEN,
      defaultEmail: RUNNER_DEFAULT_EMAIL,
      runnerId: RUNNER_ID,
      run,
      claimToken: run.claim_token,
      plan,
      adapter,
      fallbackAdapter: getAdapter("GENERIC"),
      page,
      context,
      dryRun: RUNNER_DRY_RUN,
      onProgress,
      resumePath,
      profile: run.profile ?? null,
      screeningAnswers,
      job: run.job ?? null,
      atsAccount,
    });

    if (reauthOverride) {
      clearState(run.job_seeker_id);
      await pauseRun(
        API_BASE_URL,
        {
          run_id: run.run_id,
          reason: "REAUTH_REQUIRED",
          message: "Repeated authentication failures. Please re-authenticate.",
          step: "DETECT_ATS",
        },
        RUNNER_AUTH_TOKEN,
        run.claim_token,
        RUNNER_ID
      );
    }
  } catch (error) {
    const errorMessage = summarizeErrorMessage(error);
    logLine({
      level: "ERROR",
      runId: run.run_id,
      step: "RUN",
      msg: errorMessage,
    });
    if (!watchdogTriggered) {
      try {
        await retryRun(
          API_BASE_URL,
          {
            run_id: run.run_id,
            note: `Unhandled runner error: ${errorMessage}`,
          },
          RUNNER_AUTH_TOKEN,
          run.claim_token,
          RUNNER_ID
        );
        metrics.retried += 1;
      } catch (retryError) {
        logLine({
          level: "ERROR",
          runId: run.run_id,
          step: "RETRY",
          msg: summarizeErrorMessage(retryError, "Retry request failed."),
        });
        try {
          recordPause("RUNNER_ERROR");
          await pauseRun(
            API_BASE_URL,
            {
              run_id: run.run_id,
              reason: "RUNNER_ERROR",
              message: `Unhandled runner error: ${errorMessage}`,
              step:
                runProgress.get(run.run_id)?.lastStepName ??
                run.current_step ??
                "RUN",
            },
            RUNNER_AUTH_TOKEN,
            run.claim_token,
            RUNNER_ID
          );
        } catch (pauseError) {
          logLine({
            level: "ERROR",
            runId: run.run_id,
            step: "PAUSE",
            msg: summarizeErrorMessage(
              pauseError,
              "Failed to pause run after runner error."
            ),
          });
        }
      }
    }
  } finally {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
    }
    try {
      if (context) {
        const state = await context.storageState();
        writeState(run.job_seeker_id, state);
      }
    } catch (error) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "STORAGE",
        msg: "Failed to persist storage state.",
      });
    }
    try {
      await context?.close();
    } catch (error) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "CLOSE_CONTEXT",
        msg: "Failed to close browser context.",
      });
    }
    try {
      await browser?.close();
    } catch (error) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "CLOSE_BROWSER",
        msg: "Failed to close browser.",
      });
    }
    const progress = runProgress.get(run.run_id);
    if (progress?.lastStepAt && progress?.lastStepName) {
      recordStepDuration(
        progress.atsType,
        Date.now() - progress.lastStepAt
      );
    }
    runProgress.delete(run.run_id);

    // Report run duration to adapter health tracking
    const runDurationMs = Date.now() - runStartedAt;
    try {
      await postJson(
        `${API_BASE_URL}/api/apply/event`,
        {
          run_id: run.run_id,
          event_type: "RUN_DURATION",
          payload: {
            duration_ms: runDurationMs,
            ats_type: run.ats_type,
          },
        },
        RUNNER_AUTH_TOKEN,
        null,
        RUNNER_ID
      );
    } catch {
      // Non-blocking: duration reporting should not affect run cleanup
    }

    activeRuns.delete(run.run_id);
    if (resumePath && fs.existsSync(resumePath)) {
      try {
        fs.unlinkSync(resumePath);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

async function pollOnce() {
  if (Date.now() < pollBackoffUntil) {
    return;
  }

  while (activeRuns.size < CONCURRENCY) {
    let next;
    try {
      next = await fetchNextGlobal(API_BASE_URL, RUNNER_AUTH_TOKEN, RUNNER_ID);
    } catch (error) {
      pollFailures += 1;
      pollBackoffUntil = Date.now() + computeBackoffMs();
      logLine({ level: "ERROR", step: "POLL", msg: error?.message ?? "Poll failed" });
      return;
    }

    if (!next?.success) {
      pollFailures += 1;
      pollBackoffUntil = Date.now() + computeBackoffMs();
      logLine({ level: "WARN", step: "POLL", msg: next?.error ?? "Poll returned failure." });
      return;
    }

    if (next.status === "IDLE") {
      pollFailures = 0;
      return;
    }

    if (next.blocked) {
      pollFailures += 1;
      pollBackoffUntil = Date.now() + computeBackoffMs();
      logLine({ level: "WARN", step: "POLL", msg: "Poll blocked by API." });
      return;
    }

    pollFailures = 0;
    pollBackoffUntil = 0;
    await executeRun(next);
  }
}

async function start() {
  logLine({
    level: "INFO",
    step: "BOOT",
    msg: `Runner started (interval=${POLL_INTERVAL_MS}ms, concurrency=${CONCURRENCY}, dryRun=${RUNNER_DRY_RUN}).`,
    runner_id: RUNNER_ID,
  });
  if (DISCOVERY_AGENT_ENABLED) {
    if (!OPS_API_KEY) {
      logLine({
        level: "WARN",
        step: "DISCOVERY",
        msg: "DISCOVERY_AGENT_ENABLED=true but OPS_API_KEY is missing. Discovery agent not started.",
      });
    } else {
      startDiscoveryAgent().catch((error) => {
        logLine({
          level: "ERROR",
          step: "DISCOVERY",
          msg: error?.message ?? "Discovery agent failed to start.",
        });
      });
    }
  }
  await pollOnce();
  setInterval(() => {
    pollOnce().catch((error) => {
      logLine({ level: "ERROR", step: "POLL", msg: error?.message ?? "Poll error" });
    });
  }, POLL_INTERVAL_MS);

  setInterval(() => {
    const stepSummary = {};
    for (const [atsType, stats] of metrics.stepDurations.entries()) {
      stepSummary[atsType] = stats.count
        ? Math.round(stats.sumMs / stats.count)
        : 0;
    }
    logLine({
      level: "INFO",
      step: "METRICS",
      msg: "Runner summary.",
      active_runs: activeRuns.size,
      claimed: metrics.claimed,
      completed: metrics.completed,
      retried: metrics.retried,
      paused: metrics.paused,
      avg_step_ms_by_ats: stepSummary,
    });
  }, METRICS_INTERVAL_MS);

  setInterval(() => {
    if (!OPS_API_KEY) {
      return;
    }
    fetch(`${API_BASE_URL}/api/ops/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ops-key": OPS_API_KEY,
      },
      body: JSON.stringify({
        runner_id: RUNNER_ID,
        meta: {
          active_runs: activeRuns.size,
          breaker_state: snapshotBreakerState(),
        },
      }),
    })
      .then(async (response) => {
        if (response.ok) {
          return;
        }
        let detail = "";
        try {
          detail = (await response.text()) ?? "";
        } catch {
          detail = "";
        }
        logLine({
          level: "WARN",
          step: "HEARTBEAT",
          msg: `Heartbeat failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : "."}`,
        });
      })
      .catch((error) => {
        logLine({
          level: "WARN",
          step: "HEARTBEAT",
          msg: error?.message ?? "Heartbeat failed.",
        });
      });
  }, HEARTBEAT_INTERVAL_MS);
}

start();
