/**
 * External Job Providers
 *
 * Fetches remote job listings from free public APIs.
 * All providers are run in parallel via fetchAllExternalJobs().
 */

export type ExternalJob = {
  external_id: string;
  source: string;
  title: string;
  company_name: string | null;
  company_logo: string | null;
  location: string;
  salary: string | null;
  job_type: string | null;
  category: string | null;
  url: string;
  fetched_at: string;
};

// ──────────────────────────────────────────────────────────
// Category inference
// ──────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: 'engineering', keywords: ['engineer', 'developer', 'software', 'backend', 'frontend', 'fullstack', 'full-stack', 'devops', 'platform', 'infrastructure', 'sre', 'cloud', 'embedded', 'firmware'] },
  { category: 'design', keywords: ['designer', 'ux', 'ui', 'product design', 'graphic', 'figma', 'creative'] },
  { category: 'data', keywords: ['data scientist', 'data engineer', 'data analyst', 'machine learning', 'ml ', 'ai ', 'analytics', 'business intelligence', 'bi '] },
  { category: 'product', keywords: ['product manager', 'product owner', 'pm ', 'roadmap'] },
  { category: 'marketing', keywords: ['marketing', 'seo', 'growth', 'demand generation', 'content', 'copywriter', 'brand'] },
  { category: 'sales', keywords: ['sales', 'account executive', 'account manager', 'business development', 'bdr', 'sdr', 'revenue'] },
  { category: 'customer_success', keywords: ['customer success', 'customer support', 'support engineer', 'technical support', 'client success'] },
  { category: 'operations', keywords: ['operations', 'project manager', 'program manager', 'scrum', 'agile coach'] },
  { category: 'finance', keywords: ['finance', 'accounting', 'controller', 'cfo', 'bookkeeper', 'payroll'] },
  { category: 'hr', keywords: ['human resources', 'recruiter', 'talent acquisition', 'people ops', 'hr '] },
  { category: 'legal', keywords: ['legal', 'counsel', 'attorney', 'paralegal', 'compliance'] },
  { category: 'security', keywords: ['security', 'cybersecurity', 'penetration test', 'soc analyst', 'infosec'] },
  { category: 'qa', keywords: ['qa ', 'quality assurance', 'test engineer', 'sdet', 'automation test'] },
];

