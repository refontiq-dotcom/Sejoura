import { NextResponse } from 'next/server';
import { schoolyAdminDb } from '@/lib/supabase/schooly-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('users')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Accès réservé au Super Admin.' }, { status: 403 });
    }

    const [schools, students, subscriptions] = await Promise.all([
      schoolyAdminDb.from('schools').select('id', { count: 'exact', head: true }),
      schoolyAdminDb.from('students').select('id', { count: 'exact', head: true }),
      schoolyAdminDb.from('subscriptions').select('id', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      total_schools: schools.count || 0,
      total_students: students.count || 0,
      total_subscriptions: subscriptions.count || 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
