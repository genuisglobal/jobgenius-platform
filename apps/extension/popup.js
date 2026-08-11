// Storage keys
const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  authToken: "authToken",
  amInfo: "amInfo",
  activeSeekerId: "activeSeekerId",
  runnerEnabled: "runnerEnabled",
  dryRun: "dryRun",
  autoAutofill: "autoAutofill",
  orchestrateAllSeekers: "orchestrateAllSeekers",
};

const DEFAULT_API_BASE_URL = "https://job-genius.com";

// State
let authToken = null;
let amInfo = null;
let activeSeekerId = null;
let includeAppliedJobs = false;
let apiBaseUrl = DEFAULT_API_BASE_URL;
let cachedSeekers = [];      // for autofill modal profile display
let pendingApplyJobId = null; // job awaiting modal confirmation

// DOM Elements
const els = {
  authGate: document.getElementById("authGate"),
  mainApp: document.getElementById("mainApp"),
  amCodeInput: document.getElementById("amCodeInput"),
  connectBtn: document.getElementById("connectBtn"),
  authStatus: document.getElementById("authStatus"),
  connectionBadge: document.getElementById("connectionBadge"),
  connectionText: document.getElementById("connectionText"),
  amAvatar: document.getElementById("amAvatar"),
  amName: document.getElementById("amName"),
  amEmailDisplay: document.getElementById("amEmailDisplay"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  seekerSelect: document.getElementById("seekerSelect"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  cockpitTotals: document.getElementById("cockpitTotals"),
  cockpitList: document.getElementById("cockpitList"),
  cockpitEmpty: document.getElementById("cockpitEmpty"),
  refreshCockpitBtn: document.getElementById("refreshCockpit"),
  adminTab: document.getElementById("adminTab"),
  killSwitches: document.getElementById("killSwitches"),
  adapterHealth: document.getElementById("adapterHealth"),
  qaPending: document.getElementById("qaPending"),
  adminStatus: document.getElementById("adminStatus"),
  refreshAdminBtn: document.getElementById("refreshAdmin"),
  pageTitle: document.getElementById("pageTitle"),
  pageUrl: document.getElementById("pageUrl"),
  detectedBoard: document.getElementById("detectedBoard"),
  saveJobBtn: document.getElementById("saveJob"),
  autofillPageBtn: document.getElementById("autofillPage"),
  tailorAutofillPageBtn: document.getElementById("tailorAutofillPage"),
  scrapeVisibleBtn: document.getElementById("scrapeVisible"),
  scrapeAllBtn: document.getElementById("scrapeAll"),
  scrapePreview: document.getElementById("scrapePreview"),
  scrapePreviewTitle: document.getElementById("scrapePreviewTitle"),
  scrapeList: document.getElementById("scrapeList"),
  scrapeSaveSelectedBtn: document.getElementById("scrapeSaveSelected"),
  scrapeToggleAllBtn: document.getElementById("scrapeToggleAll"),
  scrapeClearBtn: document.getElementById("scrapeClear"),
  saveStatus: document.getElementById("saveStatus"),
  refreshMatchedBtn: document.getElementById("refreshMatched"),
  matchedJobsList: document.getElementById("matchedJobsList"),
  matchedEmpty: document.getElementById("matchedEmpty"),
  openJobManagerBtn: document.getElementById("openJobManager"),
  refreshMyJobsBtn: document.getElementById("refreshMyJobs"),
  showAppliedJobsBtn: document.getElementById("showAppliedJobs"),
  myJobsList: document.getElementById("myJobsList"),
  myJobsEmpty: document.getElementById("myJobsEmpty"),
  applySummary: document.getElementById("applySummary"),
  referrerPanel: document.getElementById("referrerPanel"),
  referrerTitle: document.getElementById("referrerTitle"),
  referrerStatus: document.getElementById("referrerStatus"),
  referrerGroups: document.getElementById("referrerGroups"),
  scrapeContactsBtn: document.getElementById("scrapeContacts"),
  contactsList: document.getElementById("contactsList"),
  contactsEmpty: document.getElementById("contactsEmpty"),
  contactsStatus: document.getElementById("contactsStatus"),
  dryRun: document.getElementById("dryRun"),
  autoAutofill: document.getElementById("autoAutofill"),
  toggleRunnerBtn: document.getElementById("toggleRunner"),
  saveSessionStateBtn: document.getElementById("saveSessionState"),
  runnerIndicator: document.getElementById("runnerIndicator"),
  runnerStatusText: document.getElementById("runnerStatusText"),
  settingsStatus: document.getElementById("settingsStatus"),
  orchestrateAll: document.getElementById("orchestrateAll"),
};

// Job board detection
const JOB_BOARDS = {
  linkedin: { name: "LinkedIn", patterns: ["linkedin.com/jobs", "linkedin.com/job"], color: "#0a66c2" },
  indeed: { name: "Indeed", patterns: ["indeed.com/viewjob", "indeed.com/jobs"], color: "#2164f3" },
  glassdoor: { name: "Glassdoor", patterns: ["glassdoor.com/job-listing", "glassdoor.com/Job"], color: "#0caa41" },
  greenhouse: { name: "Greenhouse", patterns: ["greenhouse.io", "boards.greenhouse.io"], color: "#3ab549" },
  workday: { name: "Workday", patterns: ["myworkdayjobs.com", "workday.com"], color: "#005cb9" },
  lever: { name: "Lever", patterns: ["lever.co", "jobs.lever.co"], color: "#1a1a1a" },
  dice: { name: "Dice", patterns: ["dice.com/job-detail"], color: "#eb1c26" },
  ziprecruiter: { name: "ZipRecruiter", patterns: ["ziprecruiter.com/jobs"], color: "#50b848" },
};

// ─── Utility Functions ────────────────────────────────────────

function setStatus(element, message, type = "info") {
  element.textContent = message;
  element.className = `status visible ${type}`;
  if (type === "success" || type === "info") {
    setTimeout(() => element.classList.remove("visible"), 5000);
  }
}

function normalizeUrl(url) { return (url || "").replace(/\/+$/, ""); }
function isValidUrl(url) { return /^https?:\/\//i.test(url); }

function setApiBaseUrl(value) {
  const normalized = normalizeUrl(value || "");
  apiBaseUrl = isValidUrl(normalized) ? normalized : DEFAULT_API_BASE_URL;
  return apiBaseUrl;
}

function detectJobBoard(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const [key, board] of Object.entries(JOB_BOARDS)) {
    for (const pattern of board.patterns) {
      if (lower.includes(pattern)) return { key, ...board };
    }
  }
  return null;
}

function getApiBaseUrl() {
  return normalizeUrl(apiBaseUrl || DEFAULT_API_BASE_URL);
}

function extVersion() {
  return chrome.runtime?.getManifest?.().version ?? "";
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "x-runner": "extension",
    "x-ext-version": extVersion(),
  };
}

function getManualHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "x-ext-version": extVersion(),
  };
}

