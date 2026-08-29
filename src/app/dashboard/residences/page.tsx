"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatAmount, getPlanLimits, getPlanLabel } from "@/lib/utils";
import { SUPPORTED_COUNTRIES, SUPPORTED_CURRENCIES } from "@/lib/countries";
import { Building2, Plus, MapPin, Phone, BedDouble, Loader2, Lock, Trash2, Edit2, Globe, Coins } from "lucide-react";
import type { Accommodation, RoomType } from "@/types/database";

export default function ResidencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [residences, setResidences] = useState<Accommodation[]>([]);
  const [roomTypes, setRoomTypes] = useState<Record<string, RoomType[]>>({});
  const [roomsCount, setRoomsCount] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingResidence, setEditingResidence] = useState<Accommodation | null>(null);
  const [plan, setPlan] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    country: "Côte d'Ivoire",
    currency: "XOF",
    currency_symbol: "FCFA",
    phone_code: "+225",
    language: "fr",
    contact_phone: "",
    image_url: "",
    latitude: "",
    longitude: "",
    tourist_tax_enabled: false,
    tourist_tax_rate: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("tenant_id, role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData?.tenant_id) return;

      setIsReadOnly(userData.role === "receptionniste");

      const [subResult, accResult] = await Promise.all([
        supabase.from("subscriptions").select("plan").eq("tenant_id", userData.tenant_id).single(),
        supabase
          .from("accommodations")
          .select("*")
          .eq("tenant_id", userData.tenant_id)
          .order("created_at", { ascending: false }),
      ]);

      if (subResult.data) setPlan(subResult.data.plan);

      const accData = accResult.data;
      if (accData) {
        setResidences(accData as unknown as Accommodation[]);

        const accommodationIds = accData.map((a) => a.id);
        const [typesResult, roomsResult] = await Promise.all([
          supabase.from("room_types").select("*").in("accommodation_id", accommodationIds),
          supabase.from("rooms").select("accommodation_id").in("accommodation_id", accommodationIds),
        ]);

        const typesMap: Record<string, RoomType[]> = {};
        (typesResult.data || []).forEach((rt: RoomType) => {
          if (!typesMap[rt.accommodation_id]) typesMap[rt.accommodation_id] = [];
          typesMap[rt.accommodation_id].push(rt);
        });
        setRoomTypes(typesMap);

        const roomsMap: Record<string, number> = {};
        (roomsResult.data || []).forEach((r: { accommodation_id: string }) => {
          roomsMap[r.accommodation_id] = (roomsMap[r.accommodation_id] || 0) + 1;
        });
        setRoomsCount(roomsMap);
      }
    } catch (err) {
      toast.error("Les établissements ne se chargent pas 🏨");
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function openAddModal() {
    if (isReadOnly) return;
    const limits = plan ? getPlanLimits(plan) : null;
    if (limits?.maxAccommodations != null && residences.length >= limits.maxAccommodations) {
      toast.error(`Votre plan ${getPlanLabel(plan)} est limité à ${limits.maxAccommodations} établissement${limits.maxAccommodations > 1 ? "s" : ""}. Passez au plan Entreprise pour des établissements illimités.`);
      return;
    }
    setEditingResidence(null);
    setFormData({
      name: "",
      address: "",
      city: "",
      country: "Côte d'Ivoire",
      currency: "XOF",
      currency_symbol: "FCFA",
      phone_code: "+225",
      language: "fr",
      contact_phone: "+225 ",
      image_url: "",
      latitude: "",
      longitude: "",
      tourist_tax_enabled: false,
      tourist_tax_rate: "",
    });
    setModalOpen(true);
  }

  function openEditModal(acc: Accommodation) {
    setEditingResidence(acc);
    setFormData({
      name: acc.name,
      address: acc.address || "",
      city: acc.city || "",
      country: acc.country || "Côte d'Ivoire",
      currency: acc.currency || "XOF",
      currency_symbol: acc.currency_symbol || "FCFA",
      phone_code: acc.phone_code || "+225",
      language: acc.language || "fr",
      contact_phone: acc.contact_phone || "",
      image_url: acc.image_url || "",
      latitude: acc.latitude != null ? acc.latitude.toString() : "",
      longitude: acc.longitude != null ? acc.longitude.toString() : "",
      tourist_tax_enabled: acc.tourist_tax_enabled || false,
      tourist_tax_rate: acc.tourist_tax_rate != null ? String(acc.tourist_tax_rate) : "",
    });
    setModalOpen(true);
  }

  function handleCountryChange(countryName: string) {
    const matched = SUPPORTED_COUNTRIES.find((c) => c.name === countryName);
    if (matched) {
      setFormData((prev) => ({
        ...prev,
        country: matched.name,
        currency: matched.currency,
        currency_symbol: matched.currencySymbol,
        phone_code: matched.phoneCode,
        language: matched.defaultLang,
        contact_phone: prev.contact_phone && !prev.contact_phone.startsWith("+") ? `${matched.phoneCode} ${prev.contact_phone}` : (prev.contact_phone || `${matched.phoneCode} `),
      }));
    } else {
      setFormData((prev) => ({ ...prev, country: countryName }));
    }
  }

  async function handleSave() {
    if (!formData.name) {
      toast.error("Le nom de l'établissement est requis.");
      return;
    }
    if (formData.tourist_tax_enabled && !formData.tourist_tax_rate) {
      toast.error("Indiquez le tarif de la taxe de nuitée, ou désactivez-la.");
      return;
    }
    setSaving(true);
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

      const payload = {
        name: formData.name,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        currency: formData.currency,
        currency_symbol: formData.currency_symbol,
        phone_code: formData.phone_code,
        language: formData.language,
        contact_phone: formData.contact_phone,
        image_url: formData.image_url || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        tourist_tax_enabled: formData.tourist_tax_enabled,
        tourist_tax_rate: formData.tourist_tax_enabled && formData.tourist_tax_rate ? Number(formData.tourist_tax_rate) : null,
      };

      const { error } = editingResidence
        ? await supabase.from("accommodations").update(payload).eq("id", editingResidence.id)
        : await supabase.from("accommodations").insert({ ...payload, tenant_id: userData.tenant_id });
      if (error) throw error;

      setModalOpen(false);
      loadData(true);
      toast.success(editingResidence ? "Établissement modifié ✏️" : "Établissement créé");
    } catch (err) {
      toast.error("L'action a échoué : enregistrer l'établissement.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!deletingId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("accommodations").delete().eq("id", id);
      if (error) throw error;
      toast.success("Établissement supprimé 🗑️ 🗑️");
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      loadData(true);
    } catch (err) {
      toast.error("La suppression a échoué : établissement.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading && residences.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const limits = getPlanLimits(plan);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Établissements</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
            {residences.length} établissement{residences.length > 1 ? "s" : ""}
            {limits.maxAccommodations !== null && ` / ${limits.maxAccommodations} max`}
          </p>
        </div>
        <Button 
          onClick={openAddModal}
          disabled={isReadOnly || !!(plan && limits.maxAccommodations !== null && residences.length >= limits.maxAccommodations)}
          className="flex-shrink-0"
          size="sm"
        >
          {isReadOnly ? (
            <><Lock className="w-4 h-4" /> <span className="hidden sm:inline">Lecture seule</span></>
          ) : plan && limits.maxAccommodations !== null && residences.length >= limits.maxAccommodations ? (
            <><Lock className="w-4 h-4" /> <span className="hidden sm:inline">Limite atteinte</span></>
          ) : (
            <><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ajouter un établissement</span></>
          )}
        </Button>
      </div>

      {/* Limite plan */}
      {plan && limits.maxAccommodations !== null && residences.length >= limits.maxAccommodations && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <Lock className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Limite du plan {getPlanLabel(plan)} atteinte</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">Passez au plan Entreprise pour des établissements illimités.</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => router.push("/dashboard/subscription")}>Mettre à niveau</Button>
        </div>
      )}

      {/* Grille des établissements */}
      {residences.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600 dark:text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-medium text-slate-900 dark:text-white mb-2">Aucun établissement</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">
            {isReadOnly
              ? "Aucun établissement disponible sur votre compte."
              : "Commencez par ajouter votre premier établissement"}
          </p>
          {!isReadOnly && (
            <Button onClick={openAddModal}>
              <Plus className="w-4 h-4" /> Ajouter un établissement
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {residences.map((acc) => (
            <Card 
              key={acc.id} 
              className="p-3 cursor-pointer hover:shadow-lg overflow-hidden flex flex-col justify-between min-w-0"
              onClick={() => router.push(`/dashboard/residences/${acc.id}`)}
            >
              <div>
                {acc.image_url ? (
                  <div className="h-24 -mx-4 -mt-4 mb-3 overflow-hidden relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={acc.image_url} alt={acc.name} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    {!isReadOnly && (
                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-white bg-slate-900/50 hover:bg-slate-800" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            openEditModal(acc); 
                          }}
                          title="Modifier l'établissement"
                          aria-label="Modifier l'établissement"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-white bg-slate-900/50 hover:bg-red-600" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setDeletingId(acc.id); 
                            setDeleteConfirmOpen(true); 
                          }}
                          title="Supprimer l'établissement"
                          aria-label="Supprimer l'établissement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--primary-color,#0C1C33)] flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    {!isReadOnly && (
                      <div className="flex items-center gap-1 z-10">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            openEditModal(acc); 
                          }}
                          title="Modifier l'établissement"
                          aria-label="Modifier l'établissement"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setDeletingId(acc.id); 
                            setDeleteConfirmOpen(true); 
                          }}
                          title="Supprimer l'établissement"
                          aria-label="Supprimer l'établissement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1.5 truncate">{acc.name}</h3>

              <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {(acc.address || acc.city) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {acc.address}{acc.address && acc.city ? ", " : ""}{acc.city}
                    </span>
                  </div>
                )}
                {acc.contact_phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{acc.contact_phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <BedDouble className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{(roomsCount[acc.id] || 0)} chambre{(roomsCount[acc.id] || 0) > 1 ? "s" : ""}</span>
                </div>
              </div>

                  {/* Types de chambre */}
              {roomTypes[acc.id] && roomTypes[acc.id].length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex flex-wrap gap-1.5">
                    {roomTypes[acc.id].map((rt) => (
                        <Badge key={rt.id} variant="theme" className="text-[10px]">
                          {rt.name} — {formatAmount(rt.base_price, acc.currency_symbol || "FCFA")}
                        </Badge>
                    ))}
                  </div>
                </div>
              )}

              </Card>
          ))}
        </div>
      )}

      {/* Modal Add/Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingResidence ? "Modifier l'établissement" : "Ajouter un établissement"}
        description="Renseignez les informations de votre établissement"
        onConfirm={handleSave}
      >
        <div className="space-y-3">
          <Input label="Nom de l'établissement *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Hôtel Palm Beach, Villa Ivoire" required />

          {/* Sélecteur de Pays avec auto-mapping */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />
              Pays de l&apos;établissement *
            </label>
            <select
              value={formData.country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.flag} {c.name} ({c.phoneCode} • {c.currencySymbol})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Ville" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Abidjan, Dakar, Lagos..." />
            <Input label="Adresse" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Cocody Riviera 2" />
          </div>

          {/* Devise automatique & Indicatif */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-500" /> Devise associée
              </span>
              <select
                value={formData.currency}
                onChange={(e) => {
                  const sel = SUPPORTED_CURRENCIES.find((curr) => curr.code === e.target.value);
                  setFormData({ ...formData, currency: e.target.value, currency_symbol: sel ? sel.symbol : e.target.value });
                }}
                className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-medium"
              >
                {SUPPORTED_CURRENCIES.map((curr) => (
                  <option key={curr.code} value={curr.code}>{curr.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <span>Symbole affiché sur les tarifs :</span>
              <span className="font-bold text-[var(--primary-color,#0C1C33)] text-sm">{formData.currency_symbol}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Téléphone de contact <span className="text-xs text-slate-400 dark:text-slate-500">(Indicatif {formData.phone_code})</span>
            </label>
            <Input value={formData.contact_phone} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} placeholder={`${formData.phone_code} 07 00 00 00 00`} />
          </div>

          <Input label="URL de l'image (optionnelle)" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://images.unsplash.com/..." />

          {/* Coordonnées GPS (pour le bouton Itinéraire Trouvetou) */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude (optionnel)" type="number" step="any" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} placeholder="5.3453170" />
            <Input label="Longitude (optionnel)" type="number" step="any" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} placeholder="-4.0082560" />
          </div>

          {/* Taxe de nuitée (annexe fiscale 2026) */}
          <div className="rounded-xl border border-[var(--border)] p-3 space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.tourist_tax_enabled}
                onChange={(e) => setFormData({ ...formData, tourist_tax_enabled: e.target.checked })}
                className="w-4 h-4 rounded accent-[var(--primary-color,#0C1C33)]"
              />
              <span className="text-sm font-semibold text-[var(--foreground)]">Taxe de nuitée (obligatoire depuis janvier 2026)</span>
            </label>
            {formData.tourist_tax_enabled && (
              <>
                <Input
                  label="Tarif (FCFA par nuitée et par occupant)"
                  type="number"
                  min="0"
                  value={formData.tourist_tax_rate}
                  onChange={(e) => setFormData({ ...formData, tourist_tax_rate: e.target.value })}
                  placeholder="1000"
                />
                <p className="text-[11px] text-[var(--foreground-subtle)] leading-relaxed">
                  Barème légal indicatif — vérifiez le tarif exact de votre commune : résidences meublées, 500 FCFA
                  (commune ≤ 20 000 habitants) ou 1000 FCFA (commune &gt; 20 000 habitants, y compris le District
                  autonome d&apos;Abidjan). Séjoura calcule le montant automatiquement sur chaque réservation ; à vous
                  de le reverser à la mairie avant le 15 du mois suivant.
                </p>
              </>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={saving}>
              {editingResidence ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal 
        open={deleteConfirmOpen} 
        onClose={() => setDeleteConfirmOpen(false)} 
        title="Confirmation" 
        description="Êtes-vous sûr de vouloir supprimer cet établissement ? Toutes les chambres et réservations associées seront supprimées."
        onConfirm={async () => {
          if (deletingId) await handleDelete(deletingId);
        }}
      >
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>Annuler</Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={async () => {
              if (deletingId) await handleDelete(deletingId);
            }}
            loading={saving}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}