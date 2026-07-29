"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, formatDate, getPlanLabel } from "@/lib/utils";
import { Shield, Building2, Users, CreditCard, AlertTriangle, Loader2, CheckCircle2, XCircle, MoreHorizontal } from "lucide-react";
import type { Tenant, Subscription } from "@/types/database";

export default function SuperAdminPage() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [suspensionModal, setSuspensionModal] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData || userData.role !== "super_admin") {
        window.location.href = "/login";
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
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const activeTenants = tenants.filter((t) => !t.is_suspended);
  const suspendedTenants = tenants.filter((t) => t.is_suspended);
  const totalRevenue = Object.values(subscriptions).reduce((sum, s) => sum + (s.last_payment_amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Séjoura</h1>
          <p className="text-sm text-slate-500">Supervision des entreprises inscrites</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
          <p className="text-2xl font-bold text-indigo-600">{formatFCFA(totalRevenue)}</p>
          <p className="text-xs text-slate-400">Derniers paiements</p>
        </Card>
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
                      <Badge variant={sub?.plan === "pro" ? "info" : sub?.plan === "enterprise" ? "purple" : "default"}>
                        {getPlanLabel(sub?.plan || "standard")}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {t.is_suspended ? (
                        <Badge variant="error"><XCircle className="w-3 h-3" /> Suspendu</Badge>
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
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <p className="text-sm text-red-700 dark:text-red-300">Cette action désactivera tous les utilisateurs et bloquera l'accès en écriture.</p>
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
