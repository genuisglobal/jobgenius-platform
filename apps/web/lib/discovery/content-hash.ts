import { createHash } from "node:crypto";
import {
  cleanDiscoveryCompany,
  cleanDiscoveryDescriptionText,
  cleanDiscoveryLocation,
  cleanDiscoverySalary,
  cleanDiscoveryTitle,
  normalizeDiscoveryFingerprintText,
} from "@/lib/discovery/job-cleaning";

export function normalizeDiscoveryText(value: string | null | undefined): string {
  return normalizeDiscoveryFingerprintText(value);
}

export function computeDiscoveredJobContentHash(job: {
  title: string | null | undefined;
  company: string | null | undefined;
  location: string | null | undefined;
  salary?: string | null | undefined;
  description_text: string | null | undefined;
}) {
  const parts = [
    normalizeDiscoveryText(cleanDiscoveryTitle(job.title)),
    normalizeDiscoveryText(cleanDiscoveryCompany(job.company)),
    normalizeDiscoveryText(cleanDiscoveryLocation(job.location)),
    normalizeDiscoveryText(cleanDiscoveryDescriptionText(job.description_text)),
  ];
  const cleanedSalary = normalizeDiscoveryText(cleanDiscoverySalary(job.salary));
  if (cleanedSalary) {
    parts.push(cleanedSalary);
  }

  const fingerprint = parts.join("::");

  return createHash("sha256").update(fingerprint).digest("hex");
}
