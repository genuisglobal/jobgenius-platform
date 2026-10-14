(function () {
  const GLOBAL_KEY = "__jobGeniusSpy";

  if (window[GLOBAL_KEY] && typeof window[GLOBAL_KEY].refresh === "function") {
    window[GLOBAL_KEY].refresh(true);
    return;
  }

  const HOST_HINTS = [
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "greenhouse.io",
    "myworkdayjobs.com",
    "workday.com",
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
  const PATH_HINTS = [
    "/job",
    "/jobs",
    "/career",
    "/careers",
    "/position",
    "/positions",
    "/vacancy",
    "/opportunity",
    "/apply",
  ];
  const TITLE_SELECTORS = [
    ".jobs-unified-top-card__job-title",
    ".jobsearch-JobInfoHeader-title",
    "[data-testid='jobsearch-JobInfoHeader-title']",
    ".top-card-layout__title",
    ".posting-headline h2",
    ".posting-headline h1",
    ".job-title",
    "h1",
  ];
  const COMPANY_SELECTORS = [
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    ".jobsearch-InlineCompanyRating-companyHeader",
    "[data-testid='inlineHeader-companyName']",
    ".top-card-layout__second-subline a",
    ".company-name",
    ".employer",
    "[data-testid='company-name']",
  ];
  const LOCATION_SELECTORS = [
    ".jobs-unified-top-card__bullet",
    ".topcard__flavor--bullet",
    ".jobsearch-JobInfoHeader-subtitle div:last-child",
    "[data-testid='inlineHeader-companyLocation']",
    ".top-card-layout__third-subline",
    ".location",
    "[data-testid='text-location']",
  ];
  const DESCRIPTION_SELECTORS = [
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
  ];

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeUrl(url) {
    return String(url || "").split("#")[0];
  }

  function hostMatches(host, hint) {
    return host === hint || host.endsWith("." + hint);
  }

  function isLikelyJobUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return false;
      }

      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      if (HOST_HINTS.some((hint) => hostMatches(host, hint))) {
        return true;
      }

      return PATH_HINTS.some((hint) => path.includes(hint));
    } catch {
      return false;
    }
  }

  function getTextFromSelectors(selectors, minLength) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const text = normalizeText(element.textContent);
      if (text.length >= minLength) {
        return text;
      }
    }

    return "";
  }

  function getDescriptionText() {
    for (const selector of DESCRIPTION_SELECTORS) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const text = normalizeText(element.textContent);
      if (text.length >= 80) {
        return text.slice(0, 5000);
      }
    }

    return "";
  }

  function detectSource(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("indeed")) return "indeed";
    if (host.includes("glassdoor")) return "glassdoor";
    if (host.includes("greenhouse")) return "greenhouse";
    if (host.includes("workday")) return "workday";
    if (host.includes("lever")) return "lever";
    if (host.includes("smartrecruiters")) return "smartrecruiters";
    if (host.includes("icims")) return "icims";
    if (host.includes("jobvite")) return "jobvite";
    if (host.includes("workable")) return "workable";
    if (host.includes("bamboohr")) return "bamboohr";
    if (host.includes("recruitee")) return "recruitee";
    if (host.includes("ashby")) return "ashby";
    return host || "extension_spy";
  }

  function buildIdentity(context) {
    return [
      normalizeUrl(context.url),
      normalizeText(context.title),
      normalizeText(context.company || ""),
    ].join("::");
  }

  function getStorageKey(prefix, identity) {
    return prefix + identity;
  }

  function readSessionFlag(prefix, identity) {
    try {
      return sessionStorage.getItem(getStorageKey(prefix, identity)) === "1";
    } catch {
      return false;
    }
  }

  function writeSessionFlag(prefix, identity) {
    try {
      sessionStorage.setItem(getStorageKey(prefix, identity), "1");
    } catch {
      // Ignore storage failures.
    }
  }

  function extractJobContext() {
    const pageUrl = normalizeUrl(window.location.href);
    if (!isLikelyJobUrl(pageUrl)) {
      return null;
    }

    const title = getTextFromSelectors(TITLE_SELECTORS, 4);
    if (!title || title.length > 200) {
      return null;
    }

    const company = getTextFromSelectors(COMPANY_SELECTORS, 2) || null;
    const location = getTextFromSelectors(LOCATION_SELECTORS, 2) || null;
    const rawText = getDescriptionText() || null;

    if (!company && !location && !rawText) {
      return null;
    }

    return {
      title,
      company,
      location,
      raw_text: rawText,
      url: pageUrl,
      source: detectSource(window.location.hostname),
    };
  }

  function removeBanner() {
    const existing = document.getElementById("jobgenius-spy-banner");
    if (existing) {
      existing.remove();
    }
  }

  function setBannerStatus(container, text, color) {
    const status = container.querySelector("[data-jobgenius-spy-status]");
    if (!status) {
      return;
    }

    status.textContent = text;
    status.style.color = color;
  }

  // Score → presentation. Colors track the server's recommendation buckets so
  // the badge reads the same as the dashboard's match lanes.
  function scoreTheme(recommendation, score) {
    switch (recommendation) {
      case "strong_match":
        return { color: "#22c55e", label: "Strong match" };
      case "good_match":
        return { color: "#3b82f6", label: "Good match" };
      case "marginal":
        return { color: "#f59e0b", label: "Marginal fit" };
      case "poor_fit":
        return { color: "#ef4444", label: "Poor fit" };
      default:
        return {
          color: typeof score === "number" && score >= 55 ? "#3b82f6" : "#94a3b8",
          label: "Match",
        };
    }
  }

  function makeChip(text, kind) {
    const chip = document.createElement("span");
    chip.textContent = text;
    chip.style.display = "inline-block";
    chip.style.fontSize = "11px";
    chip.style.fontWeight = "600";
    chip.style.lineHeight = "1.6";
    chip.style.padding = "1px 8px";
    chip.style.margin = "0 4px 4px 0";
    chip.style.borderRadius = "999px";
    if (kind === "matched") {
      chip.style.background = "rgba(34,197,94,0.16)";
      chip.style.color = "#86efac";
      chip.style.border = "1px solid rgba(34,197,94,0.35)";
    } else {
      chip.style.background = "rgba(245,158,11,0.14)";
      chip.style.color = "#fcd34d";
      chip.style.border = "1px solid rgba(245,158,11,0.32)";
    }
    return chip;
  }

  function makeChipGroup(heading, items, kind) {
    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    const head = document.createElement("div");
    head.textContent = heading;
    head.style.fontSize = "10px";
    head.style.fontWeight = "700";
    head.style.letterSpacing = "0.04em";
    head.style.textTransform = "uppercase";
    head.style.color = "#94a3b8";
    head.style.marginBottom = "5px";
    wrap.appendChild(head);
    const row = document.createElement("div");
    for (const item of items) {
      row.appendChild(makeChip(item, kind));
    }
    wrap.appendChild(row);
    return wrap;
  }

  // Render the match-intelligence section into the card once scoring resolves.
  function renderScoreInto(banner, result) {
    const slot = banner.querySelector("[data-jobgenius-score-slot]");
    if (!slot) {
      return;
    }
    slot.innerHTML = "";

    if (!result || result.success === false) {
      slot.style.display = "none";
      return;
    }
    slot.style.display = "block";

    const score = typeof result.score === "number" ? Math.round(result.score) : null;
    const theme = scoreTheme(result.recommendation, score);

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.gap = "12px";

    const badge = document.createElement("div");
    badge.style.width = "46px";
    badge.style.height = "46px";
    badge.style.flex = "none";
    badge.style.borderRadius = "50%";
    badge.style.display = "flex";
    badge.style.flexDirection = "column";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.fontWeight = "800";
    badge.style.color = "#0b1220";
    badge.style.background = theme.color;
    badge.textContent = score === null ? "—" : String(score);
    badge.style.fontSize = score === null ? "16px" : "17px";

    const headText = document.createElement("div");
    const label = document.createElement("div");
    label.textContent = theme.label;
    label.style.fontSize = "13px";
    label.style.fontWeight = "700";
    label.style.color = theme.color;
    const sub = document.createElement("div");
    const coverage =
      typeof result.skills_coverage_pct === "number"
        ? Math.round(result.skills_coverage_pct) + "% skills covered"
        : null;
    sub.textContent = [
      result.above_threshold ? "Above target threshold" : "Below target threshold",
      coverage,
    ]
      .filter(Boolean)
      .join(" • ");
    sub.style.fontSize = "11px";
    sub.style.color = "#94a3b8";
    sub.style.marginTop = "2px";
    headText.appendChild(label);
    headText.appendChild(sub);

    head.appendChild(badge);
    head.appendChild(headText);
    slot.appendChild(head);

    const disqualifiers = Array.isArray(result.disqualifiers)
      ? result.disqualifiers
      : [];
    if (disqualifiers.length > 0) {
      const warn = document.createElement("div");
      warn.textContent = "⚠ Disqualifier: " + humanizeReason(disqualifiers[0]);
      warn.style.marginTop = "9px";
      warn.style.fontSize = "11px";
      warn.style.fontWeight = "600";
      warn.style.color = "#fca5a5";
      slot.appendChild(warn);
    }

    const matched = (result.matched_skills || []).slice(0, 6);
    if (matched.length > 0) {
      slot.appendChild(makeChipGroup("You have", matched, "matched"));
    }

    const missing = (result.missing_skills || []).slice(0, 6);
    if (missing.length > 0) {
      slot.appendChild(makeChipGroup("Missing / add to résumé", missing, "missing"));
    }

    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "rgba(148,163,184,0.18)";
    divider.style.margin = "12px 0 2px";
    slot.appendChild(divider);
  }

  function humanizeReason(reason) {
    return String(reason || "")
      .replace(/^disqualified_/, "")
      .replace(/_/g, " ");
  }

  // Ask the background to score this job for the active seeker, then paint the
  // result. Guards against a stale response landing after the AM has moved to a
  // different job (identity changed).
  function requestScore(context, banner) {
    const identity = buildIdentity(context);
    const cached = state.scoreCache.get(identity);
    if (cached) {
      renderScoreInto(banner, cached);
      return;
    }
    try {
      chrome.runtime.sendMessage(
        { type: "SCORE_JOB", job: context },
        function (response) {
          if (chrome.runtime.lastError) {
            return;
          }
          if (response && response.success) {
            state.scoreCache.set(identity, response);
          }
          if (state.lastIdentity !== identity) {
            return; // AM moved on; don't paint onto a different job's card
          }
          const live = document.getElementById("jobgenius-spy-banner");
          if (live) {
            renderScoreInto(live, response);
          }
        }
      );
    } catch (_) {
      // Background may be reloading; leave the card without a score.
    }
  }

  function renderBanner(context) {
    if (!document.body) {
      return;
    }

    removeBanner();

    const banner = document.createElement("div");
    banner.id = "jobgenius-spy-banner";
    banner.style.position = "fixed";
    banner.style.right = "16px";
    banner.style.bottom = "16px";
    banner.style.zIndex = "2147483647";
    banner.style.width = "330px";
    banner.style.maxWidth = "calc(100vw - 32px)";
    banner.style.background = "#111827";
    banner.style.color = "#f9fafb";
    banner.style.borderRadius = "12px";
    banner.style.boxShadow = "0 12px 30px rgba(0,0,0,0.28)";
    banner.style.padding = "14px";
    banner.style.fontFamily = "Segoe UI, Arial, sans-serif";
    banner.style.lineHeight = "1.4";

    const title = document.createElement("div");
    title.textContent = "JobGenius — Match Intelligence";
    title.style.fontSize = "12px";
    title.style.fontWeight = "700";
    title.style.letterSpacing = "0.02em";
    title.style.textTransform = "uppercase";
    title.style.color = "#93c5fd";

    const prompt = document.createElement("div");
    prompt.textContent = context.title;
    prompt.style.marginTop = "8px";
    prompt.style.fontSize = "13px";
    prompt.style.fontWeight = "600";

    const meta = document.createElement("div");
    meta.textContent = [context.company, context.location].filter(Boolean).join(" • ");
    meta.style.marginTop = "4px";
    meta.style.fontSize = "12px";
    meta.style.color = "#cbd5e1";

    // Score section, filled in asynchronously by requestScore().
    const scoreSlot = document.createElement("div");
    scoreSlot.dataset.jobgeniusScoreSlot = "1";
    scoreSlot.style.marginTop = "12px";
    const scoring = document.createElement("div");
    scoring.textContent = "Scoring this job for the active seeker…";
    scoring.style.fontSize = "11px";
    scoring.style.color = "#94a3b8";
    scoreSlot.appendChild(scoring);

    const status = document.createElement("div");
    status.dataset.jobgeniusSpyStatus = "1";
    status.style.marginTop = "2px";
    status.style.fontSize = "11px";
    status.style.color = "#9ca3af";
    status.textContent = "Applied outside the runner? Track it here.";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "10px";

    const yesButton = document.createElement("button");
    yesButton.textContent = "Yes, I Applied";
    yesButton.style.flex = "1";
    yesButton.style.border = "0";
    yesButton.style.borderRadius = "8px";
    yesButton.style.padding = "9px 10px";
    yesButton.style.background = "#2563eb";
    yesButton.style.color = "#ffffff";
    yesButton.style.fontSize = "12px";
    yesButton.style.fontWeight = "600";
    yesButton.style.cursor = "pointer";

    const noButton = document.createElement("button");
    noButton.textContent = "Dismiss";
    noButton.style.flex = "1";
    noButton.style.border = "1px solid #374151";
    noButton.style.borderRadius = "8px";
    noButton.style.padding = "9px 10px";
    noButton.style.background = "transparent";
    noButton.style.color = "#e5e7eb";
    noButton.style.fontSize = "12px";
    noButton.style.fontWeight = "600";
    noButton.style.cursor = "pointer";

    yesButton.addEventListener("click", function () {
      const identity = buildIdentity(context);
      yesButton.disabled = true;
      noButton.disabled = true;
      yesButton.style.opacity = "0.7";
      noButton.style.opacity = "0.7";
      setBannerStatus(banner, "Saving application to the profile...", "#93c5fd");

      chrome.runtime.sendMessage(
        {
          type: "JOB_SPY_MARK_APPLIED",
          job: context,
        },
        function (response) {
          if (chrome.runtime.lastError) {
            setBannerStatus(banner, "Failed to save application.", "#fca5a5");
            yesButton.disabled = false;
            noButton.disabled = false;
            yesButton.style.opacity = "1";
            noButton.style.opacity = "1";
            return;
          }

          if (!response || !response.success) {
            setBannerStatus(
              banner,
              (response && response.error) || "Failed to save application.",
              "#fca5a5"
            );
            yesButton.disabled = false;
            noButton.disabled = false;
            yesButton.style.opacity = "1";
            noButton.style.opacity = "1";
            return;
          }

          writeSessionFlag("jobgenius:spy:tracked:", identity);
          setBannerStatus(
            banner,
            response.already_tracked
              ? "This job was already tracked on the profile."
              : "Application saved to the profile.",
            "#86efac"
          );
          setTimeout(removeBanner, 2200);
        }
      );
    });

    noButton.addEventListener("click", function () {
      writeSessionFlag("jobgenius:spy:dismissed:", buildIdentity(context));
      removeBanner();
    });

    actions.appendChild(yesButton);
    actions.appendChild(noButton);
    banner.appendChild(title);
    banner.appendChild(prompt);
    if (meta.textContent) {
      banner.appendChild(meta);
    }
    banner.appendChild(scoreSlot);
    banner.appendChild(status);
    banner.appendChild(actions);
    document.body.appendChild(banner);

    requestScore(context, banner);
  }

  const state = {
    lastUrl: "",
    lastIdentity: "",
    scoreCache: new Map(),
    refresh: function (force) {
      const currentUrl = normalizeUrl(window.location.href);
      state.lastUrl = currentUrl;

      const context = extractJobContext();
      if (!context) {
        state.lastIdentity = "";
        removeBanner();
        return;
      }

      const identity = buildIdentity(context);
      if (
        readSessionFlag("jobgenius:spy:dismissed:", identity) ||
        readSessionFlag("jobgenius:spy:tracked:", identity)
      ) {
        state.lastIdentity = identity;
        removeBanner();
        return;
      }

      if (!force && identity === state.lastIdentity) {
        return;
      }

      state.lastIdentity = identity;
      renderBanner(context);
    },
  };

  window[GLOBAL_KEY] = state;
  window.setInterval(function () {
    state.refresh(false);
  }, 2000);
  window.setTimeout(function () {
    state.refresh(true);
  }, 300);
})();
