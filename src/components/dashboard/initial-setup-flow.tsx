"use client";

import { useEffect, useMemo, useState } from "react";
import { BedDouble, Building2, Check, ChevronLeft, ChevronRight, Loader2, Minus, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Room, RoomType } from "@/types/database";

type SetupStep = "type" | "rooms" | "complete";

interface InitialSetupFlowProps {
  open: boolean;
  accommodationId: string | null;
  accommodationName?: string;
  onClose: () => void;
  onCompleted?: () => void;
}

const STEP_LABELS = ["Établissement", "Type de chambre", "Chambres"];

export function InitialSetupFlow({
  open,
  accommodationId,
  accommodationName,
  onClose,
  onCompleted,
}: InitialSetupFlowProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<SetupStep>("type");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedType, setSelectedType] = useState<RoomType | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "",
    base_price: "",
    capacity: "2",
  });
  const [roomCount, setRoomCount] = useState(1);
  const [roomNumbers, setRoomNumbers] = useState<string[]>(["101"]);

  const nextRoomNumber = useMemo(() => {
    const numericRooms = rooms
      .map((room) => Number.parseInt(room.room_number, 10))
      .filter((value) => Number.isFinite(value));
    return numericRooms.length > 0 ? Math.max(...numericRooms) + 1 : 101;
  }, [rooms]);

  useEffect(() => {
    if (!open || !accommodationId) return;

    let cancelled = false;

    async function loadSetupState() {
      setLoading(true);
      setStep("type");
      setSelectedType(null);

      try {
        const supabase = createClient();
        const [{ data: types, error: typesError }, { data: roomRows, error: roomsError }] =
          await Promise.all([
            supabase
              .from("room_types")
              .select("*")
              .eq("accommodation_id", accommodationId)
              .order("created_at", { ascending: true }),
            supabase
              .from("rooms")
              .select("*")
              .eq("accommodation_id", accommodationId)
              .order("room_number", { ascending: true }),
          ]);

        if (typesError) throw typesError;
        if (roomsError) throw roomsError;
        if (cancelled) return;

        const loadedTypes = (types || []) as unknown as RoomType[];
        const loadedRooms = (roomRows || []) as unknown as Room[];
        setRoomTypes(loadedTypes);
        setRooms(loadedRooms);

        if (loadedRooms.length > 0) {
          setStep("complete");
          return;
        }

        if (loadedTypes.length > 0) {
          setSelectedType(loadedTypes[0]);
          setStep("rooms");
          const numericRoomNumbers = loadedRooms
            .map((room) => Number.parseInt(room.room_number, 10))
            .filter((value) => Number.isFinite(value));
          const firstNumber = numericRoomNumbers.length > 0
            ? Math.max(...numericRoomNumbers) + 1
            : 101;
          setRoomNumbers([String(Number.isFinite(firstNumber) ? firstNumber : 101)]);
          return;
        }

        setTypeForm({ name: "", base_price: "", capacity: "2" });
      } catch (error) {
        console.error("initial setup load:", error);
        toast.error("Impossible de charger la configuration de votre établissement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSetupState();
    return () => {
      cancelled = true;
    };
  }, [open, accommodationId]);

  useEffect(() => {
    if (step !== "rooms") return;
    setRoomNumbers((current) => {
      const next = [...current];
      while (next.length < roomCount) {
        const offset = next.length;
        next.push(String(nextRoomNumber + offset));
      }
      return next.slice(0, roomCount);
    });
  }, [roomCount, nextRoomNumber, step]);

  function closeFlow() {
    if (!saving) onClose();
  }

  function changeRoomCount(next: number) {
    setRoomCount(Math.min(50, Math.max(1, next)));
  }

  async function createRoomType() {
    if (!accommodationId) return;

    const name = typeForm.name.trim();
    const basePrice = Number.parseInt(typeForm.base_price, 10);
    const capacity = Number.parseInt(typeForm.capacity, 10);

    if (!name || !Number.isFinite(basePrice) || basePrice <= 0 || !Number.isFinite(capacity) || capacity <= 0) {
      toast.error("Renseignez le nom, le tarif par nuit et la capacité.");
      return;
    }

    if (roomTypes.some((type) => type.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error("Ce type de chambre existe déjà dans cet établissement.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("room_types")
        .insert({
          accommodation_id: accommodationId,
          name,
          description: "",
          base_price: basePrice,
          capacity,
          amenities: [],
          surface_m2: null,
          is_listed_on_trouvetou: false,
          featured_images: [],
          check_out_time: "11:00",
        })
        .select("*")
        .single();

      if (error) throw error;

      const createdType = data as unknown as RoomType;
      setRoomTypes([createdType]);
      setSelectedType(createdType);
      setRoomCount(1);
      setRoomNumbers(["101"]);
      setStep("rooms");
      toast.success("Type de chambre créé ✓");
    } catch (error) {
      console.error("initial setup type:", error);
      toast.error("Impossible de créer le type de chambre.");
    } finally {
      setSaving(false);
    }
  }

  async function createRooms() {
    if (!accommodationId || !selectedType) return;

    const normalizedNumbers = roomNumbers.map((number) => number.trim());
    if (normalizedNumbers.some((number) => !number)) {
      toast.error("Chaque chambre doit avoir un numéro.");
      return;
    }

    const uniqueNumbers = new Set(normalizedNumbers);
    if (uniqueNumbers.size !== normalizedNumbers.length) {
      toast.error("Chaque numéro de chambre doit être différent.");
      return;
    }

    const existingNumbers = new Set(rooms.map((room) => room.room_number.trim()));
    if (normalizedNumbers.some((number) => existingNumbers.has(number))) {
      toast.error("Un des numéros de chambre existe déjà.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("rooms")
        .insert(
          normalizedNumbers.map((roomNumber) => ({
            accommodation_id: accommodationId,
            room_type_id: selectedType.id,
            room_number: roomNumber,
            floor: null,
          })),
        )
        .select("*");

      if (error) throw error;

      setRooms((current) => [...current, ...((data || []) as unknown as Room[])]);
      setStep("complete");
      toast.success(`${normalizedNumbers.length} chambre${normalizedNumbers.length > 1 ? "s" : ""} ajoutée${normalizedNumbers.length > 1 ? "s" : ""} ✓`);
    } catch (error) {
      const e = error as { message?: string; code?: string };
      if (e.code === "23505" || e.message?.toLowerCase().includes("unique")) {
        toast.error("Un numéro de chambre est déjà utilisé.");
      } else {
        console.error("initial setup rooms:", error);
        toast.error("Impossible de créer les chambres.");
      }
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    onCompleted?.();
    onClose();
  }

  const progressStep = step === "type" ? 2 : step === "rooms" ? 3 : 3;

  return (
    <Modal
      open={open}
      onClose={closeFlow}
      title={step === "complete" ? "Configuration terminée" : "Configurons votre établissement"}
      description={
        step === "complete"
          ? "Votre établissement est prêt pour commencer à gérer vos chambres."
          : accommodationName
            ? accommodationName
            : "Quelques étapes simples, quand vous le souhaitez."
      }
      size="md"
    >
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-color,#0C1C33)]" />
          <p className="text-sm text-[var(--foreground-muted)]">Préparation de votre configuration…</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2" aria-label={`Étape ${progressStep} sur 3`}>
            {STEP_LABELS.map((label, index) => {
              const number = index + 1;
              const done = number < progressStep || step === "complete";
              const active = number === progressStep && step !== "complete";
              return (
                <div key={label} className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${done ? "bg-emerald-500 text-white" : active ? "bg-[var(--primary-color,#0C1C33)] text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>
                    {done ? <Check className="w-3.5 h-3.5" /> : number}
                  </span>
                  <span className={`hidden sm:block text-[10px] font-medium truncate ${active ? "text-[var(--foreground)]" : "text-[var(--foreground-subtle)]"}`}>
                    {label}
                  </span>
                  {index < 2 && <span className="h-px flex-1 bg-[var(--border)]" />}
                </div>
              );
            })}
          </div>

          {step === "type" && (
            <>
              <div className="rounded-2xl bg-[var(--primary-muted)] border border-[var(--primary-color,#0C1C33)]/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/70 dark:bg-slate-800/70 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-5 h-5 text-[var(--primary-color,#0C1C33)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">Créez votre premier type de chambre</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-1 leading-relaxed">
                      Un type regroupe les chambres qui ont les mêmes caractéristiques, par exemple « Chambre Standard ».
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Input
                  label="Nom du type de chambre *"
                  value={typeForm.name}
                  onChange={(event) => setTypeForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex. Chambre Standard"
                  disabled={saving}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Tarif par nuit *"
                    type="number"
                    min="1"
                    value={typeForm.base_price}
                    onChange={(event) => setTypeForm((current) => ({ ...current, base_price: event.target.value }))}
                    placeholder="Ex. 25000"
                    disabled={saving}
                  />
                  <Input
                    label="Capacité *"
                    type="number"
                    min="1"
                    max="50"
                    value={typeForm.capacity}
                    onChange={(event) => setTypeForm((current) => ({ ...current, capacity: event.target.value }))}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button variant="ghost" onClick={closeFlow} disabled={saving}>
                  Faire plus tard
                </Button>
                <Button onClick={() => void createRoomType()} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Créer le type de chambre
                  {!saving && <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}

          {step === "rooms" && selectedType && (
            <>
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">Ajoutez vos chambres</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  Ajoutez les chambres qui appartiennent à « {selectedType.name} ».
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center">
                    <BedDouble className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--foreground-muted)]">Type de chambre</p>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{selectedType.name}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">Combien de chambres ?</p>
                    <p className="text-[11px] text-[var(--foreground-subtle)]">Vous pourrez modifier les numéros.</p>
                  </div>
                  <div className="inline-flex items-center rounded-xl border border-[var(--border)] overflow-hidden">
                    <button type="button" onClick={() => changeRoomCount(roomCount - 1)} disabled={saving || roomCount <= 1} className="p-2.5 hover:bg-[var(--surface-hover)] disabled:opacity-40" aria-label="Réduire le nombre de chambres">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="min-w-10 text-center text-sm font-semibold tabular-nums">{roomCount}</span>
                    <button type="button" onClick={() => changeRoomCount(roomCount + 1)} disabled={saving || roomCount >= 50} className="p-2.5 hover:bg-[var(--surface-hover)] disabled:opacity-40" aria-label="Augmenter le nombre de chambres">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {roomNumbers.map((number, index) => (
                    <Input
                      key={index}
                      label={`Chambre ${index + 1}`}
                      value={number}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRoomNumbers((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
                      }}
                      disabled={saving}
                      placeholder={String(101 + index)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button variant="ghost" onClick={() => setStep("type")} disabled={saving}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Retour
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={closeFlow} disabled={saving}>
                    Faire plus tard
                  </Button>
                  <Button onClick={() => void createRooms()} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Créer {roomCount} chambre{roomCount > 1 ? "s" : ""}
                    {!saving && <ChevronRight className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === "complete" && (
            <div className="py-5 text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--foreground)]">Votre établissement est maintenant configuré</h3>
                <p className="text-xs text-[var(--foreground-muted)] mt-1.5 max-w-sm mx-auto">
                  Vous pourrez ajouter d'autres types de chambres et chambres plus tard depuis la fiche de l'établissement.
                </p>
              </div>
              <Button onClick={finish} className="gap-2">
                Aller au tableau de bord
                <Building2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
