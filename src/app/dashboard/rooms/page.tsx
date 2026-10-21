"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { useCurrency } from "@/hooks/use-currency";
import { Filter, Search, RefreshCw, Loader2, BedDouble, LayoutGrid, AlertCircle } from "lucide-react";
import { RoomCard } from "@/components/rooms/RoomCard";
import { SmartKPICard } from "@/components/rooms/SmartKPICard";
import { RoomDetailDrawer } from "@/components/rooms/RoomDetailDrawer";
import { buildSmartKPIs } from "@/lib/room-analytics";
import { RoomsSkeleton } from "@/components/ui/skeletons";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/contexts/current-user-context";

interface RoomWithType {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
  accommodation_id: string;
  room_type_id: string;
  room_type_name?: string;
  room_type_price?: number;
  accommodation_name?: string;
  currentClientName?: string | null;
  checkOutDate?: string | null;
  needsCleaning?: boolean;
  lastCleanedAt?: string | null;
}

export default function RoomsPage() {
  const { lang } = useLanguage();
  const { fmt } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomWithType[]>([]);
  const [accommodations, setAccommodations] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccommodation, setSelectedAccommodation] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [openDrawer, setOpenDrawer] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithType | null>(null);
  const { user } = useCurrentUser();
  const isReadOnly = user?.role === "receptionniste";

  // ── Modal édition / suppression de chambre (menu •••) ──
  const [saving, setSaving] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomWithType | null>(null);
  const [roomForm, setRoomForm] = useState({ room_number: "", floor: "", room_type_id: "" });
  const [roomTypes, setRoomTypes] = useState<{ id: string; name: string }[]>([]);
  const [roomNumberError, setRoomNumberError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoomWithType | null>(null);

  const loadRooms = useCallback(async (silent = false) => {
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

      const accResult = await supabase
        .from("accommodations")
        .select("id, name")
        .eq("tenant_id", userData.tenant_id);

      const accList = (accResult.data || []) as { id: string; name: string }[];
      setAccommodations(accList);

      if (accList.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      const accIds = accList.map((a) => a.id);

      const [roomsResult] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, room_number, floor, status, accommodation_id, room_type_id")
          .in("accommodation_id", accIds)
          .order("room_number", { ascending: true }),
      ]);

      const rawRooms = (roomsResult.data || []) as RoomWithType[];

      const typeIds = [...new Set(rawRooms.map((r) => r.room_type_id))];
      const { data: typesData } = await supabase
        .from("room_types")
        .select("id, name, base_price")
        .in("id", typeIds);

      const typeMap = new Map(
        (typesData || []).map((t: { id: string; name: string; base_price: number }) => [
          t.id,
          { name: t.name, price: t.base_price },
        ])
      );

      // Récupérer les réservations actives pour enrichir les chambres occupées
      const occupiedRooms = rawRooms.filter((r) => r.status === "occupied");
      let bookingMap = new Map<string, { client_name: string | null; check_out_date: string | null }>();

      if (occupiedRooms.length > 0) {
        const occupiedIds = occupiedRooms.map((r) => r.id);
        const { data: bookingsData } = await supabase
          .from("bookings")
          .select("room_id, client:clients(full_name), check_out_date")
          .in("room_id", occupiedIds)
          .in("status", ["confirmed", "checked_in"]);

        bookingMap = new Map(
          (bookingsData || []).map((b: {
            room_id: string;
            client: { full_name: string | null }[] | { full_name: string | null } | null;
            check_out_date: string | null;
          }) => {
            const client = Array.isArray(b.client) ? b.client[0] ?? null : b.client;
            return [
              b.room_id,
              {
                client_name: client?.full_name ?? null,
                check_out_date: b.check_out_date ?? null,
              },
            ] as [string, { client_name: string | null; check_out_date: string | null }];
          })
        );
      }

      const enriched = rawRooms.map((r) => {
        const typeInfo = typeMap.get(r.room_type_id);
        const booking = bookingMap.get(r.id);
        return {
          ...r,
          room_type_name: typeInfo?.name,
          room_type_price: typeInfo?.price,
          currentClientName: booking?.client_name ?? null,
          checkOutDate: booking?.check_out_date ?? null,
          needsCleaning: r.status === "cleaning",
          lastCleanedAt: r.status === "available" ? "Aujourd'hui" : null,
        };
      });

      setRooms(enriched);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement chambres:", err);
      toast.error(lang === "fr" ? "Erreur lors du chargement des chambres" : "Error loading rooms");
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  async function updateRoomStatus(roomId: string, status: string) {
    setUpdatingStatusId(roomId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("rooms")
        .update({ status })
        .eq("id", roomId);

      if (error) throw error;

      toast.success(lang === "fr" ? "Statut de la chambre mis à jour" : "Room status updated");
      await loadRooms(true);
    } catch (err) {
      console.error("Erreur mise à jour statut:", err);
      toast.error(lang === "fr" ? "Erreur lors de la mise à jour" : "Error updating status");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  // ── Actions du menu ••• : modifier / dupliquer / supprimer ──
  async function openEditRoomModal(room: RoomWithType) {
    setEditingRoom(room);
    setRoomForm({
      room_number: room.room_number,
      floor: room.floor != null ? String(room.floor) : "",
      room_type_id: room.room_type_id,
    });
    setRoomNumberError("");
    setRoomModalOpen(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("room_types")
        .select("id, name")
        .eq("accommodation_id", room.accommodation_id)
        .order("name");
      const list = (data || []) as { id: string; name: string }[];
      if (room.room_type_id && !list.some((t) => t.id === room.room_type_id)) {
        list.unshift({ id: room.room_type_id, name: room.room_type_name || "Type actuel" });
      }
      setRoomTypes(list);
    } catch {
      setRoomTypes(
        room.room_type_id
          ? [{ id: room.room_type_id, name: room.room_type_name || "Type actuel" }]
          : []
      );
    }
  }

  async function saveRoom() {
    if (!editingRoom) return;
    const number = roomForm.room_number.trim();
    if (!number || !roomForm.room_type_id) {
      toast.error(
        lang === "fr"
          ? "Il manque des champs obligatoires ! Remplissez tout 📋"
          : "Missing required fields!"
      );
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("rooms")
        .update({
          room_number: number,
          floor: roomForm.floor === "" ? null : Number(roomForm.floor),
          room_type_id: roomForm.room_type_id,
        })
        .eq("id", editingRoom.id);
      if (error) throw error;
      setRoomModalOpen(false);
      toast.success(lang === "fr" ? "Chambre modifiée" : "Room updated");
      await loadRooms(true);
    } catch (e) {
      const err = e as { message?: string; code?: string };
      if (
        err.code === "23505" ||
        err.message?.toLowerCase().includes("duplicate") ||
        err.message?.toLowerCase().includes("unique")
      ) {
        setRoomNumberError(
          lang === "fr"
            ? "Ce numéro de chambre est déjà utilisé. Veuillez en choisir un autre."
            : "This room number is already in use."
        );
      } else {
        toast.error(lang === "fr" ? "Erreur lors de l'enregistrement" : "Error saving room");
      }
    } finally {
      setSaving(false);
    }
  }

  async function duplicateRoom(room: RoomWithType) {
    const used = new Set(rooms.map((r) => r.room_number.trim()));
    let n = 2;
    let candidate = `${room.room_number}-${n}`;
    while (used.has(candidate)) {
      n++;
      candidate = `${room.room_number}-${n}`;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.from("rooms").insert({
        accommodation_id: room.accommodation_id,
        room_type_id: room.room_type_id,
        room_number: candidate,
        floor: room.floor,
        status: "available",
      });
      if (error) throw error;
      toast.success(
        lang === "fr" ? `Chambre dupliquée (${candidate})` : `Room duplicated (${candidate})`
      );
      await loadRooms(true);
    } catch (e) {
      console.error("Erreur duplication chambre:", e);
      toast.error(lang === "fr" ? "Erreur lors de la duplication" : "Error duplicating room");
    }
  }

  async function confirmDeleteRoom() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("rooms").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      toast.success(lang === "fr" ? "Chambre supprimée 🗑️" : "Room deleted");
      await loadRooms(true);
    } catch (e) {
      const err = e as { message?: string; code?: string };
      if (err.code === "23503" || err.message?.toLowerCase().includes("foreign key")) {
        toast.error(
          lang === "fr"
            ? "Impossible de supprimer : des réservations sont liées à cette chambre."
            : "Cannot delete: bookings are linked to this room."
        );
      } else {
        toast.error(lang === "fr" ? "Erreur lors de la suppression" : "Error deleting room");
      }
    } finally {
      setSaving(false);
    }
  }

  function getStatusLabel(status: string): string {
    if (lang === "en") {
      const labels: Record<string, string> = {
        available: "Available",
        occupied: "Occupied",
        cleaning: "Cleaning",
        maintenance: "Maintenance",
        alert: "Alert",
      };
      return labels[status] || status;
    }
    const labels: Record<string, string> = {
      available: "Libre",
      occupied: "Occupée",
      cleaning: "Ménage",
      maintenance: "Maintenance",
      alert: "Alerte",
    };
    return labels[status] || status;
  }

  const filteredRooms = rooms.filter((room) => {
    const matchAccom = selectedAccommodation === "all" || room.accommodation_id === selectedAccommodation;
    const matchStatus = selectedStatus === "all" || room.status === selectedStatus;
    const matchSearch = room.room_number.toLowerCase().includes(searchQuery.toLowerCase());
    return matchAccom && matchStatus && matchSearch;
  });

  const statusCounts = rooms.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const statusOptions = [
    { value: "all", label: lang === "fr" ? "Tous les statuts" : "All statuses" },
    { value: "available", label: getStatusLabel("available") },
    { value: "occupied", label: getStatusLabel("occupied") },
    { value: "cleaning", label: getStatusLabel("cleaning") },
    { value: "maintenance", label: getStatusLabel("maintenance") },
    { value: "alert", label: getStatusLabel("alert") },
  ];

  const smartKPIs = buildSmartKPIs(
    rooms.map((r) => ({ id: r.id, room_number: r.room_number, status: r.status })),
    lang
  );

  if (loading) {
    return <RoomsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {lang === "fr" ? "Gestion des chambres" : "Room Management"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {lang === "fr"
              ? "Suivez l'état de votre parc chambre en temps réel."
              : "Track your room inventory in real time."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">
              {lang === "fr" ? "Vue grille" : "Grid view"}
            </span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Smart KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {smartKPIs.map((kpi) => (
          <SmartKPICard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            total={kpi.total}
            icon={kpi.icon}
            color={kpi.color}
            trend={kpi.trend}
            alert={kpi.alert}
            insight={kpi.insight}
            lang={lang}
          />
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -mt-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={lang === "fr" ? "Rechercher une chambre…" : "Search rooms…"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--card-border,var(--border))] bg-[var(--input-bg,var(--surface))] text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </div>

        <div className="relative min-w-[180px]">
          <Filter className="absolute left-3 top-1/2 -mt-2 w-4 h-4 text-slate-400" />
          <select
            value={selectedAccommodation}
            onChange={(e) => setSelectedAccommodation(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--card-border,var(--border))] bg-[var(--input-bg,var(--surface))] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
          >
            <option value="all">
              {lang === "fr" ? "Tous établissements" : "All properties"}
            </option>
            {accommodations.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[180px]">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-lg border border-[var(--card-border,var(--border))] bg-[var(--input-bg,var(--surface))] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => loadRooms()}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {lang === "fr" ? "Actualiser" : "Refresh"}
        </button>
      </div>

      {/* État vide */}
      {filteredRooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center mb-4">
            <BedDouble className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            {lang === "fr" ? "Aucune chambre trouvée" : "No rooms found"}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">
            {lang === "fr"
              ? "Essayez d'ajuster vos filtres de recherche."
              : "Try adjusting your search filters."}
          </p>
        </div>
      )}

      {/* Grille de chambres */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            lang={lang}
            fmt={fmt}
            onStatusChange={updateRoomStatus}
            updating={updatingStatusId === room.id}
            onClick={() => {
              setSelectedRoom(room);
              setOpenDrawer(true);
            }}
            currentClientName={room.currentClientName ?? null}
            checkOutDate={room.checkOutDate ?? null}
            needsCleaning={room.needsCleaning ?? false}
            lastCleanedAt={room.lastCleanedAt ?? null}
            canManage={!isReadOnly}
            onEdit={() => openEditRoomModal(room)}
            onDuplicate={() => duplicateRoom(room)}
            onDelete={() => {
              setDeleteTarget(room);
              setDeleteConfirmOpen(true);
            }}
          />
        ))}
      </div>

      {/* Drawer détail chambre */}
      {selectedRoom && (
        <RoomDetailDrawer
          open={openDrawer}
          onClose={() => setOpenDrawer(false)}
          room={{
            id: selectedRoom.id,
            room_number: selectedRoom.room_number,
            floor: selectedRoom.floor,
            status: selectedRoom.status,
            room_type_name: selectedRoom.room_type_name,
            room_type_price: selectedRoom.room_type_price,
            currentClientName: selectedRoom.currentClientName,
            checkOutDate: selectedRoom.checkOutDate,
            needsCleaning: selectedRoom.needsCleaning,
            lastCleanedAt: selectedRoom.lastCleanedAt,
          }}
          lang={lang}
          onStatusChange={updateRoomStatus}
          updating={updatingStatusId === selectedRoom.id}
        />
      )}

      {/* Modal : modifier la chambre */}
      <Modal
        open={roomModalOpen}
        onClose={() => {
          setRoomModalOpen(false);
          setRoomNumberError("");
        }}
        title={lang === "fr" ? "Modifier la chambre" : "Edit room"}
      >
        <div className="space-y-3">
          <Input
            label={lang === "fr" ? "Numéro de chambre" : "Room number"}
            value={roomForm.room_number}
            onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
            placeholder="101"
          />
          {roomNumberError && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {roomNumberError}
            </p>
          )}
          <Input
            label={lang === "fr" ? "Étage (optionnel)" : "Floor (optional)"}
            type="number"
            value={roomForm.floor}
            onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
            placeholder="1"
          />
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {lang === "fr" ? "Type de chambre" : "Room type"}
            </label>
            <select
              value={roomForm.room_type_id}
              onChange={(e) => setRoomForm({ ...roomForm, room_type_id: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--card-border,var(--border))] bg-[var(--input-bg,var(--surface))] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">{lang === "fr" ? "Sélectionner un type" : "Select a type"}</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setRoomModalOpen(false);
                setRoomNumberError("");
              }}
            >
              {lang === "fr" ? "Annuler" : "Cancel"}
            </Button>
            <Button className="flex-1" onClick={saveRoom} loading={saving}>
              {lang === "fr" ? "Enregistrer" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal : confirmation de suppression */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteTarget(null);
        }}
        title={lang === "fr" ? "Supprimer la chambre" : "Delete room"}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {lang === "fr"
              ? `Êtes-vous sûr de vouloir supprimer la chambre ${deleteTarget?.room_number} ? Cette action est irréversible.`
              : `Are you sure you want to delete room ${deleteTarget?.room_number}? This action cannot be undone.`}
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteTarget(null);
              }}
            >
              {lang === "fr" ? "Annuler" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={confirmDeleteRoom}
              loading={saving}
            >
              {lang === "fr" ? "Supprimer" : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}