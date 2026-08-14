/**
 * @typedef {Object} JobSource
 * @property {string} id
 * @property {string} name - 'linkedin', 'indeed', 'glassdoor'
 * @property {string} base_url
 * @property {'scraper' | 'api' | 'feed'} [source_type]
 * @property {boolean} enabled
 * @property {number} rate_limit_per_minute
 * @property {boolean} requires_auth
 * @property {Object} auth_config
 * @property {Object} [adapter_config]
 * @property {Object} [discovery_config]
 * @property {SourceSelectors | Object} selectors
 */

/**
 * @typedef {Object} SourceSelectors
 * @property {string} job_cards - CSS selector for job card containers
 * @property {string} job_title - Selector for job title within card
 * @property {string} job_company - Selector for company name
 * @property {string} job_location - Selector for job location
 * @property {string} job_link - Selector for job link/URL
 * @property {string} [job_salary] - Optional selector for salary
 * @property {string} [job_posted] - Optional selector for posted date
 * @property {string} job_id_attr - Attribute containing external job ID
 * @property {string} [next_page] - Selector for next page button
 * @property {'pagination' | 'infinite_scroll' | 'load_more'} load_more_type
 */

/**
 * @typedef {Object} DiscoverySearch
 * @property {string} id
 * @property {string} job_seeker_id
 * @property {string} source_id
 * @property {string} search_name
 * @property {string} search_url
 * @property {string[]} keywords
 * @property {string} [location]
 * @property {Object} filters
 * @property {boolean} enabled
 * @property {string} [last_run_at]
 * @property {string} [next_run_at]
 * @property {number} last_job_count
 * @property {number} run_frequency_hours
 * @property {string} [source_name]
 * @property {JobSource} [source]
 */

/**
 * @typedef {Object} DiscoveredJob
 * @property {string} external_id - Job ID from the source
 * @property {string} source_name - 'linkedin', 'indeed', etc.
 * @property {string} url - Full job URL
 * @property {string} title
 * @property {string} [company]
 * @property {string} [location]
 * @property {string} [salary]
 * @property {string} [posted_at]
 * @property {string} [description_text]
 * @property {string} [description_html]
 */

/**
 * @typedef {Object} DiscoveryRunResult
 * @property {string} run_id
 * @property {string} status - 'COMPLETED' | 'FAILED'
 * @property {number} jobs_found
 * @property {number} jobs_new
 * @property {number} jobs_updated
 * @property {number} pages_scraped
 * @property {string} [error_message]
 * @property {Object} [metadata]
 * @property {DiscoveredJob[]} jobs
 */

/**
 * @typedef {Object} ScraperConfig
 * @property {number} maxPages - Maximum pages to scrape
 * @property {number} maxJobs - Maximum jobs to collect
 * @property {number} scrollDelay - Delay between scrolls (ms)
 * @property {number} pageTimeout - Page load timeout (ms)
 * @property {number} maxZeroYieldPages - Stop after N pages with zero new jobs
 * @property {number} maxDescriptionFetches - Max job detail pages to open
 * @property {boolean} headless - Run browser headless
 * @property {boolean} fetchDescriptions - Also fetch full job descriptions
 * @property {string} [userAgent] - Custom user agent
 */

/**
 * @typedef {Object} AdapterSearchConfig
 * @property {string} [searchUrl]
 * @property {string|string[]} [keywords]
 * @property {string} [location]
 * @property {string} [category]
 * @property {string} [company] - For ATS feed adapters (greenhouse, lever, ashby, smartrecruiters) or Workday tenant/site hints
 * @property {string} [careerUrl] - Public company career URL for ATS feed adapters
 * @property {string} [level]
 * @property {number} [maxJobs]
 * @property {number} [page]
 */

export {};
