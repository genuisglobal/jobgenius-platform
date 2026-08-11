import {
  listLeaderOfMonthAwards,
  listLeadershipCourseEnrollments,
  listLeadershipEligibilityRecords,
  listLeadershipTrials,
  listMonthlyScorecards,
  listPeopleEmployees,
} from "@/lib/people-server";
import LeadershipClient from "./LeadershipClient";

export const dynamic = "force-dynamic";

export default async function PeopleLeadershipPage() {
  const [employees, eligibilityRecords, courseEnrollments, trials, awards, scorecards] =
    await Promise.all([
      listPeopleEmployees(),
      listLeadershipEligibilityRecords(),
      listLeadershipCourseEnrollments(),
      listLeadershipTrials(),
      listLeaderOfMonthAwards(),
      listMonthlyScorecards(),
    ]);

  return (
    <LeadershipClient
      initialEmployees={employees}
      initialEligibilityRecords={eligibilityRecords}
      initialCourseEnrollments={courseEnrollments}
      initialTrials={trials}
      initialAwards={awards}
      scorecards={scorecards.filter(
        (scorecard) =>
          scorecard.status === "finalized" || scorecard.status === "acknowledged"
      )}
    />
  );
}
