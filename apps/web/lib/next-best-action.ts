import { chatWithLogging } from "@/lib/ai-logging";
import { OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import { submitAiOutput } from "@/lib/ai-outputs";
import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Client OS: "Next Best Action" generator (PR-X).
//
// Reads the seeker's recent activity from v_client_timeline (migration
// 089) + a tiny profile snapshot, asks the LLM to propose 1-3 concrete
// actions the AM should take next. Persisted as ai_outputs (kind='other',
// status='pending') so it's auditable and reviewable.
// ============================================================

const log = createLogger("next-best-action");

const SYSTEM_PROMPT = `You are a senior account manager reviewing a job seeker's recent activity.

Propose 1-3 concrete, high-leverage actions the AM should take NEXT. Be specific — a generic "follow up" is not an action; "follow up with the Acme recruiter who replied 3 days ago about scheduling" is.

Output STRICT JSON:
{
  "summary": string,           // 1-2 sentences on the seeker's current state
  "actions": [
    {
      "title": string,         // imperative, <= 80 chars ("Send follow-up to Acme recruiter")
      "why": string,           // 1 sentence — what in the activity feed triggers this
      "priority": "high" | "medium" | "low",
      "suggested_link": string | null  // e.g. "/dashboard/outreach/threads/<id>" — null if no obvious link
    }
  ]
}

Rules:
- Cite specific events you saw in the feed in 'why' (company names, dates, classifications).
- Don't invent recruiters or interviews that aren't in the feed.
- If the feed is mostly empty, propose ramp-up actions (resume tailoring, outreach kickoff).
- Maximum 3 actions. Quality over quantity.`;

interface TimelineRow {
  kind: string;
  at: string;
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
}

interface SeekerSnapshot {
  full_name: string | null;
  seniority: string | null;
  target_titles: string[] | null;
  skills: string[] | null;
}

export interface NextBestActionResult {
  summary: string;
  actions: Array<{
    title: string;
    why: string;
    priority: "high" | "medium" | "low";
    suggested_link: string | null;
  }>;
  aiOutputId: string | null;
}

function formatFeed(rows: TimelineRow[]): string {
  if (rows.length === 0) return "(no recent activity)";
  return rows
    .map((r) => {
      const when = new Date(r.at).toISOString().slice(0, 10);
      return `- ${when} [${r.kind}] ${r.title}${r.body ? ` — ${r.body}` : ""}`;
    })
    .join("\n");
}

export async function suggestNextBestAction(args: {
  seekerId: string;
  amId: string;
}): Promise<NextBestActionResult | null> {
  if (!isOpenAIConfigured()) {
    log.warn("OPENAI_API_KEY missing — skipping next-best-action");
    return null;
  }

  const [{ data: seeker }, { data: timeline }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("full_name, seniority, target_titles, skills")
      .eq("id", args.seekerId)
      .maybeSingle(),
    supabaseAdmin
      .from("v_client_timeline")
      .select("kind, at, title, body, meta")
      .eq("job_seeker_id", args.seekerId)
      .order("at", { ascending: false })
      .limit(40),
  ]);

  if (!seeker) {
    log.warn("seeker not found", { seekerId: args.seekerId });
    return null;
  }

  const snap = seeker as SeekerSnapshot;
  const userContent = [
    `SEEKER`,
    `  name: ${snap.full_name ?? "(unknown)"}`,
    `  seniority: ${snap.seniority ?? "(unknown)"}`,
    snap.target_titles?.length ? `  target_titles: ${snap.target_titles.join(", ")}` : "",
    snap.skills?.length ? `  skills: ${snap.skills.slice(0, 10).join(", ")}` : "",
    ``,
    `RECENT ACTIVITY (newest first):`,
    formatFeed((timeline ?? []) as TimelineRow[]),
  ]
    .filter(Boolean)
    .join("\n");

  let parsed: Record<string, unknown>;
  try {
    const response = await chatWithLogging(
      {
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      {
        functionName: "suggestNextBestAction",
        route: "/api/am/seekers/[id]/next-action",
        seekerId: args.seekerId,
        amId: args.amId,
      }
    );
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    parsed = JSON.parse(content);
  } catch (err) {
    log.warn("suggestNextBestAction failed", {
      seekerId: args.seekerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const rawActions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [];
  const actions = rawActions
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title.slice(0, 200) : null;
      if (!title) return null;
      const priority =
        r.priority === "high" || r.priority === "medium" || r.priority === "low"
          ? r.priority
          : "medium";
      const why = typeof r.why === "string" ? r.why : "";
      const link = typeof r.suggested_link === "string" ? r.suggested_link : null;
      return { title, why, priority, suggested_link: link };
    })
    .filter((a): a is NextBestActionResult["actions"][number] => a !== null);

  if (actions.length === 0) {
    return { summary, actions: [], aiOutputId: null };
  }

  const submitted = await submitAiOutput({
    kind: "other",
    payload: { summary, actions, generated_for: "next_best_action" },
    refType: "job_seekers",
    refId: args.seekerId,
    seekerId: args.seekerId,
    amId: args.amId,
    createdBy: args.amId,
    autoApprove: true, // suggestions are advisory; the AM acts (or not)
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  });

  return { summary, actions, aiOutputId: submitted.id };
}
