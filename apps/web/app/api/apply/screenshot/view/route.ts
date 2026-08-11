import { NextResponse } from "next/server";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow AMs directly; job seekers can only view their own screenshots
  if (user.userType !== "am" && user.userType !== "job_seeker") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // For job seekers, verify the screenshot belongs to one of their runs
  if (user.userType === "job_seeker") {
    // Extract run_id from path (format: {run_id}/{timestamp}.png)
    const runId = path.split("/")[0];
    if (runId) {
      const { data: run } = await supabaseAdmin
        .from("application_runs")
        .select("id")
        .eq("id", runId)
        .eq("job_seeker_id", user.id)
        .maybeSingle();

      if (!run) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
  }

  const { data, error } = await supabaseAdmin.storage
    .from("runner-screenshots")
    .download(path);

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const arrayBuffer = await data.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
