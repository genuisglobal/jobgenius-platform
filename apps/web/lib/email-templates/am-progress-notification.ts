const BRAND = "https://job-genius.com";
const LOGO = `${BRAND}/jobgenius-email-logo.png`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function card(label: string, value: string, detail = ""): string {
  return `<td style="width:50%;padding:6px;vertical-align:top;"><div style="background:#f5f3ff;border:1px solid #e9e3ff;border-radius:12px;padding:16px;min-height:76px;"><div style="color:#635b75;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(label)}</div><div style="color:#241448;font-size:26px;font-weight:800;line-height:1.25;margin-top:5px;">${escapeHtml(value)}</div>${detail ? `<div style="color:#635b75;font-size:12px;line-height:1.4;margin-top:4px;">${escapeHtml(detail)}</div>` : ""}</div></td>`;
}

function metric(line: string, weekly: boolean): { label: string; value: string; detail: string } | null {
  const match = line.match(/^(Applications|Phone interviews|All interviews|Offers):\s*(\d+)(?:\s*\((.+)\))?\.?$/);
  if (match) return { label: match[1], value: match[2], detail: match[3] ?? "" };
  if (weekly) return null;
  const total = line.match(/^(Last week|This week so far):\s*(\d+) applications logged overall;(.*)$/);
  if (total) return { label: total[1], value: total[2], detail: total[3].trim() };
  const outcomes = line.match(/^Phone interviews:\s*(\d+); all interviews:\s*(\d+); offers:\s*(\d+)\.$/);
  if (outcomes) return { label: "Phone interviews", value: outcomes[1], detail: `${outcomes[2]} interviews · ${outcomes[3]} offers` };
  return null;
}

/** The notification body stays the text and in-app source of truth. This formats its known AM lines for email. */
export function amProgressNotificationHtml(subject: string, body: string, linkUrl: string | null, weekly: boolean): string {
  const lines = body.split("\n");
  const metrics: { label: string; value: string; detail: string }[] = [];
  const sections: string[] = [];
  let clientRows: string[] = [];
  let inProductivityDetails = false;
  const flushClients = () => {
    if (!clientRows.length) return;
    sections.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 18px;">${clientRows.join("")}</table>`);
    clientRows = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushClients(); continue; }
    if (line === "Your measured productivity details:") inProductivityDetails = true;
    const stat = inProductivityDetails ? null : metric(line, weekly);
    if (stat) { metrics.push(stat); continue; }
    if (raw.startsWith("  ")) {
      clientRows.push(`<tr><td style="padding:10px 12px;border-bottom:1px solid #e9e3ff;color:#374151;font-size:13px;line-height:1.5;">${escapeHtml(line)}</td></tr>`);
      continue;
    }
    flushClients();
    if (line === "Client detail:" || line === "Per-client progress:" || line === "Your measured productivity details:") {
      sections.push(`<h3 style="font-size:15px;color:#241448;margin:22px 0 8px;">${escapeHtml(line.replace(/:$/, ""))}</h3>`);
    } else if (/^(You need |At the current pace|That pace could|You have already beaten|Client management capacity|Individual client coverage|Interview coverage)/.test(line)) {
      sections.push(`<div style="background:#fff7ed;border-left:4px solid #ff9800;border-radius:6px;padding:11px 14px;margin:10px 0;color:#523515;font-size:14px;line-height:1.5;">${escapeHtml(line)}</div>`);
    } else {
      sections.push(`<p style="margin:10px 0;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(line)}</p>`);
    }
  }
  flushClients();
  const rows: string[] = [];
  for (let i = 0; i < metrics.length; i += 2) rows.push(`<tr>${card(metrics[i].label, metrics[i].value, metrics[i].detail)}${metrics[i + 1] ? card(metrics[i + 1].label, metrics[i + 1].value, metrics[i + 1].detail) : '<td style="width:50%;"></td>'}</tr>`);
  const cta = linkUrl && linkUrl.startsWith("/") ? `<p style="margin:24px 0;"><a href="${BRAND}${escapeHtml(linkUrl)}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;">View your dashboard</a></p>` : "";
  return `<!DOCTYPE html><html><body style="margin:0;background:#f5f3f8;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f3f8;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;overflow:hidden;"><tr><td style="height:7px;background:#6d28d9;"></td></tr><tr><td style="padding:28px 28px 12px;"><div style="color:#ff8a00;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;">JobGenius · ${weekly ? "Weekly review" : "Daily progress"}</div><h1 style="font-size:23px;line-height:1.3;color:#241448;margin:9px 0 18px;">${escapeHtml(subject)}</h1>${rows.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 -6px 18px;">${rows.join("")}</table>` : ""}${sections.join("")}${cta}</td></tr><tr><td style="background:#241448;padding:22px 28px;text-align:center;"><img src="${LOGO}" alt="JobGenius" width="210" style="display:block;width:210px;max-width:100%;height:auto;margin:0 auto 12px;"/><p style="color:#d9d1ea;font-size:12px;line-height:1.5;margin:0;">Thank you for helping job seekers move forward.<br/>JobGenius · <a href="${BRAND}" style="color:#ffb447;text-decoration:none;">job-genius.com</a></p></td></tr></table></td></tr></table></body></html>`;
}
