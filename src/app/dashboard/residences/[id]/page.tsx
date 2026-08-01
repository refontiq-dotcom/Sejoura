"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, getRoomStatusLabel, getRoomStatusColor } from "@/lib/utils";
import { Plus, MapPin, Phone, BedDouble, Edit2, Trash2, Loader2, ArrowLeft, Tag, AlertCircle } from "lucide-react";
import type { Accommodation, RoomType, Room } from "@/types/database";

export default function ResidenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const residenceId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [residence, setResidence] = useState<Accommodation | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [plan, setPlan] = useState("");

  const [residenceModalOpen, setResidenceModalOpen] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ type: "room" | "type" | "residence"; id: string; name: string } | null>(null);

  const [residenceForm, setResidenceForm] = useState({ name: "", address: "", city: "", contact_phone: "" });
  const [roomForm, setRoomForm] = useState({ room_number: "", floor: "", room_type_id: "", accommodation_id: "" });
  const [typeForm, setTypeForm] = useState({ name: "", description: "", base_price: "", capacity: "2", accommodation_id: "" });
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editingType, setEditingType] = useState<RoomType | null>(null);

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData?.tenant_id) return;

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setPlan(subData.plan);

      const { data: accData } = await supabase
        .from("accommodations")
        .select("*")
        .eq("id", residenceId)
        .eq("tenant_id", userData.tenant_id)
        .single();

      if (!accData) {
        router.push("/dashboard/residences");
        return;
      }

      setResidence(accData as unknown as Accommodation);
      setResidenceForm({
        name: accData.name,
        address: accData.address || "",
        city: accData.city || "",
        contact_phone: accData.contact_phone || "",
      });

      const { data: typesData } = await supabase
        .from("room_types")
        .select("*")
        .eq("accommodation_id", residenceId);
      setRoomTypes((typesData || []) as unknown as RoomType[]);

      const { data: roomsData } = await supabase
        .from("rooms")
        .select("*")
        .eq("accommodation_id", residenceId)
        .order("room_number");
      setRooms((roomsData || []) as unknown as Room[]);
    } catch (err) {
      toast.error("Impossible de charger les données.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!residence) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Établissement introuvable</h2>
        <p className="text-slate-500 dark:text-slate-400">Cet établissement n'existe pas ou a été supprimé.</p>
        <Button onClick={() => router.push("/dashboard/residences")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour aux établissements
        </Button>
      </div>
    );
  }

  const limits = { maxAccommodations: Infinity };
  const currentTypes = roomTypes.filter((rt) => rt.accommodation_id === residenceId);

  function openEditResidenceModal() {
    setResidenceForm({
      name: residence!.name,
      address: residence!.address || "",
      city: residence!.city || "",
      contact_phone: residence!.contact_phone || "",
    });
    setResidenceModalOpen(true);
  }

  async function handleSaveResidence() {
    if (!residenceForm.name) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase
        .from("accommodations")
        .update({
          name: residenceForm.name,
          address: residenceForm.address,
          city: residenceForm.city,
          contact_phone: residenceForm.contact_phone,
        })
        .eq("id", residence!.id);

      setResidence({
        ...residence!,
        name: residenceForm.name,
        address: residenceForm.address,
        city: residenceForm.city,
        contact_phone: residenceForm.contact_phone,
      });
      setResidenceModalOpen(false);
      toast.success("Établissement modifié");
    } catch (err) {
      toast.error("Impossible d'enregistrer l'établissement.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteResidence() {
    try {
      const supabase = createClient();
      await supabase.from("accommodations").delete().eq("id", residence!.id);
      toast.success("Établissement supprimé");
      router.push("/dashboard/residences");
    } catch (err) {
      toast.error("Impossible de supprimer l'établissement.");
      console.error(err);
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
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      if (editingRoom) {
        await supabase.from("rooms").update({
          room_number: roomForm.room_number,
          floor: roomForm.floor ? parseInt(roomForm.floor) : null,
          room_type_id: roomForm.room_type_id,
        }).eq("id", editingRoom.id);
      } else {
        await supabase.from("rooms").insert({
          accommodation_id: roomForm.accommodation_id,
          room_type_id: roomForm.room_type_id,
          room_number: roomForm.room_number,
          floor: roomForm.floor ? parseInt(roomForm.floor) : null,
        });
      }
      setRoomModalOpen(false);
      loadData();
      toast.success(editingRoom ? "Chambre modifiée" : "Chambre créée");
    } catch (err) {
      toast.error("Impossible d'enregistrer la chambre.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRoom(id: string) {
    try {
      const supabase = createClient();
      await supabase.from("rooms").delete().eq("id", id);
      setRooms(rooms.filter((r) => r.id !== id));
      toast.success("Chambre supprimée");
    } catch (err) {
      toast.error("Impossible de supprimer la chambre.");
      console.error(err);
    }
  }

  function openAddTypeModal() {
    setEditingType(null);
    setTypeForm({ name: "", description: "", base_price: "", capacity: "2", accommodation_id: residenceId });
    setTypeModalOpen(true);
  }

  function openEditTypeModal(rt: RoomType) {
    setEditingType(rt);
    setTypeForm({ name: rt.name, description: rt.description || "", base_price: rt.base_price.toString(), capacity: rt.capacity.toString(), accommodation_id: rt.accommodation_id });
    setTypeModalOpen(true);
  }

  async function saveType() {
    if (!typeForm.name || !typeForm.base_price) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      if (editingType) {
        await supabase.from("room_types").update({
          name: typeForm.name,
          description: typeForm.description,
          base_price: parseInt(typeForm.base_price),
          capacity: parseInt(typeForm.capacity),
        }).eq("id", editingType.id);
      } else {
        await supabase.from("room_types").insert({
          accommodation_id: typeForm.accommodation_id,
          name: typeForm.name,
          description: typeForm.description,
          base_price: parseInt(typeForm.base_price),
          capacity: parseInt(typeForm.capacity),
        });
      }
      setTypeModalOpen(false);
      loadData();
      toast.success(editingType ? "Type de chambre modifié" : "Type de chambre créé");
    } catch (err) {
      toast.error("Impossible d'enregistrer le type de chambre.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteType(id: string) {
    try {
      const supabase = createClient();
      await supabase.from("room_types").delete().eq("id", id);
      setRoomTypes(roomTypes.filter((rt) => rt.id !== id));
      toast.success("Type de chambre supprimé");
    } catch (err) {
      toast.error("Impossible de supprimer le type de chambre.");
      console.error(err);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/residences")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Retour
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{residence.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {rooms.length} chambre{rooms.length > 1 ? "s" : ""} · {currentTypes.length} type{currentTypes.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEditResidenceModal}>
            <Edit2 className="w-4 h-4" /> Modifier l&apos;établissement
          </Button>
           <Button variant="outline" onClick={() => { setDeleteItem({ type: "residence", id: residence.id, name: residence.name }); setDeleteConfirmOpen(true); }} className="text-red-600 hover:text-red-700" title="Supprimer l'établissement">
             <Trash2 className="w-4 h-4" />
           </Button>
        </div>
      </div>

      {/* Infos établissement */}
      <Card className="p-5 border-t-4 border-t-indigo-500 dark:border-t-indigo-400">
        <div className="flex items-start">
          <div className="space-y-2">
            {(residence.address || residence.city) && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span>{residence.address}{residence.address && residence.city ? ", " : ""}{residence.city}</span>
              </div>
            )}
            {residence.contact_phone && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span>{residence.contact_phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <BedDouble className="w-4 h-4 flex-shrink-0" />
              <span>{residence.total_rooms} chambre{residence.total_rooms > 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Types de chambre */}
      <Card className="p-5 border-t-4 border-t-indigo-500 dark:border-t-indigo-400">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Types de chambre</h2>
          <Button size="sm" variant="outline" onClick={openAddTypeModal}>
            <Plus className="w-4 h-4" /> Type de chambre
          </Button>
        </div>
        {currentTypes.length === 0 ? (
          <div className="text-center py-6">
            <Tag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Aucun type de chambre</p>
            <Button size="sm" onClick={openAddTypeModal}>
              <Plus className="w-4 h-4" /> Créer un type de chambre
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {currentTypes.map((rt) => (
              <div key={rt.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEditTypeModal(rt)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" title="Modifier le type de chambre">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setDeleteItem({ type: "type", id: rt.id, name: rt.name }); setDeleteConfirmOpen(true); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" title="Supprimer le type de chambre">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="font-medium text-slate-900 dark:text-white">{rt.name}</p>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-1">{formatFCFA(rt.base_price)}</p>
                <p className="text-xs text-slate-400 mt-1">{rt.capacity} personne{rt.capacity > 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Chambres */}
      <Card className="p-5 border-t-4 border-t-indigo-500 dark:border-t-indigo-400">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Chambres ({rooms.length})
          </h2>
          <Button onClick={openAddRoomModal} disabled={currentTypes.length === 0}>
            <Plus className="w-4 h-4" /> Ajouter une chambre
          </Button>
        </div>
        {currentTypes.length === 0 ? (
          <div className="text-center py-8">
            <Tag className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Créez d&apos;abord un type de chambre</p>
            <Button size="sm" onClick={openAddTypeModal}>
              <Plus className="w-4 h-4" /> Créer un type de chambre
            </Button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-8">
            <BedDouble className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Aucune chambre dans cet établissement</p>
            <Button size="sm" onClick={openAddRoomModal}>
              <Plus className="w-4 h-4" /> Ajouter une chambre
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {rooms.map((room) => {
              const rt = roomTypes.find((t) => t.id === room.room_type_id);
              return (
                    <div
                      key={room.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BedDouble className="w-5 h-5 text-slate-400" />
                          <p className="text-lg font-bold text-slate-900 dark:text-white">{room.room_number}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRoomStatusColor(room.status)}`}>
                            {getRoomStatusLabel(room.status)}
                          </span>
                          <button
                            onClick={() => openEditRoomModal(room)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="Modifier la chambre"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setDeleteItem({ type: "room", id: room.id, name: room.room_number }); setDeleteConfirmOpen(true); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Supprimer la chambre"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{rt?.name || "—"}</p>
                      {rt && <p className="text-xs text-indigo-500 mt-0.5">{formatFCFA(rt.base_price)}</p>}
                      {room.floor && <p className="text-xs text-slate-400 mt-1">Étage {room.floor}</p>}
                    </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal Établissement */}
      <Modal open={residenceModalOpen} onClose={() => setResidenceModalOpen(false)} title="Modifier l'établissement" description="Renseignez les informations de votre établissement">
        <div className="space-y-4">
          <Input label="Nom de l'établissement" value={residenceForm.name} onChange={(e) => setResidenceForm({ ...residenceForm, name: e.target.value })} placeholder="Ex: Hôtel Palm Beach" />
          <Input label="Adresse" value={residenceForm.address} onChange={(e) => setResidenceForm({ ...residenceForm, address: e.target.value })} placeholder="Cocody Riviera 2" />
          <Input label="Ville" value={residenceForm.city} onChange={(e) => setResidenceForm({ ...residenceForm, city: e.target.value })} placeholder="Abidjan" />
          <Input label="Téléphone de contact" value={residenceForm.contact_phone} onChange={(e) => setResidenceForm({ ...residenceForm, contact_phone: e.target.value })} placeholder="+225 07 00 00 00 00" />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setResidenceModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSaveResidence} loading={loading}>Enregistrer</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Chambre */}
      <Modal open={roomModalOpen} onClose={() => setRoomModalOpen(false)} title={editingRoom ? "Modifier la chambre" : "Ajouter une chambre"}>
        <div className="space-y-4">
          <Input label="Nom / Numéro (ex: 101, A-12, Villa 3)" value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} placeholder="101" required />
          <Input label="Étage (optionnel)" type="number" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} placeholder="1" min="0" />
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type de chambre *</label>
            <select
              value={roomForm.room_type_id}
              onChange={(e) => setRoomForm({ ...roomForm, room_type_id: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              <option value="">Sélectionner un type de chambre</option>
              {currentTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name} — {formatFCFA(rt.base_price)}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRoomModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={saveRoom} loading={loading}>{editingRoom ? "Enregistrer" : "Créer"}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Type */}
      <Modal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} title={editingType ? "Modifier le type de chambre" : "Nouveau type de chambre"}>
        <div className="space-y-4">
          <Input 
            label="Type de chambre (ex: Chambre, Studio, Appartement, Suite)" 
            value={typeForm.name} 
            onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} 
            placeholder="Studio" 
            list="accommodation-types"
            required 
          />
          <datalist id="accommodation-types">
            <option value="Chambre" />
            <option value="Studio" />
            <option value="Appartement" />
            <option value="Suite" />
            <option value="Villa" />
          </datalist>
          <Input label="Description (optionnelle)" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="Grand studio avec cuisine équipée" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Prix de base (FCFA)" type="number" value={typeForm.base_price} onChange={(e) => setTypeForm({ ...typeForm, base_price: e.target.value })} placeholder="15000" min="0" required />
            <Input label="Capacité (personnes)" type="number" value={typeForm.capacity} onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })} placeholder="2" min="1" required />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setTypeModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={saveType} loading={loading}>{editingType ? "Enregistrer" : "Créer"}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Confirmation" description="Êtes-vous sûr de vouloir supprimer cet élément ?">
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>Annuler</Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={async () => {
              if (!deleteItem) return;
              if (deleteItem.type === "room") await deleteRoom(deleteItem.id);
              else if (deleteItem.type === "type") await deleteType(deleteItem.id);
              else if (deleteItem.type === "residence") await handleDeleteResidence();
              setDeleteConfirmOpen(false);
              setDeleteItem(null);
            }}
            loading={loading}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
