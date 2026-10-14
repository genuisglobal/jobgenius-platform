import { requireJobSeeker } from "@/lib/auth";
import { getDueReviewQueue } from "@/lib/learning/review-queue";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const queue = await getDueReviewQueue(auth.user.id);
    return Response.json(queue);
  } catch {
    return Response.json(
      { error: "Failed to load review queue." },
      { status: 500 }
    );
  }
}
