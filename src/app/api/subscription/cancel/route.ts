import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";

  if (!userId) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Vous devez être connecté." }, { status: 401 });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (userError || !user || user.id !== userId) {
    return NextResponse.json({ error: "Utilisateur non autorisé." }, { status: 403 });
  }

  if (user.role !== "admin_residence") {
    return NextResponse.json({ error: "Accès réservé à l'administrateur de l'établissement." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("request_subscription_cancellation", {
    p_user_id: user.id,
  });

  if (error) {
    const status = error.message.includes("SUBSCRIPTION_NOT_ACTIVE") ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ success: true, subscription: data });
}
