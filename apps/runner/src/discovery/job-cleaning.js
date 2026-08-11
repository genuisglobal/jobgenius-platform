const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

const WEIRD_CHARACTER_REPLACEMENTS = [
  [/â€¢/g, ' • '],
  [/â€“|â€”/g, '-'],
  [/Â·/g, ' · '],
  [/Â/g, ' '],
  [/\u00a0/g, ' '],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
];

const LOW_SIGNAL_DESCRIPTION_PATTERNS = [
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

function decodeBasicEntities(value) {
  let next = value;
  for (const [entity, replacement] of Object.entries(ENTITY_MAP)) {
    next = next.replaceAll(entity, replacement);
  }
  return next;
}

function replaceWeirdCharacters(value) {
  let next = value;
  for (const [pattern, replacement] of WEIRD_CHARACTER_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function normalizeText(value) {
  if (!value) {
    return null;
  }

  const cleaned = replaceWeirdCharacters(decodeBasicEntities(String(value)))
    .replace(/\r\n?/g, '\n')
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function collapseInlineWhitespace(value) {
  return value.replace(/[ \t\f\v]+/g, ' ').replace(/\s+\n/g, '\n').trim();
}

function titleCaseWord(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseLocation(value) {
  return value
    .split(/(\s+|,\s*|\s*\/\s*|\s+-\s*|\s+\|\s+)/)
    .map((segment) => {
      if (!segment || /^[\s,|/-]+$/.test(segment)) {
        return segment;
      }

      const upper = segment.toUpperCase();
      if (
        upper === 'USA' ||
        upper === 'US' ||
        upper === 'UK' ||
        upper === 'UAE' ||
        upper === 'EU' ||
        /^[A-Z]{2}$/.test(segment)
      ) {
        return upper;
      }

      return segment
        .split(' ')
        .map((part) => titleCaseWord(part))
        .join(' ');
    })
    .join('');
}

function dedupeLocationSegments(value) {
  const segments = value
    .split(',')
    .map((segment) => collapseInlineWhitespace(segment))
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(segment);
  }
  return unique.join(', ');
}

export function cleanDiscoveryTitle(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return collapseInlineWhitespace(
    normalized
      .replace(/^(job\s*title|position|role|opening|opportunity)\s*[:|-]\s*/i, '')
      .replace(/\s+\|\s+apply now$/i, '')
  );
}

export function cleanDiscoveryCompany(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return collapseInlineWhitespace(
    normalized
      .replace(/^(company|organization|employer)\s*[:|-]\s*/i, '')
      .replace(/\s+\|\s+careers?$/i, '')
  );
}

export function cleanDiscoveryLocation(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const collapsed = collapseInlineWhitespace(normalized);
  const lower = collapsed.toLowerCase();

  if (/^(remote|work from home|wfh|anywhere)$/i.test(collapsed)) {
    return 'Remote';
  }

  if (lower.includes('remote')) {
    if (/\b(united states|usa|u\.s\.)\b/i.test(collapsed)) {
      return 'Remote, United States';
    }
    if (/\bcanada\b/i.test(collapsed)) {
      return 'Remote, Canada';
    }
    if (/\buk|united kingdom\b/i.test(collapsed)) {
      return 'Remote, United Kingdom';
    }
  }

  if (/^(hybrid|flexible)$/i.test(collapsed)) {
    return 'Hybrid';
  }

  if (/^(on[\s-]?site|in[\s-]?office)$/i.test(collapsed)) {
    return 'On-site';
  }

  return titleCaseLocation(dedupeLocationSegments(collapsed));
}

export function cleanDiscoveryDescriptionText(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const lines = normalized
    .replace(/\t/g, ' ')
    .split(/\n+/)
    .map((line) =>
      collapseInlineWhitespace(
        line
          .replace(/^[•*\-]+\s*/g, '')
          .replace(/\s*[•·]\s*/g, ' • ')
      )
    )
    .filter(Boolean);

  const seen = new Set();
  const kept = [];

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

  const cleaned = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeDiscoveryFingerprintText(value) {
  return (normalizeText(value) ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildDiscoveredJobFingerprintKey(job) {
  const title = normalizeDiscoveryFingerprintText(cleanDiscoveryTitle(job?.title));
  const company = normalizeDiscoveryFingerprintText(cleanDiscoveryCompany(job?.company));
  const location = normalizeDiscoveryFingerprintText(cleanDiscoveryLocation(job?.location));

  if (!title || !company || !location) {
    return null;
  }

  return `${title}::${company}::${location}`;
}

export function cleanDiscoveredJobRecord(job) {
  return {
    ...job,
    external_id: normalizeText(job?.external_id),
    url: normalizeText(job?.url),
    title: cleanDiscoveryTitle(job?.title),
    company: cleanDiscoveryCompany(job?.company),
    location: cleanDiscoveryLocation(job?.location),
    salary: normalizeText(job?.salary),
    posted_at: normalizeText(job?.posted_at),
    description_text: cleanDiscoveryDescriptionText(job?.description_text),
    description_html: normalizeText(job?.description_html),
  };
}
