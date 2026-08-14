/**
 * SmartRecruiters Feed Adapter
 *
 * Fetches job postings from SmartRecruiters company feeds.
 * Supports either a company identifier or a public SmartRecruiters career URL.
 */

import { registerAdapter, normalizeJob, fetchJSON } from './base.js';
import { logLine } from '../../logger.js';

const LIST_PAGE_SIZE = 100;
const MAX_DETAIL_FETCHES = 30;
const IGNORED_PATH_SEGMENTS = new Set(['jobs', 'company', 'careers']);

function asTrimmedString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function parseCompanyIdentifierFromUrl(url) {
  const normalizedUrl = asTrimmedString(url);
  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsed = new URL(normalizedUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const companySegment = segments.find(
      (segment) => !IGNORED_PATH_SEGMENTS.has(segment.toLowerCase())
    );
    return companySegment || null;
  } catch {
    return null;
  }
}

function resolveCompanyIdentifier(searchConfig = {}) {
  const explicitCandidates = [
    searchConfig.companyIdentifier,
    searchConfig.company,
    searchConfig.boardToken,
    searchConfig.company_slug,
  ];

  for (const candidate of explicitCandidates) {
    const normalized = asTrimmedString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const urlCandidates = [
    searchConfig.searchUrl,
    searchConfig.search_url,
    searchConfig.careerUrl,
    searchConfig.career_url,
  ];

  for (const candidate of urlCandidates) {
    const parsed = parseCompanyIdentifierFromUrl(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function formatLocation(location) {
  if (!location || typeof location !== 'object') {
    return undefined;
  }

  const parts = [location.city, location.region, location.country]
    .map((value) => asTrimmedString(value))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : undefined;
}

function resolvePostingUrl(companyIdentifier, posting) {
  const refUrl = asTrimmedString(posting?.ref);
  if (refUrl && looksLikeUrl(refUrl)) {
    return refUrl;
  }

  const postingUrl = asTrimmedString(posting?.postingUrl);
  if (postingUrl && looksLikeUrl(postingUrl)) {
    return postingUrl;
  }

  const postingId = asTrimmedString(posting?.id);
  if (!postingId) {
    return null;
  }

  return `https://jobs.smartrecruiters.com/${encodeURIComponent(companyIdentifier)}/${encodeURIComponent(postingId)}`;
}

function buildDescriptionText(detail) {
  const sections = Array.isArray(detail?.jobAd?.sections) ? detail.jobAd.sections : [];
  const parts = sections
    .map((section) => asTrimmedString(section?.text))
    .filter(Boolean);

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

async function fetchPostingDetail(companyIdentifier, postingId) {
  try {
    return await fetchJSON(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyIdentifier)}/postings/${encodeURIComponent(postingId)}`,
      { rateDelay: 400 }
    );
  } catch (error) {
    logLine({
      level: 'WARN',
      step: 'ADAPTER',
      msg: `[smartrecruiters] Failed to fetch detail for ${postingId}: ${error.message}`,
    });
    return null;
  }
}

const adapter = {
  name: 'smartrecruiters',
  type: 'feed',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const maxJobs = Number.isFinite(Number(searchConfig.maxJobs))
      ? Math.max(1, Number(searchConfig.maxJobs))
      : 50;
    const companyIdentifier = resolveCompanyIdentifier(searchConfig);

    if (!companyIdentifier) {
      logLine({
        level: 'WARN',
        step: 'ADAPTER',
        msg: '[smartrecruiters] Missing company identifier or SmartRecruiters career URL',
      });
      return [];
    }

    logLine({
      level: 'INFO',
      step: 'ADAPTER',
      msg: `[smartrecruiters] Fetching postings for: ${companyIdentifier}`,
    });

    const jobs = [];
    let offset = 0;
    let totalFound = Number.POSITIVE_INFINITY;
    let detailFetchCount = 0;

    while (offset < totalFound && jobs.length < maxJobs) {
      const data = await fetchJSON(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyIdentifier)}/postings?limit=${LIST_PAGE_SIZE}&offset=${offset}`
      );
      const postings = Array.isArray(data?.content) ? data.content : [];
      const totalCandidate = Number(data?.totalFound);
      totalFound = Number.isFinite(totalCandidate) ? totalCandidate : offset + postings.length;

      if (postings.length === 0) {
        break;
      }

      for (const posting of postings) {
        if (jobs.length >= maxJobs) {
          break;
        }

        const postingId = asTrimmedString(posting?.id);
        const postingUrl = resolvePostingUrl(companyIdentifier, posting);
        if (!postingId || !postingUrl) {
          continue;
        }

        let descriptionText;
        if (detailFetchCount < MAX_DETAIL_FETCHES) {
          detailFetchCount += 1;
          const detail = await fetchPostingDetail(companyIdentifier, postingId);
          descriptionText = buildDescriptionText(detail);
        }

        const normalized = normalizeJob({
          external_id: postingId,
          source_name: 'smartrecruiters',
          url: postingUrl,
          title: posting?.name,
          company: asTrimmedString(searchConfig.companyName) || companyIdentifier,
          location: formatLocation(posting?.location),
          posted_at:
            asTrimmedString(posting?.releasedDate) ||
            asTrimmedString(posting?.createdOn) ||
            asTrimmedString(posting?.updatedOn) ||
            undefined,
          description_text: descriptionText,
        });

        if (normalized) {
          jobs.push(normalized);
        }
      }

      if (postings.length < LIST_PAGE_SIZE) {
        break;
      }

      offset += postings.length;
    }

    logLine({
      level: 'INFO',
      step: 'ADAPTER',
      msg: `[smartrecruiters] Normalized ${jobs.length} jobs for ${companyIdentifier}`,
    });

    return jobs;
  },
};

registerAdapter('smartrecruiters', adapter);
export default adapter;
