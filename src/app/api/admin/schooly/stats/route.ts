import { NextResponse } from "next/server";
import { getSchoolyAdminDb } from "@/lib/supabase/schooly-admin";

export async function GET() {
  try {
    // Création paresseuse : le module ne touche plus l'environnement au build.
    const schoolyAdminDb = getSchoolyAdminDb();

    const [schools, students, subscriptions] = await Promise.all([
      schoolyAdminDb.from("schools").select("id", { count: "exact", head: true }),
      schoolyAdminDb.from("students").select("id", { count: "exact", head: true }),
      schoolyAdminDb.from("subscriptions").select("id", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      total_schools: schools.count || 0,
      total_students: students.count || 0,
      total_subscriptions: subscriptions.count || 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
