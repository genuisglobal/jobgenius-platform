import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  normalizePolicyLocation,
  normalizePolicyRunFrequency,
  normalizePolicyTitle,
  syncValidatedDiscoverySearches,
} from "@/lib/discovery/policies";

type UpdatePolicyPayload = {
  source_name?: string;
  job_title?: string;
  location?: string;
  run_frequency_hours?: number;
  enabled?: boolean;
};

function normalizeSourceName(sourceName: string) {
  return sourceName.trim().toLowerCase();
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * PATCH /api/discovery/policies/[id]
 *
 * Superadmin only: update a discovery policy.
 */
export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (auth.user.role !== "superadmin") {
    return Response.json(
      { success: false, error: "Only super admins can update discovery policies." },
      { status: 403 }
    );
  }

  let payload: UpdatePolicyPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {
    updated_by_am_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  if (typeof payload.source_name === "string") {
    const sourceName = normalizeSourceName(payload.source_name);
    if (!sourceName) {
      return Response.json(
        { success: false, error: "source_name cannot be empty." },
        { status: 400 }
      );
    }

    const { data: source } = await supabaseAdmin
      .from("job_sources")
      .select("name, source_type")
      .eq("name", sourceName)
      .maybeSingle();

    if (!source) {
      return Response.json(
        { success: false, error: `Unknown source: ${sourceName}` },
        { status: 400 }
      );
    }

    if (source.source_type === "feed") {
      return Response.json(
        {
          success: false,
          error: `Policy generation does not support company-specific ATS feed sources like ${sourceName}.`,
        },
        { status: 400 }
      );
    }

    updates.source_name = sourceName;
  }

  if (typeof payload.job_title === "string") {
    const title = normalizePolicyTitle(payload.job_title);
    if (!title) {
      return Response.json(
        { success: false, error: "job_title cannot be empty." },
        { status: 400 }
      );
    }
    updates.job_title = title;
  }

  if (typeof payload.location === "string") {
    const location = normalizePolicyLocation(payload.location);
    if (!location) {
      return Response.json(
        { success: false, error: "location cannot be empty." },
        { status: 400 }
      );
    }
    updates.location = location;
  }

  if (payload.run_frequency_hours !== undefined) {
    updates.run_frequency_hours = normalizePolicyRunFrequency(payload.run_frequency_hours);
  }

  if (isBoolean(payload.enabled)) {
    updates.enabled = payload.enabled;
  }

  if (Object.keys(updates).length <= 2) {
    return Response.json(
      { success: false, error: "No editable fields provided." },
      { status: 400 }
    );
  }

  const policyId = context.params.id;

  const { data: policy, error: updateError } = await supabaseAdmin
    .from("discovery_search_policies")
    .update(updates)
    .eq("id", policyId)
    .select(
      "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
    )
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505") {
      return Response.json(
        {
          success: false,
          error: "This title/location policy already exists for the source.",
        },
        { status: 409 }
      );
    }
    return Response.json(
      { success: false, error: "Failed to update discovery policy." },
      { status: 500 }
    );
  }

  if (!policy) {
    return Response.json(
      { success: false, error: "Discovery policy not found." },
      { status: 404 }
    );
  }

  try {
    const sync = await syncValidatedDiscoverySearches();
    return Response.json({
      success: true,
      policy,
      sync,
    });
  } catch (syncError) {
    console.error("Discovery policy sync failed after update:", syncError);
    return Response.json({
      success: true,
      policy,
      sync: null,
      warning: "Policy updated, but search sync failed. Runner will retry sync.",
    });
  }
}

/**
 * DELETE /api/discovery/policies/[id]
 *
 * Superadmin only: delete a discovery policy.
 */
export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (auth.user.role !== "superadmin") {
    return Response.json(
      { success: false, error: "Only super admins can delete discovery policies." },
      { status: 403 }
    );
  }

  const policyId = context.params.id;

  const { error: deleteError } = await supabaseAdmin
    .from("discovery_search_policies")
    .delete()
    .eq("id", policyId);

  if (deleteError) {
    return Response.json(
      { success: false, error: "Failed to delete discovery policy." },
      { status: 500 }
    );
  }

  try {
    const sync = await syncValidatedDiscoverySearches();
    return Response.json({
      success: true,
      sync,
    });
  } catch (syncError) {
    console.error("Discovery policy sync failed after delete:", syncError);
    return Response.json({
      success: true,
      sync: null,
      warning: "Policy deleted, but search sync failed. Runner will retry sync.",
    });
  }
}
