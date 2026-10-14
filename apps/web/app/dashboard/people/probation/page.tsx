import { listProbationSummaries } from "@/lib/people-server";
import ProbationClient from "./ProbationClient";

export const dynamic = "force-dynamic";

export default async function PeopleProbationPage() {
  const summaries = await listProbationSummaries();

  return <ProbationClient initialSummaries={summaries} />;
}
