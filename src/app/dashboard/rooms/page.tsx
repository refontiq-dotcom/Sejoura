"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, getRoomStatusLabel, getRoomStatusColor } from "@/lib/utils";
import { BedDouble, Plus, Edit2, Trash2, Loader2, Building2, Tag } from "lucide-react";
import type { Accommodation, RoomType, Room } from "@/types/database";

export default function RoomsPage() {
  const [loading, setLoading] = useState(true);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedAcc, setSelectedAcc] = useState<string>("");
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [roomForm, setRoomForm] = useState({ room_number: "", floor: "", room_type_id: "", accommodation_id: "" });
  const [typeForm, setTypeForm] = useState({ name: "", description: "", base_price: "", capacity: "2", accommodation_id: "" });

  useEffect(() => {
    loadData();
  }, []);

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

      const { data: accData } = await supabase
        .from("accommodations")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("name");
      if (accData) {
        setAccommodations(accData as unknown as Accommodation[]);
        if (accData.length > 0 && !selectedAcc) {
          setSelectedAcc(accData[0].id);
        }
      }

      // Charger tous les types de chambres
      if (accData && accData.length > 0) {
        const { data: typesData } = await supabase
          .from("room_types")
          .select("*")
          .in("accommodation_id", accData.map((a: { id: string }) => a.id));
        if (typesData) setRoomTypes(typesData as unknown as RoomType[]);
      }
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedAcc) loadRooms();
  }, [selectedAcc]);

  async function loadRooms() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("rooms")
        .select("*")
        .eq("accommodation_id", selectedAcc)
        .order("room_number");
      if (data) setRooms(data as unknown as Room[]);
    } catch {
      // Erreur silencieuse
    }
  }

  function openAddRoomModal() {
    setEditingRoom(null);
    setRoomForm({ room_number: "", floor: "", room_type_id: roomTypes.find(rt => rt.accommodation_id === selectedAcc)?.id || "", accommodation_id: selectedAcc });
    setRoomModalOpen(true);
  }

  function openEditRoomModal(room: Room) {
    setEditingRoom(room);
    setRoomForm({ room_number: room.room_number, floor: room.floor?.toString() || "", room_type_id: room.room_type_id, accommodation_id: room.accommodation_id });
    setRoomModalOpen(true);
  }

  function openAddTypeModal() {
    setEditingType(null);
    setTypeForm({ name: "", description: "", base_price: "", capacity: "2", accommodation_id: selectedAcc });
    setTypeModalOpen(true);
  }

  function openEditTypeModal(rt: RoomType) {
    setEditingType(rt);
    setTypeForm({ name: rt.name, description: rt.description || "", base_price: rt.base_price.toString(), capacity: rt.capacity.toString(), accommodation_id: rt.accommodation_id });
    setTypeModalOpen(true);
  }

  async function saveRoom() {
    if (!roomForm.room_number || !roomForm.room_type_id) return;
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
      loadRooms();
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function saveType() {
    if (!typeForm.name || !typeForm.base_price) return;
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
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function deleteRoom(id: string) {
    if (!confirm("Supprimer cette chambre ?")) return;
    try {
      const supabase = createClient();
      await supabase.from("rooms").delete().eq("id", id);
      loadRooms();
    } catch {
      // Erreur silencieuse
    }
  }

  async function deleteType(id: string) {
    if (!confirm("Supprimer ce type de chambre ? Les chambres associées seront aussi supprimées.")) return;
    try {
      const supabase = createClient();
      await supabase.from("room_types").delete().eq("id", id);
      loadData();
    } catch {
      // Erreur silencieuse
    }
  }

  if (loading && accommodations.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const currentTypes = roomTypes.filter(rt => rt.accommodation_id === selectedAcc);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Chambres</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gérez vos chambres et types de tarification</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openAddTypeModal}>
            <Tag className="w-4 h-4" /> Type de chambre
          </Button>
          <Button onClick={openAddRoomModal} disabled={!selectedAcc || currentTypes.length === 0}>
            <Plus className="w-4 h-4" /> Chambre
          </Button>
        </div>
      </div>

      {/* Sélecteur de résidence */}
      {accommodations.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {accommodations.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAcc(acc.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedAcc === acc.id
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              {acc.name}
            </button>
          ))}
        </div>
      )}

      {accommodations.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune résidence</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Ajoutez d'abord une résidence</p>
          <Button onClick={() => window.location.href = "/dashboard/residences"}>
            <Building2 className="w-4 h-4" /> Aller aux résidences
          </Button>
        </Card>
      ) : (
        <>
          {/* Types de chambres */}
          {currentTypes.length > 0 && (
            <Card className="p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Types de chambres</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {currentTypes.map((rt) => (
                  <div key={rt.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditTypeModal(rt)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteType(rt.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="font-medium text-slate-900 dark:text-white">{rt.name}</p>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-1">{formatFCFA(rt.base_price)}</p>
                    <p className="text-xs text-slate-400 mt-1">{rt.capacity} personne{rt.capacity > 1 ? "s" : ""}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Grille des chambres */}
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Chambres ({rooms.length})
            </h2>
            {currentTypes.length === 0 ? (
              <div className="text-center py-8">
                <Tag className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Créez d'abord un type de chambre</p>
                <Button size="sm" onClick={openAddTypeModal}>
                  <Plus className="w-4 h-4" /> Créer un type
                </Button>
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-8">
                <BedDouble className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Aucune chambre dans cette résidence</p>
                <Button size="sm" onClick={openAddRoomModal}>
                  <Plus className="w-4 h-4" /> Ajouter une chambre
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {rooms.map((room) => {
                  const rt = roomTypes.find(t => t.id === room.room_type_id);
                  return (
                    <div
                      key={room.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => openEditRoomModal(room)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <BedDouble className="w-5 h-5 text-slate-400" />
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRoomStatusColor(room.status)}`}>
                          {getRoomStatusLabel(room.status)}
                        </span>
                      </div>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">Ch. {room.room_number}</p>
                      <p className="text-xs text-slate-400 mt-1">{rt?.name || "—"}</p>
                      {rt && <p className="text-xs text-indigo-500 mt-0.5">{formatFCFA(rt.base_price)}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Modal Chambre */}
      <Modal open={roomModalOpen} onClose={() => setRoomModalOpen(false)} title={editingRoom ? "Modifier la chambre" : "Ajouter une chambre"}>
        <div className="space-y-4">
          <Input label="Numéro de chambre" value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} placeholder="101" />
          <Input label="Étage (optionnel)" type="number" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} placeholder="1" />
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type de chambre</label>
            <select
              value={roomForm.room_type_id}
              onChange={(e) => setRoomForm({ ...roomForm, room_type_id: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Sélectionner un type</option>
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
      <Modal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} title={editingType ? "Modifier le type" : "Nouveau type de chambre"}>
        <div className="space-y-4">
          <Input label="Nom du type" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Standard" />
          <Input label="Description" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="Chambre standard avec climatisation" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Prix de base (FCFA)" type="number" value={typeForm.base_price} onChange={(e) => setTypeForm({ ...typeForm, base_price: e.target.value })} placeholder="15000" />
            <Input label="Capacité (personnes)" type="number" value={typeForm.capacity} onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })} placeholder="2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Résidence</label>
            <select
              value={typeForm.accommodation_id}
              onChange={(e) => setTypeForm({ ...typeForm, accommodation_id: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {accommodations.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setTypeModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={saveType} loading={loading}>{editingType ? "Enregistrer" : "Créer"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}