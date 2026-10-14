import { supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { verifyExtensionSession } from "@/lib/extension-auth";

export type ExtensionAdminGate =
  | { ok: true; accountManagerId: string; activeJobSeekerId: string | null }
  | { ok: false; status: number; error: string };

/**
 * Gate an extension request to admin-role AMs. The extension authenticates with
 * a Bearer session (not the cookie the /api/admin/* routes use), so admin
 * oversight in the extension needs this session-aware role check.
 */
export async function requireExtensionAdmin(
  request: Request
): Promise<ExtensionAdminGate> {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return { ok: false, status: 401, error: "Invalid or expired token." };
  }

  const { data: am } = await supabaseAdmin
    .from("account_managers")
    .select("role")
    .eq("id", session.account_manager_id)
    .maybeSingle();

  if (!am || !isAdminRole(am.role)) {
    return { ok: false, status: 403, error: "Admin access required." };
  }

  return {
    ok: true,
    accountManagerId: session.account_manager_id,
    activeJobSeekerId: session.active_job_seeker_id ?? null,
  };
}
