import {
  listSocialLeadCandidates,
  listSocialLeadElections,
  listSocialLeadEligibilityPool,
  listSocialLeadTerms,
} from "@/lib/people-server";
import SocialLeadsClient from "./SocialLeadsClient";

export const dynamic = "force-dynamic";

export default async function PeopleSocialLeadsPage() {
  const [elections, candidates, terms, eligibilityPool] = await Promise.all([
    listSocialLeadElections(),
    listSocialLeadCandidates(),
    listSocialLeadTerms(),
    listSocialLeadEligibilityPool(),
  ]);

  return (
    <SocialLeadsClient
      initialElections={elections}
      initialCandidates={candidates}
      initialTerms={terms}
      eligibilityPool={eligibilityPool}
    />
  );
}
