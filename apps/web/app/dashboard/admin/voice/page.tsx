import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import VoiceAutomationClient from "./VoiceAutomationClient";

type VoicePlaybookRow = {
  id: string;
  call_type: string;
  name: string;
  is_active: boolean;
  pathway_id: string | null;
  retell_agent_id: string | null;
  system_prompt: string;
  assistant_goal: string | null;
  guardrails: string | null;
  escalation_rules: Record<string, unknown>;
  max_retry_attempts: number;
  retry_backoff_minutes: number;
  updated_at: string;
};

type LeadImportBatchRow = {
  id: string;
  file_name: string;
  source: string;
  status: string;
  total_rows: number;
  inserted_rows: number;
  error_rows: number;
  created_at: string;
};

type VoiceCallRow = {
  id: string;
  call_type: string;
  status: string;
  direction: string;
  to_number: string;
  contact_name: string | null;
  created_at: string;
};

function formatLoadError(entity: string, message: string | null | undefined) {
  const normalized = String(message ?? "").toLowerCase();
  if (!normalized) {
    return `Failed to load ${entity}.`;
  }
  if (normalized.includes("does not exist") || normalized.includes("relation")) {
    return `Failed to load ${entity}. Run latest migrations in this environment.`;
  }
  return `Failed to load ${entity}.`;
}

export default async function AdminVoiceAutomationPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  const [playbooksRes, batchesRes, callsRes] = await Promise.all([
    supabaseAdmin
      .from("voice_playbooks")
      .select(
        "id, call_type, name, is_active, pathway_id, retell_agent_id, system_prompt, assistant_goal, guardrails, escalation_rules, max_retry_attempts, retry_backoff_minutes, updated_at"
      )
      .order("call_type", { ascending: true })
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("lead_import_batches")
      .select(
        "id, file_name, source, status, total_rows, inserted_rows, error_rows, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("voice_calls")
      .select("id, call_type, status, direction, to_number, contact_name, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const warnings: string[] = [];
  if (playbooksRes.error) {
    warnings.push(formatLoadError("voice playbooks", playbooksRes.error.message));
  }
  if (batchesRes.error) {
    warnings.push(formatLoadError("lead import batches", batchesRes.error.message));
  }
  if (callsRes.error) {
    warnings.push(formatLoadError("recent voice calls", callsRes.error.message));
  }

  return (
    <VoiceAutomationClient
      initialPlaybooks={(playbooksRes.data ?? []) as unknown as VoicePlaybookRow[]}
      initialBatches={(batchesRes.data ?? []) as unknown as LeadImportBatchRow[]}
      initialCalls={(callsRes.data ?? []) as unknown as VoiceCallRow[]}
      initialWarnings={warnings}
    />
  );
}

