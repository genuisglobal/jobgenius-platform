const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  authToken: "authToken",
  activeSeekerId: "activeSeekerId",
  runnerEnabled: "runnerEnabled",
  dryRun: "dryRun",
  orchestrateAllSeekers: "orchestrateAllSeekers",
};

const RUNNER_ALARM = "jobgenius-runner";
const activeRuns = new Set();
// Round-robin pointer for cross-seeker orchestration (persists across polls so
// no seeker is starved).
let orchestrationCursor = 0;
const ATTENTION_RESUME_COOLDOWN_MS = 10 * 60 * 1000;
const attentionResumeHistory = new Map();
const sessionSyncHistory = new Map();
const sessionSyncInFlight = new Set();
const AUTO_RESUME_REASONS = new Set([
  "CAPTCHA",
  "LOGIN_REQUIRED",
  "REAUTH_REQUIRED",
  "SESSION_EXPIRED",
  "OTP_SMS",
  "OTP_EMAIL",
]);
const JOB_SPY_SCRIPT_FILE = "spy-overlay.js";
const SESSION_SYNC_THROTTLE_MS = 2 * 60 * 1000;
const SESSION_SYNC_HOST_HINTS = [
  "linkedin.com",
  "indeed.com",
  "dice.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "greenhouse.io",
  "workday.com",
  "myworkdayjobs.com",
  "lever.co",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "breezy.hr",
  "ashbyhq.com",
  "bamboohr.com",
  "workable.com",
  "recruitee.com",
  "personio.com",
];
const JOB_SPY_HOST_HINTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "greenhouse.io",
  "workday.com",
  "myworkdayjobs.com",
  "lever.co",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "workable.com",
  "bamboohr.com",
  "recruitee.com",
  "ashbyhq.com",
  "breezy.hr",
];
const SESSION_SYNC_EXCLUDED_HOST_HINTS = [
  "job-genius.com",
  "vercel.app",
  "localhost",
];
// Friendly labels for session-expiry warnings, keyed by the host hints above.
const SESSION_HOST_LABELS = {
  "linkedin.com": "LinkedIn",
  "indeed.com": "Indeed",
  "dice.com": "Dice",
  "ziprecruiter.com": "ZipRecruiter",
  "glassdoor.com": "Glassdoor",
  "greenhouse.io": "Greenhouse",
  "workday.com": "Workday",
  "myworkdayjobs.com": "Workday",
  "lever.co": "Lever",
  "smartrecruiters.com": "SmartRecruiters",
  "icims.com": "iCIMS",
  "jobvite.com": "Jobvite",
  "breezy.hr": "Breezy",
  "ashbyhq.com": "Ashby",
  "bamboohr.com": "BambooHR",
  "workable.com": "Workable",
  "recruitee.com": "Recruitee",
  "personio.com": "Personio",
};
// Collapse subdomains to the ATS host hint so all *.greenhouse.io share one entry.
function sessionExpiryKey(host) {
  return SESSION_SYNC_HOST_HINTS.find((hint) => host.includes(hint)) || host;
}
function sessionHostLabel(host) {
  const hint = SESSION_SYNC_HOST_HINTS.find((h) => host.includes(h));
  return (hint && SESSION_HOST_LABELS[hint]) || host;
}
const RUNNER_SCRIPT_FILES = [
  "runner/phrases.js",
  "runner/captcha-overlay.js",
  "runner/sidebar.js",
  "runner/dom.js",
  "runner/adapters/base.js",
  "runner/adapters/linkedin_easy_apply.js",
  "runner/adapters/greenhouse.js",
  "runner/adapters/workday.js",
  "runner/adapters/lever.js",
  "runner/adapters/smartrecruiters.js",
  "runner/adapters/indeed.js",
  "runner/adapters/hosted-ats.js",
  "runner/adapters/generic.js",
  "runner/engine.js",
  "runner/index.js",
];

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function mapSameSite(value) {
  switch (String(value ?? "").toLowerCase()) {
    case "no_restriction":
      return "None";
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    default:
      return "Lax";
  }
}

function normalizeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function pathLooksLikeJob(pathname) {
  const path = String(pathname || "").toLowerCase();
  return (
    path.includes("/job") ||
    path.includes("/jobs") ||
    path.includes("/career") ||
    path.includes("/careers") ||
    path.includes("/position") ||
    path.includes("/vacancy") ||
    path.includes("/opportunity") ||
    path.includes("/apply")
  );
}

function isEligibleSessionSyncUrl(url, apiBaseUrl, force = false) {
  if (!url || !/^https:\/\//i.test(url)) {
    return false;
  }

  const host = normalizeHostname(url);
  if (!host) {
    return false;
  }

  if (SESSION_SYNC_EXCLUDED_HOST_HINTS.some((hint) => host.includes(hint))) {
    return false;
  }

  const apiHost = normalizeHostname(apiBaseUrl);
  if (apiHost && host === apiHost) {
    return false;
  }

  if (force) {
    return true;
  }

  return SESSION_SYNC_HOST_HINTS.some(
    (hint) => host === hint || host.endsWith(`.${hint}`)
  );
}

