import { deriveCategory, type ExternalJob } from "@/lib/externalJobs";

export type SupportedCareerAts =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "smartrecruiters";

export type CareerPageDetection = {
  atsType: SupportedCareerAts | "icims" | "jobvite" | "custom" | "unknown";
  boardToken: string | null;
};

export type CareerPageRow = {
  company_name: string;
  career_url: string;
  ats_type: string | null;
  board_token: string | null;
};

export type ResolvedCareerPageSource = {
  atsType: CareerPageDetection["atsType"];
  boardToken: string | null;
  isSupported: boolean;
};

function normalizeUrlPathSegments(careerUrl: string) {
  try {
    const url = new URL(careerUrl);
    return {
      url,
      segments: url.pathname.split("/").filter(Boolean),
    };
  } catch {
    return null;
  }
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function locationFromParts(...parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((part) => asNullableString(part))
    .filter((part): part is string => Boolean(part));
  return normalized.length > 0 ? normalized.join(", ") : "Unknown";
}

function parseGreenhouseBoardToken(careerUrl: string) {
  const normalized = careerUrl.toLowerCase();
  const match =
    normalized.match(/boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i) ??
    normalized.match(/greenhouse\.io\/(?:embed\/)?(?:boards\/)?([a-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function parseLeverCompanySlug(careerUrl: string) {
  const normalized = careerUrl.toLowerCase();
  const match = normalized.match(/lever\.co\/([a-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function parseAshbyBoardToken(careerUrl: string) {
  const normalized = careerUrl.toLowerCase();
  const match = normalized.match(/ashbyhq\.com\/([a-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function parseSmartRecruitersCompanyIdentifier(careerUrl: string) {
  const parsed = normalizeUrlPathSegments(careerUrl);
  if (!parsed) {
    return null;
  }

  const ignoredPrefixes = new Set(["jobs", "company", "careers"]);
  const companySegment = parsed.segments.find(
    (segment) => !ignoredPrefixes.has(segment.toLowerCase())
  );
  return companySegment ?? null;
}

function parseWorkdayCareerConfig(careerUrl: string, boardToken?: string | null) {
  const parsed = normalizeUrlPathSegments(careerUrl);
  if (!parsed) {
    return null;
  }

  if (boardToken && boardToken.includes("/")) {
    const [tenant, site] = boardToken.split("/").filter(Boolean);
    if (tenant && site) {
      return {
        origin: parsed.url.origin,
        tenant,
        site,
        boardToken: `${tenant}/${site}`,
      };
    }
  }

  const recruitingIndex = parsed.segments.findIndex(
    (segment) => segment.toLowerCase() === "recruiting"
  );

  if (recruitingIndex >= 0 && parsed.segments.length >= recruitingIndex + 3) {
    const tenant = parsed.segments[recruitingIndex + 1];
    const site = parsed.segments[recruitingIndex + 2];
    if (tenant && site) {
      return {
        origin: parsed.url.origin,
        tenant,
        site,
        boardToken: `${tenant}/${site}`,
      };
    }
  }

  return null;
}

function toAbsoluteUrl(origin: string, pathOrUrl: string | null | undefined) {
  const normalized = asNullableString(pathOrUrl);
  if (!normalized) {
    return null;
  }
  try {
    return new URL(normalized, origin).toString();
  } catch {
    return normalized;
  }
}

function extractWorkdayLocation(posting: Record<string, unknown>) {
  const locationsText = asNullableString(posting["locationsText"]);
  if (locationsText) {
    return locationsText;
  }

  const bulletFields = Array.isArray(posting["bulletFields"])
    ? posting["bulletFields"].map((field) => asNullableString(field)).filter(Boolean)
    : [];
  return bulletFields.length > 0 ? bulletFields.join(", ") : "Unknown";
}

async function fetchSmartRecruitersPostingDescription(companyIdentifier: string, postingId: string) {
  try {
    const response = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyIdentifier)}/postings/${encodeURIComponent(postingId)}`
    );
    if (!response.ok) {
      return "";
    }
    const data = await response.json();
    const sections = Array.isArray(data.jobAd?.sections) ? data.jobAd.sections : [];
    return sections
      .map((section: any) => asNullableString(section?.text) ?? "")
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return "";
  }
}

export function detectCareerPageSource(careerUrl: string): CareerPageDetection {
  const normalized = careerUrl.toLowerCase();

  if (normalized.includes("greenhouse.io") || normalized.includes("boards-api.greenhouse.io")) {
    return {
      atsType: "greenhouse",
      boardToken: parseGreenhouseBoardToken(careerUrl),
    };
  }

  if (normalized.includes("lever.co")) {
    return {
      atsType: "lever",
      boardToken: parseLeverCompanySlug(careerUrl),
    };
  }

  if (normalized.includes("ashbyhq.com")) {
    return {
      atsType: "ashby",
      boardToken: parseAshbyBoardToken(careerUrl),
    };
  }

  if (normalized.includes("smartrecruiters.com")) {
    return {
      atsType: "smartrecruiters",
      boardToken: parseSmartRecruitersCompanyIdentifier(careerUrl),
    };
  }

  if (normalized.includes("workday.com") || normalized.includes("myworkday")) {
    const workdayConfig = parseWorkdayCareerConfig(careerUrl);
    return {
      atsType: "workday",
      boardToken: workdayConfig?.boardToken ?? null,
    };
  }

  if (normalized.includes("icims.com")) {
    return { atsType: "icims", boardToken: null };
  }

  if (normalized.includes("jobvite.com")) {
    return { atsType: "jobvite", boardToken: null };
  }

  return { atsType: "unknown", boardToken: null };
}

export function resolveCareerPageSource(page: CareerPageRow): ResolvedCareerPageSource {
  const detected = detectCareerPageSource(page.career_url);
  const atsType = (page.ats_type ?? detected.atsType) as CareerPageDetection["atsType"];
  const boardToken = page.board_token ?? detected.boardToken;

  if (atsType === "workday") {
    return {
      atsType,
      boardToken,
      isSupported: Boolean(parseWorkdayCareerConfig(page.career_url, boardToken)),
    };
  }

  const isSupported =
    (atsType === "greenhouse" ||
      atsType === "lever" ||
      atsType === "ashby" ||
      atsType === "smartrecruiters") &&
    Boolean(boardToken);

  return { atsType, boardToken, isSupported };
}

export async function crawlGreenhouseBoard(
  boardToken: string,
  companyName: string
): Promise<ExternalJob[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const jobs: any[] = data.jobs ?? [];

  return jobs.map((job) => ({
    external_id: `career_gh_${boardToken}_${job.id}`,
    source: "career_greenhouse",
    title: job.title ?? "",
    company_name: companyName,
    company_logo: null,
    location: job.location?.name ?? "Unknown",
    salary: null,
    job_type: null,
    category: deriveCategory(job.title ?? "", job.content?.slice(0, 500) ?? ""),
    url: job.absolute_url ?? `https://boards.greenhouse.io/${boardToken}/jobs/${job.id}`,
    fetched_at: new Date().toISOString(),
  }));
}

export async function crawlLeverBoard(
  companySlug: string,
  companyName: string
): Promise<ExternalJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(companySlug)}?mode=json`);
  if (!res.ok) return [];
  const postings: any[] = await res.json();
  if (!Array.isArray(postings)) return [];

  return postings.map((posting) => ({
    external_id: `career_lever_${companySlug}_${posting.id}`,
    source: "career_lever",
    title: posting.text ?? "",
    company_name: companyName,
    company_logo: null,
    location: posting.categories?.location ?? "Unknown",
    salary: posting.salaryRange
      ? `${posting.salaryRange.min ?? ""} - ${posting.salaryRange.max ?? ""} ${posting.salaryRange.currency ?? "USD"}`
      : null,
    job_type: posting.categories?.commitment ?? null,
    category: deriveCategory(posting.text ?? "", posting.categories?.team ?? ""),
    url: posting.hostedUrl ?? posting.applyUrl ?? `https://jobs.lever.co/${companySlug}/${posting.id}`,
    fetched_at: new Date().toISOString(),
  }));
}

export async function crawlAshbyBoard(
  boardToken: string,
  companyName: string
): Promise<ExternalJob[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}`);
  if (!res.ok) return [];
  const data = await res.json();
  const jobs: any[] = data.jobs ?? [];

  return jobs.map((job) => ({
    external_id: `career_ashby_${boardToken}_${job.id}`,
    source: "career_ashby",
    title: job.title ?? "",
    company_name: companyName,
    company_logo: null,
    location: job.location ?? "Unknown",
    salary: null,
    job_type: job.employmentType ?? null,
    category: deriveCategory(job.title ?? "", job.departmentName ?? ""),
    url: job.jobUrl ?? `https://jobs.ashbyhq.com/${boardToken}/${job.id}`,
    fetched_at: new Date().toISOString(),
  }));
}

