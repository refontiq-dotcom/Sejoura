"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, formatDate, getPlanLabel } from "@/lib/utils";
import { normalizePlan, getPlanPrice } from "@/lib/subscription-plans";
import {
  Shield,
  Building2,
  CreditCard,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Check,
  BadgeCheck,
  History,
  LogOut,
  X,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Ban,
  TrendingUp,
  PieChart as PieChartIcon,
  CalendarClock,
  Phone,
  Lightbulb,
  LayoutGrid,
} from "lucide-react";
import { ADMIN_LOGIN_ROUTE, ADMIN_HUB_ROUTE } from "@/lib/routes";
import type { Tenant, Subscription, SubscriptionPaymentRequest } from "@/types/database";

interface PaymentRequestWithTenant extends SubscriptionPaymentRequest {
  tenants: {
    company_name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    city: string | null;
  } | null;
}

type TenantStatusFilter = "all" | "active" | "suspended" | "locked" | "pending";
type PlanFilter = "all" | "essentiel" | "entreprise";

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 30_000;

// Un abonnement est bloqué si soft-locked ou marqué expiré ou suspendu
function isSubscriptionLocked(sub?: Subscription): boolean {
  if (!sub) return false;
  if (sub.is_soft_locked) return true;
  if (sub.subscription_status === "expired") return true;
  if (sub.status === "suspended") return true;
  return false;
}

// Le montant déclaré correspond-il au tarif attendu pour le plan ?
function isAmountMismatch(req: PaymentRequestWithTenant): boolean {
  const expected = getPlanPrice(req.plan);
  return expected > 0 && req.amount !== expected;
}

