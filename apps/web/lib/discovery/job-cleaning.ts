type DiscoveredJobLike = {
  external_id: string | null;
  source_name: string;
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  posted_at: string | null;
  description_text: string | null;
  description_html: string | null;
};

type MirrorComparableJob = {
  title: string | null | undefined;
  company: string | null | undefined;
  location: string | null | undefined;
  description_text: string | null | undefined;
  posted_at?: string | null | undefined;
};

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

const WEIRD_CHARACTER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/â€¢/g, " • "],
  [/â€“|â€”/g, "-"],
  [/Â·/g, " · "],
  [/Â/g, " "],
  [/\u00a0/g, " "],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2013\u2014]/g, "-"],
];

const LOW_SIGNAL_DESCRIPTION_PATTERNS: RegExp[] = [
  /\bapply now\b/i,
  /\bclick here\b/i,
  /\bsave job\b/i,
  /\bshare (this )?job\b/i,
  /\bjob alert\b/i,
  /\bsign in\b.*\bjob\b/i,
  /\bprivacy policy\b/i,
  /\bcookie policy\b/i,
  /\bterms of use\b/i,
  /\bequal opportunity employer\b/i,
  /\ball qualified applicants will receive consideration\b/i,
  /\breasonable accommodation\b/i,
  /\be-verify\b/i,
  /\bpay transparency\b/i,
];

function decodeBasicEntities(value: string) {
  let next = value;
  for (const [entity, replacement] of Object.entries(ENTITY_MAP)) {
    next = next.replaceAll(entity, replacement);
  }
  return next;
}

