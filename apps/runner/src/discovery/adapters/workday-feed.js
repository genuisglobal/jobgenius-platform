/**
 * Workday Feed Adapter
 *
 * Fetches job postings from Workday's JSON search endpoint.
 * Requires a Workday career URL or equivalent tenant/site configuration.
 */

import { registerAdapter, normalizeJob, fetchJSON } from './base.js';
import { logLine } from '../../logger.js';

const LIST_PAGE_SIZE = 100;

function asTrimmedString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeKeywords(keywords) {
  if (Array.isArray(keywords)) {
    return keywords
      .map((value) => asTrimmedString(value))
      .filter(Boolean)
      .join(' ');
  }
  return asTrimmedString(keywords) || '';
}

function parseWorkdayCareerConfig(careerUrl, boardToken) {
  const normalizedUrl = asTrimmedString(careerUrl);
  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsed = new URL(normalizedUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);

    if (asTrimmedString(boardToken) && String(boardToken).includes('/')) {
      const [tenant, site] = String(boardToken).split('/').filter(Boolean);
      if (tenant && site) {
        return {
          origin: parsed.origin,
          tenant,
          site,
          boardToken: `${tenant}/${site}`,
        };
      }
    }

    const recruitingIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === 'recruiting'
    );

    if (recruitingIndex >= 0 && segments.length >= recruitingIndex + 3) {
      const tenant = segments[recruitingIndex + 1];
      const site = segments[recruitingIndex + 2];
      if (tenant && site) {
        return {
          origin: parsed.origin,
          tenant,
          site,
          boardToken: `${tenant}/${site}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function resolveWorkdayConfig(source, searchConfig = {}) {
  const explicitBoardToken =
    asTrimmedString(searchConfig.boardToken) ||
    asTrimmedString(searchConfig.tenantSite) ||
    asTrimmedString(searchConfig.company);
  const urlCandidates = [
    searchConfig.searchUrl,
    searchConfig.search_url,
    searchConfig.careerUrl,
    searchConfig.career_url,
    source?.adapter_config?.career_url,
    source?.base_url,
  ];

  for (const candidate of urlCandidates) {
    const config = parseWorkdayCareerConfig(candidate, explicitBoardToken);
    if (config) {
      return config;
    }
  }

  return null;
}

function extractWorkdayLocation(posting) {
  const locationsText = asTrimmedString(posting?.locationsText);
  if (locationsText) {
    return locationsText;
  }

  const bulletFields = Array.isArray(posting?.bulletFields)
    ? posting.bulletFields
        .map((field) => asTrimmedString(field))
        .filter(Boolean)
    : [];

  return bulletFields.length > 0 ? bulletFields.join(', ') : undefined;
}

function toAbsoluteUrl(origin, pathOrUrl) {
  const normalized = asTrimmedString(pathOrUrl);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized, origin).toString();
  } catch {
    return normalized;
  }
}

const adapter = {
  name: 'workday',
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
    const config = resolveWorkdayConfig(source, searchConfig);

    if (!config) {
      logLine({
        level: 'WARN',
        step: 'ADAPTER',
        msg: '[workday] Missing Workday career URL or tenant/site configuration',
      });
      return [];
    }

    const endpoint = `${config.origin}/wday/cxs/${encodeURIComponent(config.tenant)}/${encodeURIComponent(config.site)}/jobs`;
    const companyName =
      asTrimmedString(searchConfig.companyName) ||
      asTrimmedString(searchConfig.company) ||
      config.site;
    const searchText = normalizeKeywords(searchConfig.keywords);

    logLine({
      level: 'INFO',
      step: 'ADAPTER',
      msg: `[workday] Fetching postings for: ${config.tenant}/${config.site}`,
    });

    const jobs = [];
    let offset = 0;
    let totalFound = Number.POSITIVE_INFINITY;

    while (offset < totalFound && jobs.length < maxJobs) {
      const data = await fetchJSON(endpoint, {
        method: 'POST',
        body: {
          appliedFacets: {},
          limit: LIST_PAGE_SIZE,
          offset,
          searchText,
        },
      });

      const postings = Array.isArray(data?.jobPostings) ? data.jobPostings : [];
      const totalCandidate = Number(data?.total);
      totalFound = Number.isFinite(totalCandidate) ? totalCandidate : offset + postings.length;

      if (postings.length === 0) {
        break;
      }

      for (const posting of postings) {
        if (jobs.length >= maxJobs) {
          break;
        }

        const title = asTrimmedString(posting?.title);
        const externalPath = asTrimmedString(posting?.externalPath);
        const externalId =
          asTrimmedString(posting?.jobReqId) ||
          externalPath ||
          `${config.boardToken}-${offset}-${jobs.length}`;
        const location = extractWorkdayLocation(posting);
        const postingUrl =
          toAbsoluteUrl(config.origin, externalPath) ||
          asTrimmedString(searchConfig.searchUrl) ||
          asTrimmedString(searchConfig.search_url) ||
          asTrimmedString(searchConfig.careerUrl) ||
          asTrimmedString(searchConfig.career_url);

        const normalized = normalizeJob({
          external_id: externalId,
          source_name: 'workday',
          url: postingUrl,
          title,
          company: companyName,
          location,
          posted_at:
            asTrimmedString(posting?.postedOn) ||
            asTrimmedString(posting?.publicationDate) ||
            undefined,
          description_text: asTrimmedString(posting?.description),
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
      msg: `[workday] Normalized ${jobs.length} jobs for ${config.tenant}/${config.site}`,
    });

    return jobs;
  },
};

registerAdapter('workday', adapter);
export default adapter;
