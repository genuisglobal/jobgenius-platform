// ============================================================
// Who can see and change what, across the new routes.
//
// These gates are the privacy design of the productivity work, not
// incidental plumbing: the per-AM table is deliberately not team-visible,
// review flags are deliberately not readable about colleagues, and hours
// and rosters are deliberately not self-serve. A regression in any of
// them is silent — the page still renders, it just shows the wrong people
// the wrong thing.
//
// A mocked client cannot prove the RLS policies agree with these checks.
// It proves the handlers do. See tests/helpers/supabase-mock.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { authAs, createSupabaseMock, filteredOn } from "./helpers/supabase-mock";

const auth = vi.hoisted(() => ({ current: null as unknown }));
const db = vi.hoisted(() => ({ current: null as unknown }));
const recon = vi.hoisted(() => ({ loaded: false }));

vi.mock("@/lib/auth", () => ({
  requireAM: async () => auth.current,
  get supabaseAdmin() {
    return (db.current as { client: unknown }).client;
  },
}));

// The reconciliation loader reaches the service-role client directly.
vi.mock("@/lib/activity-reconciliation", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    loadReconciliation: async () => {
      recon.loaded = true;
      return { typedDays: [], recordedDays: [] };
    },
  };
});

// Static imports: vitest hoists vi.mock above them, so the routes see the
// mocked modules. Top-level await would trip the project's module target.
import { GET as getProductivity } from "@/app/api/am/productivity/route";
import { GET as getReconciliation } from "@/app/api/am/reconciliation/route";
import { PUT as putRoster, POST as postExemption } from "@/app/api/am/roster/route";
import {
  GET as getReviews,
  PATCH as patchReview,
} from "@/app/api/am/productivity-reviews/route";

const MANAGERS = [
  { id: "am-1", name: "Ada", email: "ada@example.com" },
  { id: "am-2", name: "Bem", email: "bem@example.com" },
];

/** Two AMs, each with a logged day and a complete shift. */
function productivityData() {
  return createSupabaseMock({
    activity_sheet_entries: {
      data: MANAGERS.map((m) => ({
        entry_date: "2026-08-10",
        job_seeker_id: `seeker-${m.id}`,
        account_manager_id: m.id,
        easy_applications: 10,
        company_applications: 0,
        follow_ups: 0,
        phone_interviews: 0,
        ai_interviews: 0,
        video_interviews: 0,
        offers: 0,
      })),
    },
    attendance_days: {
      data: MANAGERS.map((m) => ({
        id: `day-${m.id}`,
        account_manager_id: m.id,
        work_date: "2026-08-10",
        signed_in_at: "2026-08-10T07:00:00Z",
        signed_out_at: "2026-08-10T15:00:00Z",
      })),
    },
    attendance_breaks: { data: [] },
    account_managers: { data: MANAGERS },
    work_schedules: { data: [] },
    attendance_exemptions: { data: [] },
  });
}

function req(url: string, init?: RequestInit) {
  return new Request(`http://localhost${url}`, init);
}

beforeEach(() => {
  recon.loaded = false;
});

describe("GET /api/am/productivity — scope", () => {
  it("gives an admin every manager", async () => {
    auth.current = authAs("am-1", "admin");
    db.current = productivityData();

    const res = await getProductivity(req("/api/am/productivity"));
    const body = await res.json();

    expect(body.scope).toBe("team");
    expect(body.managers).toHaveLength(2);
  });

  it("gives an ordinary AM only their own row", async () => {
    auth.current = authAs("am-1", "am");
    db.current = productivityData();

    const res = await getProductivity(req("/api/am/productivity"));
    const body = await res.json();

    expect(body.scope).toBe("self");
    expect(body.managers).toHaveLength(1);
    expect(body.managers[0].account_manager_id).toBe("am-1");
  });

  it("still gives that AM the team median to be measured against", async () => {
    // Filtering colleagues out must not remove the benchmark, or "on pace"
    // stops meaning anything.
    auth.current = authAs("am-1", "am");
    db.current = productivityData();

    const res = await getProductivity(req("/api/am/productivity"));
    const body = await res.json();

    expect(body.team.managers).toBe(2);
    expect(body.team.median_score_per_hour).toBeGreaterThan(0);
  });

  it("does not leak a colleague's name or numbers in self scope", async () => {
    auth.current = authAs("am-1", "am");
    db.current = productivityData();

    const res = await getProductivity(req("/api/am/productivity"));
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain("Bem");
    expect(raw).not.toContain("am-2");
  });

  it("treats an ops_manager as an ordinary AM here", async () => {
    // Productivity is admin-gated specifically; people-manager is the bar
    // for attendance and rosters, not for reading everyone's output.
    auth.current = authAs("am-1", "ops_manager");
    db.current = productivityData();

    const res = await getProductivity(req("/api/am/productivity"));
    expect((await res.json()).scope).toBe("self");
  });
});

