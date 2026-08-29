"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import { Loader2, BedDouble, Filter, Building2, Search, RefreshCw } from "lucide-react";

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
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  available: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "Libre" },
  occupied: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Occupée" },
  cleaning: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Ménage" },
  maintenance: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "Maintenance" },
  alert: { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-400", label: "Alerte" },
};

const STATUS_LABELS_EN: Record<string, string> = {
  available: "Available",
  occupied: "Occupied",
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  alert: "Alert",
};

export default function RoomsPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomWithType[]>([]);
  const [accommodations, setAccommodations] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccommodation, setSelectedAccommodation] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

      const [roomsResult, typesResult] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, room_number, floor, status, accommodation_id, room_type_id")
          .in("accommodation_id", accIds)
          .order("room_number", { ascending: true }),
        supabase
          .from("room_types")
          .select("id, name, base_price, accommodation_id")
          .in("accommodation_id", accIds),
      ]);

      const typesMap: Record<string, { name: string; base_price: number }> = {};
      (typesResult.data || []).forEach((rt: { id: string; name: string; base_price: number }) => {
        typesMap[rt.id] = { name: rt.name, base_price: rt.base_price };
      });

      const accMap: Record<string, string> = {};
      accList.forEach((a) => { accMap[a.id] = a.name; });

      const enriched: RoomWithType[] = (roomsResult.data || []).map((r) => ({
        ...r,
        room_type_name: typesMap[r.room_type_id]?.name || "—",
        room_type_price: typesMap[r.room_type_id]?.base_price,
        accommodation_name: accMap[r.accommodation_id] || "—",
      }));

      setRooms(enriched);
    } catch (err) {
      console.error(err);
      toast.error(lang === "fr" ? "Erreur lors du chargement des chambres" : "Error loading rooms");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const filteredRooms = rooms.filter((r) => {
    if (selectedAccommodation !== "all" && r.accommodation_id !== selectedAccommodation) return false;
    if (selectedStatus !== "all" && r.status !== selectedStatus) return false;
    if (searchQuery && !r.room_number.toLowerCase().includes(searchQuery.toLowerCase()) && !r.room_type_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const statusCounts = rooms.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  function getStatusLabel(status: string) {
    if (lang === "en") return STATUS_LABELS_EN[status] || status;
    return STATUS_COLORS[status]?.label || status;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {lang === "fr" ? "Chambres" : "Rooms"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {rooms.length} {lang === "fr" ? "chambre(s) au total" : "room(s) total"}
          </p>
        </div>
        <button
          onClick={() => loadRooms(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {lang === "fr" ? "Actualiser" : "Refresh"}
        </button>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {Object.entries(statusCounts).map(([status, count]) => {
          const colors = STATUS_COLORS[status] || { bg: "bg-slate-100", text: "text-slate-700" };
          return (
            <div
              key={status}
              className={`${colors.bg} rounded-xl p-3 text-center cursor-pointer transition-all hover:scale-105 ${
                selectedStatus === status ? "ring-2 ring-offset-2 ring-[var(--primary-color,#0C1C33)]" : ""
              }`}
              onClick={() => setSelectedStatus(selectedStatus === status ? "all" : status)}
            >
              <div className={`text-2xl font-bold ${colors.text}`}>{count}</div>
              <div className={`text-xs font-medium ${colors.text} mt-0.5`}>{getStatusLabel(status)}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={lang === "fr" ? "Rechercher une chambre..." : "Search rooms..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedAccommodation}
            onChange={(e) => setSelectedAccommodation(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
          >
            <option value="all">{lang === "fr" ? "Tous les établissements" : "All residences"}</option>
            {accommodations.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rooms grid */}
      {filteredRooms.length === 0 ? (
        <div className="text-center py-16">
          <BedDouble className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">
            {lang === "fr" ? "Aucune chambre trouvée" : "No rooms found"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map((room) => {
            const colors = STATUS_COLORS[room.status] || STATUS_COLORS.available;
            return (
              <div
                key={room.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-lg transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-[var(--primary-color,#0C1C33)]/10 flex items-center justify-center">
                      <BedDouble className="w-5 h-5 text-[var(--primary-color,#0C1C33)]" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                        {room.room_number}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{room.room_type_name}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
                    {getStatusLabel(room.status)}
                  </span>
                </div>

                <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="truncate">{room.accommodation_name}</span>
                  </div>
                  {room.floor != null && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === "fr" ? `Étage ${room.floor}` : `Floor ${room.floor}`}
                    </p>
                  )}
                  {room.room_type_price != null && (
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-2">
                      {room.room_type_price.toLocaleString()} <span className="text-xs font-normal text-slate-400">{lang === "fr" ? "/ nuit" : "/ night"}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
