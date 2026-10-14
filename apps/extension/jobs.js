const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  authToken: "authToken",
  amInfo: "amInfo",
  activeSeekerId: "activeSeekerId",
  runnerEnabled: "runnerEnabled",
  dryRun: "dryRun",
};

const DEFAULT_API_BASE_URL = "https://job-genius.com";
const PAGE_SIZE = 50;

const state = {
  authToken: null,
  apiBaseUrl: DEFAULT_API_BASE_URL,
  activeSeekerId: null,
  items: [],
  filteredItems: [],
  visibleLimit: PAGE_SIZE,
};

const els = {
  connectionStatus: document.getElementById("connectionStatus"),
  openPopup: document.getElementById("openPopup"),
  seekerSelect: document.getElementById("seekerSelect"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  refreshBtn: document.getElementById("refreshBtn"),
  summary: document.getElementById("summary"),
  jobsGrid: document.getElementById("jobsGrid"),
  emptyState: document.getElementById("emptyState"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
};

function normalizeUrl(url) {
  return (url || "").replace(/\/+$/, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setConnectionStatus(message, tone = "neutral") {
  els.connectionStatus.textContent = message;
  if (tone === "error") {
    els.connectionStatus.style.color = "#b91c1c";
    return;
  }
  if (tone === "ok") {
    els.connectionStatus.style.color = "#166534";
    return;
  }
  els.connectionStatus.style.color = "#6b7280";
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.authToken}`,
    "x-runner": "extension",
  };
}

function getManualHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.authToken}`,
  };
}

function getEffectiveStatus(item) {
  return String(item.run_status || item.queue_status || "UNKNOWN").toUpperCase();
}

function matchesStatusFilter(item, filter) {
  const status = getEffectiveStatus(item);
  if (filter === "needs_attention") return status === "NEEDS_ATTENTION";
  if (filter === "applied") return status === "APPLIED" || status === "COMPLETED";
  if (filter === "queue_ready") return ["QUEUED", "READY", "RETRYING"].includes(status);
  if (filter === "active") {
    return !["APPLIED", "COMPLETED", "FAILED", "CANCELLED"].includes(status);
  }
  return true;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.job?.title,
    item.job?.company,
    item.job?.location,
    item.last_error,
    item.needs_attention_reason,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(query.toLowerCase());
}

function getBadgeClass(status) {
  if (status === "NEEDS_ATTENTION") return "badge badge-attention";
  if (status === "APPLIED" || status === "COMPLETED") return "badge badge-good";
  return "badge";
}

function countByStatus(items) {
  const counts = {};
  for (const item of items) {
    const status = getEffectiveStatus(item);
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function renderSummary() {
  const counts = countByStatus(state.items);
  const chips = [
    `Total: ${state.items.length}`,
    `Needs Attention: ${counts.NEEDS_ATTENTION || 0}`,
    `Running: ${counts.RUNNING || 0}`,
    `Ready: ${(counts.READY || 0) + (counts.QUEUED || 0) + (counts.RETRYING || 0)}`,
    `Applied: ${(counts.APPLIED || 0) + (counts.COMPLETED || 0)}`,
  ];
  els.summary.innerHTML = chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("");
}

function renderJobs() {
  const filter = els.statusFilter.value;
  const query = els.searchInput.value.trim();
  state.filteredItems = state.items.filter(
    (item) => matchesStatusFilter(item, filter) && matchesSearch(item, query)
  );

  const visible = state.filteredItems.slice(0, state.visibleLimit);
  els.jobsGrid.innerHTML = visible
    .map((item) => {
      const status = getEffectiveStatus(item);
      const score = Number.isFinite(Number(item.score))
        ? `${Math.round(Number(item.score))}%`
        : "--";
      const errorLine = item.last_error
        ? `<div class="err">${escapeHtml(item.last_error)}</div>`
        : "";
      const reasonLine = item.needs_attention_reason
        ? `<div class="meta">Reason: ${escapeHtml(
            String(item.needs_attention_reason).replace(/_/g, " ")
          )}</div>`
        : "";
      const canApply = ["NEEDS_ATTENTION", "READY", "RETRYING", "QUEUED"].includes(status);
      const applyLabel = status === "NEEDS_ATTENTION" ? "Resume + Apply" : "Apply";
      const disableApply = !canApply;

      return `
        <div class="job">
          <h3>${escapeHtml(item.job?.title || "Untitled Job")}</h3>
          <div class="meta">${escapeHtml(item.job?.company || "Unknown")} - ${escapeHtml(item.job?.location || "N/A")}</div>
          <div class="row">
            <span class="${getBadgeClass(status)}">${escapeHtml(status.replace(/_/g, " "))}</span>
            <span class="badge">Score: ${escapeHtml(score)}</span>
            ${item.current_step ? `<span class="badge">Step: ${escapeHtml(item.current_step)}</span>` : ""}
          </div>
          ${reasonLine}
          ${errorLine}
          <div class="row">
            <button class="btn action-open" data-job-url="${encodeURIComponent(item.job?.url || "")}">
              Open
            </button>
            <button
              class="btn btn-primary action-apply"
              data-run-id="${escapeHtml(item.run_id || "")}"
              data-queue-id="${escapeHtml(item.queue_id || "")}"
              data-status="${escapeHtml(status)}"
              ${disableApply ? "disabled" : ""}
            >
              ${escapeHtml(disableApply ? "Unavailable" : applyLabel)}
            </button>
            ${
              item.run_id && !disableApply
                ? `<button class="btn action-mark-applied" data-run-id="${escapeHtml(
                    item.run_id
                  )}">Mark Applied</button>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  const hasItems = visible.length > 0;
  els.emptyState.style.display = hasItems ? "none" : "block";
  els.loadMoreBtn.style.display =
    state.filteredItems.length > state.visibleLimit ? "inline-flex" : "none";
}

async function verifySession() {
  const response = await fetch(`${state.apiBaseUrl}/api/extension/me`, {
    headers: { Authorization: `Bearer ${state.authToken}` },
  });
  return response.ok;
}

async function loadSeekers() {
  const response = await fetch(`${state.apiBaseUrl}/api/extension/seekers`, {
    headers: { Authorization: `Bearer ${state.authToken}` },
  });
  if (!response.ok) {
    throw new Error("Failed to load assigned job seekers.");
  }

  const data = await response.json();
  const seekers = data.seekers || [];
  els.seekerSelect.innerHTML = '<option value="">Select job seeker</option>';
  seekers.forEach((seeker) => {
    const option = document.createElement("option");
    option.value = seeker.id;
    option.textContent = `${seeker.full_name || seeker.email}${
      seeker.location ? ` (${seeker.location})` : ""
    }`;
    els.seekerSelect.appendChild(option);
  });

  const defaultId =
    state.activeSeekerId || data.active_job_seeker_id || seekers[0]?.id || null;
  if (defaultId) {
    state.activeSeekerId = defaultId;
    els.seekerSelect.value = defaultId;
    await chrome.storage.local.set({ [STORAGE_KEYS.activeSeekerId]: defaultId });
    if (data.active_job_seeker_id !== defaultId) {
      await setActiveSeeker(defaultId);
    }
  }
}

async function setActiveSeeker(seekerId) {
  const response = await fetch(`${state.apiBaseUrl}/api/extension/seekers`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ job_seeker_id: seekerId }),
  });
  if (!response.ok) {
    throw new Error("Failed to set active job seeker.");
  }
}

async function loadJobs() {
  if (!state.activeSeekerId) {
    state.items = [];
    renderSummary();
    renderJobs();
    return;
  }

  setConnectionStatus("Loading jobs...");
  const response = await fetch(`${state.apiBaseUrl}/api/extension/my-jobs?include_applied=true`, {
    headers: { Authorization: `Bearer ${state.authToken}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (
      response.status === 400 &&
      String(payload?.error || "").toLowerCase().includes("active job seeker")
    ) {
      await setActiveSeeker(state.activeSeekerId);
      return loadJobs();
    }
    throw new Error(payload?.error || `Failed to load jobs (${response.status}).`);
  }

  const data = await response.json();
  state.items = data.items || [];
  state.visibleLimit = PAGE_SIZE;
  renderSummary();
  renderJobs();
  setConnectionStatus(`Loaded ${state.items.length} jobs.`, "ok");
}

async function startRunFromQueue(queueId) {
  const response = await fetch(`${state.apiBaseUrl}/api/apply/start`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ queue_id: queueId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.run_id) {
    if (data?.blocked && data?.reason === "DUPLICATE_APPLICATION") {
      throw new Error(
        `Already applied to ${data.duplicate_job?.company ?? "this job"} recently — skipped to avoid a duplicate.`
      );
    }
    throw new Error(
      data.error || (data?.blocked ? `Blocked: ${data.reason}.` : "Failed to start run.")
    );
  }

  return data.run_id;
}

async function resumeRun(runId) {
  const response = await fetch(`${state.apiBaseUrl}/api/apply/resume`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ run_id: runId, note: "Resumed from Job Console." }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to resume run.");
  }
}

async function markApplied(runId) {
  const response = await fetch(`${state.apiBaseUrl}/api/apply/complete`, {
    method: "POST",
    headers: getManualHeaders(),
    body: JSON.stringify({
      run_id: runId,
      note: "Marked applied from Job Console.",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to mark applied.");
  }
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

async function launchAutofill(runId) {
  const response = await sendRuntimeMessage({
    type: "RUNNER_RUN_FOR_RUN_ID",
    runId,
    activateTab: true,
  });
  if (!response?.success) {
    throw new Error(response?.error || "Failed to launch autofill.");
  }
}

function withBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = "Working...";
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.label || button.textContent;
  button.disabled = false;
}

async function handleApplyClick(button) {
  const status = String(button.dataset.status || "").toUpperCase();
  let runId = button.dataset.runId || "";
  const queueId = button.dataset.queueId || "";

  withBusy(button, true);
  try {
    if (!runId && queueId) {
      runId = await startRunFromQueue(queueId);
    }

    if (!runId) {
      throw new Error("No run available for this job.");
    }

    if (status === "NEEDS_ATTENTION") {
      await resumeRun(runId);
    }

    await launchAutofill(runId);
    setConnectionStatus("Opened tab and launched autofill.", "ok");
    await loadJobs();
  } catch (error) {
    setConnectionStatus(error.message || "Apply failed.", "error");
  } finally {
    withBusy(button, false);
  }
}

function openJob(encodedUrl) {
  const url = encodedUrl ? decodeURIComponent(encodedUrl) : "";
  if (!/^https?:\/\//i.test(url)) return;
  chrome.tabs.create({ url, active: true });
}

async function handleGridClick(event) {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.classList.contains("action-open")) {
    openJob(target.dataset.jobUrl);
    return;
  }

  if (target.classList.contains("action-apply")) {
    await handleApplyClick(target);
    return;
  }

  if (target.classList.contains("action-mark-applied")) {
    withBusy(target, true);
    try {
      await markApplied(target.dataset.runId);
      setConnectionStatus("Job marked as applied.", "ok");
      await loadJobs();
    } catch (error) {
      setConnectionStatus(error.message || "Mark applied failed.", "error");
    } finally {
      withBusy(target, false);
    }
  }
}

function bindEvents() {
  els.openPopup.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html"), active: true });
  });

  els.refreshBtn.addEventListener("click", () => {
    loadJobs().catch((error) => setConnectionStatus(error.message, "error"));
  });

  els.seekerSelect.addEventListener("change", async (event) => {
    const seekerId = event.target.value;
    if (!seekerId) return;

    try {
      state.activeSeekerId = seekerId;
      await chrome.storage.local.set({ [STORAGE_KEYS.activeSeekerId]: seekerId });
      await setActiveSeeker(seekerId);
      await loadJobs();
    } catch (error) {
      setConnectionStatus(error.message || "Failed to switch seeker.", "error");
    }
  });

  let searchDebounce;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.visibleLimit = PAGE_SIZE;
      renderJobs();
    }, 120);
  });

  els.statusFilter.addEventListener("change", () => {
    state.visibleLimit = PAGE_SIZE;
    renderJobs();
  });

  els.loadMoreBtn.addEventListener("click", () => {
    state.visibleLimit += PAGE_SIZE;
    renderJobs();
  });

  els.jobsGrid.addEventListener("click", (event) => {
    handleGridClick(event).catch((error) =>
      setConnectionStatus(error.message || "Action failed.", "error")
    );
  });
}

async function init() {
  bindEvents();
  const store = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  state.authToken = store[STORAGE_KEYS.authToken] || null;
  state.activeSeekerId = store[STORAGE_KEYS.activeSeekerId] || null;
  state.apiBaseUrl = DEFAULT_API_BASE_URL;
  if (!state.apiBaseUrl) {
    state.apiBaseUrl = DEFAULT_API_BASE_URL;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.apiBaseUrl]: state.apiBaseUrl });

  if (!state.authToken) {
    setConnectionStatus("Extension is not connected. Use popup to sign in.", "error");
    return;
  }

  const valid = await verifySession().catch(() => false);
  if (!valid) {
    setConnectionStatus("Session expired. Reconnect from popup.", "error");
    return;
  }

  try {
    await loadSeekers();
    await loadJobs();
  } catch (error) {
    setConnectionStatus(error.message || "Failed to initialize.", "error");
  }
}

init();