// Semver-ish compare: returns true when `current` is older than `minimum`.
function isVersionOutdated(current, minimum) {
  if (!minimum) return false;
  const toParts = (v) => String(v || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const c = toParts(current);
  const m = toParts(minimum);
  for (let i = 0; i < Math.max(c.length, m.length); i += 1) {
    const a = c[i] ?? 0;
    const b = m[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

function mapSameSite(value) {
  switch ((value || "").toLowerCase()) {
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

// ─── Auth Functions ───────────────────────────────────────────

async function connect() {
  const apiBaseUrl = getApiBaseUrl();
  const amCode = els.amCodeInput.value.trim().toUpperCase();

  if (!amCode) {
    setStatus(els.authStatus, "Please enter your AM code.", "error");
    return;
  }

  setStatus(els.authStatus, "Connecting...", "info");
  els.connectBtn.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ am_code: amCode }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(els.authStatus, data.error || `Connection failed (${response.status})`, "error");
      return;
    }

    const data = await response.json();
    authToken = data.token;
    amInfo = data.account_manager;

    await chrome.storage.local.set({
      [STORAGE_KEYS.authToken]: authToken,
      [STORAGE_KEYS.amInfo]: amInfo,
      [STORAGE_KEYS.apiBaseUrl]: apiBaseUrl,
    });

    showConnectedUI();
    loadSeekers();
  } catch (error) {
    setStatus(els.authStatus, "Network error: " + error.message, "error");
  } finally {
    els.connectBtn.disabled = false;
  }
}

async function disconnect() {
  const apiBaseUrl = getApiBaseUrl();
  try {
    if (authToken && apiBaseUrl) {
      await fetch(`${apiBaseUrl}/api/extension/auth`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  } catch (e) { /* ignore */ }

  authToken = null;
  amInfo = null;
  activeSeekerId = null;

  await chrome.storage.local.remove([
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.amInfo,
    STORAGE_KEYS.activeSeekerId,
    STORAGE_KEYS.runnerEnabled,
  ]);

  showDisconnectedUI();
}

async function verifySession() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return false;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) { await disconnect(); return false; }
    const data = await response.json();
    amInfo = data.account_manager;
    await chrome.storage.local.set({ [STORAGE_KEYS.amInfo]: amInfo });
    maybeShowUpdateBanner(data.min_extension_version);
    return true;
  } catch { return false; }
}

function maybeShowUpdateBanner(minVersion) {
  const banner = document.getElementById("updateBanner");
  if (!banner) return;
  banner.classList.toggle("hidden", !isVersionOutdated(extVersion(), minVersion));
}

// ─── UI State Management ──────────────────────────────────────

function showConnectedUI() {
  els.authGate.classList.add("hidden");
  els.mainApp.classList.remove("hidden");
  els.connectionBadge.classList.remove("disconnected");
  els.connectionText.textContent = "Connected";

  if (amInfo) {
    const initial = (amInfo.name || amInfo.email || "?")[0].toUpperCase();
    els.amAvatar.textContent = initial;
    els.amName.textContent = amInfo.name || "Account Manager";
    els.amEmailDisplay.textContent = amInfo.email || "";
  }
}

function showDisconnectedUI() {
  els.authGate.classList.remove("hidden");
  els.mainApp.classList.add("hidden");
  els.connectionBadge.classList.add("disconnected");
  els.connectionText.textContent = "Not Connected";
}

// ─── Seeker Management ────────────────────────────────────────

async function loadSeekers() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/seekers`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;

    const data = await response.json();
    const seekers = data.seekers || [];
    cachedSeekers = seekers; // cache for autofill modal

    els.seekerSelect.innerHTML = '<option value="">-- Select Job Seeker --</option>';
    seekers.forEach((s) => {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = `${s.full_name || s.email} ${s.location ? "(" + s.location + ")" : ""}`;
      els.seekerSelect.appendChild(option);
    });

    if (activeSeekerId) {
      els.seekerSelect.value = activeSeekerId;
    } else if (data.active_job_seeker_id) {
      els.seekerSelect.value = data.active_job_seeker_id;
      activeSeekerId = data.active_job_seeker_id;
    }
  } catch (e) { console.error("Failed to load seekers:", e); }

  // Cockpit is the default tab — populate it once we're connected.
  loadCockpit();
  // Reveal + populate the Admin tab if this AM is an admin (probe decides).
  loadAdminOverview();
}

async function setActiveSeeker(seekerId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !seekerId) return;

  activeSeekerId = seekerId;
  await chrome.storage.local.set({ [STORAGE_KEYS.activeSeekerId]: seekerId });

  try {
    await fetch(`${apiBaseUrl}/api/extension/seekers`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ job_seeker_id: seekerId }),
    });
  } catch (e) { console.error("Failed to set active seeker:", e); }
}

// ─── Cockpit: AM triage board across all assigned seekers ─────

function renderCockpitEmpty(message) {
  if (els.cockpitTotals) els.cockpitTotals.classList.add("hidden");
  if (els.cockpitList) {
    els.cockpitList.innerHTML =
      `<div class="empty-state"><div>${sanitizeText(message)}</div></div>`;
  }
}

function cockpitTotalTile(kind, num, label) {
  const tile = document.createElement("div");
  tile.className = `cockpit-total ${kind}`;
  const n = document.createElement("div");
  n.className = "num";
  n.textContent = String(num ?? 0);
  const l = document.createElement("div");
  l.className = "lbl";
  l.textContent = label;
  tile.appendChild(n);
  tile.appendChild(l);
  return tile;
}

function cockpitRow(seeker) {
  const needsAttn = seeker.needs_attention || 0;
  const queued = seeker.pending_queue || 0;
  const matches = seeker.new_matches || 0;

  const priorityClass =
    needsAttn > 0 ? "p-attn" : queued > 0 ? "p-queue" : matches > 0 ? "p-matches" : "p-idle";

  const row = document.createElement("div");
  row.className = `cockpit-row ${priorityClass}`;

  const main = document.createElement("div");
  main.className = "cockpit-row-main";

  const name = document.createElement("div");
  name.className = "cockpit-name";
  name.textContent = seeker.name || "Seeker";
  name.title = seeker.name || "";
  main.appendChild(name);

  const chips = document.createElement("div");
  chips.className = "cockpit-chips";
  const addChip = (cls, text) => {
    const c = document.createElement("span");
    c.className = `ck-chip ${cls}`;
    c.textContent = text;
    chips.appendChild(c);
  };
  if (needsAttn > 0) addChip("attn", `⚠ ${needsAttn} attention`);
  if (queued > 0) addChip("queue", `⏳ ${queued} queued`);
  if (matches > 0) addChip("matches", `✨ ${matches} new`);
  if (needsAttn === 0 && queued === 0 && matches === 0) addChip("idle", "All clear");
  main.appendChild(chips);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:none";

  // One-click: queue this seeker's new matches for the runner without drilling in.
  if (matches > 0) {
    const queueBtn = document.createElement("button");
    queueBtn.className = "btn btn-secondary btn-sm cockpit-work";
    queueBtn.textContent = `Queue ${matches}`;
    queueBtn.title = "Queue this seeker's new matches for the auto-apply runner";
    queueBtn.addEventListener("click", () => onQueueSeekerMatches(seeker, queueBtn));
    actions.appendChild(queueBtn);
  }

  const work = document.createElement("button");
  work.className = "btn btn-primary btn-sm cockpit-work";
  work.textContent = needsAttn > 0 || queued > 0 || matches > 0 ? "Work" : "Open";
  work.addEventListener("click", () => onWorkSeeker(seeker));
  actions.appendChild(work);

  row.appendChild(main);
  row.appendChild(actions);
  return row;
}

function renderCockpit(data) {
  const seekers = Array.isArray(data?.seekers) ? data.seekers : [];
  const totals = data?.totals || { needs_attention: 0, pending_queue: 0, new_matches: 0 };

  if (els.cockpitTotals) {
    els.cockpitTotals.innerHTML = "";
    els.cockpitTotals.classList.remove("hidden");
    els.cockpitTotals.appendChild(cockpitTotalTile("attn", totals.needs_attention, "Attention"));
    els.cockpitTotals.appendChild(cockpitTotalTile("queue", totals.pending_queue, "Queued"));
    els.cockpitTotals.appendChild(cockpitTotalTile("matches", totals.new_matches, "New"));
  }

  if (seekers.length === 0) {
    renderCockpitEmpty("No seekers assigned to you yet.");
    return;
  }

  els.cockpitList.innerHTML = "";
  for (const seeker of seekers) {
    els.cockpitList.appendChild(cockpitRow(seeker));
  }
}

async function loadCockpit() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;
  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/cockpit`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      renderCockpitEmpty("Couldn't load your work board.");
      return;
    }
    renderCockpit(await response.json());
  } catch (e) {
    console.error("Failed to load cockpit:", e);
    renderCockpitEmpty("Couldn't load your work board.");
  }
}

// Queue every not-yet-actioned match for the CURRENT active seeker. Returns the
// number queued. Mirrors window.queueAllJobs but returns a count and doesn't
// touch the Matches/Apply panels (the cockpit refreshes itself instead).
async function queueActiveSeekerMatches() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return 0;
  const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) return 0;
  const data = await response.json();
  const jobs = (data.jobs || []).filter((j) => !j.queue_status && !j.queue_blocked);
  let queued = 0;
  for (const job of jobs) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ job_post_id: job.id }),
      });
      if (res.ok) queued++;
    } catch (e) {
      console.error("Cockpit queue error:", e);
    }
  }
  return queued;
}

// Cockpit quick action: make the seeker active and queue their new matches, then
// refresh the board so the counts move from "new" to "queued".
async function onQueueSeekerMatches(seeker, btn) {
  btn.disabled = true;
  btn.textContent = "Queuing…";
  try {
    await setActiveSeeker(seeker.id);
    if (els.seekerSelect) els.seekerSelect.value = seeker.id;
    const queued = await queueActiveSeekerMatches();
    btn.textContent = queued > 0 ? `Queued ${queued}` : "Nothing new";
    // Rebuilds the rows with fresh counts (this button instance is discarded).
    await loadCockpit();
  } catch (e) {
    console.error("Cockpit queue action failed:", e);
    btn.textContent = "Retry";
    btn.disabled = false;
  }
}

// Make a seeker active and jump to the tab that holds their most urgent work.
async function onWorkSeeker(seeker) {
  await setActiveSeeker(seeker.id);
  if (els.seekerSelect) els.seekerSelect.value = seeker.id;
  const dest =
    seeker.needs_attention > 0 || seeker.pending_queue > 0
      ? "apply"
      : seeker.new_matches > 0
      ? "matched"
      : "capture";
  activateTab(dest);
}

// Switch tabs programmatically (mirrors the tab click handler) and trigger the
// destination panel's loader.
function activateTab(targetId) {
  els.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === targetId));
  els.panels.forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById(`panel-${targetId}`);
  if (panel) panel.classList.add("active");
  if (targetId === "cockpit") loadCockpit();
  if (targetId === "matched") loadMatchedJobs();
  if (targetId === "apply") loadMyJobs();
  if (targetId === "contacts") loadContacts();
  if (targetId === "admin") loadAdminOverview();
}

// ─── Admin oversight (only for admin-role AMs) ────────────────

function killSwitchLabel(key) {
  if (key === "GLOBAL_APPLY") return "All applications (global)";
  if (key.startsWith("ATS:")) return key.slice(4);
  return key;
}

// Probe the admin overview. A 401/403 means this AM is not an admin, so the
// Admin tab stays hidden; success reveals + renders it.
async function loadAdminOverview() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;
  try {
    const res = await fetch(`${apiBaseUrl}/api/extension/admin/overview`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.status === 401 || res.status === 403) {
      if (els.adminTab) els.adminTab.classList.add("hidden");
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    if (els.adminTab) els.adminTab.classList.remove("hidden");
    renderAdminOverview(data);
  } catch (e) {
    console.error("Admin overview failed:", e);
  }
}

function renderAdminOverview(data) {
  // Kill switches
  const policies = Array.isArray(data.policies) ? data.policies : [];
  els.killSwitches.innerHTML = "";
  for (const p of policies) {
    const row = document.createElement("div");
    row.className = "ks-row";
    const lb = document.createElement("span");
    lb.className = "ks-label";
    lb.textContent = killSwitchLabel(p.key);
    const btn = document.createElement("button");
    btn.className = "ks-toggle " + (p.enabled ? "ks-on" : "ks-off");
    btn.textContent = p.enabled ? "On" : "Halted";
    btn.addEventListener("click", () => toggleKillSwitch(p.key, !p.enabled, btn));
    row.appendChild(lb);
    row.appendChild(btn);
    els.killSwitches.appendChild(row);
  }

  // Adapter health
  const health = Array.isArray(data.adapter_health) ? data.adapter_health : [];
  els.adapterHealth.innerHTML = "";
  if (health.length === 0) {
    els.adapterHealth.innerHTML =
      '<div class="empty-state" style="padding:8px">No adapter events in the last 7 days.</div>';
  }
  for (const h of health) {
    const row = document.createElement("div");
    row.className = "health-row";
    const name = document.createElement("span");
    name.className = "health-name";
    name.textContent = h.ats_type;
    const rate = document.createElement("span");
    const cls =
      h.status === "healthy" ? "h-healthy" : h.status === "degraded" ? "h-degraded" : "h-down";
    rate.className = "health-rate " + cls;
    rate.textContent = `${h.success_rate}% · ${h.status} (${h.total_runs})`;
    row.appendChild(name);
    row.appendChild(rate);
    els.adapterHealth.appendChild(row);
  }

  // QA queue
  const qa = Number(data.qa_pending || 0);
  els.qaPending.textContent =
    qa > 0
      ? `${qa} review${qa === 1 ? "" : "s"} pending — review in the dashboard QA queue.`
      : "No pending QA reviews.";
}

