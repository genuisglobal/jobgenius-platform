import {
  listLeadershipEligibilityRecords,
  listMonthlyScorecards,
  listPeopleEmployees,
  listScorecardCategories,
} from "@/lib/people-server";
import ScorecardsClient from "./ScorecardsClient";

export const dynamic = "force-dynamic";

export default async function PeopleScorecardsPage() {
  const [employees, categories, scorecards, leadershipRecords] = await Promise.all([
    listPeopleEmployees(),
    listScorecardCategories(),
    listMonthlyScorecards(),
    listLeadershipEligibilityRecords(),
  ]);

  return (
    <ScorecardsClient
      initialEmployees={employees}
      categories={categories}
      initialScorecards={scorecards}
      initialLeadershipRecords={leadershipRecords}
    />
  );
}
