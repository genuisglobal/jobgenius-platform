import { listOnboardingQueue } from "@/lib/people-server";
import OnboardingQueueClient from "./OnboardingQueueClient";

export const dynamic = "force-dynamic";

export default async function PeopleOnboardingQueuePage() {
  const queue = await listOnboardingQueue();

  return <OnboardingQueueClient initialQueue={queue} />;
}