function isEligibleJobSpyUrl(url, apiBaseUrl) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = normalizeHostname(url);
  if (!host) {
    return false;
  }

  if (SESSION_SYNC_EXCLUDED_HOST_HINTS.some((hint) => host.includes(hint))) {
    return false;
  }

  const apiHost = normalizeHostname(apiBaseUrl);
  if (apiHost && host === apiHost) {
    return false;
  }

  if (JOB_SPY_HOST_HINTS.some((hint) => host === hint || host.endsWith(`.${hint}`))) {
    return true;
  }

  return pathLooksLikeJob(parsed.pathname);
}

function canSyncOriginNow(syncKey, force = false) {
  if (force) {
    return true;
  }
  const lastSync = sessionSyncHistory.get(syncKey) ?? 0;
  return Date.now() - lastSync >= SESSION_SYNC_THROTTLE_MS;
}

async function captureStorageStateForTab(tabId, url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }

  let cookies = [];
  try {
    const rawCookies = await chrome.cookies.getAll({ url: origin });
    cookies = rawCookies.map((cookie) => {
      const mapped = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        httpOnly: Boolean(cookie.httpOnly),
        secure: Boolean(cookie.secure),
        sameSite: mapSameSite(cookie.sameSite),
      };
      if (typeof cookie.expirationDate === "number") {
        mapped.expires = cookie.expirationDate;
      }
      return mapped;
    });
  } catch (error) {
    console.warn("Session sync cookie capture failed:", error);
  }

  let localStorageData = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const entries = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) {
            entries.push({
              name: key,
              value: localStorage.getItem(key) ?? "",
            });
          }
        }
        return entries;
      },
    });
    localStorageData = results?.[0]?.result ?? [];
  } catch (error) {
    console.warn("Session sync localStorage capture failed:", error);
  }

  if (cookies.length === 0 && localStorageData.length === 0) {
    return null;
  }

  // Record this ATS origin's session expiry so checkSessionExpiry() can warn
  // across every platform the seeker actually logs into — not just LinkedIn.
  recordSessionExpiry(origin, cookies).catch((error) => {
    console.warn("Session expiry record failed:", error);
  });

  return {
    cookies,
    origins: [
      {
        origin,
        localStorage: localStorageData,
      },
    ],
  };
}

// Persist the latest known session expiry for an ATS origin. Uses the longest-
// lived persistent cookie as the "session can last until" signal — auth/refresh
// cookies are typically the longest-lived, so this avoids false alarms from
// short-lived CSRF/analytics cookies while still catching a login about to lapse.
async function recordSessionExpiry(origin, cookies) {
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return;
  }
  if (SESSION_SYNC_EXCLUDED_HOST_HINTS.some((hint) => host.includes(hint))) return;

  const expiryTimes = cookies
    .map((cookie) => cookie.expires)
    .filter((value) => typeof value === "number");
  if (expiryTimes.length === 0) return; // only session-scoped cookies; nothing to warn about

  const key = sessionExpiryKey(host);
  const { sessionExpiryByHost = {} } = await getStorage("sessionExpiryByHost");
  sessionExpiryByHost[key] = {
    label: sessionHostLabel(host),
    expiresAt: Math.max(...expiryTimes),
    updatedAt: Date.now(),
  };
  await setStorage({ sessionExpiryByHost });
}

async function uploadStorageState(apiBaseUrl, authToken, activeSeekerId, storageState) {
  const response = await fetch(`${apiBaseUrl}/api/extension/storage-state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
    body: JSON.stringify({
      job_seeker_id: activeSeekerId,
      storage_state: storageState,
    }),
  });

  if (!response.ok) {
    throw new Error(`Storage state upload failed (${response.status}).`);
  }

  return response.json();
}

async function saveSpyAppliedJob(apiBaseUrl, authToken, activeSeekerId, job) {
  const response = await fetch(`${apiBaseUrl}/api/extension/spy-apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
    body: JSON.stringify({
      job_seeker_id: activeSeekerId,
      job,
      note: "Tracked as applied by JobGenius Spy.",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Spy apply failed (${response.status}).`);
  }

  return data;
}

// Job Intelligence overlay: live-score the job the AM is viewing against the
// active seeker. Keeps the auth token in the background — the content script
// only sends the scraped JD and renders the result.
async function scoreCurrentJob(job) {
  const { apiBaseUrl, authToken, activeSeekerId } = await getStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.activeSeekerId,
  ]);

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return { success: false, error: "Not connected to an active job seeker." };
  }
  if (!job || !job.title) {
    return { success: false, error: "No job on this page to score." };
  }

  const response = await fetch(`${apiBaseUrl}/api/extension/score-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
    body: JSON.stringify({
      title: job.title,
      company: job.company ?? null,
      location: job.location ?? null,
      description_text: job.raw_text ?? job.description ?? null,
      url: job.url ?? null,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      error: data?.error || `Scoring failed (${response.status}).`,
    };
  }
  return { success: true, ...data };
}

async function maybeInjectJobSpyForTab(tabId, url) {
  if (activeRuns.size > 0) {
    return false;
  }

  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
  } = await getStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.activeSeekerId,
  ]);

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return false;
  }

  if (!isEligibleJobSpyUrl(url, apiBaseUrl)) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [JOB_SPY_SCRIPT_FILE],
    });
    return true;
  } catch (error) {
    console.warn("Job spy injection failed:", error);
    return false;
  }
}

