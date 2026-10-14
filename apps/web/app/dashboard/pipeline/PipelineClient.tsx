"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ResumePreview from "./ResumePreview";
import type { StructuredResume, ResumeTemplateId } from "@/lib/resume-templates/types";
import { RESUME_TEMPLATES } from "@/lib/resume-templates/types";
import { buildMatchExplanation } from "@/lib/matching/explanations";

// ─── Types ──────────────────────────────────────────────────────────

interface SeekerSummary {
  id: string;
  full_name: string | null;
  email: string;
  match_threshold: number | null;
  resume_text: string | null;
  resume_template_id: ResumeTemplateId | null;
}

interface JobData {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  description_text: string | null;
}

interface MatchScore {
  id: string;
  score: number;
  recommendation: string | null;
  reasons: Record<string, unknown> | null;
  job_seeker_id: string;
  job_posts: JobData | null;
}

interface RoutingDecision {
  job_post_id: string;
  job_seeker_id: string;
  decision: string;
  note: string | null;
}

interface QueueItem {
  id: string;
  status: string;
  category: string | null;
  created_at: string;
  updated_at: string | null;
  last_error: string | null;
  job_seeker_id: string;
  job_post_id: string;
  job_posts: JobData | null;
  job_seekers: { id: string; full_name: string | null } | null;
}

interface RunItem {
  id: string;
  status: string;
  current_step: string | null;
  last_error: string | null;
  ats_type: string | null;
  needs_attention_reason: string | null;
  created_at: string;
  updated_at: string;
  job_seeker_id: string;
  job_post_id: string;
  queue_id: string | null;
  job_posts: { id: string; title: string; company: string | null; location: string | null; url: string } | null;
  job_seekers: { id: string; full_name: string | null } | null;
}

interface OutreachContact {
  id: string;
  role: string | null;
  full_name: string | null;
  email: string | null;
  job_post_id: string;
  job_seeker_id: string;
}

interface OutreachDraft {
  id: string;
  subject: string | null;
  body: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  job_seeker_id: string;
  job_posts: { id: string; title: string; company: string | null } | null;
  outreach_contacts: { id: string; full_name: string | null; email: string | null; role: string | null } | null;
}

interface TailoredResume {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  tailored_text: string;
  changes_summary: string | null;
  tailored_data: StructuredResume | null;
  template_id: ResumeTemplateId | null;
  resume_url: string | null;
}

interface ResumeBankVersion {
  id: string;
  job_seeker_id: string;
  name: string;
  title_focus: string | null;
  source: string;
  status: string;
  is_default: boolean;
  template_id: ResumeTemplateId | null;
  resume_url: string | null;
  resume_text: string;
  resume_data: StructuredResume | null;
  created_at: string;
  updated_at: string;
}

interface ResumeHardeningAlert {
  id: string;
  job_seeker_id: string;
  normalized_title: string;
  sample_title: string;
  tailored_count: number;
  status: string;
  last_triggered_at: string;
  created_at: string;
  updated_at: string;
}

interface ResumeVersionMatch {
  id: string;
  name: string;
  source: string;
  is_default: boolean;
  title_focus: string | null;
  template_id: ResumeTemplateId | null;
  resume_url: string | null;
  match_percent: number;
}

interface PipelineClientProps {
  seekers: SeekerSummary[];
  matchScores: MatchScore[];
  availableJobsCount: number;
  routingDecisions: RoutingDecision[];
  queueItems: QueueItem[];
  runs: RunItem[];
  outreachContacts: OutreachContact[];
  outreachDrafts: OutreachDraft[];
  tailoredResumes: TailoredResume[];
}

