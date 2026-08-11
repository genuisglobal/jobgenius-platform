#!/usr/bin/env node
/**
 * Job Discovery CLI
 *
 * Runs job discovery from the command line — supports both Playwright scrapers
 * and lightweight API/feed adapters.
 *
 * Usage:
 *   # Scraper sources (require a search URL)
 *   node src/discovery-cli.js linkedin "https://www.linkedin.com/jobs/search?keywords=react&location=Remote"
 *   node src/discovery-cli.js indeed "https://www.indeed.com/jobs?q=software+engineer&l=San+Francisco" --max-pages=3
 *   node src/discovery-cli.js glassdoor "https://www.glassdoor.com/Job/san-francisco-software-engineer-jobs" --save
 *
 *   # API adapter sources (no URL needed)
 *   node src/discovery-cli.js remotive --category="software-dev" --save
 *   node src/discovery-cli.js adzuna --keywords="react developer" --location="us" --save
 *   node src/discovery-cli.js themuse --category="Engineering" --level="Senior" --save
 *   node src/discovery-cli.js arbeitnow --save
 *   node src/discovery-cli.js hn-hiring --save
 *
 *   # ATS feed sources (company-specific)
 *   node src/discovery-cli.js greenhouse --company="stripe" --save
 *   node src/discovery-cli.js lever --company="netflix" --save
 *   node src/discovery-cli.js ashby --company="ramp" --save
 *   node src/discovery-cli.js workday "https://wd5.myworkdaysite.com/recruiting/company/careers" --save
 *   node src/discovery-cli.js smartrecruiters "https://jobs.smartrecruiters.com/Stripe" --save
 *
 * Options:
 *   --max-pages=N       Maximum pages to scrape (default: 5, scraper only)
 *   --max-jobs=N        Maximum jobs to collect (default: 50)
 *   --no-headless       Run browser in visible mode (scraper only)
 *   --no-descriptions   Don't fetch full job descriptions (scraper only)
 *   --save              Save jobs to the backend database
 *   --output=FILE       Save results to a JSON file
 *   --keywords=STR      Search keywords (API adapters)
 *   --location=STR      Location filter (API adapters)
 *   --category=STR      Job category (remotive, themuse)
 *   --level=STR         Experience level (themuse)
 *   --company=STR       Company slug/identifier (greenhouse, lever, ashby, smartrecruiters)
 */

import { scrapeJobs } from './discovery/scraper.js';
import { getAdapter, listAdapters } from './discovery/adapters/base.js';
import fs from 'fs';

// Import adapters to trigger self-registration
import './discovery/adapters/register.js';

// Default job source configurations (scraper sources only — adapters self-register)
const DEFAULT_SOURCES = {
  linkedin: {
    id: 'linkedin',
    name: 'linkedin',
    base_url: 'https://www.linkedin.com/jobs/search',
    source_type: 'scraper',
    enabled: true,
    rate_limit_per_minute: 5,
    requires_auth: false,
    auth_config: {},
    adapter_config: {},
    selectors: {
      job_cards: '.jobs-search__results-list > li, .job-search-card',
      job_title: '.base-search-card__title, .job-search-card__title',
      job_company: '.base-search-card__subtitle, .job-search-card__subtitle',
      job_location: '.job-search-card__location',
      job_link: '.base-card__full-link, a.base-search-card__full-link',
      job_id_attr: 'data-entity-urn',
      next_page: 'button[aria-label="See more jobs"], button.infinite-scroller__show-more-button',
      load_more_type: 'infinite_scroll'
    }
  },
  indeed: {
    id: 'indeed',
    name: 'indeed',
    base_url: 'https://www.indeed.com/jobs',
    source_type: 'scraper',
    enabled: true,
    rate_limit_per_minute: 10,
    requires_auth: false,
    auth_config: {},
    adapter_config: {},
    selectors: {
      job_cards: '.job_seen_beacon, .resultContent, [data-jk]',
      job_title: '.jobTitle span[title], h2.jobTitle, [data-testid="jobTitle"]',
      job_company: '[data-testid="company-name"], .companyName, .company_location .companyName',
      job_location: '[data-testid="text-location"], .companyLocation',
      job_link: '.jcs-JobTitle, a.jcs-JobTitle',
      job_salary: '.salary-snippet-container, [data-testid="attribute_snippet_testid"]',
      job_id_attr: 'data-jk',
      next_page: '[data-testid="pagination-page-next"], a[aria-label="Next Page"]',
      load_more_type: 'pagination'
    }
  },
  glassdoor: {
    id: 'glassdoor',
    name: 'glassdoor',
    base_url: 'https://www.glassdoor.com/Job',
    source_type: 'scraper',
    enabled: true,
    rate_limit_per_minute: 5,
    requires_auth: false,
    auth_config: {},
    adapter_config: {},
    selectors: {
      job_cards: '[data-test="jobListing"], .react-job-listing',
      job_title: '[data-test="job-title"], .job-title',
      job_company: '[data-test="employer-name"], .employer-name',
      job_location: '[data-test="emp-location"], .location',
      job_link: '[data-test="job-title"], a[data-test="job-link"]',
      job_salary: '[data-test="detailSalary"]',
      job_id_attr: 'data-id',
      next_page: '[data-test="pagination-next"], button[data-test="load-more"]',
      load_more_type: 'pagination'
    }
  }
};

