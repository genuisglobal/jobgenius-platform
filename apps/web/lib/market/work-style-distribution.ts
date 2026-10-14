import { extractWorkType } from "@/lib/matching/extractors";

export interface WorkStyleDistribution {
  remote: number;
  hybrid: number;
  onsite: number;
  sampleSize: number;
}

const EMPTY_DISTRIBUTION: WorkStyleDistribution = {
  remote: 0,
  hybrid: 0,
  onsite: 0,
  sampleSize: 0,
};

export function computeWorkStyleDistribution(
  jobs: { location: string | null; description_text: string | null }[]
): WorkStyleDistribution {
  let remote = 0;
  let hybrid = 0;
  let onsite = 0;

  for (const job of jobs) {
    const workType = extractWorkType(job.location, job.description_text ?? "");
    if (workType === "remote") remote++;
    else if (workType === "hybrid") hybrid++;
    else if (workType === "on-site") onsite++;
  }

  const classified = remote + hybrid + onsite;
  if (classified === 0) return EMPTY_DISTRIBUTION;

  const rawPercentages = {
    remote: (remote / classified) * 100,
    hybrid: (hybrid / classified) * 100,
    onsite: (onsite / classified) * 100,
  };

  const rounded = {
    remote: Math.round(rawPercentages.remote),
    hybrid: Math.round(rawPercentages.hybrid),
    onsite: Math.round(rawPercentages.onsite),
  };

  // Rounding can drift the total off 100 by a point; correct on the largest bucket.
  const drift = 100 - (rounded.remote + rounded.hybrid + rounded.onsite);
  if (drift !== 0) {
    const largestKey = (Object.keys(rawPercentages) as (keyof typeof rawPercentages)[]).reduce((a, b) =>
      rawPercentages[a] >= rawPercentages[b] ? a : b
    );
    rounded[largestKey] += drift;
  }

  return { ...rounded, sampleSize: classified };
}