async function maybeSyncSessionStateForTab(tabId, url, options = {}) {
  const force = Boolean(options.force);
  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
  } = await getStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.activeSeekerId,
  ]);

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return false;
  }

  if (!isEligibleSessionSyncUrl(url, apiBaseUrl, force)) {
    return false;
  }

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }

  const syncKey = `${activeSeekerId}::${origin}`;
  if (sessionSyncInFlight.has(syncKey)) {
    return false;
  }

  if (!canSyncOriginNow(syncKey, force)) {
    return false;
  }

  sessionSyncInFlight.add(syncKey);
  try {
    const storageState = await captureStorageStateForTab(tabId, url);
    if (!storageState) {
      return false;
    }
    await uploadStorageState(apiBaseUrl, authToken, activeSeekerId, storageState);
    sessionSyncHistory.set(syncKey, Date.now());
    return true;
  } catch (error) {
    console.warn("Session sync failed:", error);
    return false;
  } finally {
    sessionSyncInFlight.delete(syncKey);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      throw new Error("Target tab is no longer available.");
    }
    if (tab.status === "complete") {
      return tab;
    }
    await sleep(200);
  }
  return chrome.tabs.get(tabId);
}

// Wait for `tabId` to navigate away from `startUrl` (the arming page), then
// restart the runner in the new document. If no navigation happens within the
// window, the original content-script instance is still alive and driving —
// re-injecting would double-run the plan, so we do nothing.
async function rearmRunnerAfterNavigation(tabId, startUrl, message) {
  const deadline = Date.now() + 20000;
  let navigated = false;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return; // tab closed (child-tab flow or user action)
    if (tab.url && tab.url !== startUrl) {
      navigated = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!navigated) return;

  await startRunnerInExistingTab(tabId, {
    job: message.job ?? null,
    runId: message.runId,
    apiBaseUrl: message.apiBaseUrl,
    authToken: message.authToken,
    resumeUrl: message.resumeUrl ?? null,
    claimToken: message.claimToken ?? null,
    jobSeekerId: message.jobSeekerId ?? message.activeSeekerId ?? null,
    activeSeekerId: message.activeSeekerId ?? null,
    dryRun: Boolean(message.dryRun),
    profile: message.profile ?? null,
  });
}

async function startRunnerInExistingTab(tabId, payload) {
  const {
    job,
    runId,
    apiBaseUrl,
    authToken,
    resumeUrl,
    claimToken,
    jobSeekerId,
    activeSeekerId,
    dryRun,
    profile,
  } = payload;

  const tab = await waitForTabComplete(tabId);
  if (tab?.url) {
    await maybeSyncSessionStateForTab(tabId, tab.url, { force: true });
  }

  // Inject into all frames so application forms embedded in cross-origin ATS
  // iframes (Greenhouse/Lever/Workday embeds) are reachable. Each frame
  // self-elects via shouldRunInThisFrame() so exactly one frame actually runs.
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: RUNNER_SCRIPT_FILES,
  });

  chrome.tabs.sendMessage(tabId, {
    type: "START_RUN",
    runId,
    claimToken,
    apiBaseUrl,
    authToken,
    jobSeekerId,
    activeSeekerId,
    job,
    resumeUrl,
    profile,
    dryRun: Boolean(dryRun),
  });
}

// Scrape the job's title/company/location/description from the page so an
// out-of-the-blue (often unmatched) job can be captured with its link + JD.
async function scrapeJobContext(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
        const pick = (selectors, minLen) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              const t = norm(el.textContent);
              if (t.length >= minLen) return t;
            }
          }
          return "";
        };
        const title = pick(
          [
            ".jobs-unified-top-card__job-title",
            ".jobsearch-JobInfoHeader-title",
            "[data-testid='jobsearch-JobInfoHeader-title']",
            ".top-card-layout__title",
            ".posting-headline h2",
            ".posting-headline h1",
            ".job-title",
            "h1",
          ],
          4
        );
        const company = pick(
          [
            ".jobs-unified-top-card__company-name",
            ".topcard__org-name-link",
            ".jobsearch-InlineCompanyRating-companyHeader",
            "[data-testid='inlineHeader-companyName']",
            ".top-card-layout__second-subline a",
            ".company-name",
            ".employer",
            "[data-testid='company-name']",
          ],
          2
        );
        const location = pick(
          [
            ".jobs-unified-top-card__bullet",
            ".topcard__flavor--bullet",
            "[data-testid='inlineHeader-companyLocation']",
            ".top-card-layout__third-subline",
            ".location",
            "[data-testid='text-location']",
          ],
          2
        );
        let description = "";
        for (const sel of [
          ".jobs-description__content",
          ".jobs-box__html-content",
          ".jobs-description-content__text",
          "#jobDescriptionText",
          ".jobsearch-jobDescriptionText",
          "[data-test='jobDescriptionContent']",
          ".job-description",
          ".job_description",
          "#job-description",
          ".posting-page .content",
          ".desc",
        ]) {
          const el = document.querySelector(sel);
          if (el) {
            const t = norm(el.textContent);
            if (t.length >= 80) {
              description = t.slice(0, 5000);
              break;
            }
          }
        }
        return {
          title: title || null,
          company: company || null,
          location: location || null,
          description: description || null,
          url: window.location.href,
        };
      },
    });
    return results?.[0]?.result ?? null;
  } catch (error) {
    console.warn("scrapeJobContext failed (non-fatal):", error);
    return null;
  }
}