export async function crawlSmartRecruitersBoard(
  companyIdentifier: string,
  companyName: string
): Promise<ExternalJob[]> {
  const jobs: ExternalJob[] = [];
  const limit = 100;
  let offset = 0;
  let totalFound = Number.POSITIVE_INFINITY;
  let detailFetches = 0;

  while (offset < totalFound && jobs.length < 500) {
    const response = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyIdentifier)}/postings?limit=${limit}&offset=${offset}`
    );
    if (!response.ok) {
      break;
    }

    const data = await response.json();
    const postings: any[] = Array.isArray(data.content) ? data.content : [];
    totalFound = Number.isFinite(data.totalFound) ? Number(data.totalFound) : offset + postings.length;

    for (const posting of postings) {
      const location = locationFromParts(
        posting.location?.city,
        posting.location?.region,
        posting.location?.country
      );
      let description = "";
      if (detailFetches < 30 && posting.id) {
        detailFetches += 1;
        description = await fetchSmartRecruitersPostingDescription(companyIdentifier, String(posting.id));
      }

      jobs.push({
        external_id: `career_smartrecruiters_${companyIdentifier}_${posting.id}`,
        source: "career_smartrecruiters",
        title: posting.name ?? "",
        company_name: companyName,
        company_logo: null,
        location,
        salary: null,
        job_type: posting.typeOfEmployment?.label ?? null,
        category: deriveCategory(
          posting.name ?? "",
          posting.department?.label ?? "",
          description.slice(0, 500)
        ),
        url:
          posting.ref ??
          posting.postingUrl ??
          `https://jobs.smartrecruiters.com/${companyIdentifier}/${posting.id}`,
        fetched_at: new Date().toISOString(),
      });
    }

    if (postings.length < limit) {
      break;
    }
    offset += postings.length;
  }

  return jobs;
}

