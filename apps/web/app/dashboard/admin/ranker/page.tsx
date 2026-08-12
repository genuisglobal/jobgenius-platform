import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import RankerClient, { type RankerModelRow } from "./RankerClient";

export default async function AdminRankerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const [{ data: modelsRaw }, { count: labelledCount }, { count: totalFeatures }] =
    await Promise.all([
      supabaseAdmin
        .from("ranker_models")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("match_features")
        .select("id", { count: "exact", head: true })
        .not("outcome", "is", null),
      supabaseAdmin
        .from("match_features")
        .select("id", { count: "exact", head: true }),
    ]);

  const models = (modelsRaw ?? []) as RankerModelRow[];

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Learned Ranker</h1>
      <p className="text-sm text-gray-500 mb-6">
        Logistic regression over the heuristic&apos;s 7 component scores.
        Trained offline from <code>match_features</code> × realised outcomes.
        Promotion stages a model as active; <strong>live re-ranking is not yet
        wired</strong> (PR-Y.2 follow-up) — for now the active model is used for
        shadow scoring + the analytics here.
      </p>

      <RankerClient
        initialModels={models}
        labelledCount={labelledCount ?? 0}
        totalFeatures={totalFeatures ?? 0}
      />
    </div>
  );
}