// Mode 3: persist an AM's correction of an identity/profile field back to the
// active seeker's profile so the next autofill uses the right value.
async function updateSeekerProfile(message) {
  const { apiBaseUrl, authToken } = await getStorage(Object.values(STORAGE_KEYS));
  if (!apiBaseUrl || !authToken) {
    return { success: false, error: "Not connected." };
  }
  const response = await fetch(`${apiBaseUrl}/api/extension/update-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      key: message.key,
      value: message.value,
      part: message.part ?? null,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { success: false, error: data?.error || `Update failed (${response.status}).` };
  }
  return { success: true };
}

// Mode 3 learning: forward the runner's field-diff events to the server, which
// canonicalizes them into screening answers / learned rules. Fire-and-forget.
async function submitFieldLearning(message) {
  const { apiBaseUrl, authToken } = await getStorage(Object.values(STORAGE_KEYS));
  if (!apiBaseUrl || !authToken) return;
  const events = Array.isArray(message?.events) ? message.events : [];
  if (events.length === 0) return;

  await fetch(`${apiBaseUrl}/api/extension/learn-fields`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      ats_type: message.ats_type ?? null,
      url_host: message.url_host ?? null,
      job: message.job ?? null,
      events,
    }),
  });
}

// Outcome tracking: record how many of this application's fields were answered
// from AI / memory / saved answers / defaults, for the conversion analytics.
// Fire-and-forget; keyed to the active seeker server-side.
async function submitAnswerStats(message) {
  const { apiBaseUrl, authToken } = await getStorage(Object.values(STORAGE_KEYS));
  if (!apiBaseUrl || !authToken || !message?.job_post_id) return;
  await fetch(`${apiBaseUrl}/api/extension/answer-stats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      job_post_id: message.job_post_id,
      ai_count: message.ai ?? 0,
      memory_count: message.memory ?? 0,
      screening_count: message.screening ?? 0,
      default_count: message.default ?? 0,
    }),
  });
}

// Mode 3: launch interactive "Autofill this page" in the given tab.
// Fetches the run-less profile bundle, captures the job (link + description),
// optionally tailors the resume to the job, injects the runner, and sends
// AUTOFILL_PAGE. No run/plan/submit — the human reviews and submits.
async function autofillActiveTab(tabId, options = {}) {
  const { apiBaseUrl, authToken, activeSeekerId } = await getStorage(
    Object.values(STORAGE_KEYS)
  );

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return { success: false, error: "Extension is not connected." };
  }
  if (!tabId) {
    return { success: false, error: "No active tab to autofill." };
  }

  // Load the profile bundle in parallel with settling + scraping the tab — the
  // context fetch is independent of the tab work, so overlap their latency.
  const contextPromise = fetch(`${apiBaseUrl}/api/extension/autofill-context`, {
    method: "GET",
    headers: { Authorization: `Bearer ${authToken}` },
  })
    .then(async (response) => ({
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({})),
    }))
    .catch((error) => ({
      ok: false,
      status: 0,
      body: { error: error?.message ?? "Failed to load autofill profile." },
    }));

  const tab = await waitForTabComplete(tabId);
  if (tab?.url) {
    await maybeSyncSessionStateForTab(tabId, tab.url, { force: true });
  }

  // Capture the job (link + description) so unmatched opportunities persist and
  // get a job_post_id for tailoring/tracking. Best-effort; never blocks fill.
  const scraped = await scrapeJobContext(tabId);

  const contextResult = await contextPromise;
  if (!contextResult.ok) {
    return {
      success: false,
      error: contextResult.body?.error || `Failed to load profile (${contextResult.status}).`,
    };
  }
  const context = contextResult.body;
  let jobPostId = null;
  try {
    const captureRes = await fetch(`${apiBaseUrl}/api/extension/capture-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: tab?.url ?? scraped?.url ?? null,
        title: scraped?.title ?? tab?.title ?? null,
        company: scraped?.company ?? null,
        location: scraped?.location ?? null,
        description_text: scraped?.description ?? null,
        source: "manual_autofill",
      }),
    });
    const captureData = await captureRes.json().catch(() => ({}));
    if (captureRes.ok) {
      jobPostId = captureData?.job_post_id ?? null;
    }
  } catch (error) {
    console.warn("capture-job failed (non-fatal):", error);
  }

  // Optionally tailor the resume to this job first, then fill with it instead
  // of the base resume. Reuses the AM tailoring endpoint (the extension token
  // authenticates as the AM). Best-effort: on any failure we keep the base.
  let resumeUrl = context.resume?.url ?? null;
  let tailoring = null;
  if (options.tailor) {
    if (!jobPostId) {
      tailoring = { error: "Could not capture this job to tailor against." };
    } else {
      try {
        const tRes = await fetch(`${apiBaseUrl}/api/am/resume-tailor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            job_seeker_id: activeSeekerId,
            job_post_id: jobPostId,
          }),
        });
        const tData = await tRes.json().catch(() => ({}));
        const tailoredUrl = tData?.tailored_resume?.resume_url ?? null;
        if (tRes.ok && tailoredUrl) {
          resumeUrl = tailoredUrl;
          tailoring = {
            ok: true,
            changes_summary: tData?.changes_summary ?? null,
            coverage: tData?.coverage ?? null,
            safety: tData?.safety ?? null,
          };
        } else if (tRes.ok) {
          // Tailored text saved but no PDF URL to upload — fall back to base.
          tailoring = { error: "Tailored resume has no file to upload; using base." };
        } else {
          tailoring = { error: tData?.error || `Tailoring failed (${tRes.status}).` };
        }
      } catch (error) {
        tailoring = { error: error?.message ?? "Resume tailoring failed." };
      }
    }
  }

  // Inject into all frames so forms embedded in cross-origin ATS iframes are
  // reachable; each frame self-elects via shouldRunInThisFrame().
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: RUNNER_SCRIPT_FILES,
  });

  chrome.tabs.sendMessage(tabId, {
    type: "AUTOFILL_PAGE",
    apiBaseUrl,
    authToken,
    jobSeekerId: activeSeekerId,
    activeSeekerId,
    profile: context.profile ?? null,
    resumeUrl,
    // Base résumé URL + tailoring result so the content script can render the
    // AI Review card (changes/coverage/safety) and offer "Use base instead".
    baseResumeUrl: context.resume?.url ?? null,
    resumeSource: options.tailor && tailoring?.ok ? "tailored" : "base",
    tailoring: tailoring ?? null,
    job: {
      title: scraped?.title ?? tab?.title ?? null,
      company: scraped?.company ?? null,
      url: tab?.url ?? null,
      job_post_id: jobPostId,
    },
  });

  return {
    success: true,
    screening_count: context.screening_count ?? 0,
    job_post_id: jobPostId,
    tailored: Boolean(tailoring?.ok),
    tailoring,
  };
}

