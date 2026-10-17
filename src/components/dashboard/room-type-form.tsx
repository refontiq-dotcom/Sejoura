"use client";

import { useId, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, ImagePlus, Loader2, Store, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ROOM_AMENITIES } from "@/lib/amenities";
import {
  ROOM_TYPE_MAX_PHOTOS,
  isValidPhotoUrl,
  type RoomTypeFormErrors,
  type RoomTypeFormState,
} from "@/lib/validations/rooms";

const NAME_SUGGESTIONS = [
  "Chambre standard",
  "Studio",
  "Appartement",
  "Suite",
  "Villa",
  "Chambre + Salon",
  "2 Chambres + Salon",
  "3 Chambres + Salon",
];

interface RoomTypeFormProps {
  value: RoomTypeFormState;
  /** Setter d'état React : accepte une valeur ou une fonction (utile pour l'upload asynchrone). */
  onChange: Dispatch<SetStateAction<RoomTypeFormState>>;
  errors?: RoomTypeFormErrors;
  /** « full » : tous les champs. « compact » : nom, tarif et capacité (onboarding). */
  variant?: "full" | "compact";
  /** Symbole de la devise affiché dans le libellé du prix. */
  currencySymbol?: string;
  disabled?: boolean;
  /** Envoi d'un fichier photo (variant « full »). */
  onUploadPhoto?: (file: File) => void;
  uploadingPhoto?: boolean;
}

