// ============================================================
// Telling a broken query apart from an unreachable database.
//
// The scheduled jobs were failing a few times a day with a bare 500 and
// no logged cause. The cause turned out not to be in the code at all:
// Supabase intermittently returns a Cloudflare 522 ("connection timed
// out" to the database), and supabase-js surfaces that by putting the
// entire HTML error page into `error.message`. Both callers discarded
// that message and returned "Failed to load jobs.", which is why nobody
// could tell an outage from a bug.
//
// ─── The distinction this module rests on ────────────────────────────────
//
// A PostgREST error carries a `code`: 42703 for an unknown column,
// PGRST200 for a broken embed, 23505 for a unique violation. Those are
// deterministic — the query is wrong, and retrying it just fails again,
// more slowly.
//
// An infrastructure failure has no code, because nothing that speaks
// PostgREST ever answered: a dropped socket, a gateway timeout, an HTML
// error page from a CDN. Those are worth one more try.
//
// So: retry the codeless failures, never the coded ones.
// ============================================================

import { createLogger } from "@/lib/logger";

const log = createLogger("supabase-retry");

export type SupabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

export type QueryResult<T> = { data: T | null; error: SupabaseError };

/** Delays between attempts, in ms. Length also sets the retry count. */
export const RETRY_DELAYS_MS = [250, 1000];

const TRANSIENT_PATTERNS = [
  /fetch failed/i,
  /network/i,
  /socket hang up/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE/i,
  /timed? ?out/i,
  /<!DOCTYPE/i, // A CDN error page, not a database answer.
  /\b(50[234]|52[0-9])\b/, // Gateway and Cloudflare origin failures.
  /upstream|gateway|unavailable|temporarily/i,
];

/**
 * Whether a failure is worth trying again.
 *
 * A coded error is never transient however its message reads: PostgREST
 * answered, and it said no. Only codeless failures are candidates, which
 * is what an unreachable database looks like from here.
 */
export function isTransientDbError(error: SupabaseError): boolean {
  if (!error) return false;

  const code = typeof error.code === "string" ? error.code.trim() : "";
  if (code) {
    // Postgres class 08 is connection exception — coded, but genuinely
    // transient, so it is the one exception to the rule above.
    return code.startsWith("08");
  }

  const message = `${error.message ?? ""} ${error.details ?? ""}`;
  if (!message.trim()) return false;
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Trims a failure down to something loggable. An unreachable Supabase
 * puts a whole HTML page in `message`; dumping that into the logs buries
 * the one line that matters and makes the log itself hard to read.
 */
export function describeDbError(error: SupabaseError, limit = 200): string {
  if (!error) return "unknown error";
  const code = error.code ? `[${error.code}] ` : "";
  const raw = (error.message ?? "").replace(/\s+/g, " ").trim();
  const isHtml = /<!DOCTYPE|<html/i.test(raw);
  const body = isHtml
    ? // Cloudflare puts the useful part in <title>, e.g. "522: Connection timed out".
      raw.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? "HTML error page"
    : raw;
  return `${code}${body.slice(0, limit)}`;
}

export type RetryOutcome<T> = {
  data: T | null;
  error: SupabaseError;
  attempts: number;
  /** True when it failed and the failure looked like infrastructure. */
  transient: boolean;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run a Supabase query, retrying only failures that look like an
 * unreachable database. `run` is called fresh each attempt — a
 * PostgREST builder is single-use, so it cannot be awaited twice.
 */
export async function withTransientRetry<T>(
  label: string,
  run: () => PromiseLike<QueryResult<T>>,
  delays: number[] = RETRY_DELAYS_MS
): Promise<RetryOutcome<T>> {
  let last: QueryResult<T> = { data: null, error: null };

  for (let attempt = 1; attempt <= delays.length + 1; attempt += 1) {
    try {
      last = await run();
    } catch (thrown) {
      // supabase-js normally reports errors in `error`, but a DNS or TLS
      // failure can reject outright.
      last = {
        data: null,
        error: { message: thrown instanceof Error ? thrown.message : String(thrown) },
      };
    }

    if (!last.error) {
      if (attempt > 1) {
        log.info("query recovered after retry", { label, attempts: attempt });
      }
      return { data: last.data, error: null, attempts: attempt, transient: false };
    }

    if (!isTransientDbError(last.error)) {
      return {
        data: null,
        error: last.error,
        attempts: attempt,
        transient: false,
      };
    }

    const delay = delays[attempt - 1];
    if (delay === undefined) break; // Out of attempts.

    log.warn("transient database failure, retrying", {
      label,
      attempt,
      next_delay_ms: delay,
      error: describeDbError(last.error),
    });
    await sleep(delay);
  }

  return {
    data: null,
    error: last.error,
    attempts: delays.length + 1,
    transient: true,
  };
}

/**
 * The response a cron should get when the database could not be reached.
 *
 * 503 rather than 500, and never a 200: the job genuinely did not run, so
 * reporting success would hide a real outage behind a green tick. The
 * distinction lets a caller tell "come back later" from "this is broken".
 */
export function transientUnavailableBody(label: string, error: SupabaseError) {
  return {
    success: false,
    transient: true,
    error: `Database unreachable while loading ${label}.`,
    detail: describeDbError(error),
  };
}