async function findChildTab(parentTabId, windowId, timeoutMs = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tabs = await chrome.tabs.query({ windowId });
    const child = tabs
      .filter((tab) => tab.id && tab.id !== parentTabId && tab.openerTabId === parentTabId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];

    if (child?.id) {
      return child;
    }

    await sleep(250);
  }

  return null;
}

async function fetchNextJob(apiBaseUrl, authToken, activeSeekerId, runId = null) {
  const params = new URLSearchParams({
    jobseekerId: activeSeekerId,
  });
  if (runId) {
    params.set("runId", runId);
  }
  const endpoint = `${apiBaseUrl}/api/apply/next?${params.toString()}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
  });

  if (!response.ok) {
    throw new Error(`Next job request failed (${response.status}).`);
  }

  return response.json();
}

function normalizeReason(reason) {
  return String(reason ?? "")
    .trim()
    .toUpperCase();
}

function shouldAutoResumeAttention(reason) {
  return AUTO_RESUME_REASONS.has(normalizeReason(reason));
}

function cleanupAttentionResumeHistory() {
  const cutoff = Date.now() - ATTENTION_RESUME_COOLDOWN_MS * 3;
  for (const [runId, ts] of attentionResumeHistory.entries()) {
    if (ts < cutoff) {
      attentionResumeHistory.delete(runId);
    }
  }
}

function canResumeRunNow(runId) {
  const lastAttempt = attentionResumeHistory.get(runId) ?? 0;
  return Date.now() - lastAttempt >= ATTENTION_RESUME_COOLDOWN_MS;
}

async function fetchNeedsAttentionJobs(apiBaseUrl, authToken) {
  const response = await fetch(`${apiBaseUrl}/api/extension/my-jobs?status=NEEDS_ATTENTION`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
  });

  if (!response.ok) {
    throw new Error(`Needs-attention fetch failed (${response.status}).`);
  }

  return response.json();
}

function pickAutoResumableAttentionItem(items) {
  if (!Array.isArray(items)) {
    return null;
  }

  for (const item of items) {
    const runId = item?.run_id;
    if (!runId) {
      continue;
    }

    const reason = normalizeReason(item?.needs_attention_reason ?? item?.last_error_code ?? "");
    if (!shouldAutoResumeAttention(reason)) {
      continue;
    }

    if (!canResumeRunNow(runId)) {
      continue;
    }

    return {
      runId,
      reason,
      job: item?.job ?? null,
    };
  }

  return null;
}

async function resumeNeedsAttentionRun(apiBaseUrl, authToken, runId, reason) {
  const response = await fetch(`${apiBaseUrl}/api/apply/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
    body: JSON.stringify({
      run_id: runId,
      note: `Auto-resumed by extension for ${reason || "needs attention"}.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resume run failed (${response.status}).`);
  }

  return response.json();
}

function shouldOpenInteractiveTab(reason) {
  const normalized = normalizeReason(reason);
  return (
    normalized === "CAPTCHA" ||
    normalized === "LOGIN_REQUIRED" ||
    normalized === "REAUTH_REQUIRED" ||
    normalized === "SESSION_EXPIRED" ||
    normalized === "OTP_SMS" ||
    normalized === "OTP_EMAIL"
  );
}

async function runJobInTab(
  job,
  runId,
  apiBaseUrl,
  authToken,
  resumeUrl,
  claimToken,
  activeSeekerId,
  dryRun,
  profile,
  activeTab = false
) {
  const tab = await chrome.tabs.create({ url: job.url, active: Boolean(activeTab) });
  await startRunnerInExistingTab(tab.id, {
    job,
    runId,
    apiBaseUrl,
    authToken,
    resumeUrl,
    claimToken,
    jobSeekerId: activeSeekerId,
    activeSeekerId,
    dryRun,
    profile,
  });
}

async function launchPayloadRun(payload, context, activeTab = false) {
  const { apiBaseUrl, authToken, activeSeekerId, dryRun } = context;
  if (!payload?.run_id || !payload?.job?.url) {
    return false;
  }

  activeRuns.add(payload.run_id);
  await runJobInTab(
    payload.job,
    payload.run_id,
    apiBaseUrl,
    authToken,
    payload.resume?.url ?? null,
    payload.claim_token ?? null,
    payload.job_seeker_id ?? activeSeekerId,
    dryRun,
    payload.profile ?? null,
    Boolean(activeTab)
  );
  return true;
}