export function RoomTypeForm({
  value,
  onChange,
  errors = {},
  variant = "full",
  currencySymbol = "FCFA",
  disabled = false,
  onUploadPhoto,
  uploadingPhoto = false,
}: RoomTypeFormProps) {
  const uid = useId();
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const photosFull = value.featured_images.length >= ROOM_TYPE_MAX_PHOTOS;

  const set = <K extends keyof RoomTypeFormState>(key: K, next: RoomTypeFormState[K]) =>
    onChange((prev) => ({ ...prev, [key]: next }));

  function toggleAmenity(amenity: string) {
    onChange((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }

  function addPhotoUrl() {
    const url = newPhotoUrl.trim();
    if (!url) return;
    if (!isValidPhotoUrl(url)) {
      toast.error("L'adresse de la photo doit commencer par https://");
      return;
    }
    if (value.featured_images.includes(url)) {
      toast.error("Cette photo est déjà ajoutée.");
      return;
    }
    if (photosFull) {
      toast.error(`Maximum ${ROOM_TYPE_MAX_PHOTOS} photos pour Trouvetou 📸`);
      return;
    }
    onChange((prev) => ({
      ...prev,
      featured_images: [...prev.featured_images, url].slice(0, ROOM_TYPE_MAX_PHOTOS),
    }));
    setNewPhotoUrl("");
  }

  function removePhoto(url: string) {
    const remaining = value.featured_images.filter((img) => img !== url);
    // Sans photo, la diffusion Trouvetou n'est plus possible : on coupe l'interrupteur
    // tout de suite plutôt que de laisser l'erreur apparaître à l'enregistrement.
    const mustUnlist = remaining.length === 0 && value.is_listed_on_trouvetou;
    onChange((prev) => ({
      ...prev,
      featured_images: remaining,
      is_listed_on_trouvetou: mustUnlist ? false : prev.is_listed_on_trouvetou,
    }));
    if (mustUnlist) toast.info("Diffusion Trouvetou désactivée : il ne reste aucune photo.");
  }

  function toggleTrouvetou() {
    if (!value.is_listed_on_trouvetou && value.featured_images.length === 0) {
      toast.error("Ajoutez une photo pour activer Trouvetou 📸");
      return;
    }
    set("is_listed_on_trouvetou", !value.is_listed_on_trouvetou);
  }

  const compact = variant === "compact";
  const datalistId = `${uid}-names`;

  return (
    <div className="space-y-3">
      <Input
        id={`${uid}-name`}
        label={compact ? "Nom du type de chambre *" : "Type de chambre (ex: Chambre, Studio, Appartement, Suite) *"}
        value={value.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder={compact ? "Ex. Chambre Standard" : "Studio"}
        list={compact ? undefined : datalistId}
        maxLength={100}
        disabled={disabled}
        error={errors.name}
        aria-invalid={Boolean(errors.name)}
      />
      {!compact && (
        <datalist id={datalistId}>
          {NAME_SUGGESTIONS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}

      {!compact && (
        <Input
          id={`${uid}-description`}
          label="Description (optionnelle)"
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Grand studio avec cuisine équipée"
          maxLength={500}
          disabled={disabled}
          error={errors.description}
        />
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Input
          id={`${uid}-price`}
          label={compact ? "Tarif par nuit *" : `Prix de base (${currencySymbol}) *`}
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={value.base_price}
          onChange={(e) => set("base_price", e.target.value)}
          placeholder={compact ? "Ex. 25000" : "15000"}
          disabled={disabled}
          error={errors.base_price}
          aria-invalid={Boolean(errors.base_price)}
        />
        <Input
          id={`${uid}-capacity`}
          label={compact ? "Capacité *" : "Capacité (personnes) *"}
          type="number"
          inputMode="numeric"
          min="1"
          max="50"
          step="1"
          value={value.capacity}
          onChange={(e) => set("capacity", e.target.value)}
          placeholder="2"
          disabled={disabled}
          error={errors.capacity}
          aria-invalid={Boolean(errors.capacity)}
        />
      </div>

      {!compact && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Input
              id={`${uid}-surface`}
              label="Superficie en m² (optionnelle)"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={value.surface_m2}
              onChange={(e) => set("surface_m2", e.target.value)}
              placeholder="25"
              disabled={disabled}
              error={errors.surface_m2}
            />
            <Input
              id={`${uid}-checkout`}
              label="Heure de sortie (appliquée aux réservations)"
              type="time"
              value={value.check_out_time}
              onChange={(e) => set("check_out_time", e.target.value)}
              disabled={disabled}
              error={errors.check_out_time}
              aria-invalid={Boolean(errors.check_out_time)}
            />
          </div>

          {/* Commodités */}
          <fieldset>
            <legend className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Commodités</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {ROOM_AMENITIES.map((amenity) => {
                const checked = value.amenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => toggleAmenity(amenity)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-left text-xs transition-colors ${
                      checked
                        ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] text-slate-900 dark:text-white"
                        : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-3.5 h-3.5 rounded border ${
                        checked
                          ? "bg-[var(--primary-color,#0C1C33)] border-[var(--primary-color,#0C1C33)]"
                          : "border-slate-300 dark:border-slate-500"
                      }`}
                    >
                      {checked && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    {amenity}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Photos */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Photos de la chambre <span className="text-slate-400 font-normal">({ROOM_TYPE_MAX_PHOTOS} maximum)</span>
            </label>
            {value.featured_images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {value.featured_images.map((img, index) => (
                  <div
                    key={img}
                    className="relative w-16 h-16 rounded-md overflow-hidden border border-slate-200 dark:border-slate-600"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`Photo ${index + 1} du type de chambre`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(img)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white"
                      title="Retirer cette photo"
                      aria-label={`Retirer la photo ${index + 1}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newPhotoUrl}
                onChange={(e) => setNewPhotoUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPhotoUrl();
                  }
                }}
                placeholder="URL de la photo (https://…)"
                aria-label="Adresse web d'une photo"
                disabled={disabled}
              />
              <Button type="button" variant="outline" size="sm" onClick={addPhotoUrl} disabled={disabled || photosFull}>
                <ImagePlus className="w-4 h-4" /> Ajouter
              </Button>
            </div>
            {onUploadPhoto && (
              <label
                className={`flex items-center justify-center gap-2 mt-2 px-3 py-2.5 rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-500 dark:text-slate-400 ${
                  photosFull || disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                } hover:border-[var(--primary-color,#0C1C33)] hover:text-[var(--primary-color,#0C1C33)] transition-colors`}
              >
                {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                {uploadingPhoto
                  ? "Traitement en cours…"
                  : photosFull
                    ? `Limite atteinte : ${ROOM_TYPE_MAX_PHOTOS} photos maximum`
                    : "Téléverser une photo depuis votre appareil (JPEG, PNG, WebP, AVIF — max 12 Mo, optimisée automatiquement)"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  className="hidden"
                  disabled={disabled || uploadingPhoto || photosFull}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadPhoto(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {errors.featured_images && (
              <p className="mt-1 text-[11px] text-[var(--destructive)]">{errors.featured_images}</p>
            )}
          </div>

          {/* Visibilité Trouvetou */}
          <div
            className={`rounded-lg border p-3 space-y-2.5 ${
              value.is_listed_on_trouvetou
                ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/20"
                : "border-slate-200 dark:border-slate-600"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                  <Store className="w-3.5 h-3.5" /> Diffusion Trouvetou
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Afficher ce type de chambre sur le portail Trouvetou (si l&apos;abonnement est actif)
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={value.is_listed_on_trouvetou}
                aria-label="Activer ou désactiver la diffusion Trouvetou"
                disabled={disabled}
                onClick={toggleTrouvetou}
                className={`relative w-10 shrink-0 rounded-full transition-colors ${
                  value.is_listed_on_trouvetou ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                }`}
                style={{ height: 22 }}
              >
                <span
                  className={`absolute rounded-full bg-white shadow transition-all ${
                    value.is_listed_on_trouvetou ? "left-5.5" : "left-0.5"
                  }`}
                  style={{ width: 18, height: 18, top: 2 }}
                />
              </button>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" /> L&apos;interrupteur ne peut s&apos;activer qu&apos;avec au moins une photo.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