// Toggle a switch. Halting (disabling) requires a confirming second click so a
// misclick can't stop all applications — and avoids a native confirm() dialog,
// which can close the popup.
async function toggleKillSwitch(key, enabled, btn) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  if (!enabled && !btn.dataset.confirm) {
    btn.dataset.confirm = "1";
    btn.className = "ks-toggle ks-confirm";
    btn.textContent = "Confirm halt";
    setTimeout(() => {
      if (btn.dataset.confirm) {
        delete btn.dataset.confirm;
        btn.className = "ks-toggle ks-on";
        btn.textContent = "On";
      }
    }, 3000);
    return;
  }
  delete btn.dataset.confirm;

  btn.disabled = true;
  btn.textContent = "…";
  try {
    const res = await fetch(`${apiBaseUrl}/api/extension/admin/kill-switch`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ key, enabled }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(els.adminStatus, body.error || "Failed to update switch.", "error");
      btn.disabled = false;
      return;
    }
    setStatus(
      els.adminStatus,
      enabled ? `Re-enabled ${killSwitchLabel(key)}.` : `Halted ${killSwitchLabel(key)}.`,
      enabled ? "success" : "info"
    );
    await loadAdminOverview();
  } catch (e) {
    console.error("Kill-switch toggle failed:", e);
    setStatus(els.adminStatus, "Failed to update switch.", "error");
    btn.disabled = false;
  }
}

