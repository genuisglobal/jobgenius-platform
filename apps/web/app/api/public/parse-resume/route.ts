import { handleAnonymousResumeParse } from "@/lib/resume-parse-endpoint";

/**
 * Public resume-parse endpoint for anonymous lead intake flows.
 */
export async function POST(request: Request) {
  return handleAnonymousResumeParse(request);
}