const TABS = [
  { id: "discover", label: "Discover" },
  { id: "queue", label: "Queue" },
  { id: "resumes", label: "Resumes" },
  { id: "applied", label: "Applied" },
  { id: "followup", label: "Follow Up" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type ResumeFieldToggle =
  | "summary"
  | "workExperience"
  | "education"
  | "skills"
  | "certifications"
  | "contact.phone"
  | "contact.location"
  | "contact.linkedinUrl"
  | "contact.portfolioUrl";

const RESUME_FIELD_TOGGLE_OPTIONS: { key: ResumeFieldToggle; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "workExperience", label: "Work Experience" },
  { key: "education", label: "Education" },
  { key: "skills", label: "Skills" },
  { key: "certifications", label: "Certifications" },
  { key: "contact.phone", label: "Phone" },
  { key: "contact.location", label: "Location" },
  { key: "contact.linkedinUrl", label: "LinkedIn URL" },
  { key: "contact.portfolioUrl", label: "Portfolio URL" },
];

// ─── Main Component ─────────────────────────────────────────────────

export default function PipelineClient({
  seekers,
  matchScores,
  availableJobsCount,
  routingDecisions,
  queueItems,
  runs,
  outreachContacts,
  outreachDrafts,
  tailoredResumes,
}: PipelineClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as TabId) || "discover";
  const initialSeekerParam = searchParams.get("seeker");
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "discover"
  );
  const [selectedSeeker, setSelectedSeeker] = useState<string>(() => {
    if (!initialSeekerParam) return "all";
    return seekers.some((s) => s.id === initialSeekerParam) ? initialSeekerParam : "all";
  });
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (selectedSeeker !== "all") {
      params.set("seeker", selectedSeeker);
    }
    router.replace(`/dashboard/pipeline?${params.toString()}`, { scroll: false });
  };

  // Build lookup maps
  const seekerMap = useMemo(() => new Map(seekers.map((s) => [s.id, s])), [seekers]);
  const routingMap = useMemo(() => {
    const m = new Map<string, RoutingDecision>();
    routingDecisions.forEach((d) => m.set(`${d.job_seeker_id}:${d.job_post_id}`, d));
    return m;
  }, [routingDecisions]);
  const queuedSet = useMemo(() => {
    const s = new Set<string>();
    queueItems.forEach((q) => s.add(`${q.job_seeker_id}:${q.job_post_id}`));
    return s;
  }, [queueItems]);
  const appliedSet = useMemo(() => {
    const s = new Set<string>();
    runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status))
      .forEach((r) => s.add(`${r.job_seeker_id}:${r.job_post_id}`));
    return s;
  }, [runs]);
  const tailoredMap = useMemo(() => {
    const m = new Map<string, TailoredResume>();
    tailoredResumes.forEach((t) => m.set(`${t.job_seeker_id}:${t.job_post_id}`, t));
    return m;
  }, [tailoredResumes]);

  // Run map keyed by queue_id
  const runByQueueId = useMemo(() => {
    const m = new Map<string, RunItem>();
    runs.forEach((r) => { if (r.queue_id) m.set(r.queue_id, r); });
    return m;
  }, [runs]);

  // Stats
  const filteredMatches = useMemo(() => {
    return matchScores.filter((m) => {
      if (selectedSeeker !== "all" && m.job_seeker_id !== selectedSeeker) return false;
      const seeker = seekerMap.get(m.job_seeker_id);
      const threshold = seeker?.match_threshold ?? 60;
      const routing = routingMap.get(`${m.job_seeker_id}:${m.job_posts?.id}`);
      return m.score >= threshold && routing?.decision !== "OVERRIDDEN_OUT";
    });
  }, [matchScores, selectedSeeker, seekerMap, routingMap]);

  const filteredQueue = useMemo(
    () => queueItems.filter((q) => selectedSeeker === "all" || q.job_seeker_id === selectedSeeker),
    [queueItems, selectedSeeker]
  );
  const filteredRuns = useMemo(
    () => runs.filter((r) => selectedSeeker === "all" || r.job_seeker_id === selectedSeeker),
    [runs, selectedSeeker]
  );

  const queuedCount = filteredQueue.filter((q) => q.status === "QUEUED").length;
  const runningCount = filteredRuns.filter((r) => ["RUNNING", "READY", "RETRYING"].includes(r.status)).length;
  const needsAttentionCount = filteredRuns.filter((r) => r.status === "NEEDS_ATTENTION").length;
  const appliedCount = filteredRuns.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status)).length;
  const pendingFollowUp = useMemo(() => {
    const appliedCompanies = new Set<string>();
    filteredRuns
      .filter((r) => ["APPLIED", "COMPLETED"].includes(r.status))
      .forEach((r) => {
        if (r.job_posts?.company) appliedCompanies.add(r.job_posts.company);
      });
    const contactedCompanies = new Set<string>();
    outreachDrafts
      .filter((d) => selectedSeeker === "all" || d.job_seeker_id === selectedSeeker)
      .forEach((d) => {
        if (d.job_posts?.company) contactedCompanies.add(d.job_posts.company);
      });
    let count = 0;
    appliedCompanies.forEach((c) => { if (!contactedCompanies.has(c)) count++; });
    return count;
  }, [filteredRuns, outreachDrafts, selectedSeeker]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Job Hub</h1>
            <a
              href="/dashboard/pipeline/archived"
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              View archived
            </a>
          </div>
          <select
            value={selectedSeeker}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedSeeker(value);
              const params = new URLSearchParams();
              params.set("tab", activeTab);
              if (value !== "all") {
                params.set("seeker", value);
              }
              router.replace(`/dashboard/pipeline?${params.toString()}`, { scroll: false });
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">All Seekers</option>
            {seekers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mt-4">
          <StatBox label="Available in Job Bank" value={availableJobsCount} color="blue" />
          <StatBox label="Matched Jobs" value={filteredMatches.length} />
          <StatBox label="In Queue" value={queuedCount} color="blue" />
          <StatBox label="Running" value={runningCount} color="blue" />
          {needsAttentionCount > 0 && (
            <StatBox label="Needs Attention" value={needsAttentionCount} color="orange" />
          )}
          <StatBox label="Applied" value={appliedCount} color="green" />
          {pendingFollowUp > 0 && (
            <StatBox label="Pending Follow-up" value={pendingFollowUp} color="purple" />
          )}
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b overflow-x-auto">
          <nav className="flex -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
                {tab.id === "queue" && needsAttentionCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                    {needsAttentionCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "discover" && (
            <DiscoverTab
              matchScores={matchScores}
              availableJobsCount={availableJobsCount}
              seekers={seekers}
              seekerMap={seekerMap}
              routingMap={routingMap}
              queuedSet={queuedSet}
              appliedSet={appliedSet}
              selectedSeeker={selectedSeeker}
              setMsg={setMsg}
            />
          )}
          {activeTab === "queue" && (
            <QueueTab
              queueItems={filteredQueue}
              runByQueueId={runByQueueId}
              setMsg={setMsg}
              switchTab={switchTab}
            />
          )}
          {activeTab === "resumes" && (
            <ResumesTab
              queueItems={filteredQueue}
              selectedSeeker={selectedSeeker}
              seekerMap={seekerMap}
              tailoredMap={tailoredMap}
              setMsg={setMsg}
            />
          )}
          {activeTab === "applied" && (
            <AppliedTab
              runs={filteredRuns}
              seekerMap={seekerMap}
              setMsg={setMsg}
              switchTab={switchTab}
            />
          )}
          {activeTab === "followup" && (
            <FollowUpTab
              runs={filteredRuns}
              outreachContacts={outreachContacts.filter(
                (c) => selectedSeeker === "all" || c.job_seeker_id === selectedSeeker
              )}
              outreachDrafts={outreachDrafts.filter(
                (d) => selectedSeeker === "all" || d.job_seeker_id === selectedSeeker
              )}
              seekerMap={seekerMap}
              setMsg={setMsg}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Discover Tab ───────────────────────────────────────────────────

function DiscoverTab({
  matchScores,
  availableJobsCount,
  seekers,
  seekerMap,
  routingMap,
  queuedSet,
  appliedSet,
  selectedSeeker,
  setMsg,
}: {
  matchScores: MatchScore[];
  availableJobsCount: number;
  seekers: SeekerSummary[];
  seekerMap: Map<string, SeekerSummary>;
  routingMap: Map<string, RoutingDecision>;
  queuedSet: Set<string>;
  appliedSet: Set<string>;
  selectedSeeker: string;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [recFilter, setRecFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "company">("score");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [runningMatching, setRunningMatching] = useState(false);
  const fallbackSeekerIds = useMemo(() => {
    const ids = new Set<string>();
    matchScores.forEach((m) => {
      if (m.job_seeker_id) ids.add(m.job_seeker_id);
    });
    return Array.from(ids);
  }, [matchScores]);

  const scoredJobsCount = useMemo(() => {
    const jobIds = new Set<string>();
    matchScores.forEach((m) => {
      if (!m.job_posts?.id) return;
      if (selectedSeeker !== "all" && m.job_seeker_id !== selectedSeeker) return;
      jobIds.add(m.job_posts.id);
    });
    return jobIds.size;
  }, [matchScores, selectedSeeker]);

  const filtered = useMemo(() => {
    return matchScores
      .filter((m) => {
        if (!m.job_posts) return false;
        if (selectedSeeker !== "all" && m.job_seeker_id !== selectedSeeker) return false;
        const seeker = seekerMap.get(m.job_seeker_id);
        const threshold = seeker?.match_threshold ?? 60;
        if (m.score < threshold) return false;
        const routing = routingMap.get(`${m.job_seeker_id}:${m.job_posts.id}`);
        if (routing?.decision === "OVERRIDDEN_OUT") return false;
        if (m.score < minScore) return false;
        if (recFilter !== "all" && m.recommendation !== recFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const job = m.job_posts;
          if (
            !job.title.toLowerCase().includes(q) &&
            !(job.company || "").toLowerCase().includes(q)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "company") return (a.job_posts?.company || "").localeCompare(b.job_posts?.company || "");
        return b.score - a.score;
      });
  }, [matchScores, selectedSeeker, seekerMap, routingMap, minScore, recFilter, search, sortBy]);

  const queueJob = async (seekerId: string, jobPostId: string, matchId: string) => {
    setLoading((prev) => new Set(prev).add(matchId));
    try {
      const res = await fetch("/api/am/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId, job_post_id: jobPostId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to queue job." });
      } else {
        setMsg({ type: "success", text: "Job queued successfully." });
        queuedSet.add(`${seekerId}:${jobPostId}`);
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setLoading((prev) => { const n = new Set(prev); n.delete(matchId); return n; });
    }
  };

  const excludeJob = async (seekerId: string, jobPostId: string) => {
    try {
      const res = await fetch("/api/am/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId, job_post_id: jobPostId, decision: "OVERRIDDEN_OUT" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to exclude job." });
      } else {
        setMsg({ type: "success", text: "Job excluded." });
        routingMap.set(`${seekerId}:${jobPostId}`, { job_seeker_id: seekerId, job_post_id: jobPostId, decision: "OVERRIDDEN_OUT", note: null });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    }
  };

  const queueAllSelected = async () => {
    const ids = Array.from(selected);
    for (let i = 0; i < ids.length; i++) {
      const matchId = ids[i];
      const match = matchScores.find((m) => m.id === matchId);
      if (match?.job_posts) {
        const explanation = buildMatchExplanation(match.reasons, {
          score: match.score,
          recommendation: match.recommendation,
        });
        if (explanation.queueBlocked) {
          continue;
        }
        await queueJob(match.job_seeker_id, match.job_posts.id, matchId);
      }
    }
    setSelected(new Set());
  };

  const runMatching = async () => {
    const targetSeekerIds =
      selectedSeeker === "all"
        ? (seekers.length > 0 ? seekers.map((s) => s.id) : fallbackSeekerIds)
        : [selectedSeeker];

    if (targetSeekerIds.length === 0) {
      setMsg({ type: "error", text: "No seekers available to run matching." });
      return;
    }

    setRunningMatching(true);
    try {
      const res = await fetch("/api/match/run-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_ids: targetSeekerIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setMsg({
          type: "error",
          text: data.error || "Failed to run matching.",
        });
        return;
      }

      setMsg({
        type: "success",
        text: `Matching completed. ${data.jobs_scored ?? 0} score pairs updated.`,
      });
      router.refresh();
    } catch {
      setMsg({ type: "error", text: "Network error while running matching." });
    } finally {
      setRunningMatching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            type="text"
            placeholder="Title or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Min Score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-20"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Recommendation</label>
          <select
            value={recFilter}
            onChange={(e) => setRecFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="strong">Strong</option>
            <option value="good">Good</option>
            <option value="marginal">Marginal</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "score" | "company")}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="score">Score (High to Low)</option>
            <option value="company">Company (A-Z)</option>
          </select>
        </div>
        <button
          onClick={runMatching}
          disabled={runningMatching}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {runningMatching ? "Running..." : "Run Matching Now"}
        </button>
        {selected.size > 0 && (
          <button
            onClick={queueAllSelected}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
          >
            Queue Selected ({selected.size})
          </button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm text-gray-700">
          Job Bank: <span className="font-semibold">{availableJobsCount}</span> active jobs.
          {" "}Scored for this view: <span className="font-semibold">{scoredJobsCount}</span>.
        </p>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} matches</p>
      <p className="text-xs text-gray-400">
        Jobs above threshold with strong/good match are auto-queued when matching runs. Hard-blocked matches stay visible for review but cannot be queued.
      </p>

      {/* Job cards */}
      <div className="space-y-3">
        {filtered.map((m) => {
          const job = m.job_posts!;
          const seeker = seekerMap.get(m.job_seeker_id);
          const key = `${m.job_seeker_id}:${job.id}`;
          const isQueued = queuedSet.has(key);
          const isApplied = appliedSet.has(key);
          const routing = routingMap.get(key);
          const explanation = buildMatchExplanation(m.reasons, {
            score: m.score,
            recommendation: m.recommendation,
          });

          return (
            <div key={m.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(m.id); else n.delete(m.id);
                      return n;
                    });
                  }}
                  className="mt-1"
                  disabled={isQueued || isApplied || explanation.queueBlocked}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <ScoreBadge score={m.score} />
                    {m.recommendation && (
                      <span className="text-xs text-gray-500 capitalize">{m.recommendation}</span>
                    )}
                    {routing?.decision === "OVERRIDDEN_IN" && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">Override In</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {job.company || "Unknown Company"}
                    {job.location && ` \u2022 ${job.location}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-500">
                      Seeker: {seeker?.full_name || seeker?.email || "Unknown"}
                    </span>
                    {job.salary_min != null && job.salary_max != null && (
                      <span className="text-xs text-gray-500">
                        ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {job.required_skills && job.required_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.required_skills.slice(0, 5).map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">{s}</span>
                      ))}
                      {job.required_skills.length > 5 && (
                        <span className="text-xs text-gray-400">+{job.required_skills.length - 5} more</span>
                      )}
                    </div>
                  )}
                  <div className="mt-3 space-y-1">
                    {explanation.highlights.map((line) => (
                      <div key={`highlight-${m.id}-${line}`} className="text-xs text-gray-600">
                        {line}
                      </div>
                    ))}
                    {explanation.cautions.map((line) => (
                      <div key={`caution-${m.id}-${line}`} className="text-xs text-amber-700">
                        {line}
                      </div>
                    ))}
                    {explanation.blockers.map((line) => (
                      <div key={`blocker-${m.id}-${line}`} className="text-xs text-red-700">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {isApplied ? (
                    <StatusBadge status="APPLIED" />
                  ) : isQueued ? (
                    <StatusBadge status="QUEUED" />
                  ) : explanation.queueBlocked ? (
                    <>
                      <span
                        className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg text-center"
                        title={explanation.queueBlockReason || undefined}
                      >
                        Blocked
                      </span>
                      <button
                        onClick={() => excludeJob(m.job_seeker_id, job.id)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200"
                      >
                        Exclude
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => queueJob(m.job_seeker_id, job.id, m.id)}
                        disabled={loading.has(m.id)}
                        className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                      >
                        {loading.has(m.id) ? "..." : "Queue"}
                      </button>
                      <button
                        onClick={() => excludeJob(m.job_seeker_id, job.id)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200"
                      >
                        Exclude
                      </button>
                    </>
                  )}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-center text-violet-600 text-xs font-medium hover:text-violet-800"
                  >
                    View Posting
                  </a>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <p className="text-gray-500 text-sm">No matching jobs found.</p>
            {availableJobsCount > 0 && (
              <p className="text-xs text-gray-400">
                Jobs exist in the Job Bank. Run matching now to score newly discovered jobs for these seekers.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Queue Tab ──────────────────────────────────────────────────────

function QueueTab({
  queueItems,
  runByQueueId,
  setMsg,
  switchTab,
}: {
  queueItems: QueueItem[];
  runByQueueId: Map<string, RunItem>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
  switchTab: (tab: TabId) => void;
}) {
  const router = useRouter();
  const [subFilter, setSubFilter] = useState<string>("all");
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [bulkStarting, setBulkStarting] = useState(false);

  const readyCount = queueItems.filter((q) => q.status === "QUEUED").length;

  const startAllReady = async () => {
    const readyIds = queueItems
      .filter((q) => q.status === "QUEUED")
      .map((q) => q.id);
    if (readyIds.length === 0) return;
    setBulkStarting(true);
    try {
      const res = await fetch("/api/apply/start-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_ids: readyIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Batch start failed." });
      } else {
        setMsg({
          type: "success",
          text: `Started ${data.started}, blocked ${data.blocked}, failed ${data.failed}.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setBulkStarting(false);
    }
  };

  const filtered = useMemo(() => {
    return queueItems.filter((q) => {
      if (subFilter === "all") return true;
      if (subFilter === "ready") return q.status === "QUEUED";
      if (subFilter === "running") return ["RUNNING", "RETRYING", "READY"].includes(q.status);
      if (subFilter === "attention") return q.status === "NEEDS_ATTENTION";
      return true;
    });
  }, [queueItems, subFilter]);

  const callApi = async (url: string, method: string, body?: Record<string, unknown>, queueId?: string) => {
    if (queueId) setLoading((prev) => new Set(prev).add(queueId));
    try {
      const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Action failed." });
      } else if (data?.blocked) {
        // 200 + blocked: the API refused for a policy reason (duplicate,
        // concurrency, velocity) — not a success.
        const text =
          data.reason === "DUPLICATE_APPLICATION"
            ? `Skipped: already applied to ${data.duplicate_job?.company ?? "this company"} — ${data.duplicate_job?.title ?? "same role"} recently.`
            : `Blocked: ${data.reason ?? "policy limit"}.`;
        setMsg({ type: "error", text });
      } else {
        setMsg({ type: "success", text: "Action completed." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      if (queueId) setLoading((prev) => { const n = new Set(prev); n.delete(queueId); return n; });
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "all", label: "All" },
          { id: "ready", label: "Ready" },
          { id: "running", label: "In Progress" },
          { id: "attention", label: "Needs Attention" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setSubFilter(f.id)}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              subFilter === f.id
                ? f.id === "attention"
                  ? "bg-orange-100 text-orange-800 font-medium"
                  : "bg-violet-100 text-violet-800 font-medium"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {readyCount > 0 && (
        <button
          onClick={startAllReady}
          disabled={bulkStarting}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {bulkStarting ? "Starting..." : `Start All Ready (${readyCount})`}
        </button>
      )}

      <p className="text-sm text-gray-500">{filtered.length} items</p>

      <div className="space-y-3">
        {filtered.map((q) => {
          const job = q.job_posts;
          const run = runByQueueId.get(q.id);
          const isLoading = loading.has(q.id);

          return (
            <div key={q.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{job?.title || "Unknown Job"}</h3>
                    <StatusBadge status={q.status} />
                    {run?.ats_type && (
                      <span className="text-xs text-gray-500">ATS: {run.ats_type}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {job?.company || "Unknown Company"}
                    {job?.location && ` \u2022 ${job.location}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Seeker: {q.job_seekers?.full_name || "Unknown"}
                    {" \u2022 "}
                    Queued: {new Date(q.created_at).toLocaleDateString()}
                  </p>
                  {q.last_error && (
                    <p className="text-sm text-red-600 mt-1 bg-red-50 p-2 rounded">{q.last_error}</p>
                  )}
                  {run?.last_error && q.status !== "QUEUED" && (
                    <p className="text-sm text-red-600 mt-1 bg-red-50 p-2 rounded">{run.last_error}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {q.status === "QUEUED" && (
                    <>
                      <button
                        onClick={() => callApi("/api/apply/start", "POST", { queue_id: q.id }, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        Start
                      </button>
                      <button
                        onClick={() => callApi(`/api/am/queue?id=${q.id}&job_seeker_id=${q.job_seeker_id}`, "DELETE", undefined, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => switchTab("resumes")}
                        className="px-3 py-1.5 text-violet-600 text-xs font-medium hover:text-violet-800"
                      >
                        Tailor Resume
                      </button>
                    </>
                  )}
                  {["RUNNING", "RETRYING", "READY"].includes(q.status) && run && (
                    <button
                      onClick={() => callApi("/api/apply/pause", "POST", { run_id: run.id }, q.id)}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-yellow-50 text-yellow-800 text-xs font-medium rounded-lg hover:bg-yellow-100 disabled:opacity-50"
                    >
                      Pause
                    </button>
                  )}
                  {q.status === "NEEDS_ATTENTION" && (
                    <>
                      {run ? (
                        <>
                          <button
                            onClick={() => callApi("/api/apply/resume", "POST", { run_id: run.id }, q.id)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                          >
                            Resume
                          </button>
                          <button
                            onClick={() => callApi("/api/apply/retry", "POST", { run_id: run.id }, q.id)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 disabled:opacity-50"
                          >
                            Retry
                          </button>
                          <button
                            onClick={() => callApi("/api/apply/complete", "POST", { run_id: run.id }, q.id)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg hover:bg-green-100 disabled:opacity-50"
                          >
                            Mark Applied
                          </button>
                          <button
                            onClick={() => callApi("/api/apply/fail", "POST", { run_id: run.id }, q.id)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50"
                          >
                            Mark Failed
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">No run found</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">No queue items.</p>
        )}
      </div>
    </div>
  );
}

// ─── Resumes Tab ────────────────────────────────────────────────────

function ResumesTab({
  queueItems,
  selectedSeeker,
  seekerMap,
  tailoredMap,
  setMsg,
}: {
  queueItems: QueueItem[];
  selectedSeeker: string;
  seekerMap: Map<string, SeekerSummary>;
  tailoredMap: Map<string, TailoredResume>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
}) {
  const normalizeTitle = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [changesSummary, setChangesSummary] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<StructuredResume | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplateId>("classic");
  const [saving, setSaving] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankVersions, setBankVersions] = useState<ResumeBankVersion[]>([]);
  const [hardeningAlerts, setHardeningAlerts] = useState<ResumeHardeningAlert[]>([]);
  const [scoringVersions, setScoringVersions] = useState(false);
  const [versionMatches, setVersionMatches] = useState<ResumeVersionMatch[]>([]);
  const [applyingVersionId, setApplyingVersionId] = useState<string | null>(null);
  const [savingBankVersion, setSavingBankVersion] = useState(false);
  const [processingAlertId, setProcessingAlertId] = useState<string | null>(null);
  const [processingVersionId, setProcessingVersionId] = useState<string | null>(null);
  const [optimizingBase, setOptimizingBase] = useState(false);
  const [selectedBankVersionId, setSelectedBankVersionId] = useState<string | null>(null);
  const [bankEditMode, setBankEditMode] = useState(false);
  const [bankEditedName, setBankEditedName] = useState("");
  const [bankEditedTemplate, setBankEditedTemplate] =
    useState<ResumeTemplateId>("classic");
  const [bankEditedData, setBankEditedData] = useState<StructuredResume | null>(null);
  const [bankEditedText, setBankEditedText] = useState("");
  const [savingBankEdits, setSavingBankEdits] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState("");
  const [suggestingAdjustments, setSuggestingAdjustments] = useState(false);
  const [bankSuggestionSummary, setBankSuggestionSummary] = useState<string | null>(null);
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [excludedResumeFields, setExcludedResumeFields] = useState<ResumeFieldToggle[]>([]);

  const queuedJobs = queueItems.filter((q) => q.job_posts);
  const selectedItem = queuedJobs.find((q) => q.id === selectedId);
  const selectedKey = selectedItem
    ? `${selectedItem.job_seeker_id}:${selectedItem.job_post_id}`
    : null;
  const existingTailored = selectedKey ? tailoredMap.get(selectedKey) : null;
  const seeker = selectedItem ? seekerMap.get(selectedItem.job_seeker_id) : null;

  // Active data for preview: edited > existing tailored
  const activeData = editedData ?? existingTailored?.tailored_data ?? null;
  const selectedNormalizedTitle = selectedItem?.job_posts?.title
    ? normalizeTitle(selectedItem.job_posts.title)
    : "";
  const relevantAlerts = hardeningAlerts.filter(
    (alert) => alert.normalized_title === selectedNormalizedTitle
  );
  const activeSeekerId =
    (selectedSeeker !== "all" && seekerMap.has(selectedSeeker)
      ? selectedSeeker
      : selectedItem?.job_seeker_id) ?? null;
  const activeSeekerProfile = activeSeekerId
    ? seekerMap.get(activeSeekerId)
    : null;
  const selectedBankVersion =
    bankVersions.find((row) => row.id === selectedBankVersionId) ?? null;

  const toggleExcludedField = (field: ResumeFieldToggle) => {
    setExcludedResumeFields((prev) =>
      prev.includes(field) ? prev.filter((item) => item !== field) : [...prev, field]
    );
  };

  const optimizeBaseResume = async () => {
    if (!activeSeekerId) {
      setMsg({
        type: "error",
        text: "Choose a single seeker first, then optimize the base resume.",
      });
      return;
    }

    setOptimizingBase(true);
    try {
      const res = await fetch("/api/am/resume-tailor/base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: activeSeekerId,
          template_id: activeSeekerProfile?.resume_template_id ?? "classic",
          excluded_fields: excludedResumeFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({
          type: "error",
          text: data.error || "Failed to optimize base resume.",
        });
        return;
      }

      if (typeof data.warning === "string" && data.warning) {
        setMsg({ type: "error", text: data.warning });
      } else {
        setMsg({
          type: "success",
          text: "Base resume optimized and saved as the default reusable version.",
        });
      }
    } catch {
      setMsg({ type: "error", text: "Network error while optimizing base resume." });
    } finally {
      setOptimizingBase(false);
    }
  };

  useEffect(() => {
    if (!activeSeekerId) {
      setBankVersions([]);
      setHardeningAlerts([]);
      setVersionMatches([]);
      setSelectedBankVersionId(null);
      setBankEditedData(null);
      setBankEditedText("");
      setBankEditedName("");
      setBankSuggestionSummary(null);
      setSuggestionPrompt("");
      return;
    }

    let alive = true;
    setBankLoading(true);

    fetch(`/api/am/resume-bank?job_seeker_id=${activeSeekerId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setBankVersions([]);
          setHardeningAlerts([]);
          setSelectedBankVersionId(null);
          if (data?.error) {
            setMsg({ type: "error", text: data.error });
          }
          return;
        }
        const versions = (data.versions ?? []) as ResumeBankVersion[];
        setBankVersions(versions);
        setHardeningAlerts((data.alerts ?? []) as ResumeHardeningAlert[]);
        setSelectedBankVersionId((prev) => {
          if (prev && versions.some((row) => row.id === prev)) return prev;
          const nextDefault = versions.find((row) => row.is_default) ?? versions[0];
          return nextDefault?.id ?? null;
        });
      })
      .catch(() => {
        if (!alive) return;
        setBankVersions([]);
        setHardeningAlerts([]);
        setSelectedBankVersionId(null);
      })
      .finally(() => {
        if (alive) setBankLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [activeSeekerId, setMsg]);

  useEffect(() => {
    if (!selectedBankVersion) {
      setBankEditMode(false);
      setBankEditedData(null);
      setBankEditedText("");
      setBankEditedName("");
      setBankSuggestionSummary(null);
      return;
    }

    setBankEditMode(false);
    setBankEditedName(selectedBankVersion.name);
    setBankEditedTemplate(
      (selectedBankVersion.template_id || activeSeekerProfile?.resume_template_id || "classic") as ResumeTemplateId
    );
    setBankEditedData(selectedBankVersion.resume_data ?? null);
    setBankEditedText(selectedBankVersion.resume_text ?? "");
    setBankSuggestionSummary(null);
  }, [selectedBankVersion?.id, selectedBankVersion, activeSeekerProfile?.resume_template_id]);

  const selectItem = (id: string) => {
    setSelectedId(id);
    setEditMode(false);
    setEditedData(null);
    setVersionMatches([]);
    const item = queuedJobs.find((q) => q.id === id);
    if (item) {
      const key = `${item.job_seeker_id}:${item.job_post_id}`;
      const tailored = tailoredMap.get(key);
      setEditedText(tailored?.tailored_text || "");
      setChangesSummary(tailored?.changes_summary || null);
      const sk = seekerMap.get(item.job_seeker_id);
      setSelectedTemplate(
        tailored?.template_id || sk?.resume_template_id || "classic"
      );
    }
  };

  const updateTemplate = async (templateId: ResumeTemplateId) => {
    setSelectedTemplate(templateId);
    if (!selectedItem) return;
    try {
      await fetch("/api/am/resume-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          template_id: templateId,
        }),
      });
    } catch {
      // Best effort - template is stored locally regardless
    }
  };

  const tailorWithAI = async () => {
    if (!selectedItem) return;
    setTailoring(true);
    try {
      const res = await fetch("/api/am/resume-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Tailoring failed." });
      } else {
        setEditedText(data.tailored_resume.tailored_text);
        setChangesSummary(data.changes_summary);
        setEditedData(null);
        setEditMode(false);
        const key = `${selectedItem.job_seeker_id}:${selectedItem.job_post_id}`;
        tailoredMap.set(key, data.tailored_resume);
        if (data.tailored_resume.template_id) {
          setSelectedTemplate(data.tailored_resume.template_id);
        }
        setMsg({ type: "success", text: "Resume tailored successfully." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setTailoring(false);
    }
  };

  const saveEdits = async () => {
    if (!selectedItem || !editedData) return;
    setSaving(true);
    try {
      const res = await fetch("/api/am/resume-tailor/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
          tailored_data: editedData,
          template_id: selectedTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Save failed." });
      } else {
        const key = `${selectedItem.job_seeker_id}:${selectedItem.job_post_id}`;
        tailoredMap.set(key, data.tailored_resume);
        setEditedData(null);
        setEditMode(false);
        setMsg({ type: "success", text: "Resume saved." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!selectedItem) return;
    try {
      const res = await fetch("/api/am/resume-tailor/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
          template_id: selectedTemplate,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "PDF download failed." });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored_resume.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setMsg({ type: "error", text: "Network error." });
    }
  };

  const revertResume = () => {
    setEditedText("");
    setChangesSummary(null);
    setEditedData(null);
    setEditMode(false);
    if (selectedKey) {
      tailoredMap.delete(selectedKey);
    }
    setMsg({ type: "success", text: "Reverted to default resume." });
  };

  const toggleEditMode = () => {
    if (!editMode && activeData) {
      setEditedData(JSON.parse(JSON.stringify(activeData)));
    }
    setEditMode(!editMode);
  };

  const compareSavedVersions = async () => {
    if (!selectedItem) return;
    setScoringVersions(true);
    try {
      const res = await fetch("/api/am/resume-bank/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to score resume versions." });
        return;
      }
      setVersionMatches((data.versions ?? []) as ResumeVersionMatch[]);
      if ((data.versions ?? []).length === 0) {
        setMsg({ type: "error", text: "No reusable resume versions found for this seeker yet." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error while scoring versions." });
    } finally {
      setScoringVersions(false);
    }
  };

  const useSavedVersionForJob = async (versionId: string) => {
    if (!selectedItem) return;
    setApplyingVersionId(versionId);
    try {
      const res = await fetch("/api/am/resume-tailor/use-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
          resume_version_id: versionId,
          template_id: selectedTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to apply resume version." });
        return;
      }

      const key = `${selectedItem.job_seeker_id}:${selectedItem.job_post_id}`;
      tailoredMap.set(key, data.tailored_resume);
      setEditedText(data.tailored_resume.tailored_text ?? "");
      setChangesSummary(data.tailored_resume.changes_summary ?? null);
      setEditedData(null);
      setEditMode(false);
      setMsg({ type: "success", text: "Saved resume version applied to this job." });
    } catch {
      setMsg({ type: "error", text: "Network error while applying version." });
    } finally {
      setApplyingVersionId(null);
    }
  };

  const saveCurrentToBank = async () => {
    if (!selectedItem) return;
    if (!existingTailored && !activeData && !editedText.trim()) {
      setMsg({ type: "error", text: "Tailor the resume first, then save it to the bank." });
      return;
    }

    setSavingBankVersion(true);
    try {
      const res = await fetch("/api/am/resume-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          from_job_post_id: selectedItem.job_post_id,
          name: `${selectedItem.job_posts?.title || "Resume"} Reusable Version`,
          source: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to save version." });
        return;
      }
      if (data.version) {
        setBankVersions((prev) => [data.version as ResumeBankVersion, ...prev]);
        setSelectedBankVersionId((data.version as ResumeBankVersion).id);
      }
      if (data.warning) {
        setMsg({ type: "error", text: data.warning });
      } else {
        setMsg({ type: "success", text: "Reusable resume version saved." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error while saving version." });
    } finally {
      setSavingBankVersion(false);
    }
  };

  const setDefaultVersion = async (versionId: string) => {
    if (!activeSeekerId) return;
    setProcessingVersionId(versionId);
    try {
      const res = await fetch("/api/am/resume-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_default",
          job_seeker_id: activeSeekerId,
          version_id: versionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to set default version." });
        return;
      }
      setBankVersions((prev) =>
        prev.map((row) => ({ ...row, is_default: row.id === versionId }))
      );
      if (data.warning) {
        setMsg({ type: "error", text: data.warning });
      } else {
        setMsg({ type: "success", text: "Primary reusable resume updated for this seeker." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error while updating default version." });
    } finally {
      setProcessingVersionId(null);
    }
  };

  const saveBankVersionEdits = async () => {
    if (!activeSeekerId || !selectedBankVersion) return;
    if (!bankEditedData && !bankEditedText.trim()) {
      setMsg({ type: "error", text: "Resume content is empty. Add content before saving." });
      return;
    }

    setSavingBankEdits(true);
    try {
      const payload: Record<string, unknown> = {
        action: "update_version",
        job_seeker_id: activeSeekerId,
        version_id: selectedBankVersion.id,
        name: bankEditedName.trim() || selectedBankVersion.name,
        template_id: bankEditedTemplate,
        make_default: selectedBankVersion.is_default,
      };
      if (bankEditedData) {
        payload.resume_data = bankEditedData;
      } else {
        payload.resume_text = bankEditedText;
      }

      const res = await fetch("/api/am/resume-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to save resume version." });
        return;
      }

      if (data.version) {
        const updated = data.version as ResumeBankVersion;
        setBankVersions((prev) =>
          prev.map((row) => (row.id === updated.id ? updated : row))
        );
      }
      setBankEditMode(false);
      if (data.warning) {
        setMsg({ type: "error", text: data.warning });
      } else {
        setMsg({ type: "success", text: "Resume version saved." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error while saving resume version." });
    } finally {
      setSavingBankEdits(false);
    }
  };

  const suggestAdjustmentsForVersion = async () => {
    if (!activeSeekerId || !selectedBankVersion) return;
    if (suggestionPrompt.trim().length < 10) {
      setMsg({
        type: "error",
        text: "Enter at least 10 characters of guidance for adjustment suggestions.",
      });
      return;
    }

    setSuggestingAdjustments(true);
    try {
      const res = await fetch("/api/am/resume-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest_adjustments",
          job_seeker_id: activeSeekerId,
          version_id: selectedBankVersion.id,
          guidance: suggestionPrompt.trim(),
          excluded_fields: excludedResumeFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to generate suggestions." });
        return;
      }

      const suggestion = data.suggestion as {
        tailored_data: StructuredResume | null;
        tailored_text: string;
        changes_summary: string | null;
        template_id: ResumeTemplateId | null;
      };
      if (suggestion.tailored_data) {
        setBankEditedData(suggestion.tailored_data);
      } else {
        setBankEditedData(null);
      }
      setBankEditedText(suggestion.tailored_text ?? "");
      if (suggestion.template_id) {
        setBankEditedTemplate(suggestion.template_id);
      }
      setBankSuggestionSummary(suggestion.changes_summary ?? null);
      setBankEditMode(true);
      setMsg({
        type: "success",
        text: "Adjustment suggestions generated. Review and save if approved.",
      });
    } catch {
      setMsg({ type: "error", text: "Network error while generating suggestions." });
    } finally {
      setSuggestingAdjustments(false);
    }
  };

  const downloadBankVersionPdf = async (version: ResumeBankVersion) => {
    if (!activeSeekerId) return;
    if (!version.resume_data && version.resume_url) {
      window.open(version.resume_url, "_blank", "noopener,noreferrer");
      return;
    }

    setDownloadingVersionId(version.id);
    try {
      const res = await fetch("/api/am/resume-bank/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: activeSeekerId,
          version_id: version.id,
          template_id: bankEditedTemplate || version.template_id || "classic",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "PDF download failed." });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(version.name || "resume-version").replace(/\s+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setMsg({ type: "error", text: "Network error while downloading PDF." });
    } finally {
      setDownloadingVersionId(null);
    }
  };

  const resetBankEdits = () => {
    if (!selectedBankVersion) return;
    setBankEditMode(false);
    setBankEditedName(selectedBankVersion.name);
    setBankEditedTemplate(
      (selectedBankVersion.template_id || activeSeekerProfile?.resume_template_id || "classic") as ResumeTemplateId
    );
    setBankEditedData(selectedBankVersion.resume_data ?? null);
    setBankEditedText(selectedBankVersion.resume_text ?? "");
    setBankSuggestionSummary(null);
  };

  const approveAlert = async (alertId: string) => {
    if (!selectedItem) return;
    setProcessingAlertId(alertId);
    try {
      const res = await fetch("/api/am/resume-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_alert",
          job_seeker_id: selectedItem.job_seeker_id,
          alert_id: alertId,
          make_default: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to approve hardening alert." });
        return;
      }
      setHardeningAlerts((prev) => prev.filter((row) => row.id !== alertId));
      if (data.version) {
        setBankVersions((prev) => [data.version as ResumeBankVersion, ...prev]);
      }
      if (data.warning) {
        setMsg({ type: "error", text: data.warning });
      } else {
        setMsg({ type: "success", text: "Hardened resume version approved and added to bank." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error while approving hardening alert." });
    } finally {
      setProcessingAlertId(null);
    }
  };

  const dismissAlert = async (alertId: string) => {
    if (!selectedItem) return;
    setProcessingAlertId(alertId);
    try {
      const res = await fetch("/api/am/resume-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss_alert",
          job_seeker_id: selectedItem.job_seeker_id,
          alert_id: alertId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to dismiss hardening alert." });
        return;
      }
      setHardeningAlerts((prev) => prev.filter((row) => row.id !== alertId));
      setMsg({ type: "success", text: "Hardening alert dismissed." });
    } catch {
      setMsg({ type: "error", text: "Network error while dismissing alert." });
    } finally {
      setProcessingAlertId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-indigo-900">
              Base Resume Optimization
            </h3>
            <p className="text-xs text-indigo-800 mt-1">
              Optimize the seeker&apos;s default ATS resume (not tied to one job). New
              job tailoring will reuse this base by default.
            </p>
          </div>
          <button
            onClick={optimizeBaseResume}
            disabled={optimizingBase || !activeSeekerId}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {optimizingBase ? "Optimizing..." : "Optimize Base Resume"}
          </button>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium text-indigo-900 mb-2">
            Hide Optional Fields (not shown in generated output)
          </p>
          <div className="flex flex-wrap gap-2">
            {RESUME_FIELD_TOGGLE_OPTIONS.map((option) => {
              const active = excludedResumeFields.includes(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggleExcludedField(option.key)}
                  className={`px-2.5 py-1.5 text-xs rounded border transition-colors ${
                    active
                      ? "border-indigo-400 bg-indigo-100 text-indigo-900"
                      : "border-indigo-200 bg-white text-indigo-700 hover:border-indigo-300"
                  }`}
                >
                  {active ? `Hidden: ${option.label}` : option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Base Resume Manager</h3>
            <p className="text-xs text-gray-600 mt-1">
              View, edit, suggest adjustments, download, and set the primary reusable resume for the selected seeker.
            </p>
          </div>
          {activeSeekerProfile && (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
              Seeker: {activeSeekerProfile.full_name || activeSeekerProfile.email}
            </span>
          )}
        </div>

        {!activeSeekerId ? (
          <p className="text-sm text-gray-500">
            Choose a single seeker in the top-right selector to manage base resumes.
          </p>
        ) : bankVersions.length === 0 ? (
          <p className="text-sm text-gray-500">
            No reusable resume versions yet for this seeker. Click "Optimize Base Resume" to create one.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-4">
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {bankVersions.map((version) => (
                <button
                  key={version.id}
                  onClick={() => setSelectedBankVersionId(version.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedBankVersionId === version.id
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">
                    {version.name}
                    {version.is_default && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                        Primary
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {version.source}
                    {version.title_focus ? ` | ${version.title_focus}` : ""}
                  </p>
                </button>
              ))}
            </div>

            {!selectedBankVersion ? (
              <div className="text-sm text-gray-500">
                Select a resume version to manage it.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[1fr,220px] gap-3">
                  <input
                    value={bankEditedName}
                    onChange={(e) => setBankEditedName(e.target.value)}
                    placeholder="Version name"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <select
                    value={bankEditedTemplate}
                    onChange={(e) => setBankEditedTemplate(e.target.value as ResumeTemplateId)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    {RESUME_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDefaultVersion(selectedBankVersion.id)}
                    disabled={processingVersionId === selectedBankVersion.id || selectedBankVersion.is_default}
                    className="px-3 py-2 bg-gray-100 text-gray-800 text-xs font-medium rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    {selectedBankVersion.is_default
                      ? "Primary Resume"
                      : processingVersionId === selectedBankVersion.id
                      ? "Saving..."
                      : "Set As Primary"}
                  </button>
                  <button
                    onClick={() => downloadBankVersionPdf(selectedBankVersion)}
                    disabled={downloadingVersionId === selectedBankVersion.id}
                    className="px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {downloadingVersionId === selectedBankVersion.id ? "Downloading..." : "Download PDF"}
                  </button>
                  <button
                    onClick={() => setBankEditMode((prev) => !prev)}
                    className="px-3 py-2 bg-violet-50 text-violet-700 text-xs font-medium rounded hover:bg-violet-100"
                  >
                    {bankEditMode ? "Stop Editing" : "Edit Version"}
                  </button>
                  {bankEditMode && (
                    <>
                      <button
                        onClick={saveBankVersionEdits}
                        disabled={savingBankEdits}
                        className="px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded hover:bg-violet-700 disabled:opacity-50"
                      >
                        {savingBankEdits ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        onClick={resetBankEdits}
                        className="px-3 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200"
                      >
                        Reset
                      </button>
                    </>
                  )}
                </div>

                <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <label className="text-xs font-medium text-gray-600">
                    Suggest Adjustment Guidance
                  </label>
                  <textarea
                    value={suggestionPrompt}
                    onChange={(e) => setSuggestionPrompt(e.target.value)}
                    placeholder="Example: strengthen achievements for cybersecurity roles, prioritize SOC metrics, and shorten summary."
                    className="w-full h-20 px-3 py-2 border border-gray-300 rounded text-sm resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={suggestAdjustmentsForVersion}
                      disabled={suggestingAdjustments}
                      className="px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {suggestingAdjustments ? "Generating..." : "Suggest Adjustments"}
                    </button>
                    <span className="text-xs text-gray-500">
                      Suggestions are not saved until you click "Save Changes".
                    </span>
                    {excludedResumeFields.length > 0 && (
                      <span className="text-xs text-indigo-600">
                        Hidden fields active: {excludedResumeFields.length}
                      </span>
                    )}
                  </div>
                </div>

                {bankSuggestionSummary && (
                  <div className="bg-indigo-50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-indigo-800 mb-1">Suggestion Summary</h4>
                    <p className="text-xs text-indigo-700 whitespace-pre-wrap">{bankSuggestionSummary}</p>
                  </div>
                )}

                {bankEditedData ? (
                  <ResumePreview
                    data={bankEditedData}
                    templateId={bankEditedTemplate}
                    editMode={bankEditMode}
                    onDataChange={setBankEditedData}
                  />
                ) : (
                  <textarea
                    value={bankEditedText}
                    onChange={(e) => setBankEditedText(e.target.value)}
                    className="w-full h-64 px-3 py-2 border border-gray-300 rounded text-sm font-sans resize-y"
                    readOnly={!bankEditMode}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-6 min-h-[500px]">
      {/* Left panel - job list */}
      <div className="w-80 shrink-0 border-r pr-4 overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-3">Queued Jobs</h3>
        <div className="space-y-2">
          {queuedJobs.map((q) => {
            const key = `${q.job_seeker_id}:${q.job_post_id}`;
            const hasTailored = tailoredMap.has(key);
            const hasStructured = !!tailoredMap.get(key)?.tailored_data;
            return (
              <button
                key={q.id}
                onClick={() => selectItem(q.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedId === q.id
                    ? "border-violet-500 bg-violet-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-medium text-sm text-gray-900 truncate">{q.job_posts?.title}</p>
                <p className="text-xs text-gray-500 truncate">{q.job_posts?.company}</p>
                <p className="text-xs text-gray-500">{q.job_seekers?.full_name}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                  hasStructured ? "bg-green-100 text-green-800" : hasTailored ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600"
                }`}>
                  {hasStructured ? "Tailored" : hasTailored ? "Text Only" : "Default"}
                </span>
              </button>
            );
          })}
          {queuedJobs.length === 0 && (
            <p className="text-gray-500 text-sm">No queued jobs.</p>
          )}
        </div>
      </div>

      {/* Right panel - resume view */}
      <div className="flex-1 min-w-0">
        {!selectedItem ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a job to view/tailor the resume
          </div>
        ) : (
          <div className="space-y-4">
            {relevantAlerts.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-orange-900 mb-2">
                  Hardening Approval Needed
                </h4>
                <div className="space-y-2">
                  {relevantAlerts.map((alert) => (
                    <div key={alert.id} className="bg-white border border-orange-100 rounded p-3">
                      <p className="text-sm text-orange-900">
                        This title has been tailored <span className="font-semibold">{alert.tailored_count}</span> times.
                      </p>
                      <p className="text-xs text-orange-700 mt-1">
                        Approve a hardened reusable version for faster reuse.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => approveAlert(alert.id)}
                          disabled={processingAlertId === alert.id}
                          className="px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded hover:bg-orange-700 disabled:opacity-50"
                        >
                          {processingAlertId === alert.id ? "Approving..." : "Approve Hardened Version"}
                        </button>
                        <button
                          onClick={() => dismissAlert(alert.id)}
                          disabled={processingAlertId === alert.id}
                          className="px-3 py-1.5 bg-white border border-orange-300 text-orange-700 text-xs font-medium rounded hover:bg-orange-100 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Template Selector */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">Resume Template</h4>
              <div className="flex gap-2 flex-wrap">
                {RESUME_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateTemplate(t.id)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      selectedTemplate === t.id
                        ? "border-violet-500 bg-violet-50 text-violet-700 font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{t.description}</span>
                  </button>
                ))}
              </div>
              {selectedItem && (
                <ExactPdfPreview
                  jobSeekerId={selectedItem.job_seeker_id}
                  jobPostId={selectedItem.job_post_id}
                  templateId={selectedTemplate}
                  hasTailored={Boolean(activeData)}
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedItem.job_posts?.title} at {selectedItem.job_posts?.company}
                </h3>
                <p className="text-sm text-gray-500">
                  Seeker: {seeker?.full_name || seeker?.email}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={compareSavedVersions}
                  disabled={scoringVersions}
                  className="px-4 py-2 bg-violet-50 text-violet-700 text-sm font-medium rounded-lg hover:bg-violet-100 disabled:opacity-50"
                >
                  {scoringVersions ? "Scoring..." : "Compare Saved Versions"}
                </button>
                <button
                  onClick={tailorWithAI}
                  disabled={tailoring}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {tailoring ? "Tailoring..." : "Tailor with AI"}
                </button>
                <button
                  onClick={saveCurrentToBank}
                  disabled={savingBankVersion}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingBankVersion ? "Saving..." : "Save to Resume Bank"}
                </button>
                {activeData && (
                  <>
                    <button
                      onClick={downloadPdf}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                    >
                      Download PDF
                    </button>
                    <button
                      onClick={toggleEditMode}
                      className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                    >
                      {editMode ? "Cancel Edit" : "Edit"}
                    </button>
                  </>
                )}
                {editMode && editedData && (
                  <button
                    onClick={saveEdits}
                    disabled={saving}
                    className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                )}
                {(editedText || activeData) && (
                  <button
                    onClick={revertResume}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>

            {versionMatches.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-violet-900">
                  Resume Match Scores (for this job description)
                </h4>
                <div className="space-y-2">
                  {versionMatches.map((version) => (
                    <div key={version.id} className="bg-white border border-violet-100 rounded p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {version.name}
                          {version.is_default && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                              Default
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          Source: {version.source} {version.title_focus ? `| Focus: ${version.title_focus}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-violet-100 text-violet-800">
                          {version.match_percent}%
                        </span>
                        {version.id !== "__base__" && (
                          <button
                            onClick={() => useSavedVersionForJob(version.id)}
                            disabled={applyingVersionId === version.id}
                            className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded hover:bg-violet-700 disabled:opacity-50"
                          >
                            {applyingVersionId === version.id ? "Applying..." : "Use This Version"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900">Resume Bank</h4>
                {bankLoading && <span className="text-xs text-gray-500">Loading...</span>}
              </div>
              <div className="space-y-2">
                {bankVersions.slice(0, 6).map((version) => (
                  <div key={version.id} className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {version.name}
                        {version.is_default && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                            Default
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {version.source} {version.title_focus ? `| ${version.title_focus}` : ""}
                      </p>
                    </div>
                    {!version.is_default && (
                      <button
                        onClick={() => setDefaultVersion(version.id)}
                        disabled={processingVersionId === version.id}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        {processingVersionId === version.id ? "Saving..." : "Set Default"}
                      </button>
                    )}
                  </div>
                ))}
                {bankVersions.length === 0 && (
                  <p className="text-xs text-gray-500">No reusable versions yet.</p>
                )}
              </div>
            </div>

            {/* Job description summary */}
            {selectedItem.job_posts?.description_text && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Job Description</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
                  {selectedItem.job_posts.description_text}
                </p>
                {selectedItem.job_posts.required_skills && selectedItem.job_posts.required_skills.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-gray-500">Required:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedItem.job_posts.required_skills.map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedItem.job_posts.preferred_skills && selectedItem.job_posts.preferred_skills.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-gray-500">Preferred:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedItem.job_posts.preferred_skills.map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-violet-50 text-violet-700 text-xs rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Changes summary */}
            {changesSummary && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-indigo-700 mb-1">AI Changes Summary</h4>
                <p className="text-sm text-indigo-600 whitespace-pre-wrap">{changesSummary}</p>
              </div>
            )}

            {/* Structured resume preview or legacy textarea */}
            {activeData ? (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Tailored Resume Preview
                </h4>
                <ResumePreview
                  data={editMode && editedData ? editedData : activeData}
                  templateId={selectedTemplate}
                  editMode={editMode}
                  onDataChange={setEditedData}
                />
              </div>
            ) : (
              <>
                {/* Original resume */}
                {seeker?.resume_text && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Original Resume</h4>
                    <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{seeker.resume_text}</pre>
                    </div>
                  </div>
                )}

                {/* Fallback textarea for legacy text-only tailored resumes */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    {existingTailored || editedText ? "Tailored Resume" : "Custom Resume (paste or use AI)"}
                  </h4>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    placeholder="Use 'Tailor with AI' or paste a custom resume here..."
                    className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg text-sm font-sans resize-y"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ─── Applied Tab ────────────────────────────────────────────────────

function AppliedTab({
  runs,
  seekerMap,
  setMsg,
  switchTab,
}: {
  runs: RunItem[];
  seekerMap: Map<string, SeekerSummary>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
  switchTab: (tab: TabId) => void;
}) {
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const appliedRuns = runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status));

  // Group by company
  const byCompany = useMemo(() => {
    const groups = new Map<string, RunItem[]>();
    appliedRuns.forEach((r) => {
      const company = r.job_posts?.company || "Unknown Company";
      if (!groups.has(company)) groups.set(company, []);
      groups.get(company)!.push(r);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appliedRuns]);

  const findContacts = async (run: RunItem) => {
    if (!run.job_posts) return;
    setLoading((prev) => new Set(prev).add(run.id));
    try {
      const res = await fetch("/api/outreach/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: run.job_seeker_id,
          job_post_id: run.job_post_id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to generate contacts." });
      } else {
        setMsg({ type: "success", text: "Contacts generated. Check Follow Up tab." });
        switchTab("followup");
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setLoading((prev) => { const n = new Set(prev); n.delete(run.id); return n; });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>Total applied: {appliedRuns.length}</span>
        <span>Companies: {byCompany.length}</span>
      </div>

      {byCompany.map(([company, companyRuns]) => (
        <div key={company} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">{company}</h3>
            <p className="text-xs text-gray-500">{companyRuns.length} application(s)</p>
          </div>
          <div className="divide-y">
            {companyRuns.map((r) => {
              const seeker = seekerMap.get(r.job_seeker_id);
              return (
                <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{r.job_posts?.title || "Unknown Job"}</p>
                    <p className="text-sm text-gray-500">
                      {seeker?.full_name || "Unknown Seeker"}
                      {" \u2022 "}
                      {new Date(r.updated_at).toLocaleDateString()}
                      {r.ats_type && ` \u2022 ${r.ats_type}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href="/dashboard/interview-prep"
                      className="px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-lg hover:bg-purple-100"
                    >
                      Interview Prep
                    </a>
                    <button
                      onClick={() => findContacts(r)}
                      disabled={loading.has(r.id)}
                      className="px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 disabled:opacity-50"
                    >
                      {loading.has(r.id) ? "..." : "Find Contacts"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {byCompany.length === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">No applied applications yet.</p>
      )}
    </div>
  );
}

// ─── Follow Up Tab ──────────────────────────────────────────────────

function FollowUpTab({
  runs,
  outreachContacts,
  outreachDrafts,
  seekerMap,
  setMsg,
}: {
  runs: RunItem[];
  outreachContacts: OutreachContact[];
  outreachDrafts: OutreachDraft[];
  seekerMap: Map<string, SeekerSummary>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
}) {
  const router = useRouter();
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const pendingDrafts = outreachDrafts.filter(
    (d) => d.status === "draft" || d.status === "DRAFT"
  );

  const sendAllDrafts = async () => {
    const draftIds = pendingDrafts.map((d) => d.id);
    if (draftIds.length === 0) return;
    setBulkSending(true);
    try {
      const res = await fetch("/api/outreach/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_ids: draftIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Batch send failed." });
      } else {
        setMsg({
          type: "success",
          text: `Sent ${data.sent}, skipped ${data.skipped}, failed ${data.failed}.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setBulkSending(false);
    }
  };

  const appliedRuns = runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status));

  // Group by company
  const companies = useMemo(() => {
    const companyMap = new Map<string, {
      runs: RunItem[];
      contacts: OutreachContact[];
      drafts: OutreachDraft[];
    }>();

    appliedRuns.forEach((r) => {
      const company = r.job_posts?.company || "Unknown";
      if (!companyMap.has(company)) {
        companyMap.set(company, { runs: [], contacts: [], drafts: [] });
      }
      companyMap.get(company)!.runs.push(r);
    });

    outreachContacts.forEach((c) => {
      // Find company from related runs
      const matchedRun = appliedRuns.find(
        (r) => r.job_post_id === c.job_post_id && r.job_seeker_id === c.job_seeker_id
      );
      const company = matchedRun?.job_posts?.company || "Unknown";
      if (companyMap.has(company)) {
        companyMap.get(company)!.contacts.push(c);
      }
    });

    outreachDrafts.forEach((d) => {
      const company = d.job_posts?.company || "Unknown";
      if (companyMap.has(company)) {
        companyMap.get(company)!.drafts.push(d);
      }
    });

    return Array.from(companyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appliedRuns, outreachContacts, outreachDrafts]);

  const selectedData = companies.find(([name]) => name === selectedCompany)?.[1];

  const getOutreachStatus = (data: { contacts: OutreachContact[]; drafts: OutreachDraft[] }) => {
    if (data.drafts.some((d) => d.status === "sent")) return "sent";
    if (data.drafts.length > 0) return "drafts";
    if (data.contacts.length > 0) return "contacts";
    return "none";
  };

  const generateContacts = async () => {
    if (!selectedData) return;
    const run = selectedData.runs[0];
    if (!run) return;
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: run.job_seeker_id,
          job_post_id: run.job_post_id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to generate contacts." });
      } else {
        setMsg({ type: "success", text: "Contacts and drafts generated." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setLoading(false);
    }
  };

  const startEditDraft = (draft: OutreachDraft) => {
    setEditingDraft(draft.id);
    setDraftSubject(draft.subject || "");
    setDraftBody(draft.body || "");
  };

  const sendDraft = async (draftId: string) => {
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draftId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to send." });
      } else {
        setMsg({ type: "success", text: "Email sent." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    }
  };

  return (
    <div className="space-y-4">
      {pendingDrafts.length > 0 && (
        <button
          onClick={sendAllDrafts}
          disabled={bulkSending}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {bulkSending ? "Sending..." : `Send All Drafts (${pendingDrafts.length})`}
        </button>
      )}
    <div className="flex gap-6 min-h-[500px]">
      {/* Left panel - company list */}
      <div className="w-72 shrink-0 border-r pr-4 overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-3">Companies</h3>
        <div className="space-y-2">
          {companies.map(([name, data]) => {
            const status = getOutreachStatus(data);
            const statusColors: Record<string, string> = {
              sent: "bg-green-100 text-green-800",
              drafts: "bg-yellow-100 text-yellow-800",
              contacts: "bg-violet-100 text-violet-800",
              none: "bg-gray-100 text-gray-600",
            };
            return (
              <button
                key={name}
                onClick={() => setSelectedCompany(name)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedCompany === name
                    ? "border-violet-500 bg-violet-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-medium text-sm text-gray-900 truncate">{name}</p>
                <p className="text-xs text-gray-500">{data.runs.length} application(s)</p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${statusColors[status]}`}>
                  {status === "none" ? "No outreach" : status === "drafts" ? "Drafts pending" : status === "contacts" ? "Contacts found" : "Sent"}
                </span>
              </button>
            );
          })}
          {companies.length === 0 && (
            <p className="text-gray-500 text-sm">No applied companies.</p>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        {!selectedCompany || !selectedData ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a company to manage outreach
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-lg">{selectedCompany}</h3>
              <button
                onClick={generateContacts}
                disabled={loading}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Contacts"}
              </button>
            </div>

            {/* Jobs applied */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Jobs Applied</h4>
              <div className="space-y-2">
                {selectedData.runs.map((r) => {
                  const seeker = seekerMap.get(r.job_seeker_id);
                  return (
                    <div key={r.id} className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-sm text-gray-900">{r.job_posts?.title}</p>
                      <p className="text-xs text-gray-500">
                        {seeker?.full_name} \u2022 {new Date(r.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contacts */}
            {selectedData.contacts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Contacts</h4>
                <div className="space-y-2">
                  {selectedData.contacts.map((c) => (
                    <div key={c.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.full_name || c.role || "Contact"}</p>
                        <p className="text-xs text-gray-500">{c.email}</p>
                      </div>
                      <span className="text-xs text-gray-500 capitalize">{c.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drafts */}
            {selectedData.drafts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Email Drafts</h4>
                <div className="space-y-3">
                  {selectedData.drafts.map((d) => (
                    <div key={d.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={d.status.toUpperCase()} />
                          {d.outreach_contacts && (
                            <span className="text-xs text-gray-500">
                              To: {d.outreach_contacts.full_name || d.outreach_contacts.email}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {d.status !== "sent" && (
                            <>
                              <button
                                onClick={() => startEditDraft(d)}
                                className="text-xs text-violet-600 hover:text-violet-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => sendDraft(d.id)}
                                className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                              >
                                Send
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {editingDraft === d.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={draftSubject}
                            onChange={(e) => setDraftSubject(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="Subject"
                          />
                          <textarea
                            value={draftBody}
                            onChange={(e) => setDraftBody(e.target.value)}
                            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingDraft(null)}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-sm text-gray-900">{d.subject}</p>
                          <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{d.body}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedData.contacts.length === 0 && selectedData.drafts.length === 0 && (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-gray-500 text-sm">No contacts or drafts yet.</p>
                <p className="text-gray-400 text-xs mt-1">Click &quot;Generate Contacts&quot; to create outreach drafts.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "blue" | "green" | "orange" | "purple";
}) {
  const colorClasses: Record<string, string> = {
    blue: "text-violet-600",
    green: "text-green-600",
    orange: "text-orange-600",
    purple: "text-purple-600",
  };
  const colorClass = color ? colorClasses[color] : "text-gray-900";

  return (
    <div className="px-4 py-2 bg-gray-50 rounded-lg">
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUED: "bg-yellow-100 text-yellow-800",
    RUNNING: "bg-violet-100 text-violet-800",
    PAUSED: "bg-gray-100 text-gray-800",
    READY: "bg-violet-100 text-violet-800",
    RETRYING: "bg-violet-100 text-violet-800",
    APPLIED: "bg-green-100 text-green-800",
    COMPLETED: "bg-green-100 text-green-800",
    NEEDS_ATTENTION: "bg-orange-100 text-orange-800",
    FAILED: "bg-red-100 text-red-800",
    DRAFT: "bg-gray-100 text-gray-800",
    SENT: "bg-green-100 text-green-800",
    PENDING: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-800"
      : score >= 60
      ? "bg-yellow-100 text-yellow-800"
      : "bg-gray-100 text-gray-600";
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${color}`}>
      {score}
    </span>
  );
}

// Exact-PDF fidelity preview for the selected template. The inline ResumePreview
// above is an editable HTML approximation; this shows the real rendered PDF
// (the tailored resume if one exists, otherwise the base resume in that template).
function ExactPdfPreview({
  jobSeekerId,
  jobPostId,
  templateId,
  hasTailored,
}: {
  jobSeekerId: string;
  jobPostId: string;
  templateId: ResumeTemplateId;
  hasTailored: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    const endpoint = hasTailored
      ? "/api/am/resume-tailor/pdf"
      : "/api/am/resume-template/preview";
    const body = hasTailored
      ? { job_seeker_id: jobSeekerId, job_post_id: jobPostId, template_id: templateId }
      : { job_seeker_id: jobSeekerId, template_id: templateId };
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Preview unavailable.");
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, templateId, jobSeekerId, jobPostId, hasTailored]);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-violet-600 hover:text-violet-800"
      >
        {open ? "Hide exact PDF" : "View exact PDF"}
      </button>
      {open && (
        <div className="mt-2">
          {loading && <p className="text-xs text-gray-400">Rendering…</p>}
          {error && <p className="text-xs text-amber-600">{error}</p>}
          {url && (
            <iframe
              title="Exact PDF preview"
              src={`${url}#toolbar=0&navpanes=0&view=FitH`}
              className="h-96 w-full rounded-lg border border-gray-200 bg-gray-50"
            />
          )}
        </div>
      )}
    </div>
  );
}