async function tryResumeNeedsAttention(context) {
  cleanupAttentionResumeHistory();

  const { apiBaseUrl, authToken, activeSeekerId } = context;
  let attentionPayload;

  try {
    attentionPayload = await fetchNeedsAttentionJobs(apiBaseUrl, authToken);
  } catch (error) {
    console.warn("Needs-attention polling failed:", error);
    return false;
  }

  const candidate = pickAutoResumableAttentionItem(attentionPayload?.items ?? []);
  if (!candidate?.runId) {
    return false;
  }

  attentionResumeHistory.set(candidate.runId, Date.now());

  try {
    await resumeNeedsAttentionRun(
      apiBaseUrl,
      authToken,
      candidate.runId,
      candidate.reason
    );
  } catch (error) {
    console.warn("Needs-attention resume failed:", error);
    return false;
  }

  let resumedRun;
  try {
    resumedRun = await fetchNextJob(
      apiBaseUrl,
      authToken,
      activeSeekerId,
      candidate.runId
    );
  } catch (error) {
    console.warn("Needs-attention claim failed:", error);
    return false;
  }

  if (!resumedRun?.success || resumedRun.status === "IDLE" || resumedRun.blocked) {
    return false;
  }

  return launchPayloadRun(
    resumedRun,
    context,
    shouldOpenInteractiveTab(candidate.reason)
  );
}

