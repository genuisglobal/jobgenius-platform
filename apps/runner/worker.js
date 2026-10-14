import axios from "axios";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { greenhouseAdapter } from "./adapters/greenhouse.js";
import { createBrowserSession } from "./utils/browser.js";

const POLL_INTERVAL_MS = readNumber(process.env.RUNNER_POLL_INTERVAL_MS, 5000);
const REQUEST_TIMEOUT_MS = readNumber(process.env.RUNNER_REQUEST_TIMEOUT_MS, 30000);
const API_BASE_URL = resolveApiBaseUrl();
const AUTH_CONFIG = resolveAuthConfig();
const API_KEY = AUTH_CONFIG.value;
const RUNNER_ID = String(process.env.RUNNER_ID ?? process.env.HOSTNAME ?? "playwright-runner").trim();
const MODERN_CLAIM_ENDPOINT = "POST /api/apply/tasks/claim";
const LEGACY_CLAIM_ENDPOINT = "GET /api/apply/next-global";

let keepRunning = true;

process.on("SIGINT", () => {
  keepRunning = false;
});

process.on("SIGTERM", () => {
  keepRunning = false;
});

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveApiBaseUrl() {
  return normalizeBaseUrl(
    pickFirstNonEmpty(process.env.API_BASE_URL, process.env.JOBGENIUS_API_BASE_URL)
  );
}

