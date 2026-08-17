"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import {
  Store,
  Sparkles,
  Eye,
  MessageSquare,
  Building2,
  Check,
  X,
  Edit3,
  Globe,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Loader2,
  Clock,
  Timer,
  AlertCircle,
  ChevronRight,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/use-currency";

// ─── Types locaux ──────────────────────────────────────────────────────────────

interface RoomTypeListing {
  id: string;
  name: string;
  description: string | null;
  accommodation_id: string;
  accommodation_name: string;
  base_price: number;
  capacity: number;
  amenities: string[];
  surface_m2: number | null;
  featured_images: string[];
  is_listed_on_trouvetou: boolean;
  room_count: number;
  available_room_count: number;
  is_effectively_listed: boolean;
}

interface Accommodation {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string;
  currency: string;
  currency_symbol: string;
  contact_phone: string | null;
  // Legacy boost
  is_boosted: boolean;
  boost_expires_at: string | null;
  // Nouveau paradigme
  is_permanently_boosted: boolean;
  is_express_boost_active: boolean;
  boost_express_expires_at: string | null;
  boost_express_price_paid: number;
  is_boost_active: boolean;
  boost_priority: number;
}

// ─── Options Boost Express ─────────────────────────────────────────────────────
const EXPRESS_BOOST_OPTIONS = [
  { days: 3,  priceFcfa: 5_000,  label: "3 jours",   popular: true  },
  { days: 7,  priceFcfa: 10_000, label: "7 jours",   popular: false },
  { days: 14, priceFcfa: 18_000, label: "14 jours",  popular: false },
];

// ─── Utilitaires ───────────────────────────────────────────────────────────────