// Adapter source defaults (no CSS selectors needed — just source metadata)
const ADAPTER_SOURCES = {
  adzuna: {
    id: 'adzuna', name: 'adzuna', source_type: 'api',
    base_url: 'https://api.adzuna.com/v1/api/jobs',
    adapter_config: { country: 'us' }, auth_config: {}, selectors: {},
  },
  remotive: {
    id: 'remotive', name: 'remotive', source_type: 'api',
    base_url: 'https://remotive.com/api/remote-jobs',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  themuse: {
    id: 'themuse', name: 'themuse', source_type: 'api',
    base_url: 'https://www.themuse.com/api/public/jobs',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  arbeitnow: {
    id: 'arbeitnow', name: 'arbeitnow', source_type: 'api',
    base_url: 'https://www.arbeitnow.com/api/job-board-api',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  greenhouse: {
    id: 'greenhouse', name: 'greenhouse', source_type: 'feed',
    base_url: 'https://boards-api.greenhouse.io/v1/boards',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  lever: {
    id: 'lever', name: 'lever', source_type: 'feed',
    base_url: 'https://api.lever.co/v0/postings',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  ashby: {
    id: 'ashby', name: 'ashby', source_type: 'feed',
    base_url: 'https://jobs.ashbyhq.com/api/non-user-graphql',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  workday: {
    id: 'workday', name: 'workday', source_type: 'feed',
    base_url: 'https://www.myworkdayjobs.com',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  smartrecruiters: {
    id: 'smartrecruiters', name: 'smartrecruiters', source_type: 'feed',
    base_url: 'https://api.smartrecruiters.com/v1/companies',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
  'hn-hiring': {
    id: 'hn-hiring', name: 'hn-hiring', source_type: 'api',
    base_url: 'https://hn.algolia.com/api/v1',
    adapter_config: {}, auth_config: {}, selectors: {},
  },
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const sourceName = args[0].toLowerCase();

  // Parse options
  const options = {
    maxPages: 5,
    maxJobs: 50,
    headless: true,
    fetchDescriptions: true,
    save: false,
    output: null,
    // Adapter-specific
    keywords: null,
    location: null,
    category: null,
    level: null,
    company: null,
  };

  // Collect positional args (search URL for scraper sources)
  let searchUrl = null;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--max-pages=')) {
      options.maxPages = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-jobs=')) {
      options.maxJobs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--no-headless') {
      options.headless = false;
    } else if (arg === '--no-descriptions') {
      options.fetchDescriptions = false;
    } else if (arg === '--save') {
      options.save = true;
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg.startsWith('--keywords=')) {
      options.keywords = arg.split('=')[1];
    } else if (arg.startsWith('--location=')) {
      options.location = arg.split('=')[1];
    } else if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
    } else if (arg.startsWith('--level=')) {
      options.level = arg.split('=')[1];
    } else if (arg.startsWith('--company=')) {
      options.company = arg.split('=')[1];
    } else if (!arg.startsWith('--') && !searchUrl) {
      searchUrl = arg;
    }
  }

  // Determine if this is a scraper or adapter source
  const isAdapterSource = !!ADAPTER_SOURCES[sourceName];
  const isScraperSource = !!DEFAULT_SOURCES[sourceName];

  if (!isAdapterSource && !isScraperSource) {
    console.error(`Unknown source: ${sourceName}`);
    console.error(`Available scraper sources: ${Object.keys(DEFAULT_SOURCES).join(', ')}`);
    console.error(`Available adapter sources: ${Object.keys(ADAPTER_SOURCES).join(', ')}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('JOB DISCOVERY CLI');
  console.log('='.repeat(60));
  console.log(`Source:       ${sourceName}`);
  console.log(`Type:         ${isAdapterSource ? ADAPTER_SOURCES[sourceName].source_type : 'scraper'}`);
  if (searchUrl) console.log(`URL:          ${searchUrl}`);
  if (options.keywords) console.log(`Keywords:     ${options.keywords}`);
  if (options.location) console.log(`Location:     ${options.location}`);
  if (options.category) console.log(`Category:     ${options.category}`);
  if (options.level) console.log(`Level:        ${options.level}`);
  if (options.company) console.log(`Company:      ${options.company}`);
  console.log(`Max Jobs:     ${options.maxJobs}`);
  if (isScraperSource) {
    console.log(`Max Pages:    ${options.maxPages}`);
    console.log(`Headless:     ${options.headless}`);
    console.log(`Descriptions: ${options.fetchDescriptions}`);
  }
  console.log('='.repeat(60));
  console.log('');

  try {
    let result;

    if (isAdapterSource) {
      // Adapter path
      const source = ADAPTER_SOURCES[sourceName];
      const adapter = getAdapter(sourceName);

      if (!adapter) {
        console.error(`No adapter registered for: ${sourceName}`);
        process.exit(1);
      }

      const searchConfig = {
        maxJobs: options.maxJobs,
      };
      if (searchUrl) searchConfig.searchUrl = searchUrl;
      if (options.keywords) searchConfig.keywords = options.keywords;
      if (options.location) searchConfig.location = options.location;
      if (options.category) searchConfig.category = options.category;
      if (options.level) searchConfig.level = options.level;
      if (options.company) searchConfig.company = options.company;

      const jobs = await adapter.fetchJobs(source, searchConfig);

      result = {
        status: 'COMPLETED',
        jobs_found: jobs.length,
        jobs_new: 0,
        jobs_updated: 0,
        pages_scraped: 0,
        jobs,
      };
    } else {
      // Scraper path (requires URL)
      if (!searchUrl) {
        console.error(`Scraper source "${sourceName}" requires a search URL as the second argument.`);
        process.exit(1);
      }

      const source = DEFAULT_SOURCES[sourceName];
      result = await scrapeJobs(source, searchUrl, {
        maxPages: options.maxPages,
        maxJobs: options.maxJobs,
        headless: options.headless,
        fetchDescriptions: options.fetchDescriptions
      });
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log(`Status:        ${result.status}`);
    console.log(`Jobs Found:    ${result.jobs_found}`);
    if (result.pages_scraped) console.log(`Pages Scraped: ${result.pages_scraped}`);
    if (result.error_message) {
      console.log(`Error:         ${result.error_message}`);
    }
    console.log('');

    // Print job summaries
    if (result.jobs.length > 0) {
      console.log('JOBS:');
      console.log('-'.repeat(60));
      for (const job of result.jobs.slice(0, 10)) {
        console.log(`  ${job.title}`);
        console.log(`    Company:  ${job.company || 'N/A'}`);
        console.log(`    Location: ${job.location || 'N/A'}`);
        console.log(`    URL:      ${job.url || 'N/A'}`);
        console.log('');
      }
      if (result.jobs.length > 10) {
        console.log(`  ... and ${result.jobs.length - 10} more jobs`);
      }
    }

    // Save to file if requested
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
      console.log(`\nResults saved to: ${options.output}`);
    }

    // Save to backend if requested
    if (options.save && result.jobs.length > 0) {
      console.log('\nSaving to backend...');
      await saveToBackend(result.jobs);
    }

    process.exit(result.status === 'COMPLETED' ? 0 : 1);

  } catch (error) {
    console.error(`\nFatal error: ${error.message}`);
    process.exit(1);
  }
}

async function saveToBackend(jobs) {
  const apiBaseUrl = process.env.JOBGENIUS_API_BASE_URL || 'http://localhost:3000';
  const opsApiKey = process.env.OPS_API_KEY || '';

  try {
    const response = await fetch(`${apiBaseUrl}/api/discovery/jobs/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ops-key': opsApiKey
      },
      body: JSON.stringify({
        run_id: null,
        jobs
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to save jobs: ${error}`);
      return;
    }

    const result = await response.json();
    console.log(`Saved: ${result.saved} new, ${result.duplicates} duplicates, ${result.errors} errors`);
  } catch (error) {
    console.error(`Failed to save jobs: ${error.message}`);
  }
}

function printUsage() {
  console.log(`
Job Discovery CLI - Discover jobs from boards, APIs, and ATS feeds

Usage:
  node src/discovery-cli.js <source> [search_url] [options]

Scraper Sources (require search URL):
  linkedin    LinkedIn Jobs
  indeed      Indeed
  glassdoor   Glassdoor

API Adapter Sources (no URL needed):
  adzuna      Adzuna job aggregator (needs ADZUNA_APP_ID + ADZUNA_APP_KEY)
  remotive    Remotive remote jobs (no auth)
  themuse     The Muse startup/tech jobs (optional THEMUSE_API_KEY)
  arbeitnow   Arbeitnow remote-first jobs (no auth)
  hn-hiring   Hacker News "Who's Hiring" thread (no auth)

ATS Feed Sources (need a company flag or public career URL):
  greenhouse  Greenhouse career boards (no auth)
  lever       Lever career pages (no auth)
  ashby       Ashby job boards (no auth)
  workday     Workday job feeds via company career URL (no auth)
  smartrecruiters SmartRecruiters company postings (no auth)

Options:
  --max-pages=N       Maximum pages to scrape (default: 5, scraper only)
  --max-jobs=N        Maximum jobs to collect (default: 50)
  --no-headless       Run browser in visible mode (scraper only)
  --no-descriptions   Don't fetch full job descriptions (scraper only)
  --save              Save jobs to the backend database
  --output=FILE       Save results to a JSON file
  --keywords=STR      Search keywords (adzuna, remotive, themuse)
  --location=STR      Location filter (adzuna, themuse)
  --category=STR      Job category (remotive, themuse)
  --level=STR         Experience level (themuse)
  --company=STR       Company slug/identifier (greenhouse, lever, ashby, smartrecruiters)

Examples:
  # Scrape LinkedIn for React jobs
  node src/discovery-cli.js linkedin "https://www.linkedin.com/jobs/search?keywords=react&location=Remote"

  # Fetch remote jobs from Remotive
  node src/discovery-cli.js remotive --category="software-dev" --save

  # Fetch Adzuna results (needs API keys)
  node src/discovery-cli.js adzuna --keywords="react developer" --location="us" --save

  # Fetch jobs from Stripe's Greenhouse board
  node src/discovery-cli.js greenhouse --company="stripe" --save

  # Fetch Netflix jobs from Lever
  node src/discovery-cli.js lever --company="netflix" --save

  # Fetch Ramp jobs from Ashby
  node src/discovery-cli.js ashby --company="ramp" --save

  # Fetch jobs from a Workday careers site
  node src/discovery-cli.js workday "https://wd5.myworkdaysite.com/recruiting/company/careers" --save

  # Fetch jobs from Stripe's SmartRecruiters page
  node src/discovery-cli.js smartrecruiters "https://jobs.smartrecruiters.com/Stripe" --save

  # Parse current HN "Who's Hiring" thread
  node src/discovery-cli.js hn-hiring --save

  # Fetch The Muse engineering jobs
  node src/discovery-cli.js themuse --category="Engineering" --level="Senior" --save

  # Fetch Arbeitnow remote jobs
  node src/discovery-cli.js arbeitnow --max-jobs=100 --save

Environment Variables:
  JOBGENIUS_API_BASE_URL   Backend API URL (for --save)
  OPS_API_KEY              API key for backend authentication
  ADZUNA_APP_ID            Adzuna API app ID
  ADZUNA_APP_KEY           Adzuna API app key
  THEMUSE_API_KEY          The Muse API key (optional)
`);
}

main();
