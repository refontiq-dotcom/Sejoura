"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, getPlanPrice, getPlanLabel, formatDate, getPlanLimits } from "@/lib/utils";
import { Check, Sparkles, Zap, Crown, Loader2, CreditCard, Waves, Banknote, AlertCircle } from "lucide-react";
import type { Subscription, Tenant } from "@/types/database";

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("wave");

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
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData?.tenant_id) return;

      const { data: tenantData } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", userData.tenant_id)
        .single();
      if (tenantData) setTenant(tenantData as unknown as Tenant);

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setSubscription(subData as unknown as Subscription);
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade() {
    if (!selectedPlan || !subscription) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase
        .from("subscriptions")
        .update({
          plan: selectedPlan,
          monthly_price: getPlanPrice(selectedPlan),
          status: "active",
          is_soft_locked: false,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
          last_payment_at: new Date().toISOString(),
          last_payment_amount: getPlanPrice(selectedPlan),
          payment_method: paymentMethod as "wave" | "pi_spi" | "cash" | "bank" | "other",
        })
        .eq("id", subscription.id);

      setModalOpen(false);
      loadData();
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const plans = [
    {
      key: "standard",
      name: "Standard",
      price: getPlanPrice("standard"),
      icon: Zap,
      color: "blue",
      features: [
        "5 hébergements maximum",
        "1 admin + 1 réceptionniste",
        "Réservations et check-in/out",
        "Comptabilité de base",
        "Support par email",
      ],
      limits: getPlanLimits("standard"),
    },
    {
      key: "pro",
      name: "Pro",
      price: getPlanPrice("pro"),
      icon: Sparkles,
      color: "purple",
      features: [
        "Hébergements illimités",
        "Module ménage inclus",
        "Statistiques avancées",
        "5 admins + 10 réceptionnistes",
        "Passerelles Wave & PI-SPI",
        "Support prioritaire",
      ],
      limits: getPlanLimits("pro"),
    },
    {
      key: "enterprise",
      name: "Enterprise",
      price: getPlanPrice("enterprise"),
      icon: Crown,
      color: "gold",
      features: [
        "Tout le plan Pro",
        "Multi-résidences",
        "Rapports consolidés",
        "Utilisateurs illimités",
        "API WhatsApp Business",
        "Support dédié 24/7",
      ],
      limits: getPlanLimits("enterprise"),
    },
  ];

  const currentPlan = subscription?.plan || "standard";
  const isTrial = subscription?.status === "trial";
  const isLocked = subscription?.is_soft_locked;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Abonnement</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gérez votre plan et vos paiements</p>
      </div>

      {/* Statut actuel */}
      <Card className={`p-6 ${isLocked ? "border-red-300 dark:border-red-800" : ""}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              currentPlan === "standard" ? "bg-blue-100 dark:bg-blue-900/30" :
              currentPlan === "pro" ? "bg-purple-100 dark:bg-purple-900/30" :
              "bg-yellow-100 dark:bg-yellow-900/30"
            }`}>
              {currentPlan === "standard" ? <Zap className="w-7 h-7 text-blue-600" /> :
               currentPlan === "pro" ? <Sparkles className="w-7 h-7 text-purple-600" /> :
               <Crown className="w-7 h-7 text-yellow-600" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Plan {getPlanLabel(currentPlan)}</h2>
                {isTrial && <Badge variant="info">Essai gratuit</Badge>}
                {isLocked && <Badge variant="error"><AlertCircle className="w-3 h-3" /> Suspendu</Badge>}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {formatFCFA(subscription?.monthly_price || 0)}/mois
                {isTrial && subscription?.trial_ends_at && ` • Essai jusqu'au ${formatDate(subscription.trial_ends_at)}`}
              </p>
            </div>
          </div>
          {isLocked && (
            <Button variant="primary" onClick={() => { setSelectedPlan("standard"); setModalOpen(true); }}>
              <CreditCard className="w-4 h-4" /> Payer maintenant
            </Button>
          )}
        </div>
      </Card>

      {/* Bannière soft lock */}
      {isLocked && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Compte en lecture seule</p>
            <p className="text-xs text-red-600 dark:text-red-400">Votre abonnement a expiré. Réglez votre paiement pour retrouver l'accès complet.</p>
          </div>
        </div>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const Icon = plan.icon;
          return (
            <Card
              key={plan.key}
              className={`p-6 relative ${isCurrent ? "border-2 border-indigo-500" : ""} ${plan.key === "pro" ? "ring-2 ring-purple-200 dark:ring-purple-800" : ""}`}
            >
              {plan.key === "pro" && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="purple">Recommandé</Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="success"><Check className="w-3 h-3" /> Plan actuel</Badge>
                </div>
              )}

              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                plan.color === "blue" ? "bg-blue-100 dark:bg-blue-900/30" :
                plan.color === "purple" ? "bg-purple-100 dark:bg-purple-900/30" :
                "bg-yellow-100 dark:bg-yellow-900/30"
              }`}>
                <Icon className={`w-6 h-6 ${
                  plan.color === "blue" ? "text-blue-600" :
                  plan.color === "purple" ? "text-purple-600" :
                  "text-yellow-600"
                }`} />
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                {formatFCFA(plan.price).replace(" FCFA", "")}
                <span className="text-sm font-normal text-slate-400"> FCFA/mois</span>
              </p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>Plan actuel</Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.key === "pro" ? "primary" : "outline"}
                    onClick={() => { setSelectedPlan(plan.key); setModalOpen(true); }}
                  >
                    {isCurrent ? "Plan actuel" : "Choisir " + plan.name}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal paiement */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Paiement de l'abonnement"
        description={`Plan ${getPlanLabel(selectedPlan)} — ${formatFCFA(getPlanPrice(selectedPlan))}/mois`}
      >
        <div className="space-y-4">
          {/* Méthodes de paiement */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Méthode de paiement</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setPaymentMethod("wave")}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  paymentMethod === "wave" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-200 dark:border-slate-600"
                }`}
              >
                <Waves className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-medium">Wave</span>
              </button>
              <button
                onClick={() => setPaymentMethod("pi_spi")}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  paymentMethod === "pi_spi" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-200 dark:border-slate-600"
                }`}
              >
                <Banknote className="w-6 h-6 text-green-600" />
                <span className="text-sm font-medium">PI-SPI</span>
              </button>
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  paymentMethod === "cash" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-200 dark:border-slate-600"
                }`}
              >
                <CreditCard className="w-6 h-6 text-slate-600" />
                <span className="text-sm font-medium">Espèces</span>
              </button>
            </div>
          </div>

          {/* Récapitulatif */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Plan</span>
              <span className="font-medium text-slate-900 dark:text-white">{getPlanLabel(selectedPlan)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Montant mensuel</span>
              <span className="font-medium text-slate-900 dark:text-white">{formatFCFA(getPlanPrice(selectedPlan))}</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between">
              <span className="font-medium text-slate-900 dark:text-white">Total</span>
              <span className="font-bold text-indigo-600">{formatFCFA(getPlanPrice(selectedPlan))}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleUpgrade} loading={loading}>
              <CreditCard className="w-4 h-4" /> Payer {formatFCFA(getPlanPrice(selectedPlan))}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}