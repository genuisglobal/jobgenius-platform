// ============================================================
// A chainable stand-in for the Supabase client, for route tests.
//
// The routes in this app talk to PostgREST through a fluent builder
// (.from().select().eq().maybeSingle()), so testing a handler means
// standing in for that shape. This is deliberately a fake rather than a
// mock library: the assertions worth making are "what did the route try
// to write, and did it filter correctly", and those read far better
// against recorded calls than against matcher chains.
//
// ─── What this does and does not prove ───────────────────────────────────
//
// It exercises route logic: auth gating, validation, ordering of writes,
// the fields actually sent. It does NOT execute SQL, so it cannot prove a
// CHECK constraint fires, cannot prove an RLS policy is right, and cannot
// prove a unique index catches a race. Those need a real database, and
// nothing here should be read as covering them.
// ============================================================

export type TableResult = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
};

/** One recorded database interaction. */
export type RecordedCall = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  filters: Array<{ method: string; args: unknown[] }>;
  payload?: unknown;
};

/**
 * Canned responses keyed by `table` for reads, or `table:op` for a
 * specific operation — `"attendance_days:update"` beats `"attendance_days"`.
 * A function receives the recorded call, so a test can vary a response by
 * what was asked for.
 */
export type ResultMap = Record<
  string,
  TableResult | ((call: RecordedCall) => TableResult)
>;

export type SupabaseMock = {
  client: { from: (table: string) => unknown };
  calls: RecordedCall[];
  /** Every call against one table, in order. */
  callsFor: (table: string, op?: RecordedCall["op"]) => RecordedCall[];
  /** The payload of the first matching write. */
  payloadFor: (table: string, op?: RecordedCall["op"]) => unknown;
};

const TERMINALS = new Set(["single", "maybeSingle", "then"]);

export function createSupabaseMock(results: ResultMap = {}): SupabaseMock {
  const calls: RecordedCall[] = [];

  function resolve(call: RecordedCall): TableResult {
    const specific = results[`${call.table}:${call.op}`];
    const general = results[call.table];
    const chosen = specific ?? general;
    if (typeof chosen === "function") return chosen(call);
    return chosen ?? { data: null, error: null };
  }

  function builder(call: RecordedCall) {
    // Every non-terminal method records itself and returns the builder, so
    // the fake never has to know which filters a given route uses.
    const chain: Record<string, unknown> = {};

    const proxy: unknown = new Proxy(chain, {
      get(_target, prop: string) {
        if (prop === "then") {
          // Awaiting the builder directly (no .single()) resolves the query.
          const settled = resolve(call);
          return (onFulfilled: (value: TableResult) => unknown) =>
            Promise.resolve(
              onFulfilled({
                data: settled.data ?? null,
                error: settled.error ?? null,
              })
            );
        }

        if (TERMINALS.has(prop)) {
          return async () => {
            const settled = resolve(call);
            const data = settled.data;
            return {
              // .single()/.maybeSingle() collapse an array to its first row,
              // which is what PostgREST does and what the routes expect.
              data: Array.isArray(data) ? data[0] ?? null : data ?? null,
              error: settled.error ?? null,
            };
          };
        }

        return (...args: unknown[]) => {
          call.filters.push({ method: prop, args });
          return proxy;
        };
      },
    });

    return proxy;
  }

  const client = {
    from(table: string) {
      return {
        select(...args: unknown[]) {
          const call: RecordedCall = {
            table,
            op: "select",
            filters: [{ method: "select", args }],
          };
          calls.push(call);
          return builder(call);
        },
        insert(payload: unknown) {
          const call: RecordedCall = {
            table,
            op: "insert",
            filters: [],
            payload,
          };
          calls.push(call);
          return builder(call);
        },
        update(payload: unknown) {
          const call: RecordedCall = {
            table,
            op: "update",
            filters: [],
            payload,
          };
          calls.push(call);
          return builder(call);
        },
        upsert(payload: unknown, ...rest: unknown[]) {
          const call: RecordedCall = {
            table,
            op: "upsert",
            filters: [{ method: "upsert-options", args: rest }],
            payload,
          };
          calls.push(call);
          return builder(call);
        },
        delete() {
          const call: RecordedCall = { table, op: "delete", filters: [] };
          calls.push(call);
          return builder(call);
        },
      };
    },
  };

  return {
    client,
    calls,
    callsFor: (table, op) =>
      calls.filter((call) => call.table === table && (!op || call.op === op)),
    payloadFor: (table, op) =>
      calls.find((call) => call.table === table && (!op || call.op === op))
        ?.payload,
  };
}

/** Did a recorded call filter on `column` with `value`? */
export function filteredOn(
  call: RecordedCall,
  method: string,
  column: string,
  value?: unknown
): boolean {
  return call.filters.some(
    (filter) =>
      filter.method === method &&
      filter.args[0] === column &&
      (value === undefined || filter.args[1] === value)
  );
}

/** An authenticated AM, as requireAM returns one. */
export function authAs(id: string, role: string) {
  return {
    authenticated: true as const,
    user: { id, role, email: `${id}@example.com`, userType: "am", name: id },
  };
}
