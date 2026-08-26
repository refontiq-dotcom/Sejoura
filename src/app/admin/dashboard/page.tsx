"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA } from "@/lib/utils";
import {
  REFONTIQ_PROJECTS,
  REFONTIQ_ROADMAP,
  type RefontiqProject,
} from "@/lib/projects";
import {
  Loader2,
  ShieldCheck,
  LogOut,
  RefreshCw,
  ArrowRight,
  Clock,
  Sparkles,
  Building2,
  LayoutGrid,
  TrendingUp,
} from "lucide-react";
import {
  ADMIN_LOGIN_ROUTE,
} from "@/lib/routes";

// Résolution dynamique de l'icône Lucide depuis le registre des projets.
import {
  BedDouble,
  Stethoscope,
  GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  BedDouble,
  Stethoscope,
  GraduationCap,
};

const POLL_INTERVAL_MS = 30_000;

export default function SuperAdminHubPage() {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [totalTenants, setTotalTenants] = useState(0);
  const [pendingValidations, setPendingValidations] = useState(0);
  const [validatedRevenue, setValidatedRevenue] = useState(0);

  useEffect(() => {
    loadData();
    const id = setInterval(() => loadData(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = ADMIN_LOGIN_ROUTE;
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData || userData.role !== "super_admin") {
        window.location.href = ADMIN_LOGIN_ROUTE;
        return;
      }

      const [{ count: tenantCount }, { count: pendingCount }] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase
          .from("subscription_payment_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      setTotalTenants(tenantCount ?? 0);
      setPendingValidations(pendingCount ?? 0);

      const { data: reqData } = await supabase
        .from("subscription_payment_requests")
        .select("amount, validated_at")
        .eq("status", "validated");
      const revenue = (reqData ?? []).reduce(
        (sum, r) => sum + ((r.amount as number) || 0),
        0
      );
      setValidatedRevenue(revenue);

      setLastUpdated(new Date());
    } catch {
      if (!silent) toast.error("Oups, les données n'ont pas pu se charger... Réessayez 🔄");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // La session est déjà invalide : on redirige quand même.
    }
    window.location.href = ADMIN_LOGIN_ROUTE;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const activeProjects = REFONTIQ_PROJECTS.filter((p) => p.status === "active");
  const comingSoon = REFONTIQ_PROJECTS.filter((p) => p.status === "coming-soon");

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      {/* ── En-tête ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[var(--primary-color,#0C1C33)] flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Console d&apos;administration Refontiq
          </h1>
          <p className="text-sm text-slate-500">
            Pilotez tous les produits Refontiq depuis un seul endroit
            {lastUpdated && (
              <span className="text-xs text-slate-400">
                {" "}
                · mise à jour {lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => loadData(true)} className="shrink-0">
            <RefreshCw className="w-4 h-4" /> Rafraîchir
          </Button>
          <Button size="sm" variant="outline" onClick={handleLogout} className="shrink-0">
            <LogOut className="w-4 h-4" /> Se déconnecter
          </Button>
        </div>
      </div>

      {/* ── Vue d'ensemble produits actifs ───────────────────────────────── */}
      {activeProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
              <p className="text-xs text-slate-400">Entreprises inscrites (Séjoura)</p>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalTenants}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-600" />
              <p className="text-xs text-slate-400">Validations d&apos;abonnement en attente</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{pendingValidations}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <p className="text-xs text-slate-400">Abonnements validés (Séjoura)</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatFCFA(validatedRevenue)}</p>
          </Card>
        </div>
      )}

      {/* ── Grille des projets ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center">
          <LayoutGrid className="w-5 h-5 text-[var(--primary-color,#0C1C33)]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Produits Refontiq</h2>
          <p className="text-xs text-slate-500">Choisissez un produit pour ouvrir sa console</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
        {REFONTIQ_PROJECTS.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {/* ── Projets à venir ─────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {REFONTIQ_ROADMAP[0]?.label ?? "D'autres projets à venir"}
            </p>
            <p className="text-xs text-slate-500">{REFONTIQ_ROADMAP[0]?.hint ?? ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {comingSoon.map((p) => (
            <Badge key={p.id} variant="outline">
              {p.name}
            </Badge>
          ))}
          <Badge variant="outline">…</Badge>
        </div>
      </Card>
    </div>
  );
}

// ─── Carte d'un produit ───────────────────────────────────────────────────────
function ProjectCard({ project }: { project: RefontiqProject }) {
  const Icon = ICON_MAP[project.icon] ?? ShieldCheck;
  const isActive = project.status === "active";

  return (
    <Card
      hover={isActive}
      className={`p-5 flex flex-col ${!isActive ? "opacity-80" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${project.accent}1A`, color: project.accent }}
        >
          <Icon className="w-6 h-6" />
        </div>
        {isActive ? (
          <Badge variant="success">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {project.statusLabel ?? "Actif"}
          </Badge>
        ) : (
          <Badge variant="outline">
            <Clock className="w-3 h-3" /> {project.statusLabel ?? "Bientôt disponible"}
          </Badge>
        )}
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-white">{project.name}</h3>
      <p className="text-xs font-medium text-slate-500 mb-2">{project.tagline}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1 mb-4">
        {project.description}
      </p>

      {isActive && project.href ? (
        <Link
          href={project.href}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-90 transition-opacity"
          style={{ backgroundColor: project.accent }}
        >
          Ouvrir la console <ArrowRight className="w-4 h-4" />
        </Link>
      ) : (
        <div className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 text-xs font-semibold cursor-not-allowed">
          Prochainement
        </div>
      )}
    </Card>
  );
}
