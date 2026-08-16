"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  formatDate,
  formatTime,
  calculateNights,
  getBookingStatusLabel,
  getBookingStatusColor,
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getOverstayLabel,
  getOverstayColor,
  isBookingOverdue,
  MOBILE_MONEY_OPERATORS,
} from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
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
  Sparkles,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  List,
  Eye,
  X,
  Share2,
  Copy,
  Check,
  MessageSquare,
  ExternalLink,
  Receipt,
  MoreHorizontal,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getActiveAssignmentId } from "@/lib/assignments";
import { canAccessFeature } from "@/lib/subscription-plans";
import type { Accommodation, RoomType, Room, Client, Booking, Invoice, PaymentMethod, PaymentStatus, ClientStayExtensionRequest } from "@/types/database";

interface ExtensionRequestWithRelations extends ClientStayExtensionRequest {
  client?: Client;
  room?: Room;
  booking?: Booking;
}

export default function BookingsPage() {
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType })[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [cleaningModalOpen, setCleaningModalOpen] = useState(false);
  const [cleaningBookingId, setCleaningBookingId] = useState<string>("");
  const [cleaningLoading, setCleaningLoading] = useState(false);
  // Prolongation de séjour (dépassement de la date de départ)
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendBooking, setExtendBooking] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [extendDate, setExtendDate] = useState("");
  // Demande de prolongation à l'origine de la modal : marquée 'approved' après
  // une prolongation réussie, pour clôturer la boucle client → personnel.
  const [extendRequestId, setExtendRequestId] = useState<string | null>(null);
  // Demandes de prolongation envoyées depuis l'espace client (en attente)
  const [extensionRequests, setExtensionRequests] = useState<ExtensionRequestWithRelations[]>([]);
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ExtensionRequestWithRelations | null>(null);
  const [rejecting, setRejecting] = useState(false);
  // Paiement du supplément lors d'une prolongation (saisi par la réceptionniste)
  const [extendPaid, setExtendPaid] = useState(false);
  const [extendAmount, setExtendAmount] = useState("");
  const [extendPaymentMethod, setExtendPaymentMethod] = useState("");
  const [extendMobileOperator, setExtendMobileOperator] = useState("");
  // Règlement au check-out : si un solde reste dû, la réceptionniste encaisse
  // le reliquat (montant, moyen, opérateur) au moment du départ.
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutBooking, setCheckoutBooking] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    amount: "",
    payment_method: "",
    mobile_money_operator: "",
  });
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.search.includes("status=overdue")) {
      return "overdue";
    }
    return "all";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "cancel" | "no_show" } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Réservation dont une action (check-in/check-out) est en cours : permet de
  // désactiver le bouton principal et le menu pour éviter les doubles clics.
  const [actioningId, setActioningId] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  // Formule d'abonnement : contrôle l'accès à l'espace client (Entreprise uniquement)
  const [plan, setPlan] = useState("free");
  const [portalUpsell, setPortalUpsell] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  // Filtre de résidence appliqué au rechargement des réservations (réceptionniste
  // affecté à un établissement). Conservé dans une ref pour le rechargement
  // temps réel, qui ne doit pas se resouscrire à chaque rendu.
  const accommodationFilterRef = useRef<string | undefined>(undefined);
  const loadBookingsRef = useRef(loadBookings);
  loadBookingsRef.current = loadBookings;
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedBookingForInvoice, setSelectedBookingForInvoice] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [invoicesMap, setInvoicesMap] = useState<Record<string, Invoice>>({});
  const [invoiceToSend, setInvoiceToSend] = useState<Invoice | null>(null);
  const [emailInput, setEmailInput] = useState("");

  // Génère (ou réutilise) l'accès client sécurisé d'une réservation.
  // Formule Entreprise uniquement — sinon, propose l'upgrade.
  async function ensureClientAccess(b: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    if (!canAccessFeature("clientPortal", plan)) {
      setPortalUpsell(true);
      return null;
    }
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stay/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: b.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setPortalUpsell(true);
          return null;
        }
        toast.error(json?.error || "Impossible de générer l'accès client.");
        return null;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return { url: `${origin}${json.url}` };
    } catch {
      toast.error("Une erreur est survenue.");
      return null;
    } finally {
      setPortalLoading(false);
    }
  }

  async function shareStayWhatsApp(b: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    const access = await ensureClientAccess(b);
    if (!access) return;
    const cleanPhone = (b.client?.phone || "").replace(/[^0-9]/g, "");
    const message = `Bonjour ${b.client?.full_name || "Client"}, bienvenue ! Voici votre lien d'accès à l'espace client pour votre séjour (Code: ${b.booking_code}) :\n${access.url}`;
    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
    }
  }

  async function copyStayLink(b: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    const access = await ensureClientAccess(b);
    if (!access) return;
    navigator.clipboard.writeText(access.url);
    toast.success(`Lien du séjour ${b.booking_code} copié !`);
  }

  const ITEMS_PER_PAGE = 10;

  const [formData, setFormData] = useState({
    accommodation_id: "",
    room_id: "",
    client_id: "",
    newClientName: "",
    newClientPhone: "",
    newClientEmail: "",
    newClientIdType: "",
    newClientIdNumber: "",
    newClientEmergencyContact: "",
    newClientNationality: "",
    check_in_date: "",
    check_out_date: "",
    negotiated_price: "",
    number_of_guests: "1",
    special_requests: "",
    payment_method: "",
    mobile_money_operator: "",
    immediateCheckIn: false,
  });

  useEffect(() => {
    loadInitData();
  }, []);

  // Temps réel : rechargement immédiat dès qu'une réservation change
  // (création, modification, check-in/out, paiement). Le rechargement est
  // effectué via une ref pour ne pas se resouscrire à chaque rendu.
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("bookings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `tenant_id=eq.${tenantId}` },
        () => loadBookingsRef.current(tenantId, accommodationFilterRef.current)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_stay_extension_requests", filter: `tenant_id=eq.${tenantId}` },
        () => loadExtensionRequests(tenantId)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // Ouvre automatiquement la modal de nouvelle réservation si ?new=1 est dans l'URL
  useEffect(() => {
    if (typeof window !== "undefined" && !loading) {
      if (window.location.search.includes("new=1")) {
        openAddModal();
      }
      // Nettoyer l'URL pour éviter de rouvrir la modal au refresh
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function loadInitData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, tenant_id, role, accommodation_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setTenantId(userData.tenant_id);
      setUserId(userData.id);

      // Formule d'abonnement (gating espace client Entreprise)
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .maybeSingle();
      if (subData) setPlan(subData.plan);

      // Résoudre l'affectation active (temporaire ou permanente) pour l'utilisateur
      const activeAccId = await getActiveAssignmentId(supabase, userData.id, userData.accommodation_id);

      // Filtre les résidences visibles selon le rôle
      let accQuery = supabase.from("accommodations").select("*").eq("tenant_id", userData.tenant_id);
      if (userData.role === "receptionniste" && activeAccId) {
        accQuery = accQuery.eq("id", activeAccId);
      }
      const { data: accData } = await accQuery;
      if (accData) setAccommodations(accData as unknown as Accommodation[]);

      // Clients : filtrés par résidence active pour les réceptionnistes
      let clientQuery = supabase.from("clients").select("*").eq("tenant_id", userData.tenant_id).order("full_name");
      if (userData.role === "receptionniste" && activeAccId) {
        clientQuery = clientQuery.eq("accommodation_id", activeAccId);
      }
      const { data: clientData } = await clientQuery;
      if (clientData) setClients(clientData as unknown as Client[]);

      // Pré-sélectionner la résidence si le réceptionniste n'en a qu'une
      if (userData.role === "receptionniste" && activeAccId) {
        setFormData((prev) => ({ ...prev, accommodation_id: activeAccId ?? "" }));
      }

      accommodationFilterRef.current = userData.role === "receptionniste" ? (activeAccId ?? undefined) : undefined;
      await runOverstayCheck();
      await loadBookings(userData.tenant_id, userData.role === "receptionniste" ? (activeAccId ?? undefined) : undefined);
      await loadInvoices(userData.tenant_id);
      await loadExtensionRequests(userData.tenant_id);
    } catch (err) {
      toast.error("Impossible de charger les données initiales.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings(tId: string, accommodationId?: string) {
    try {
      const supabase = createClient();
      let query = supabase
        .from("bookings")
        .select(`
          *,
          client:clients(*),
          room:rooms(*, room_type:room_types(*))
        `)
        .eq("tenant_id", tId)
        .order("created_at", { ascending: false })
        .limit(200);

      // Filtrer par résidence pour les réceptionnistes
      if (accommodationId) {
        query = query.eq("accommodation_id", accommodationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const enriched = (data as unknown as (Booking & { client?: Client; room?: Room & { room_type?: RoomType } })[]).map((b) => ({
          ...b,
          room_type: b.room?.room_type,
        }));
        setBookings(enriched);
      }
    } catch (err) {
      toast.error("Impossible de charger les réservations.");
      console.error(err);
    }
  }

  // Demandes de prolongation envoyées depuis l'espace client (en attente).
  async function loadExtensionRequests(tId: string) {
    setExtensionsLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_stay_extension_requests")
        .select(`
          *,
          client:clients(*),
          room:rooms(*),
          booking:bookings(*)
        `)
        .eq("tenant_id", tId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) setExtensionRequests(data as unknown as ExtensionRequestWithRelations[]);
    } catch (err) {
      console.error("Erreur chargement demandes de prolongation:", err);
    } finally {
      setExtensionsLoading(false);
    }
  }

  // Détection intelligente des dépassements de séjour : appelle la fonction RPC
  // (alerte puis auto check-out après délai de grâce). Le cron pg_cron couvre
  // déjà ce besoin ; cet appel garantit aussi la détection au chargement.
  async function runOverstayCheck() {
    try {
      const supabase = createClient();
      await supabase.rpc("check_overstays", {
        p_alert_after_minutes: 0,
        p_auto_checkout_after_minutes: 120,
      });
    } catch {
      // Silencieux : l'échec ne doit pas bloquer l'affichage
    }
  }

   async function loadRoomsForAccommodation(accId: string) {
     try {
       const supabase = createClient();
       const { data, error } = await supabase
         .from("rooms")
         .select(`
           *,
           room_type:room_types(*)
         `)
         .eq("accommodation_id", accId)
         .order("room_number");
       if (error) throw error;
       if (data) {
         setRooms(data as unknown as Room[]);
         const types = (data as unknown as (Room & { room_type: RoomType })[])
           .map((r) => r.room_type)
           .filter((t, i, arr) => t && arr.findIndex((x) => x.id === t.id) === i);
         setRoomTypes(types);
       }
      } catch (err) {
        toast.error("Impossible de charger les chambres.");
        console.error(err);
      }
    }

    async function loadInvoices(tId: string) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("invoices")
          .select("*")
          .eq("tenant_id", tId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (data) {
          const map: Record<string, Invoice> = {};
          (data as unknown as Invoice[]).forEach((inv) => {
            map[inv.booking_id] = inv;
          });
          setInvoicesMap(map);
        }
      } catch (err) {
        console.error("Erreur lors du chargement des factures:", err);
      }
    }

    async function handleGenerateInvoice(booking: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
      const loadingToast = toast.loading("Génération de la facture en cours...", { duration: Infinity });
      try {
        const response = await fetch("/api/invoice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: booking.id }),
        });

        const result = await response.json();

        if (!response.ok) {
          toast.error(result.error || "Erreur lors de la génération de la facture.", { id: loadingToast });
          return;
        }

        const invoice = result.invoice as Invoice;
        setInvoicesMap((prev) => ({ ...prev, [booking.id]: invoice }));
        setSelectedBookingForInvoice(booking);
        setInvoiceModalOpen(true);

        if (result.alreadyGenerated) {
          toast("Facture existante retrouvée.", { id: loadingToast, duration: 3000 });
        } else {
          toast.success("Facture générée avec succès !", { id: loadingToast });
        }
      } catch (err) {
        toast.error("Une erreur est survenue.", { id: loadingToast });
        console.error(err);
      }
    }

    async function handleSendInvoice(invoice: Invoice) {
      const email = emailInput.trim();
      if (!email) {
        toast.error("Veuillez indiquer une adresse e-mail.");
        return;
      }
      const loadingToast = toast.loading("Envoi de la facture...", { duration: Infinity });
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("invoices")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            sent_to: email,
          })
          .eq("id", invoice.id);

        if (error) throw error;

        setInvoicesMap((prev) => ({
          ...prev,
          [invoice.booking_id]: { ...prev[invoice.booking_id], status: "sent", sent_at: new Date().toISOString(), sent_to: email } as Invoice,
        }));
        setInvoiceToSend(null);
        setEmailInput("");
        toast.success("Facture marquée comme envoyée.", { id: loadingToast });
      } catch (err) {
        toast.error("Erreur lors de l'envoi.", { id: loadingToast });
        console.error(err);
      }
    }

    async function handleDownloadInvoice(invoice: Invoice) {
      try {
        const response = await fetch(`/api/invoice/generate?bookingId=${encodeURIComponent(invoice.booking_id)}`);
        const result = await response.json();
        if (!response.ok || !result.invoice?.pdf_url) throw new Error(result.error || "Aucun PDF disponible pour cette facture.");
        window.open(result.invoice.pdf_url, "_blank", "noopener,noreferrer");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Impossible d'ouvrir la facture.");
      }
    }

    function openSendInvoiceModal(invoice: Invoice) {
      setInvoiceToSend(invoice);
      setEmailInput(invoice.sent_to || "");
    }

    function closeSendInvoiceModal() {
      setInvoiceToSend(null);
      setEmailInput("");
    }

  function openAddModal() {
    setFormData({
      accommodation_id: "",
      room_id: "",
      client_id: "",
      newClientName: "",
      newClientPhone: "",
      newClientEmail: "",
      newClientIdType: "",
      newClientIdNumber: "",
      newClientEmergencyContact: "",
      newClientNationality: "",
      check_in_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0],
      check_out_date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + 86400000).toISOString().split("T")[0],
      negotiated_price: "",
      number_of_guests: "1",
      special_requests: "",
      payment_method: "",
      mobile_money_operator: "",
      immediateCheckIn: false,
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
            email: formData.newClientEmail || null,
            id_type: formData.newClientIdType || null,
            id_number: formData.newClientIdNumber || null,
            emergency_contact: formData.newClientEmergencyContact || null,
            nationality: formData.newClientNationality || null,
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

      const totalAmount = negotiatedPrice * nights;

      // ── ENREGISTREMENT DU PAIEMENT ──────────────────────────────────────────
      // Si un mode de paiement a été sélectionné, on enregistre la transaction
      // dans la table payments pour alimenter la caisse du shift en temps réel.
      if (formData.payment_method && booking) {
        const { error: payErr } = await supabase
          .from("payments")
          .insert({
            tenant_id: tenantId,
            booking_id: booking.id,
            accommodation_id: formData.accommodation_id,
            amount: totalAmount,
            payment_method: formData.payment_method,
            mobile_money_operator: formData.payment_method === "mobile_money" ? formData.mobile_money_operator || null : null,
            payment_date: new Date().toISOString(),
            received_by: userId,
            operation_type: "booking",
            notes: `Paiement à la réservation — ${nights} nuit(s)`,
          });

        if (payErr) {
          // Le paiement a échoué mais la réservation est créée → avertir sans bloquer
          toast.error("Réservation créée, mais le paiement n'a pas pu être enregistré : " + payErr.message);
        } else {
          // Mettre à jour le statut de paiement de la réservation
          const paymentStatus = totalAmount > 0 ? "paid" : "unpaid";
          await supabase
            .from("bookings")
            .update({
              payment_status: paymentStatus,
              amount_paid: totalAmount,
            })
            .eq("id", booking.id);
        }
      }
      // ── FIN ENREGISTREMENT PAIEMENT ──────────────────────────────────────────

      if (formData.immediateCheckIn && booking) {
        const { error: checkInErr } = await supabase.rpc("check_in_booking", {
          p_booking_id: booking.id,
          p_user_id: userId,
        });
        if (checkInErr) {
          toast.error("La réservation a été créée mais le check-in immédiat a échoué: " + checkInErr.message);
        } else {
          toast.success("Réservation créée, check-in effectué et paiement enregistré ✓");
        }
      } else {
        toast.success(formData.payment_method
          ? "Réservation créée et paiement enregistré ✓"
          : "Réservation créée avec succès."
        );
      }

      setModalOpen(false);
      await runOverstayCheck();
      loadBookings(tenantId);
    } catch {
      setError("Une erreur est survenue lors de la création de la réservation.");
    } finally {
      setSaving(false);
    }
  }


  async function handleMidStayCleaning(bookingId: string) {
    setCleaningBookingId(bookingId);
    setCleaningModalOpen(true);
  }

  async function confirmMidStayCleaning() {
    setCleaningLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("request_mid_stay_cleaning", {
        p_booking_id: cleaningBookingId,
        p_user_id: userId,
      });

      if (error) {
        toast.error("Erreur: " + error.message);
      } else {
        setCleaningModalOpen(false);
        toast.success("Demande de ménage envoyée dans le pool des ménagères.");
      }
    } catch {
      toast.error("Une erreur est survenue.");
    } finally {
      setCleaningLoading(false);
    }
  }

  async function handleAction(bookingId: string, action: "check_in" | "check_out" | "cancel" | "no_show") {
    if (action === "cancel" || action === "no_show") {
      setConfirmAction({ id: bookingId, action });
      return;
    }
    // Règlement du solde avant check-out : si un montant reste dû (paiement
    // partiel, nuits de dépassement), on ouvre la modal d'encaissement.
    if (action === "check_out") {
      const b = bookings.find((x) => x.id === bookingId);
      const remaining = b ? Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0)) : 0;
      if (b && remaining > 0) {
        setCheckoutBooking(b);
        setCheckoutForm({ amount: String(remaining), payment_method: "cash", mobile_money_operator: "" });
        setCheckoutModalOpen(true);
        return;
      }
    }
    await executeAction(bookingId, action);
  }

  // Ouvre la modal de prolongation d'un séjour en cours (dépassement de date).
  // Peut être appelée depuis une demande client (extensionRequest) pour pré-remplir
  // la date demandée et marquer la demande 'approved' en cas de succès.
  function openExtendModal(booking: Booking & { client?: Client; room?: Room; room_type?: RoomType }, fromRequest?: ExtensionRequestWithRelations) {
    const tomorrow = new Date(fromRequest?.requested_check_out_date || booking.check_out_date);
    if (!fromRequest) tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDate = tomorrow.toISOString().split("T")[0];
    setExtendDate(nextDate);
    setExtendBooking(booking);
    setExtendRequestId(fromRequest?.id ?? null);
    // Réinitialise la section paiement : supplément pré-rempli pour +1 nuit
    const nights = calculateNights(booking.check_in_date, nextDate);
    const supplement = Math.max(0, (booking.negotiated_price || 0) * nights - (booking.total_amount || 0));
    setExtendAmount(supplement > 0 ? String(supplement) : "");
    setExtendPaid(false);
    setExtendPaymentMethod("");
    setExtendMobileOperator("");
    setExtendModalOpen(true);
  }

  // Prolonge le séjour : nouvelle date de départ, recalcul du montant total dû.
  // Si la réceptionniste indique que le client a payé le supplément, le paiement
  // est enregistré en caisse (payments) et le statut de la réservation est mis à jour.
  async function handleExtendBooking() {
    if (!extendBooking || !extendDate) return;
    const nights = calculateNights(extendBooking.check_in_date, extendDate);
    if (nights <= 0) {
      toast.error("La nouvelle date de départ doit être après la date d'arrivée.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: extendedBooking, error } = await supabase.rpc("extend_booking", {
        p_booking_id: extendBooking.id,
        p_new_check_out_date: extendDate,
        p_user_id: userId,
      });
      if (error) {
        if (error.message.includes("DOUBLE_BOOKING")) {
          toast.error("La chambre est déjà réservée sur la période prolongée.");
        } else if (error.message.includes("INVALID_CHECK_OUT")) {
          toast.error("La date de départ doit être après la date d'arrivée.");
        } else {
          toast.error("Erreur lors de la prolongation : " + error.message);
        }
        return;
      }

      // ── ENREGISTREMENT DU PAIEMENT DU SUPPLÉMENT ──────────────────────────
      // Math.round : si le champ contient une décimale (ex. « 83999.9 »), on
      // arrondit au FCFA le plus proche au lieu de tronquer (parseInt → 83999).
      const paidAmount = Math.round(Number(extendAmount)) || 0;
      if (extendPaid && extendedBooking && paidAmount > 0) {
        const nightsAdded = nights - (extendBooking.nights_count || 0);
        const { error: payErr } = await supabase
          .from("payments")
          .insert({
            tenant_id: extendedBooking.tenant_id,
            booking_id: extendedBooking.id,
            accommodation_id: extendBooking.room?.accommodation_id || extendedBooking.accommodation_id,
            amount: paidAmount,
            payment_method: extendPaymentMethod as PaymentMethod,
            mobile_money_operator: extendPaymentMethod === "mobile_money" ? extendMobileOperator || null : null,
            payment_date: new Date().toISOString(),
            received_by: userId,
            operation_type: "booking",
            notes: `Prolongation de séjour — ${Math.max(1, nightsAdded)} nuit(s) supplémentaire(s)`,
          });

        if (payErr) {
          // Le paiement a échoué mais la prolongation est faite → avertir sans bloquer
          toast.error("Séjour prolongé, mais le paiement n'a pas pu être enregistré : " + payErr.message);
        } else {
          // Recalcule le statut de paiement avec le nouveau total
          const newAmountPaid = (extendedBooking.amount_paid || 0) + paidAmount;
          const newStatus: PaymentStatus =
            newAmountPaid >= extendedBooking.total_amount ? "paid"
              : newAmountPaid > 0 ? "partial" : "unpaid";
          await supabase
            .from("bookings")
            .update({ amount_paid: newAmountPaid, payment_status: newStatus })
            .eq("id", extendedBooking.id);
          toast.success(`Séjour prolongé jusqu'au ${formatDate(extendDate)} — paiement de ${fmt(paidAmount)} enregistré ✓`);
        }
      } else {
        toast.success(`Séjour prolongé jusqu'au ${formatDate(extendDate)} ✓`);
      }
      // ── FIN ENREGISTREMENT PAIEMENT ────────────────────────────────────────

      // Clôture la demande de prolongation issue de l'espace client
      if (extendRequestId) {
        const { error: reqErr } = await supabase.rpc("process_stay_extension", {
          p_request_id: extendRequestId,
          p_decision: "approved",
          p_user_id: userId,
          p_note: null,
        });
        if (reqErr) {
          console.error("Erreur marquage demande de prolongation:", reqErr);
        }
        setExtendRequestId(null);
        await loadExtensionRequests(tenantId);
      }

      setExtendModalOpen(false);
      setExtendBooking(null);
      await runOverstayCheck();
      loadBookings(tenantId);
      // La prolongation change le montant total : on recharge les factures pour
      // refléter le nouveau total (le trigger DB met à jour les brouillons et
      // invalide le PDF, qui sera régénéré au prochain clic).
      loadInvoices(tenantId);
    } catch (err) {
      toast.error("Une erreur est survenue lors de la prolongation.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Refuse une demande de prolongation envoyée depuis l'espace client.
  async function handleRejectExtension() {
    if (!rejectTarget || rejecting) return;
    setRejecting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("process_stay_extension", {
        p_request_id: rejectTarget.id,
        p_decision: "rejected",
        p_user_id: userId,
        p_note: null,
      });
      if (error) throw error;
      toast.success("Demande de prolongation refusée.");
      setRejectTarget(null);
      await loadExtensionRequests(tenantId);
    } catch (err) {
      toast.error("Impossible de refuser la demande : " + (err as Error).message);
    } finally {
      setRejecting(false);
    }
  }

  // Exécute le check-out (RPC avec repli sur mise à jour directe).
  async function doCheckout(bookingId: string): Promise<boolean> {
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc("check_out_booking", {
      p_booking_id: bookingId,
      p_user_id: userId,
    });
    if (rpcErr) {
      const { error: uErr } = await supabase
        .from("bookings")
        .update({ status: "checked_out", actual_check_out: new Date().toISOString() })
        .eq("id", bookingId);
      if (uErr) {
        toast.error("Impossible de confirmer le check-out : " + uErr.message);
        return false;
      }
    }
    return true;
  }

  // Règle le solde restant au check-out : encaisse le reliquat (payments),
  // puis confirme le départ. Le trigger recalcule automatiquement le statut.
  async function handleCheckoutConfirm() {
    const b = checkoutBooking;
    if (!b) return;
    const amount = Math.round(Number(checkoutForm.amount)) || 0;
    if (amount < 0) {
      toast.error("Le montant doit être positif.");
      return;
    }
    if (amount > 0 && !checkoutForm.payment_method) {
      toast.error("Sélectionnez un moyen de paiement.");
      return;
    }
    setCheckoutSaving(true);
    try {
      const ok = await doCheckout(b.id);
      if (!ok) return;

      if (amount > 0) {
        const method = checkoutForm.payment_method as PaymentMethod;
        const supabase = createClient();
        const { error: payErr } = await supabase
          .from("payments")
          .insert({
            tenant_id: b.tenant_id,
            booking_id: b.id,
            accommodation_id: b.accommodation_id,
            amount,
            payment_method: method,
            mobile_money_operator: method === "mobile_money" ? checkoutForm.mobile_money_operator || null : null,
            payment_date: new Date().toISOString(),
            received_by: userId,
            operation_type: "booking",
            notes: "Règlement au check-out — solde du séjour",
          });

        if (payErr) {
          toast.error("Check-out confirmé, mais le règlement n'a pas pu être enregistré : " + payErr.message);
        } else {
          toast.success(`Check-out confirmé — ${fmt(amount)} encaissé ✓`);
        }
      } else {
        toast.success("Check-out confirmé (aucun solde dû) ✓");
      }

      setCheckoutModalOpen(false);
      setCheckoutBooking(null);
      await runOverstayCheck();
      loadBookings(tenantId);
    } catch (err) {
      toast.error("Une erreur est survenue lors du check-out.");
      console.error(err);
    } finally {
      setCheckoutSaving(false);
    }
  }

  // Check-out sans encaisser le solde (le client réglera plus tard) :
  // conserve la traçabilité en laissant un solde "partial".
  async function handleCheckoutSkip() {
    const b = checkoutBooking;
    if (!b) return;
    setCheckoutSaving(true);
    try {
      const ok = await doCheckout(b.id);
      if (!ok) return;
      toast.success("Check-out confirmé (sans encaissement) ✓");
      setCheckoutModalOpen(false);
      setCheckoutBooking(null);
      await runOverstayCheck();
      loadBookings(tenantId);
    } catch (err) {
      toast.error("Une erreur est survenue lors du check-out.");
      console.error(err);
    } finally {
      setCheckoutSaving(false);
    }
  }

  // Action principale (check-in / check-out) avec garde anti double-clic :
  // le bouton principal et le menu restent désactivés pendant l'exécution.
  async function handlePrimaryAction(bookingId: string, action: "check_in" | "check_out") {
    if (actioningId) return;
    setActioningId(bookingId);
    try {
      await handleAction(bookingId, action);
    } finally {
      setActioningId("");
    }
  }

  async function executeAction(bookingId: string, action: "check_in" | "check_out" | "cancel" | "no_show") {
     try {
       const supabase = createClient();
       const rpcName = action === "check_in" ? "check_in_booking" :
                       action === "check_out" ? "check_out_booking" :
                       action === "cancel" ? "cancel_booking" :
                       "mark_no_show";

       const { error: rpcErr } = await supabase.rpc(rpcName, { p_booking_id: bookingId, p_user_id: userId });

       if (rpcErr) {
         // Fallback direct sur la table bookings si la fonction RPC échoue (ex: statut intermédiaire)
         const statusMap: Record<string, string> = {
           check_in: "checked_in",
           check_out: "checked_out",
           cancel: "cancelled",
           no_show: "no_show",
         };
         const extraFields = action === "check_in" ? { actual_check_in: new Date().toISOString() } :
                             action === "check_out" ? { actual_check_out: new Date().toISOString() } : {};

         const { error: updateErr } = await supabase
           .from("bookings")
           .update({
             status: statusMap[action],
             ...extraFields,
           })
           .eq("id", bookingId);

         if (updateErr) {
           toast.error("Impossible d'effectuer l'action : " + updateErr.message);
           return;
         }
       }

       toast.success("Action effectuée avec succès ✓");
       setConfirmAction(null);
       await runOverstayCheck();
       loadBookings(tenantId);
     } catch (err) {
       toast.error("Une erreur est survenue lors de l'action.");
       console.error(err);
     }
  }

  function exportToCSV() {
    if (filteredBookings.length === 0) return;
    const headers = ["Code", "Client", "Téléphone", "Chambre", "Arrivée", "Départ", "Nuits", "Montant Total", "Statut Paiement", "Statut"];
    const rows = filteredBookings.map(b => [
      b.booking_code,
      b.client?.full_name || "",
      b.client?.phone || "",
      b.room?.room_number || "",
      b.check_in_date,
      b.check_out_date,
      b.nights_count,
      b.total_amount,
      getPaymentStatusLabel(b.payment_status),
      getBookingStatusLabel(b.status)
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `reservations_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export CSV réussi");
  }

  const filteredBookings = bookings.filter((b) => {
    if (filterStatus === "overdue") {
      if (b.status !== "checked_in") return false;
      if (!(b.is_overstay || isBookingOverdue(b))) return false;
    } else if (filterStatus !== "all" && b.status !== filterStatus) {
      return false;
    }
    if (startDate && b.check_in_date < startDate) return false;
    if (endDate && b.check_out_date > endDate) return false;
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

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    if (!sortConfig) return 0;
    let aValue: any, bValue: any;
    
    switch (sortConfig.key) {
      case 'date':
        aValue = a.check_in_date;
        bValue = b.check_in_date;
        break;
      case 'amount':
        aValue = a.total_amount;
        bValue = b.total_amount;
        break;
      case 'client':
        aValue = a.client?.full_name?.toLowerCase() || "";
        bValue = b.client?.full_name?.toLowerCase() || "";
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const totalPages = Math.ceil(sortedBookings.length / ITEMS_PER_PAGE);
  const paginatedBookings = sortedBookings.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1); // Reset page on filter change
  }, [filterStatus, searchQuery, startDate, endDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Réservations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{bookings.length} réservation{bookings.length > 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="w-4 h-4" /> Nouvelle réservation
        </Button>
      </div>

      {/* Demandes de prolongation envoyées depuis l'espace client */}
      {extensionRequests.length > 0 && (
        <Card className={`p-4 ${extensionsLoading ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-500" />
                Prolongations demandées par les clients
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                  {extensionRequests.length}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Le client souhaite rester plus longtemps — prolongez le séjour ou refusez la demande.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {extensionRequests.map((req) => {
              const booking = req.booking;
              return (
                <div key={req.id} className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-900/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {req.client?.full_name || "Client"}
                      <span className="text-slate-400 dark:text-slate-500 font-normal"> · Ch. {req.room?.room_number || "—"}</span>
                      {booking?.booking_code ? <span className="text-slate-400 dark:text-slate-500 font-normal"> · {booking.booking_code}</span> : null}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Départ actuel le <strong>{formatDate(req.booking?.check_out_date || req.requested_check_out_date)}</strong>
                      {" "}→ souhaité le <strong className="text-amber-700 dark:text-amber-300">{formatDate(req.requested_check_out_date)}</strong>
                    </p>
                    {req.message ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">« {req.message} »</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => {
                        const b = bookings.find((x) => x.id === req.booking_id);
                        if (b) {
                          openExtendModal(b, req);
                        } else {
                          toast.error("Réservation introuvable.");
                        }
                      }}
                    >
                      <Calendar className="w-3.5 h-3.5" /> Prolonger
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectTarget(req)}>
                      <XCircle className="w-3.5 h-3.5" /> Refuser
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Filtres & Export */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par code, client, chambre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
          />
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Du</span>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white outline-none"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">au</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="text-sm bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
        >
          <option value="all">Tous les statuts</option>
          <option value="overdue">Dépassement de séjour</option>
          <option value="confirmed">Confirmée</option>
          <option value="checked_in">Arrivé</option>
          <option value="checked_out">Parti</option>
          <option value="cancelled">Annulée</option>
          <option value="no_show">No-show</option>
        </select>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setViewMode("table")}
            className={`p-2 rounded-lg text-sm font-medium transition-colors ${viewMode === "table" ? "bg-white dark:bg-slate-700 text-[var(--primary-color,#0C1C33)] dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700"}`}
            title="Vue Tableau"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`p-2 rounded-lg text-sm font-medium transition-colors ${viewMode === "calendar" ? "bg-white dark:bg-slate-700 text-[var(--primary-color,#0C1C33)] dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700"}`}
            title="Vue Calendrier"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
        <Button variant="outline" onClick={exportToCSV} className="gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {/* Calendrier ou Tableau */}
      {viewMode === "calendar" ? (
        <Card className="p-3">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Vue Calendrier (Réservations en cours)</h3>
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">
            <div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div>Sam</div><div>Dim</div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 31 }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateStr = `2026-07-${dayNum < 10 ? '0' + dayNum : dayNum}`;
              const dayBookings = sortedBookings.filter(b => b.check_in_date <= dateStr && b.check_out_date >= dateStr);
              return (
                <div key={idx} className="min-h-[80px] p-2 border border-slate-100 dark:border-slate-700/50 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500">{dayNum}</span>
                  <div className="space-y-1">
                    {dayBookings.slice(0, 2).map(b => (
                      <div key={b.id} className="text-[10px] p-1 rounded bg-[var(--primary-muted)] text-[var(--primary-color,#0C1C33)] font-medium truncate" title={`${b.client?.full_name} - Ch. ${b.room?.room_number}`}>
                        {b.client?.full_name || "Réservation"}
                      </div>
                    ))}
                    {dayBookings.length > 2 && (
                      <span className="text-[9px] text-slate-400 dark:text-slate-500">+{dayBookings.length - 2} de plus</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
        {filteredBookings.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 dark:text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune réservation</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Créez votre première réservation</p>
            <Button onClick={openAddModal}>
              <Plus className="w-4 h-4" /> Nouvelle réservation
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Code</th>
                  <th 
                    aria-sort={sortConfig?.key === "client" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                    className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => requestSort("client")}
                  >
                    Client
                    {sortConfig?.key === "client" ? (sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline-block" /> : <ArrowDown className="w-3 h-3 ml-1 inline-block" />) : <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-30" />}
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Chambre</th>
                  <th 
                    aria-sort={sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                    className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => requestSort("date")}
                  >
                    Dates
                    {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline-block" /> : <ArrowDown className="w-3 h-3 ml-1 inline-block" />) : <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-30" />}
                  </th>
                  <th 
                    aria-sort={sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                    className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => requestSort("amount")}
                  >
                    Montant
                    {sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline-block" /> : <ArrowDown className="w-3 h-3 ml-1 inline-block" />) : <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-30" />}
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Statut</th>
                  <th className="text-right p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {paginatedBookings.map((b) => {
                  const overdue = b.status === "checked_in" && (b.is_overstay || isBookingOverdue(b));
                  return (
                  <tr key={b.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${overdue ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                    <td className="p-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{b.booking_code}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{b.nights_count} nuit{b.nights_count > 1 ? "s" : ""}</p>
                    </td>
                    <td className="p-3">
                      {b.client ? (
                        <button
                          onClick={() => setSelectedClient(b.client!)}
                          className="text-left hover:underline decoration-1 decoration-[var(--muted-hover)]"
                        >
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{b.client.full_name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{b.client.phone || ""}</p>
                        </button>
                      ) : (
                        <p className="text-sm text-slate-400 dark:text-slate-500">—</p>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Ch. {b.room?.room_number || "—"}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{b.room_type?.name || ""}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(b.check_in_date)}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">→ {formatDate(b.check_out_date)}{b.check_out_time ? ` · ${formatTime(b.check_out_time)}` : ""}</p>
                      {overdue && (
                        <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-0.5">
                          Départ prévu dépassé
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{fmt(b.total_amount)}</p>
                      <span className={`text-xs ${getPaymentStatusColor(b.payment_status)}`}>{getPaymentStatusLabel(b.payment_status)}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}>
                          {getBookingStatusLabel(b.status)}
                        </span>
                        {overdue && (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getOverstayColor()}`}>
                            {getOverstayLabel()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {b.status === "cancelled" || b.status === "no_show" ? (
                        <span className="block text-right text-xs text-slate-400 dark:text-slate-500">Aucune action</span>
                      ) : (
                      <div className="flex items-center gap-1 md:gap-2 justify-end">
                        {/* Action primaire — Desktop/tablette : bouton avec libellé complet */}
                        {b.status === "confirmed" && (
                          <Button size="sm" variant="success" className="hidden md:inline-flex" onClick={() => handlePrimaryAction(b.id, "check_in")} loading={actioningId === b.id}>
                            <LogIn className="w-3.5 h-3.5" /> Check-in
                          </Button>
                        )}
                        {b.status === "checked_in" && (
                          <Button size="sm" className="hidden md:inline-flex bg-orange-500 text-white hover:bg-orange-600" onClick={() => handlePrimaryAction(b.id, "check_out")} loading={actioningId === b.id}>
                            <LogOut className="w-3.5 h-3.5" /> Check-out
                          </Button>
                        )}

                        {/* Action primaire — Mobile : icône compacte à grand tap target */}
                        {b.status === "confirmed" && (
                          <Button size="icon" variant="ghost" className="md:hidden h-10 w-10 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" onClick={() => handlePrimaryAction(b.id, "check_in")} loading={actioningId === b.id} aria-label="Check-in">
                            <LogIn className="w-4 h-4" />
                          </Button>
                        )}
                        {b.status === "checked_in" && (
                          <Button size="icon" variant="ghost" className="md:hidden h-10 w-10 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20" onClick={() => handlePrimaryAction(b.id, "check_out")} loading={actioningId === b.id} aria-label="Check-out">
                            <LogOut className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Menu des actions secondaires : toujours visible */}
                        <DropdownMenu>
                          <DropdownMenuTrigger aria-label="Plus d'actions" disabled={actioningId === b.id} className="h-10 w-10 md:h-8 md:w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Séjour</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => shareStayWhatsApp(b)} className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                              <MessageSquare className="w-4 h-4" /> Envoyer l&apos;accès par WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => copyStayLink(b)}>
                              <Copy className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Copier le lien du séjour
                            </DropdownMenuItem>
                            {b.status === "checked_in" && (
                              <DropdownMenuItem onSelect={() => handleMidStayCleaning(b.id)}>
                                <Sparkles className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Demander un ménage
                              </DropdownMenuItem>
                            )}
                            {b.status === "checked_in" && (
                              <DropdownMenuItem onSelect={() => openExtendModal(b)}>
                                <Calendar className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Prolonger le séjour
                              </DropdownMenuItem>
                            )}
                            {(b.status === "confirmed" || b.status === "checked_in" || b.status === "checked_out") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Facturation</DropdownMenuLabel>
                                {invoicesMap[b.id]?.pdf_url ? (
                                  <DropdownMenuItem onSelect={() => handleDownloadInvoice(invoicesMap[b.id])} className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                    <Receipt className="w-4 h-4" /> Télécharger la facture
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onSelect={() => handleGenerateInvoice(b)} className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                    <Receipt className="w-4 h-4" /> Générer la facture PDF
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {(b.status === "confirmed" || b.status === "checked_in") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Zone sensible</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => handleAction(b.id, "cancel")} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                                  <XCircle className="w-4 h-4" /> Annuler la réservation
                                </DropdownMenuItem>
                                {b.status === "confirmed" && (
                                  <DropdownMenuItem onSelect={() => handleAction(b.id, "no_show")} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                                    <UserX className="w-4 h-4" /> Marquer en no-show
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Affichage {((currentPage - 1) * ITEMS_PER_PAGE) + 1} à {Math.min(currentPage * ITEMS_PER_PAGE, filteredBookings.length)} sur {filteredBookings.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium px-2 text-slate-700 dark:text-slate-300">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
       )}

      {/* Drawer — Détails client (panneau latéral droit) */}
      {selectedClient && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
            onClick={() => setSelectedClient(null)}
          />

          {/* Panel latéral */}
          <div className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md lg:w-[480px] h-full transform transition-transform duration-300 ease-in-out">
            <div className="relative h-full w-full overflow-y-auto bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">

              {/* Header */}
              <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                    {selectedClient.full_name}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Détails du client</p>
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="ml-4 p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">

                {/* Contact */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Contact</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Téléphone principal</label>
                      <p className="text-sm text-slate-900 dark:text-white">{selectedClient.phone || "—"}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Email</label>
                      {selectedClient.email ? (
                        <p className="text-sm text-slate-900 dark:text-white break-words">{selectedClient.email}</p>
                      ) : (
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                          Non renseigné
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Contact d'urgence</label>
                      <p className="text-sm text-slate-900 dark:text-white break-words">{selectedClient.emergency_contact || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Pièce d'identité & Nationalité */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Identité & Nationalité</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Pièce</label>
                      <p className="text-sm text-slate-900 dark:text-white">{selectedClient.id_type || "—"}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Numéro de pièce</label>
                      <p className="text-sm text-slate-900 dark:text-white break-words">{selectedClient.id_number || "—"}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Nationalité</label>
                    <p className="text-sm text-slate-900 dark:text-white">{selectedClient.nationality || "—"}</p>
                  </div>
                </div>

                {/* Historique des réservations */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Historique des réservations</h3>
                  {bookings.filter(bk => bk.client_id === selectedClient.id).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Aucune réservation enregistrée.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {bookings.filter(bk => bk.client_id === selectedClient.id).map(bk => (
                        <div key={bk.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{bk.booking_code}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                            {formatDate(bk.check_in_date)} → {formatDate(bk.check_out_date)} — {bk.nights_count} nuit{bk.nights_count > 1 ? "s" : ""}
                          </p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{fmt(bk.total_amount)} — {getBookingStatusLabel(bk.status)}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => shareStayWhatsApp(bk)}
                                className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-xs flex items-center gap-1 font-medium"
                                title="Partager WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                              </button>
                              <button
                                onClick={() => copyStayLink(bk)}
                                className="p-1 rounded text-[var(--primary-color,#0C1C33)] hover:bg-[var(--primary-muted)] text-xs flex items-center gap-1 font-medium"
                                title="Copier le lien"
                              >
                                <Copy className="w-3.5 h-3.5" /> Copier
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal nouvelle réservation */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nouvelle réservation"
        description="Créez une réservation avec vérification anti double-booking"
        size="lg"
      >
        <div className="space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Établissement</label>
            <select
              value={formData.accommodation_id}
              onChange={(e) => {
                setFormData({ ...formData, accommodation_id: e.target.value, room_id: "" });
                loadRoomsForAccommodation(e.target.value);
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Sélectionner un établissement</option>
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
                    Ch. {r.room_number} — {rt?.name || ""} — {rt ? fmt(rt.base_price) : ""}
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
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Nom du nouveau client" value={formData.newClientName} onChange={(e) => setFormData({ ...formData, newClientName: e.target.value })} placeholder="Jean Kouassi" />
                <Input label="Téléphone (optionnel)" value={formData.newClientPhone} onChange={(e) => setFormData({ ...formData, newClientPhone: e.target.value })} placeholder="+225 07 00 00 00 00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Email (optionnel)" type="email" value={formData.newClientEmail} onChange={(e) => setFormData({ ...formData, newClientEmail: e.target.value })} placeholder="jean@example.com" />
                <Input label="Contact d'urgence (optionnel)" value={formData.newClientEmergencyContact} onChange={(e) => setFormData({ ...formData, newClientEmergencyContact: e.target.value })} placeholder="+225 01 00 00 00 00" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type de pièce</label>
                  <select
                    value={formData.newClientIdType}
                    onChange={(e) => setFormData({ ...formData, newClientIdType: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Sélectionner</option>
                    <option value="CNI">CNI</option>
                    <option value="Passeport">Passeport</option>
                    <option value="Permis">Permis de conduire</option>
                    <option value="Carte Consulaire">Carte Consulaire</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                <Input label="Numéro de pièce (optionnel)" value={formData.newClientIdNumber} onChange={(e) => setFormData({ ...formData, newClientIdNumber: e.target.value })} placeholder="Numéro..." />
                <Input label="Nationalité (optionnel)" value={formData.newClientNationality} onChange={(e) => setFormData({ ...formData, newClientNationality: e.target.value })} placeholder="Ivoirienne" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Date d'arrivée" type="date" value={formData.check_in_date} onChange={(e) => setFormData({ ...formData, check_in_date: e.target.value })} />
            <Input label="Date de départ" type="date" value={formData.check_out_date} onChange={(e) => setFormData({ ...formData, check_out_date: e.target.value })} />
          </div>

          {formData.check_in_date && formData.check_out_date && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-sm text-indigo-700 dark:text-indigo-300">
              {calculateNights(formData.check_in_date, formData.check_out_date)} nuit(s) × {fmt(parseInt(formData.negotiated_price) || 0)} ={" "}
              <strong>{fmt((parseInt(formData.negotiated_price) || 0) * calculateNights(formData.check_in_date, formData.check_out_date))}</strong>
            </div>
          )}

          <Input label="Prix négocié par nuit (FCFA)" type="number" value={formData.negotiated_price} onChange={(e) => setFormData({ ...formData, negotiated_price: e.target.value })} placeholder="15000" />

           <div className="grid grid-cols-2 gap-4">
             <Input label="Nombre de clients" type="number" value={formData.number_of_guests} onChange={(e) => setFormData({ ...formData, number_of_guests: e.target.value })} placeholder="1" />
           </div>

           <div>
             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Moyen de paiement</label>
             <select
               name="payment_method"
               value={formData.payment_method}
               onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
               className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
             >
               <option value="">Sélectionner un moyen de paiement</option>
               <option value="cash">Espèces</option>
               <option value="mobile_money">Mobile Money</option>
               <option value="bank">Virement bancaire</option>
               <option value="other">Autre</option>
              </select>
            </div>

            {formData.payment_method === "mobile_money" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Opérateur Mobile Money</label>
                <select
                  name="mobile_money_operator"
                  value={formData.mobile_money_operator}
                  onChange={(e) => setFormData({ ...formData, mobile_money_operator: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sélectionner un opérateur</option>
                  {MOBILE_MONEY_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>
            )}

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

          <div 
            className="flex items-center gap-3 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 cursor-pointer" 
            onClick={() => setFormData({ ...formData, immediateCheckIn: !formData.immediateCheckIn })}
          >
            <input 
              type="checkbox" 
              checked={formData.immediateCheckIn} 
              onChange={(e) => setFormData({ ...formData, immediateCheckIn: e.target.checked })}
              className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
              onClick={(e) => e.stopPropagation()}
            />
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Check-in immédiat (Walk-in)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Le client occupe la chambre dès maintenant.</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={saving}>Créer la réservation</Button>
          </div>
        </div>
      </Modal>

      {/* Modal demande ménage en cours de séjour */}
      <Modal
        open={cleaningModalOpen}
        onClose={() => setCleaningModalOpen(false)}
        title="Demander un ménage en cours de séjour"
        description="Une tâche de ménage sera envoyée dans le pool des ménagères"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--primary-muted)] text-[var(--primary-color,#0C1C33)] border border-[var(--primary-color)]/20">
            <Sparkles className="w-6 h-6 text-[var(--primary-color,#0C1C33)] flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--primary-color,#0C1C33)]">Ménage en cours de séjour</p>
              <p className="text-xs text-[var(--primary-color,#0C1C33)]/80 mt-1">
                La chambre restera occupée. La ménagère verra la mention « Chambre occupée — vérifier avant d'entrer ».
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setCleaningModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={confirmMidStayCleaning} loading={cleaningLoading}>
              <Sparkles className="w-4 h-4" /> Confirmer la demande
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Prolonger le séjour (dépassement de la date de départ) */}
      <Modal
        open={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        title="Prolonger le séjour"
        description={extendBooking ? `${extendBooking.client?.full_name || "Client"} · Ch. ${extendBooking.room?.room_number || "—"} · départ actuel le ${formatDate(extendBooking.check_out_date)}` : ""}
      >
        <div className="space-y-3">
          {extendBooking && (() => {
            const nights = calculateNights(extendBooking.check_in_date, extendDate);
            const newTotal = (extendBooking.negotiated_price || 0) * nights;
            const supplement = Math.max(0, newTotal - (extendBooking.total_amount || 0));
            return (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">
                  Total recalculé : <strong>{fmt(newTotal)}</strong> ({nights} nuit(s) × {fmt(extendBooking.negotiated_price)}).
                  {" "}Supplément dû : <strong>{fmt(supplement)}</strong>
                </p>
              </div>
            );
          })()}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Nouvelle date de départ</label>
            <Input
              type="date"
              value={extendDate}
              min={extendBooking ? new Date(extendBooking.check_in_date).toISOString().split("T")[0] : undefined}
              onChange={(e) => {
                const date = e.target.value;
                setExtendDate(date);
                // Resynchronise le montant pré-rempli avec le supplément réel :
                // le champ doit suivre la date choisie, pas rester sur « +1 nuit ».
                if (extendBooking && date) {
                  const nights = calculateNights(extendBooking.check_in_date, date);
                  const supplement = Math.max(0, (extendBooking.negotiated_price || 0) * nights - (extendBooking.total_amount || 0));
                  setExtendAmount(supplement > 0 ? String(supplement) : "");
                }
              }}
            />
          </div>

          {/* Paiement du supplément — la réceptionniste précise si le client a
              payé et par quel moyen, sans quitter le formulaire de prolongation */}
          <div className="pt-1 space-y-3">
            <div
              className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] cursor-pointer"
              onClick={() => setExtendPaid(!extendPaid)}
            >
              <input
                type="checkbox"
                checked={extendPaid}
                onChange={(e) => setExtendPaid(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 rounded text-[var(--primary-color,#0C1C33)] focus:ring-[var(--primary-color,#0C1C33)]"
              />
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Le client a payé le supplément</p>
                <p className="text-xs text-[var(--muted-foreground)]">Le paiement sera enregistré dans la caisse du shift.</p>
              </div>
            </div>

            {extendPaid && (
              <div className="space-y-3 pt-3 border-t border-[var(--border)]">
                <Input
                  label="Montant payé (FCFA)"
                  type="number"
                  value={extendAmount}
                  onChange={(e) => setExtendAmount(e.target.value)}
                  placeholder={extendBooking ? String(Math.max(0, (extendBooking.negotiated_price || 0) * calculateNights(extendBooking.check_in_date, extendDate) - (extendBooking.total_amount || 0))) : ""}
                />
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Moyen de paiement</label>
                  <select
                    name="extend_payment_method"
                    value={extendPaymentMethod}
                    onChange={(e) => setExtendPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
                  >
                    <option value="">Sélectionner un moyen de paiement</option>
                    <option value="cash">Espèces</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="bank">Virement bancaire</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                {extendPaymentMethod === "mobile_money" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Opérateur Mobile Money</label>
                    <select
                      name="extend_mobile_operator"
                      value={extendMobileOperator}
                      onChange={(e) => setExtendMobileOperator(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
                    >
                      <option value="">Sélectionner un opérateur</option>
                      {MOBILE_MONEY_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setExtendModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleExtendBooking} loading={saving}>
              <Calendar className="w-4 h-4" /> Prolonger le séjour
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmation de refus d'une demande de prolongation client */}
      <Modal
        open={!!rejectTarget}
        onClose={() => !rejecting && setRejectTarget(null)}
        title="Refuser la prolongation"
        description={rejectTarget ? `${rejectTarget.client?.full_name || "Client"} · Ch. ${rejectTarget.room?.room_number || "—"} · départ souhaité le ${formatDate(rejectTarget.requested_check_out_date)}` : ""}
      >
        {rejectTarget && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                Refuser la demande de prolongation de <strong>{rejectTarget.client?.full_name || "ce client"}</strong> ?
                Le client sera informé que son départ reste fixé au {formatDate(rejectTarget.booking?.check_out_date || rejectTarget.requested_check_out_date)}.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectTarget(null)} disabled={rejecting}>
                Annuler
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleRejectExtension} loading={rejecting}>
                <XCircle className="w-4 h-4" /> Refuser
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Règlement au check-out (solde restant dû) */}
      <Modal
        open={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        title="Règlement au check-out"
        description={checkoutBooking ? `${checkoutBooking.client?.full_name || "Client"} · Ch. ${checkoutBooking.room?.room_number || "—"} · ${formatDate(checkoutBooking.check_out_date)}` : ""}
      >
        <div className="space-y-3">
          {checkoutBooking && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p>
                  Total du séjour : <strong>{fmt(checkoutBooking.total_amount)}</strong>
                  {" · "}Déjà réglé : <strong>{fmt(checkoutBooking.amount_paid)}</strong>
                </p>
                <p className="mt-1 font-semibold">
                  Solde restant dû : <strong>{fmt(Math.max(0, checkoutBooking.total_amount - checkoutBooking.amount_paid))}</strong>
                </p>
              </div>
            </div>
          )}

          <Input
            label="Montant encaissé (FCFA)"
            type="number"
            value={checkoutForm.amount}
            onChange={(e) => setCheckoutForm({ ...checkoutForm, amount: e.target.value })}
          />
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Moyen de paiement</label>
            <select
              name="checkout_payment_method"
              value={checkoutForm.payment_method}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, payment_method: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
            >
              <option value="">Sélectionner un moyen de paiement</option>
              <option value="cash">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank">Virement bancaire</option>
              <option value="other">Autre</option>
            </select>
          </div>
          {checkoutForm.payment_method === "mobile_money" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Opérateur Mobile Money</label>
              <select
                name="checkout_mobile_operator"
                value={checkoutForm.mobile_money_operator}
                onChange={(e) => setCheckoutForm({ ...checkoutForm, mobile_money_operator: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                <option value="">Sélectionner un opérateur</option>
                {MOBILE_MONEY_OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCheckoutSkip}
              loading={checkoutSaving}
            >
              Confirmer sans encaisser
            </Button>
            <Button className="flex-1" onClick={handleCheckoutConfirm} loading={checkoutSaving}>
              <LogOut className="w-4 h-4" /> Check-out + règlement
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmation (Annulation / No-Show) */}
      <Modal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title="Confirmation requise"
        description={confirmAction?.action === "cancel" ? "Êtes-vous sûr de vouloir annuler cette réservation ?" : "Voulez-vous marquer cette réservation comme No-show ?"}
      >
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>Cette action est irréversible. La chambre sera immédiatement libérée pour d'autres réservations.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmAction(null)}>Retour</Button>
            <Button 
              className="flex-1 bg-red-600 hover:bg-red-700 text-white" 
              onClick={() => {
                if (confirmAction) executeAction(confirmAction.id, confirmAction.action);
              }}
            >
              Confirmer
            </Button>
          </div>
        </div>
      </Modal>

        {/* Modal Facture */}
        {selectedBookingForInvoice && (
          <Modal
            open={invoiceModalOpen}
            onClose={() => setInvoiceModalOpen(false)}
            title="Facture générée"
            size="md"
          >
            <div className="space-y-3">
              {invoicesMap[selectedBookingForInvoice.id]?.pdf_url && (
                <div className="aspect-[3/4] bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <iframe
                    src={invoicesMap[selectedBookingForInvoice.id]?.pdf_url || ""}
                    title={`Facture ${invoicesMap[selectedBookingForInvoice.id].invoice_number}`}
                    className="w-full h-full"
                  />
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Numéro de facture</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {invoicesMap[selectedBookingForInvoice.id]?.invoice_number || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Montant total</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {fmt(invoicesMap[selectedBookingForInvoice.id]?.total_amount || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Statut</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {invoicesMap[selectedBookingForInvoice.id]?.status === "draft"
                      ? "Brouillon"
                      : invoicesMap[selectedBookingForInvoice.id]?.status === "sent"
                      ? "Envoyée"
                      : invoicesMap[selectedBookingForInvoice.id]?.status === "paid"
                      ? "Payée"
                      : "Non payée"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => handleDownloadInvoice(invoicesMap[selectedBookingForInvoice.id])}
                  disabled={!invoicesMap[selectedBookingForInvoice.id]?.pdf_url}
                >
                  <Download className="w-4 h-4" /> Télécharger
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => openSendInvoiceModal(invoicesMap[selectedBookingForInvoice.id])}
                >
                  <MessageSquare className="w-4 h-4" /> Envoyer
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal Envoi de facture */}
        {invoiceToSend && (
          <Modal
            open={!!invoiceToSend}
            onClose={closeSendInvoiceModal}
            title="Envoyer la facture"
            size="sm"
          >
            <div className="space-y-3">
              <Input
                label="Adresse e-mail du client"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="client@example.com"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Aucun e-mail n’est envoyé automatiquement. Cette action enregistre seulement
                le destinataire et le statut ; partagez ensuite le lien sécurisé via votre canal habituel.
              </p>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={closeSendInvoiceModal}>
                  Annuler
                </Button>
                <Button className="flex-1" onClick={() => handleSendInvoice(invoiceToSend)}>
                  Marquer comme envoyée
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal Upsell Espace client (formule Entreprise) */}
        <Modal
          open={portalUpsell}
          onClose={() => setPortalUpsell(false)}
          title="Espace client — Formule Entreprise"
          size="sm"
        >
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-3 rounded-xl bg-gradient-to-br from-[var(--primary-muted,#E8EDF5)] to-transparent p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-color,#0C1C33)] text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Offrez à chaque client une <strong>page séjour privée</strong>, accessible depuis son
                mobile : infos du séjour, demandes de services et suivi du paiement, actives pendant
                toute la durée du séjour — automatiquement prolongées en cas de prolongation.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <a href="/dashboard/subscription">
                <Button className="w-full gap-2" loading={portalLoading}>
                  <Sparkles className="h-4 w-4" /> Passer à la formule Entreprise
                </Button>
              </a>
              <Button variant="outline" onClick={() => setPortalUpsell(false)}>
                Plus tard
              </Button>
            </div>
          </div>
        </Modal>
    </div>
  );
}
