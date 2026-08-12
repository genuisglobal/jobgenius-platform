import { buildSimplePdf } from "@/lib/pdf";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

function appendSection(lines: string[], title: string, items: string[] | string) {
  lines.push(title);
  if (Array.isArray(items)) {
    items.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push(items);
  }
  lines.push("");
}

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const prepId = context.params.id;
  if (!prepId) {
    return Response.json(
      { success: false, error: "Missing prep id." },
      { status: 400 }
    );
  }

  const { data: prep, error: prepError } = await supabaseServer
    .from("interview_prep")
    .select(
      "id, job_seeker_id, job_post_id, content, job_posts (title, company), job_seekers (full_name)"
    )
    .eq("id", prepId)
    .single();

  if (prepError || !prep) {
    return Response.json(
      { success: false, error: "Interview prep not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, prep.job_seeker_id);
  if (!access.ok) return access.response;

  const content = prep.content as {
    role_summary?: string;
    company_notes?: string[];
    likely_questions?: string[];
    answer_structure?: string[];
    technical_topics?: string[];
    behavioral_topics?: string[];
    checklist?: string[];
    thirty_sixty_ninety?: string[];
  };

  const jobPost = Array.isArray(prep.job_posts) ? prep.job_posts[0] : prep.job_posts;
  const jobSeeker = Array.isArray(prep.job_seekers) ? prep.job_seekers[0] : prep.job_seekers;

  const lines: string[] = [];
  lines.push("Interview Prep");
  lines.push("");
  if (jobPost?.title || jobPost?.company) {
    lines.push(`Role: ${jobPost?.title ?? "Role"}${jobPost?.company ? ` at ${jobPost.company}` : ""}`);
  }
  if (jobSeeker?.full_name) {
    lines.push(`Job Seeker: ${jobSeeker.full_name}`);
  }
  lines.push("");

  appendSection(lines, "Role Summary", content.role_summary ?? "Summary not available.");
  appendSection(lines, "Company Notes", content.company_notes ?? []);
  appendSection(lines, "Likely Questions", content.likely_questions ?? []);
  appendSection(lines, "Suggested Answer Structure", content.answer_structure ?? []);
  appendSection(lines, "Technical Topics", content.technical_topics ?? []);
  appendSection(lines, "Behavioral Topics", content.behavioral_topics ?? []);
  appendSection(lines, "Checklist", content.checklist ?? []);
  appendSection(lines, "30/60/90 Day Prompts", content.thirty_sixty_ninety ?? []);

  const pdfBuffer = buildSimplePdf(lines);

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"interview-prep-${prep.id}.pdf\"`,
    },
  });
}
