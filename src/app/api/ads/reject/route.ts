import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!requestId) {
    return NextResponse.json({ error: "Identifiant de demande manquant." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (!userData || userData.role !== "super_admin") {
    return NextResponse.json({ error: "Accès réservé au Super Admin." }, { status: 403 });
  }

  const { error: rpcError } = await supabase.rpc("reject_advertisement_payment", {
    p_request_id: requestId,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
