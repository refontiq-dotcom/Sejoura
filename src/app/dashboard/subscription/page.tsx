"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, getPlanPrice, getPlanLabel, formatDate, getPlanLimits } from "@/lib/utils";
import { normalizePlan } from "@/lib/subscription-plans";
import { useCurrency } from "@/hooks/use-currency";
import { Check, Zap, Crown, Loader2, CreditCard, AlertCircle } from "lucide-react";
import type { Subscription, Tenant } from "@/types/database";

export default function SubscriptionPage() {
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");

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
} catch (err) {
       toast.error("Impossible de charger les données. Veuillez réessayer.");
       console.error(err);
     } finally {
       setLoading(false);
     }
   }

   const [paymentStatus, setPaymentStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

   useEffect(() => {
     if (typeof window !== "undefined") {
       const params = new URLSearchParams(window.location.search);
       const status = params.get("payment");
       if (status === "success") {
         setTimeout(() => setPaymentStatus("success"), 0);
       }
       if (status === "error") {
         setTimeout(() => setPaymentStatus("error"), 0);
       }
     }
   }, []);

  async function handleUpgrade() {
    if (!selectedPlan || !subscription) return;
    setLoading(true);
    try {
      if (paymentMethod === "wave") {
        setPaymentStatus("pending");
        const response = await fetch("/api/wave/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan: selectedPlan,
            subscriptionId: subscription.id,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.wave_launch_url) {
          throw new Error(data?.error || "Impossible de créer la session de paiement Wave.");
        }

        window.location.href = data.wave_launch_url;
        return;
      }

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
    } catch (err) {
      toast.error("Impossible de mettre à niveau l'abonnement.");
      console.error(err);
      setPaymentStatus("error");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const plans = [
    {
      key: "essentiel",
      name: "Essentiel",
      price: getPlanPrice("essentiel"),
      icon: Zap,
      color: "blue",
      features: [
        "1 établissement maximum",
        "10 unités maximum (chambres ou appartements)",
        "2 comptes système max (Admin + Réceptionniste / Ménagère)",
        "Réservations, check-in/out et reçus PDF",
        "Pas de compta avancée ni API externe",
      ],
      limits: getPlanLimits("essentiel"),
    },
    {
      key: "entreprise",
      name: "Entreprise",
      price: getPlanPrice("entreprise"),
      icon: Crown,
      color: "gold",
      features: [
        "Établissements & unités illimités",
        "Comptabilité avancée et bénéfice net réel",
        "Boost Trouvetou et visibilité comparateur",
        "API Séjoura export / webhooks",
        "Rôles sur mesure et support dédié",
      ],
      limits: getPlanLimits("entreprise"),
    },
  ];

  const currentPlan = normalizePlan(subscription?.plan ?? "essentiel");
  const isTrial = subscription?.status === "trial";
  const isLocked = subscription?.is_soft_locked;

  return (
    <div className="space-y-3 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Abonnement</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">Gérez votre plan et vos paiements</p>
      </div>

      {/* Statut actuel */}
      <Card className={`p-3 border-t-4 border-t-[var(--primary-color,#0C1C33)] ${isLocked ? "border-red-300 dark:border-red-800" : ""}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              currentPlan === "entreprise" ? "bg-yellow-100 dark:bg-yellow-900/30" :
              "bg-blue-100 dark:bg-blue-900/30"
            }`}>
              {currentPlan === "entreprise" ? <Crown className="w-7 h-7 text-yellow-600" /> :
               <Zap className="w-7 h-7 text-blue-600" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Plan {getPlanLabel(currentPlan)}</h2>
                {isTrial && <Badge variant="info">Essai gratuit</Badge>}
                {isLocked && <Badge variant="error"><AlertCircle className="w-3 h-3" /> Suspendu</Badge>}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
                 {fmt(subscription?.monthly_price || 0)}/mois
                {isTrial && subscription?.trial_ends_at && ` • Essai jusqu'au ${formatDate(subscription.trial_ends_at)}`}
              </p>
            </div>
          </div>
          {isLocked && (
            <Button variant="primary" onClick={() => { setSelectedPlan(currentPlan); setModalOpen(true); }}>
              <CreditCard className="w-4 h-4" /> Payer maintenant
            </Button>
          )}
        </div>
      </Card>

      {/* Bannière soft lock */}
      {isLocked && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Compte en lecture seule</p>
            <p className="text-xs text-red-600 dark:text-red-400">{"Votre abonnement a expiré. Réglez votre paiement pour retrouver l'accès complet."}</p>
          </div>
        </div>
      )}

      {paymentStatus === "pending" && (
        <Card className="p-3 border-l-4 border-l-[var(--primary-color,#0C1C33)] bg-[var(--primary-light,#F0F4FF)]">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--primary-color,#0C1C33)]" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">En attente de confirmation</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Votre paiement Wave est en cours. Ne quittez pas cette page tant que Wave ne vous redirige pas.</p>
            </div>
          </div>
        </Card>
      )}

      {paymentStatus === "success" && (
        <Card className="p-3 border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-900/20">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Paiement Wave confirmé</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Votre abonnement a été activé après confirmation du paiement.</p>
            </div>
          </div>
        </Card>
      )}

      {paymentStatus === "error" && (
        <Card className="p-3 border-l-4 border-l-rose-500 bg-rose-50 dark:bg-rose-900/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Erreur de paiement</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">La création de la session Wave a échoué. Vérifiez votre connexion et réessayez.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const Icon = plan.icon;
          return (
            <Card
              key={plan.key}
              className={`p-3 relative border-t-4 ${
                plan.color === "blue" ? "border-t-blue-500 dark:border-t-blue-400" :
                "border-t-[var(--primary-color,#0C1C33)]"
              } ${isCurrent ? "border-2 border-[var(--primary-color,#0C1C33)]" : ""} ${plan.key === "enterprise" ? "ring-2 ring-amber-200 dark:ring-amber-800" : ""}`}
            >
              {plan.key === "enterprise" && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="theme">Le plus choisi</Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="success"><Check className="w-3 h-3" /> Plan actuel</Badge>
                </div>
              )}

              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                plan.color === "blue" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-[var(--primary-light,#F0F4FF)]"
              }`}>
                <Icon className={`w-6 h-6 ${
                  plan.color === "blue" ? "text-blue-600" : "text-[var(--primary-color,#0C1C33)]"
                }`} />
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                {fmt(plan.price)}
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">/mois</span>
              </p>

              <ul className="mt-4 space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>Plan actuel</Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.key === "enterprise" ? "primary" : "outline"}
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
        description={`Plan ${getPlanLabel(selectedPlan)} — ${fmt(getPlanPrice(selectedPlan))}/mois`}
      >
        <div className="space-y-3">
          {/* Méthodes de paiement */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Méthode de paiement</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod("wave")}
                className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  paymentMethod === "wave" ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-light,#F0F4FF)]" : "border-slate-200 dark:border-slate-600"
                }`}
              >
                <svg viewBox="0 0 48 48" className="w-8 h-8" role="img" aria-label="Wave">
                  <circle cx="24" cy="24" r="24" fill="#1DC9FF"/>
                  <text x="24" y="29" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="Arial, sans-serif">Wave</text>
                </svg>
                <span className="text-sm font-medium">Wave</span>
              </button>
              <button
                onClick={() => setPaymentMethod("pi_spi")}
                className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  paymentMethod === "pi_spi" ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-light,#F0F4FF)]" : "border-slate-200 dark:border-slate-600"
                }`}
              >
                <svg viewBox="0 0 48 48" className="w-8 h-8" role="img" aria-label="PI-SPI">
                  <rect width="48" height="48" rx="10" fill="#0066B3"/>
                  <text x="24" y="29" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="Arial, sans-serif">PI-SPI</text>
                </svg>
                <span className="text-sm font-medium">PI-SPI</span>
              </button>
            </div>
          </div>

          {/* Récapitulatif */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Plan</span>
              <span className="font-medium text-slate-900 dark:text-white">{getPlanLabel(selectedPlan)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Montant mensuel</span>
              <span className="font-medium text-slate-900 dark:text-white">{fmt(getPlanPrice(selectedPlan))}</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between">
              <span className="font-medium text-slate-900 dark:text-white">Total</span>
              <span className="font-bold text-[var(--primary-color,#0C1C33)]">{fmt(getPlanPrice(selectedPlan))}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleUpgrade} loading={loading} disabled={!paymentMethod}>
              <CreditCard className="w-4 h-4" /> Payer {fmt(getPlanPrice(selectedPlan))}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}