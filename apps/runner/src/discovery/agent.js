/**
 * Job Discovery Agent
 *
 * Runs as a background process that:
 * 1. Polls for pending discovery searches
 * 2. Executes scraping jobs
 * 3. Saves discovered jobs to the backend
 * 4. Triggers matching for new jobs
 */

import { scrapeJobs } from './scraper.js';
import * as api from './api.js';
import { getAdapter, listAdapters } from './adapters/base.js';
import { logLine } from '../logger.js';
import './adapters/register.js';

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.DISCOVERY_POLL_INTERVAL_MS || '300000', 10); // 5 minutes
const MAX_CONCURRENT_SCRAPES = parseInt(process.env.DISCOVERY_MAX_CONCURRENT || '2', 10);
const DEFAULT_MAX_PAGES = parseInt(process.env.DISCOVERY_MAX_PAGES || '5', 10);
const DEFAULT_MAX_JOBS = parseInt(process.env.DISCOVERY_MAX_JOBS || '50', 10);
const DEFAULT_MAX_ZERO_YIELD_PAGES = parseInt(process.env.DISCOVERY_MAX_ZERO_YIELD_PAGES || '1', 10);
const DEFAULT_MAX_DESCRIPTION_FETCHES = parseInt(process.env.DISCOVERY_MAX_DESCRIPTION_FETCHES || '20', 10);
const DEFAULT_PAGE_TIMEOUT_MS = parseInt(process.env.DISCOVERY_PAGE_TIMEOUT_MS || '30000', 10);
const DEFAULT_SCROLL_DELAY_MS = parseInt(process.env.DISCOVERY_SCROLL_DELAY_MS || '1000', 10);
const SOURCE_CACHE_TTL_MS = parseInt(process.env.DISCOVERY_SOURCE_CACHE_TTL_MS || '300000', 10); // 5 minutes
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let isRunning = false;
let activeScrapesCount = 0;
let sourceCacheExpiresAt = 0;
let cachedSources = [];

function normalizeSourceRecord(source) {
  if (!source) {
    return null;
  }
  return Array.isArray(source) ? source[0] ?? null : source;
}

function inferSourceName(search, source) {
  if (source?.name) {
    return String(source.name);
  }

  if (search?.source_name) {
    return String(search.source_name);
  }

  if (typeof search?.source_id === 'string' && !UUID_REGEX.test(search.source_id)) {
    return search.source_id;
  }

  return null;
}

function hasCompleteSourceConfig(source) {
  if (!source || !source.name || !source.base_url) {
    return false;
  }

  if (!source.source_type) {
    return false;
  }

  if (source.source_type === 'scraper') {
    return !!source.selectors;
  }

  return true;
}

async function getCachedSourceCatalog() {
  const now = Date.now();
  if (cachedSources.length > 0 && sourceCacheExpiresAt > now) {
    return cachedSources;
  }

  const sources = await api.getJobSources();
  cachedSources = Array.isArray(sources) ? sources : [];
  sourceCacheExpiresAt = now + SOURCE_CACHE_TTL_MS;
  return cachedSources;
}

async function resolveSourceForSearch(search) {
  const inlineSource = normalizeSourceRecord(search?.source);
  if (hasCompleteSourceConfig(inlineSource)) {
    return inlineSource;
  }

  const sourceName = inferSourceName(search, inlineSource);
  if (sourceName) {
    try {
      const byName = await api.getJobSourceByName(sourceName);
      if (byName) {
        return byName;
      }
    } catch (error) {
      logLine({
        level: 'WARN',
        step: 'DISCOVERY',
        msg: `Failed to fetch source by name (${sourceName}): ${error.message}`
      });
    }
  }

  if (typeof search?.source_id === 'string' && UUID_REGEX.test(search.source_id)) {
    const sourceCatalog = await getCachedSourceCatalog();
    const byId = sourceCatalog.find((candidate) => candidate.id === search.source_id);
    if (byId) {
      return byId;
    }
  }

  return inlineSource;
}

function asPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function resolveDiscoveryConfig(source, search, options = {}) {
  const filterConfig = search?.filters?.discovery_config && typeof search.filters.discovery_config === 'object'
    ? search.filters.discovery_config
    : {};
  const sourceConfig = source?.discovery_config && typeof source.discovery_config === 'object'
    ? source.discovery_config
    : {};
  const merged = {
    ...sourceConfig,
    ...filterConfig,
    ...options,
  };

  return {
    maxPages: asPositiveInteger(merged.maxPages ?? merged.max_pages, DEFAULT_MAX_PAGES),
    maxJobs: asPositiveInteger(merged.maxJobs ?? merged.max_jobs, DEFAULT_MAX_JOBS),
    maxZeroYieldPages: asPositiveInteger(
      merged.maxZeroYieldPages ?? merged.max_zero_yield_pages,
      DEFAULT_MAX_ZERO_YIELD_PAGES
    ),
    maxDescriptionFetches: asPositiveInteger(
      merged.maxDescriptionFetches ?? merged.max_description_fetches,
      DEFAULT_MAX_DESCRIPTION_FETCHES
    ),
    scrollDelay: asPositiveInteger(merged.scrollDelay ?? merged.scroll_delay_ms, DEFAULT_SCROLL_DELAY_MS),
    pageTimeout: asPositiveInteger(merged.pageTimeout ?? merged.page_timeout_ms, DEFAULT_PAGE_TIMEOUT_MS),
    fetchDescriptions: asBoolean(merged.fetchDescriptions ?? merged.fetch_descriptions, true),
    headless: asBoolean(merged.headless, true),
  };
}

/**
 * Start the discovery agent
 */
export async function start() {
  if (isRunning) {
    logLine({ level: 'WARN', step: 'DISCOVERY', msg: 'Already running' });
    return;
  }

  isRunning = true;
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: 'Starting...' });
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Poll interval: ${POLL_INTERVAL_MS}ms` });
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Max concurrent scrapes: ${MAX_CONCURRENT_SCRAPES}` });

  // Initial run
  await tick();

  // Schedule periodic runs
  const interval = setInterval(async () => {
    if (!isRunning) {
      clearInterval(interval);
      return;
    }
    await tick();
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the discovery agent
 */
export function stop() {
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: 'Stopping...' });
  isRunning = false;
}

/**
 * Single tick of the discovery agent
 */