// ─── Matched Jobs ─────────────────────────────────────────────

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAttentionReason(reason) {
  if (!reason) return "Needs attention";
  return String(reason)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function triggerRunnerNow() {
  await chrome.storage.local.set({ [STORAGE_KEYS.runnerEnabled]: true });
  chrome.runtime.sendMessage({ type: "RUNNER_TOGGLE", enabled: true });
  chrome.runtime.sendMessage({ type: "RUNNER_RUN_NOW" });
  updateRunnerUI(true);
}

function renderMatchedJobCard(job, options = {}) {
  const numericScore = Number(job.score);
  const hasScore = Number.isFinite(numericScore) && numericScore >= 0;
  const scoreClass = hasScore
    ? (numericScore >= 80 ? "high" : numericScore >= 60 ? "medium" : "low")
    : "low";
  const cardClass = job.needs_attention
    ? "score-medium"
    : (hasScore ? (numericScore >= 80 ? "score-high" : numericScore >= 60 ? "score-medium" : "score-low") : "score-low");
  const recLabel = job.recommendation === "strong_match"
    ? "Strong"
    : job.recommendation === "good_match"
      ? "Good"
      : job.recommendation
        ? "Fair"
        : "Unrated";
  const recColor = job.recommendation === "strong_match"
    ? "#166534"
    : job.recommendation === "good_match"
      ? "#1e40af"
      : "#92400e";
  const scoreLabel = hasScore ? `${Math.round(numericScore)}%` : "--";
  const summaryItems = Array.isArray(job.score_summary) ? job.score_summary.slice(0, 2) : [];
  const blockerItems = Array.isArray(job.score_blockers) ? job.score_blockers.slice(0, 2) : [];
  const laneBadge = options.adjacent
    ? '<span style="font-size:8px;padding:1px 4px;background:#fef3c7;border-radius:3px;color:#92400e">Adjacent</span>'
    : "";

  let actionHtml;
  if (job.queue_status === "NEEDS_ATTENTION") {
    if (job.run_id) {
      actionHtml = `<div style="display:flex;gap:4px;align-items:center"><span class="queue-badge" style="background:#fff7ed;color:#9a3412">Needs Attention</span><button class="btn btn-secondary btn-sm" onclick="resumeJob('${job.run_id}', '${encodeURIComponent(job.url || "")}')" style="width:auto;padding:3px 8px;font-size:9px">Resume</button></div>`;
    } else {
      actionHtml = '<span class="queue-badge" style="background:#fff7ed;color:#9a3412">Needs Attention</span>';
    }
  } else if (job.queue_status === "APPLIED" || job.queue_status === "COMPLETED") {
    actionHtml = '<span class="queue-badge" style="background:#dcfce7;color:#166534">Applied</span>';
  } else if (job.queue_status === "RUNNING") {
    actionHtml = '<span class="queue-badge" style="background:#dbeafe;color:#1e40af">Running</span>';
  } else if (job.queue_status === "QUEUED" || job.queue_status === "READY" || job.queue_status === "RETRYING") {
    const eTitle = encodeURIComponent(job.title || "");
    const eCo = encodeURIComponent(job.company || "");
    const eLoc = encodeURIComponent(job.location || "");
    actionHtml = `<div style="display:flex;gap:4px;align-items:center"><span class="queue-badge">${job.queue_status}</span><button class="btn btn-apply btn-sm" onclick="applyJob('${job.id}','${eTitle}','${eCo}','${eLoc}')" style="width:auto;padding:3px 8px;font-size:9px">Apply</button></div>`;
  } else if (job.queue_status) {
    actionHtml = `<span class="queue-badge">${job.queue_status}</span>`;
  } else if (job.queue_blocked) {
    actionHtml = `<span class="queue-badge" style="background:#fee2e2;color:#991b1b" title="${sanitizeText(job.queue_block_reason || "Blocked from queueing")}">Blocked</span>`;
  } else {
    const eTitle = encodeURIComponent(job.title || "");
    const eCo = encodeURIComponent(job.company || "");
    const eLoc = encodeURIComponent(job.location || "");
    actionHtml = `<div style="display:flex;gap:4px"><button class="btn btn-secondary btn-sm" onclick="queueJob('${job.id}')" style="width:auto;padding:3px 8px;font-size:9px">Queue</button><button class="btn btn-apply btn-sm" onclick="applyJob('${job.id}','${eTitle}','${eCo}','${eLoc}')" style="width:auto;padding:3px 8px;font-size:9px">Apply</button></div>`;
  }

  const attentionReason = job.needs_attention_reason
    ? `<div style="font-size:9px;color:#9a3412;margin-top:4px">Reason: ${sanitizeText(formatAttentionReason(job.needs_attention_reason))}</div>`
    : "";
  const attentionError = job.last_error
    ? `<div style="font-size:9px;color:#92400e;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${sanitizeText(job.last_error)}">${sanitizeText(job.last_error)}</div>`
    : "";
  const summaryHtml = summaryItems.length > 0
    ? `<div style="margin-top:4px;display:flex;flex-direction:column;gap:2px">${summaryItems.map((item) => `<div style="font-size:9px;color:#4b5563">${sanitizeText(item)}</div>`).join("")}</div>`
    : "";
  const blockerHtml = blockerItems.length > 0
    ? `<div style="margin-top:4px;display:flex;flex-direction:column;gap:2px">${blockerItems.map((item) => `<div style="font-size:9px;color:#b45309">${sanitizeText(item)}</div>`).join("")}</div>`
    : "";
  const queueBlockHtml = job.queue_blocked && !job.queue_status && job.queue_block_reason
    ? `<div style="font-size:9px;color:#991b1b;margin-top:4px">${sanitizeText(job.queue_block_reason)}</div>`
    : "";
  const adjacentReasonHtml = options.adjacent && job.adjacent_reason
    ? `<div style="font-size:9px;color:#92400e;margin-top:4px">${sanitizeText(job.adjacent_reason)}</div>`
    : "";

  return `
    <div class="job-card ${cardClass}">
      <div class="title" title="${sanitizeText(job.title)}">
        <a href="${sanitizeText(job.url)}" target="_blank" style="color:inherit;text-decoration:none">${sanitizeText(job.title)}</a>
      </div>
      <div class="meta">${sanitizeText(job.company || "Unknown")} ${job.location ? " - " + sanitizeText(job.location) : ""}</div>
      <div style="display:flex;gap:4px;margin-top:2px;flex-wrap:wrap">
        ${job.work_type ? `<span style="font-size:8px;padding:1px 4px;background:#f3f4f6;border-radius:3px;color:#6b7280;text-transform:capitalize">${sanitizeText(job.work_type)}</span>` : ""}
        <span style="font-size:8px;padding:1px 4px;background:#ede9fe;border-radius:3px;color:${recColor}">${recLabel}</span>
        ${job.confidence === "high" ? '<span style="font-size:8px;padding:1px 4px;background:#dbeafe;border-radius:3px;color:#1e40af">High Conf.</span>' : ""}
        ${laneBadge}
      </div>
      ${adjacentReasonHtml}
      ${summaryHtml}
      ${blockerHtml}
      ${queueBlockHtml}
      ${job.queue_status === "NEEDS_ATTENTION" ? attentionReason + attentionError : ""}
      <div class="bottom">
        <span class="score-badge ${scoreClass}">${scoreLabel}</span>
        ${actionHtml}
      </div>
    </div>`;
}

async function loadMatchedJobs() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    els.matchedEmpty.style.display = "block";
    return;
  }

  els.matchedEmpty.style.display = "none";
  els.matchedJobsList.innerHTML = '<div style="text-align:center;padding:10px;font-size:11px;color:#6b7280">Loading matched jobs...</div>';

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      els.matchedJobsList.innerHTML = '<div class="empty-state">Failed to load matched jobs.</div>';
      return;
    }

    const data = await response.json();
    const jobs = data.jobs || [];
    const adjacentJobs = data.adjacent_jobs || [];
    const threshold = data.threshold || 50;
    const attentionJobs = jobs.filter((j) => j.needs_attention || j.queue_status === "NEEDS_ATTENTION");

    if (jobs.length === 0 && adjacentJobs.length === 0) {
      els.matchedJobsList.innerHTML = `
        <div class="empty-state">
          <div>No matched jobs above ${threshold}% threshold.</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:4px">Scrape jobs or ask your AM to adjust the threshold.</div>
        </div>`;
      return;
    }

    const queueableJobs = jobs.filter((j) => !j.queue_status && !j.queue_blocked);
    const applyableJobs = jobs.filter(
      (j) =>
        (!j.queue_status && !j.queue_blocked) ||
        ["QUEUED", "READY", "RETRYING"].includes(j.queue_status)
    );
    const resumableAttentionJobs = attentionJobs.filter((j) => !!j.run_id);

    const headerHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:#f0fdf4;border-radius:6px;margin-bottom:6px">
        <span style="font-size:10px;color:#166534">${jobs.length} matched jobs tracked (${attentionJobs.length} need attention${adjacentJobs.length ? `, ${adjacentJobs.length} adjacent to review` : ""})</span>
        <div style="display:flex;gap:4px">
          ${queueableJobs.length > 0 ? `<button class="btn btn-secondary btn-sm" onclick="queueAllJobs()" style="width:auto;padding:2px 8px;font-size:9px">Queue All (${queueableJobs.length})</button>` : ""}
          ${applyableJobs.length > 0 ? `<button class="btn btn-apply btn-sm" onclick="applyAllJobs()" style="width:auto;padding:2px 8px;font-size:9px">Apply All (${applyableJobs.length})</button>` : ""}
          ${resumableAttentionJobs.length > 1 ? `<button class="btn btn-secondary btn-sm" onclick="resumeAllAttention()" style="width:auto;padding:2px 8px;font-size:9px">Resume Attention (${resumableAttentionJobs.length})</button>` : ""}
        </div>
      </div>`;

    const primarySectionHtml = jobs.length > 0
      ? jobs.map((job) => renderMatchedJobCard(job)).join("")
      : `
        <div class="empty-state" style="margin-bottom:8px">
          <div>No jobs cleared the ${threshold}% threshold right now.</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:4px">Review the adjacent opportunities below instead of lowering the threshold blindly.</div>
        </div>`;
    const adjacentSectionHtml = adjacentJobs.length > 0
      ? `
        <div style="margin-top:8px;padding:6px 8px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
          <div style="font-size:10px;font-weight:600;color:#92400e">Adjacent opportunities</div>
          <div style="font-size:9px;color:#a16207;margin-top:2px">These did not clear the main threshold, but they still show strong underlying fit. Review them manually before queueing.</div>
        </div>
        ${adjacentJobs.map((job) => renderMatchedJobCard(job, { adjacent: true })).join("")}
      `
      : "";

    els.matchedJobsList.innerHTML = headerHtml + primarySectionHtml + adjacentSectionHtml;
  } catch (error) {
    els.matchedJobsList.innerHTML = '<div class="empty-state">Error loading jobs.</div>';
    console.error("Matched jobs error:", error);
  }
}

function formatRunStatus(status) {
  return String(status || "UNKNOWN")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusStyle(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "NEEDS_ATTENTION") {
    return "background:#fff7ed;color:#9a3412";
  }
  if (normalized === "APPLIED" || normalized === "COMPLETED") {
    return "background:#dcfce7;color:#166534";
  }
  if (normalized === "RUNNING") {
    return "background:#dbeafe;color:#1e40af";
  }
  if (normalized === "READY" || normalized === "RETRYING" || normalized === "QUEUED") {
    return "background:#ede9fe;color:#4338ca";
  }
  if (normalized === "FAILED" || normalized === "CANCELLED") {
    return "background:#fee2e2;color:#991b1b";
  }
  return "background:#f3f4f6;color:#4b5563";
}

function renderReferrerGroup(label, rows) {
  if (!rows || rows.length === 0) {
    return `
      <div class="ref-group">
        <div class="ref-group-title">${label}</div>
        <div class="ref-item">
          <div class="ref-item-meta">No contacts found yet.</div>
        </div>
      </div>
    `;
  }

  const items = rows
    .map((row) => {
      const name = row.full_name || row.role || "Contact";
      const role = row.role || "Referral contact";
      const email = row.email ? `<div class="ref-item-email">${sanitizeText(row.email)}</div>` : "";
      const source = row.source ? `<div class="ref-item-meta">Source: ${sanitizeText(row.source)}</div>` : "";
      return `
        <div class="ref-item">
          <div class="ref-item-name">${sanitizeText(name)}</div>
          <div class="ref-item-meta">${sanitizeText(role)}</div>
          ${email}
          ${source}
        </div>
      `;
    })
    .join("");

  return `
    <div class="ref-group">
      <div class="ref-group-title">${label}</div>
      ${items}
    </div>
  `;
}

function updateApplySummary(items) {
  if (!els.applySummary) return;
  if (!Array.isArray(items) || items.length === 0) {
    els.applySummary.textContent = "";
    return;
  }
  let applied = 0;
  let needsYou = 0;
  let inQueue = 0;
  let running = 0;
  for (const item of items) {
    const s = String(item.run_status || item.queue_status || "").toUpperCase();
    if (["APPLIED", "COMPLETED", "SUBMITTED"].includes(s)) applied += 1;
    else if (s === "NEEDS_ATTENTION") needsYou += 1;
    else if (s === "RUNNING") running += 1;
    else if (["QUEUED", "READY", "RETRYING"].includes(s)) inQueue += 1;
  }
  const parts = [];
  if (inQueue) parts.push(`${inQueue} in queue`);
  if (running) parts.push(`${running} running`);
  if (needsYou) parts.push(`${needsYou} need you`);
  if (includeAppliedJobs && applied) parts.push(`${applied} applied`);
  els.applySummary.textContent = parts.join("  ·  ");
}

async function loadMyJobs() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    if (els.applySummary) els.applySummary.textContent = "";
    if (els.myJobsEmpty) {
      els.myJobsEmpty.style.display = "block";
    }
    if (els.myJobsList) {
      els.myJobsList.innerHTML = `
        <div class="empty-state" id="myJobsEmpty">
          <div>Select a job seeker to view queued/running jobs.</div>
        </div>
      `;
    }
    return;
  }

  if (els.referrerPanel) {
    els.referrerPanel.classList.add("hidden");
  }

  if (els.showAppliedJobsBtn) {
    els.showAppliedJobsBtn.textContent = includeAppliedJobs
      ? "Hide Applied"
      : "Show Applied";
  }

  if (els.myJobsList) {
    els.myJobsList.innerHTML =
      '<div style="text-align:center;padding:10px;font-size:11px;color:#6b7280">Loading jobs...</div>';
  }

  try {
    const query = includeAppliedJobs ? "?include_applied=true" : "";
    const response = await fetch(`${apiBaseUrl}/api/extension/my-jobs${query}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) {
      if (els.myJobsList) {
        els.myJobsList.innerHTML =
          '<div class="empty-state"><div>Failed to load jobs.</div></div>';
      }
      return;
    }

    const data = await response.json();
    const items = data.items || [];
    updateApplySummary(items);

    if (items.length === 0) {
      if (els.myJobsList) {
        els.myJobsList.innerHTML = `
          <div class="empty-state">
            <div>No jobs found in your pipeline.</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:4px">Queue jobs from Matched, then run/apply from here.</div>
          </div>
        `;
      }
      return;
    }

    const html = items
      .map((item) => {
        const status = item.run_status || item.queue_status || "UNKNOWN";
        const statusStyle = getStatusStyle(status);
        const score = Number.isFinite(Number(item.score))
          ? `${Math.round(Number(item.score))}%`
          : "--";
        const canResume =
          status === "NEEDS_ATTENTION" && !!item.run_id;
        const canApply =
          ["QUEUED", "READY", "RETRYING", "RUNNING"].includes(status);
        const canMarkApplied =
          !!item.run_id && !["APPLIED", "COMPLETED"].includes(status);

        const reasonHtml = item.needs_attention_reason
          ? `<div style="font-size:9px;color:#9a3412;margin-top:4px">Reason: ${sanitizeText(formatAttentionReason(item.needs_attention_reason))}</div>`
          : "";
        const errorHtml = item.last_error
          ? `<div style="font-size:9px;color:#92400e;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${sanitizeText(item.last_error)}">${sanitizeText(item.last_error)}</div>`
          : "";

        const encodedUrl     = encodeURIComponent(item.job?.url      || "");
        const encodedCompany = encodeURIComponent(item.job?.company  || "");
        const encodedTitle   = encodeURIComponent(item.job?.title    || "");
        const encodedLoc     = encodeURIComponent(item.job?.location || "");

        return `
          <div class="job-card ${item.needs_attention ? "score-medium" : "score-low"}">
            <div class="title" title="${sanitizeText(item.job?.title || "Untitled")}">
              <a href="${sanitizeText(item.job?.url || "#")}" target="_blank" style="color:inherit;text-decoration:none">${sanitizeText(item.job?.title || "Untitled")}</a>
            </div>
            <div class="meta">${sanitizeText(item.job?.company || "Unknown")} ${item.job?.location ? " - " + sanitizeText(item.job.location) : ""}</div>
            <div style="display:flex;gap:4px;align-items:center;margin:4px 0 2px">
              <span class="queue-badge" style="${statusStyle}">${sanitizeText(formatRunStatus(status))}</span>
              <span class="score-badge low">${score}</span>
            </div>
            ${reasonHtml}
            ${errorHtml}
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
              <button class="btn btn-secondary btn-sm" onclick="openJobLink('${encodedUrl}')" style="width:auto;padding:3px 8px;font-size:9px">Open</button>
              ${canApply ? `<button class="btn btn-apply btn-sm" onclick="applyJob('${item.job?.id}','${encodedTitle}','${encodedCompany}','${encodedLoc}')" style="width:auto;padding:3px 8px;font-size:9px">Apply</button>` : ""}
              ${canResume ? `<button class="btn btn-secondary btn-sm" onclick="resumeJob('${item.run_id}', '${encodedUrl}')" style="width:auto;padding:3px 8px;font-size:9px">Resume</button>` : ""}
              ${canMarkApplied ? `<button class="btn btn-secondary btn-sm" onclick="markJobApplied('${item.run_id}')" style="width:auto;padding:3px 8px;font-size:9px">Mark Applied</button>` : ""}
              <button class="btn btn-secondary btn-sm" onclick="findReferrers('${item.job?.id}', '${encodedCompany}', '${encodedTitle}')" style="width:auto;padding:3px 8px;font-size:9px">Find Referrers</button>
            </div>
          </div>
        `;
      })
      .join("");

    if (els.myJobsList) {
      els.myJobsList.innerHTML = html;
    }
  } catch (error) {
    if (els.myJobsList) {
      els.myJobsList.innerHTML =
        '<div class="empty-state"><div>Error loading My Jobs.</div></div>';
    }
    console.error("My jobs load error:", error);
  }
}

window.queueJob = async function (jobPostId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ job_post_id: jobPostId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(els.saveStatus, data.error || "Failed to queue job.", "error");
      return;
    }
    await Promise.all([loadMatchedJobs(), loadMyJobs()]);
  } catch (error) { console.error("Queue error:", error); }
};

window.queueAllJobs = async function () {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  // Re-fetch to get current list
  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const jobs = (data.jobs || []).filter((j) => !j.queue_status && !j.queue_blocked);

    let queued = 0;
    for (const job of jobs) {
      try {
        const res = await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ job_post_id: job.id }),
        });
        if (res.ok) queued++;
      } catch (e) { console.error("Queue error:", e); }
    }

    await Promise.all([loadMatchedJobs(), loadMyJobs()]);
  } catch (error) { console.error("Queue all error:", error); }
};

// ─── Autofill Modal ───────────────────────────────────────────