export async function crawlWorkdayBoard(page: CareerPageRow): Promise<ExternalJob[]> {
  const config = parseWorkdayCareerConfig(page.career_url, page.board_token);
  if (!config) {
    return [];
  }

  const endpoint = `${config.origin}/wday/cxs/${encodeURIComponent(config.tenant)}/${encodeURIComponent(config.site)}/jobs`;
  const jobs: ExternalJob[] = [];
  const limit = 100;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total && jobs.length < 500) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit,
        offset,
        searchText: "",
      }),
    });

    if (!response.ok) {
      break;
    }

    const data = await response.json();
    const postings: Array<Record<string, unknown>> = Array.isArray(data.jobPostings)
      ? data.jobPostings
      : [];
    total = Number.isFinite(data.total) ? Number(data.total) : offset + postings.length;

    for (const posting of postings) {
      const title = asNullableString(posting["title"]) ?? "";
      const externalPath = asNullableString(posting["externalPath"]);
      const externalId =
        asNullableString(posting["jobReqId"]) ??
        externalPath ??
        `${config.boardToken}-${offset}-${jobs.length}`;

      jobs.push({
        external_id: `career_workday_${config.tenant}_${config.site}_${externalId}`,
        source: "career_workday",
        title,
        company_name: page.company_name,
        company_logo: null,
        location: extractWorkdayLocation(posting),
        salary: null,
        job_type: null,
        category: deriveCategory(title, extractWorkdayLocation(posting)),
        url: toAbsoluteUrl(config.origin, externalPath) ?? page.career_url,
        fetched_at: new Date().toISOString(),
      });
    }

    if (postings.length < limit) {
      break;
    }
    offset += postings.length;
  }

  return jobs;
}

export async function crawlCareerPageJobs(page: CareerPageRow): Promise<ExternalJob[]> {
  const { atsType, boardToken } = resolveCareerPageSource(page);

  if (atsType === "greenhouse" && boardToken) {
    return crawlGreenhouseBoard(boardToken, page.company_name);
  }

  if (atsType === "lever" && boardToken) {
    return crawlLeverBoard(boardToken, page.company_name);
  }

  if (atsType === "ashby" && boardToken) {
    return crawlAshbyBoard(boardToken, page.company_name);
  }

  if (atsType === "smartrecruiters" && boardToken) {
    return crawlSmartRecruitersBoard(boardToken, page.company_name);
  }

  if (atsType === "workday") {
    return crawlWorkdayBoard({
      ...page,
      board_token: boardToken,
    });
  }

  return [];
}
