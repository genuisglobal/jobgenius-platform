import { getSocialFundSummary, listPeopleEmployees } from "@/lib/people-server";
import SocialFundClient from "./SocialFundClient";

export const dynamic = "force-dynamic";

export default async function SocialFundPage() {
  const [employees, summary] = await Promise.all([
    listPeopleEmployees(),
    getSocialFundSummary(),
  ]);

  return <SocialFundClient employees={employees} initialSummary={summary} />;
}