const modalEls = {
  overlay:        document.getElementById("autofillOverlay"),
  jobTitle:       document.getElementById("modalJobTitle"),
  jobMeta:        document.getElementById("modalJobMeta"),
  avatar:         document.getElementById("modalAvatar"),
  seekerName:     document.getElementById("modalSeekerName"),
  seekerEmail:    document.getElementById("modalSeekerEmail"),
  seekerLocation: document.getElementById("modalSeekerLocation"),
  confirmBtn:     document.getElementById("autofillConfirmBtn"),
  cancelBtn:      document.getElementById("autofillCancelBtn"),
  closeBtn:       document.getElementById("autofillCloseBtn"),
};

function showAutofillModal(jobPostId, encodedTitle, encodedCompany, encodedLocation) {
  const title    = encodedTitle    ? decodeURIComponent(encodedTitle)    : "Position";
  const company  = encodedCompany  ? decodeURIComponent(encodedCompany)  : "";
  const location = encodedLocation ? decodeURIComponent(encodedLocation) : "";

  pendingApplyJobId = jobPostId;

  // Job details
  modalEls.jobTitle.textContent = title;
  const meta = [company, location].filter(Boolean).join(" · ");
  modalEls.jobMeta.textContent = meta || "—";

  // Seeker profile
  const seeker = cachedSeekers.find((s) => s.id === activeSeekerId);
  if (seeker) {
    const name     = seeker.full_name || seeker.email || "Candidate";
    const initials = name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
    modalEls.avatar.textContent      = initials;
    modalEls.seekerName.textContent  = name;
    modalEls.seekerEmail.textContent = seeker.email || "";
    if (seeker.location) {
      modalEls.seekerLocation.textContent    = seeker.location;
      modalEls.seekerLocation.style.display  = "block";
    } else {
      modalEls.seekerLocation.style.display  = "none";
    }
  } else {
    modalEls.avatar.textContent      = "?";
    modalEls.seekerName.textContent  = "Job Seeker";
    modalEls.seekerEmail.textContent = "";
    modalEls.seekerLocation.style.display = "none";
  }

  modalEls.overlay.classList.remove("hidden");
}

function hideAutofillModal() {
  modalEls.overlay.classList.add("hidden");
  pendingApplyJobId = null;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function launchSpecificRun(runId, activateTab = true) {
  const response = await sendRuntimeMessage({
    type: "RUNNER_RUN_FOR_RUN_ID",
    runId,
    activateTab,
  });

  if (!response?.success) {
    throw new Error(response?.error || "Failed to launch autofill.");
  }

  return response;
}

async function startRunForQueue(queueId) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/apply/start`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ queue_id: queueId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to start run (${response.status}).`);
  }

  if (!data?.success) {
    if (data?.blocked && data?.reason === "MAX_CONCURRENCY") {
      throw new Error("Runner is at max concurrency. Try again in a moment.");
    }
    if (data?.blocked && data?.reason === "DUPLICATE_APPLICATION") {
      const job = data.duplicate_job;
      throw new Error(
        job?.company
          ? `Already applied to ${job.company} — ${job.title ?? "same role"} recently. Skipped to avoid a duplicate.`
          : "Already applied to this job recently. Skipped to avoid a duplicate."
      );
    }
    if (data?.blocked) {
      throw new Error(`Blocked: ${data.reason ?? "policy limit"}.`);
    }
    throw new Error(data?.error || "Failed to start run.");
  }

  if (!data.run_id) {
    throw new Error("Run started without a run ID.");
  }

  return data;
}

async function queueAndResolveRun(jobPostId) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ job_post_id: jobPostId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to queue job (${response.status}).`);
  }

  const status = String(data?.status || "").toUpperCase();
  if (["APPLIED", "COMPLETED"].includes(status)) {
    return { runId: null, status };
  }

  if (data?.run_id) {
    return { runId: data.run_id, status };
  }

  if (!data?.queue_id) {
    throw new Error("Queue item was created without a queue ID.");
  }

  const started = await startRunForQueue(data.queue_id);
  return {
    runId: started.run_id,
    status: String(started.status || "READY").toUpperCase(),
    alreadyApplied: Boolean(started.already_applied),
  };
}

async function confirmAutofill() {
  if (!pendingApplyJobId) return;
  const jobId = pendingApplyJobId;

  modalEls.confirmBtn.disabled     = true;
  modalEls.confirmBtn.textContent  = "Starting…";

  hideAutofillModal();

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const resolved = await queueAndResolveRun(jobId);
    if (!resolved.runId || resolved.alreadyApplied || ["APPLIED", "COMPLETED", "SUBMITTED"].includes(resolved.status)) {
      setStatus(els.saveStatus, "This job is already marked applied.", "info");
      await Promise.all([loadMatchedJobs(), loadMyJobs()]);
      return;
    }

    if (resolved.status === "RUNNING") {
      setStatus(els.saveStatus, "This job is already running.", "info");
      await Promise.all([loadMatchedJobs(), loadMyJobs()]);
      return;
    }

    if (resolved.status === "NEEDS_ATTENTION") {
      setStatus(els.saveStatus, "This job needs attention. Use Resume instead.", "info");
      await Promise.all([loadMatchedJobs(), loadMyJobs()]);
      return;
    }

    await launchSpecificRun(resolved.runId, true);
    setStatus(els.saveStatus, "Opened tab and launched autofill.", "success");
    await Promise.all([loadMatchedJobs(), loadMyJobs()]);
  } catch (error) {
    setStatus(els.saveStatus, "Error: " + error.message, "error");
    console.error("Apply error:", error);
  } finally {
    modalEls.confirmBtn.disabled    = false;
    modalEls.confirmBtn.innerHTML   = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
      Autofill &amp; Apply`;
  }
}

// Modal event listeners
modalEls.confirmBtn.addEventListener("click", confirmAutofill);
modalEls.cancelBtn.addEventListener("click",  hideAutofillModal);
modalEls.closeBtn.addEventListener("click",   hideAutofillModal);
modalEls.overlay.addEventListener("click", (e) => {
  if (e.target === modalEls.overlay) hideAutofillModal();
});

// ─── Apply (now opens autofill modal) ────────────────────────

window.applyJob = async function (jobPostId, encodedTitle, encodedCompany, encodedLocation) {
  showAutofillModal(jobPostId, encodedTitle, encodedCompany, encodedLocation);
};

window.applyAllJobs = async function () {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const jobs = (data.jobs || []).filter(
      (j) =>
        (!j.queue_status && !j.queue_blocked) ||
        ["QUEUED", "READY", "RETRYING"].includes(j.queue_status)
    );

    // Queue all unqueued jobs
    for (const job of jobs) {
      if (!job.queue_status) {
        try {
          await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ job_post_id: job.id }),
          });
        } catch (e) { console.error("Queue error:", e); }
      }
    }

    await triggerRunnerNow();
    await Promise.all([loadMatchedJobs(), loadMyJobs()]);
  } catch (error) { console.error("Apply all error:", error); }
};


window.resumeJob = async function (runId, encodedJobUrl) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !runId) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/apply/resume`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ run_id: runId, note: "Resumed from extension." }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error("Resume error:", data.error || response.status);
      return;
    }

    await launchSpecificRun(runId, true);
    await Promise.all([loadMatchedJobs(), loadMyJobs()]);
  } catch (error) {
    console.error("Resume error:", error);
  }
};

window.resumeAllAttention = async function () {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const jobs = (data.jobs || []).filter(
      (job) => (job.needs_attention || job.queue_status === "NEEDS_ATTENTION") && job.run_id
    );

    for (const job of jobs) {
      try {
        await fetch(`${apiBaseUrl}/api/apply/resume`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ run_id: job.run_id, note: "Bulk resumed from extension." }),
        });
      } catch (error) {
        console.error("Bulk resume error:", error);
      }
    }

    if (jobs.length > 0) {
      await triggerRunnerNow();
    }
    await Promise.all([loadMatchedJobs(), loadMyJobs()]);
  } catch (error) {
    console.error("Resume all attention error:", error);
  }
};

// ─── Contact Scraping ─────────────────────────────────────────

window.openJobLink = function (encodedJobUrl) {
  const jobUrl = encodedJobUrl ? decodeURIComponent(encodedJobUrl) : "";
  if (!jobUrl || !/^https?:\/\//i.test(jobUrl)) {
    return;
  }
  chrome.tabs.create({ url: jobUrl, active: true }).catch((error) => {
    console.error("Open job link error:", error);
  });
};

window.markJobApplied = async function (runId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !runId) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/apply/complete`, {
      method: "POST",
      headers: getManualHeaders(),
      body: JSON.stringify({
        run_id: runId,
        note: "Marked applied manually from extension.",
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error("Mark applied error:", data.error || response.status);
      return;
    }

    await Promise.all([loadMyJobs(), loadMatchedJobs()]);
  } catch (error) {
    console.error("Mark applied error:", error);
  }
};

window.findReferrers = async function (jobPostId, encodedCompany, encodedTitle) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  const company = encodedCompany ? decodeURIComponent(encodedCompany) : "";
  const title = encodedTitle ? decodeURIComponent(encodedTitle) : "";

  if (els.referrerPanel) {
    els.referrerPanel.classList.remove("hidden");
  }
  if (els.referrerTitle) {
    els.referrerTitle.textContent = `Referrers${company ? ` - ${company}` : ""}`;
  }
  if (els.referrerStatus) {
    els.referrerStatus.textContent = "Searching contacts...";
  }
  if (els.referrerGroups) {
    els.referrerGroups.innerHTML = "";
  }

  try {
    const params = new URLSearchParams();
    if (jobPostId) params.set("job_post_id", jobPostId);
    if (company) params.set("company", company);

    const response = await fetch(
      `${apiBaseUrl}/api/extension/referrers?${params.toString()}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (!response.ok) {
      if (els.referrerStatus) {
        els.referrerStatus.textContent = "Failed to load referrers.";
      }
      return;
    }

    const data = await response.json();
    const groups = data.groups || {};
    const totals = data.totals || { all: 0 };

    if (els.referrerStatus) {
      els.referrerStatus.textContent = totals.all
        ? `${totals.all} contacts found${title ? ` for ${title}` : ""}.`
        : "No contacts found yet. Showing smart suggestions.";
    }

    if (els.referrerGroups) {
      els.referrerGroups.innerHTML = [
        renderReferrerGroup("Recruiters / HR", groups.hr || []),
        renderReferrerGroup("Management Team", groups.management || []),
        renderReferrerGroup("Peers", groups.peers || []),
      ].join("");
    }
  } catch (error) {
    if (els.referrerStatus) {
      els.referrerStatus.textContent = "Error loading referrers.";
    }
    console.error("Find referrers error:", error);
  }
};

async function loadContacts() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    els.contactsEmpty.style.display = "block";
    return;
  }

  els.contactsEmpty.style.display = "none";
  els.contactsList.innerHTML = '<div style="text-align:center;padding:10px;font-size:11px;color:#6b7280">Loading...</div>';

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/contacts`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      els.contactsList.innerHTML = '<div class="empty-state">Failed to load contacts.</div>';
      return;
    }

    const data = await response.json();
    const contacts = data.contacts || [];

    if (contacts.length === 0) {
      els.contactsList.innerHTML = '<div class="empty-state"><div>No contacts yet. Scrape a company page!</div></div>';
      return;
    }

    els.contactsList.innerHTML = contacts.map((c) => `
      <div class="contact-card">
        <div class="name">${c.full_name}</div>
        ${c.role ? `<div class="role">${c.role}</div>` : ""}
        ${c.company_name ? `<div class="company">${c.company_name}</div>` : ""}
        ${c.email ? `<div style="font-size:10px;color:#4f46e5;margin-top:2px">${c.email}</div>` : ""}
        ${c.linkedin_url ? `<div style="font-size:10px;color:#0a66c2;margin-top:2px">LinkedIn</div>` : ""}
      </div>
    `).join("");
  } catch (error) {
    els.contactsList.innerHTML = '<div class="empty-state">Error loading contacts.</div>';
  }
}

