"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Megaphone,
  Upload,
  Link2,
  Clock,
  Check,
  X,
  Loader2,
  Smartphone,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ImagePlus,
  MapPin,
  Users,
  Calendar,
  AlertCircle,
  ExternalLink,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/contexts/current-user-context";
import { useCurrency } from "@/hooks/use-currency";
import { formatDate, formatFCFA } from "@/lib/utils";
import {
  AD_AUDIENCE_OPTIONS,
  AD_DURATION_OPTIONS,
  getAdAudienceLabel,
  getAdCampaignPrice,
  getAdStatusLabel,
  getAdWavePayLink,
  getRemainingAdDays,
  isValidRedirectUrl,
  type AdAudience,
  type AdStatus,
} from "@/lib/ads";
import type { Advertisement, AdvertisementTargeting } from "@/types/database";

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

function statusBadgeVariant(status: AdStatus): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "active":
      return "success";
    case "pending_payment":
      return "warning";
    case "expired":
      return "info";
    case "rejected":
      return "error";
    default:
      return "default";
  }
}

export function TrouvetouAdsPanel() {
  const { tenantId } = useCurrentUser();
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [durationDays, setDurationDays] = useState(7);
  const [audience, setAudience] = useState<AdAudience>("all");
  const [citiesText, setCitiesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [payTarget, setPayTarget] = useState<Advertisement | null>(null);
  const [paymentStep, setPaymentStep] = useState<1 | 2>(1);
  const [senderPhone, setSenderPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [notifying, setNotifying] = useState(false);

  const price = getAdCampaignPrice(durationDays);

  const loadAds = useCallback(async () => {
    if (!tenantId) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAds((data ?? []) as unknown as Advertisement[]);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger les publicités.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const t = setTimeout(loadAds, 0);
    return () => clearTimeout(t);
  }, [loadAds]);

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ads-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "advertisements", filter: `tenant_id=eq.${tenantId}` },
        () => {
          loadAds();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, loadAds]);

  const stats = useMemo(() => {
    const active = ads.filter((a) => a.status === "active").length;
    const pending = ads.filter((a) => a.status === "pending_payment").length;
    const expired = ads.filter((a) => a.status === "expired").length;
    return { active, pending, expired, total: ads.length };
  }, [ads]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setRedirectUrl("");
    setImageUrl("");
    setImagePreview(null);
    setDurationDays(7);
    setAudience("all");
    setCitiesText("");
    setFormErrors({});
  }

  async function handleImageChange(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'affiche fait plus de 5 Mo.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/ads/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload impossible.");
      setImageUrl(data.url);
      setImagePreview(URL.createObjectURL(file));
      setFormErrors((e) => ({ ...e, imageUrl: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload impossible.");
    } finally {
      setUploading(false);
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (title.trim().length < 3) errors.title = "Le titre doit contenir au moins 3 caractères.";
    if (!imageUrl) errors.imageUrl = "Importez une affiche.";
    if (!redirectUrl.trim() || !isValidRedirectUrl(redirectUrl.trim())) {
      errors.redirectUrl = "Saisissez un lien http(s) valide.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreate() {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const cities = citiesText
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const res = await fetch("/api/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          imageUrl,
          redirectUrl: redirectUrl.trim(),
          durationDays,
          audience,
          cities,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Création impossible.");
      const created = data.advertisement as Advertisement;
      toast.success("Publicité enregistrée. Soumettez votre preuve de règlement.");
      resetForm();
      setShowForm(false);
      await loadAds();
      openPayment(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally {
      setSubmitting(false);
    }
  }

  function openPayment(ad: Advertisement) {
    setPayTarget(ad);
    setPaymentStep(1);
    setSenderPhone(ad.sender_phone ?? "");
    setPhoneError("");
  }

  function closePayment() {
    setPayTarget(null);
    setPaymentStep(1);
    setSenderPhone("");
    setPhoneError("");
  }

  async function handleSubmitPayment() {
    if (!payTarget) return;
    const digitsOnly = senderPhone.replace(/\D/g, "");
    if (!digitsOnly || digitsOnly.length < 8) {
      setPhoneError("Veuillez renseigner le numéro Wave ayant envoyé le paiement.");
      return;
    }
    setNotifying(true);
    try {
      const res = await fetch("/api/ads/notify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advertisementId: payTarget.id, phone: senderPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Impossible de soumettre la demande.");
      if (data.alreadyPending) {
        toast.info("Votre demande est déjà en attente.");
      } else {
        toast.success("Demande envoyée. L'administrateur va vérifier votre paiement Wave.");
      }
      setPaymentStep(2);
      await loadAds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion.");
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

  const payAmount = payTarget ? payTarget.amount : price;
  const waveUrl = getAdWavePayLink(payAmount);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Publicités</h2>
          <p className="text-sm text-slate-500">Option de la vitrine Trouvetou : créez une campagne, réglez via Wave, puis la diffusion démarre après confirmation.</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" /> Nouvelle publicité
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4" hover={false}>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-slate-400">Campagnes</p>
        </Card>
        <Card className="p-4" hover={false}>
          <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
          <p className="text-xs text-slate-400">Actives</p>
        </Card>
        <Card className="p-4" hover={false}>
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          <p className="text-xs text-slate-400">En attente</p>
        </Card>
        <Card className="p-4" hover={false}>
          <p className="text-2xl font-bold text-slate-500">{stats.expired}</p>
          <p className="text-xs text-slate-400">Expirées</p>
        </Card>
      </div>

      {showForm && (
        <Card className="p-5 space-y-5" hover={false}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Créer une campagne</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} aria-label="Fermer le formulaire">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <label htmlFor="ad-poster" className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-1">
                  Affiche / visuel *
                </label>
                <input
                  id="ad-poster"
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full min-h-[160px] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-[var(--primary-color,#0C1C33)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : imagePreview || imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview || imageUrl} alt="Aperçu de l'affiche" className="max-h-40 object-contain rounded-lg" />
                  ) : (
                    <>
                      <ImagePlus className="w-8 h-8" />
                      <span className="text-xs font-medium">Importer une affiche (JPEG, PNG, WebP — 5 Mo max)</span>
                    </>
                  )}
                </button>
                {formErrors.imageUrl && <p className="mt-1 text-[11px] text-[var(--destructive)]">{formErrors.imageUrl}</p>}
              </div>

              <Input
                id="ad-title"
                label="Titre *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={formErrors.title}
                placeholder="Offre spéciale week-end à Abidjan"
                maxLength={80}
              />

              <div>
                <label htmlFor="ad-description" className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-0.5">
                  Description
                </label>
                <textarea
                  id="ad-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Présentez l'offre, le public visé et l'appel à l'action."
                  className="w-full px-2.5 py-1.5 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--foreground)] text-xs placeholder-[var(--input-placeholder)] focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
                />
              </div>

              <Input
                id="ad-redirect"
                label="Lien de redirection *"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                error={formErrors.redirectUrl}
                placeholder="https://..."
                icon={<Link2 className="h-4 w-4" />}
              />
            </div>

            <div className="space-y-4">
              <fieldset>
                <legend className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-2">Durée de diffusion</legend>
                <div className="grid grid-cols-2 gap-2">
                  {AD_DURATION_OPTIONS.map((opt) => {
                    const selected = durationDays === opt.days;
                    return (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => setDurationDays(opt.days)}
                        className={`relative text-left rounded-xl border p-3 min-h-[44px] transition-all cursor-pointer ${
                          selected
                            ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)]"
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-400"
                        }`}
                      >
                        {opt.popular && (
                          <span className="absolute -top-2 right-2 text-[10px] font-bold uppercase tracking-wide bg-purple-600 text-white px-1.5 py-px rounded-full">
                            Populaire
                          </span>
                        )}
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{opt.label}</p>
                        <p className="text-xs text-slate-500">{fmt(opt.priceFcfa)}</p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-2">Ciblage</legend>
                <div className="grid grid-cols-1 gap-2">
                  {AD_AUDIENCE_OPTIONS.map((opt) => {
                    const selected = audience === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAudience(opt.value)}
                        className={`flex items-start gap-3 rounded-xl border p-3 min-h-[44px] text-left cursor-pointer ${
                          selected
                            ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)]"
                            : "border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <Users className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{opt.label}</span>
                          <span className="block text-[11px] text-slate-500">{opt.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <Input
                id="ad-cities"
                label="Villes cibles (optionnel)"
                value={citiesText}
                onChange={(e) => setCitiesText(e.target.value)}
                placeholder="Abidjan, Yamoussoukro"
                icon={<MapPin className="h-4 w-4" />}
              />
              <p className="text-[11px] text-slate-400">Séparez les villes par une virgule.</p>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Tarif de la campagne</p>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{fmt(price)}</p>
                  <p className="text-[11px] text-slate-400">{durationDays} jours de diffusion sur Trouvetou</p>
                </div>
                <Upload className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
            <Button loading={submitting} onClick={handleCreate}>
              Valider et payer
            </Button>
          </div>
        </Card>
      )}

      {ads.length === 0 && !showForm ? (
        <Card className="p-10 text-center" hover={false}>
          <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-900 dark:text-white">Aucune publicité pour le moment</p>
          <p className="text-xs text-slate-500 mt-1">Créez votre première campagne pour apparaître sur Trouvetou.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ads.map((ad) => {
            const targeting = (ad.targeting ?? {}) as AdvertisementTargeting;
            const remaining = getRemainingAdDays(ad.ends_at);
            return (
              <Card key={ad.id} className="overflow-hidden" hover={false}>
                <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ad.image_url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{ad.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2">{ad.description || "Sans description"}</p>
                    </div>
                    <Badge variant={statusBadgeVariant(ad.status)}>{getAdStatusLabel(ad.status)}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {ad.duration_days} jours
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" /> {getAdAudienceLabel(targeting.audience ?? "all")}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                      {formatFCFA(ad.amount)}
                    </span>
                  </div>
                  {ad.status === "active" && ad.ends_at && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Expire le {formatDate(ad.ends_at)} · {remaining} jour{remaining > 1 ? "s" : ""} restant{remaining > 1 ? "s" : ""}
                    </p>
                  )}
                  {ad.status === "pending_payment" && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                      <Clock className="w-4 h-4 shrink-0" />
                      En attente de confirmation de paiement
                    </div>
                  )}
                  {ad.status === "rejected" && (
                    <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Paiement rejeté. Vous pouvez soumettre une nouvelle preuve.
                    </div>
                  )}
                  {ad.trouvetou_sync_error && ad.status === "active" && (
                    <p className="text-[11px] text-amber-600">Publication Trouvetou : {ad.trouvetou_sync_error}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(ad.status === "draft" || ad.status === "rejected") && (
                      <Button size="sm" onClick={() => openPayment(ad)}>
                        <Smartphone className="w-4 h-4" /> Soumettre le paiement
                      </Button>
                    )}
                    {ad.redirect_url && (
                      <a
                        href={ad.redirect_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[var(--primary-color,#0C1C33)] hover:underline min-h-[44px]"
                      >
                        <ExternalLink className="w-3 h-3" /> Lien
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!payTarget}
        onClose={closePayment}
        title="Paiement Wave sécurisé"
        description={paymentStep === 1 ? "Réglez la campagne puis déclarez le numéro expéditeur" : undefined}
      >
        {payTarget && paymentStep === 1 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{payTarget.title}</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
                  {fmt(payTarget.amount)}
                  <span className="text-sm font-normal text-slate-400"> · {payTarget.duration_days} jours</span>
                </p>
              </div>
              <WaveIcon className="h-6 w-6 rounded-lg" />
            </div>
            {waveUrl && (
              <a
                href={waveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1C3AA9] px-4 py-3 text-sm font-bold text-white min-h-[44px]"
              >
                <WaveIcon className="bg-white/15" />
                Payer avec l&apos;application Wave
              </a>
            )}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Preuve de règlement</p>
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
            </div>
            <Button variant="purple" size="lg" className="w-full" loading={notifying} onClick={handleSubmitPayment}>
              <Sparkles className="w-4 h-4" />
              Soumettre pour activation rapide
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : payTarget ? (
          <div className="space-y-3 text-center py-4">
            <Check className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Demande transmise</p>
            <p className="text-xs text-slate-500">
              Le Super Admin confirmera le paiement. Votre publicité passera automatiquement à Active et sera publiée sur Trouvetou.
            </p>
            <Button className="w-full" onClick={closePayment}>
              Fermer
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
