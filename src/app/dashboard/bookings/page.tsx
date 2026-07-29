"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  formatFCFA,
  formatDate,
  calculateNights,
  getBookingStatusLabel,
  getBookingStatusColor,
  getPaymentStatusLabel,
  getPaymentStatusColor,
} from "@/lib/utils";
import {
  CalendarCheck,
  Plus,
  Search,
  LogIn,
  LogOut,
  XCircle,
  UserX,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { Accommodation, RoomType, Room, Client, Booking } from "@/types/database";

export default function BookingsPage() {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType })[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const [formData, setFormData] = useState({
    accommodation_id: "",
    room_id: "",
    client_id: "",
    newClientName: "",
    newClientPhone: "",
    check_in_date: "",
    check_out_date: "",
    negotiated_price: "",
    number_of_guests: "1",
    special_requests: "",
  });

  useEffect(() => {
    loadInitData();
  }, []);

  async function loadInitData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setTenantId(userData.tenant_id);
      setUserId(userData.id);

      const { data: accData } = await supabase
        .from("accommodations")
        .select("*")
        .eq("tenant_id", userData.tenant_id);
      if (accData) setAccommodations(accData as unknown as Accommodation[]);

      const { data: clientData } = await supabase
        .from("clients")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("full_name");
      if (clientData) setClients(clientData as unknown as Client[]);

      await loadBookings(userData.tenant_id);
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings(tId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("bookings")
        .select(`
          *,
          client:clients(*),
          room:rooms(*)
        `)
        .eq("tenant_id", tId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        // Enrichir avec les types de chambres
        const enriched = await Promise.all(
          (data as unknown as (Booking & { client: Client; room: Room })[]).map(async (b) => {
            if (b.room) {
              const { data: rt } = await supabase
                .from("room_types")
                .select("*")
                .eq("id", b.room.room_type_id)
                .single();
              return { ...b, room_type: rt as unknown as RoomType };
            }
            return b;
          })
        );
        setBookings(enriched);
      }
    } catch {
      // Erreur silencieuse
    }
  }

  async function loadRoomsForAccommodation(accId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("rooms")
        .select(`
          *,
          room_type:room_types(*)
        `)
        .eq("accommodation_id", accId)
        .order("room_number");
      if (data) {
        setRooms(data as unknown as Room[]);
        const types = (data as unknown as (Room & { room_type: RoomType })[])
          .map((r) => r.room_type)
          .filter((t, i, arr) => t && arr.findIndex((x) => x.id === t.id) === i);
        setRoomTypes(types);
      }
    } catch {
      // Erreur silencieuse
    }
  }

  function openAddModal() {
    setFormData({
      accommodation_id: "",
      room_id: "",
      client_id: "",
      newClientName: "",
      newClientPhone: "",
      check_in_date: new Date().toISOString().split("T")[0],
      check_out_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      negotiated_price: "",
      number_of_guests: "1",
      special_requests: "",
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSave() {
    setError("");
    if (!formData.accommodation_id || !formData.room_id || !formData.check_in_date || !formData.check_out_date) {
      setError("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const nights = calculateNights(formData.check_in_date, formData.check_out_date);
    if (nights <= 0) {
      setError("La date de départ doit être après la date d'arrivée.");
      return;
    }

    const negotiatedPrice = parseInt(formData.negotiated_price) || 0;
    if (negotiatedPrice <= 0) {
      setError("Le prix négocié doit être supérieur à 0.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Déterminer le client
      let clientId = formData.client_id;

      if (!clientId && formData.newClientName) {
        // Créer un nouveau client
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({
            tenant_id: tenantId,
            full_name: formData.newClientName,
            phone: formData.newClientPhone || null,
          })
          .select()
          .single();

        if (clientErr) {
          setError("Erreur lors de la création du client: " + clientErr.message);
          setSaving(false);
          return;
        }
        clientId = newClient.id;
      }

      if (!clientId) {
        setError("Veuillez sélectionner ou créer un client.");
        setSaving(false);
        return;
      }

      // Récupérer le prix de base
      const room = rooms.find((r) => r.id === formData.room_id);
      const roomType = roomTypes.find((rt) => rt.id === room?.room_type_id);
      const basePrice = roomType?.base_price || negotiatedPrice;

      // Vérifier anti double-booking via la fonction RPC
      const { data: isAvailable, error: checkErr } = await supabase.rpc("check_double_booking", {
        p_room_id: formData.room_id,
        p_check_in: formData.check_in_date,
        p_check_out: formData.check_out_date,
      });

      if (checkErr) {
        setError("Erreur lors de la vérification de disponibilité.");
        setSaving(false);
        return;
      }

      if (!isAvailable) {
        setError("Cette chambre est déjà réservée pour ces dates. Veuillez choisir d'autres dates ou une autre chambre.");
        setSaving(false);
        return;
      }

      // Créer la réservation via la fonction RPC
      const { data: booking, error: bookingErr } = await supabase.rpc("create_booking", {
        p_tenant_id: tenantId,
        p_accommodation_id: formData.accommodation_id,
        p_room_id: formData.room_id,
        p_client_id: clientId,
        p_check_in_date: formData.check_in_date,
        p_check_out_date: formData.check_out_date,
        p_base_price: basePrice,
        p_negotiated_price: negotiatedPrice,
        p_nights_count: nights,
        p_total_amount: negotiatedPrice * nights,
        p_number_of_guests: parseInt(formData.number_of_guests) || 1,
        p_special_requests: formData.special_requests || null,
        p_created_by: userId,
      });

      if (bookingErr) {
        if (bookingErr.message.includes("DOUBLE_BOOKING")) {
          setError("Cette chambre est déjà réservée pour ces dates (conflit détecté par la base de données).");
        } else {
          setError("Erreur lors de la création: " + bookingErr.message);
        }
        setSaving(false);
        return;
      }

      setModalOpen(false);
      loadBookings(tenantId);
    } catch {
      setError("Une erreur est survenue lors de la création de la réservation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(bookingId: string, action: "check_in" | "check_out" | "cancel" | "no_show") {
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc(
        action === "check_in" ? "check_in_booking" :
        action === "check_out" ? "check_out_booking" :
        action === "cancel" ? "cancel_booking" :
        "mark_no_show",
        { p_booking_id: bookingId, p_user_id: userId }
      );

      if (error) {
        alert("Erreur: " + error.message);
        return;
      }

      loadBookings(tenantId);
    } catch {
      // Erreur silencieuse
    }
  }

  const filteredBookings = bookings.filter((b) => {
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        b.booking_code?.toLowerCase().includes(q) ||
        b.client?.full_name?.toLowerCase().includes(q) ||
        b.room?.room_number?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Réservations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{bookings.length} réservation{bookings.length > 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="w-4 h-4" /> Nouvelle réservation
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par code, client, chambre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Tous les statuts</option>
          <option value="confirmed">Confirmée</option>
          <option value="checked_in">Arrivé</option>
          <option value="checked_out">Parti</option>
          <option value="cancelled">Annulée</option>
          <option value="no_show">No-show</option>
        </select>
      </div>

      {/* Tableau */}
      <Card className="overflow-hidden">
        {filteredBookings.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune réservation</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Créez votre première réservation</p>
            <Button onClick={openAddModal}>
              <Plus className="w-4 h-4" /> Nouvelle réservation
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Code</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Client</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Chambre</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Dates</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Montant</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Statut</th>
                  <th className="text-right p-4 text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="p-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{b.booking_code}</p>
                      <p className="text-xs text-slate-400">{b.nights_count} nuit{b.nights_count > 1 ? "s" : ""}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{b.client?.full_name || "—"}</p>
                      <p className="text-xs text-slate-400">{b.client?.phone || ""}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Ch. {b.room?.room_number || "—"}</p>
                      <p className="text-xs text-slate-400">{b.room_type?.name || ""}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(b.check_in_date)}</p>
                      <p className="text-xs text-slate-400">→ {formatDate(b.check_out_date)}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{formatFCFA(b.total_amount)}</p>
                      <span className={`text-xs ${getPaymentStatusColor(b.payment_status)}`}>{getPaymentStatusLabel(b.payment_status)}</span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}>
                        {getBookingStatusLabel(b.status)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 justify-end">
                        {b.status === "confirmed" && (
                          <button onClick={() => handleAction(b.id, "check_in")} title="Check-in" className="p-2 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                            <LogIn className="w-4 h-4" />
                          </button>
                        )}
                        {b.status === "checked_in" && (
                          <button onClick={() => handleAction(b.id, "check_out")} title="Check-out" className="p-2 rounded-lg text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20">
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                        {(b.status === "confirmed" || b.status === "checked_in") && (
                          <button onClick={() => handleAction(b.id, "cancel")} title="Annuler" className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {b.status === "confirmed" && (
                          <button onClick={() => handleAction(b.id, "no_show")} title="No-show" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal nouvelle réservation */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nouvelle réservation"
        description="Créez une réservation avec vérification anti double-booking"
        size="lg"
      >
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Résidence</label>
            <select
              value={formData.accommodation_id}
              onChange={(e) => {
                setFormData({ ...formData, accommodation_id: e.target.value, room_id: "" });
                loadRoomsForAccommodation(e.target.value);
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Sélectionner une résidence</option>
              {accommodations.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chambre</label>
            <select
              value={formData.room_id}
              onChange={(e) => {
                const room = rooms.find((r) => r.id === e.target.value);
                const rt = roomTypes.find((t) => t.id === room?.room_type_id);
                setFormData({ ...formData, room_id: e.target.value, negotiated_price: rt?.base_price.toString() || "" });
              }}
              disabled={!formData.accommodation_id}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="">Sélectionner une chambre</option>
              {rooms.map((r) => {
                const rt = roomTypes.find((t) => t.id === r.room_type_id);
                return (
                  <option key={r.id} value={r.id}>
                    Ch. {r.room_number} — {rt?.name || ""} — {rt ? formatFCFA(rt.base_price) : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Client existant</label>
            <select
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value, newClientName: "", newClientPhone: "" })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Ou créer un nouveau client ci-dessous —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ""}</option>
              ))}
            </select>
          </div>

          {!formData.client_id && (
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30">
              <Input label="Nom du nouveau client" value={formData.newClientName} onChange={(e) => setFormData({ ...formData, newClientName: e.target.value })} placeholder="Jean Kouassi" />
              <Input label="Téléphone (optionnel)" value={formData.newClientPhone} onChange={(e) => setFormData({ ...formData, newClientPhone: e.target.value })} placeholder="+225 07 00 00 00 00" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Date d'arrivée" type="date" value={formData.check_in_date} onChange={(e) => setFormData({ ...formData, check_in_date: e.target.value })} />
            <Input label="Date de départ" type="date" value={formData.check_out_date} onChange={(e) => setFormData({ ...formData, check_out_date: e.target.value })} />
          </div>

          {formData.check_in_date && formData.check_out_date && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-sm text-indigo-700 dark:text-indigo-300">
              {calculateNights(formData.check_in_date, formData.check_out_date)} nuit(s) × {formatFCFA(parseInt(formData.negotiated_price) || 0)} ={" "}
              <strong>{formatFCFA((parseInt(formData.negotiated_price) || 0) * calculateNights(formData.check_in_date, formData.check_out_date))}</strong>
            </div>
          )}

          <Input label="Prix négocié par nuit (FCFA)" type="number" value={formData.negotiated_price} onChange={(e) => setFormData({ ...formData, negotiated_price: e.target.value })} placeholder="15000" />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Nombre de clients" type="number" value={formData.number_of_guests} onChange={(e) => setFormData({ ...formData, number_of_guests: e.target.value })} placeholder="1" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Demandes spéciales (optionnel)</label>
            <textarea
              value={formData.special_requests}
              onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
              rows={2}
              placeholder="Lit bébé, étage élevé, etc."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={saving}>Créer la réservation</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}