function resolveAuthConfig() {
  const runnerAuthToken = pickFirstNonEmpty(process.env.RUNNER_AUTH_TOKEN);
  const legacyApiKey = pickFirstNonEmpty(process.env.JOBGENIUS_API_KEY);
  const value = pickFirstNonEmpty(runnerAuthToken, legacyApiKey);
  const valuesDiffer =
    Boolean(runnerAuthToken) &&
    Boolean(legacyApiKey) &&
    runnerAuthToken !== legacyApiKey;

  if (runnerAuthToken) {
    return {
      value,
      envName: "RUNNER_AUTH_TOKEN",
      legacyAliasUsed: false,
      valuesDiffer,
    };
  }

  if (legacyApiKey) {
    return {
      value,
      envName: "JOBGENIUS_API_KEY",
      legacyAliasUsed: true,
      valuesDiffer,
    };
  }

  return { value: "", envName: null, legacyAliasUsed: false, valuesDiffer: false };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now() {
  return new Date().toISOString();
}

function log(level, scope, message, details) {
  const line = ["[runner]", now(), level, scope, message].filter(Boolean).join(" ");
  if (details === undefined) {
    console.log(line);
    return;
  }
  console.log(line, details);
}

function isMissingRouteError(error) {
  const status = error?.response?.status;
  return status === 404 || status === 405;
}

function isIdlePayload(payload) {
  if (!payload) {
    return true;
  }
  const status = String(payload.status ?? payload.data?.status ?? "").toUpperCase();
  return status === "IDLE" || status === "NO_TASK";
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload.task ?? payload.run ?? payload.data ?? payload;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function summarizeError(error) {
  if (error?.response?.data) {
    const body = JSON.stringify(error.response.data);
    return `${error.message} ${body}`.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function normalizeClaimedRun(payload, source) {
  const unwrapped = unwrapPayload(payload) ?? {};
  return {
    source,
    task_id: pickFirst(unwrapped.task_id, unwrapped.id, payload?.task_id, payload?.id),
    queue_id: pickFirst(unwrapped.queue_id, payload?.queue_id),
    run_id: pickFirst(unwrapped.run_id, unwrapped.id, payload?.run_id),
    claim_token: pickFirst(unwrapped.claim_token, payload?.claim_token),
    ats_type: pickFirst(unwrapped.ats_type, payload?.ats_type),
    current_step: pickFirst(unwrapped.current_step, payload?.current_step),
    job: unwrapped.job ?? payload?.job ?? null,
    profile: unwrapped.profile ?? payload?.profile ?? null,
    resume: unwrapped.resume ?? payload?.resume ?? null,
    instructions: unwrapped.instructions ?? payload?.instructions ?? null,
    target_url: pickFirst(unwrapped.target_url, payload?.target_url),
    job_url: pickFirst(
      unwrapped.job?.url,
      payload?.job?.url,
      unwrapped.target_url,
      payload?.target_url
    ),
    raw: payload,
  };
}

function ensureRequiredConfig() {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is required.");
  }
  if (!API_KEY) {
    throw new Error("RUNNER_AUTH_TOKEN is required. JOBGENIUS_API_KEY is supported only as a legacy alias.");
  }
}

class RunnerApi {
  constructor({ apiBaseUrl, apiKey, runnerId }) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiKey = apiKey;
    this.runnerId = runnerId;
    this.client = axios.create({
      baseURL: apiBaseUrl,
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    this.modes = {
      claim: "unknown",
      start: "unknown",
      event: "unknown",
      complete: "unknown",
      pause: "unknown",
    };
  }

  headers(claimToken) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "x-api-key": this.apiKey,
      "x-runner": "cloud",
      "x-runner-id": this.runnerId,
    };
    if (claimToken) {
      headers["x-claim-token"] = claimToken;
    }
    return headers;
  }

  async claimTask() {
    if (this.modes.claim !== "legacy") {
      try {
        const response = await this.client.post(
          "/api/apply/tasks/claim",
          { runner_id: this.runnerId },
          { headers: this.headers() }
        );
        this.modes.claim = "modern";
        if (isIdlePayload(response.data)) {
          return null;
        }
        return normalizeClaimedRun(response.data, "modern");
      } catch (error) {
        if (!isMissingRouteError(error)) {
          throw error;
        }
        this.modes.claim = "legacy";
        log(
          "INFO",
          "claim",
          `Modern claim route unavailable; falling back to ${LEGACY_CLAIM_ENDPOINT}.`
        );
      }
    }

    const response = await this.client.get("/api/apply/next-global", {
      headers: this.headers(),
    });

    if (!response.data?.success && response.data?.blocked) {
      log("WARN", "claim", "Backend refused to hand out a run.", response.data);
      return null;
    }

    if (isIdlePayload(response.data)) {
      return null;
    }

    return normalizeClaimedRun(response.data, "legacy");
  }

  async startRun(task) {
    if (task.run_id && task.source === "legacy") {
      return task;
    }

    if (this.modes.start !== "legacy") {
      try {
        const response = await this.client.post(
          "/api/apply/runs/start",
          {
            task_id: pickFirst(task.task_id, task.id),
            application_task_id: pickFirst(task.task_id, task.id),
            queue_id: task.queue_id,
          },
          { headers: this.headers(task.claim_token) }
        );
        this.modes.start = "modern";
        return {
          ...task,
          ...normalizeClaimedRun(response.data, "modern"),
          claim_token: pickFirst(task.claim_token, response.data?.claim_token),
          job: task.job,
          profile: task.profile,
          resume: task.resume,
          instructions: task.instructions,
          target_url: pickFirst(task.target_url, response.data?.target_url),
          job_url: pickFirst(task.job_url, response.data?.job?.url, response.data?.target_url),
        };
      } catch (error) {
        if (!isMissingRouteError(error)) {
          throw error;
        }
        this.modes.start = "legacy";
      }
    }

    if (!task.queue_id) {
      return task;
    }

    const response = await this.client.post(
      "/api/apply/start",
      { queue_id: task.queue_id },
      { headers: this.headers(task.claim_token) }
    );

    return {
      ...task,
      ...normalizeClaimedRun(response.data, "legacy"),
      claim_token: pickFirst(task.claim_token, response.data?.claim_token),
      job: task.job,
      profile: task.profile,
      resume: task.resume,
      instructions: task.instructions,
      target_url: task.target_url,
      job_url: task.job_url,
    };
  }

  async fetchPlan(runId, claimToken) {
    if (!runId) {
      return null;
    }

    const headers = this.headers(claimToken);
    try {
      const response = await this.client.get("/api/apply/plan", {
        headers,
        params: { runId },
      });
      return response.data?.plan ?? null;
    } catch (error) {
      if (!isMissingRouteError(error) && error?.response?.status !== 404) {
        log("WARN", "plan", `Failed to load plan for ${runId}.`, summarizeError(error));
      }
    }

    try {
      await this.client.post(
        "/api/apply/plan/generate",
        { run_id: runId },
        { headers }
      );
      const response = await this.client.get("/api/apply/plan", {
        headers,
        params: { runId },
      });
      return response.data?.plan ?? null;
    } catch (error) {
      log("WARN", "plan", `Plan generation failed for ${runId}.`, summarizeError(error));
      return null;
    }
  }

  async sendEvent(runId, claimToken, event) {
    const payload = {
      run_id: runId,
      claim_token: claimToken,
      level: event.level ?? "INFO",
      event_type: event.event_type,
      step: event.step,
      message: event.message,
      payload: event.payload,
      last_seen_url: event.last_seen_url,
    };

    if (this.modes.event !== "legacy") {
      try {
        await this.client.post(
          `/api/apply/runs/${encodeURIComponent(runId)}/events`,
          payload,
          { headers: this.headers(claimToken) }
        );
        this.modes.event = "modern";
        return;
      } catch (error) {
        if (!isMissingRouteError(error)) {
          throw error;
        }
        this.modes.event = "legacy";
      }
    }

    await this.client.post("/api/apply/event", payload, {
      headers: this.headers(claimToken),
    });
  }

  async completeRun(runId, claimToken, payload = {}) {
    const body = {
      run_id: runId,
      claim_token: claimToken,
      note: payload.note ?? "Application submitted by Playwright runner.",
      last_seen_url: payload.last_seen_url ?? null,
    };

    if (this.modes.complete !== "legacy") {
      try {
        await this.client.post(
          `/api/apply/runs/${encodeURIComponent(runId)}/complete`,
          body,
          { headers: this.headers(claimToken) }
        );
        this.modes.complete = "modern";
        return;
      } catch (error) {
        if (!isMissingRouteError(error)) {
          throw error;
        }
        this.modes.complete = "legacy";
      }
    }

    await this.client.post("/api/apply/complete", body, {
      headers: this.headers(claimToken),
    });
  }

  async pauseRun(runId, claimToken, payload = {}) {
    const body = {
      run_id: runId,
      claim_token: claimToken,
      reason: payload.reason ?? "RUNNER_ERROR",
      error_code: payload.error_code ?? payload.reason ?? "RUNNER_ERROR",
      message: payload.message ?? "Runner paused the application.",
      last_seen_url: payload.last_seen_url ?? null,
      step: payload.step ?? null,
      meta: payload.meta ?? null,
    };

    if (this.modes.pause !== "legacy") {
      try {
        await this.client.post(
          `/api/apply/runs/${encodeURIComponent(runId)}/pause`,
          body,
          { headers: this.headers(claimToken) }
        );
        this.modes.pause = "modern";
        return;
      } catch (error) {
        if (!isMissingRouteError(error)) {
          throw error;
        }
        this.modes.pause = "legacy";
      }
    }

    await this.client.post("/api/apply/pause", body, {
      headers: this.headers(claimToken),
    });
  }
}

async function downloadResumeFile(apiClient, run) {
  const resumeUrl = pickFirst(run.resume?.url, run.resume_url, run.resume?.tailored_url);
  if (!resumeUrl) {
    return null;
  }

  const extension = path.extname(new URL(String(resumeUrl)).pathname) || ".pdf";
  const filePath = path.join(
    os.tmpdir(),
    `jobgenius-resume-${run.run_id ?? Date.now()}${extension}`
  );

  const response = await apiClient.get(resumeUrl, {
    responseType: "arraybuffer",
  });
  await fs.writeFile(filePath, Buffer.from(response.data));
  return filePath;
}

function resolveAdapter(run) {
  if (greenhouseAdapter.supports(run)) {
    return greenhouseAdapter;
  }
  return null;
}

function buildRunLogger(runId, api, claimToken) {
  return async (level, message, extras = {}) => {
    log(level, runId, message, Object.keys(extras).length > 0 ? extras : undefined);
    try {
      await api.sendEvent(runId, claimToken, {
        level,
        event_type: extras.event_type ?? "RUNNER_LOG",
        step: extras.step,
        message,
        payload: extras.payload,
        last_seen_url: extras.last_seen_url,
      });
    } catch (error) {
      log("WARN", runId, "Failed to send run event.", summarizeError(error));
    }
  };
}

async function processClaimedTask(api, claimedTask) {
  const run = await api.startRun(claimedTask);
  if (!run.run_id) {
    throw new Error("Claimed task did not include a run identifier.");
  }

  const claimToken = run.claim_token ?? claimedTask.claim_token ?? null;
  const plan = await api.fetchPlan(run.run_id, claimToken);
  const adapter = resolveAdapter({ ...run, target_url: plan?.metadata?.targetUrl ?? run.target_url });

  const runLog = buildRunLogger(run.run_id, api, claimToken);
  await runLog("INFO", "Run claimed for execution.", {
    event_type: "RUN_CLAIMED",
    step: run.current_step,
  });

  if (!adapter) {
    await api.pauseRun(run.run_id, claimToken, {
      reason: "UNSUPPORTED_ATS",
      message: `No Playwright adapter is available for ${run.ats_type ?? "UNKNOWN"}.`,
      step: run.current_step,
    });
    return;
  }

  let browserSession = null;
  let resumePath = null;

  try {
    resumePath = await downloadResumeFile(api.client, run).catch((error) => {
      log("WARN", run.run_id, "Resume download failed; continuing without a local file.", summarizeError(error));
      return null;
    });

    browserSession = await createBrowserSession();
    const { page } = browserSession;

    const adapterLog = async (level, message) => {
      await runLog(level, message, {
        event_type: "RUNNER_STEP",
        step: run.current_step,
        last_seen_url: page.url() || undefined,
      });
    };

    const result = await adapter.execute({
      page,
      run,
      plan,
      resumePath,
      log: adapterLog,
    });

    if (!result.success) {
      await api.pauseRun(run.run_id, claimToken, {
        reason: result.reason ?? "RUNNER_ERROR",
        message: result.message ?? "Application could not be completed.",
        step: run.current_step,
        last_seen_url: page.url() || null,
        meta: result.meta ?? null,
      });
      await runLog("WARN", `Run paused: ${result.reason ?? "RUNNER_ERROR"}.`, {
        event_type: "RUN_PAUSED",
        step: run.current_step,
        last_seen_url: page.url() || undefined,
        payload: result.meta ?? undefined,
      });
      return;
    }

    await api.completeRun(run.run_id, claimToken, {
      note: result.message ?? "Application submitted by Playwright runner.",
      last_seen_url: page.url() || null,
    });
    await runLog("INFO", "Run completed successfully.", {
      event_type: "RUN_COMPLETED",
      step: run.current_step,
      last_seen_url: page.url() || undefined,
    });
  } catch (error) {
    const message = summarizeError(error);
    log("ERROR", run.run_id, "Unhandled worker failure.", message);
    await api.pauseRun(run.run_id, claimToken, {
      reason: "RUNNER_ERROR",
      message,
      step: run.current_step,
    });
  } finally {
    if (resumePath) {
      await fs.unlink(resumePath).catch(() => undefined);
    }
    if (browserSession) {
      await browserSession.context.close().catch(() => undefined);
      await browserSession.browser.close().catch(() => undefined);
    }
  }
}

export async function startWorker() {
  ensureRequiredConfig();
  const api = new RunnerApi({
    apiBaseUrl: API_BASE_URL,
    apiKey: API_KEY,
    runnerId: RUNNER_ID,
  });

  log("INFO", "boot", "Runner starting.", {
    api_base_url: API_BASE_URL,
    auth_env: AUTH_CONFIG.envName ?? "none",
    primary_claim_endpoint: MODERN_CLAIM_ENDPOINT,
    fallback_claim_endpoint: LEGACY_CLAIM_ENDPOINT,
    poll_interval_ms: POLL_INTERVAL_MS,
    playwright_submit_enabled: readBoolean(process.env.PLAYWRIGHT_SUBMIT_ENABLED, false),
  });

  if (AUTH_CONFIG.legacyAliasUsed) {
    log(
      "WARN",
      "boot",
      "Using legacy auth env JOBGENIUS_API_KEY. RUNNER_AUTH_TOKEN is the intended apply API credential."
    );
  }

  if (AUTH_CONFIG.valuesDiffer) {
    log(
      "WARN",
      "boot",
      "RUNNER_AUTH_TOKEN and JOBGENIUS_API_KEY are both set and differ. The runner will use RUNNER_AUTH_TOKEN."
    );
  }

  while (keepRunning) {
    try {
      const claimedTask = await api.claimTask();
      if (!claimedTask) {
        log("INFO", "poll", "No application tasks available.");
      } else {
        const descriptor =
          claimedTask.job?.title && claimedTask.job?.company
            ? `${claimedTask.job.title} @ ${claimedTask.job.company}`
            : claimedTask.run_id ?? claimedTask.task_id ?? "unknown task";
        log("INFO", "poll", `Claimed ${descriptor}.`);
        await processClaimedTask(api, claimedTask);
      }
    } catch (error) {
      log("ERROR", "poll", "Polling cycle failed.", summarizeError(error));
    }

    if (!keepRunning) {
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  log("INFO", "shutdown", "Runner stopped.");
}
