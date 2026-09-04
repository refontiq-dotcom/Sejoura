import { NextResponse } from 'next/server';
import { schoolyAdminDb } from '@/lib/supabase/schooly-admin';

export async function GET() {
  try {
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
