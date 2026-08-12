import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

interface Achievement {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
}

function calculateProfileCompletion(profile: Record<string, unknown>): {
  percentage: number;
  sections: Record<string, boolean>;
} {
  const sections: Record<string, boolean> = {
    basic_info: !!(profile.full_name && profile.email),
    phone: !!profile.phone,
    location: !!profile.location,
    address: !!(profile.address_city && profile.address_state),
    linkedin: !!profile.linkedin_url,
    seniority: !!profile.seniority,
    work_type: !!profile.work_type,
    salary: !!(profile.salary_min && profile.salary_max),
    target_titles: Array.isArray(profile.target_titles) && profile.target_titles.length > 0,
    skills: Array.isArray(profile.skills) && profile.skills.length > 0,
    work_history: Array.isArray(profile.work_history) && profile.work_history.length > 0,
    education: Array.isArray(profile.education) && profile.education.length > 0,
  };

  const completed = Object.values(sections).filter(Boolean).length;
  const total = Object.keys(sections).length;
  const percentage = Math.round((completed / total) * 100);

  return { percentage, sections };
}

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Fetch profile
  const { data: profile } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  // Fetch counts for achievements
  const { count: refCount } = await supabaseAdmin
    .from("job_seeker_references")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", auth.user.id);

  const { count: answerCount } = await supabaseAdmin
    .from("job_seeker_answers")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", auth.user.id);

  const { count: docCount } = await supabaseAdmin
    .from("job_seeker_documents")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", auth.user.id)
    .eq("doc_type", "resume");

  const { count: appCount } = await supabaseAdmin
    .from("application_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "COMPLETED");

  const { count: interviewCount } = await supabaseAdmin
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", auth.user.id);

  const { percentage, sections } = calculateProfileCompletion(profile);

  // Calculate achievements
  const achievements: Achievement[] = [
    {
      key: "profile_pioneer",
      label: "Profile Pioneer",
      description: "Complete basic profile info",
      unlocked: !!(profile.full_name && profile.email && profile.phone),
    },
    {
      key: "resume_ready",
      label: "Resume Ready",
      description: "Upload a resume",
      unlocked: (docCount ?? 0) > 0,
    },
    {
      key: "reference_champion",
      label: "Reference Champion",
      description: "Add 3+ references",
      unlocked: (refCount ?? 0) >= 3,
    },
    {
      key: "answer_master",
      label: "Answer Master",
      description: "Answer 5+ common questions",
      unlocked: (answerCount ?? 0) >= 5,
    },
    {
      key: "application_starter",
      label: "Application Starter",
      description: "First application sent",
      unlocked: (appCount ?? 0) > 0,
    },
    {
      key: "interview_pro",
      label: "Interview Pro",
      description: "Land your first interview",
      unlocked: (interviewCount ?? 0) > 0,
    },
    {
      key: "fully_loaded",
      label: "Fully Loaded",
      description: "100% profile completion",
      unlocked: percentage === 100,
    },
  ];

  // Calculate XP
  let xp = 0;
  xp += percentage; // 1 XP per % completion
  xp += (refCount ?? 0) * 10;
  xp += (answerCount ?? 0) * 5;
  xp += (docCount ?? 0) * 20;
  xp += (appCount ?? 0) * 15;
  xp += (interviewCount ?? 0) * 25;
  xp += achievements.filter((a) => a.unlocked).length * 50;

  // Level system
  let level = "Newcomer";
  if (xp >= 500) level = "Career Pro";
  else if (xp >= 250) level = "Job Hunter";
  else if (xp >= 100) level = "Active Seeker";

  // Update profile with latest values
  const { error: progressUpdateError } = await supabaseAdmin
    .from("job_seekers")
    .update({
      profile_completion: percentage,
      xp_points: xp,
      achievements: achievements.filter((a) => a.unlocked).map((a) => a.key),
    })
    .eq("id", auth.user.id);

  if (progressUpdateError) {
    console.error("[portal:progress] failed to update seeker progress:", progressUpdateError);
  }

  return NextResponse.json({
    profile_completion: percentage,
    sections,
    xp_points: xp,
    level,
    achievements,
    stats: {
      references: refCount ?? 0,
      answers: answerCount ?? 0,
      resumes: docCount ?? 0,
      applications: appCount ?? 0,
      interviews: interviewCount ?? 0,
    },
  });
}