function formatExpiry(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function getRemainingDays(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant : Modal Boost Express
// ─────────────────────────────────────────────────────────────────────────────
interface BoostExpressModalProps {
  accommodation: Accommodation;
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function BoostExpressModal({ accommodation, tenantId, onClose, onSuccess }: BoostExpressModalProps) {
  const [selectedDays, setSelectedDays] = useState(3);
  const [loading, setLoading] = useState(false);
  const { fmt } = useCurrency();
  const selectedOption = EXPRESS_BOOST_OPTIONS.find((o) => o.days === selectedDays)!;

  // Fermeture avec la touche Échap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleActivate() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/essentiel/boost-express", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          accommodationId: accommodation.id,
          durationDays: selectedDays,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "⚡ Boost Express activé !");
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || "Impossible d'activer le Boost Express");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Activer le Boost Express"
    >
      <div className="bg-[var(--card-bg,var(--surface))] w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Zap className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Activer le Boost Express</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{accommodation.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="p-3 space-y-4">
          {/* Info boost actif */}
          {accommodation.is_express_boost_active && accommodation.boost_express_expires_at && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-sm">
              <Timer className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">Boost déjà actif</p>
                <p className="text-amber-700/80 dark:text-amber-400/80 text-xs mt-0.5">
                  Expire le {formatExpiry(accommodation.boost_express_expires_at)} ({getRemainingDays(accommodation.boost_express_expires_at)} jours restants).
                  Une nouvelle activation prolongera ce délai.
                </p>
              </div>
            </div>
          )}

          {/* Sélection de durée */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Choisissez la durée</p>
            <div className="grid grid-cols-3 gap-3">
              {EXPRESS_BOOST_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => setSelectedDays(opt.days)}
                  className={`relative flex flex-col items-center p-3.5 rounded-xl border-2 transition-all text-center ${
                    selectedDays === opt.days
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {opt.popular && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full whitespace-nowrap">
                      Populaire
                    </span>
                  )}
                  <span className="text-lg font-black">{opt.days}j</span>
                   <span className="text-xs font-semibold mt-0.5">{fmt(opt.priceFcfa)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Récapitulatif */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400 dark:text-slate-500">Durée</span>
              <span className="font-bold text-slate-900 dark:text-white">{selectedOption.label}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400 dark:text-slate-500">Montant</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{fmt(selectedOption.priceFcfa)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400 dark:text-slate-500">Visibilité</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">⚡ En tête des résultats</span>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              Le Boost Express propulse votre établissement en tête de liste sur Trouvetou pendant la durée choisie.
              Paiement simulé — la validation de paiement Wave/OM sera intégrée prochainement.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleActivate}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            Activer {accommodation.is_express_boost_active ? "& Prolonger" : "le Boost Express"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant : Badge de statut visibilité (header)
// Affiché hors rendu pour éviter sa recréation à chaque rendu parent.
// Reflète l'état RÉEL des boosts (pas seulement le plan).
// ─────────────────────────────────────────────────────────────────────────────
interface HeaderVisibilityBadgeProps {
  isEnterprisePlan: boolean;
  isEssentielPlan: boolean;
  anyExpressActive: boolean;
  anyPermanentBoost: boolean;
}

function HeaderVisibilityBadge({
  isEnterprisePlan,
  isEssentielPlan,
  anyExpressActive,
  anyPermanentBoost,
}: HeaderVisibilityBadgeProps) {
  if (isEnterprisePlan && anyPermanentBoost) {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/40 text-amber-200">
        <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
        <div>
          <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Statut Visibilité</p>
          <p className="text-sm font-bold text-white">⭐ Boosté - À la Une</p>
        </div>
      </div>
    );
  }
  if (isEssentielPlan && anyExpressActive) {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/40 text-amber-200">
        <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
        <div>
          <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Statut Visibilité</p>
          <p className="text-sm font-bold text-white">⚡ Boost Express Actif</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-slate-200">
      <Globe className="w-5 h-5 text-blue-400" />
      <div>
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Statut Visibilité</p>
        <p className="text-sm font-bold text-white">Positionnement Standard</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────────────────────
export default function TrouvetouDashboardPage() {
  const { fmt } = useCurrency();
  const [loading, setLoading]           = useState(true);
  const [savingTypeId, setSavingTypeId] = useState<string | null>(null);
  const [plan, setPlan]                 = useState<string>("standard");
  const [isEnterprisePlan, setIsEnterprisePlan] = useState<boolean>(false);
  const [isEssentielPlan, setIsEssentielPlan]   = useState<boolean>(false);
  const [tenantId, setTenantId]         = useState<string>("");
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [types, setTypes]               = useState<RoomTypeListing[]>([]);
  const [metrics, setMetrics]           = useState({ totalViews: 0, totalWhatsappClicks: 0 });

  // Modal Boost Express
  const [boostExpressTarget, setBoostExpressTarget] = useState<Accommodation | null>(null);
  const [boostExpressModalOpen, setBoostExpressModalOpen] = useState(false);

  // Toggle Boost Entreprise (par établissement)
  const [boostSavingId, setBoostSavingId] = useState<string | null>(null);

  // État d'erreur de chargement (avec bouton Réessayer)
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function getAccessToken(): Promise<string | null> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function fetchData() {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoadError("Session expirée. Reconnectez-vous pour accéder à votre vitrine.");
        return;
      }

      const { data: user } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!user?.tenant_id) {
        setLoadError("Aucun établissement associé à votre compte.");
        return;
      }
      setTenantId(user.tenant_id);

      const res = await fetch(`/api/v1/trouvetou/listings?tenantId=${user.tenant_id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setPlan(data.plan);
        setIsEnterprisePlan(data.isEnterprisePlan);
        setIsEssentielPlan(data.isEssentielPlan);
        setAccommodations(data.accommodations || []);
        setTypes(data.types || []);
        setMetrics(data.metrics || { totalViews: 0, totalWhatsappClicks: 0 });
      } else {
        setLoadError(data.error || "Erreur de chargement de la vitrine Trouvetou");
      }
    } catch (err) {
      console.error(err);
      setLoadError("Impossible de charger les données. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleListed(type: RoomTypeListing) {
    setSavingTypeId(type.id);
    const newListed = !type.is_listed_on_trouvetou;
    try {
      if (newListed && type.featured_images.length === 0) {
        toast.error("Ajoutez au moins une photo au type de chambre pour publier sur Trouvetou (section Établissements).");
        return;
      }
      const res = await fetch("/api/v1/trouvetou/sync-type", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          roomTypeId: type.id,
          is_listed_on_trouvetou: newListed,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          newListed
            ? `Le type « ${type.name} » est désormais publié sur Trouvetou !`
            : `Le type « ${type.name} » a été masqué sur Trouvetou.`
        );
        if (data.trouvetouPush && data.trouvetouPush.ok === false) {
          toast.error(data.trouvetouPush.error || "Fiche enregistrée mais le push Trouvetou a échoué.");
        }
        fetchData();
      } else {
        toast.error(data.error || "Erreur de mise à jour");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setSavingTypeId(null);
    }
  }

  // ── Boost Permanent (ENTREPRISE) ────────────────────────────────────────────
  async function handleTogglePermanentBoost(acc: Accommodation) {
    if (!isEnterprisePlan) {
      toast.error("Le Boost Permanent est réservé à la formule Entreprise");
      return;
    }
    setBoostSavingId(acc.id);
    const newBoost = !acc.is_permanently_boosted;
    try {
      const res = await fetch("/api/v1/enterprise/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          accommodationId: acc.id,
          boost: newBoost,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || (newBoost ? "⭐ Boost Permanent activé !" : "Boost désactivé."));
        fetchData();
      } else {
        toast.error(data.error || "Impossible de changer le statut Boost");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setBoostSavingId(null);
    }
  }

  // ─── Dérivations ─────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{loadError}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Chargement de votre Vitrine Trouvetou...</p>
      </div>
    );
  }

  const publishedCount = types.filter((t) => t.is_effectively_listed).length;
  const anyExpressActive = accommodations.some((a) => a.is_express_boost_active);
  const anyPermanentBoost = accommodations.some((a) => a.is_permanently_boosted);

  return (
    <div className="space-y-8 pb-12">
      {/* ── Header Banner ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl bg-[var(--primary-color,#0C1C33)] p-3 md:p-5 text-white shadow-xl">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-blue-500/20 backdrop-blur-md border border-blue-400/30 text-blue-300">
                <Store className="w-6 h-6" />
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Ma Vitrine Trouvetou
              </h1>
            </div>
            <p className="text-slate-300 max-w-2xl text-sm md:text-base">
              Synchronisation instantanée sans aucune double saisie. Vos disponibilités et tarifs Séjoura
              sont mis à jour en temps réel sur le portail public Trouvetou.
            </p>
            {/* Badge de plan */}
            <div className="flex items-center gap-2 pt-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                isEnterprisePlan
                  ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                  : isEssentielPlan
                  ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                  : "bg-white/10 border-white/20 text-slate-300"
              }`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                Formule {plan.charAt(0).toUpperCase() + plan.slice(1)}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <HeaderVisibilityBadge
              isEnterprisePlan={isEnterprisePlan}
              isEssentielPlan={isEssentielPlan}
              anyExpressActive={anyExpressActive}
              anyPermanentBoost={anyPermanentBoost}
            />
          </div>
        </div>
      </div>

      {/* ── Statistiques (ENTREPRISE) ou Bannières (autres plans) ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg,var(--surface))] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className={`p-3.5 rounded-xl ${isEnterprisePlan ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"}`}>
            <Eye className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Vues Fiches Publics</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {isEnterprisePlan ? metrics.totalViews : "—"}
            </p>
          </div>
          {!isEnterprisePlan && <Lock className="w-4 h-4 text-slate-400 ml-auto" />}
        </div>

        <div className="bg-[var(--card-bg,var(--surface))] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className={`p-3.5 rounded-xl ${isEnterprisePlan ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"}`}>
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Demandes WhatsApp</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {isEnterprisePlan ? metrics.totalWhatsappClicks : "—"}
            </p>
          </div>
          {!isEnterprisePlan && <Lock className="w-4 h-4 text-slate-400 ml-auto" />}
        </div>

        <div className="bg-[var(--card-bg,var(--surface))] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className={`p-3.5 rounded-xl ${isEnterprisePlan ? "bg-[var(--primary-muted)] text-[var(--primary-muted-foreground)]" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"}`}>
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Types Publiés</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {publishedCount} / {types.length}
            </p>
          </div>
        </div>
      </div>

      {isEnterprisePlan ? (
        // ─ Bannière ENTREPRISE : tout est débloqué, aucun upsell ─
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-900/10 p-3 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-base">
              <Sparkles className="w-5 h-5 text-emerald-600 fill-emerald-500" />
              <span>Vitrine complète débloquée</span>
            </div>
            <p className="text-sm text-emerald-700/90 dark:text-emerald-400 max-w-3xl">
              Boost Permanent, badge <strong>À la Une</strong>, statistiques avancées
              (vues + clics WhatsApp) et clés API externes sont inclus dans votre formule ENTREPRISE.
            </p>
          </div>
        </div>
      ) : isEssentielPlan ? (
        // ─ Bannières ESSENTIEL ─
        <div className="space-y-3">
          {/* Statut Boost Express */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[var(--card-bg,var(--surface))] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Boost Express</p>
                <p className="text-base font-black text-slate-900 dark:text-white">
                  {anyExpressActive ? "⚡ Actif" : "Inactif"}
                </p>
              </div>
            </div>
          </div>
          {/* Bannière upsell ENTREPRISE */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/50 dark:from-amber-900/20 dark:to-orange-900/15 p-3 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-base">
                <Sparkles className="w-5 h-5 text-amber-600 fill-amber-500" />
                <span>Boostez définitivement avec la Formule ENTREPRISE</span>
              </div>
              <p className="text-sm text-amber-700/90 dark:text-amber-400 max-w-3xl">
                Accédez au <strong>Boost Permanent</strong>, au badge <strong>À la Une</strong>, aux statistiques avancées
                (vues + clics WhatsApp) et à la génération de clés API externes.
              </p>
            </div>
            <a
              href="/dashboard/subscription"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold text-sm shadow-md shadow-amber-500/20 transition-all shrink-0"
            >
              Passer à ENTREPRISE ({fmt(55000)}/mois)
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      ) : (
        // ─ Bannière standard/free ─
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/50 dark:from-amber-900/20 dark:to-orange-900/15 p-3 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-base">
              <Zap className="w-5 h-5 text-amber-600 fill-amber-500" />
              <span>Passez à la Formule ESSENTIEL pour publier votre vitrine</span>
            </div>
            <p className="text-sm text-amber-700/90 dark:text-amber-400 max-w-3xl">
              Créez votre vitrine sur <strong>Trouvetou</strong>, ajoutez vos photos, équipements et numéro WhatsApp.
              Activez des Boosts Express ponctuels pour apparaître en tête de liste.
            </p>
          </div>
          <a
            href="/dashboard/subscription"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold text-sm shadow-md shadow-amber-500/20 transition-all shrink-0"
          >
              Passer à ESSENTIEL ({fmt(15000)}/mois)
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* ── Gestion du Boost Permanent (ENTREPRISE uniquement) ──────────────── */}
      {accommodations.length > 0 && (
        <div className="bg-[var(--card-bg,var(--surface))] rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Boost Permanent par Établissement
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Propulsez vos résidences en permanence en tête d&apos;affichage sur Trouvetou.
              </p>
            </div>
            {!isEnterprisePlan && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5" />
                Réservé à l&apos;Entreprise
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accommodations.map((acc) => (
              <div
                key={acc.id}
                 className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  acc.is_permanently_boosted
                    ? "border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20"
                    : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                }`}
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{acc.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{acc.city || acc.address || "Côte d'Ivoire"}</p>
                </div>
                {isEnterprisePlan ? (
                  <button
                    onClick={() => handleTogglePermanentBoost(acc)}
                    disabled={boostSavingId === acc.id}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-60 ${
                      acc.is_permanently_boosted
                        ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    {boostSavingId === acc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {acc.is_permanently_boosted ? "Boosté ⭐" : "Activer Boost"}
                  </button>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm opacity-60 cursor-not-allowed bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Boost Entreprise
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gestion du Boost Express (ESSENTIEL uniquement) ─────────────────── */}
      {isEssentielPlan && accommodations.length > 0 && (
        <div className="bg-[var(--card-bg,var(--surface))] rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Boost Express Ponctuel
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Propulsez temporairement un établissement en tête de liste. À partir de 5 000 FCFA / 3 jours.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accommodations.map((acc) => {
              const isActive = acc.is_express_boost_active;
              const remainingDays = isActive && acc.boost_express_expires_at
                ? getRemainingDays(acc.boost_express_expires_at)
                : 0;

              return (
                <div
                  key={acc.id}
                   className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isActive
                      ? "border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{acc.name}</p>
                    {isActive && acc.boost_express_expires_at ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <Timer className="w-3 h-3" />
                        <span>
                          ⚡ Actif — {remainingDays}j restant{remainingDays > 1 ? "s" : ""}
                          {" · "}expire le {formatExpiry(acc.boost_express_expires_at)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>Positionnement standard</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setBoostExpressTarget(acc);
                      setBoostExpressModalOpen(true);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                      isActive
                        ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-400/40 hover:bg-amber-500/30"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {isActive ? "Prolonger" : "Activer"}
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Catalogue des Logements ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Catalogue des Types d&apos;Hébergement
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Un type de chambre = une annonce sur Trouvetou. L&apos;interrupteur pilote la visibilité publique et les disponibilités/tarifs Séjoura se synchronisent automatiquement.
            </p>
          </div>
          <Badge variant="outline" className="px-3 py-1 text-xs">
            {publishedCount} publié(s) sur {types.length} type(s)
          </Badge>
        </div>

        {types.length === 0 ? (
          <div className="text-center py-12 bg-[var(--card-bg,var(--surface))] rounded-xl border border-slate-200 dark:border-slate-700">
            <Building2 className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Aucun type d&apos;hébergement trouvé</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 max-w-md mx-auto mt-1">
              Ajoutez des chambres et types d&apos;hébergements dans votre section Établissements pour pouvoir les publier sur Trouvetou.
            </p>
            <Link
              href="/dashboard/residences"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm"
            >
              <Building2 className="w-4 h-4" />
              Accéder aux Établissements
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map((type) => {
              const isListed = type.is_listed_on_trouvetou;
              const isLive   = type.is_effectively_listed;
              const title    = type.name;
              const desc     = type.description || "Pas de description renseignée.";
              const images   = type.featured_images || [];
              const badges   = type.amenities || [];
              const hasRooms = type.room_count > 0;

              return (
                <div
                  key={type.id}
                  className={`group relative flex flex-col rounded-xl border transition-all duration-300 bg-[var(--card-bg,var(--surface))] overflow-hidden shadow-sm hover:shadow-md ${
                    isLive
                      ? "border-blue-500/40 dark:border-blue-500/30"
                      : "border-slate-200 dark:border-slate-700 opacity-80 hover:opacity-100"
                  }`}
                >
                  {/* Image */}
                  <div className="relative h-44 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
                    {images.length > 0 ? (
                      <img
                        src={images[0]}
                        alt={title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                        <Store className="w-8 h-8 stroke-1" />
                        <span className="text-xs font-medium">Aucune photo ajoutée</span>
                      </div>
                    )}

                    {/* Badge statut */}
                    <div className="absolute top-3 left-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md border shadow-sm ${
                        isLive
                          ? "bg-emerald-500/90 text-white border-emerald-400/30"
                          : "bg-slate-900/80 text-slate-300 border-slate-700"
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-slate-400"}`} />
                        {isLive ? "En ligne" : "Masqué"}
                      </span>
                    </div>

                    {/* Prix */}
                    <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg text-white font-extrabold text-sm border border-white/10">
                      {fmt(type.base_price)} <span className="text-xs font-normal text-slate-300">/ nuit</span>
                    </div>
                  </div>

                  {/* Contenu */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">{title}</h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate">{type.accommodation_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 line-clamp-2">{desc}</p>
                    </div>

                    {/* Capacité + Superficie + Interrupteur */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        {type.capacity} pers.
                      </span>
                      {type.surface_m2 != null && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          {type.surface_m2} m²
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          isListed
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                        }`}
                        title="Interrupteur du type de chambre"
                      >
                        {isListed ? "Interrupteur ON" : "Interrupteur OFF"}
                      </span>
                    </div>

                    {/* Chambres + disponibilité */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {hasRooms
                          ? `${type.room_count} chambre(s) · ${type.available_room_count} disponible(s)`
                          : "Aucune chambre associée"}
                      </span>
                    </div>

                    {/* Badges équipements */}
                    <div className="flex flex-wrap gap-1.5">
                      {badges.slice(0, 4).map((b, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          {b}
                        </span>
                      ))}
                      {badges.length > 4 && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500">
                          +{badges.length - 4}
                        </span>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                      {/* Toggle Publier */}
                      <button
                        onClick={() => handleToggleListed(type)}
                        disabled={savingTypeId === type.id}
                        className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-sm ${
                          isListed
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                            : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {savingTypeId === type.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isListed ? (
                          <><Check className="w-3.5 h-3.5" /> Publié</>
                        ) : (
                          "Publier sur Trouvetou"
                        )}
                      </button>

                      {/* Gérer le type */}
                      <Link
                        href={`/dashboard/residences/${type.accommodation_id}`}
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                        title="Gérer le type de chambre (Établissements)"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal Boost Express ──────────────────────────────────────────────── */}
      {boostExpressModalOpen && boostExpressTarget && (
        <BoostExpressModal
          accommodation={boostExpressTarget}
          tenantId={tenantId}
          onClose={() => {
            setBoostExpressModalOpen(false);
            setBoostExpressTarget(null);
          }}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