async function scrapePageContacts() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    setStatus(els.contactsStatus, "Select a job seeker first.", "error");
    return;
  }

  setStatus(els.contactsStatus, "Scraping contacts...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus(els.contactsStatus, "Unable to access current tab.", "error");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeContactsFromPage,
    });

    const contacts = results[0]?.result || [];
    if (contacts.length === 0) {
      setStatus(els.contactsStatus, "No contacts found on this page.", "info");
      return;
    }

    const response = await fetch(`${apiBaseUrl}/api/extension/contacts`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ contacts }),
    });

    if (response.ok) {
      const data = await response.json();
      setStatus(els.contactsStatus, `Saved ${data.saved} contacts!`, "success");
      loadContacts();
    } else {
      setStatus(els.contactsStatus, "Failed to save contacts.", "error");
    }
  } catch (error) {
    setStatus(els.contactsStatus, "Error: " + error.message, "error");
  }
}

function scrapeContactsFromPage() {
  const contacts = [];
  const url = window.location.href.toLowerCase();

  if (url.includes("linkedin.com")) {
    document.querySelectorAll(".org-people-profile-card, .artdeco-entity-lockup").forEach((card) => {
      const nameEl = card.querySelector(".org-people-profile-card__profile-title, .artdeco-entity-lockup__title");
      const roleEl = card.querySelector(".artdeco-entity-lockup__subtitle, .org-people-profile-card__profile-info");
      const linkEl = card.querySelector("a[href*='/in/']");
      if (nameEl) {
        contacts.push({
          full_name: nameEl.textContent.trim(),
          role: roleEl?.textContent.trim() || null,
          linkedin_url: linkEl?.href?.split("?")[0] || null,
          company_name: document.querySelector(".org-top-card-summary__title, h1")?.textContent?.trim() || null,
          source: "linkedin_company_page",
        });
      }
    });

    document.querySelectorAll(".reusable-search__result-container").forEach((card) => {
      const nameEl = card.querySelector(".entity-result__title-text a span[aria-hidden='true']");
      const roleEl = card.querySelector(".entity-result__primary-subtitle");
      const linkEl = card.querySelector("a[href*='/in/']");
      if (nameEl) {
        contacts.push({
          full_name: nameEl.textContent.trim(),
          role: roleEl?.textContent.trim() || null,
          linkedin_url: linkEl?.href?.split("?")[0] || null,
          source: "linkedin_search",
        });
      }
    });
  }

  if (contacts.length === 0) {
    const bodyText = document.body.innerText;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = [...new Set(bodyText.match(emailRegex) || [])];
    emails.forEach((email) => {
      if (!email.includes("example.com") && !email.includes("test.com")) {
        contacts.push({
          full_name: email.split("@")[0].replace(/[._-]/g, " "),
          email,
          source: "page_scrape",
        });
      }
    });
  }

  return contacts;
}

// ─── Save/Scrape Job Handlers ─────────────────────────────────

// Mode 3: interactive "Autofill this page" — fills the visible application
// form on the current tab (matched or unmatched job). Fill-only; the user
// reviews and submits themselves. When `tailor` is true, the resume is first
// customized to the job and the tailored version is uploaded.
async function autofillCurrentPage(tailor = false) {
  if (!authToken || !activeSeekerId) {
    setStatus(els.saveStatus, "Connect and select a job seeker first.", "error");
    return;
  }

  setStatus(
    els.saveStatus,
    tailor ? "Tailoring résumé and launching autofill…" : "Launching autofill…",
    "info"
  );

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus(els.saveStatus, "Unable to access current tab.", "error");
      return;
    }

    const resp = await sendRuntimeMessage({
      type: "AUTOFILL_ACTIVE_TAB",
      tabId: tab.id,
      tailor,
    });

    if (!resp?.success) {
      setStatus(els.saveStatus, "Error: " + (resp?.error || "Failed to autofill."), "error");
      return;
    }

    if (tailor && !resp.tailored) {
      // Autofill still ran with the base resume; surface why tailoring didn't apply.
      const why = resp.tailoring?.error || "Could not tailor résumé.";
      setStatus(
        els.saveStatus,
        `Autofilling with base résumé (${why}). Review the form, then submit.`,
        "info"
      );
      return;
    }

    if (tailor && resp.tailored) {
      const cov = resp.tailoring?.coverage;
      const covText =
        cov && typeof cov.before?.coveragePct === "number" && typeof cov.after?.coveragePct === "number"
          ? ` Skill coverage ${cov.before.coveragePct}% → ${cov.after.coveragePct}%.`
          : "";
      setStatus(
        els.saveStatus,
        `Résumé tailored to this job.${covText} Autofilling — review the form, then submit.`,
        "success"
      );
      return;
    }

    setStatus(
      els.saveStatus,
      "Autofill started — see the checklist panel on the page.",
      "success"
    );
  } catch (error) {
    setStatus(els.saveStatus, "Error: " + error.message, "error");
    console.error("Autofill page error:", error);
  }
}

async function saveCurrentJob() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(els.saveStatus, "Set API Base URL in Settings.", "error");
    return;
  }

  setStatus(els.saveStatus, "Saving job...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab?.id) {
      setStatus(els.saveStatus, "Unable to read current tab.", "error");
      return;
    }

    // Try to extract job description from the current page
    let description = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Try common job description selectors
          const selectors = [
            ".jobs-description__content",
            ".jobs-box__html-content",
            ".jobs-description-content__text",
            "#jobDescriptionText",
            ".jobsearch-jobDescriptionText",
            "[data-test='jobDescriptionContent']",
            ".job-description",
            ".job_description",
            "#job-description",
            "#job_description",
            "[class*='jobDescription']",
            "[class*='job-description']",
            ".posting-page .content",
            ".desc",
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 50) {
              return el.textContent.trim().slice(0, 5000);
            }
          }
          return null;
        },
      });
      description = results[0]?.result || null;
    } catch (e) {
      // Couldn't inject script - that's fine, save without description
    }

    // Try to extract company and location from the page
    let company = null;
    let location = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let co = null;
          let loc = null;
          // LinkedIn
          co = document.querySelector(".jobs-unified-top-card__company-name, .topcard__org-name-link, .company-name")?.textContent?.trim();
          loc = document.querySelector(".jobs-unified-top-card__bullet, .topcard__flavor--bullet, .job-location")?.textContent?.trim();
          // Indeed
          if (!co) co = document.querySelector("[data-testid='inlineHeader-companyName'], .jobsearch-InlineCompanyRating-companyHeader")?.textContent?.trim();
          if (!loc) loc = document.querySelector("[data-testid='inlineHeader-companyLocation'], .jobsearch-JobInfoHeader-subtitle > div:last-child")?.textContent?.trim();
          // Greenhouse
          if (!co) co = document.querySelector(".company-name, .employer")?.textContent?.trim();
          if (!loc) loc = document.querySelector(".location")?.textContent?.trim();
          return { company: co, location: loc };
        },
      });
      company = results[0]?.result?.company || null;
      location = results[0]?.result?.location || null;
    } catch (e) { /* ignore */ }

    const board = detectJobBoard(tab.url);
    const response = await fetch(`${apiBaseUrl}/api/jobs/save`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        url: tab.url,
        title: tab.title || "Untitled",
        company,
        location,
        source: board?.key || "extension",
        raw_html: null,
        raw_text: description,
      }),
    });

    if (!response.ok) {
      setStatus(els.saveStatus, `Failed to save (${response.status})`, "error");
      return;
    }

    const data = await response.json();
    if (data?.success) {
      const msg = data.duplicate ? "Already saved (duplicate)" : "Job saved & auto-matched!";
      setStatus(els.saveStatus, msg, "success");
      // Refresh matched jobs since auto-match runs
      if (!data.duplicate) setTimeout(() => loadMatchedJobs(), 1500);
    } else {
      setStatus(els.saveStatus, "Failed to save job", "error");
    }
  } catch (error) {
    setStatus(els.saveStatus, "Network error", "error");
  }
}

// Scraped jobs are held here for review; nothing is saved until the AM confirms.
let scrapedJobs = [];
let scrapedSelected = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function scrapeJobs(scrapeFunc) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(els.saveStatus, "Set API Base URL in Settings.", "error");
    return;
  }

  setStatus(els.saveStatus, "Scraping jobs...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus(els.saveStatus, "Unable to access current tab.", "error");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeFunc,
    });

    const jobs = results[0]?.result || [];
    if (jobs.length === 0) {
      clearScrapePreview();
      setStatus(els.saveStatus, "No job listings found.", "info");
      return;
    }

    // Show the jobs for review instead of saving them.
    scrapedJobs = jobs;
    scrapedSelected = jobs.map(() => true);
    renderScrapePreview();
    setStatus(els.saveStatus, `Found ${jobs.length} jobs. Review, then save.`, "info");
  } catch (error) {
    setStatus(els.saveStatus, "Error: " + error.message, "error");
  }
}

function selectedScrapeCount() {
  return scrapedSelected.filter(Boolean).length;
}

