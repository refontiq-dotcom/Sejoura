"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
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
  Phone,
  Plus,
  Trash2,
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

interface UnitListing {
  id: string;
  accommodation_id: string;
  room_number: string;
  status: string;
  room_type_name: string;
  base_price: number;
  capacity: number;
  amenities: string[];
  surface_m2: number | null;
  is_listed_on_trouvetou: boolean;
  featured_images: string[];
  listing: {
    id: string;
    is_published: boolean;
    public_title: string | null;
    public_description: string | null;
    featured_images: string[];
    amenities_badges: string[];
    direct_whatsapp: string | null;
    views_count: number | null;
    whatsapp_clicks_count: number | null;
  } | null;
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

const DEFAULT_AMENITIES = [
  "Wifi Haut Débit",
  "Piscine",
  "Groupe Électrogène",
  "Sécurité 24/7",
  "Parking Gratuit",
  "Climatisation",
  "Télévision Satellite",
  "Cuisine Équipée",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--card)] w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
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
// Page principale
// ─────────────────────────────────────────────────────────────────────────────
export default function TrouvetouDashboardPage() {
  const { fmt } = useCurrency();
  const [loading, setLoading]           = useState(true);
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);
  const [plan, setPlan]                 = useState<string>("standard");
  const [isEnterprisePlan, setIsEnterprisePlan] = useState<boolean>(false);
  const [isEssentielPlan, setIsEssentielPlan]   = useState<boolean>(false);
  const [tenantId, setTenantId]         = useState<string>("");
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [units, setUnits]               = useState<UnitListing[]>([]);
  const [metrics, setMetrics]           = useState({ totalViews: 0, totalWhatsappClicks: 0 });

  // Modal personnalisation fiche
  const [selectedUnit, setSelectedUnit]       = useState<UnitListing | null>(null);
  const [modalOpen, setModalOpen]             = useState(false);
  const [formTitle, setFormTitle]             = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formBadges, setFormBadges]           = useState<string[]>([]);
  const [formImages, setFormImages]           = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl]         = useState("");
  const [formWhatsapp, setFormWhatsapp]       = useState("");
  const [savingModal, setSavingModal]         = useState(false);

  // Modal Boost Express
  const [boostExpressTarget, setBoostExpressTarget] = useState<Accommodation | null>(null);
  const [boostExpressModalOpen, setBoostExpressModalOpen] = useState(false);

  // Toggle Boost Entreprise (par établissement)
  const [boostSavingId, setBoostSavingId] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function getAccessToken(): Promise<string | null> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: user } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!user?.tenant_id) return;
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
        setUnits(data.units || []);
        setMetrics(data.metrics || { totalViews: 0, totalWhatsappClicks: 0 });
      } else {
        toast.error(data.error || "Erreur de chargement de la vitrine Trouvetou");
      }
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger les données");
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePublish(unit: UnitListing) {
    setSavingUnitId(unit.id);
    const newPublished = !unit.listing?.is_published;
    try {
      if (newPublished) {
        const images = unit.featured_images.length > 0
          ? unit.featured_images
          : (unit.listing?.featured_images || []);
        if (!unit.is_listed_on_trouvetou) {
          toast.error("Activez d'abord l'interrupteur Trouvetou sur le type de chambre (section Établissements).");
          return;
        }
        if (images.length === 0) {
          toast.error("Ajoutez au moins une photo au type de chambre pour publier sur Trouvetou.");
          return;
        }
      }
      const res = await fetch("/api/v1/trouvetou/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          unit_id:             unit.id,
          establishment_id:    unit.accommodation_id,
          is_published:        newPublished,
          public_title:        unit.listing?.public_title || null,
          public_description:  unit.listing?.public_description || null,
          featured_images:     unit.listing?.featured_images?.length
            ? unit.listing.featured_images
            : unit.featured_images || [],
          amenities_badges:    unit.listing?.amenities_badges?.length
            ? unit.listing.amenities_badges
            : unit.amenities || [],
          direct_whatsapp:     unit.listing?.direct_whatsapp || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          newPublished
            ? `Le logement ${unit.room_number} est désormais publié sur Trouvetou !`
            : `Le logement ${unit.room_number} a été dépublié.`
        );
        fetchData();
      } else {
        toast.error(data.error || "Erreur de mise à jour");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setSavingUnitId(null);
    }
  }

  function openEditModal(unit: UnitListing) {    setSelectedUnit(unit);
    setFormTitle(unit.listing?.public_title || `${unit.room_type_name} - Chambre ${unit.room_number}`);
    setFormDescription(unit.listing?.public_description || "");
    setFormBadges(unit.listing?.amenities_badges?.length ? unit.listing.amenities_badges : [...unit.amenities]);
    setFormImages(unit.listing?.featured_images || []);
    const acc = accommodations.find((a) => a.id === unit.accommodation_id);
    setFormWhatsapp(unit.listing?.direct_whatsapp || acc?.contact_phone || "");
    setModalOpen(true);
  }

  function toggleBadge(badge: string) {
    setFormBadges((prev) =>
      prev.includes(badge) ? prev.filter((b) => b !== badge) : [...prev, badge]
    );
  }

  function addImage() {
    if (!newImageUrl.trim()) return;
    setFormImages((prev) => [...prev, newImageUrl.trim()]);
    setNewImageUrl("");
  }

  function removeImage(index: number) {
    setFormImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveModal() {
    if (!selectedUnit) return;
    setSavingModal(true);
    try {
      const res = await fetch("/api/v1/trouvetou/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          unit_id:             selectedUnit.id,
          establishment_id:    selectedUnit.accommodation_id,
          is_published:        selectedUnit.listing?.is_published ?? true,
          public_title:        formTitle,
          public_description:  formDescription,
          featured_images:     formImages,
          amenities_badges:    formBadges,
          direct_whatsapp:     formWhatsapp,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Fiche publique Trouvetou enregistrée avec succès !");
        setModalOpen(false);
        fetchData();
      } else {
        toast.error(data.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setSavingModal(false);
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
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Chargement de votre Vitrine Trouvetou...</p>
      </div>
    );
  }

  const publishedCount = units.filter((u) => u.listing?.is_published).length;
  const anyExpressActive = accommodations.some((a) => a.is_express_boost_active);

  // Badge de visibilité dans le header
  function HeaderVisibilityBadge() {
    if (isEnterprisePlan) {
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
            <HeaderVisibilityBadge />
          </div>
        </div>
      </div>

      {/* ── Statistiques (ENTREPRISE) ou Bannières (autres plans) ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--card)] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
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

        <div className="bg-[var(--card)] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
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

        <div className="bg-[var(--card)] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className={`p-3.5 rounded-xl ${isEnterprisePlan ? "bg-[var(--primary-light,#F0F4FF)] text-[var(--primary-color,#0C1C33)]" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"}`}>
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Logements Publiés</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {publishedCount} / {units.length}
            </p>
          </div>
        </div>
      </div>

      {isEssentielPlan ? (
        // ─ Bannières ESSENTIEL ─
        <div className="space-y-3">
          {/* Compteur simple pour ESSENTIEL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[var(--card)] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="p-3.5 rounded-xl bg-[var(--primary-light,#F0F4FF)] text-[var(--primary-color,#0C1C33)]">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Logements Publiés</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white">
                  {publishedCount} / {units.length}
                </p>
              </div>
            </div>
            <div className="bg-[var(--card)] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
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
        <div className="bg-[var(--card)] rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 shadow-sm">
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
        <div className="bg-[var(--card)] rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 shadow-sm">
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
              Catalogue des Logements
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Gérez la publication individuelle et personnalisez l&apos;affichage de chaque fiche logement.
            </p>
          </div>
          <Badge variant="outline" className="px-3 py-1 text-xs">
            {publishedCount} publié(s) sur {units.length} logement(s)
          </Badge>
        </div>

        {units.length === 0 ? (
          <div className="text-center py-12 bg-[var(--card)] rounded-xl border border-slate-200 dark:border-slate-700">
            <Building2 className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Aucun logement trouvé</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 max-w-md mx-auto mt-1">
              Ajoutez des chambres et types d&apos;hébergements dans votre section Établissements pour pouvoir les publier sur Trouvetou.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {units.map((unit) => {
              const isPub   = unit.listing?.is_published ?? false;
              const title   = unit.listing?.public_title || `${unit.room_type_name} ${unit.room_number}`;
              const desc    = unit.listing?.public_description || "Pas de description spécifique renseignée.";
              const images  = unit.listing?.featured_images || [];
              const badges  = unit.listing?.amenities_badges?.length ? unit.listing.amenities_badges : unit.amenities;

              return (
                <div
                  key={unit.id}
                  className={`group relative flex flex-col rounded-xl border transition-all duration-300 bg-[var(--card)] overflow-hidden shadow-sm hover:shadow-md ${
                    isPub
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
                        isPub
                          ? "bg-emerald-500/90 text-white border-emerald-400/30"
                          : "bg-slate-900/80 text-slate-300 border-slate-700"
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${isPub ? "bg-white animate-pulse" : "bg-slate-400"}`} />
                        {isPub ? "En ligne" : "Masqué"}
                      </span>
                    </div>

                    {/* Prix */}
                    <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg text-white font-extrabold text-sm border border-white/10">
                      {fmt(unit.base_price)} <span className="text-xs font-normal text-slate-300">/ nuit</span>
                    </div>
                  </div>

                  {/* Contenu */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">{title}</h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 line-clamp-2">{desc}</p>
                    </div>

                    {/* Superficie + Interrupteur maître */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {unit.surface_m2 != null && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          {unit.surface_m2} m²
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          unit.is_listed_on_trouvetou
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                        }`}
                        title="Interrupteur du type de chambre (Établissements)"
                      >
                        {unit.is_listed_on_trouvetou ? "Interrupteur ON" : "Interrupteur OFF"}
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

                    {/* Métriques ENTREPRISE inline */}
                    {isEnterprisePlan && unit.listing && (
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {unit.listing.views_count ?? 0} vues
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {unit.listing.whatsapp_clicks_count ?? 0} clics
                        </span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                      {/* Toggle Publier */}
                      <button
                        onClick={() => handleTogglePublish(unit)}
                        disabled={savingUnitId === unit.id}
                        className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-sm ${
                          isPub
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                            : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {savingUnitId === unit.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isPub ? (
                          <><Check className="w-3.5 h-3.5" /> Publié</>
                        ) : (
                          "Publier sur Trouvetou"
                        )}
                      </button>

                      {/* Bouton Personnaliser */}
                      <button
                        onClick={() => openEditModal(unit)}
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                        title="Personnaliser la fiche publique"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal Personnalisation Fiche ──────────────────────────────────────── */}
      {modalOpen && selectedUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[var(--card)] w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <Edit3 className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Personnaliser la fiche Trouvetou
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Chambre {selectedUnit.room_number} ({selectedUnit.room_type_name})</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {/* Titre Public */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Titre Public d&apos;accroche
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Suite Luxueuse avec Vue Panoramique"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Description Courte */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Description Courte
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Présentez les atouts de ce logement pour attirer les visiteurs..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Numéro WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-emerald-500" />
                  Numéro WhatsApp de Réception des Demandes
                </label>
                <input
                  type="tel"
                  value={formWhatsapp}
                  onChange={(e) => setFormWhatsapp(e.target.value)}
                  placeholder="Ex: +2250700000000"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Les clients cliquant sur &quot;Réserver via WhatsApp&quot; sur Trouvetou seront directement redirigés vers ce numéro.
                </p>
              </div>

              {/* Badges équipements */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Badges &amp; Équipements Clés
                </label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_AMENITIES.map((badge) => {
                    const active = formBadges.includes(badge);
                    return (
                      <button
                        type="button"
                        key={badge}
                        onClick={() => toggleBadge(badge)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          active
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                        }`}
                      >
                        {active ? "✓ " : "+ "}{badge}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Galerie Photos */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Photos Coup de Cœur (URLs de Visuels)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/photo-..."
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addImage}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Ajouter
                  </button>
                </div>

                {formImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    {formImages.map((img, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden h-24 border border-slate-200 dark:border-slate-700">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={savingModal}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
              >
                {savingModal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Enregistrer la Fiche
              </button>
            </div>
          </div>
        </div>
      )}

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