describe("GET /api/am/reconciliation — admins only", () => {
  it("refuses an ordinary AM without touching the data", async () => {
    auth.current = authAs("am-1", "am");
    db.current = createSupabaseMock();

    const res = await getReconciliation(req("/api/am/reconciliation"));

    expect(res.status).toBe(403);
    expect(recon.loaded).toBe(false);
  });

  it("refuses an ops manager", async () => {
    auth.current = authAs("am-1", "ops_manager");
    db.current = createSupabaseMock();
    expect((await getReconciliation(req("/api/am/reconciliation"))).status).toBe(403);
  });

  it("allows an admin", async () => {
    auth.current = authAs("am-1", "admin");
    db.current = createSupabaseMock();

    const res = await getReconciliation(req("/api/am/reconciliation"));
    expect(res.status).toBe(200);
    expect(recon.loaded).toBe(true);
  });
});

describe("PUT /api/am/roster — people managers only", () => {
  function body(workDays: unknown) {
    return {
      method: "PUT",
      body: JSON.stringify({ account_manager_id: "am-2", work_days: workDays }),
    };
  }

  it("refuses an ordinary AM and writes nothing", async () => {
    auth.current = authAs("am-1", "am");
    const mock = (db.current = createSupabaseMock());

    const res = await putRoster(req("/api/am/roster", body([1, 2, 3])));

    expect(res.status).toBe(403);
    expect(mock.callsFor("work_schedules")).toHaveLength(0);
  });

  it("lets a people manager set a schedule", async () => {
    auth.current = authAs("am-1", "ops_manager");
    const mock = (db.current = createSupabaseMock());

    const res = await putRoster(req("/api/am/roster", body([1, 3, 5])));

    expect(res.status).toBe(200);
    expect(mock.payloadFor("work_schedules", "upsert")).toMatchObject({
      account_manager_id: "am-2",
      work_days: [1, 3, 5],
      updated_by: "am-1",
    });
  });

  it("normalises the days it stores", async () => {
    auth.current = authAs("am-1", "admin");
    const mock = (db.current = createSupabaseMock());

    await putRoster(req("/api/am/roster", body([5, 1, 1, 9, 3])));

    expect(
      (mock.payloadFor("work_schedules", "upsert") as { work_days: number[] })
        .work_days
    ).toEqual([1, 3, 5]);
  });

  it("refuses a roster with nobody working", async () => {
    auth.current = authAs("am-1", "admin");
    const mock = (db.current = createSupabaseMock());

    const res = await putRoster(req("/api/am/roster", body([])));

    expect(res.status).toBe(400);
    expect(mock.callsFor("work_schedules")).toHaveLength(0);
  });
});