async function fetchAssignedSeekerIds(apiBaseUrl, authToken) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/extension/seekers`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.seekers || []).map((s) => s.id).filter(Boolean);
  } catch (error) {
    console.warn("Failed to load seekers for orchestration:", error);
    return [];
  }
}

// Cross-seeker orchestration: round-robin the AM's whole book, claiming runs
// across seekers until the shared concurrency cap fills. Each claim goes
// through the normal per-seeker /api/apply/next, so every gate (velocity,
// dedup, kill-switch, quiet hours) still applies per seeker; the server also
// enforces the shared cap, so this can never over-launch.
async function pollRunnerAcrossSeekers(context) {
  const { apiBaseUrl, authToken } = context;
  const seekerIds = await fetchAssignedSeekerIds(apiBaseUrl, authToken);
  const n = seekerIds.length;
  if (n === 0) return;

  const maxIterations = n * 2;
  for (let iter = 0; iter < maxIterations && activeRuns.size < 5; iter += 1) {
    const seekerId = seekerIds[orchestrationCursor % n];
    orchestrationCursor = (orchestrationCursor + 1) % n;

    let payload;
    try {
      payload = await fetchNextJob(apiBaseUrl, authToken, seekerId);
    } catch (error) {
      console.warn("Orchestration claim failed:", error);
      continue;
    }

    if (!payload?.success) continue;
    if (payload.blocked) {
      // Shared cap reached → stop the pass; per-seeker blocks → try the next.
      if (payload.reason === "MAX_CONCURRENCY") break;
      continue;
    }
    if (payload.status === "IDLE") continue;

    await launchPayloadRun(payload, context, false);
  }
}

async function pollRunner() {
  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
    runnerEnabled,
    dryRun,
    orchestrateAllSeekers,
  } = await getStorage(Object.values(STORAGE_KEYS));

  if (!runnerEnabled) {
    return;
  }

  if (!apiBaseUrl || !authToken) {
    return;
  }

  if (activeRuns.size >= 5) {
    return;
  }

  const context = {
    apiBaseUrl,
    authToken,
    activeSeekerId,
    dryRun,
  };

  // Cross-seeker mode drives throughput across the whole book instead of the
  // one active seeker.
  if (orchestrateAllSeekers) {
    await pollRunnerAcrossSeekers(context);
    return;
  }

  if (!activeSeekerId) {
    return;
  }

  let payload;
  try {
    payload = await fetchNextJob(apiBaseUrl, authToken, activeSeekerId);
  } catch (error) {
    console.warn("Runner polling failed:", error);
    return;
  }

  if (!payload?.success) {
    return;
  }

  if (payload.blocked) {
    return;
  }

  if (payload.status === "IDLE") {
    await tryResumeNeedsAttention(context);
    return;
  }

  await launchPayloadRun(payload, context, false);
}

async function runSpecificRun(runId, activateTab = true) {
  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
    dryRun,
  } = await getStorage(Object.values(STORAGE_KEYS));

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return { success: false, error: "Extension is not connected." };
  }

  if (!runId) {
    return { success: false, error: "Missing run ID." };
  }

  if (activeRuns.size >= 5) {
    return { success: false, error: "Runner is at max concurrency." };
  }

  await setStorage({ [STORAGE_KEYS.runnerEnabled]: true });

  let payload;
  try {
    payload = await fetchNextJob(apiBaseUrl, authToken, activeSeekerId, runId);
  } catch (error) {
    return {
      success: false,
      error: error?.message ?? "Failed to claim run.",
    };
  }

  if (!payload?.success) {
    return { success: false, error: payload?.error ?? "Failed to start run." };
  }

  if (payload.status === "IDLE") {
    return {
      success: false,
      error: "Run is not ready yet. Try again in a moment.",
    };
  }

  if (!payload.run_id || !payload.job?.url) {
    return { success: false, error: "Runner payload is incomplete." };
  }

  await launchPayloadRun(
    payload,
    { apiBaseUrl, authToken, activeSeekerId, dryRun },
    Boolean(activateTab)
  );

  return { success: true, run_id: payload.run_id };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RUNNER_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(RUNNER_ALARM, { periodInMinutes: 1 });
});

const SESSION_EXPIRY_ALARM = "jobgenius-session-check";
const SESSION_EXPIRY_WARN_HOURS = 24;

chrome.alarms.create(SESSION_EXPIRY_ALARM, { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RUNNER_ALARM) {
    pollRunner();
  }
  if (alarm.name === SESSION_EXPIRY_ALARM) {
    checkSessionExpiry();
  }
});

// How stale a recorded expiry can be before we stop trusting it. If the seeker
// hasn't visited a platform in this long, the cookie may have been refreshed on
// a visit we didn't capture — so we don't nag based on outdated data.
const SESSION_EXPIRY_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function warnIfExpiringSoon(label, expiresAtSeconds) {
  const hoursUntilExpiry = (expiresAtSeconds - Date.now() / 1000) / 3600;
  if (hoursUntilExpiry >= SESSION_EXPIRY_WARN_HOURS) return;
  showSessionWarning(
    label,
    hoursUntilExpiry <= 0
      ? "session expired — please log in again"
      : `session expires in ${Math.round(hoursUntilExpiry)} hours — visit ${label} to refresh`
  );
}

// Boards with a known, stable auth cookie we can check directly (no tab visit
// needed). `warnWhenNeverSeen`: LinkedIn is the primary board, so a missing
// cookie is always worth a warning; for the others we only nag when the seeker
// has actually used the board (a recorded session-sync entry exists) —
// otherwise "please log in to Indeed" is noise for a seeker who never uses it.
const AUTH_COOKIE_CHECKS = [
  {
    hint: "linkedin.com",
    label: "LinkedIn",
    url: "https://www.linkedin.com",
    cookieName: "li_at",
    warnWhenNeverSeen: true,
  },
  {
    hint: "indeed.com",
    label: "Indeed",
    url: "https://www.indeed.com",
    cookieName: "PPID",
    warnWhenNeverSeen: false,
  },
];

async function checkSessionExpiry() {
  let sessionExpiryByHost = {};
  try {
    ({ sessionExpiryByHost = {} } = await getStorage("sessionExpiryByHost"));
  } catch {
    sessionExpiryByHost = {};
  }

  // Boards with a known auth cookie: check it directly.
  for (const check of AUTH_COOKIE_CHECKS) {
    try {
      const cookie = await chrome.cookies.get({
        url: check.url,
        name: check.cookieName,
      });
      if (!cookie) {
        const seekerUsesBoard = Boolean(sessionExpiryByHost[check.hint]);
        if (check.warnWhenNeverSeen || seekerUsesBoard) {
          showSessionWarning(
            check.label,
            `session expired — please log in to ${check.label}`
          );
        }
      } else if (typeof cookie.expirationDate === "number") {
        warnIfExpiringSoon(check.label, cookie.expirationDate);
      }
    } catch (err) {
      console.warn(`Session expiry check failed for ${check.label}:`, err);
    }
  }

  // Every other ATS the seeker actually logs into is covered by the expiry we
  // recorded during session-state sync (recordSessionExpiry). Absence is silent
  // — we never nag about a platform the seeker doesn't use.
  try {
    const directlyChecked = new Set(AUTH_COOKIE_CHECKS.map((c) => c.hint));
    const now = Date.now();
    for (const [key, entry] of Object.entries(sessionExpiryByHost)) {
      if (directlyChecked.has(key)) continue; // handled explicitly above
      if (!entry || typeof entry.expiresAt !== "number") continue;
      if (now - (entry.updatedAt ?? 0) > SESSION_EXPIRY_STALE_MS) continue; // stale record
      warnIfExpiringSoon(entry.label || key, entry.expiresAt);
    }
  } catch (err) {
    console.warn("Session expiry check failed for synced ATS hosts:", err);
  }
}

function showSessionWarning(platform, message) {
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });
  // Store warning for popup to display
  setStorage({
    sessionWarning: { platform, message, timestamp: Date.now() },
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab?.url) {
    return;
  }
  maybeSyncSessionStateForTab(tabId, tab.url).catch((error) => {
    console.warn("Session sync on tab update failed:", error);
  });
  maybeInjectJobSpyForTab(tabId, tab.url).catch((error) => {
    console.warn("Job spy injection on tab update failed:", error);
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs
    .get(tabId)
    .then((tab) => {
      if (!tab?.url) {
        return;
      }
      return Promise.allSettled([
        maybeSyncSessionStateForTab(tabId, tab.url),
        maybeInjectJobSpyForTab(tabId, tab.url),
      ]);
    })
    .catch((error) => {
      console.warn("Session sync on tab activate failed:", error);
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RUNNER_TOGGLE") {
    setStorage({ [STORAGE_KEYS.runnerEnabled]: message.enabled }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message?.type === "RUNNER_RUN_NOW") {
    pollRunner().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message?.type === "LEARN_FIELDS") {
    // Fire-and-forget: the sender (content script) may be navigating away.
    submitFieldLearning(message).catch((error) =>
      console.warn("learn-fields submit failed:", error)
    );
    return false;
  }

  if (message?.type === "ANSWER_STATS") {
    submitAnswerStats(message).catch((error) =>
      console.warn("answer-stats submit failed:", error)
    );
    return false;
  }

  if (message?.type === "PROFILE_UPDATE") {
    updateSeekerProfile(message)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ success: false, error: error?.message ?? "Profile update failed." })
      );
    return true;
  }

  if (message?.type === "AUTOFILL_ACTIVE_TAB") {
    autofillActiveTab(message.tabId ?? sender?.tab?.id, {
      tailor: Boolean(message.tailor),
    })
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message ?? "Autofill failed to launch.",
        })
      );
    return true;
  }

  if (message?.type === "RUNNER_RUN_FOR_RUN_ID") {
    runSpecificRun(message.runId, message.activateTab !== false)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message ?? "Failed to run selected job.",
        })
      );
    return true;
  }

  // Same-tab navigation rearm (Indeed native apply → smartapply.indeed.com):
  // the content script arms us BEFORE clicking a button whose navigation will
  // destroy it; we watch the tab, and once it lands on the new page we
  // re-inject the runner so the plan continues there.
  if (message?.type === "RUNNER_REARM_SAME_TAB") {
    const sourceTabId = sender?.tab?.id;
    const startUrl = sender?.tab?.url ?? "";
    if (!sourceTabId) {
      sendResponse({ success: false, error: "Missing source tab." });
      return false;
    }
    // Ack immediately — the caller is about to click and may die.
    sendResponse({ success: true });
    rearmRunnerAfterNavigation(sourceTabId, startUrl, message).catch((error) =>
      console.warn("Same-tab runner rearm failed:", error)
    );
    return false;
  }

  if (message?.type === "RUNNER_HANDOFF_TO_CHILD_TAB") {
    const sourceTabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;

    if (!sourceTabId || windowId === undefined) {
      sendResponse({ success: false, error: "Missing source tab." });
      return false;
    }

    findChildTab(sourceTabId, windowId)
      .then(async (childTab) => {
        if (!childTab?.id) {
          sendResponse({ success: false, error: "Application tab not found." });
          return;
        }

        await startRunnerInExistingTab(childTab.id, {
          job: message.job ?? null,
          runId: message.runId,
          apiBaseUrl: message.apiBaseUrl,
          authToken: message.authToken,
          resumeUrl: message.resumeUrl ?? null,
          claimToken: message.claimToken ?? null,
          jobSeekerId: message.jobSeekerId ?? message.activeSeekerId ?? null,
          activeSeekerId: message.activeSeekerId ?? null,
          dryRun: Boolean(message.dryRun),
          profile: message.profile ?? null,
        });

        sendResponse({ success: true, tab_id: childTab.id });
      })
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message ?? "Failed to hand off runner.",
        })
      );

    return true;
  }

  if (message?.type === "SCORE_JOB") {
    scoreCurrentJob(message.job || null)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "Failed to score this job.",
        })
      );
    return true;
  }

  if (message?.type === "JOB_SPY_MARK_APPLIED") {
    getStorage([
      STORAGE_KEYS.apiBaseUrl,
      STORAGE_KEYS.authToken,
      STORAGE_KEYS.activeSeekerId,
    ])
      .then(async ({ apiBaseUrl, authToken, activeSeekerId }) => {
        if (!apiBaseUrl || !authToken || !activeSeekerId) {
          sendResponse({
            success: false,
            error: "Extension is not connected to an active job seeker.",
          });
          return;
        }

        const result = await saveSpyAppliedJob(
          apiBaseUrl,
          authToken,
          activeSeekerId,
          message.job || null
        );
        sendResponse({ success: true, ...result });
      })
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "Failed to save tracked application.",
        })
      );
    return true;
  }

  if (message?.type === "RUN_COMPLETE" && message.runId) {
    activeRuns.delete(message.runId);
    attentionResumeHistory.delete(message.runId);
    return false;
  }

  // Runner hit a login wall mid-apply: badge + popup banner immediately
  // instead of waiting for the hourly cookie check.
  if (message?.type === "SESSION_EXPIRED_DETECTED") {
    const label = sessionHostLabel(String(message.host ?? ""));
    showSessionWarning(
      label,
      "session expired — log back in to resume applications"
    );
    return false;
  }

  // Proof-of-submission / pause-state screenshot for the runner engine.
  // captureVisibleTab only exists in the background worker (content scripts
  // can't call it) and only captures the ACTIVE tab of a window — capturing
  // an inactive tab would silently photograph whatever tab the user is
  // looking at instead, so we refuse rather than upload a wrong-page "proof".
  if (message?.type === "CAPTURE_PROOF_SCREENSHOT") {
    if (!sender?.tab?.active) {
      sendResponse({ success: false, reason: "TAB_NOT_ACTIVE" });
      return false;
    }
    try {
      chrome.tabs.captureVisibleTab(
        sender.tab.windowId,
        { format: "png" },
        (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            sendResponse({
              success: false,
              reason: chrome.runtime.lastError?.message ?? "CAPTURE_FAILED",
            });
            return;
          }
          sendResponse({ success: true, dataUrl });
        }
      );
      return true; // async sendResponse
    } catch (error) {
      sendResponse({ success: false, reason: error?.message ?? "CAPTURE_FAILED" });
      return false;
    }
  }

  return false;
});
