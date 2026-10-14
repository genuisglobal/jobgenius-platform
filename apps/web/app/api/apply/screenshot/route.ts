import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const runner = request.headers.get("x-runner") ?? "";

  if (!authHeader && !runner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as Blob | null;
  const runId = formData.get("run_id") as string | null;
  const step = formData.get("step") as string | null;
  const reason = formData.get("reason") as string | null;
  const url = formData.get("url") as string | null;

  if (!file || !runId) {
    return NextResponse.json(
      { error: "file and run_id are required" },
      { status: 400 },
    );
  }

  const timestamp = Date.now();
  const screenshotPath = `${runId}/${timestamp}.png`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("runner-screenshots")
    .upload(screenshotPath, buffer, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 },
    );
  }

  const { error: insertError } = await supabaseAdmin
    .from("apply_run_screenshots")
    .insert({
      run_id: runId,
      step: step ?? null,
      reason: reason ?? null,
      url: url ?? null,
      screenshot_path: screenshotPath,
    });

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, path: screenshotPath });
}
