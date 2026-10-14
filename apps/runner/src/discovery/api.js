/**
 * API client for job discovery operations
 */

const API_BASE_URL = process.env.JOBGENIUS_API_BASE_URL || 'http://localhost:3000';
const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || '';
const OPS_API_KEY = process.env.OPS_API_KEY || '';

/**
 * Make an API request with proper headers
 * @param {string} endpoint
 * @param {Object} options
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-ops-key': OPS_API_KEY,
    ...options.headers
  };

  if (RUNNER_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${RUNNER_AUTH_TOKEN}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Get all enabled job sources
 * @returns {Promise<import('./types.js').JobSource[]>}
 */
export async function getJobSources() {
  const result = await apiRequest('/api/discovery/sources');
  return result.sources || [];
}

/**
 * Get a specific job source by name
 * @param {string} name
 * @returns {Promise<import('./types.js').JobSource|null>}
 */
export async function getJobSourceByName(name) {
  const result = await apiRequest(`/api/discovery/sources/${name}`);
  return result.source || null;
}

/**
 * Get searches that are due to run
 * @returns {Promise<import('./types.js').DiscoverySearch[]>}
 */
export async function getPendingSearches() {
  const result = await apiRequest('/api/discovery/searches/pending');
  return result.searches || [];
}

/**
 * Start a discovery run
 * @param {string} searchId
 * @returns {Promise<{run_id: string}>}
 */
export async function startDiscoveryRun(searchId) {
  const result = await apiRequest('/api/discovery/runs/start', {
    method: 'POST',
    body: JSON.stringify({ search_id: searchId })
  });
  return result;
}

/**
 * Complete a discovery run with results
 * @param {string} runId
 * @param {import('./types.js').DiscoveryRunResult} result
 */
export async function completeDiscoveryRun(runId, result) {
  await apiRequest('/api/discovery/runs/complete', {
    method: 'POST',
    body: JSON.stringify({
      run_id: runId,
      status: result.status,
      jobs_found: result.jobs_found,
      jobs_new: result.jobs_new,
      jobs_updated: result.jobs_updated,
      pages_scraped: result.pages_scraped,
      error_message: result.error_message,
      metadata: result.metadata
    })
  });
}

/**
 * Save discovered jobs to the database
 * @param {string} runId
 * @param {import('./types.js').DiscoveredJob[]} jobs
 * @returns {Promise<{saved: number, updated: number, unchanged: number, duplicates: number, errors: number}>}
 */
export async function saveDiscoveredJobs(runId, jobs) {
  const result = await apiRequest('/api/discovery/jobs/save', {
    method: 'POST',
    body: JSON.stringify({
      run_id: runId,
      jobs
    })
  });
  return result;
}

/**
 * Run discovery for a specific search URL (ad-hoc)
 * @param {string} sourceName - 'linkedin', 'indeed', etc.
 * @param {string} searchUrl - Full search URL
 * @param {Object} options - Scraping options
 * @returns {Promise<Object>}
 */
export async function runAdHocDiscovery(sourceName, searchUrl, options = {}) {
  const result = await apiRequest('/api/discovery/run', {
    method: 'POST',
    body: JSON.stringify({
      source_name: sourceName,
      search_url: searchUrl,
      options
    })
  });
  return result;
}
