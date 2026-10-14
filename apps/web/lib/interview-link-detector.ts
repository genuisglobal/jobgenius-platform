// ============================================================
// Scheduling-link detection for inbound recruiter replies.
//
// A recruiter reply containing a real scheduling-tool link (Calendly,
// HubSpot Meetings, Chili Piper, Cal.com, Microsoft Bookings) is a
// strong, deterministic signal — they're ready to book. Deliberately
// scoped to LINK detection only: freeform "Tuesday at 2pm" date/time
// extraction is fragile NLP territory (ambiguous timezones, relative
// dates, false positives on unrelated text) and a wrong extracted time
// is worse than none — the AM opens the link and books it themselves.
// ============================================================

export type DetectedSchedulingLink = {
  url: string;
  provider: string;
};

// Ordered by specificity so a more specific host match wins when a URL
// could plausibly match more than one (e.g. a HubSpot-hosted Chili Piper
// embed) — first match wins.
const SCHEDULING_PROVIDERS: { provider: string; hosts: string[] }[] = [
  { provider: "Calendly", hosts: ["calendly.com"] },
  { provider: "HubSpot Meetings", hosts: ["meetings.hubspot.com", "meetings-eu1.hubspot.com"] },
  { provider: "Chili Piper", hosts: ["chilipiper.com"] },
  { provider: "Cal.com", hosts: ["cal.com", "app.cal.com"] },
  { provider: "Microsoft Bookings", hosts: ["outlook.office365.com", "book.appointment-guide.com"] },
  { provider: "Google Calendar", hosts: ["calendar.app.google", "calendar.google.com"] },
  { provider: "GoodTime", hosts: ["goodtime.io"] },
  { provider: "Paraform", hosts: ["paraform.com"] },
  { provider: "SavvyCal", hosts: ["savvycal.com"] },
  { provider: "Doodle", hosts: ["doodle.com"] },
];

// A bare URL regex is deliberately loose (catches http/https, common TLDs
// in query strings, trailing punctuation trimmed below) — precision comes
// from the host allowlist above, not the URL pattern itself.
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]]+$/, "");
}

/**
 * Find the first scheduling-tool link in `text`, or null. Google
 * Calendar/Microsoft hosts are matched by pathname hint too (they're also
 * used for plain calendar viewing, not just booking) to reduce false
 * positives.
 */
export function detectSchedulingLink(text: string): DetectedSchedulingLink | null {
  if (!text) return null;
  const candidates = text.match(URL_PATTERN) ?? [];

  for (const raw of candidates) {
    const cleaned = stripTrailingPunctuation(raw);
    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      continue;
    }
    const host = parsed.hostname.toLowerCase();

    for (const { provider, hosts } of SCHEDULING_PROVIDERS) {
      if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) continue;

      // Google Calendar / generic office365 hosts serve more than booking
      // pages — require a booking-flavored path so a shared read-only
      // calendar link isn't treated as "ready to book".
      if (provider === "Google Calendar" || provider === "Microsoft Bookings") {
        if (!/\/(appointments|booking|book|schedul)/i.test(parsed.pathname)) continue;
      }

      return { url: cleaned, provider };
    }
  }

  return null;
}
