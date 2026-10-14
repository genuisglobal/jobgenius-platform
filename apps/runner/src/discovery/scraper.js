/**
 * Intelligent Job Board Scraper
 *
 * Uses Playwright to scrape job listings from various job boards.
 * Handles infinite scroll, pagination, dynamic content loading, and hidden
 * job payload extraction from JSON-LD, hydration state, and XHR/fetch JSON.
 */

import { chromium } from 'playwright';
import { logLine } from '../logger.js';
import {
  buildDiscoveredJobFingerprintKey,
  cleanDiscoveredJobRecord,
} from './job-cleaning.js';

/** @type {import('./types.js').ScraperConfig} */
const DEFAULT_CONFIG = {
  maxPages: 10,
  maxJobs: 100,
  maxZeroYieldPages: 1,
  maxDescriptionFetches: 20,
  scrollDelay: 1000,
  pageTimeout: 30000,
  headless: true,
  fetchDescriptions: false,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const HIDDEN_STATE_GLOBALS = [
  '__NEXT_DATA__',
  '__INITIAL_STATE__',
  '__PRELOADED_STATE__',
  '__APOLLO_STATE__',
  '__NUXT__',
  '__NUXT_DATA__',
  '__INITIAL_PROPS__',
  '__data',
  '__JOBS_STATE__',
];

const MAX_SCRIPT_PAYLOADS = 10;
const MAX_SCRIPT_TEXT_LENGTH = 350000;
const MAX_NETWORK_PAYLOADS = 60;
const MAX_NETWORK_QUEUE = 500;
const MAX_JSON_TRAVERSAL_DEPTH = 8;
const MAX_JSON_TRAVERSAL_NODES = 5000;

const DESCRIPTION_SELECTORS = {
  linkedin: '.description__text, .show-more-less-html__markup',
  indeed: '#jobDescriptionText, .jobsearch-jobDescriptionText',
  glassdoor: '[data-test="jobDescription"], .desc',
};

const JOB_IDENTIFIER_KEYS = [
  'jobid',
  'job_id',
  'jobreqid',
  'requisitionid',
  'requisition_id',
  'reqid',
  'postingid',
  'posting_id',
  'externalid',
  'external_id',
  'jobkey',
  'positionid',
  'position_id',
];

const JOB_URL_HINTS = ['job', 'jobs', 'posting', 'position', 'requisition', 'vacancy', 'career'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asCleanString(value) {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function firstString(...values) {
  for (const value of values) {
    const normalized = asCleanString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function stripHtml(html) {
  const normalized = asCleanString(html);
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeAbsoluteUrl(value, baseUrl) {
  const normalized = asCleanString(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return normalized;
  }
}

function normalizeComparableUrl(value) {
  const normalized = normalizeAbsoluteUrl(value, 'https://example.com');
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function looksLikeJobPayloadUrl(url) {
  const normalized = asCleanString(url)?.toLowerCase();
  if (!normalized) {
    return false;
  }

  return JOB_URL_HINTS.some((hint) => normalized.includes(hint));
}

function locationFromValue(value) {
  const direct = asCleanString(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    const parts = value.map((entry) => locationFromValue(entry)).filter(Boolean);
    return parts.length > 0 ? parts.join('; ') : null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const parts = [
    value.name,
    value.location,
    value.locationName,
    value.locationsText,
    value.addressLocality,
    value.addressRegion,
    value.addressCountry,
    value.city,
    value.region,
    value.country,
  ]
    .map((entry) => asCleanString(entry))
    .filter(Boolean);

  if (parts.length > 0) {
    return Array.from(new Set(parts)).join(', ');
  }

  if (value.address) {
    return locationFromValue(value.address);
  }

  return null;
}

function companyFromValue(value) {
  const direct = asCleanString(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const company = companyFromValue(entry);
      if (company) {
        return company;
      }
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  return firstString(
    value.name,
    value.companyName,
    value.employerName,
    value.organizationName,
    value.legalName
  );
}

function salaryFromValue(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const salary = salaryFromValue(entry);
      if (salary) {
        return salary;
      }
    }
    return null;
  }

  const direct = asCleanString(value);
  if (direct) {
    return direct;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const currency = asCleanString(value.currency) || asCleanString(value.currencyCode);
  const minValue = firstString(value.minValue, value.value?.minValue);
  const maxValue = firstString(value.maxValue, value.value?.maxValue);
  const exactValue = firstString(value.value, value.amount);

  if (minValue || maxValue) {
    if (minValue && maxValue) {
      return `${minValue} - ${maxValue}${currency ? ` ${currency}` : ''}`.trim();
    }
    const singleValue = minValue || maxValue;
    return `${singleValue}${currency ? ` ${currency}` : ''}`.trim();
  }

  if (exactValue) {
    return `${exactValue}${currency ? ` ${currency}` : ''}`.trim();
  }

  return null;
}

function hasJobIdentifierSignal(node) {
  const keys = Object.keys(node).map((key) => key.toLowerCase());
  return JOB_IDENTIFIER_KEYS.some((key) => keys.includes(key));
}

function looksLikeJobPostingType(value) {
  const normalized = asCleanString(value)?.toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('jobposting') || normalized === 'job' || normalized.includes('posting');
}

function buildStructuredJobCandidate(node, context, inherited) {
  if (!isPlainObject(node)) {
    return null;
  }

  const schemaType = firstString(node['@type'], node.type, node.schemaType);
  const title = firstString(node.title, node.name, node.jobTitle, node.positionTitle);
  const url = normalizeAbsoluteUrl(
    firstString(
      node.url,
      node.applyUrl,
      node.jobUrl,
      node.absolute_url,
      node.hostedUrl,
      node.postingUrl,
      node.canonicalUrl,
      node.externalPath
    ),
    context.baseUrl
  );
  const externalId = firstString(
    node.external_id,
    node.externalId,
    node.jobId,
    node.jobID,
    node.jobReqId,
    node.requisitionId,
    node.requisition_id,
    node.postingId,
    node.reference,
    node.ref,
    node.id
  );
  const company =
    companyFromValue(
      node.company ??
        node.companyName ??
        node.hiringOrganization ??
        node.organization ??
        node.employer
    ) ?? inherited.company;
  const location =
    locationFromValue(
      node.location ??
        node.locations ??
        node.locationName ??
        node.locationsText ??
        node.jobLocation ??
        node.address
    ) ?? inherited.location;
  const salary = salaryFromValue(
    node.salary ??
      node.salaryRange ??
      node.baseSalary ??
      node.compensation
  );
  const descriptionHtml = firstString(
    node.description_html,
    node.descriptionHtml,
    node.content,
    node.bodyHtml,
    node.html
  );
  const descriptionText =
    firstString(
      node.description_text,
      node.descriptionPlain,
      node.plainTextDescription,
      node.summary,
      node.snippet,
      node.jobDescription,
      node.description,
      node.body,
      node.teaser
    ) ??
    stripHtml(descriptionHtml);
  const postedAt = firstString(
    node.datePosted,
    node.postedAt,
    node.posted_at,
    node.publicationDate,
    node.publication_date,
    node.createdAt,
    node.created_at,
    node.updatedAt,
    node.updated_at,
    node.releasedDate
  );

  const hasStructuredJobType = looksLikeJobPostingType(schemaType);
  const hasDescription = Boolean(descriptionText || descriptionHtml);
  const hasIdentifierSignal = hasJobIdentifierSignal(node) || looksLikeJobPayloadUrl(url || context.baseUrl);
  const signalCount =
    Number(hasStructuredJobType) +
    Number(Boolean(company)) +
    Number(Boolean(location)) +
    Number(Boolean(hasDescription)) +
    Number(hasIdentifierSignal);
  const requiredSignalCount = hasStructuredJobType ? 2 : 3;

  if (!title || (!url && !externalId) || signalCount < requiredSignalCount) {
    return null;
  }

  return {
    external_id: externalId,
    source_name: context.sourceName,
    url,
    title,
    company,
    location,
    salary,
    posted_at: postedAt,
    description_text: descriptionText,
    description_html: descriptionHtml,
  };
}

function extractJobsFromStructuredPayload(payload, context) {
  const jobs = [];
  const visited = new WeakSet();
  let nodesVisited = 0;

  function walk(node, depth, inherited) {
    if (node == null || depth > MAX_JSON_TRAVERSAL_DEPTH || nodesVisited >= MAX_JSON_TRAVERSAL_NODES) {
      return;
    }

    if (Array.isArray(node)) {
      for (const entry of node.slice(0, 250)) {
        walk(entry, depth + 1, inherited);
      }
      return;
    }

    if (!isPlainObject(node)) {
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    nodesVisited += 1;

    const nextInherited = {
      company:
        companyFromValue(
          node.company ??
            node.companyName ??
            node.hiringOrganization ??
            node.organization ??
            node.employer
        ) ?? inherited.company,
      location:
        locationFromValue(
          node.location ??
            node.locations ??
            node.locationName ??
            node.locationsText ??
            node.jobLocation ??
            node.address
        ) ?? inherited.location,
    };

    const candidate = buildStructuredJobCandidate(node, context, nextInherited);
    if (candidate) {
      jobs.push(candidate);
    }

    for (const value of Object.values(node).slice(0, 120)) {
      walk(value, depth + 1, nextInherited);
    }
  }

  walk(payload, 0, { company: null, location: null });
  return jobs;
}

async function collectStructuredPagePayloads(page) {
  return page.evaluate(
    ({ stateGlobals, maxScripts, maxScriptTextLength }) => {
      const safeParseJson = (text) => {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();
        if (!trimmed || trimmed.length > maxScriptTextLength) return null;
        try {
          return JSON.parse(trimmed);
        } catch {
          return null;
        }
      };

      const cloneSerializable = (value, depth = 0, seen = new WeakSet()) => {
        if (value == null || depth > 6) return null;
        if (typeof value === 'string') {
          return value.length > maxScriptTextLength ? value.slice(0, maxScriptTextLength) : value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return value;
        }
        if (Array.isArray(value)) {
          return value.slice(0, 120).map((entry) => cloneSerializable(entry, depth + 1, seen));
        }
        if (typeof value === 'object') {
          if (seen.has(value)) return null;
          seen.add(value);
          const output = {};
          for (const [key, entry] of Object.entries(value).slice(0, 120)) {
            output[key] = cloneSerializable(entry, depth + 1, seen);
          }
          return output;
        }
        return null;
      };

      const ldJsonPayloads = [];
      const jsonScriptPayloads = [];

      for (const script of Array.from(document.scripts)) {
        const type = (script.type || '').toLowerCase();
        const parsed = safeParseJson(script.textContent || '');
        if (!parsed) continue;

        if (type === 'application/ld+json') {
          if (ldJsonPayloads.length < maxScripts) {
            ldJsonPayloads.push(parsed);
          }
          continue;
        }

        if (type === 'application/json' && jsonScriptPayloads.length < maxScripts) {
          jsonScriptPayloads.push(parsed);
        }
      }

      const statePayloads = [];
      for (const key of stateGlobals) {
        if (statePayloads.length >= maxScripts) break;
        try {
          if (typeof window[key] === 'undefined') continue;
          const cloned = cloneSerializable(window[key]);
          if (cloned != null) {
            statePayloads.push({ key, value: cloned });
          }
        } catch {
          // Ignore inaccessible or non-serializable globals.
        }
      }

      return {
        pageUrl: window.location.href,
        ldJsonPayloads,
        jsonScriptPayloads,
        statePayloads,
      };
    },
    {
      stateGlobals: HIDDEN_STATE_GLOBALS,
      maxScripts: MAX_SCRIPT_PAYLOADS,
      maxScriptTextLength: MAX_SCRIPT_TEXT_LENGTH,
    }
  );
}

/**
 * Main scraper class for job discovery
 */
export class JobScraper {
  /**
   * @param {import('./types.js').JobSource} source
   * @param {Partial<import('./types.js').ScraperConfig>} config
   */
  constructor(source, config = {}) {
    this.source = source;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.browser = null;
    this.context = null;
    this.page = null;
    this.jobsCollected = [];
    this.jobIndexByKey = new Map();
    this.networkPayloadKeys = new Set();
    this.pendingNetworkJobs = [];
    this.hiddenExtractionStats = {
      dom_new_jobs: 0,
      hidden_new_jobs: 0,
      jsonld_candidates: 0,
      state_candidates: 0,
      network_candidates: 0,
      network_payloads_seen: 0,
      network_payloads_parsed: 0,
    };
  }

  /**
   * Initialize the browser
   */
  async init() {
    logLine({ level: 'INFO', step: 'SCRAPER', msg: `Initializing browser for ${this.source.name}` });

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
    });

    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.pageTimeout);
    this.setupNetworkCapture(this.page);

    logLine({ level: 'INFO', step: 'SCRAPER', msg: 'Browser initialized' });
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  setupNetworkCapture(page) {
    page.on('response', (response) => {
      this.captureNetworkPayload(response).catch(() => {
        // Ignore capture failures to keep scraping resilient.
      });
    });
  }

  async captureNetworkPayload(response) {
    if (this.networkPayloadKeys.size >= MAX_NETWORK_PAYLOADS) {
      return;
    }

    const request = response.request();
    const resourceType = request.resourceType();
    if (resourceType !== 'xhr' && resourceType !== 'fetch') {
      return;
    }

    const url = response.url();
    const headers = response.headers();
    const contentType = String(headers['content-type'] || '').toLowerCase();

    if (!contentType.includes('json') || !looksLikeJobPayloadUrl(url)) {
      return;
    }

    if (this.networkPayloadKeys.has(url)) {
      return;
    }

    this.networkPayloadKeys.add(url);
    this.hiddenExtractionStats.network_payloads_seen += 1;

    let payload;
    try {
      payload = await response.json();
    } catch {
      return;
    }

    const candidates = extractJobsFromStructuredPayload(payload, {
      sourceName: this.source.name,
      baseUrl: url,
    });

    if (candidates.length === 0) {
      return;
    }

    this.hiddenExtractionStats.network_payloads_parsed += 1;
    this.hiddenExtractionStats.network_candidates += candidates.length;
    this.pendingNetworkJobs.push(...candidates);

    if (this.pendingNetworkJobs.length > MAX_NETWORK_QUEUE) {
      this.pendingNetworkJobs = this.pendingNetworkJobs.slice(-MAX_NETWORK_QUEUE);
    }
  }

  /**
   * Scrape jobs from a search URL
   * @param {string} searchUrl
   * @returns {Promise<import('./types.js').DiscoveryRunResult>}
   */
  async scrape(searchUrl) {
    const startTime = Date.now();
    let pagesScraped = 0;
    let errorMessage = null;
    let stopReason = 'completed';
    let zeroYieldStreak = 0;
    let initialJobCardsSelectorMissing = false;
    let descriptionFetchStats = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      hidden_fallback_succeeded: 0,
    };

    try {
      await this.init();

      logLine({ level: 'INFO', step: 'SCRAPER', msg: `Navigating to ${searchUrl}` });
      await this.page.goto(searchUrl, { waitUntil: 'networkidle' });

      const selectors = this.source.selectors;
      await this.page
        .waitForSelector(selectors.job_cards, { timeout: 10000 })
        .catch(() => {
          initialJobCardsSelectorMissing = true;
          return logLine({
            level: 'WARN',
            step: 'SCRAPER',
            msg: 'Job cards selector not found immediately; hidden extraction may still recover jobs',
          });
        });

      const loadMoreType = selectors.load_more_type || 'pagination';

      while (pagesScraped < this.config.maxPages && this.jobsCollected.length < this.config.maxJobs) {
        const newJobs = await this.extractJobsFromPage();
        logLine({
          level: 'INFO',
          step: 'SCRAPER',
          msg: `Page ${pagesScraped + 1}: Found ${newJobs} new jobs (total: ${this.jobsCollected.length})`,
        });

        pagesScraped += 1;
        zeroYieldStreak = newJobs > 0 ? 0 : zeroYieldStreak + 1;

        if (this.jobsCollected.length >= this.config.maxJobs) {
          logLine({ level: 'INFO', step: 'SCRAPER', msg: `Reached max jobs limit (${this.config.maxJobs})` });
          stopReason = 'max_jobs';
          break;
        }

        if (zeroYieldStreak >= this.config.maxZeroYieldPages) {
          logLine({
            level: 'INFO',
            step: 'SCRAPER',
            msg: `Stopping after ${zeroYieldStreak} zero-yield page(s)`,
          });
          stopReason = 'zero_yield_limit';
          break;
        }

        let hasMore = false;
        if (loadMoreType === 'infinite_scroll') {
          hasMore = await this.handleInfiniteScroll();
        } else if (loadMoreType === 'load_more') {
          hasMore = await this.handleLoadMore(selectors.next_page);
        } else {
          hasMore = await this.handlePagination(selectors.next_page);
        }

        if (!hasMore) {
          logLine({ level: 'INFO', step: 'SCRAPER', msg: 'No more pages available' });
          stopReason = 'no_more_pages';
          break;
        }

        await this.sleep(this.config.scrollDelay);
      }

      if (this.config.fetchDescriptions && this.jobsCollected.length > 0) {
        descriptionFetchStats = await this.fetchJobDescriptions();
      }

      if (stopReason === 'completed' && pagesScraped >= this.config.maxPages) {
        stopReason = 'max_pages';
      }
    } catch (error) {
      errorMessage = error.message;
      stopReason = 'error';
      logLine({ level: 'ERROR', step: 'SCRAPER', msg: `Error during scraping: ${error.message}` });
    } finally {
      await this.close();
    }

    const duration = Date.now() - startTime;
    logLine({
      level: 'INFO',
      step: 'SCRAPER',
      msg: `Completed in ${duration}ms. Found ${this.jobsCollected.length} jobs across ${pagesScraped} pages`,
    });

    return {
      run_id: null,
      status: errorMessage ? 'FAILED' : 'COMPLETED',
      jobs_found: this.jobsCollected.length,
      jobs_new: 0,
      jobs_updated: 0,
      pages_scraped: pagesScraped,
      error_message: errorMessage,
      metadata: {
        stop_reason: stopReason,
        description_fetch_attempted: descriptionFetchStats.attempted,
        description_fetch_succeeded: descriptionFetchStats.succeeded,
        description_fetch_failed: descriptionFetchStats.failed,
        description_hidden_fallback_succeeded: descriptionFetchStats.hidden_fallback_succeeded,
        dom_new_jobs: this.hiddenExtractionStats.dom_new_jobs,
        hidden_new_jobs: this.hiddenExtractionStats.hidden_new_jobs,
        hidden_jsonld_candidates: this.hiddenExtractionStats.jsonld_candidates,
        hidden_state_candidates: this.hiddenExtractionStats.state_candidates,
        hidden_network_candidates: this.hiddenExtractionStats.network_candidates,
        hidden_network_payloads_seen: this.hiddenExtractionStats.network_payloads_seen,
        hidden_network_payloads_parsed: this.hiddenExtractionStats.network_payloads_parsed,
        job_cards_selector_missing: initialJobCardsSelectorMissing,
        max_pages: this.config.maxPages,
        max_jobs: this.config.maxJobs,
      },
      jobs: this.jobsCollected,
    };
  }

  buildUniqueKeys(job) {
    return [
      asCleanString(job.external_id),
      normalizeComparableUrl(job.url),
      buildDiscoveredJobFingerprintKey(job),
    ].filter(Boolean);
  }

  findExistingJobIndex(job) {
    for (const key of this.buildUniqueKeys(job)) {
      const existingIndex = this.jobIndexByKey.get(key);
      if (existingIndex !== undefined) {
        return existingIndex;
      }
    }
    return null;
  }

  mergeJobs(existingJob, incomingJob) {
    const fields = [
      'external_id',
      'url',
      'title',
      'company',
      'location',
      'salary',
      'posted_at',
      'description_text',
      'description_html',
    ];

    for (const field of fields) {
      const currentValue = existingJob[field];
      const nextValue = incomingJob[field];

      if (!currentValue && nextValue) {
        existingJob[field] = nextValue;
        continue;
      }

      if (
        typeof currentValue === 'string' &&
        typeof nextValue === 'string' &&
        nextValue.length > currentValue.length &&
        (field === 'description_text' || field === 'description_html' || field === 'title')
      ) {
        existingJob[field] = nextValue;
      }
    }
  }

  upsertCollectedJob(job, signal = 'dom') {
    const cleanedJob = cleanDiscoveredJobRecord(job);

    if (!cleanedJob || (!cleanedJob.external_id && !cleanedJob.url) || !cleanedJob.title) {
      return false;
    }

    const existingIndex = this.findExistingJobIndex(cleanedJob);
    if (existingIndex != null) {
      const existingJob = this.jobsCollected[existingIndex];
      this.mergeJobs(existingJob, cleanedJob);
      for (const key of this.buildUniqueKeys(existingJob)) {
        this.jobIndexByKey.set(key, existingIndex);
      }
      return false;
    }

    const nextIndex = this.jobsCollected.length;
    this.jobsCollected.push(cleanedJob);
    for (const key of this.buildUniqueKeys(cleanedJob)) {
      this.jobIndexByKey.set(key, nextIndex);
    }

    if (signal === 'hidden') {
      this.hiddenExtractionStats.hidden_new_jobs += 1;
    } else {
      this.hiddenExtractionStats.dom_new_jobs += 1;
    }

    return true;
  }

  async extractDomJobsFromPage() {
    const selectors = this.source.selectors;

    return this.page.$$eval(
      selectors.job_cards,
      (cards, sel, sourceName) =>
        cards.map((card) => {
          const getTextContent = (selector) => {
            if (!selector) return null;
            const el = card.querySelector(selector);
            return el ? el.textContent?.trim() : null;
          };

          const getHref = (selector) => {
            if (!selector) return null;
            const el = card.querySelector(selector);
            if (!el) return null;
            return el.getAttribute('href') || el.closest('a')?.getAttribute('href');
          };

          const getAttr = (attr) => {
            if (!attr) return null;
            let value = card.getAttribute(attr);
            if (!value) {
              const el = card.querySelector(`[${attr}]`);
              value = el?.getAttribute(attr);
            }
            return value;
          };

          let externalId = getAttr(sel.job_id_attr);
          if (!externalId) {
            const href = getHref(sel.job_link);
            if (href) {
              const linkedinMatch = href.match(/\/jobs\/view\/(\d+)/);
              if (linkedinMatch) externalId = linkedinMatch[1];

              const indeedMatch = href.match(/jk=([a-f0-9]+)/i);
              if (indeedMatch) externalId = indeedMatch[1];

              const glassdoorMatch = href.match(/JL(\d+)/);
              if (glassdoorMatch) externalId = glassdoorMatch[1];
            }
          }

          let url = getHref(sel.job_link);
          if (url && !url.startsWith('http')) {
            url = new URL(url, window.location.origin).href;
          }

          return {
            external_id: externalId,
            source_name: sourceName,
            url,
            title: getTextContent(sel.job_title),
            company: getTextContent(sel.job_company),
            location: getTextContent(sel.job_location),
            salary: sel.job_salary ? getTextContent(sel.job_salary) : null,
            posted_at: sel.job_posted ? getTextContent(sel.job_posted) : null,
            description_text: null,
            description_html: null,
          };
        }),
      selectors,
      this.source.name
    );
  }

  async extractHiddenJobsFromPage() {
    const payloads = await collectStructuredPagePayloads(this.page);
    const context = {
      sourceName: this.source.name,
      baseUrl: payloads.pageUrl || this.page.url(),
    };

    const jsonldJobs = payloads.ldJsonPayloads.flatMap((payload) =>
      extractJobsFromStructuredPayload(payload, context)
    );
    const stateJobs = payloads.statePayloads.flatMap((payload) =>
      extractJobsFromStructuredPayload(payload.value, context)
    );
    const jsonScriptJobs = payloads.jsonScriptPayloads.flatMap((payload) =>
      extractJobsFromStructuredPayload(payload, context)
    );

    this.hiddenExtractionStats.jsonld_candidates += jsonldJobs.length;
    this.hiddenExtractionStats.state_candidates +=
      stateJobs.length + jsonScriptJobs.length;

    return [...jsonldJobs, ...stateJobs, ...jsonScriptJobs];
  }

  drainPendingNetworkJobs() {
    if (this.pendingNetworkJobs.length === 0) {
      return [];
    }
    const jobs = this.pendingNetworkJobs.slice();
    this.pendingNetworkJobs = [];
    return jobs;
  }

  /**
   * Extract all job listings from the current page state
   * @returns {Promise<number>} Number of new jobs found
   */
  async extractJobsFromPage() {
    let newCount = 0;
    let domJobs = [];

    try {
      domJobs = await this.extractDomJobsFromPage();
    } catch (error) {
      logLine({
        level: 'WARN',
        step: 'SCRAPER',
        msg: `DOM extraction failed for ${this.source.name}: ${error.message}`,
      });
    }

    const hiddenJobs = await this.extractHiddenJobsFromPage().catch((error) => {
      logLine({
        level: 'DEBUG',
        step: 'SCRAPER',
        msg: `Hidden payload extraction failed: ${error.message}`,
      });
      return [];
    });
    const networkJobs = this.drainPendingNetworkJobs();

    for (const job of domJobs) {
      if (this.upsertCollectedJob(job, 'dom')) {
        newCount += 1;
      }
    }

    for (const job of [...networkJobs, ...hiddenJobs]) {
      if (this.upsertCollectedJob(job, 'hidden')) {
        newCount += 1;
      }
    }

    return newCount;
  }

  /**
   * Handle infinite scroll pagination (LinkedIn style)
   * @returns {Promise<boolean>}
   */
  async handleInfiniteScroll() {
    const previousHeight = await this.page.evaluate(() => document.body.scrollHeight);

    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await this.sleep(this.config.scrollDelay);

    const loadMoreBtn = this.source.selectors.next_page;
    if (loadMoreBtn) {
      try {
        const btn = await this.page.$(loadMoreBtn);
        if (btn) {
          await btn.click();
          await this.sleep(this.config.scrollDelay);
        }
      } catch {
        // Button may not exist or may not be clickable yet.
      }
    }

    const newHeight = await this.page.evaluate(() => document.body.scrollHeight);
    const newJobs = await this.extractJobsFromPage();

    return newHeight > previousHeight || newJobs > 0;
  }

  /**
   * Handle "Load More" button pagination
   * @param {string} buttonSelector
   * @returns {Promise<boolean>}
   */
  async handleLoadMore(buttonSelector) {
    if (!buttonSelector) return false;

    try {
      const btn = await this.page.$(buttonSelector);
      if (!btn) return false;

      const isVisible = await btn.isVisible();
      const isEnabled = await btn.isEnabled();

      if (!isVisible || !isEnabled) return false;

      await btn.click();
      await this.page.waitForLoadState('networkidle');

      return true;
    } catch (error) {
      logLine({
        level: 'DEBUG',
        step: 'SCRAPER',
        msg: `Load more button not available: ${error.message}`,
      });
      return false;
    }
  }

  /**
   * Handle traditional pagination
   * @param {string} nextSelector
   * @returns {Promise<boolean>}
   */
  async handlePagination(nextSelector) {
    if (!nextSelector) return false;

    try {
      const nextBtn = await this.page.$(nextSelector);
      if (!nextBtn) return false;

      const isVisible = await nextBtn.isVisible();
      const isEnabled = await nextBtn.isEnabled();
      const isDisabled = await nextBtn.getAttribute('disabled');

      if (!isVisible || !isEnabled || isDisabled !== null) return false;

      await nextBtn.click();
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForSelector(this.source.selectors.job_cards, { timeout: 10000 }).catch(() => {});

      return true;
    } catch (error) {
      logLine({ level: 'DEBUG', step: 'SCRAPER', msg: `Pagination failed: ${error.message}` });
      return false;
    }
  }

  async extractDescriptionFallback(page, job) {
    const payloads = await collectStructuredPagePayloads(page);
    const context = {
      sourceName: this.source.name,
      baseUrl: payloads.pageUrl || page.url(),
    };

    const candidates = [
      ...payloads.ldJsonPayloads.flatMap((payload) =>
        extractJobsFromStructuredPayload(payload, context)
      ),
      ...payloads.jsonScriptPayloads.flatMap((payload) =>
        extractJobsFromStructuredPayload(payload, context)
      ),
      ...payloads.statePayloads.flatMap((payload) =>
        extractJobsFromStructuredPayload(payload.value, context)
      ),
    ].filter((candidate) => candidate.description_text || candidate.description_html);

    if (candidates.length === 0) {
      return { text: null, html: null };
    }

    const jobUrl = normalizeComparableUrl(job.url);
    const matched =
      candidates.find((candidate) => normalizeComparableUrl(candidate.url) === jobUrl) ??
      candidates[0];

    return {
      text: matched.description_text || null,
      html: matched.description_html || null,
    };
  }

  /**
   * Fetch full job descriptions for collected jobs.
   */
  async fetchJobDescriptions() {
    logLine({ level: 'INFO', step: 'SCRAPER', msg: `Fetching descriptions for ${this.jobsCollected.length} jobs` });

    const selector = DESCRIPTION_SELECTORS[this.source.name] || 'body';
    let fetched = 0;
    let attempted = 0;
    let failed = 0;
    let hiddenFallbackSucceeded = 0;

    for (const job of this.jobsCollected) {
      if (!job.url) continue;
      if (attempted >= this.config.maxDescriptionFetches) break;

      let descPage = null;
      try {
        attempted += 1;
        descPage = await this.context.newPage();
        descPage.setDefaultTimeout(15000);

        await descPage.goto(job.url, { waitUntil: 'domcontentloaded' });
        await descPage.waitForSelector(selector, { timeout: 5000 }).catch(() => {});

        let description = await descPage
          .$eval(selector, (el) => ({
            text: el.textContent?.trim() || null,
            html: el.innerHTML || null,
          }))
          .catch(() => ({ text: null, html: null }));

        if (!description.text && !description.html) {
          description = await this.extractDescriptionFallback(descPage, job).catch(() => ({
            text: null,
            html: null,
          }));
          if (description.text || description.html) {
            hiddenFallbackSucceeded += 1;
          }
        }

        job.description_text = job.description_text || description.text;
        job.description_html = job.description_html || description.html;

        if (job.description_text || job.description_html) {
          fetched += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        logLine({
          level: 'DEBUG',
          step: 'SCRAPER',
          msg: `Failed to fetch description for ${job.url}: ${error.message}`,
        });
      } finally {
        if (descPage) {
          await descPage.close().catch(() => {});
        }
        await this.sleep(500);
      }
    }

    logLine({ level: 'INFO', step: 'SCRAPER', msg: `Fetched ${fetched} job descriptions` });
    return {
      attempted,
      succeeded: fetched,
      failed,
      hidden_fallback_succeeded: hiddenFallbackSucceeded,
    };
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a scraper for a specific source
 * @param {import('./types.js').JobSource} source
 * @param {Partial<import('./types.js').ScraperConfig>} config
 * @returns {JobScraper}
 */
export function createScraper(source, config = {}) {
  return new JobScraper(source, config);
}

/**
 * Scrape jobs from a URL
 * @param {import('./types.js').JobSource} source
 * @param {string} searchUrl
 * @param {Partial<import('./types.js').ScraperConfig>} config
 * @returns {Promise<import('./types.js').DiscoveryRunResult>}
 */
export async function scrapeJobs(source, searchUrl, config = {}) {
  const scraper = createScraper(source, config);
  return scraper.scrape(searchUrl);
}
