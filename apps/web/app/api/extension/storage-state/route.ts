import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { serializeState, parseState } from "@/lib/state-crypto";

type StorageStatePayload = {
  job_seeker_id?: string;
  storage_state?: Record<string, unknown> | null;
};

type StorageCookie = {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

type StorageOrigin = {
  origin?: string;
  localStorage?: Array<{ name?: string; value?: string }>;
};

type PlaywrightStorageState = {
  cookies?: StorageCookie[];
  origins?: StorageOrigin[];
};

const BUCKET_ID = "runner_state";

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === BUCKET_ID);
  if (!exists) {
    await supabaseAdmin.storage.createBucket(BUCKET_ID, { public: false });
  }
}

function normalizeStorageState(input: unknown): PlaywrightStorageState {
  const state =
    input && typeof input === "object" ? (input as PlaywrightStorageState) : {};

  const cookies = Array.isArray(state.cookies)
    ? state.cookies.filter(
        (cookie) =>
          cookie &&
          typeof cookie.name === "string" &&
          typeof cookie.value === "string" &&
          typeof cookie.domain === "string"
      )
    : [];

  const origins = Array.isArray(state.origins)
    ? state.origins
        .filter((origin) => origin && typeof origin.origin === "string")
        .map((origin) => ({
          origin: origin.origin,
          localStorage: Array.isArray(origin.localStorage)
            ? origin.localStorage.filter(
                (entry) =>
                  entry &&
                  typeof entry.name === "string" &&
                  typeof entry.value === "string"
              )
            : [],
        }))
    : [];

  return { cookies, origins };
}

function mergeCookies(
  existing: StorageCookie[] = [],
  incoming: StorageCookie[] = []
) {
  const merged = new Map<string, StorageCookie>();

  for (const cookie of existing) {
    const key = `${cookie.name ?? ""}::${cookie.domain ?? ""}::${cookie.path ?? "/"}`;
    merged.set(key, cookie);
  }

  for (const cookie of incoming) {
    const key = `${cookie.name ?? ""}::${cookie.domain ?? ""}::${cookie.path ?? "/"}`;
    merged.set(key, cookie);
  }

  return Array.from(merged.values());
}

function mergeOrigins(
  existing: StorageOrigin[] = [],
  incoming: StorageOrigin[] = []
) {
  const merged = new Map<string, StorageOrigin>();

  for (const origin of existing) {
    const localStorage = new Map<string, string>();
    for (const entry of origin.localStorage ?? []) {
      if (typeof entry?.name === "string") {
        localStorage.set(entry.name, typeof entry.value === "string" ? entry.value : "");
      }
    }
    merged.set(origin.origin ?? "", {
      origin: origin.origin,
      localStorage: Array.from(localStorage.entries()).map(([name, value]) => ({
        name,
        value,
      })),
    });
  }

  for (const origin of incoming) {
    const key = origin.origin ?? "";
    const existingOrigin = merged.get(key);
    const localStorage = new Map<string, string>();

    for (const entry of existingOrigin?.localStorage ?? []) {
      if (typeof entry?.name === "string") {
        localStorage.set(entry.name, typeof entry.value === "string" ? entry.value : "");
      }
    }

    for (const entry of origin.localStorage ?? []) {
      if (typeof entry?.name === "string") {
        localStorage.set(entry.name, typeof entry.value === "string" ? entry.value : "");
      }
    }

    merged.set(key, {
      origin: origin.origin,
      localStorage: Array.from(localStorage.entries()).map(([name, value]) => ({
        name,
        value,
      })),
    });
  }

  return Array.from(merged.values());
}

async function loadExistingStorageState(storagePath: string) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_ID).download(storagePath);
  if (error || !data) {
    return null;
  }

  try {
    const raw = await data.text();
    const parsed = parseState(raw);
    return parsed ? normalizeStorageState(parsed) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
    }

    let payload: StorageStatePayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const jobSeekerId = payload.job_seeker_id ?? session.active_job_seeker_id;
    if (!jobSeekerId) {
      return NextResponse.json(
        { error: "job_seeker_id is required." },
        { status: 400 }
      );
    }

    if (!payload.storage_state || typeof payload.storage_state !== "object") {
      return NextResponse.json(
        { error: "storage_state must be an object." },
        { status: 400 }
      );
    }

    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", session.account_manager_id)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Job seeker is not assigned to you." },
        { status: 403 }
      );
    }

    await ensureBucket();

    const storagePath = `${jobSeekerId}/storage-state.json`;
    const existingState = await loadExistingStorageState(storagePath);
    const incomingState = normalizeStorageState(payload.storage_state);
    const mergedState: PlaywrightStorageState = {
      cookies: mergeCookies(existingState?.cookies, incomingState.cookies),
      origins: mergeOrigins(existingState?.origins, incomingState.origins),
    };

    // Encrypt at rest when STATE_ENCRYPTION_KEY is configured (ATS session
    // cookies); falls back to plaintext when unset, preserving prior behaviour.
    const body = Buffer.from(serializeState(mergedState));
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_ID)
      .upload(storagePath, body, {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Failed to upload storage state: ${uploadError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      path: storagePath,
      cookies: mergedState.cookies?.length ?? 0,
      origins: mergedState.origins?.length ?? 0,
    });
  } catch (error) {
    console.error("Extension storage state error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