function renderScrapePreview() {
  if (!els.scrapePreview || !els.scrapeList) return;
  if (scrapedJobs.length === 0) {
    els.scrapePreview.classList.add("hidden");
    return;
  }
  els.scrapePreview.classList.remove("hidden");
  els.scrapePreviewTitle.textContent = `${selectedScrapeCount()} of ${scrapedJobs.length} selected`;

  els.scrapeList.innerHTML = scrapedJobs
    .map((job, i) => {
      const meta = [job.company, job.location].filter(Boolean).join(" · ") || job.url || "";
      const openBtn = job.url
        ? `<button data-open="${i}" title="Open in new tab" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:13px;padding:2px 4px;line-height:1">↗</button>`
        : "";
      return `
        <div class="job-card" style="display:flex;gap:6px;align-items:flex-start">
          <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;flex:1;min-width:0">
            <input type="checkbox" data-idx="${i}" ${scrapedSelected[i] ? "checked" : ""} style="margin-top:3px;width:14px;height:14px" />
            <span style="min-width:0;flex:1">
              <span class="title" style="display:block">${escapeHtml(job.title || "Untitled")}</span>
              <span class="meta" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(meta)}</span>
            </span>
          </label>
          <div style="display:flex;gap:2px;flex-shrink:0">
            ${openBtn}
            <button data-remove="${i}" title="Remove" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:15px;font-weight:bold;padding:2px 4px;line-height:1">&times;</button>
          </div>
        </div>`;
    })
    .join("");

  els.scrapeList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      scrapedSelected[idx] = e.target.checked;
      els.scrapePreviewTitle.textContent = `${selectedScrapeCount()} of ${scrapedJobs.length} selected`;
    });
  });

  els.scrapeList.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const job = scrapedJobs[Number(e.currentTarget.dataset.open)];
      if (job?.url) chrome.tabs.create({ url: job.url, active: false }).catch(() => {});
    });
  });

  els.scrapeList.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      removeScrapedJob(Number(e.currentTarget.dataset.remove));
    });
  });
}

function removeScrapedJob(idx) {
  if (idx < 0 || idx >= scrapedJobs.length) return;
  scrapedJobs.splice(idx, 1);
  scrapedSelected.splice(idx, 1);
  if (scrapedJobs.length === 0) {
    clearScrapePreview();
    setStatus(els.saveStatus, "All scraped jobs removed.", "info");
  } else {
    renderScrapePreview();
  }
}

function toggleAllScraped() {
  const allSelected = selectedScrapeCount() === scrapedJobs.length;
  scrapedSelected = scrapedJobs.map(() => !allSelected);
  renderScrapePreview();
}

function clearScrapePreview() {
  scrapedJobs = [];
  scrapedSelected = [];
  if (els.scrapePreview) els.scrapePreview.classList.add("hidden");
  if (els.scrapeList) els.scrapeList.innerHTML = "";
}

async function saveScrapedJobs() {
  const apiBaseUrl = getApiBaseUrl();
  const toSave = scrapedJobs.filter((_, i) => scrapedSelected[i]);
  if (toSave.length === 0) {
    setStatus(els.saveStatus, "No jobs selected.", "info");
    return;
  }

  els.scrapeSaveSelectedBtn.disabled = true;
  setStatus(els.saveStatus, `Saving ${toSave.length}...`, "info");

  let saved = 0;
  let duplicates = 0;
  for (const job of toSave) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/jobs/save`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          url: job.url,
          title: job.title,
          company: job.company,
          location: job.location,
          source: job.source || "extension_scrape",
          raw_text: job.description || null,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.duplicate) duplicates++;
        else saved++;
      }
    } catch (e) {
      console.error("Error saving job:", e);
    }
  }

  els.scrapeSaveSelectedBtn.disabled = false;
  clearScrapePreview();
  setStatus(
    els.saveStatus,
    `${saved} saved, ${duplicates} duplicates. Jobs auto-matched!`,
    "success"
  );
  setTimeout(() => loadMatchedJobs(), 2000);
}

// Injected scrape functions
function scrapeVisibleJobs() {
  const jobs = [];
  const url = window.location.href.toLowerCase();

  // Try to grab job description from the detail panel (LinkedIn shows it on the right side)
  function getVisibleDescription() {
    // LinkedIn job detail panel
    const linkedinDesc = document.querySelector(".jobs-description__content, .jobs-box__html-content, .jobs-description-content__text");
    if (linkedinDesc) return linkedinDesc.textContent.trim().slice(0, 5000);
    // Indeed job detail
    const indeedDesc = document.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText");
    if (indeedDesc) return indeedDesc.textContent.trim().slice(0, 5000);
    // Glassdoor
    const glassdoorDesc = document.querySelector("[data-test='jobDescriptionContent'], .desc");
    if (glassdoorDesc) return glassdoorDesc.textContent.trim().slice(0, 5000);
    // Generic
    const genericDesc = document.querySelector("[class*='description'], [id*='description']");
    if (genericDesc) return genericDesc.textContent.trim().slice(0, 5000);
    return null;
  }

  if (url.includes("linkedin.com")) {
    const desc = getVisibleDescription();
    document.querySelectorAll(".job-card-container, .jobs-search-results__list-item").forEach((card) => {
      const titleEl = card.querySelector(".job-card-list__title, .job-card-container__link");
      const companyEl = card.querySelector(".job-card-container__company-name, .artdeco-entity-lockup__subtitle");
      const locationEl = card.querySelector(".job-card-container__metadata-item, .artdeco-entity-lockup__caption");
      const linkEl = card.querySelector("a[href*='/jobs/view/']");
      if (titleEl && linkEl) {
        // Only attach description to the first/active card
        const isActive = card.classList.contains("jobs-search-results-list__list-item--active") || card.querySelector(".job-card-container--clickable.active");
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href.split("?")[0], source: "linkedin", description: isActive ? desc : null });
      }
    });
  } else if (url.includes("indeed.com")) {
    const desc = getVisibleDescription();
    document.querySelectorAll(".job_seen_beacon, .jobsearch-ResultsList > li").forEach((card) => {
      const titleEl = card.querySelector(".jobTitle a, h2.jobTitle");
      const companyEl = card.querySelector(".companyName, [data-testid='company-name']");
      const locationEl = card.querySelector(".companyLocation, [data-testid='text-location']");
      const linkEl = card.querySelector("a[href*='/viewjob'], a[id^='job_']");
      if (titleEl) {
        const href = linkEl?.href || titleEl?.href;
        const isActive = card.classList.contains("mosaic-provider-jobcards") || card.querySelector(".selected");
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: href ? new URL(href, window.location.origin).href : "", source: "indeed", description: isActive ? desc : null });
      }
    });
  } else if (url.includes("glassdoor.com")) {
    document.querySelectorAll("[data-test='jobListing'], .react-job-listing").forEach((card) => {
      const titleEl = card.querySelector("[data-test='job-title'], .job-title");
      const companyEl = card.querySelector("[data-test='employer-name'], .employer-name");
      const locationEl = card.querySelector("[data-test='location'], .location");
      const linkEl = card.querySelector("a[href*='/job-listing/']");
      if (titleEl) {
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl?.href || "", source: "glassdoor", description: null });
      }
    });
  } else if (url.includes("dice.com")) {
    document.querySelectorAll("[data-cy='search-result-card']").forEach((card) => {
      const titleEl = card.querySelector("[data-cy='card-title']");
      const companyEl = card.querySelector("[data-cy='card-company']");
      const locationEl = card.querySelector("[data-cy='card-location']");
      const linkEl = card.querySelector("a[href*='/job-detail/']");
      if (titleEl) {
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl?.href || "", source: "dice", description: null });
      }
    });
  } else if (url.includes("ziprecruiter.com")) {
    document.querySelectorAll(".job_content, article.job-listing").forEach((card) => {
      const titleEl = card.querySelector(".job_title, .title");
      const companyEl = card.querySelector(".hiring_company, .company");
      const locationEl = card.querySelector(".job_location, .location");
      const linkEl = card.querySelector("a[href*='/jobs/']");
      if (titleEl) {
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl?.href || "", source: "ziprecruiter", description: null });
      }
    });
  }

  return jobs;
}

async function scrapeAllJobsWithScroll() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const allJobs = new Map();

  const scrape = () => {
    const jobs = [];
    const url = window.location.href.toLowerCase();
    if (url.includes("linkedin.com")) {
      document.querySelectorAll(".job-card-container, .jobs-search-results__list-item").forEach((card) => {
        const titleEl = card.querySelector(".job-card-list__title, .job-card-container__link");
        const companyEl = card.querySelector(".job-card-container__company-name");
        const locationEl = card.querySelector(".job-card-container__metadata-item");
        const linkEl = card.querySelector("a[href*='/jobs/view/']");
        if (titleEl && linkEl) { const u = linkEl.href.split("?")[0]; jobs.push({ id: u, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: u, source: "linkedin" }); }
      });
    } else if (url.includes("indeed.com")) {
      document.querySelectorAll(".job_seen_beacon, .jobsearch-ResultsList > li").forEach((card) => {
        const titleEl = card.querySelector(".jobTitle a, h2.jobTitle");
        const companyEl = card.querySelector(".companyName");
        const locationEl = card.querySelector(".companyLocation");
        const linkEl = card.querySelector("a[href*='/viewjob'], a[id^='job_']");
        if (titleEl) { const href = linkEl?.href || titleEl?.href; const u = href ? new URL(href, window.location.origin).href : ""; jobs.push({ id: u, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: u, source: "indeed" }); }
      });
    } else if (url.includes("glassdoor.com")) {
      document.querySelectorAll("[data-test='jobListing'], .react-job-listing").forEach((card) => {
        const titleEl = card.querySelector("[data-test='job-title'], .job-title");
        const companyEl = card.querySelector("[data-test='employer-name']");
        const locationEl = card.querySelector("[data-test='location']");
        const linkEl = card.querySelector("a[href*='/job-listing/']");
        if (titleEl && linkEl) { jobs.push({ id: linkEl.href, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href, source: "glassdoor" }); }
      });
    } else if (url.includes("dice.com")) {
      document.querySelectorAll("[data-cy='search-result-card']").forEach((card) => {
        const titleEl = card.querySelector("[data-cy='card-title']");
        const companyEl = card.querySelector("[data-cy='card-company']");
        const locationEl = card.querySelector("[data-cy='card-location']");
        const linkEl = card.querySelector("a[href*='/job-detail/']");
        if (titleEl && linkEl) { jobs.push({ id: linkEl.href, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href, source: "dice" }); }
      });
    } else if (url.includes("ziprecruiter.com")) {
      document.querySelectorAll(".job_content, article.job-listing").forEach((card) => {
        const titleEl = card.querySelector(".job_title, .title");
        const companyEl = card.querySelector(".hiring_company, .company");
        const locationEl = card.querySelector(".job_location, .location");
        const linkEl = card.querySelector("a[href*='/jobs/']");
        if (titleEl && linkEl) { jobs.push({ id: linkEl.href, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href, source: "ziprecruiter" }); }
      });
    }
    return jobs;
  };

  let currentJobs = scrape();
  currentJobs.forEach((j) => allJobs.set(j.id, j));

  let scrollCount = 0;
  let lastHeight = document.body.scrollHeight;

  while (scrollCount < 20) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(1500);
    const loadMoreBtn = document.querySelector('button[aria-label*="more"], button[class*="load-more"], .infinite-scroller__show-more-button');
    if (loadMoreBtn) { loadMoreBtn.click(); await sleep(2000); }
    currentJobs = scrape();
    currentJobs.forEach((j) => allJobs.set(j.id, j));
    const newHeight = document.body.scrollHeight;
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
    scrollCount++;
  }

  window.scrollTo(0, 0);
  return Array.from(allJobs.values());
}

// ─── Runner ───────────────────────────────────────────────────

function updateRunnerUI(enabled) {
  if (enabled) {
    els.runnerIndicator.classList.add("active");
    els.runnerStatusText.textContent = "Running";
    els.toggleRunnerBtn.textContent = "Stop Runner";
    els.toggleRunnerBtn.classList.remove("btn-success");
    els.toggleRunnerBtn.classList.add("btn-danger");
  } else {
    els.runnerIndicator.classList.remove("active");
    els.runnerStatusText.textContent = "Stopped";
    els.toggleRunnerBtn.textContent = "Start Runner";
    els.toggleRunnerBtn.classList.remove("btn-danger");
    els.toggleRunnerBtn.classList.add("btn-success");
  }
}

async function toggleRunner() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.runnerEnabled]);
  const newValue = !(result[STORAGE_KEYS.runnerEnabled] || false);

  if (newValue && (!authToken || !activeSeekerId)) {
    setStatus(els.settingsStatus, "Connect and select a job seeker first.", "error");
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.runnerEnabled]: newValue });
  chrome.runtime.sendMessage({ type: "RUNNER_TOGGLE", enabled: newValue });
  updateRunnerUI(newValue);
  setStatus(els.settingsStatus, newValue ? "Runner started!" : "Runner stopped.", "info");
  if (newValue) chrome.runtime.sendMessage({ type: "RUNNER_RUN_NOW" });
}

async function saveSessionState() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    setStatus(els.settingsStatus, "Connect and select a job seeker first.", "error");
    return;
  }

  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (error) {
    setStatus(els.settingsStatus, "Unable to access current tab.", "error");
    return;
  }

  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    setStatus(els.settingsStatus, "Open a job board page first.", "error");
    return;
  }

  setStatus(els.settingsStatus, "Saving session state...", "info");

  let origin;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    setStatus(els.settingsStatus, "Invalid tab URL.", "error");
    return;
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
    console.warn("Cookie capture failed:", error);
  }

  let localStorageData = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const entries = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) entries.push({ name: key, value: localStorage.getItem(key) ?? "" });
        }
        return entries;
      },
    });
    localStorageData = results?.[0]?.result ?? [];
  } catch (error) {
    console.warn("LocalStorage capture failed:", error);
  }

  const storageState = {
    cookies,
    origins: [
      {
        origin,
        localStorage: localStorageData,
      },
    ],
  };

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/storage-state`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        job_seeker_id: activeSeekerId,
        storage_state: storageState,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(els.settingsStatus, data.error || "Failed to save session state.", "error");
      return;
    }

    setStatus(els.settingsStatus, "Session state saved.", "success");
  } catch (error) {
    setStatus(els.settingsStatus, "Failed to save session state.", "error");
  }
}

