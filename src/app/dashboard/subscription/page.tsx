"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { getPlanPrice, getPlanLabel, formatDate, getPlanLimits, getSubscriptionStatusLabel } from "@/lib/utils";
import { normalizePlan, getWavePayLink } from "@/lib/subscription-plans";
import { useCurrency } from "@/hooks/use-currency";
import { Check, Zap, Crown, Loader2, CreditCard, AlertCircle, Clock, ExternalLink, ShieldCheck } from "lucide-react";
import type { Subscription } from "@/types/database";

export default function SubscriptionPage() {
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [now] = useState(() => Date.now());

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

  useEffect(() => {
    const t = setTimeout(loadData, 0);
    return () => clearTimeout(t);
  }, []);

  // Le gérant déclare son paiement Wave : le statut passe en 'pending'
  // et une notification de validation est envoyée au Super Admin.
  async function handleNotifyPayment(plan: string) {
    setNotifying(true);
    try {
      const res = await fetch("/api/subscription/notify-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Impossible de signaler le paiement.");
      }
      if (data.alreadyPending) {
        toast.info("Votre demande de validation est déjà en attente.");
      } else {
        toast.success("Votre paiement a été signalé. L'administrateur va valider votre abonnement.");
      }
      setConfirmPlan(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion.");
      console.error(err);
    } finally {
      setNotifying(false);
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
        "Vitrine Trouvetou et Boost Express",
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
  const subStatus = subscription?.subscription_status ?? (isLocked ? "expired" : "active");
  const isPending = subStatus === "pending";
  const endDate = subscription?.subscription_end_date ?? subscription?.current_period_end;
  const dateExpired = !!endDate && !isPending && new Date(endDate).getTime() < now;
  const isExpired = subStatus === "expired" || isLocked || dateExpired;

  return (
    <div className="space-y-3 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Abonnement</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gérez votre plan et vos paiements Wave</p>
      </div>

      {/* Statut actuel */}
      <Card className={`p-3 border-t-4 border-t-[var(--primary-color,#0C1C33)] ${isExpired ? "border-red-300 dark:border-red-800" : isPending ? "border-amber-300 dark:border-amber-800" : ""}`}>
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Plan {getPlanLabel(currentPlan)}</h2>
                {isTrial && <Badge variant="info">Essai gratuit</Badge>}
                {isPending && <Badge variant="warning"><Clock className="w-3 h-3" /> {getSubscriptionStatusLabel("pending")}</Badge>}
                {!isPending && isExpired && <Badge variant="error"><AlertCircle className="w-3 h-3" /> {getSubscriptionStatusLabel("expired")}</Badge>}
                {!isPending && !isExpired && <Badge variant="success"><ShieldCheck className="w-3 h-3" /> {getSubscriptionStatusLabel("active")}</Badge>}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {fmt(subscription?.monthly_price || 0)}/mois
                {isTrial && subscription?.trial_ends_at && ` • Essai jusqu'au ${formatDate(subscription.trial_ends_at)}`}
                {endDate && ` • Renouvellement le ${formatDate(endDate)}`}
              </p>
            </div>
          </div>
          {isExpired && !isPending && (
            <Button variant="primary" onClick={() => {
              const target = document.getElementById("plans-section");
              target?.scrollIntoView({ behavior: "smooth" });
            }}>
              <CreditCard className="w-4 h-4" /> Renouveler maintenant
            </Button>
          )}
        </div>
      </Card>

      {/* Bannière : paiement en attente de validation */}
      {isPending && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Validation en attente</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {"Nous avons bien reçu votre notification de paiement. L'administrateur validera votre abonnement sous peu. Vos fonctionnalités seront débloquées automatiquement après validation."}
            </p>
          </div>
        </div>
      )}

      {/* Bannière : abonnement expiré */}
      {isExpired && !isPending && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Abonnement expiré</p>
            <p className="text-xs text-red-600 dark:text-red-400">
              {"Votre abonnement a expiré. Réglez votre paiement via le lien Wave puis notifiez l'administrateur pour retrouver l'accès complet."}
            </p>
          </div>
        </div>
      )}

      {/* Plans */}
      <div id="plans-section" className="grid grid-cols-1 md:grid-cols-2 gap-4 scroll-mt-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const Icon = plan.icon;
          const waveUrl = getWavePayLink(plan.key);
          return (
            <Card
              key={plan.key}
              className={`p-3 relative border-t-4 ${
                plan.color === "blue" ? "border-t-blue-500 dark:border-t-blue-400" :
                "border-t-[var(--primary-color,#0C1C33)]"
              } ${isCurrent ? "border-2 border-[var(--primary-color,#0C1C33)]" : ""} ${plan.key === "entreprise" ? "ring-2 ring-amber-200 dark:ring-amber-800" : ""}`}
            >
              {plan.key === "entreprise" && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="theme">Le plus choisi</Badge>
                </div>
              )}
              {isCurrent && !isExpired && (
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

              <div className="mt-4 space-y-2">
                {/* Lien de paiement Wave (semi-automatisé) */}
                <a
                  href={waveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full h-8 px-3 text-xs font-medium rounded-md bg-[var(--primary-color,#0C1C33)] text-[var(--primary-foreground,#ffffff)] hover:opacity-90 transition-all shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Payer {fmt(plan.price)} via Wave
                </a>
                {/* Confirmation après paiement -> notifie le Super Admin */}
                <Button
                  variant="outline"
                  className="w-full"
                  loading={notifying && confirmPlan === plan.key}
                  disabled={isPending}
                  onClick={() => setConfirmPlan(plan.key)}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isPending ? "Validation en attente" : "J'ai effectué le paiement, notifier l'administrateur"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal de confirmation du paiement */}
      <Modal
        open={!!confirmPlan}
        onClose={() => setConfirmPlan(null)}
        title="Confirmer votre paiement"
        description={`Plan ${getPlanLabel(confirmPlan ?? "")} — ${fmt(getPlanPrice(confirmPlan ?? ""))}/mois`}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--primary-light,#F0F4FF)] border border-[var(--primary-color)]/20">
            <ShieldCheck className="w-5 h-5 text-[var(--primary-color,#0C1C33)] shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Avez-vous bien effectué le paiement de {fmt(getPlanPrice(confirmPlan ?? ""))} sur l&apos;application Wave ?
              Votre abonnement passera en attente de validation et l&apos;administrateur sera notifié.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Plan</span>
              <span className="font-medium text-slate-900 dark:text-white">{getPlanLabel(confirmPlan ?? "")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Montant payé</span>
              <span className="font-bold text-[var(--primary-color,#0C1C33)]">{fmt(getPlanPrice(confirmPlan ?? ""))}</span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmPlan(null)}>Annuler</Button>
            <Button className="flex-1" loading={notifying} onClick={() => confirmPlan && handleNotifyPayment(confirmPlan)}>
              <Check className="w-4 h-4" /> Confirmer le paiement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
