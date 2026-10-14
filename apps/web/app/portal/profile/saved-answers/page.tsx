import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

export default async function SavedAnswersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: answers } = await supabaseAdmin
    .from("application_question_answers")
    .select("*")
    .eq("job_seeker_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/portal/profile"
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            &larr; Back to Profile
          </Link>
          <h2 className="text-xl font-semibold text-gray-900 mt-1">
            Saved Application Answers
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            These answers are saved from your conversations with your account
            manager and can be reused for future applications.
          </p>
        </div>
      </div>

      {!answers || answers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No saved answers yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            When you answer application questions from your account manager, you
            can save them here for reuse.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {answers.map((raw: Record<string, unknown>) => {
            const a = raw as { id: string; question: string; answer: string; category: string | null; created_at: string };
            return (
              <div key={a.id} className="bg-white rounded-lg shadow p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {a.category && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 mb-2">
                        {a.category}
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-gray-900">
                      Q: {a.question}
                    </h3>
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                      {a.answer}
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  Saved on {new Date(a.created_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
