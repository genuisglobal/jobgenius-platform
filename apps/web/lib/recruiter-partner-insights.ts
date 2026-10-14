export type RecruiterPartnerInsightRecruiter = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  partner_type: string | null;
  do_not_contact: boolean | null;
  owner_account_manager_id: string | null;
  status: string | null;
};

export type RecruiterPartnerInsightRequest = {
  id: string;
  recruiter_id: string;
  persona_type: string;
  client_company_name: string | null;
  hiring_urgency: string | null;
  status: string;
  first_response_at: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecruiterPartnerInsightActivity = {
  recruiter_id: string;
  activity_type: string;
  source: string;
  created_at: string;
};

export type RecruiterPartnerScoreTier =
  | "strategic"
  | "active"
  | "warming"
  | "low_fit";

export type RecruiterPartnerInsight = {
  recruiterId: string;
  displayName: string;
  companyName: string;
  ownerLabel: string | null;
  partnerType: string | null;
  requestCount: number;
  openRequestCount: number;
  replyCount: number;
  progressedRequestCount: number;
  shortlistSentCount: number;
  activeCount: number;
  highUrgencyCount: number;
  clientCompanyCount: number;
  workspaceEnabled: boolean;
  workspaceUsageCount: number;
  lastTouchAt: string | null;
  score: number;
  scoreTier: RecruiterPartnerScoreTier;
  scoreReasons: string[];
  repeatPartner: boolean;
};

export type RecruiterPartnerPipelineSummary = {
  newCount: number;
  reviewingCount: number;
  qualifiedCount: number;
  awaitingDetailsCount: number;
  shortlistSentCount: number;
  activeCount: number;
  closedCount: number;
};

export type AgencyLeaderboardEntry = {
  recruiterId: string;
  displayName: string;
  ownerLabel: string | null;
  requestCount: number;
  openRequestCount: number;
  clientCompanyCount: number;
  replyCount: number;
  score: number;
  scoreTier: RecruiterPartnerScoreTier;
};

export type RecruiterPartnerReport = {
  metrics: {
    totalPartners: number;
    repeatPartners: number;
    agencyPartners: number;
    repeatAgencies: number;
    strategicPartners: number;
    workspaceEnabledPartners: number;
    replyingPartners: number;
    progressedRequests: number;
    totalRequests: number;
    agencyRequestCount: number;
    uniqueAgencyClients: number;
    averageScore: number;
    replyRatePercent: number;
    agencySharePercent: number;
    progressedRatePercent: number;
  };
  pipeline: RecruiterPartnerPipelineSummary;
  partnerInsights: RecruiterPartnerInsight[];
  agencyLeaderboard: AgencyLeaderboardEntry[];
};

function toTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isClosedStatus(status: string | null | undefined) {
  return status === "closed" || status === "rejected";
}

function roundPercent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getScoreTier(score: number): RecruiterPartnerScoreTier {
  if (score >= 75) return "strategic";
  if (score >= 55) return "active";
  if (score >= 30) return "warming";
  return "low_fit";
}

function getLatestTouchTimestamp(
  requests: RecruiterPartnerInsightRequest[],
  activities: RecruiterPartnerInsightActivity[]
) {
  const requestTouch = requests.reduce((max, request) => {
    return Math.max(
      max,
      toTime(request.updated_at),
      toTime(request.last_inbound_at),
      toTime(request.last_outbound_at)
    );
  }, 0);

  const activityTouch = activities.reduce(
    (max, activity) => Math.max(max, toTime(activity.created_at)),
    0
  );

  return Math.max(requestTouch, activityTouch);
}

function buildScore({
  recruiter,
  requests,
  activities,
  openRequestCount,
  replyCount,
  progressedRequestCount,
  shortlistSentCount,
  activeCount,
  highUrgencyCount,
  clientCompanyCount,
}: {
  recruiter: RecruiterPartnerInsightRecruiter;
  requests: RecruiterPartnerInsightRequest[];
  activities: RecruiterPartnerInsightActivity[];
  openRequestCount: number;
  replyCount: number;
  progressedRequestCount: number;
  shortlistSentCount: number;
  activeCount: number;
  highUrgencyCount: number;
  clientCompanyCount: number;
}) {
  let score = 0;
  const reasons: string[] = [];
  const workspaceEnabled = activities.some(
    (activity) => activity.activity_type === "workspace_link_sent"
  );
  const workspaceUsageCount = activities.filter(
    (activity) => activity.activity_type === "workspace_request_submitted"
  ).length;
  const latestTouchMs = getLatestTouchTimestamp(requests, activities);
  const daysSinceTouch = latestTouchMs
    ? (Date.now() - latestTouchMs) / (1000 * 60 * 60 * 24)
    : Number.POSITIVE_INFINITY;

  if (requests.length >= 4) {
    score += 18;
    reasons.push("4+ requests submitted");
  } else if (requests.length >= 2) {
    score += 12;
    reasons.push("repeat partner demand");
  } else if (requests.length >= 1) {
    score += 6;
  }

  if (openRequestCount >= 3) {
    score += 14;
    reasons.push("multiple open reqs");
  } else if (openRequestCount >= 1) {
    score += 8;
    reasons.push("active demand");
  }

  if (replyCount >= 2) {
    score += 18;
    reasons.push("replies across multiple requests");
  } else if (replyCount >= 1) {
    score += 10;
    reasons.push("recruiter responded");
  }

  if (progressedRequestCount >= 2) {
    score += 18;
    reasons.push("requests progressed beyond intake");
  } else if (progressedRequestCount >= 1) {
    score += 12;
    reasons.push("request progressed in pipeline");
  }

  if (shortlistSentCount >= 1) {
    score += 8;
    reasons.push("shortlist already sent");
  }

  if (activeCount >= 1) {
    score += 8;
    reasons.push("active collaboration");
  }

  if (workspaceEnabled) {
    score += 8;
    reasons.push("workspace enabled");
  }

  if (workspaceUsageCount >= 1) {
    score += 10;
    reasons.push("workspace used");
  }

  if (recruiter.partner_type === "agency" && clientCompanyCount >= 2) {
    score += 14;
    reasons.push("multi-client agency");
  } else if (recruiter.partner_type === "agency" && clientCompanyCount === 1) {
    score += 8;
  }

  if (highUrgencyCount >= 1) {
    score += 6;
    reasons.push("urgent hiring signal");
  }

  if (daysSinceTouch <= 14) {
    score += 10;
    reasons.push("recent partner activity");
  } else if (daysSinceTouch <= 30) {
    score += 6;
  }

  if (recruiter.do_not_contact) {
    score -= 35;
    reasons.push("do not contact");
  }

  if ((recruiter.status ?? "").toUpperCase() === "CLOSED" && openRequestCount === 0) {
    score -= 10;
  }

  return {
    score: clampScore(score),
    scoreReasons: reasons.slice(0, 4),
    workspaceEnabled,
    workspaceUsageCount,
    lastTouchAt: latestTouchMs ? new Date(latestTouchMs).toISOString() : null,
  };
}

export function buildRecruiterPartnerReport({
  recruiters,
  requests,
  activities,
  accountManagers,
}: {
  recruiters: RecruiterPartnerInsightRecruiter[];
  requests: RecruiterPartnerInsightRequest[];
  activities: RecruiterPartnerInsightActivity[];
  accountManagers: Array<{ id: string; name: string | null; email: string }>;
}): RecruiterPartnerReport {
  const requestsByRecruiter = new Map<string, RecruiterPartnerInsightRequest[]>();
  const activitiesByRecruiter = new Map<string, RecruiterPartnerInsightActivity[]>();
  const managerLabelById = new Map(
    accountManagers.map((manager) => [
      manager.id,
      manager.name?.trim() || manager.email,
    ])
  );

  for (const request of requests) {
    const list = requestsByRecruiter.get(request.recruiter_id) ?? [];
    list.push(request);
    requestsByRecruiter.set(request.recruiter_id, list);
  }

  for (const activity of activities) {
    const list = activitiesByRecruiter.get(activity.recruiter_id) ?? [];
    list.push(activity);
    activitiesByRecruiter.set(activity.recruiter_id, list);
  }

  const partnerInsights: RecruiterPartnerInsight[] = recruiters
    .filter((recruiter) => requestsByRecruiter.has(recruiter.id))
    .map((recruiter) => {
      const recruiterRequests = requestsByRecruiter.get(recruiter.id) ?? [];
      const recruiterActivities = activitiesByRecruiter.get(recruiter.id) ?? [];
      const openRequestCount = recruiterRequests.filter(
        (request) => !isClosedStatus(request.status)
      ).length;
      const replyCount = recruiterRequests.filter((request) => Boolean(request.last_inbound_at))
        .length;
      const shortlistSentCount = recruiterRequests.filter(
        (request) => request.status === "candidate_shortlist_sent"
      ).length;
      const activeCount = recruiterRequests.filter(
        (request) => request.status === "active"
      ).length;
      const progressedRequestCount = recruiterRequests.filter((request) =>
        ["candidate_shortlist_sent", "active"].includes(request.status)
      ).length;
      const highUrgencyCount = recruiterRequests.filter((request) =>
        ["urgent", "immediate"].includes(request.hiring_urgency ?? "")
      ).length;
      const clientCompanyCount = new Set(
        recruiterRequests
          .map((request) => request.client_company_name?.trim())
          .filter(Boolean)
      ).size;

      const scored = buildScore({
        recruiter,
        requests: recruiterRequests,
        activities: recruiterActivities,
        openRequestCount,
        replyCount,
        progressedRequestCount,
        shortlistSentCount,
        activeCount,
        highUrgencyCount,
        clientCompanyCount,
      });

      return {
        recruiterId: recruiter.id,
        displayName:
          recruiter.company?.trim() ||
          recruiter.name?.trim() ||
          recruiter.email?.trim() ||
          "Unknown partner",
        companyName:
          recruiter.company?.trim() ||
          recruiter.name?.trim() ||
          recruiter.email?.trim() ||
          "Unknown partner",
        ownerLabel: recruiter.owner_account_manager_id
          ? managerLabelById.get(recruiter.owner_account_manager_id) ?? null
          : null,
        partnerType: recruiter.partner_type,
        requestCount: recruiterRequests.length,
        openRequestCount,
        replyCount,
        progressedRequestCount,
        shortlistSentCount,
        activeCount,
        highUrgencyCount,
        clientCompanyCount,
        workspaceEnabled: scored.workspaceEnabled,
        workspaceUsageCount: scored.workspaceUsageCount,
        lastTouchAt: scored.lastTouchAt,
        score: scored.score,
        scoreTier: getScoreTier(scored.score),
        scoreReasons: scored.scoreReasons,
        repeatPartner: recruiterRequests.length >= 2,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.requestCount !== left.requestCount) return right.requestCount - left.requestCount;
      return right.openRequestCount - left.openRequestCount;
    });

  const totalRequests = requests.length;
  const agencyRequestCount = requests.filter((request) => request.persona_type === "agency").length;
  const progressedRequests = requests.filter((request) =>
    ["candidate_shortlist_sent", "active"].includes(request.status)
  ).length;

  const pipeline: RecruiterPartnerPipelineSummary = {
    newCount: requests.filter((request) => request.status === "new").length,
    reviewingCount: requests.filter((request) => request.status === "reviewing").length,
    qualifiedCount: requests.filter((request) => request.status === "qualified").length,
    awaitingDetailsCount: requests.filter(
      (request) => request.status === "awaiting_details"
    ).length,
    shortlistSentCount: requests.filter(
      (request) => request.status === "candidate_shortlist_sent"
    ).length,
    activeCount: requests.filter((request) => request.status === "active").length,
    closedCount: requests.filter((request) => isClosedStatus(request.status)).length,
  };

  const agencyLeaderboard = partnerInsights
    .filter((insight) => insight.partnerType === "agency")
    .slice(0, 8)
    .map((insight) => ({
      recruiterId: insight.recruiterId,
      displayName: insight.displayName,
      ownerLabel: insight.ownerLabel,
      requestCount: insight.requestCount,
      openRequestCount: insight.openRequestCount,
      clientCompanyCount: insight.clientCompanyCount,
      replyCount: insight.replyCount,
      score: insight.score,
      scoreTier: insight.scoreTier,
    }));

  const totalPartners = partnerInsights.length;
  const strategicPartners = partnerInsights.filter(
    (insight) => insight.scoreTier === "strategic"
  ).length;
  const averageScore = totalPartners
    ? Math.round(
        partnerInsights.reduce((sum, insight) => sum + insight.score, 0) / totalPartners
      )
    : 0;
  const agencyPartners = partnerInsights.filter(
    (insight) => insight.partnerType === "agency"
  ).length;
  const repeatPartners = partnerInsights.filter((insight) => insight.repeatPartner).length;
  const repeatAgencies = partnerInsights.filter(
    (insight) => insight.partnerType === "agency" && insight.repeatPartner
  ).length;
  const workspaceEnabledPartners = partnerInsights.filter(
    (insight) => insight.workspaceEnabled
  ).length;
  const replyingPartners = partnerInsights.filter((insight) => insight.replyCount > 0).length;
  const uniqueAgencyClients = new Set(
    requests
      .filter((request) => request.persona_type === "agency")
      .map((request) => request.client_company_name?.trim())
      .filter(Boolean)
  ).size;

  return {
    metrics: {
      totalPartners,
      repeatPartners,
      agencyPartners,
      repeatAgencies,
      strategicPartners,
      workspaceEnabledPartners,
      replyingPartners,
      progressedRequests,
      totalRequests,
      agencyRequestCount,
      uniqueAgencyClients,
      averageScore,
      replyRatePercent: roundPercent(replyingPartners, totalPartners),
      agencySharePercent: roundPercent(agencyRequestCount, totalRequests),
      progressedRatePercent: roundPercent(progressedRequests, totalRequests),
    },
    pipeline,
    partnerInsights,
    agencyLeaderboard,
  };
}
