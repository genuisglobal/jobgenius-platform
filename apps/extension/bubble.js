// JobGenius floating bubble — a persistent content script that shows a draggable
// action bubble on application pages, giving one-click access to autofill and
// résumé tailoring without opening the popup. When "auto-autofill" is enabled it
// also fills detected application forms automatically (fill-only; human submits).
(function () {
  if (window.__jobGeniusBubble) return;
  window.__jobGeniusBubble = true;

  const STORAGE_KEYS = {
    authToken: "authToken",
    activeSeekerId: "activeSeekerId",
    autoAutofill: "autoAutofill",
  };

  const ATS_HOSTS = [
    "greenhouse.io",
    "lever.co",
    "myworkdayjobs.com",
    "workday.com",
    "ashbyhq.com",
    "smartrecruiters.com",
    "icims.com",
    "jobvite.com",
    "breezy.hr",
    "bamboohr.com",
    "workable.com",
    "recruitee.com",
    "jobvite.com",
  ];

  function getStorage(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, resolve);
      } catch (_) {
        resolve({});
      }
    });
  }

  const EXCLUDED_HOSTS = ["job-genius.com", "vercel.app", "localhost"];

  // Heuristic: does this page host a job application form?
  function looksLikeApplication() {
    const host = location.hostname.toLowerCase();
    if (EXCLUDED_HOSTS.some((h) => host.includes(h))) return false;
    if (ATS_HOSTS.some((h) => host.includes(h))) return true;

    const hasEmail = !!document.querySelector(
      "input[type='email'], input[name*='email' i], input[id*='email' i]"
    );
    const hasFile = !!document.querySelector("input[type='file']");
    const fieldCount = document.querySelectorAll("input, textarea, select").length;
    const applyText = /\bapply\b|application/i.test(
      (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 4000)
    );
    return (hasEmail && fieldCount >= 4) || (hasFile && fieldCount >= 4 && applyText);
  }

  function iconSvg() {
    return (
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" ' +
      'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>'
    );
  }

  let bubbleEl = null;
  let menuOpen = false;

  function sendAutofill(tailor) {
    try {
      chrome.runtime.sendMessage({ type: "AUTOFILL_ACTIVE_TAB", tailor: !!tailor });
    } catch (_) {
      /* background may be reloading */
    }
  }

  function buildMenu() {
    const menu = document.createElement("div");
    menu.id = "jobgenius-bubble-menu";
    menu.style.cssText =
      "position:absolute;bottom:56px;right:0;display:none;flex-direction:column;gap:6px;" +
      "background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:8px;" +
      "box-shadow:0 12px 30px rgba(0,0,0,.2);min-width:190px";
    const mk = (label, handler) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "border:0;background:#f5f3ff;color:#4f46e5;font:600 12px Segoe UI,Arial,sans-serif;" +
        "padding:9px 10px;border-radius:8px;cursor:pointer;text-align:left;white-space:nowrap";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        handler();
        toggleMenu(false);
      });
      return b;
    };
    menu.appendChild(mk("Autofill this page", () => sendAutofill(false)));
    menu.appendChild(mk("Tailor résumé & autofill", () => sendAutofill(true)));
    return menu;
  }

  function toggleMenu(force) {
    if (!bubbleEl) return;
    const menu = bubbleEl.querySelector("#jobgenius-bubble-menu");
    menuOpen = typeof force === "boolean" ? force : !menuOpen;
    menu.style.display = menuOpen ? "flex" : "none";
  }

  function renderBubble() {
    if (bubbleEl) return;
    bubbleEl = document.createElement("div");
    bubbleEl.id = "jobgenius-bubble";
    bubbleEl.style.cssText =
      "position:fixed;right:20px;bottom:24px;z-index:2147483646;font-family:Segoe UI,Arial,sans-serif";

    const btn = document.createElement("div");
    btn.style.cssText =
      "width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6d28d9,#4f46e5);" +
      "display:flex;align-items:center;justify-content:center;cursor:grab;" +
      "box-shadow:0 8px 22px rgba(79,70,229,.45)";
    btn.innerHTML = iconSvg();
    btn.title = "JobGenius — autofill this page";

    bubbleEl.appendChild(buildMenu());
    bubbleEl.appendChild(btn);
    document.body.appendChild(bubbleEl);

    // Drag vs click: a small move counts as a drag (reposition); otherwise click.
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originRight = 20;
    let originBottom = 24;

    btn.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originRight = parseInt(bubbleEl.style.right, 10) || 20;
      originBottom = parseInt(bubbleEl.style.bottom, 10) || 24;
      btn.style.cursor = "grabbing";
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      bubbleEl.style.right = Math.max(6, originRight - dx) + "px";
      bubbleEl.style.bottom = Math.max(6, originBottom - dy) + "px";
    });
    btn.addEventListener("pointerup", (e) => {
      dragging = false;
      btn.style.cursor = "grab";
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      if (!moved) toggleMenu();
    });

    document.addEventListener("click", (e) => {
      if (menuOpen && bubbleEl && !bubbleEl.contains(e.target)) toggleMenu(false);
    });
  }

  let autoFired = false;
  async function evaluate() {
    const { authToken, activeSeekerId, autoAutofill } = await getStorage(
      Object.values(STORAGE_KEYS)
    );
    // Show the bubble whenever connected with an active seeker (except on our own
    // app). It stays a persistent launcher — the application form may live in an
    // iframe the top frame can't see, so we don't gate visibility on detection.
    if (!authToken || !activeSeekerId) return;
    const host = location.hostname.toLowerCase();
    if (EXCLUDED_HOSTS.some((h) => host.includes(h))) return;

    renderBubble();

    // Auto-autofill only when the page actually looks like an application.
    if (autoAutofill && !autoFired && looksLikeApplication()) {
      autoFired = true;
      sendAutofill(false);
    }
  }

  function schedule() {
    setTimeout(evaluate, 1200);
    // Re-check for SPA navigations / late-rendered forms (bounded).
    let checks = 0;
    const iv = setInterval(() => {
      checks += 1;
      if (bubbleEl || checks > 6) {
        clearInterval(iv);
        return;
      }
      evaluate();
    }, 2500);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    schedule();
  } else {
    window.addEventListener("DOMContentLoaded", schedule);
  }
})();
