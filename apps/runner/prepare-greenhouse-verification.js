import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
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

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html, fallbackUrl) {
  const titleMatch = String(html ?? "").match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    return titleMatch[1]
      .trim()
      .replace(/\s*[|\-]\s*Greenhouse.*$/i, "")
      .replace(/\s*[|\-]\s*Job Application.*$/i, "");
  }

  try {
    const url = new URL(fallbackUrl);
    const slug = url.pathname.split("/").filter(Boolean).pop() ?? "Greenhouse role";
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "Greenhouse role";
  }
}

function extractCompany(html, fallbackTitle) {
  const ogSiteName = String(html ?? "").match(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogSiteName?.[1]?.trim()) {
    return ogSiteName[1].trim();
  }

  const boardTokenMatch = String(html ?? "").match(/greenhouse\.io\/([^/"'?]+)/i);
  if (boardTokenMatch?.[1]?.trim()) {
    return boardTokenMatch[1].trim();
  }

  const cleanedTitle = String(fallbackTitle ?? "").trim();
  const parts = cleanedTitle.split(/\s+at\s+/i);
  if (parts.length > 1 && parts[1]?.trim()) {
    return parts[1].trim();
  }

  return "";
}

function log(scope, message, details) {
  const prefix = `[prepare-greenhouse] ${scope}`;
  if (details === undefined) {
    console.log(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`, details);
}

function fail(message) {
  console.error(`[prepare-greenhouse] ERROR ${message}`);
  process.exit(1);
}

function buildClient(apiBaseUrl, authToken) {
  return axios.create({
    baseURL: apiBaseUrl,
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status < 300,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
  });
}

async function loadJobSeekers(client) {
  const response = await client.get("/api/am/jobseekers?page=1&pageSize=100");
  const accountManager = response.data?.account_manager ?? null;
  const seekers = Array.isArray(response.data?.job_seekers) ? response.data.job_seekers : [];
  return { accountManager, seekers };
}

async function fetchJobMetadata(targetUrl) {
  try {
    const response = await axios.get(targetUrl, {
      timeout: 30000,
      maxRedirects: 5,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const html = String(response.data ?? "");
    const finalUrl =
      response.request?.res?.responseUrl ||
      response.request?.responseURL ||
      targetUrl;
    const title = extractTitle(html, finalUrl);
    const company = extractCompany(html, title);
    const rawText = stripHtml(html);

    return {
      finalUrl,
      title,
      company,
      rawHtml: html,
      rawText,
      fetched: true,
    };
  } catch (error) {
    log("WARN", "Could not fetch the target page. Falling back to URL-only save.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      finalUrl: targetUrl,
      title: extractTitle("", targetUrl),
      company: "",
      rawHtml: null,
      rawText: null,
      fetched: false,
    };
  }
}

async function saveJob(client, payload) {
  const response = await client.post("/api/jobs/save", payload);
  if (!response.data?.success || !response.data?.id) {
    throw new Error(response.data?.error ?? "Failed to save job.");
  }
  return response.data;
}

async function enqueueJob(client, jobPostId, jobSeekerId, category) {
  const response = await client.post("/api/queue/enqueue", {
    job_post_id: jobPostId,
    job_seeker_id: jobSeekerId,
    category,
  });
  if (!response.data?.success) {
    throw new Error(response.data?.error ?? "Failed to enqueue job.");
  }
  return response.data;
}

async function listQueue(client) {
  const response = await client.get("/api/queue");
  return Array.isArray(response.data?.items) ? response.data.items : [];
}

async function findQueueItem(client, jobPostId, jobSeekerId) {
  const items = await listQueue(client);
  return (
    items.find(
      (item) => item.job_post_id === jobPostId && item.job_seeker_id === jobSeekerId
    ) ?? null
  );
}

async function startBatch(client, queueId) {
  const response = await client.post("/api/apply/start-batch", {
    queue_ids: [queueId],
  });
  if (!response.data?.success) {
    throw new Error(response.data?.error ?? "Failed to start batch.");
  }
  return response.data;
}

async function retryRun(client, runId) {
  const response = await client.post("/api/apply/retry", {
    run_id: runId,
    note: "Prepared for Playwright verification.",
  });
  if (!response.data?.success) {
    throw new Error(response.data?.error ?? "Failed to retry run.");
  }
  return response.data;
}

async function main() {
  const apiBaseUrl = normalizeBaseUrl(
    pickFirstNonEmpty(process.env.API_BASE_URL, process.env.JOBGENIUS_API_BASE_URL)
  );
  const authToken = pickFirstNonEmpty(
    process.env.RUNNER_AUTH_TOKEN,
    process.env.JOBGENIUS_API_KEY
  );
  const targetUrl = pickFirstNonEmpty(process.argv[2], process.env.VERIFY_GREENHOUSE_URL);
  const preferredJobSeekerId = pickFirstNonEmpty(process.env.VERIFY_JOB_SEEKER_ID);
  const category = pickFirstNonEmpty(process.env.VERIFY_QUEUE_CATEGORY, "manual_verification");
  const autoStart = readBoolean(process.env.VERIFY_AUTO_START, true);

  if (!apiBaseUrl) {
    fail("API_BASE_URL is required.");
  }
  if (!authToken) {
    fail("RUNNER_AUTH_TOKEN is required.");
  }
  if (!targetUrl) {
    fail("Pass a Greenhouse URL as the first argument or set VERIFY_GREENHOUSE_URL.");
  }

  const client = buildClient(apiBaseUrl, authToken);
  const { accountManager, seekers } = await loadJobSeekers(client);

  if (!seekers.length) {
    fail("The runner account manager has no assigned job seekers.");
  }

  const targetSeeker =
    seekers.find((seeker) => seeker.id === preferredJobSeekerId) ?? seekers[0];

  if (preferredJobSeekerId && targetSeeker.id !== preferredJobSeekerId) {
    fail(`VERIFY_JOB_SEEKER_ID ${preferredJobSeekerId} is not assigned to the runner.`);
  }

  log("INFO", "Preparing Greenhouse verification target.", {
    api_base_url: apiBaseUrl,
    account_manager_id: accountManager?.id ?? null,
    account_manager_email: accountManager?.email ?? null,
    job_seeker_id: targetSeeker.id,
    auto_start: autoStart,
  });

  const fetched = await fetchJobMetadata(targetUrl);
  const title = pickFirstNonEmpty(process.env.VERIFY_JOB_TITLE, fetched.title);
  const company = pickFirstNonEmpty(process.env.VERIFY_COMPANY, fetched.company);
  const location = pickFirstNonEmpty(process.env.VERIFY_LOCATION, "");

  const saveResult = await saveJob(client, {
    title,
    url: fetched.finalUrl,
    source: "greenhouse",
    company: company || null,
    location: location || null,
    raw_html: fetched.rawHtml,
    raw_text: fetched.rawText,
  });

  log("INFO", "Saved job post.", {
    job_post_id: saveResult.id,
    duplicate: Boolean(saveResult.duplicate),
    fetched_metadata: fetched.fetched,
    title,
    company: company || null,
  });

  const enqueueResult = await enqueueJob(client, saveResult.id, targetSeeker.id, category);
  if (enqueueResult.already_queued) {
    log("INFO", "Job was already queued for this seeker.", {
      queue_id: enqueueResult.queue_id ?? null,
      run_id: enqueueResult.run_id ?? null,
      status: enqueueResult.status ?? null,
    });
  } else {
    log("INFO", "Queued job for application.");
  }

  let queueItem = await findQueueItem(client, saveResult.id, targetSeeker.id);
  if (!queueItem) {
    throw new Error("Queued item could not be found after enqueue.");
  }

  if (autoStart) {
    if (queueItem.run?.id && ["NEEDS_ATTENTION", "FAILED", "CANCELLED"].includes(queueItem.run.status)) {
      const retryResult = await retryRun(client, queueItem.run.id);
      log("INFO", "Retried existing run for verification.", {
        run_id: retryResult.run_id,
        status: retryResult.status,
      });
    } else if (!queueItem.run?.id && queueItem.status === "QUEUED") {
      const startResult = await startBatch(client, queueItem.id);
      log("INFO", "Created READY run for verification.", startResult);
    } else {
      log("INFO", "Existing queue item is already armed for execution.", {
        queue_status: queueItem.status,
        run_status: queueItem.run?.status ?? null,
        run_id: queueItem.run?.id ?? null,
      });
    }

    queueItem = await findQueueItem(client, saveResult.id, targetSeeker.id);
  }

  log("INFO", "Verification target ready.", {
    job_post_id: saveResult.id,
    queue_id: queueItem?.id ?? null,
    queue_status: queueItem?.status ?? null,
    run_id: queueItem?.run?.id ?? null,
    run_status: queueItem?.run?.status ?? null,
    current_step: queueItem?.run?.current_step ?? null,
    url: fetched.finalUrl,
  });

  console.log("");
  console.log("Next steps:");
  console.log("1. Stop any other background runner processes before starting a foreground run.");
  console.log("2. In apps/runner, run `npm start` to watch the task execute.");
  console.log(
    "3. Leave PLAYWRIGHT_SUBMIT_ENABLED unset or false for a safe pre-submit run. Set it to true only when you want a real submission attempt."
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