export default function SuperAdminPage() {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestWithTenant[]>([]);
  const [validateTarget, setValidateTarget] = useState<PaymentRequestWithTenant | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PaymentRequestWithTenant | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [suspensionModal, setSuspensionModal] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspending, setSuspending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [page, setPage] = useState(1);
  const [pendingIdeasCount, setPendingIdeasCount] = useState(0);

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

      // Établissements : on charge la liste complète pour enrichir les
      // demandes de paiement côté client (le join PostgREST dépend d'une clé
      // étrangère qui peut manquer en base si la migration a été appliquée
      // avant l'ajout de la FK).
      const { data: tData } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (tData) setTenants(tData as unknown as Tenant[]);

      const { data: sData } = await supabase
        .from("subscriptions")
        .select("*");
      if (sData) {
        const map: Record<string, Subscription> = {};
        sData.forEach((s) => { map[s.tenant_id] = s as unknown as Subscription; });
        setSubscriptions(map);
      }

      const { data: reqData } = await supabase
        .from("subscription_payment_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (reqData) {
        const tenantMap = new Map<string, PaymentRequestWithTenant["tenants"]>(
          (tData ?? []).map((t) => {
            const row = t as unknown as Tenant;
            return [
              row.id,
              {
                company_name: row.company_name,
                contact_name: row.contact_name,
                contact_email: row.contact_email,
                contact_phone: row.contact_phone,
                city: row.city,
              },
            ];
          })
        );
        const enriched = (reqData as unknown as SubscriptionPaymentRequest[]).map((r) => ({
          ...r,
          tenants: tenantMap.get(r.tenant_id) ?? null,
        }));
        setPaymentRequests(enriched as unknown as PaymentRequestWithTenant[]);
      }

      // Suggestions en attente de modération (badge de la Boîte à idées)
      const { count: ideasCount } = await supabase
        .from("feature_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "under_review")
        .eq("hidden", false);
      setPendingIdeasCount(ideasCount ?? 0);

      setLastUpdated(new Date());
    } catch {
      if (!silent) toast.error("Impossible de charger les données initiales.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function confirmValidate() {
    if (!validateTarget) return;
    setActioningId(validateTarget.id);
    const toastId = toast.loading("Validation en cours...", { duration: Infinity });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("validate_subscription_payment", {
        p_request_id: validateTarget.id,
      });
      if (error) throw error;
      toast.success("Abonnement activé. Le gérant a été notifié.", { id: toastId });
      setValidateTarget(null);
      await loadData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la validation.";
      toast.error(`Erreur lors de la validation : ${msg}`, { id: toastId });
    } finally {
      setActioningId(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setActioningId(rejectTarget.id);
    const toastId = toast.loading("Rejet en cours...", { duration: Infinity });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("reject_subscription_payment", {
        p_request_id: rejectTarget.id,
      });
      if (error) throw error;
      toast.success("Demande rejetée. Le gérant a été notifié.", { id: toastId });
      setRejectTarget(null);
      await loadData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur lors du rejet.";
      toast.error(`Erreur lors du rejet : ${msg}`, { id: toastId });
    } finally {
      setActioningId(null);
    }
  }

  async function handleSuspend() {
    if (!suspensionModal) return;
    setSuspending(true);
    const toastId = toast.loading("Suspension en cours...", { duration: Infinity });
    try {
      const supabase = createClient();
      const reason = suspendReason.trim() || "Non-paiement";
      const { error } = await supabase.rpc("suspend_tenant", {
        p_tenant_id: suspensionModal,
        p_reason: reason,
      });
      if (error) throw error;
      toast.success("Établissement suspendu (lecture seule).", { id: toastId });
      setSuspensionModal(null);
      setSuspendReason("");
      await loadData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la suspension.";
      toast.error(`Erreur lors de la suspension : ${msg}`, { id: toastId });
    } finally {
      setSuspending(false);
    }
  }

  async function handleReactivate(tenantId: string) {
    const toastId = toast.loading("Réactivation en cours...", { duration: Infinity });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("reactivate_tenant", { p_tenant_id: tenantId });
      if (error) throw error;
      toast.success("Établissement réactivé.", { id: toastId });
      await loadData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la réactivation.";
      toast.error(`Erreur lors de la réactivation : ${msg}`, { id: toastId });
    }
  }

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = ADMIN_LOGIN_ROUTE;
    } catch {
      window.location.href = ADMIN_LOGIN_ROUTE;
    }
  }

  const activeTenants = tenants.filter(
    (t) => !t.is_suspended && !isSubscriptionLocked(subscriptions[t.id])
  );
  const suspendedTenants = tenants.filter((t) => t.is_suspended);
  const totalRevenue = Object.values(subscriptions).reduce((sum, s) => sum + (s.last_payment_amount || 0), 0);
  const pendingRequests = paymentRequests.filter((r) => r.status === "pending");
  const validatedRequests = paymentRequests.filter((r) => r.status === "validated");
  const rejectedRequests = paymentRequests.filter((r) => r.status === "rejected");

  const filteredTenants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tenants.filter((t) => {
      const sub = subscriptions[t.id];
      if (statusFilter === "suspended" && !t.is_suspended) return false;
      if (statusFilter === "active") {
        if (t.is_suspended || isSubscriptionLocked(sub)) return false;
        if (sub?.subscription_status === "pending") return false;
      }
      if (statusFilter === "locked") {
        if (t.is_suspended) return false;
        if (!isSubscriptionLocked(sub)) return false;
      }
      if (statusFilter === "pending") {
        if (t.is_suspended) return false;
        if (sub?.subscription_status !== "pending") return false;
      }
      if (planFilter !== "all" && normalizePlan(sub?.plan) !== planFilter) return false;
      if (q) {
        const haystack = `${t.company_name} ${t.contact_name} ${t.contact_email} ${t.city || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tenants, subscriptions, searchQuery, statusFilter, planFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredTenants.length / PAGE_SIZE));
  const pagedTenants = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTenants.slice(start, start + PAGE_SIZE);
  }, [filteredTenants, page]);

  // Revenus validés mensuels (6 derniers mois)
  const revenueByMonth = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("fr-FR", { month: "short" }), total: 0 });
    }
    const indexByKey = new Map(months.map((m, i) => [m.key, i]));
    validatedRequests.forEach((r) => {
      if (!r.validated_at) return;
      const d = new Date(r.validated_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const idx = indexByKey.get(key);
      if (idx !== undefined) months[idx].total += r.amount || 0;
    });
    return months;
  }, [validatedRequests]);

  // Répartition des plans par établissement
  const planDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    tenants.forEach((t) => {
      const label = getPlanLabel(subscriptions[t.id]?.plan || "free");
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    const colors: Record<string, string> = {
      Gratuit: "#94a3b8",
      Essentiel: "#0ea5e9",
      Entreprise: "#f59e0b",
    };
    return Array.from(counts.entries()).map(([name, value]) => ({
      name,
      value,
      color: colors[name] || "#6366f1",
    }));
  }, [tenants, subscriptions]);

  // Abonnements actifs arrivant à expiration sous 7 jours
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    const limit = now + 7 * 24 * 60 * 60 * 1000;
    return Object.values(subscriptions)
      .filter((s) => s.subscription_end_date && !isSubscriptionLocked(s))
      .filter((s) => {
        const end = new Date(s.subscription_end_date!).getTime();
        return end > now && end <= limit;
      })
      .sort(
        (a, b) =>
          new Date(a.subscription_end_date!).getTime() -
          new Date(b.subscription_end_date!).getTime()
      );
  }, [subscriptions]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[var(--primary-color,#0C1C33)] flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Séjoura by Refontiq</h1>
          <p className="text-sm text-slate-500">
            Supervision des entreprises inscrites
            {lastUpdated && (
              <span className="text-xs text-slate-400"> · mise à jour {lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pendingRequests.length > 0 && (
            <Badge variant="warning" className="text-xs">
              <Clock className="w-3 h-3" /> {pendingRequests.length} validation{pendingRequests.length > 1 ? "s" : ""} en attente
            </Badge>
          )}
          <a
            href={ADMIN_HUB_ROUTE}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors shrink-0"
          >
            <LayoutGrid className="w-4 h-4" /> Tous les projets
          </a>
          <a
            href="/admin/ideas"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary-color,#0C1C33)] text-white text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
          >
            <Lightbulb className="w-4 h-4" /> Boîte à idées
            {pendingIdeasCount > 0 && (
              <span
                title={`${pendingIdeasCount} suggestion${pendingIdeasCount > 1 ? "s" : ""} en attente de modération`}
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold leading-none"
              >
                {pendingIdeasCount}
              </span>
            )}
          </a>
          <Button size="sm" variant="outline" onClick={() => loadData(true)} className="shrink-0">
            <RefreshCw className="w-4 h-4" /> Rafraîchir
          </Button>
          <Button size="sm" variant="outline" onClick={handleLogout} className="shrink-0">
            <LogOut className="w-4 h-4" /> Se déconnecter
          </Button>
        </div>
      </div>

      {/* Alerte visuelle : validations en attente */}
      {pendingRequests.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-6">
          <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {pendingRequests.length} demande{pendingRequests.length > 1 ? "s" : ""} de validation d&apos;abonnement en attente
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Des gérants ont déclaré leur paiement Wave. Validez leurs abonnements pour débloquer leurs fonctionnalités.
            </p>
          </div>
          <a
            href="#validations-en-attente"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" /> Valider maintenant
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{tenants.length}</p>
          <p className="text-xs text-slate-400">Total entreprises</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-green-600">{activeTenants.length}</p>
          <p className="text-xs text-slate-400">Actives</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-red-600">{suspendedTenants.length}</p>
          <p className="text-xs text-slate-400">Suspendues</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-amber-600">{pendingRequests.length}</p>
          <p className="text-xs text-slate-400">Validations en attente</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-[var(--primary-color,#0C1C33)]">{formatFCFA(totalRevenue)}</p>
          <p className="text-xs text-slate-400">Derniers paiements reçus</p>
        </Card>
      </div>

      {/* ── Statistiques ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Revenus validés (6 derniers mois)
            </h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByMonth} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip formatter={(value) => formatFCFA(Number(value))} />
                <Bar dataKey="total" fill="#C2944E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Répartition des plans</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planDistribution} innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                  {planDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 justify-center">
            {planDistribution.map((p) => (
              <div key={p.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name} ({p.value})
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Abonnements arrivant à expiration ───────────────────────────── */}
      {expiringSoon.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Abonnements arrivant à expiration sous 7 jours ({expiringSoon.length})
            </h3>
          </div>
          <div className="grid gap-2">
            {expiringSoon.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/40"
              >
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {tenants.find((t) => t.id === s.tenant_id)?.company_name || "Établissement inconnu"}
                </p>
                <Badge variant="warning">
                  <Clock className="w-3 h-3" /> exp. le {formatDate(s.subscription_end_date!)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Gestion des abonnements / Validations en attente ─────────────── */}
      <div id="validations-en-attente" className="scroll-mt-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Gestion des Abonnements</h2>
            <p className="text-xs text-slate-500">Validations en attente de paiement Wave</p>
          </div>
        </div>

        {/* Validations en attente */}
        <Card className="overflow-hidden mb-6">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Validations en attente</h3>
              <Badge variant="warning">{pendingRequests.length}</Badge>
            </div>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-900 dark:text-white">Aucune validation en attente</p>
              <p className="text-xs text-slate-500 mt-1">Les demandes de paiement déclarées par les gérants apparaîtront ici.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Gérant</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Établissement</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Plan</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Montant payé</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">N° Wave</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Demandé le</th>
                    <th className="text-right p-4 text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pendingRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-amber-50/50 dark:hover:bg-amber-900/10">
                      <td className="p-4">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{req.tenants?.contact_name || "—"}</p>
                        <p className="text-xs text-slate-400">{req.tenants?.contact_email || "—"}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <a href={`tel:${req.tenants?.contact_phone || ""}`} className="hover:text-[var(--primary-color,#0C1C33)]">
                            {req.tenants?.contact_phone || "—"}
                          </a>
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{req.tenants?.company_name || "—"}</p>
                        <p className="text-xs text-slate-400">{req.tenants?.city || "—"}</p>
                      </td>
                      <td className="p-4">
                        <Badge variant={req.plan === "entreprise" || req.plan === "enterprise" ? "theme" : "default"}>
                          {getPlanLabel(req.plan)}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <p className={`text-sm font-semibold ${isAmountMismatch(req) ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>
                          {formatFCFA(req.amount)}
                        </p>
                        {isAmountMismatch(req) && (
                          <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" /> Attendu : {formatFCFA(getPlanPrice(req.plan))}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{req.sender_phone || "—"}</p>
                      </td>
                      <td className="p-4 text-sm text-slate-500">{formatDate(req.created_at)}</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setRejectTarget(req)}>
                            <Ban className="w-4 h-4" /> Rejeter
                          </Button>
                          <Button size="sm" variant="success" onClick={() => setValidateTarget(req)}>
                            <Check className="w-4 h-4" /> Valider
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Historique des paiements validés */}
        {validatedRequests.length > 0 && (
          <Card className="overflow-hidden mb-6">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Historique des paiements validés</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Gérant</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Établissement</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Plan</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Montant</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Validé le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {validatedRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-4">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{req.tenants?.contact_name || "—"}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{req.tenants?.company_name || "—"}</p>
                      </td>
                      <td className="p-4">
                        <Badge variant="success"><BadgeCheck className="w-3 h-3" /> {getPlanLabel(req.plan)}</Badge>
                      </td>
                      <td className="p-4 text-sm font-semibold text-slate-900 dark:text-white">{formatFCFA(req.amount)}</td>
                      <td className="p-4 text-sm text-slate-500">{req.validated_at ? formatDate(req.validated_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Historique des paiements rejetés */}
        {rejectedRequests.length > 0 && (
          <Card className="overflow-hidden mb-6">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <X className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Paiements rejetés</h3>
              <Badge variant="error">{rejectedRequests.length}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Gérant</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Établissement</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Plan</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Montant</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Rejeté le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {rejectedRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-4">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{req.tenants?.contact_name || "—"}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{req.tenants?.company_name || "—"}</p>
                      </td>
                      <td className="p-4">
                        <Badge variant="error"><X className="w-3 h-3" /> {getPlanLabel(req.plan)}</Badge>
                      </td>
                      <td className="p-4 text-sm font-semibold text-slate-900 dark:text-white">{formatFCFA(req.amount)}</td>
                      <td className="p-4 text-sm text-slate-500">{req.validated_at ? formatDate(req.validated_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* ── Gestion des entreprises ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center">
          <Building2 className="w-5 h-5 text-[var(--primary-color,#0C1C33)]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Entreprises inscrites</h2>
          <p className="text-xs text-slate-500">Gestion des comptes établissements</p>
        </div>
      </div>

      {/* Barre d'outils : recherche + filtres */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher par nom, contact, e-mail ou ville…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as TenantStatusFilter); setPage(1); }}
          className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--foreground)] px-2.5 py-1.5 focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actives</option>
          <option value="pending">En attente de validation</option>
          <option value="locked">Abonnement bloqué</option>
          <option value="suspended">Suspendues</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value as PlanFilter); setPage(1); }}
          className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--foreground)] px-2.5 py-1.5 focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
        >
          <option value="all">Tous les plans</option>
          <option value="essentiel">Essentiel</option>
          <option value="entreprise">Entreprise</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Entreprise</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Contact</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Plan</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Statut</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Inscription</th>
                <th className="text-right p-4 text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {pagedTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-sm text-slate-500">
                    Aucun établissement ne correspond à ces critères.
                  </td>
                </tr>
              ) : (
                pagedTenants.map((t) => {
                  const sub = subscriptions[t.id];
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-4">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{t.company_name}</p>
                        <p className="text-xs text-slate-400">{t.city || "—"}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{t.contact_name}</p>
                        <p className="text-xs text-slate-400">{t.contact_email}</p>
                      </td>
                      <td className="p-4">
                        <Badge variant={normalizePlan(sub?.plan) === "entreprise" ? "theme" : "default"}>
                          {getPlanLabel(sub?.plan || "standard")}
                        </Badge>
                      </td>
                      <td className="p-4">
                        {t.is_suspended ? (
                          <Badge variant="error"><XCircle className="w-3 h-3" /> Suspendu</Badge>
                        ) : isSubscriptionLocked(sub) ? (
                          <Badge variant="warning"><Clock className="w-3 h-3" /> Abonnement bloqué</Badge>
                        ) : sub?.subscription_status === "pending" ? (
                          <Badge variant="warning"><Clock className="w-3 h-3" /> En attente de validation</Badge>
                        ) : (
                          <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Actif</Badge>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-500">{formatDate(t.created_at)}</td>
                      <td className="p-4 text-right">
                        {t.is_suspended ? (
                          <Button size="sm" variant="success" onClick={() => handleReactivate(t.id)}>
                            <CheckCircle2 className="w-4 h-4" /> Réactiver
                          </Button>
                        ) : (
                          <Button size="sm" variant="destructive" onClick={() => setSuspensionModal(t.id)}>
                            <AlertTriangle className="w-4 h-4" /> Suspendre
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {filteredTenants.length} établissement{filteredTenants.length > 1 ? "s" : ""}
            {filteredTenants.length > 0 && ` · page ${page}/${pageCount}`}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="w-4 h-4" /> Préc.
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
              Suiv. <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Modal de confirmation de validation */}
      <Modal
        open={!!validateTarget}
        onClose={() => setValidateTarget(null)}
        title="Confirmer la validation"
        description="Cette action active immédiatement l'abonnement de l'établissement"
      >
        {validateTarget && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Établissement</p>
                <p className="font-medium text-slate-900 dark:text-white">{validateTarget.tenants?.company_name || "—"}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Plan</p>
                <p className="font-medium text-slate-900 dark:text-white">{getPlanLabel(validateTarget.plan)}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Montant déclaré</p>
                <p className="font-medium text-slate-900 dark:text-white">{formatFCFA(validateTarget.amount)}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <p className="text-xs text-slate-400">N° Wave</p>
                <p className="font-medium text-slate-900 dark:text-white">{validateTarget.sender_phone || "—"}</p>
              </div>
            </div>
            {isAmountMismatch(validateTarget) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Le montant déclaré ({formatFCFA(validateTarget.amount)}) ne correspond pas au prix du plan {getPlanLabel(validateTarget.plan)} ({formatFCFA(getPlanPrice(validateTarget.plan))}). Vérifiez avant de valider.
                </span>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setValidateTarget(null)}>Annuler</Button>
              <Button variant="success" className="flex-1" loading={actioningId === validateTarget.id} onClick={confirmValidate}>
                <Check className="w-4 h-4" /> Valider l&apos;abonnement
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de confirmation de rejet */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Rejeter la demande"
        description="Le gérant sera notifié et pourra soumettre une nouvelle demande"
      >
        {rejectTarget && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20">
              <Ban className="w-6 h-6 text-red-600 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Rejeter la demande de <strong>{rejectTarget.tenants?.contact_name || "l'établissement"}</strong> ({rejectTarget.tenants?.company_name || "—"}) d&apos;un montant de {formatFCFA(rejectTarget.amount)} ?
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectTarget(null)}>Annuler</Button>
              <Button variant="destructive" className="flex-1" loading={actioningId === rejectTarget.id} onClick={confirmReject}>
                <Ban className="w-4 h-4" /> Rejeter
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de confirmation de suspension */}
      <Modal
        open={!!suspensionModal}
        onClose={() => { setSuspensionModal(null); setSuspendReason(""); }}
        title="Confirmer la suspension"
        description="L'entreprise passera en lecture seule"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <p className="text-sm text-red-700 dark:text-red-300">Cette action désactivera tous les utilisateurs et bloquera l&apos;accès en écriture.</p>
          </div>
          <div>
            <label htmlFor="suspend-reason" className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-1">
              Motif de la suspension
            </label>
            <input
              id="suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Ex. : Non-paiement de l'abonnement"
              className="w-full px-2.5 py-1.5 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--foreground)] text-xs placeholder-[var(--input-placeholder)] focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setSuspensionModal(null); setSuspendReason(""); }}>Annuler</Button>
            <Button variant="destructive" className="flex-1" loading={suspending} onClick={handleSuspend}>
              <XCircle className="w-4 h-4" /> Suspendre
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
