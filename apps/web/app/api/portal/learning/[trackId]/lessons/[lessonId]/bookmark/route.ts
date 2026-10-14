import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { trackId: string; lessonId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify lesson belongs to seeker's published track
  const { data: track } = await supabaseAdmin
    .from("learning_tracks")
    .select("id")
    .eq("id", params.trackId)
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published")
    .single();

  if (!track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  let body: { note?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine for toggle
  }

  // Check if bookmark exists (toggle)
  const { data: existing } = await supabaseAdmin
    .from("learning_bookmarks")
    .select("id")
    .eq("job_seeker_id", auth.user.id)
    .eq("lesson_id", params.lessonId)
    .maybeSingle();

  if (existing) {
    // Remove bookmark
    const { error: deleteError } = await supabaseAdmin
      .from("learning_bookmarks")
      .delete()
      .eq("id", existing.id);

    if (deleteError) {
      console.error("[portal:learning] failed to remove bookmark:", deleteError);
    }

    return Response.json({ bookmarked: false });
  }

  // Create bookmark
  const { error } = await supabaseAdmin
    .from("learning_bookmarks")
    .insert({
      job_seeker_id: auth.user.id,
      lesson_id: params.lessonId,
      note: body.note ?? null,
    });

  if (error) {
    return Response.json({ error: "Failed to create bookmark." }, { status: 500 });
  }

  return Response.json({ bookmarked: true }, { status: 201 });
}
