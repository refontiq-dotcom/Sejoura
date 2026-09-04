"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeletons";
import { GraduationCap, School, Users, CreditCard, AlertCircle } from "lucide-react";

interface SchoolyStats {
  total_schools: number;
  total_students: number;
  total_subscriptions: number;
}

export function SchoolyStatsCard() {
  const [stats, setStats] = useState<SchoolyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/admin/schooly/stats");
        if (!res.ok) throw new Error(`Erreur API (${res.status})`);
        const data: SchoolyStats = await res.json();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#7C3AED1A", color: "#7C3AED" }}>
            <GraduationCap className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Schooly</p>
        </div>
        <div className="flex items-center gap-2 text-red-500 text-xs font-medium">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#7C3AED1A", color: "#7C3AED" }}>
          <GraduationCap className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Schooly</h2>
          <p className="text-xs text-slate-500">Statistiques de la plateforme éducative</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Établissements */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <School className="w-4 h-4 text-violet-600" />
            <p className="text-xs text-slate-400">Établissements inscrits</p>
          </div>
          {loading ? (
            <Skeleton className="w-24 h-8 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.total_schools ?? 0}</p>
          )}
        </Card>

        {/* Élèves */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-violet-600" />
            <p className="text-xs text-slate-400">Élèves gérés</p>
          </div>
          {loading ? (
            <Skeleton className="w-24 h-8 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.total_students ?? 0}</p>
          )}
        </Card>

        {/* Abonnements */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-violet-600" />
            <p className="text-xs text-slate-400">Abonnements actifs</p>
          </div>
          {loading ? (
            <Skeleton className="w-24 h-8 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.total_subscriptions ?? 0}</p>
          )}
        </Card>
      </div>
    </div>
  );
}