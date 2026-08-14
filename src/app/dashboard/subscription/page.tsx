"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { getPlanPrice, getPlanLabel, formatDate, getSubscriptionStatusLabel } from "@/lib/utils";
import { normalizePlan, getWavePayLink } from "@/lib/subscription-plans";
import { useCurrency } from "@/hooks/use-currency";
import {
  Check,
  Zap,
  Crown,
  Loader2,
  CreditCard,
  AlertCircle,
  Clock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { Subscription } from "@/types/database";

// Icône stylisée de l'application Wave (bloc bleu + W)
function WaveIcon({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-[#1C3AA9] text-white ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17 L8 7 L10.5 14.5 L13 7 L16 17" />
      </svg>
    </span>
  );
}

export default function SubscriptionPage() {
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<1 | 2>(1);
  const [senderPhone, setSenderPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
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

  function openPayment(plan: string) {
    setSenderPhone("");
    setPhoneError("");
    setPaymentStep(1);
    setConfirmPlan(plan);
  }

  function closePayment() {
    setConfirmPlan(null);
    setPaymentStep(1);
    setSenderPhone("");
    setPhoneError("");
  }

  // Soumission du paiement : le statut passe en 'pending' (activation rapide).
  async function handleSubmitPayment() {
    const digitsOnly = senderPhone.replace(/\D/g, "");
    if (!digitsOnly || digitsOnly.length < 8) {
      setPhoneError("Veuillez renseigner le numéro Wave ayant envoyé le paiement.");
      return;
    }

    setNotifying(true);
    try {
      const res = await fetch("/api/subscription/notify-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: confirmPlan, phone: senderPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Impossible de soumettre la demande.");
      }
      if (data.alreadyPending) {
        toast.info("Votre demande de validation est déjà en attente.");
      } else {
        toast.success("Demande envoyée ! L'administrateur va vérifier votre paiement Wave.");
      }
      setPaymentStep(2);
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
      tagline: "Pour bien démarrer",
      price: getPlanPrice("essentiel"),
      icon: Zap,
      iconClasses: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
      features: [
        "1 établissement maximum",
        "10 unités maximum (chambres ou appartements)",
        "2 comptes système max (Admin + Réceptionniste / Ménagère)",
        "Réservations, check-in/out et reçus PDF",
        "Vitrine Trouvetou et Boost Express",
      ],
    },
    {
      key: "entreprise",
      name: "Entreprise",
      tagline: "Pour les établissements qui se développent",
      price: getPlanPrice("entreprise"),
      icon: Crown,
      iconClasses: "bg-purple-100 dark:bg-purple-900/30 text-purple-600",
      features: [
        "Établissements & unités illimités",
        "Comptabilité avancée et bénéfice net réel",
        "Boost Trouvetou et visibilité comparateur",
        "API Séjoura export / webhooks",
        "Rôles sur mesure et support dédié",
      ],
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

  const pendingBadge = (
    <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-3">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
      </span>
      <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
        ⏳ Activation en cours de traitement (Sous 15 minutes)
      </span>
    </div>
  );

  const confirmPrice = getPlanPrice(confirmPlan ?? "");
  const confirmLabel = getPlanLabel(confirmPlan ?? "");
  const waveUrl = getWavePayLink(confirmPlan ?? "");

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Abonnement</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Choisissez votre formule et payez en toute simplicité via Wave</p>
      </div>

      {/* Statut actuel */}
      <Card className={`p-4 border-t-4 border-t-[var(--primary-color,#0C1C33)] ${isExpired ? "border-red-300 dark:border-red-800" : isPending ? "border-amber-300 dark:border-amber-800" : ""}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              currentPlan === "entreprise" ? "bg-purple-100 dark:bg-purple-900/30" :
              "bg-blue-100 dark:bg-blue-900/30"
            }`}>
              {currentPlan === "entreprise" ? <Crown className="w-7 h-7 text-purple-600" /> :
               <Zap className="w-7 h-7 text-blue-600" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Plan {getPlanLabel(currentPlan)}</h2>
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
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <span className="relative flex h-3 w-3 shrink-0 mt-1">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Activation en cours de traitement (Sous 15 minutes)</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {"Votre paiement Wave est en cours de vérification. L'administrateur validera votre abonnement sous peu et vos fonctionnalités seront débloquées automatiquement."}
            </p>
          </div>
        </div>
      )}

      {/* Bannière : abonnement expiré */}
      {isExpired && !isPending && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Abonnement expiré</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {"Votre abonnement a expiré. Réglez votre paiement via Wave ci-dessous puis soumettez-le pour retrouver l'accès complet."}
            </p>
          </div>
        </div>
      )}

      {/* Plans */}
      <div id="plans-section" className="grid grid-cols-1 md:grid-cols-2 gap-6 scroll-mt-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const Icon = plan.icon;
          const isHighlight = plan.key === "entreprise";
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl bg-white dark:bg-slate-800 p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${
                isHighlight
                  ? "border-2 border-purple-600 dark:border-purple-500 shadow-lg shadow-purple-200 dark:shadow-purple-900/30 hover:shadow-purple-300/60"
                  : "border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-slate-300/50"
              }`}
            >
              {isHighlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-purple-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-purple-300">
                  🔥 Le plus populaire
                </div>
              )}

              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{plan.tagline}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${plan.iconClasses}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{fmt(plan.price)}</span>
                <span className="text-sm font-medium text-slate-400 dark:text-slate-500">/mois</span>
              </div>

              {isCurrent && !isExpired && (
                <div className="mt-3">
                  <Badge variant="success"><Check className="w-3 h-3" /> Plan actuel</Badge>
                </div>
              )}

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      isHighlight ? "bg-purple-100 dark:bg-purple-900/40" : "bg-emerald-100 dark:bg-emerald-900/40"
                    }`}>
                      <Check className={`h-3 w-3 ${isHighlight ? "text-purple-600" : "text-emerald-600"}`} />
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>

              {isPending ? (
                pendingBadge
              ) : (
                <Button
                  variant={isHighlight ? "purple" : "primary"}
                  size="lg"
                  className="mt-6 w-full"
                  onClick={() => openPayment(plan.key)}
                >
                  <Smartphone className="w-4 h-4" />
                  Payer via Wave
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Paiement Wave — Confirmation en 2 étapes */}
      <Modal
        open={!!confirmPlan}
        onClose={closePayment}
        title="Paiement Wave sécurisé"
        description={paymentStep === 1 ? "Réglez votre abonnement en 3 étapes rapides" : undefined}
      >
        {paymentStep === 1 ? (
          <div className="space-y-4">
            {/* Étape 1 — Vérification du transfert */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Vérification du transfert</p>
              </div>
              <Input
                label="Numéro de téléphone Wave expéditeur"
                placeholder="+225 07 00 00 00 00"
                value={senderPhone}
                error={phoneError}
                icon={<Smartphone className="h-4 w-4" />}
                onChange={(e) => {
                  setSenderPhone(e.target.value);
                  if (phoneError) setPhoneError("");
                }}
                inputMode="tel"
                autoComplete="tel"
              />
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Le numéro qui a envoyé l&apos;argent est transmis à l&apos;administrateur pour accélérer la validation de votre abonnement.
              </p>
            </div>

            {/* Action principale — étape 1 */}
            <Button
              variant="purple"
              size="lg"
              className="w-full"
              loading={notifying}
              disabled={!confirmPlan}
              onClick={handleSubmitPayment}
            >
              <Sparkles className="w-4 h-4" />
              Soumettre pour activation rapide
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Étape 2 — Récapitulatif plan / montant */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Plan {confirmLabel}</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
                  {fmt(confirmPrice)}
                  <span className="text-sm font-normal text-slate-400 dark:text-slate-500">/mois</span>
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/10">
                <WaveIcon className="h-6 w-6 rounded-lg" />
              </div>
            </div>

            {/* Accès au lien Wave */}
            <div>
              <a
                href={waveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1C3AA9] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition-all hover:bg-[#162C85] hover:shadow-blue-900/30"
              >
                <WaveIcon className="bg-white/15" />
                Payer avec l&apos;application Wave
              </a>
              <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Le lien s&apos;ouvre dans un nouvel onglet. Réglez exactement {fmt(confirmPrice)} sur Wave, puis revenez ici.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