export function deriveCategory(...texts: string[]): string | null {
  const combined = texts.join(' ').toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return category;
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────
// Provider: Remotive
// ──────────────────────────────────────────────────────────

export async function fetchRemotiveExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs?limit=200', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];
    return jobs.map((job) => ({
      external_id: String(job.id),
      source: 'remotive',
      title: job.title ?? '',
      company_name: job.company_name ?? null,
      company_logo: job.company_logo_url ?? null,
      location: job.candidate_required_location || 'Remote',
      salary: job.salary || null,
      job_type: job.job_type ?? null,
      category: deriveCategory(job.title ?? '', job.category ?? '', job.tags?.join(' ') ?? ''),
      url: job.url ?? '',
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Jobicy
// ──────────────────────────────────────────────────────────

export async function fetchJobicyExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];
    return jobs.map((job) => ({
      external_id: String(job.id),
      source: 'jobicy',
      title: job.jobTitle ?? '',
      company_name: job.companyName ?? null,
      company_logo: job.companyLogo ?? null,
      location: job.jobGeo || 'Remote',
      salary: job.annualSalaryMin
        ? `${job.annualSalaryMin}–${job.annualSalaryMax ?? ''} ${job.salaryCurrency ?? 'USD'}`
        : null,
      job_type: job.jobType?.[0] ?? null,
      category: deriveCategory(job.jobTitle ?? '', job.jobIndustry?.join(' ') ?? ''),
      url: job.url ?? '',
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Findwork (requires FINDWORK_API_KEY)
// ──────────────────────────────────────────────────────────

export async function fetchFindworkExternalJobs(): Promise<ExternalJob[]> {
  const apiKey = process.env.FINDWORK_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch('https://findwork.dev/api/jobs/?remote=true&limit=100', {
      headers: { Authorization: `Token ${apiKey}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.results) ? data.results : [];
    return jobs.map((job) => ({
      external_id: String(job.id),
      source: 'findwork',
      title: job.role ?? '',
      company_name: job.company_name ?? null,
      company_logo: null,
      location: 'Remote',
      salary: null,
      job_type: job.employment_type ?? null,
      category: deriveCategory(job.role ?? '', job.keywords?.join(' ') ?? ''),
      url: job.url ?? '',
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: RemoteOK (free, no key)
// ──────────────────────────────────────────────────────────

export async function fetchRemoteOKExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Joblinca/1.0 (job refresh agent)' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // First element is a metadata object — skip it
    const jobs: any[] = Array.isArray(data) ? data.slice(1) : [];
    return jobs
      .filter((job) => job.id && job.position && job.url)
      .map((job) => ({
        external_id: String(job.id),
        source: 'remoteok',
        title: job.position ?? '',
        company_name: job.company ?? null,
        company_logo: job.company_logo ?? null,
        location: 'Remote',
        salary: job.salary || null,
        job_type: 'full_time',
        category: deriveCategory(job.position ?? '', (job.tags ?? []).join(' ')),
        url: job.url ?? '',
        fetched_at: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Arbeitnow (free, no key)
// ──────────────────────────────────────────────────────────

export async function fetchArbeitnowExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.data) ? data.data : [];
    return jobs
      .filter((job) => job.remote && job.slug && job.url)
      .map((job) => ({
        external_id: job.slug,
        source: 'arbeitnow',
        title: job.title ?? '',
        company_name: job.company_name ?? null,
        company_logo: null,
        location: 'Remote',
        salary: null,
        job_type: job.job_types?.[0] ?? null,
        category: deriveCategory(job.title ?? '', job.description ?? ''),
        url: job.url ?? '',
        fetched_at: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: JSearch via RapidAPI (Indeed/LinkedIn/Glassdoor aggregator)
// ──────────────────────────────────────────────────────────

export async function fetchJSearchExternalJobs(): Promise<ExternalJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return [];
  try {
    const queries = ['software engineer', 'product manager', 'data scientist', 'designer', 'marketing'];
    const allJobs: ExternalJob[] = [];

    for (const query of queries) {
      const res = await fetch(
        `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&num_pages=2&date_posted=week`,
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
          },
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const jobs: any[] = data.data ?? [];

      for (const job of jobs) {
        allJobs.push({
          external_id: job.job_id ?? String(Date.now() + Math.random()),
          source: 'jsearch',
          title: job.job_title ?? '',
          company_name: job.employer_name ?? null,
          company_logo: job.employer_logo ?? null,
          location: job.job_city
            ? `${job.job_city}, ${job.job_state ?? ''}`
            : job.job_is_remote ? 'Remote' : 'Unknown',
          salary: job.job_min_salary && job.job_max_salary
            ? `$${job.job_min_salary.toLocaleString()} - $${job.job_max_salary.toLocaleString()}`
            : null,
          job_type: job.job_employment_type ?? null,
          category: deriveCategory(job.job_title ?? '', job.job_description?.slice(0, 500) ?? ''),
          url: job.job_apply_link ?? job.job_google_link ?? '',
          fetched_at: new Date().toISOString(),
        });
      }

      // Rate limit between queries
      await new Promise((r) => setTimeout(r, 500));
    }

    return allJobs;
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Y Combinator Work at a Startup
// ──────────────────────────────────────────────────────────

export async function fetchYCExternalJobs(): Promise<ExternalJob[]> {
  try {
    // YC's Work at a Startup uses an Algolia-backed API
    const res = await fetch('https://45bwzj1sgc-dsn.algolia.net/1/indexes/WaaSJobs_production/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Algolia-Application-Id': '45BWZJ1SGC',
        'X-Algolia-API-Key': 'MjBjYjRiMzY0NzdhZWY0NjExY2NhZjYxMGIxYjc2MTAwNWFkNTkwNTc4NjgxYjU0YzFhYTY2ZGQ5OGY5NDMzZnJlc3RyaWN0SW5kaWNlcz0lNUIlMjJXYWFTSm9ic19wcm9kdWN0aW9uJTIyJTVEJnRhZ0ZpbHRlcnM9JTVCJTIyaGlyaW5nTm93JTIyJTVEJmFuYWx5dGljc1RhZ3M9JTVCJTIyV2FhU0pvYnNJbmRleCUyMiU1RA==',
      },
      body: JSON.stringify({
        query: '',
        hitsPerPage: 100,
        page: 0,
        facetFilters: [['hiring_now:true']],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const hits: any[] = data.hits ?? [];

    return hits.map((hit) => ({
      external_id: hit.objectID ?? String(hit.id),
      source: 'yc_waat',
      title: hit.title ?? hit.job_title ?? '',
      company_name: hit.company_name ?? null,
      company_logo: hit.company_logo ?? null,
      location: hit.location ?? (hit.remote ? 'Remote' : 'San Francisco, CA'),
      salary: hit.salary_range ?? null,
      job_type: hit.type ?? 'full_time',
      category: deriveCategory(hit.title ?? '', hit.description?.slice(0, 500) ?? ''),
      url: hit.url ?? `https://www.workatastartup.com/jobs/${hit.objectID}`,
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Himalayas.app (remote startup jobs, free JSON API)
// ──────────────────────────────────────────────────────────

export async function fetchHimalayasExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://himalayas.app/jobs/api?limit=100', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];

    return jobs.map((job) => ({
      external_id: String(job.id ?? job.slug),
      source: 'himalayas',
      title: job.title ?? '',
      company_name: job.companyName ?? job.company?.name ?? null,
      company_logo: job.companyLogo ?? job.company?.logo ?? null,
      location: job.location ?? 'Remote',
      salary: job.minSalary && job.maxSalary
        ? `$${job.minSalary.toLocaleString()} - $${job.maxSalary.toLocaleString()}`
        : null,
      job_type: job.type ?? null,
      category: deriveCategory(job.title ?? '', job.categories?.join(' ') ?? job.tags?.join(' ') ?? ''),
      url: job.applicationUrl ?? job.url ?? `https://himalayas.app/jobs/${job.slug}`,
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Startup.jobs (startup-focused job board, free RSS/JSON)
// ──────────────────────────────────────────────────────────

export async function fetchStartupJobsExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://startup.jobs/api/jobs?page=1&per_page=100', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

    return jobs.map((job) => ({
      external_id: String(job.id ?? job.slug),
      source: 'startup_jobs',
      title: job.title ?? '',
      company_name: job.company_name ?? job.company?.name ?? null,
      company_logo: job.company_logo ?? null,
      location: job.location_name ?? (job.remote ? 'Remote' : 'Unknown'),
      salary: job.salary ?? null,
      job_type: job.employment_type ?? null,
      category: deriveCategory(job.title ?? '', job.tags?.map((t: any) => t.name ?? t).join(' ') ?? ''),
      url: job.url ?? `https://startup.jobs/${job.slug}`,
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Greenhouse public boards (top YC/startup companies)
// Fetches from multiple well-known Greenhouse boards
// ──────────────────────────────────────────────────────────

const GREENHOUSE_BOARDS = [
  'airbnb', 'stripe', 'figma', 'notion', 'vercel', 'supabase',
  'linear', 'retool', 'airtable', 'brex', 'ramp', 'rippling',
  'gusto', 'plaid', 'scale', 'anduril', 'flexport', 'benchling',
  'watershed', 'vanta', 'lattice', 'mercury', 'loom',
  'deel', 'remote', 'dbt-labs', 'airbyte', 'snyk',
];

export async function fetchGreenhouseBoardsExternalJobs(): Promise<ExternalJob[]> {
  const allJobs: ExternalJob[] = [];

  const results = await Promise.allSettled(
    GREENHOUSE_BOARDS.map(async (board) => {
      try {
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, {
          next: { revalidate: 7200 },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const jobs: any[] = data.jobs ?? [];

        return jobs.map((job) => ({
          external_id: `gh_${board}_${job.id}`,
          source: 'greenhouse_boards',
          title: job.title ?? '',
          company_name: board.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          company_logo: null,
          location: job.location?.name ?? 'Unknown',
          salary: null,
          job_type: null,
          category: deriveCategory(job.title ?? '', job.content?.slice(0, 500) ?? ''),
          url: job.absolute_url ?? `https://boards.greenhouse.io/${board}/jobs/${job.id}`,
          fetched_at: new Date().toISOString(),
        }));
      } catch {
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allJobs.push(...result.value);
    }
  }

  return allJobs;
}

// ──────────────────────────────────────────────────────────
// Provider: Lever public postings (startup companies)
// ──────────────────────────────────────────────────────────

const LEVER_COMPANIES = [
  'netflix', 'coinbase', 'twitch', 'cloudflare', 'databricks',
  'openai', 'anthropic', 'datadog', 'hashicorp', 'gitlab',
  'samsara', 'pagerduty', 'confluent', 'mixpanel', 'amplitude',
  'livekit', 'modal', 'replit', 'railway', 'fly',
];

export async function fetchLeverBoardsExternalJobs(): Promise<ExternalJob[]> {
  const allJobs: ExternalJob[] = [];

  const results = await Promise.allSettled(
    LEVER_COMPANIES.map(async (company) => {
      try {
        const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, {
          next: { revalidate: 7200 },
        });
        if (!res.ok) return [];
        const postings: any[] = await res.json();
        if (!Array.isArray(postings)) return [];

        return postings.map((posting) => ({
          external_id: `lever_${company}_${posting.id}`,
          source: 'lever_boards',
          title: posting.text ?? '',
          company_name: company.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          company_logo: null,
          location: posting.categories?.location ?? 'Unknown',
          salary: posting.salaryRange
            ? `${posting.salaryRange.min ?? ''} - ${posting.salaryRange.max ?? ''} ${posting.salaryRange.currency ?? 'USD'}`
            : null,
          job_type: posting.categories?.commitment ?? null,
          category: deriveCategory(posting.text ?? '', posting.categories?.team ?? ''),
          url: posting.hostedUrl ?? posting.applyUrl ?? `https://jobs.lever.co/${company}/${posting.id}`,
          fetched_at: new Date().toISOString(),
        }));
      } catch {
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allJobs.push(...result.value);
    }
  }

  return allJobs;
}

// ──────────────────────────────────────────────────────────
// Provider: The Muse (free API, diverse companies)
// ──────────────────────────────────────────────────────────

export async function fetchTheMuseExternalJobs(): Promise<ExternalJob[]> {
  try {
    const pages = [1, 2, 3]; // Fetch 3 pages
    const allJobs: ExternalJob[] = [];

    for (const page of pages) {
      const res = await fetch(`https://www.themuse.com/api/public/jobs?page=${page}&descending=true`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const jobs: any[] = data.results ?? [];

      for (const job of jobs) {
        const locations = (job.locations ?? []).map((l: any) => l.name).join(', ');

        allJobs.push({
          external_id: String(job.id),
          source: 'themuse',
          title: job.name ?? '',
          company_name: job.company?.name ?? null,
          company_logo: null,
          location: locations || 'Flexible',
          salary: null,
          job_type: job.type ?? null,
          category: deriveCategory(job.name ?? '', job.categories?.map((c: any) => c.name).join(' ') ?? ''),
          url: job.refs?.landing_page ?? `https://www.themuse.com/jobs/${job.id}`,
          fetched_at: new Date().toISOString(),
        });
      }
    }

    return allJobs;
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Aggregate: fetch from all providers in parallel
// ──────────────────────────────────────────────────────────

export async function fetchAllExternalJobs(): Promise<{
  jobs: ExternalJob[];
  sourceCounts: Record<string, number>;
  errorSources: string[];
}> {
  const providers: Array<{ name: string; fn: () => Promise<ExternalJob[]> }> = [
    { name: 'remotive', fn: fetchRemotiveExternalJobs },
    { name: 'jobicy', fn: fetchJobicyExternalJobs },
    { name: 'findwork', fn: fetchFindworkExternalJobs },
    { name: 'remoteok', fn: fetchRemoteOKExternalJobs },
    { name: 'arbeitnow', fn: fetchArbeitnowExternalJobs },
    { name: 'jsearch', fn: fetchJSearchExternalJobs },
    { name: 'yc_waat', fn: fetchYCExternalJobs },
    { name: 'himalayas', fn: fetchHimalayasExternalJobs },
    { name: 'startup_jobs', fn: fetchStartupJobsExternalJobs },
    { name: 'greenhouse_boards', fn: fetchGreenhouseBoardsExternalJobs },
    { name: 'lever_boards', fn: fetchLeverBoardsExternalJobs },
    { name: 'themuse', fn: fetchTheMuseExternalJobs },
  ];

  const results = await Promise.allSettled(providers.map((p) => p.fn()));

  const jobs: ExternalJob[] = [];
  const sourceCounts: Record<string, number> = {};
  const errorSources: string[] = [];

  results.forEach((result, i) => {
    const name = providers[i].name;
    if (result.status === 'fulfilled') {
      sourceCounts[name] = result.value.length;
      jobs.push(...result.value);
    } else {
      sourceCounts[name] = 0;
      errorSources.push(name);
    }
  });

  return { jobs, sourceCounts, errorSources };
}