function replaceWeirdCharacters(value: string) {
  let next = value;
  for (const [pattern, replacement] of WEIRD_CHARACTER_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function normalizeText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = replaceWeirdCharacters(decodeBasicEntities(value))
    .replace(/\r\n?/g, "\n")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function collapseInlineWhitespace(value: string) {
  return value.replace(/[ \t\f\v]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

function titleCaseWord(word: string) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseLocation(value: string) {
  return value
    .split(/(\s+|,\s*|\s*\/\s*|\s+-\s*|\s+\|\s+)/)
    .map((segment) => {
      if (!segment || /^[\s,|/-]+$/.test(segment)) {
        return segment;
      }

      const upper = segment.toUpperCase();
      if (
        upper === "USA" ||
        upper === "US" ||
        upper === "UK" ||
        upper === "UAE" ||
        upper === "EU" ||
        /^[A-Z]{2}$/.test(segment)
      ) {
        return upper;
      }

      return segment
        .split(" ")
        .map((part) => titleCaseWord(part))
        .join(" ");
    })
    .join("");
}

function dedupeLocationSegments(value: string) {
  const segments = value
    .split(",")
    .map((segment) => collapseInlineWhitespace(segment))
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(segment);
  }
  return unique.join(", ");
}

export function cleanDiscoveryTitle(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return collapseInlineWhitespace(
    normalized
      .replace(/^(job\s*title|position|role|opening|opportunity)\s*[:|-]\s*/i, "")
      .replace(/\s+\|\s+apply now$/i, "")
  );
}

export function cleanDiscoveryCompany(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return collapseInlineWhitespace(
    normalized
      .replace(/^(company|organization|employer)\s*[:|-]\s*/i, "")
      .replace(/\s+\|\s+careers?$/i, "")
  );
}

export function cleanDiscoveryLocation(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const collapsed = collapseInlineWhitespace(normalized);
  const lower = collapsed.toLowerCase();

  if (/^(remote|work from home|wfh|anywhere)$/i.test(collapsed)) {
    return "Remote";
  }

  if (lower.includes("remote")) {
    if (/\b(united states|usa|u\.s\.)\b/i.test(collapsed)) {
      return "Remote, United States";
    }
    if (/\bcanada\b/i.test(collapsed)) {
      return "Remote, Canada";
    }
    if (/\buk|united kingdom\b/i.test(collapsed)) {
      return "Remote, United Kingdom";
    }
  }

  if (/^(hybrid|flexible)$/i.test(collapsed)) {
    return "Hybrid";
  }

  if (/^(on[\s-]?site|in[\s-]?office)$/i.test(collapsed)) {
    return "On-site";
  }

  return titleCaseLocation(dedupeLocationSegments(collapsed));
}

export function cleanDiscoverySalary(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return collapseInlineWhitespace(
    normalized
      .replace(/^(salary|compensation|pay range|pay|base pay)\s*[:|-]\s*/i, "")
      .replace(/\bper annum\b/gi, "annual")
  );
}

export function cleanDiscoveryDescriptionText(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const lines = normalized
    .replace(/\t/g, " ")
    .split(/\n+/)
    .map((line) =>
      collapseInlineWhitespace(
        line
          .replace(/^[•*\-]+\s*/g, "")
          .replace(/\s*[•·]\s*/g, " • ")
      )
    )
    .filter(Boolean);

  const seen = new Set<string>();
  const kept: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (LOW_SIGNAL_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    if (line.length <= 2) {
      continue;
    }
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    kept.push(line);
  }

  const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeDiscoveryFingerprintText(value: string | null | undefined) {
  return (normalizeText(value) ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildDiscoveredJobFingerprintKey(job: {
  title: string | null | undefined;
  company: string | null | undefined;
  location: string | null | undefined;
}) {
  const title = normalizeDiscoveryFingerprintText(cleanDiscoveryTitle(job.title));
  const company = normalizeDiscoveryFingerprintText(cleanDiscoveryCompany(job.company));
  const location = normalizeDiscoveryFingerprintText(cleanDiscoveryLocation(job.location));

  if (!title || !company || !location) {
    return null;
  }

  return `${title}::${company}::${location}`;
}

function tokenizeComparisonText(value: string) {
  return value
    .split(/[^a-z0-9+#]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function computeContainmentRatio(left: string, right: string) {
  const leftTokens = new Set(tokenizeComparisonText(left));
  const rightTokens = new Set(tokenizeComparisonText(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of Array.from(leftTokens)) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.min(leftTokens.size, rightTokens.size);
}

function parseDayStamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

export function areLikelyMirroredDiscoveredJobs(
  incoming: MirrorComparableJob,
  existing: MirrorComparableJob
) {
  const incomingKey = buildDiscoveredJobFingerprintKey(incoming);
  const existingKey = buildDiscoveredJobFingerprintKey(existing);

  if (!incomingKey || !existingKey || incomingKey !== existingKey) {
    return false;
  }

  const incomingDescription = normalizeDiscoveryFingerprintText(
    cleanDiscoveryDescriptionText(incoming.description_text)
  );
  const existingDescription = normalizeDiscoveryFingerprintText(
    cleanDiscoveryDescriptionText(existing.description_text)
  );

  if (incomingDescription && existingDescription) {
    if (incomingDescription === existingDescription) {
      return true;
    }

    if (
      incomingDescription.includes(existingDescription) ||
      existingDescription.includes(incomingDescription)
    ) {
      const shorterLength = Math.min(incomingDescription.length, existingDescription.length);
      if (shorterLength >= 120) {
        return true;
      }
    }

    return computeContainmentRatio(incomingDescription, existingDescription) >= 0.82;
  }

  if (!incomingDescription && !existingDescription) {
    const incomingDay = parseDayStamp(incoming.posted_at);
    const existingDay = parseDayStamp(existing.posted_at);
    return Boolean(incomingDay && existingDay && incomingDay === existingDay);
  }

  return false;
}

export function cleanDiscoveredJobRecord<T extends DiscoveredJobLike>(job: T): T {
  return {
    ...job,
    external_id: normalizeText(job.external_id),
    url: normalizeText(job.url),
    title: cleanDiscoveryTitle(job.title),
    company: cleanDiscoveryCompany(job.company),
    location: cleanDiscoveryLocation(job.location),
    salary: cleanDiscoverySalary(job.salary),
    posted_at: normalizeText(job.posted_at),
    description_text: cleanDiscoveryDescriptionText(job.description_text),
    description_html: normalizeText(job.description_html),
  };
}
