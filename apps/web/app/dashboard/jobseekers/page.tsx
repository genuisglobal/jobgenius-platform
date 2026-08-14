import { getCurrentUser } from "@/lib/auth";
import { isManualQueueCategory } from "@/lib/queue-categories";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type JobSeekerRow = {
  id: string;
  full_name: string | null;
  location: string | null;
  seniority: string | null;
  target_titles: string[] | null;
  work_type: string | null;
  match_threshold: number | null;
};

type Counts = {
  matched: number;
  below_threshold: number;
  manual: number;
  in_progress: number;
  applied: number;
  needs_attention: number;
  failed: number;
};

export default async function JobSeekersPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select(
      "job_seeker_id, job_seekers (id, full_name, location, seniority, target_titles, work_type, match_threshold)"
    )
    .eq("account_manager_id", user.id);

  if (assignmentsError) {
    throw new Error("Failed to load job seeker assignments.");
  }

  const seekers = (assignments ?? [])
    .flatMap((assignment) => {
      const seeker = assignment.job_seekers;
      if (!seeker) {
        return [];
      }
      return Array.isArray(seeker) ? seeker : [seeker];
    }) as JobSeekerRow[];

  if (seekers.length === 0) {
    return (
      <main>
        <h1>Job Seekers</h1>
        <p>
          Account Manager: {user.name ?? "Unknown"} ({user.email})
        </p>
        <p>No job seekers assigned.</p>
      </main>
    );
  }

  const seekerIds = seekers.map((seeker) => seeker.id);

  const { data: scores, error: scoresError } = await supabaseServer
    .from("job_match_scores")
    .select("job_seeker_id, job_post_id, score")
    .in("job_seeker_id", seekerIds);

  if (scoresError) {
    throw new Error("Failed to load job match scores.");
  }

  const { data: decisions, error: decisionsError } = await supabaseServer
    .from("job_routing_decisions")
    .select("job_seeker_id, job_post_id, decision")
    .in("job_seeker_id", seekerIds);

  if (decisionsError) {
    throw new Error("Failed to load routing decisions.");
  }

  const { data: queueItems, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("job_seeker_id, category")
    .in("job_seeker_id", seekerIds);

  if (queueError) {
    throw new Error("Failed to load application queue.");
  }

  const { data: runs, error: runsError } = await supabaseServer
    .from("application_runs")
    .select("job_seeker_id, status")
    .in("job_seeker_id", seekerIds);

  if (runsError) {
    throw new Error("Failed to load application runs.");
  }

  const decisionMap = new Map(
    (decisions ?? []).map((decision) => [
      `${decision.job_seeker_id}:${decision.job_post_id}`,
      decision.decision,
    ])
  );

  const countsBySeeker = new Map<string, Counts>();
  for (const seeker of seekers) {
    countsBySeeker.set(seeker.id, {
      matched: 0,
      below_threshold: 0,
      manual: 0,
      in_progress: 0,
      applied: 0,
      needs_attention: 0,
      failed: 0,
    });
  }

  const thresholdMap = new Map(
    seekers.map((seeker) => [seeker.id, seeker.match_threshold ?? 60])
  );

  for (const scoreRow of scores ?? []) {
    const threshold = thresholdMap.get(scoreRow.job_seeker_id) ?? 60;
    const decision = decisionMap.get(
      `${scoreRow.job_seeker_id}:${scoreRow.job_post_id}`
    );
    const counts = countsBySeeker.get(scoreRow.job_seeker_id);
    if (!counts) continue;

    if (scoreRow.score >= threshold && decision !== "OVERRIDDEN_OUT") {
      counts.matched += 1;
    }

    if (scoreRow.score < threshold && decision !== "OVERRIDDEN_IN") {
      counts.below_threshold += 1;
    }
  }

  for (const queueItem of queueItems ?? []) {
    const counts = countsBySeeker.get(queueItem.job_seeker_id);
    if (!counts) continue;
    if (isManualQueueCategory(queueItem.category)) {
      counts.manual += 1;
    }
  }

  for (const run of runs ?? []) {
    const counts = countsBySeeker.get(run.job_seeker_id);
    if (!counts) continue;
    if (
      run.status === "RUNNING" ||
      run.status === "PAUSED" ||
      run.status === "READY" ||
      run.status === "RETRYING"
    ) {
      counts.in_progress += 1;
    } else if (run.status === "APPLIED" || run.status === "COMPLETED") {
      counts.applied += 1;
    } else if (run.status === "NEEDS_ATTENTION") {
      counts.needs_attention += 1;
    } else if (run.status === "FAILED") {
      counts.failed += 1;
    }
  }

  const seekersWithCounts = seekers.map((seeker) => ({
    seeker,
    counts: countsBySeeker.get(seeker.id) ?? {
      matched: 0,
      below_threshold: 0,
      manual: 0,
      in_progress: 0,
      applied: 0,
      needs_attention: 0,
      failed: 0,
    },
  }));

  return (
    <main>
      <h1>Job Seekers</h1>
      <p>
        Account Manager: {user.name ?? "Unknown"} ({user.email})
      </p>
      {seekersWithCounts.length === 0 ? (
        <p>No job seekers assigned.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px" }}>Name</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Location</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Seniority</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Target Titles
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Work Type</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Threshold
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Matched</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Below Threshold
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Manual</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                In Progress
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Applied</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Needs Attention
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Failed</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Queue</th>
            </tr>
          </thead>
          <tbody>
            {seekersWithCounts.map((item) => (
              <tr key={item.seeker.id}>
                <td style={{ padding: "8px" }}>
                  {item.seeker.full_name ?? "Unnamed"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.location ?? "-"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.seniority ?? "-"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.target_titles?.join(", ") ?? "-"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.work_type ?? "-"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.match_threshold ?? 60}
                </td>
                <td style={{ padding: "8px" }}>{item.counts.matched}</td>
                <td style={{ padding: "8px" }}>
                  {item.counts.below_threshold}
                </td>
                <td style={{ padding: "8px" }}>{item.counts.manual}</td>
                <td style={{ padding: "8px" }}>{item.counts.in_progress}</td>
                <td style={{ padding: "8px" }}>{item.counts.applied}</td>
                <td style={{ padding: "8px" }}>
                  {item.counts.needs_attention}
                </td>
                <td style={{ padding: "8px" }}>{item.counts.failed}</td>
                <td style={{ padding: "8px" }}>
                  <a href={`/dashboard/jobseekers/${item.seeker.id}/queue`}>
                    View Queue
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
