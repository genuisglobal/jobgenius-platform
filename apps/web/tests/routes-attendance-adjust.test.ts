// ============================================================
// PATCH /api/am/attendance/day/[id]
//
// The highest-stakes write in the attendance system: it sets a time the
// clock never observed, on a record that feeds hours worked and
// ultimately pay. Everything here is about who may do it, what they may
// set, and what is recorded alongside.
//
// See tests/helpers/supabase-mock.ts on what a mocked client can and
// cannot prove — notably it cannot prove the RLS policies are right.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  authAs,
  createSupabaseMock,
  filteredOn,
  type ResultMap,
} from "./helpers/supabase-mock";

const auth = vi.hoisted(() => ({ current: null as unknown }));
const db = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/auth", () => ({
  requireAM: async () => auth.current,
  get supabaseAdmin() {
    return (db.current as { client: unknown }).client;
  },
}));

// A static import is safe here: vitest hoists vi.mock above the imports,
// so the route sees the mocked auth module. Top-level await would trip
// the project's module target.
import { PATCH } from "@/app/api/am/attendance/day/[id]/route";

const DAY_ID = "day-1";

/** An open shift: signed in 08:00 WAT, never signed out. */
function openShift(overrides: Record<string, unknown> = {}) {
  return {
    id: DAY_ID,
    account_manager_id: "am-worker",
    work_date: "2026-08-13",
    signed_in_at: "2026-08-13T07:00:00Z",
    signed_out_at: null,
    adjusted_by: null,
    adjusted_at: null,
    adjustment_note: null,
    long_shift_alerted_at: null,
    ...overrides,
  };
}

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock({
    attendance_days: { data: openShift() },
    attendance_breaks: { data: [] },
    ...results,
  });
  db.current = mock;
  return mock;
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/am/attendance/day/day-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: { id: DAY_ID } }
  );
}

beforeEach(() => {
  auth.current = authAs("am-manager", "ops_manager");
  setup();
});

describe("authorisation", () => {
  it("rejects an unauthenticated caller", async () => {
    auth.current = { authenticated: false, error: "No session", status: 401 };
    const res = await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(res.status).toBe(401);
  });

  it("rejects an ordinary AM — including on their own shift", async () => {
    // The point of the restriction: nobody sets their own hours by hand.
    auth.current = authAs("am-worker", "am");
    const res = await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("people manager"),
    });
  });

  it("allows an ops manager, an admin and a superadmin", async () => {
    for (const role of ["ops_manager", "admin", "superadmin"]) {
      setup();
      auth.current = authAs("am-manager", role);
      const res = await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
      expect(res.status).toBe(200);
    }
  });

  it("does not write anything when it rejects the caller", async () => {
    auth.current = authAs("am-worker", "am");
    const mock = setup();
    await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(mock.callsFor("attendance_days", "update")).toHaveLength(0);
  });
});

describe("validation", () => {
  it("rejects a malformed body", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/am/attendance/day/day-1", {
        method: "PATCH",
        body: "not json",
      }),
      { params: { id: DAY_ID } }
    );
    expect(res.status).toBe(400);
  });

  it("404s an unknown shift", async () => {
    setup({ attendance_days: { data: null } });
    const res = await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(res.status).toBe(404);
  });

  it("409s a shift that is already closed", async () => {
    setup({
      attendance_days: { data: openShift({ signed_out_at: "2026-08-13T16:00:00Z" }) },
    });
    const res = await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(res.status).toBe(409);
  });

  it("rejects a sign-out before the sign-in and writes nothing", async () => {
    const mock = setup();
    const res = await patch({ signed_out_at: "2026-08-13T06:00:00Z" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/before sign-in/i),
    });
    expect(mock.callsFor("attendance_days", "update")).toHaveLength(0);
  });

  it("rejects a missing time rather than defaulting to now", async () => {
    const res = await patch({ note: "forgot" });
    expect(res.status).toBe(400);
  });
});

describe("the write", () => {
  it("records the corrected time, who did it, and why", async () => {
    const mock = setup();
    const res = await patch({
      signed_out_at: "2026-08-13T15:00:00Z",
      note: "  Power cut at 16:00  ",
    });

    expect(res.status).toBe(200);
    const payload = mock.payloadFor("attendance_days", "update") as Record<
      string,
      unknown
    >;

    expect(payload.signed_out_at).toBe("2026-08-13T15:00:00.000Z");
    expect(payload.adjusted_by).toBe("am-manager");
    expect(payload.adjustment_note).toBe("Power cut at 16:00"); // trimmed
    expect(typeof payload.adjusted_at).toBe("string");
  });

  it("stores a blank note as null rather than an empty string", async () => {
    const mock = setup();
    await patch({ signed_out_at: "2026-08-13T15:00:00Z", note: "   " });
    const payload = mock.payloadFor("attendance_days", "update") as Record<
      string,
      unknown
    >;
    expect(payload.adjustment_note).toBeNull();
  });

  it("guards against a concurrent correction", async () => {
    // Someone else may close the shift between the load and the write, so
    // the update re-asserts that it is still open.
    const mock = setup();
    await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    const update = mock.callsFor("attendance_days", "update")[0];
    expect(filteredOn(update, "is", "signed_out_at", null)).toBe(true);
    expect(filteredOn(update, "eq", "id", DAY_ID)).toBe(true);
  });

  it("500s when the write fails instead of reporting success", async () => {
    setup({
      "attendance_days:update": { error: { message: "boom" } },
    });
    const res = await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(res.status).toBe(500);
  });
});

describe("open breaks", () => {
  it("closes a running break at the corrected sign-out", async () => {
    // Otherwise the break runs to `now` forever and eats the hours the
    // correction just established.
    const mock = setup({
      attendance_breaks: {
        data: [{ id: "brk-1", started_at: "2026-08-13T12:00:00Z", ended_at: null }],
      },
    });

    const res = await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(res.status).toBe(200);

    const breakUpdate = mock.callsFor("attendance_breaks", "update")[0];
    expect(breakUpdate).toBeDefined();
    expect(breakUpdate.payload).toMatchObject({
      ended_at: "2026-08-13T15:00:00.000Z",
    });
    expect(filteredOn(breakUpdate, "eq", "id", "brk-1")).toBe(true);
  });

  it("leaves an already-ended break alone", async () => {
    const mock = setup({
      attendance_breaks: {
        data: [
          {
            id: "brk-1",
            started_at: "2026-08-13T12:00:00Z",
            ended_at: "2026-08-13T12:30:00Z",
          },
        ],
      },
    });
    await patch({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(mock.callsFor("attendance_breaks", "update")).toHaveLength(0);
  });

  it("refuses a sign-out that lands before a break they had started", async () => {
    const mock = setup({
      attendance_breaks: {
        data: [{ id: "brk-1", started_at: "2026-08-13T12:00:00Z", ended_at: null }],
      },
    });
    const res = await patch({ signed_out_at: "2026-08-13T11:00:00Z" });

    expect(res.status).toBe(400);
    // Neither table may be touched when the two times contradict.
    expect(mock.callsFor("attendance_days", "update")).toHaveLength(0);
    expect(mock.callsFor("attendance_breaks", "update")).toHaveLength(0);
  });
});
