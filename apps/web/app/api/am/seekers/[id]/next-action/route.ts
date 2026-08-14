import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { suggestNextBestAction } from "@/lib/next-best-action";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const allowed = await hasJobSeekerAccess(auth.user.id, params.id);
  if (!allowed) {
    return NextResponse.json({ error: "Not authorized for this seeker." }, { status: 403 });
  }

  const result = await suggestNextBestAction({
    seekerId: params.id,
    amId: auth.user.id,
  });

  if (!result) {
    return NextResponse.json({ error: "Suggestion failed." }, { status: 500 });
  }

  return NextResponse.json(result);
}
