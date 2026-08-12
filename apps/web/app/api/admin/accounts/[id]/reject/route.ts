import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

/**
 * POST /api/admin/accounts/[id]/reject
 * Reject a pending account manager
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    // Get the account to verify it exists
    const { data: am, error: fetchError } = await supabaseAdmin
      .from("account_managers")
      .select("id, email, name, status")
      .eq("id", id)
      .single();

    if (fetchError || !am) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    if (am.status === "rejected") {
      return NextResponse.json(
        { message: "Account is already rejected." },
        { status: 200 }
      );
    }

    // Update status to rejected
    const { data: updatedAm, error: updateError } = await supabaseAdmin
      .from("account_managers")
      .update({ status: "rejected" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      action: "account.reject",
      targetType: "account_manager",
      targetId: id,
      details: { email: updatedAm.email, name: updatedAm.name },
    }).catch((e) => console.error("Audit log failed", e));

    return NextResponse.json({
      id: updatedAm.id,
      email: updatedAm.email,
      name: updatedAm.name,
      status: updatedAm.status,
      message: "Account rejected.",
    });
  } catch (error) {
    console.error("Error rejecting account:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