describe("POST /api/am/roster — exemptions", () => {
  function exemption(payload: Record<string, unknown>) {
    return { method: "POST", body: JSON.stringify(payload) };
  }

  it("records a company-wide holiday with a null manager", async () => {
    auth.current = authAs("am-1", "admin");
    const mock = (db.current = createSupabaseMock());

    const res = await postExemption(
      req(
        "/api/am/roster",
        exemption({ start_date: "2026-10-01", reason: "holiday" })
      )
    );

    expect(res.status).toBe(200);
    expect(mock.payloadFor("attendance_exemptions", "insert")).toMatchObject({
      account_manager_id: null,
      start_date: "2026-10-01",
      // A missing end date means a single day, not an open-ended exemption.
      end_date: "2026-10-01",
      reason: "holiday",
    });
  });

  it("rejects an unknown reason", async () => {
    auth.current = authAs("am-1", "admin");
    const mock = (db.current = createSupabaseMock());

    const res = await postExemption(
      req(
        "/api/am/roster",
        exemption({ start_date: "2026-10-01", reason: "sabbatical" })
      )
    );

    expect(res.status).toBe(400);
    expect(mock.callsFor("attendance_exemptions")).toHaveLength(0);
  });

  it("rejects a range that ends before it starts", async () => {
    auth.current = authAs("am-1", "admin");
    db.current = createSupabaseMock();

    const res = await postExemption(
      req(
        "/api/am/roster",
        exemption({
          start_date: "2026-10-10",
          end_date: "2026-10-01",
          reason: "leave",
        })
      )
    );

    expect(res.status).toBe(400);
  });
});

describe("/api/am/productivity-reviews", () => {
  it("shows a people manager every flag", async () => {
    auth.current = authAs("am-1", "ops_manager");
    const mock = (db.current = createSupabaseMock({
      productivity_review_flags: { data: [] },
      account_managers: { data: MANAGERS },
    }));

    const res = await getReviews(req("/api/am/productivity-reviews"));
    const body = await res.json();

    expect(body.scope).toBe("team");
    expect(body.can_resolve).toBe(true);
    const query = mock.callsFor("productivity_review_flags", "select")[0];
    expect(filteredOn(query, "eq", "account_manager_id")).toBe(false);
  });

  it("restricts an ordinary AM to flags about themselves", async () => {
    auth.current = authAs("am-2", "am");
    const mock = (db.current = createSupabaseMock({
      productivity_review_flags: { data: [] },
      account_managers: { data: MANAGERS },
    }));

    const res = await getReviews(req("/api/am/productivity-reviews"));
    const body = await res.json();

    expect(body.scope).toBe("self");
    expect(body.can_resolve).toBe(false);
    const query = mock.callsFor("productivity_review_flags", "select")[0];
    expect(filteredOn(query, "eq", "account_manager_id", "am-2")).toBe(true);
  });

  it("refuses to let an ordinary AM resolve a flag about themselves", async () => {
    auth.current = authAs("am-2", "am");
    const mock = (db.current = createSupabaseMock());

    const res = await patchReview(
      req("/api/am/productivity-reviews", {
        method: "PATCH",
        body: JSON.stringify({ id: "flag-1", status: "dismissed" }),
      })
    );

    expect(res.status).toBe(403);
    expect(mock.callsFor("productivity_review_flags", "update")).toHaveLength(0);
  });

  it("refuses to reopen a flag by setting it back to open", async () => {
    auth.current = authAs("am-1", "admin");
    const mock = (db.current = createSupabaseMock());

    const res = await patchReview(
      req("/api/am/productivity-reviews", {
        method: "PATCH",
        body: JSON.stringify({ id: "flag-1", status: "open" }),
      })
    );

    expect(res.status).toBe(400);
    expect(mock.callsFor("productivity_review_flags", "update")).toHaveLength(0);
  });

  it("records who resolved a flag and how", async () => {
    auth.current = authAs("am-1", "admin");
    const mock = (db.current = createSupabaseMock({
      productivity_review_flags: { data: { id: "flag-1" } },
    }));

    const res = await patchReview(
      req("/api/am/productivity-reviews", {
        method: "PATCH",
        body: JSON.stringify({
          id: "flag-1",
          status: "dismissed",
          note: "Covering two extra clients",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mock.payloadFor("productivity_review_flags", "update")).toMatchObject({
      status: "dismissed",
      resolved_by: "am-1",
      resolution_note: "Covering two extra clients",
    });
  });
});
