import { handleAnonymousResumeParse } from "@/lib/resume-parse-endpoint";

/**
 * POST /api/auth/parse-resume
 *
 * Anonymous endpoint that accepts a resume file and returns the parsed
 * profile JSON without persisting anything. Used to pre-fill the signup
 * form so busy job seekers don't have to type.
 *
 * Rate-limited per IP since it triggers an OpenAI call.
 */
export async function POST(request: Request) {
  return handleAnonymousResumeParse(request);
}