// ─── Page Info ────────────────────────────────────────────────

async function updatePageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      els.pageTitle.textContent = tab.title || "Untitled";
      els.pageUrl.textContent = tab.url || "-";
      const board = detectJobBoard(tab.url);
      if (board) {
        els.detectedBoard.innerHTML = `<div class="detected-board" style="background:${board.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${board.name}</div>`;
      } else {
        els.detectedBoard.innerHTML = "";
      }
    }
  } catch {
    els.pageTitle.textContent = "Unable to read page";
    els.pageUrl.textContent = "-";
  }
}

// ─── Tab Switching ────────────────────────────────────────────

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

if (els.refreshCockpitBtn) {
  els.refreshCockpitBtn.addEventListener("click", loadCockpit);
}

if (els.refreshAdminBtn) {
  els.refreshAdminBtn.addEventListener("click", loadAdminOverview);
}

// ─── Event Listeners ──────────────────────────────────────────

els.connectBtn.addEventListener("click", connect);
els.disconnectBtn.addEventListener("click", disconnect);
els.saveJobBtn.addEventListener("click", saveCurrentJob);
if (els.autofillPageBtn) els.autofillPageBtn.addEventListener("click", () => autofillCurrentPage(false));
if (els.tailorAutofillPageBtn) els.tailorAutofillPageBtn.addEventListener("click", () => autofillCurrentPage(true));
els.scrapeVisibleBtn.addEventListener("click", () => scrapeJobs(scrapeVisibleJobs));
els.scrapeAllBtn.addEventListener("click", () => scrapeJobs(scrapeAllJobsWithScroll));
if (els.scrapeSaveSelectedBtn) els.scrapeSaveSelectedBtn.addEventListener("click", saveScrapedJobs);
if (els.scrapeToggleAllBtn) els.scrapeToggleAllBtn.addEventListener("click", toggleAllScraped);
if (els.scrapeClearBtn) els.scrapeClearBtn.addEventListener("click", () => {
  clearScrapePreview();
  setStatus(els.saveStatus, "Scraped jobs discarded.", "info");
});
els.refreshMatchedBtn.addEventListener("click", loadMatchedJobs);
if (els.openJobManagerBtn) {
  els.openJobManagerBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("jobs.html"), active: true });
  });
}
if (els.refreshMyJobsBtn) {
  els.refreshMyJobsBtn.addEventListener("click", loadMyJobs);
}
if (els.showAppliedJobsBtn) {
  els.showAppliedJobsBtn.addEventListener("click", () => {
    includeAppliedJobs = !includeAppliedJobs;
    loadMyJobs();
  });
}
els.scrapeContactsBtn.addEventListener("click", scrapePageContacts);
els.toggleRunnerBtn.addEventListener("click", toggleRunner);
els.saveSessionStateBtn.addEventListener("click", saveSessionState);

els.seekerSelect.addEventListener("change", (e) => {
  if (e.target.value) {
    setActiveSeeker(e.target.value);
    includeAppliedJobs = false;
    if (els.referrerPanel) {
      els.referrerPanel.classList.add("hidden");
    }
    // Auto-refresh lists when seeker changes
    setTimeout(() => {
      loadMatchedJobs();
      loadMyJobs();
      loadContacts();
    }, 500);
  }
});

if (els.autoAutofill) {
  els.autoAutofill.addEventListener("change", () => {
    chrome.storage.local.set({ [STORAGE_KEYS.autoAutofill]: els.autoAutofill.checked });
  });
}
if (els.orchestrateAll) {
  els.orchestrateAll.addEventListener("change", () => {
    chrome.storage.local.set({
      [STORAGE_KEYS.orchestrateAllSeekers]: els.orchestrateAll.checked,
    });
  });
}

els.dryRun.addEventListener("change", () => {
  chrome.storage.local.set({ [STORAGE_KEYS.dryRun]: els.dryRun.checked });
});

// ─── Initialize ───────────────────────────────────────────────

async function init() {
  // Keep the header version in sync with the manifest (no more stale strings).
  const versionEl = document.getElementById("appVersion");
  if (versionEl && chrome.runtime?.getManifest) {
    versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  const result = await chrome.storage.local.get(Object.values(STORAGE_KEYS));

  authToken = result[STORAGE_KEYS.authToken] || null;
  amInfo = result[STORAGE_KEYS.amInfo] || null;
  activeSeekerId = result[STORAGE_KEYS.activeSeekerId] || null;
  setApiBaseUrl(DEFAULT_API_BASE_URL);
  await chrome.storage.local.set({ [STORAGE_KEYS.apiBaseUrl]: getApiBaseUrl() });
  els.dryRun.checked = result[STORAGE_KEYS.dryRun] || false;
  if (els.autoAutofill) els.autoAutofill.checked = result[STORAGE_KEYS.autoAutofill] || false;
  if (els.orchestrateAll)
    els.orchestrateAll.checked = result[STORAGE_KEYS.orchestrateAllSeekers] || false;
  updateRunnerUI(result[STORAGE_KEYS.runnerEnabled] || false);

  if (authToken && amInfo) {
    const valid = await verifySession();
    if (valid) {
      showConnectedUI();
      loadSeekers();
    } else {
      showDisconnectedUI();
    }
  } else {
    showDisconnectedUI();
  }

  updatePageInfo();

  // Check for session expiry warnings
  checkSessionWarnings();
}

async function checkSessionWarnings() {
  const { sessionWarning } = await chrome.storage.local.get("sessionWarning");
  if (!sessionWarning) return;

  // Only show warnings from the last 24 hours
  if (Date.now() - sessionWarning.timestamp > 24 * 60 * 60 * 1000) {
    await chrome.storage.local.remove("sessionWarning");
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  const warningBanner = document.createElement("div");
  warningBanner.className = "session-warning";
  warningBanner.style.cssText =
    "background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 12px;" +
    "margin:8px 0;display:flex;align-items:center;gap:8px;font-size:12px;color:#991B1B;";
  warningBanner.innerHTML =
    `<span style="font-size:16px">⚠️</span>` +
    `<span><strong>${sessionWarning.platform}</strong>: ${sessionWarning.message}</span>` +
    `<button id="dismissSessionWarning" style="margin-left:auto;background:none;border:none;` +
    `color:#991B1B;cursor:pointer;font-size:14px;">×</button>`;

  const mainApp = document.getElementById("mainApp");
  if (mainApp) {
    mainApp.insertBefore(warningBanner, mainApp.firstChild);
    document.getElementById("dismissSessionWarning")?.addEventListener("click", async () => {
      warningBanner.remove();
      await chrome.storage.local.remove("sessionWarning");
      chrome.action.setBadgeText({ text: "" });
    });
  }
}

init();
