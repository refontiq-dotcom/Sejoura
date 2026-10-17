"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import { getRoomStatusLabel, getRoomStatusColor } from "@/lib/utils";
import { Plus, MapPin, Phone, BedDouble, Edit2, Trash2, Loader2, ArrowLeft, Tag, AlertCircle, Eye, Ruler, Store } from "lucide-react";
import { RoomTypeForm } from "@/components/dashboard/room-type-form";
import {
  EMPTY_ROOM_TYPE_FORM,
  toRoomTypeInsertPayload,
  toRoomTypeUpdatePayload,
  validateRoomTypeForm,
  type RoomTypeFormErrors,
  type RoomTypeFormState,
} from "@/lib/validations/rooms";
import { describeRoomTypeError } from "@/lib/room-type-errors";
import type { Accommodation, RoomType, Room } from "@/types/database";
import { useCurrentUser } from "@/contexts/current-user-context";

export default function ResidenceDetailPage() {
  const { fmt, symbol } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const residenceId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { user, tenantId } = useCurrentUser();
  const isReadOnly = user?.role === "receptionniste";
  const [residence, setResidence] = useState<Accommodation | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [residenceModalOpen, setResidenceModalOpen] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ type: "room" | "type" | "residence"; id: string; name: string } | null>(null);

  const [residenceForm, setResidenceForm] = useState({ name: "", accommodation_type: "residence", address: "", city: "", contact_phone: "", latitude: "", longitude: "" });
  const [roomForm, setRoomForm] = useState({ room_number: "", floor: "", room_type_id: "", accommodation_id: "" });
  const [typeForm, setTypeForm] = useState<RoomTypeFormState>({ ...EMPTY_ROOM_TYPE_FORM });
  const [typeErrors, setTypeErrors] = useState<RoomTypeFormErrors>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [roomNumberError, setRoomNumberError] = useState("");

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceId, tenantId]);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const supabase = createClient();
      // tenantId et role viennent désormais du contexte partagé (déjà
      // chargés par le layout) — plus besoin de revérifier la session ici.
      if (!tenantId) return;

      const { data: accData } = await supabase
        .from("accommodations")
        .select("*")
        .eq("id", residenceId)
        .eq("tenant_id", tenantId)
        .single();

      if (!accData) {
        router.push("/dashboard/residences");
        return;
      }

      setResidence(accData as unknown as Accommodation);
      setResidenceForm({
        name: accData.name,
        accommodation_type: accData.accommodation_type === "hotel" ? "hotel" : "residence",
        address: accData.address || "",
        city: accData.city || "",
        contact_phone: accData.contact_phone || "",
        latitude: accData.latitude != null ? accData.latitude.toString() : "",
        longitude: accData.longitude != null ? accData.longitude.toString() : "",
      });

      const [typesResult, roomsResult] = await Promise.all([
        supabase.from("room_types").select("*").eq("accommodation_id", residenceId),
        supabase.from("rooms").select("*").eq("accommodation_id", residenceId).order("room_number"),
      ]);
      setRoomTypes((typesResult.data || []) as unknown as RoomType[]);
      setRooms((roomsResult.data || []) as unknown as Room[]);
    } catch (err) {
      toast.error("Les données sont introuvables 🤔");
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  if (!residence) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-3 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Établissement introuvable</h2>
        <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Cet établissement n&apos;existe pas ou a été supprimé.</p>
        <Button onClick={() => router.push("/dashboard/residences")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour aux établissements
        </Button>
      </div>
    );
  }

  const currentTypes = roomTypes.filter((rt) => rt.accommodation_id === residenceId);

  function openEditResidenceModal() {
    setResidenceForm({
      name: residence!.name,
      accommodation_type: residence!.accommodation_type === "hotel" ? "hotel" : "residence",
      address: residence!.address || "",
      city: residence!.city || "",
      contact_phone: residence!.contact_phone || "",
      latitude: residence!.latitude != null ? residence!.latitude.toString() : "",
      longitude: residence!.longitude != null ? residence!.longitude.toString() : "",
    });
    setResidenceModalOpen(true);
  }

  async function handleSaveResidence() {
    if (!residenceForm.name) {
      toast.error("Le nom de l'établissement est requis.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("accommodations")
        .update({
          name: residenceForm.name,
          accommodation_type: residenceForm.accommodation_type === "hotel" ? "hotel" : "residence",
          address: residenceForm.address,
          city: residenceForm.city,
          contact_phone: residenceForm.contact_phone,
          latitude: residenceForm.latitude ? parseFloat(residenceForm.latitude) : null,
          longitude: residenceForm.longitude ? parseFloat(residenceForm.longitude) : null,
        })
        .eq("id", residence!.id);
      if (error) throw error;

      setResidence({
        ...residence!,
        name: residenceForm.name,
        accommodation_type: residenceForm.accommodation_type === "hotel" ? "hotel" : "residence",
        address: residenceForm.address,
        city: residenceForm.city,
        contact_phone: residenceForm.contact_phone,
        latitude: residenceForm.latitude ? parseFloat(residenceForm.latitude) : null,
        longitude: residenceForm.longitude ? parseFloat(residenceForm.longitude) : null,
      });
      setResidenceModalOpen(false);
      toast.success("Établissement modifié ✏️");
    } catch (err) {
      toast.error("L'action a échoué : enregistrer l'établissement.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteResidence(): Promise<boolean> {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("accommodations").delete().eq("id", residence!.id);
      if (error) throw error;
      toast.success("Établissement supprimé 🗑️");
      router.push("/dashboard/residences");
      return true;
    } catch (err) {
      toast.error("La suppression a échoué : établissement.");
      console.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openAddRoomModal() {
    setEditingRoom(null);
    setRoomForm({
      room_number: "",
      floor: "",
      room_type_id: currentTypes[0]?.id || "",
      accommodation_id: residenceId,
    });
    setRoomModalOpen(true);
  }

  function openEditRoomModal(room: Room) {
    setEditingRoom(room);
    setRoomForm({
      room_number: room.room_number,
      floor: room.floor?.toString() || "",
      room_type_id: room.room_type_id,
      accommodation_id: room.accommodation_id,
    });
    setRoomModalOpen(true);
  }

  async function saveRoom() {
    if (!roomForm.room_number || !roomForm.room_type_id) {
      toast.error("Il manque des champs obligatoires ! Remplissez tout 📋");
      return;
    }
    setSaving(true);
    setRoomNumberError("");
    try {
      const supabase = createClient();
      const { error } = editingRoom
        ? await supabase.from("rooms").update({
            room_number: roomForm.room_number,
            floor: roomForm.floor ? parseInt(roomForm.floor) : null,
            room_type_id: roomForm.room_type_id,
          }).eq("id", editingRoom.id)
        : await supabase.from("rooms").insert({
            accommodation_id: roomForm.accommodation_id,
            room_type_id: roomForm.room_type_id,
            room_number: roomForm.room_number,
            floor: roomForm.floor ? parseInt(roomForm.floor) : null,
          });
      if (error) throw error;
      setRoomModalOpen(false);
      loadData(true);
      toast.success(editingRoom ? "Chambre modifiée" : "Chambre créée");
    } catch (err) {
      const e = err as { message?: string; code?: string };
      const message = e?.message || "";
      const code = e?.code || "";
      if (code === "23505" || message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")) {
        const errorMessage = "Ce numéro de chambre est déjà utilisé. Veuillez en choisir un autre.";
        setRoomNumberError(errorMessage);
        toast.error(errorMessage);
      } else {
        toast.error("L'action a échoué : enregistrer la chambre.");
      }
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoom(id: string): Promise<boolean> {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
      setRooms(rooms.filter((r) => r.id !== id));
      toast.success("Chambre supprimée 🗑️");
      return true;
    } catch (err) {
      toast.error("La chambre n'a pas pu être supprimée 🛏️");
      console.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openAddTypeModal() {
    setEditingType(null);
    setTypeErrors({});
    setTypeForm({ ...EMPTY_ROOM_TYPE_FORM, accommodation_id: residenceId });
    setTypeModalOpen(true);
  }

  function openEditTypeModal(rt: RoomType) {
    setEditingType(rt);
    setTypeErrors({});
    setTypeForm({
      name: rt.name,
      description: rt.description || "",
      base_price: rt.base_price.toString(),
      capacity: rt.capacity.toString(),
      accommodation_id: rt.accommodation_id,
      amenities: rt.amenities || [],
      surface_m2: rt.surface_m2 ? rt.surface_m2.toString() : "",
      is_listed_on_trouvetou: rt.is_listed_on_trouvetou,
      featured_images: (rt.featured_images || []).slice(0, 4),
      check_out_time: (rt.check_out_time || "11:00").slice(0, 5),
    });
    setTypeModalOpen(true);
  }

  async function uploadTypeImage(file: File) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("La photo dépasse 12 Mo. Réduisez-la 📸");
      return;
    }
    setUploadingImage(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expirée. Reconnectez-vous 🔐");
        return;
      }
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/v1/trouvetou/upload-photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "L'envoi de la photo a échoué.");
        return;
      }
      setTypeForm((prev) => ({
        ...prev,
        featured_images: prev.featured_images.length < 4 && !prev.featured_images.includes(data.url)
          ? [...prev.featured_images, data.url]
          : prev.featured_images,
      }));
      toast.success("Photo ajoutée avec succès 📸");
    } catch {
      toast.error("Erreur lors de l'upload de la photo.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function saveType() {
    // Noms déjà pris dans cet établissement (hors le type en cours de modification).
    const siblingNames = roomTypes
      .filter((rt) => rt.accommodation_id === residenceId && rt.id !== editingType?.id)
      .map((rt) => rt.name);

    const result = validateRoomTypeForm(typeForm, { existingNames: siblingNames });
    if (!result.success) {
      setTypeErrors(result.errors);
      toast.error("Corrigez les champs signalés en rouge.");
      return;
    }
    setTypeErrors({});

    setSaving(true);
    try {
      const supabase = createClient();
      let typeId = editingType?.id || "";
      if (editingType) {
        const { error } = await supabase
          .from("room_types")
          .update(toRoomTypeUpdatePayload(result.data))
          .eq("id", editingType.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("room_types")
          .insert(toRoomTypeInsertPayload(result.data))
          .select("id")
          .single();
        if (error) throw error;
        typeId = created?.id || "";
      }

      // Synchronisation Trouvetou : l'interrupteur du type pilote la fiche publique.
      // Inutile (et coûteuse : elle repousse tous les listings du tenant) tant que le
      // type n'a jamais été diffusé ; indispensable s'il l'est ou vient de l'être
      // (changement de prix, de photos, ou retrait de la diffusion).
      const wasListed = editingType?.is_listed_on_trouvetou === true;
      const syncError =
        typeId && (result.data.is_listed_on_trouvetou || wasListed)
          ? await syncTrouvetouForType(typeId)
          : null;

      // Synchronisation intelligente de l'heure de sortie : dès que l'heure de
      // départ du type change, les réservations actives (confirmées / arrivées)
      // des chambres concernées sont mises à jour automatiquement (trigger en
      // base). Cette RPC fournit uniquement le nombre de réservations impactées
      // pour informer le gérant.
      if (editingType) {
        await syncCheckoutTimeForType(typeId);
      }

      setTypeModalOpen(false);
      loadData(true);

      const savedLabel = editingType ? "Type de chambre modifié" : "Type de chambre créé";
      if (syncError) {
        // Le type est bien enregistré : on ne l'annonce pas comme un échec total.
        toast.warning(`${savedLabel}, mais la synchronisation Trouvetou a échoué : ${syncError}`);
      } else {
        toast.success(savedLabel);
      }
    } catch (err) {
      console.error("[room_types] save error:", err);
      toast.error(describeRoomTypeError(err as { code?: string; message?: string }, "save"));
    } finally {
      setSaving(false);
    }
  }

  /** Renvoie null si la synchronisation a réussi, sinon un message d'erreur lisible. */
  async function syncTrouvetouForType(typeId: string): Promise<string | null> {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return "session expirée, reconnectez-vous.";

      const res = await fetch("/api/v1/trouvetou/sync-type", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ roomTypeId: typeId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return data?.error || "impossible de synchroniser la visibilité.";
      }
      if (data?.trouvetouPush && data.trouvetouPush.ok === false) {
        return data.trouvetouPush.error || "le portail n'a pas accepté la mise à jour.";
      }
      return null;
    } catch (err) {
      console.error("syncTrouvetouForType error:", err);
      return "connexion impossible.";
    }
  }

  // Applique la nouvelle heure de sortie aux réservations actives des chambres
  // de ce type (le trigger en base fait le travail ; la RPC renvoie le nombre
  // de réservations impactées pour le confirmer au gérant).
  async function syncCheckoutTimeForType(typeId: string) {
    try {
      const supabase = createClient();
      const { data: count, error } = await supabase.rpc("sync_room_type_checkout_time", {
        p_room_type_id: typeId,
      });
      if (!error && typeof count === "number" && count > 0) {
        toast.success(
          `${count} réservation${count > 1 ? "s" : ""} mise${count > 1 ? "s" : ""} à jour avec la nouvelle heure de sortie.`
        );
      }
    } catch (err) {
      // Silencieux : la synchronisation automatique reste assurée par le trigger.
      console.error("syncCheckoutTimeForType error:", err);
    }
  }

  async function deleteType(id: string): Promise<boolean> {
    // Garde-fou côté interface ; la base refuse aussi (clé étrangère NO ACTION).
    if (rooms.some((room) => room.room_type_id === id)) {
      toast.error("Ce type contient encore des chambres. Supprimez ou déplacez-les d'abord.");
      return false;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("room_types").delete().eq("id", id);
      if (error) throw error;
      setRoomTypes(roomTypes.filter((rt) => rt.id !== id));
      toast.success("Type de chambre supprimé 🗑️");
      return true;
    } catch (err) {
      console.error("[room_types] delete error:", err);
      toast.error(describeRoomTypeError(err as { code?: string; message?: string }, "delete"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const deleteTypeRoomCount =
    deleteItem?.type === "type" ? rooms.filter((room) => room.room_type_id === deleteItem.id).length : 0;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/residences")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Retour
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{residence.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {(residence.address || residence.city) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                {residence.address}{residence.address && residence.city ? ", " : ""}{residence.city}
              </span>
            )}
            {residence.contact_phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-4 h-4 flex-shrink-0" />
                {residence.contact_phone}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <BedDouble className="w-4 h-4 flex-shrink-0" />
              {rooms.length} chambre{rooms.length > 1 ? "s" : ""} · {currentTypes.length} type{currentTypes.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {isReadOnly ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Lecture seule</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEditResidenceModal}>
              <Edit2 className="w-4 h-4" /> Modifier l&apos;établissement
            </Button>
             <Button variant="outline" onClick={() => { setDeleteItem({ type: "residence", id: residence.id, name: residence.name }); setDeleteConfirmOpen(true); }} className="text-red-600 hover:text-red-700" title="Supprimer l'établissement" aria-label="Supprimer l'établissement">
               <Trash2 className="w-4 h-4" />
             </Button>
          </div>
        )}
      </div>

      {/* Types de chambre */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Types de chambre</h2>
          {!isReadOnly && (
            <Button size="sm" variant="outline" onClick={openAddTypeModal}>
              <Plus className="w-4 h-4" /> Type de chambre
            </Button>
          )}
        </div>
        {currentTypes.length === 0 ? (
          <div className="text-center py-6">
            <Tag className="w-8 h-8 text-slate-300 dark:text-slate-600 dark:text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-3">Aucun type de chambre</p>
            {!isReadOnly && (
              <Button size="sm" onClick={openAddTypeModal}>
                <Plus className="w-4 h-4" /> Créer un type de chambre
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {currentTypes.map((rt) => (
              <div key={rt.id} className="p-2.5 rounded-md border border-slate-200 dark:border-slate-700 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="w-8 h-8 rounded-md bg-[var(--primary-muted)] flex items-center justify-center">
                    <Tag className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
                  </div>
                  {!isReadOnly && (
                    <div className="flex gap-0.5">
                      <button onClick={() => openEditTypeModal(rt)} className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" title="Modifier le type de chambre" aria-label="Modifier le type de chambre">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setDeleteItem({ type: "type", id: rt.id, name: rt.name }); setDeleteConfirmOpen(true); }} className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-600" title="Supprimer le type de chambre" aria-label="Supprimer le type de chambre">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{rt.name}</p>
                <p className="text-base font-bold text-[var(--primary-color,#0C1C33)] mt-0.5">{fmt(rt.base_price)}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{rt.capacity} personne{rt.capacity > 1 ? "s" : ""}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {rt.surface_m2 ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                      <Ruler className="w-3 h-3" /> {rt.surface_m2} m²
                    </span>
                  ) : null}
                  {rt.is_listed_on_trouvetou ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                      <Store className="w-3 h-3" /> Trouvetou
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                      Hors Trouvetou
                    </span>
                  )}
                </div>
                {rt.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1.5">
                    {rt.amenities.slice(0, 3).map((a) => (
                      <span key={a} className="px-1 py-px rounded bg-slate-50 dark:bg-slate-700/50 text-[10px] text-slate-500 dark:text-slate-400">{a}</span>
                    ))}
                    {rt.amenities.length > 3 && (
                      <span className="px-1 py-px rounded text-[10px] text-slate-400 dark:text-slate-500">+{rt.amenities.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Chambres */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Chambres ({rooms.length})
          </h2>
          {!isReadOnly && (
            <Button onClick={openAddRoomModal} disabled={currentTypes.length === 0}>
              <Plus className="w-4 h-4" /> Ajouter une chambre
            </Button>
          )}
        </div>
        {currentTypes.length === 0 ? (
          <div className="text-center py-8">
            <Tag className="w-10 h-10 text-slate-300 dark:text-slate-600 dark:text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Créez d&apos;abord un type de chambre</p>
            {!isReadOnly && (
              <Button size="sm" onClick={openAddTypeModal}>
                <Plus className="w-4 h-4" /> Créer un type de chambre
              </Button>
            )}
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-8">
            <BedDouble className="w-10 h-10 text-slate-300 dark:text-slate-600 dark:text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Aucune chambre dans cet établissement</p>
            {!isReadOnly && (
              <Button size="sm" onClick={openAddRoomModal}>
                <Plus className="w-4 h-4" /> Ajouter une chambre
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {rooms.map((room) => {
              const rt = roomTypes.find((t) => t.id === room.room_type_id);
              return (
                    <div
                      key={room.id}
                      className="p-2.5 rounded-md border border-slate-200 dark:border-slate-700 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <BedDouble className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          <p className="text-base font-bold text-slate-900 dark:text-white">{room.room_number}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${getRoomStatusColor(room.status)}`}>
                            {getRoomStatusLabel(room.status)}
                          </span>
                          {!isReadOnly && (
                            <>
                              <button
                                onClick={() => openEditRoomModal(room)}
                                className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Modifier la chambre"
                                aria-label="Modifier la chambre"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setDeleteItem({ type: "room", id: room.id, name: room.room_number }); setDeleteConfirmOpen(true); }}
                                className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-600"
                                title="Supprimer la chambre"
                                aria-label="Supprimer la chambre"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{rt?.name || "—"}</p>
                      {rt && !isReadOnly && <p className="text-[11px] text-[var(--primary-color,#0C1C33)] font-medium mt-0.5">{fmt(rt.base_price)}</p>}
                      {room.floor && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Étage {room.floor}</p>}
                    </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal Établissement */}
      {!isReadOnly && (
        <Modal open={residenceModalOpen} onClose={() => setResidenceModalOpen(false)} title="Modifier l'établissement" description="Renseignez les informations de votre établissement">
          <div className="space-y-3">
            <Input label="Nom de l'établissement" value={residenceForm.name} onChange={(e) => setResidenceForm({ ...residenceForm, name: e.target.value })} placeholder="Ex: Hôtel Palm Beach" />
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">Type d&apos;établissement</label>
              <select
                value={residenceForm.accommodation_type}
                onChange={(e) => setResidenceForm({ ...residenceForm, accommodation_type: e.target.value })}
                className="w-full px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                <option value="residence">Résidence meublée (BnB)</option>
                <option value="hotel">Hôtel</option>
              </select>
            </div>
            <Input label="Adresse" value={residenceForm.address} onChange={(e) => setResidenceForm({ ...residenceForm, address: e.target.value })} placeholder="Cocody Riviera 2" />
            <Input label="Ville" value={residenceForm.city} onChange={(e) => setResidenceForm({ ...residenceForm, city: e.target.value })} placeholder="Abidjan" />
            <Input label="Téléphone de contact" value={residenceForm.contact_phone} onChange={(e) => setResidenceForm({ ...residenceForm, contact_phone: e.target.value })} placeholder="+225 07 00 00 00 00" />
            <div className="grid grid-cols-2 gap-2.5">
              <Input label="Latitude (optionnel)" type="number" step="any" value={residenceForm.latitude} onChange={(e) => setResidenceForm({ ...residenceForm, latitude: e.target.value })} placeholder="5.3453170" />
              <Input label="Longitude (optionnel)" type="number" step="any" value={residenceForm.longitude} onChange={(e) => setResidenceForm({ ...residenceForm, longitude: e.target.value })} placeholder="-4.0082560" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setResidenceModalOpen(false)}>Annuler</Button>
              <Button className="flex-1" onClick={handleSaveResidence} loading={saving}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Chambre */}
      {!isReadOnly && (
        <Modal open={roomModalOpen} onClose={() => { setRoomModalOpen(false); setRoomNumberError(""); }} title={editingRoom ? "Modifier la chambre" : "Ajouter une chambre"}>
          <div className="space-y-3">
            <div>
              <Input label="Nom / Numéro (ex: 101, A-12, Villa 3)" value={roomForm.room_number} onChange={(e) => { setRoomForm({ ...roomForm, room_number: e.target.value }); setRoomNumberError(""); }} placeholder="101" required />
              {roomNumberError && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {roomNumberError}
                </p>
              )}
            </div>
            <Input label="Étage (optionnel)" type="number" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} placeholder="1" min="0" />
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">Type de chambre *</label>
              <select
                value={roomForm.room_type_id}
                onChange={(e) => setRoomForm({ ...roomForm, room_type_id: e.target.value })}
                className="w-full px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
                required
              >
                <option value="">Sélectionner un type de chambre</option>
                {currentTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>{rt.name} — {fmt(rt.base_price)}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setRoomModalOpen(false)}>Annuler</Button>
              <Button className="flex-1" onClick={saveRoom} loading={saving}>{editingRoom ? "Enregistrer" : "Créer"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Type */}
      {!isReadOnly && (
        <Modal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} title={editingType ? "Modifier le type de chambre" : "Nouveau type de chambre"}>
          <div className="space-y-3">
            <RoomTypeForm
              value={typeForm}
              onChange={setTypeForm}
              errors={typeErrors}
              currencySymbol={symbol}
              onUploadPhoto={uploadTypeImage}
              uploadingPhoto={uploadingImage}
              disabled={saving}
            />
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setTypeModalOpen(false)} disabled={saving}>Annuler</Button>
              <Button className="flex-1" onClick={saveType} loading={saving}>{editingType ? "Enregistrer" : "Créer"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {!isReadOnly && (
        <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Confirmation" description={
          deleteItem?.type === "type"
            ? deleteTypeRoomCount > 0
              ? `Le type « ${deleteItem.name} » contient ${deleteTypeRoomCount} chambre${deleteTypeRoomCount > 1 ? "s" : ""}. Supprimez ou déplacez-les avant de supprimer ce type.`
              : `Supprimer le type « ${deleteItem.name} » ?`
            : "Êtes-vous sûr de vouloir supprimer cet élément ?"
        }>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>Annuler</Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!deleteItem) return;
                let ok = false;
                if (deleteItem.type === "room") ok = await deleteRoom(deleteItem.id);
                else if (deleteItem.type === "type") ok = await deleteType(deleteItem.id);
                else if (deleteItem.type === "residence") ok = await handleDeleteResidence();
                if (ok) {
                  setDeleteConfirmOpen(false);
                  setDeleteItem(null);
                }
              }}
              loading={saving}
              disabled={deleteItem?.type === "type" && deleteTypeRoomCount > 0}
            >
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}