export async function tick() {
  if (activeScrapesCount >= MAX_CONCURRENT_SCRAPES) {
    logLine({ level: 'DEBUG', step: 'DISCOVERY', msg: `Skipping tick, ${activeScrapesCount} scrapes active` });
    return;
  }

  try {
    // Get pending searches
    const searches = await api.getPendingSearches();

    if (searches.length === 0) {
      logLine({ level: 'DEBUG', step: 'DISCOVERY', msg: 'No pending searches' });
      return;
    }

    logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Found ${searches.length} pending searches` });

    // Process searches up to concurrency limit
    const toProcess = searches.slice(0, MAX_CONCURRENT_SCRAPES - activeScrapesCount);

    for (const search of toProcess) {
      // Don't await - run in parallel
      processSearch(search).catch(err => {
        logLine({ level: 'ERROR', step: 'DISCOVERY', msg: `Error processing search ${search.id}: ${err.message}` });
      });
    }
  } catch (error) {
    logLine({ level: 'ERROR', step: 'DISCOVERY', msg: `Tick error: ${error.message}` });
  }
}

/**
 * Process a single discovery search
 * @param {import('./types.js').DiscoverySearch} search
 */
export async function processSearch(search) {
  activeScrapesCount++;
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Processing search: ${search.search_name} (${search.id})` });

  let runId = null;
  let source = null;
  let sourceType = '';
  let failureStage = 'resolve_source';

  try {
    // Get source configuration
    source = await resolveSourceForSearch(search);
    if (!source) {
      throw new Error(`Source not found for search ${search.id}`);
    }
    sourceType = source.source_type || 'scraper';

    // Start the run
    failureStage = 'start_run';
    const { run_id } = await api.startDiscoveryRun(search.id);
    runId = run_id;

    // Dispatch by source_type
    let result;
    failureStage = 'fetch';

    if (sourceType === 'scraper') {
      if (!search.search_url) {
        throw new Error(`Missing search URL for scraper source: ${source.name}`);
      }
      const discoveryConfig = resolveDiscoveryConfig(source, search);

      // Existing Playwright path
      result = await scrapeJobs(source, search.search_url, {
        ...discoveryConfig
      });
    } else {
      // API/Feed adapter path
      const sourceName = String(source.name ?? '').toLowerCase();
      const adapter = getAdapter(sourceName);
      if (!adapter) {
        throw new Error(`No adapter for source: ${sourceName}. Registered: ${listAdapters().join(', ')}`);
      }

      const safeFilters = search.filters && typeof search.filters === 'object'
        ? search.filters
        : {};
      const discoveryConfig = resolveDiscoveryConfig(source, search);

      const jobs = await adapter.fetchJobs(source, {
        searchUrl: search.search_url,
        keywords: search.keywords,
        location: search.location,
        ...safeFilters,
        maxJobs: discoveryConfig.maxJobs,
      });

      result = {
        status: 'COMPLETED',
        jobs_found: jobs.length,
        jobs_new: 0,
        jobs_updated: 0,
        pages_scraped: 0,
        metadata: {
          source_type: sourceType,
          max_jobs: discoveryConfig.maxJobs
        },
        jobs,
      };
    }

    result.metadata = {
      ...(result.metadata || {}),
      source_type: sourceType,
      source_name: source.name,
    };

    result.run_id = runId;

    // Save discovered jobs
    if (result.jobs.length > 0) {
      failureStage = 'save';
      const saveResult = await api.saveDiscoveredJobs(runId, result.jobs);
      result.jobs_new = saveResult.saved;
      result.jobs_updated = saveResult.updated;
      result.metadata = {
        ...(result.metadata || {}),
        jobs_unchanged: saveResult.unchanged,
        jobs_mirrored: saveResult.mirrored,
        save_duplicates: saveResult.duplicates,
        save_errors: saveResult.errors,
      };
      logLine({
        level: 'INFO',
        step: 'DISCOVERY',
        msg: `Saved ${saveResult.saved} new jobs, ${saveResult.updated} updated, ${saveResult.unchanged} unchanged`
      });
    }

    // Complete the run
    failureStage = 'complete';
    await api.completeDiscoveryRun(runId, result);
    logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Completed search ${search.search_name}: ${result.jobs_found} jobs found` });

  } catch (error) {
    logLine({ level: 'ERROR', step: 'DISCOVERY', msg: `Search failed: ${error.message}` });

    // Mark run as failed if we have a run ID
    if (runId) {
      await api.completeDiscoveryRun(runId, {
        run_id: runId,
        status: 'FAILED',
        jobs_found: 0,
        jobs_new: 0,
        jobs_updated: 0,
        pages_scraped: 0,
        error_message: error.message,
        metadata: {
          source_type: sourceType || null,
          source_name: source?.name ?? search.source_name ?? null,
          failure_stage: failureStage,
        },
        jobs: []
      }).catch(() => {});
    }
  } finally {
    activeScrapesCount--;
  }
}

/**
 * Run a one-off discovery for a specific URL or adapter source
 * @param {string} sourceName - 'linkedin', 'indeed', 'glassdoor', 'remotive', etc.
 * @param {string} searchUrl - Full search URL (for scraper sources)
 * @param {Object} options - Scraping/adapter options
 * @returns {Promise<import('./types.js').DiscoveryRunResult>}
 */
export async function runOnce(sourceName, searchUrl, options = {}) {
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Running one-off discovery for ${sourceName}` });

  // Get source configuration
  const sources = await api.getJobSources();
  const source = sources.find(s => s.name === sourceName);

  if (!source) {
    throw new Error(`Unknown source: ${sourceName}. Available: ${sources.map(s => s.name).join(', ')}`);
  }

  const sourceType = source.source_type || 'scraper';
  const discoveryConfig = resolveDiscoveryConfig(source, null, options);
  let result;

  if (sourceType === 'scraper') {
    // Existing Playwright path
    result = await scrapeJobs(source, searchUrl, {
      ...discoveryConfig
    });
  } else {
    // API/Feed adapter path
    const adapter = getAdapter(String(source.name ?? '').toLowerCase());
    if (!adapter) {
      throw new Error(`No adapter for source: ${source.name}`);
    }

    const jobs = await adapter.fetchJobs(source, {
      searchUrl,
      maxJobs: discoveryConfig.maxJobs,
      ...options,
    });

    result = {
      status: 'COMPLETED',
      jobs_found: jobs.length,
      jobs_new: 0,
      jobs_updated: 0,
      pages_scraped: 0,
      metadata: {
        source_type: sourceType,
        source_name: source.name,
        max_jobs: discoveryConfig.maxJobs
      },
      jobs,
    };
  }

  result.metadata = {
    ...(result.metadata || {}),
    source_type: sourceType,
    source_name: source.name,
  };

  // Save jobs if requested
  if (options.save !== false && result.jobs.length > 0) {
    const saveResult = await api.saveDiscoveredJobs(null, result.jobs);
    result.jobs_new = saveResult.saved;
    result.jobs_updated = saveResult.updated;
    result.metadata = {
      ...(result.metadata || {}),
      jobs_unchanged: saveResult.unchanged,
      save_duplicates: saveResult.duplicates,
      save_errors: saveResult.errors,
    };
    logLine({
      level: 'INFO',
      step: 'DISCOVERY',
      msg: `Saved ${saveResult.saved} new jobs, ${saveResult.updated} updated, ${saveResult.unchanged} unchanged`
    });
  }

  return result;
}
