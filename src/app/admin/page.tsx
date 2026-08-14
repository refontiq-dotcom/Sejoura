"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, formatDate, getPlanLabel } from "@/lib/utils";
import { normalizePlan } from "@/lib/subscription-plans";
import { Shield, Building2, CreditCard, AlertTriangle, Loader2, CheckCircle2, XCircle, Clock, Check, BadgeCheck, History, LogOut, X } from "lucide-react";
import { LOGIN_ROUTE } from "@/lib/routes";
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

export default function SuperAdminPage() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestWithTenant[]>([]);
  const [suspensionModal, setSuspensionModal] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = LOGIN_ROUTE;
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData || userData.role !== "super_admin") {
        window.location.href = LOGIN_ROUTE;
        return;
      }

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
        .select("*, tenants(company_name, contact_name, contact_email, contact_phone, city)")
        .order("created_at", { ascending: false });
      if (reqData) setPaymentRequests(reqData as unknown as PaymentRequestWithTenant[]);
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate(requestId: string) {
    setValidatingId(requestId);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("validate_subscription_payment", {
        p_request_id: requestId,
      });
      if (error) {
        throw error;
      }
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setValidatingId(null);
    }
  }

  async function handleSuspend(tenantId: string) {
    try {
      const supabase = createClient();
      await supabase.rpc("suspend_tenant", { p_tenant_id: tenantId, p_reason: "Non-paiement" });
      setSuspensionModal(null);
      loadData();
    } catch {
      // Erreur silencieuse
    }
  }

  async function handleReactivate(tenantId: string) {
    try {
      const supabase = createClient();
      await supabase.rpc("reactivate_tenant", { p_tenant_id: tenantId });
      loadData();
    } catch {
      // Erreur silencieuse
    }
  }

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = LOGIN_ROUTE;
    } catch {
      window.location.href = LOGIN_ROUTE;
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  // Un abonnement est bloqué si soft-locked ou marqué expiré ou suspendu
  function isSubscriptionLocked(sub?: Subscription): boolean {
    if (!sub) return false;
    if (sub.is_soft_locked) return true;
    if (sub.subscription_status === "expired") return true;
    if (sub.status === "suspended") return true;
    return false;
  }

  const activeTenants = tenants.filter(
    (t) => !t.is_suspended && !isSubscriptionLocked(subscriptions[t.id])
  );
  const suspendedTenants = tenants.filter((t) => t.is_suspended);
  const totalRevenue = Object.values(subscriptions).reduce((sum, s) => sum + (s.last_payment_amount || 0), 0);
  const pendingRequests = paymentRequests.filter((r) => r.status === "pending");
  const validatedRequests = paymentRequests.filter((r) => r.status === "validated");
  const rejectedRequests = paymentRequests.filter((r) => r.status === "rejected");

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[var(--primary-color,#0C1C33)] flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Séjoura by Refontiq</h1>
          <p className="text-sm text-slate-500">Supervision des entreprises inscrites</p>
        </div>
        {pendingRequests.length > 0 && (
          <Badge variant="warning" className="ml-auto text-xs">
            <Clock className="w-3 h-3" /> {pendingRequests.length} validation{pendingRequests.length > 1 ? "s" : ""} en attente
          </Badge>
        )}
        <Button size="sm" variant="outline" onClick={handleLogout} className="ml-2 shrink-0">
          <LogOut className="w-4 h-4" /> Se déconnecter
        </Button>
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
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatFCFA(req.amount)}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{req.sender_phone || "—"}</p>
                      </td>
                      <td className="p-4 text-sm text-slate-500">{formatDate(req.created_at)}</td>
                      <td className="p-4 text-right">
                        <Button
                          size="sm"
                          variant="success"
                          loading={validatingId === req.id}
                          onClick={() => handleValidate(req.id)}
                        >
                          <Check className="w-4 h-4" /> Valider l&apos;abonnement
                        </Button>
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
              {tenants.map((t) => {
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
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!suspensionModal}
        onClose={() => setSuspensionModal(null)}
        title="Confirmer la suspension"
        description="L'entreprise passera en lecture seule"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <p className="text-sm text-red-700 dark:text-red-300">Cette action désactivera tous les utilisateurs et bloquera l&apos;accès en écriture.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setSuspensionModal(null)}>Annuler</Button>
            <Button variant="destructive" className="flex-1" onClick={() => handleSuspend(suspensionModal!)}>
              <XCircle className="w-4 h-4" /> Suspendre
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
