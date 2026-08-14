import { describe, it, expect, vi } from "vitest";
import {
  describeDbError,
  isTransientDbError,
  withTransientRetry,
  type QueryResult,
  type SupabaseError,
} from "@/lib/supabase-retry";

/** The real thing: supabase-js puts the whole CDN page in `message`. */
const CLOUDFLARE_522: SupabaseError = {
  message: `<!DOCTYPE html>
<html class="no-js" lang="en-US">
<head>
<title>supabase.co | 522: Connection timed out</title>
</head>
<body><h1>Connection timed out</h1></body>
</html>`,
};

describe("isTransientDbError", () => {
  it("treats an unreachable database as transient", () => {
    expect(isTransientDbError(CLOUDFLARE_522)).toBe(true);
    expect(isTransientDbError({ message: "TypeError: fetch failed" })).toBe(true);
    expect(isTransientDbError({ message: "socket hang up" })).toBe(true);
    expect(isTransientDbError({ message: "connect ETIMEDOUT 1.2.3.4:443" })).toBe(
      true
    );
    expect(isTransientDbError({ message: "504 Gateway Timeout" })).toBe(true);
  });

  it("never retries a coded PostgREST error", () => {
    // These are deterministic: the query is wrong, and retrying it just
    // fails again more slowly.
    expect(
      isTransientDbError({ code: "42703", message: "column x does not exist" })
    ).toBe(false);
    expect(
      isTransientDbError({ code: "PGRST200", message: "could not find relationship" })
    ).toBe(false);
    expect(
      isTransientDbError({ code: "23505", message: "duplicate key value" })
    ).toBe(false);
  });

  it("does not retry a coded error just because it reads like a timeout", () => {
    // The code is the authority: PostgREST answered, and it said no.
    expect(
      isTransientDbError({ code: "42703", message: "statement timed out" })
    ).toBe(false);
  });

  it("retries Postgres connection-exception codes (class 08)", () => {
    expect(isTransientDbError({ code: "08006", message: "connection failure" })).toBe(
      true
    );
  });

  it("is false for no error and for an empty message", () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError({ message: "" })).toBe(false);
  });
});

describe("describeDbError", () => {
  it("pulls the one useful line out of a CDN error page", () => {
    // Logging the whole page buries the line that matters.
    expect(describeDbError(CLOUDFLARE_522)).toBe(
      "supabase.co | 522: Connection timed out"
    );
  });

  it("keeps the code and collapses whitespace", () => {
    expect(
      describeDbError({ code: "42703", message: "column\n  x   does not exist" })
    ).toBe("[42703] column x does not exist");
  });

  it("truncates a runaway message", () => {
    const long = describeDbError({ message: "x".repeat(500) }, 50);
    expect(long).toHaveLength(50);
  });

  it("handles a null error", () => {
    expect(describeDbError(null)).toBe("unknown error");
  });
});

describe("withTransientRetry", () => {
  const noDelay = [0, 0];

  function results<T>(...queue: QueryResult<T>[]) {
    const calls = { count: 0 };
    const run = () => {
      calls.count += 1;
      return Promise.resolve(queue[Math.min(calls.count - 1, queue.length - 1)]);
    };
    return { run, calls };
  }

  it("returns first-attempt success without retrying", async () => {
    const { run, calls } = results({ data: [1], error: null });
    const outcome = await withTransientRetry("t", run, noDelay);

    expect(outcome.data).toEqual([1]);
    expect(outcome.attempts).toBe(1);
    expect(outcome.transient).toBe(false);
    expect(calls.count).toBe(1);
  });

  it("recovers when a blip clears on the second attempt", async () => {
    const { run, calls } = results(
      { data: null, error: CLOUDFLARE_522 },
      { data: ["recovered"], error: null }
    );
    const outcome = await withTransientRetry("t", run, noDelay);

    expect(outcome.data).toEqual(["recovered"]);
    expect(outcome.attempts).toBe(2);
    expect(outcome.error).toBeNull();
    expect(calls.count).toBe(2);
  });

  it("gives up after exhausting attempts and reports it as transient", async () => {
    const { run, calls } = results({ data: null, error: CLOUDFLARE_522 });
    const outcome = await withTransientRetry("t", run, noDelay);

    expect(outcome.transient).toBe(true);
    expect(outcome.data).toBeNull();
    expect(calls.count).toBe(noDelay.length + 1);
  });

  it("fails a coded error immediately without burning retries", async () => {
    const { run, calls } = results({
      data: null,
      error: { code: "42703", message: "column x does not exist" },
    });
    const outcome = await withTransientRetry("t", run, noDelay);

    expect(calls.count).toBe(1);
    expect(outcome.transient).toBe(false);
    expect(outcome.error?.code).toBe("42703");
  });

  it("calls the builder fresh each attempt", async () => {
    // A PostgREST builder is single-use; awaiting one twice would silently
    // return the first result forever.
    const seen: number[] = [];
    let n = 0;
    const run = () => {
      n += 1;
      seen.push(n);
      return Promise.resolve<QueryResult<unknown>>(
        n < 3 ? { data: null, error: CLOUDFLARE_522 } : { data: "ok", error: null }
      );
    };

    const outcome = await withTransientRetry("t", run, noDelay);
    expect(seen).toEqual([1, 2, 3]);
    expect(outcome.data).toBe("ok");
  });

  it("treats a thrown rejection as a transient failure", async () => {
    // A DNS or TLS failure rejects rather than populating `error`.
    let n = 0;
    const run = () => {
      n += 1;
      if (n === 1) return Promise.reject(new Error("getaddrinfo EAI_AGAIN"));
      return Promise.resolve<QueryResult<unknown>>({ data: "ok", error: null });
    };

    const outcome = await withTransientRetry("t", run, noDelay);
    expect(outcome.data).toBe("ok");
    expect(outcome.attempts).toBe(2);
  });

  it("waits between attempts", async () => {
    vi.useFakeTimers();
    try {
      const { run } = results({ data: null, error: CLOUDFLARE_522 });
      const promise = withTransientRetry("t", run, [50, 50]);
      await vi.advanceTimersByTimeAsync(200);
      const outcome = await promise;
      expect(outcome.transient).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
