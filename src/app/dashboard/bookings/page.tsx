"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { StayTimeline } from "@/components/stay-timeline";
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
  formatAmount,
} from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { useAccommodation } from "@/hooks/use-accommodation";
import { BookingsSkeleton } from "@/components/ui/skeletons";
import Link from "next/link";
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
  Pencil,
  History,
  ArrowRight,
  ArrowLeftRight,
  Zap,
  Info,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getActiveAssignmentId } from "@/lib/assignments";
import { canAccessFeature } from "@/lib/subscription-plans";
import { ClientScoreBadge } from "@/components/client-score-badge";
import PdfPreview from "@/components/pdf-preview";
import type { Accommodation, RoomType, Room, Client, Booking, Invoice, PaymentMethod, ClientStayExtensionRequest, ClientScoreTier } from "@/types/database";

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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [editForm, setEditForm] = useState({
    check_in_date: "",
    check_out_date: "",
    room_id: "",
    negotiated_price: "",
  });
  const [editError, setEditError] = useState("");
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

  // Paiement partiel en cours de séjour (enregistré par la réceptionniste)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentBooking, setPaymentBooking] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "cash",
    mobile_money_operator: "",
  });

  // Check-in enrichi : saisie / complément d'identité du client lors de son arrivée
  const [checkinModalOpen, setCheckinModalOpen] = useState(false);
  const [checkinBooking, setCheckinBooking] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinForm, setCheckinForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    id_type: "",
    id_number: "",
    nationality: "",
    emergency_contact: "",
  });
  const [checkinRoomTypeId, setCheckinRoomTypeId] = useState<string>("");
  const [checkinRoomId, setCheckinRoomId] = useState<string>("");
  // Changement de chambre pendant le séjour
  // Autocomplete client dans le champ "Nom du nouveau client"
  const [nameSuggestions, setNameSuggestions] = useState<Client[]>([]);
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false);
  const [nameSuggestionsLoading, setNameSuggestionsLoading] = useState(false);
  const nameSuggestionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup du timeout autocomplete au démontage
  useEffect(() => {
    return () => {
      if (nameSuggestionsTimeoutRef.current) clearTimeout(nameSuggestionsTimeoutRef.current);
    };
  }, []);

  const [changeRoomOpen, setChangeRoomOpen] = useState(false);
  const [changeRoomBooking, setChangeRoomBooking] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [changeRoomTypeId, setChangeRoomTypeId] = useState<string>("");
  const [changeRoomId, setChangeRoomId] = useState<string>("");
  const [changeRoomSaving, setChangeRoomSaving] = useState(false);

  // Mode édition client dans le tiroir d'informations
  const [editingClientInDrawer, setEditingClientInDrawer] = useState(false);
  const [drawerClientForm, setDrawerClientForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    id_type: "",
    id_number: "",
    nationality: "",
    emergency_contact: "",
  });
  const [drawerClientSaving, setDrawerClientSaving] = useState(false);
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
  // Filtre UI de la liste : "all" = toutes les résidences, sinon id de résidence.
  // Suit la résidence active (header) tant que l'utilisateur n'a pas choisi
  // lui-même une valeur explicite ("all" ou une résidence précise).
  const { activeAccommodationId } = useAccommodation();
  const [accomFilter, setAccomFilter] = useState<string>("all");
  // Chambres disponibles pour les dates sélectionnées
  const [availableRooms, setAvailableRooms] = useState<(Room & { room_type?: RoomType })[]>([]);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const userPickedAccomRef = useRef(false);
  const loadBookingsRef = useRef(loadBookings);
  loadBookingsRef.current = loadBookings;
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [expandedTimelineBookingId, setExpandedTimelineBookingId] = useState<string | null>(null);
  // Scores de réputation (vue client_profiles) pour le badge du drawer client
  const [clientProfiles, setClientProfiles] = useState<Record<string, { score: number; tier: ClientScoreTier }>>({});
  // Fiche intelligente réservée à la formule Entreprise
  const [hasClientProfiles, setHasClientProfiles] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedBookingForInvoice, setSelectedBookingForInvoice] = useState<(Booking & { client?: Client; room?: Room; room_type?: RoomType }) | null>(null);
  const [invoicesMap, setInvoicesMap] = useState<Record<string, Invoice>>({});
  const [invoiceToSend, setInvoiceToSend] = useState<Invoice | null>(null);
  const [emailInput, setEmailInput] = useState("");
  // Blob URL du PDF affiché dans la modal (évite les iframes cross-origin)
  const invoicePdfBlobUrlRef = useRef<string | null>(null);

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
        toast.error(json?.error || "L'accès client n'a pas pu être généré 🔑");
        return null;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return { url: `${origin}${json.url}` };
    } catch {
      toast.error("Oups, un petit souci technique ! Réessayez 🤕");
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
    room_type_id: "",
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

  // Suit la résidence active (sélecteur du header) : la liste se refiltre
  // automatiquement tant que l'utilisateur n'a pas choisi une résidence
  // ("all" ou précise) de manière explicite dans la liste.
  useEffect(() => {
    if (userPickedAccomRef.current) return;
    const target = activeAccommodationId ?? "all";
    setAccomFilter(target);
    accommodationFilterRef.current = activeAccommodationId ?? undefined;
    if (tenantId) loadBookingsRef.current(tenantId, accommodationFilterRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccommodationId]);

  // Auto-vérifier la disponibilité quand les dates ou l'établissement changent
  useEffect(() => {
    if (formData.accommodation_id && formData.check_in_date && formData.check_out_date) {
      const nights = calculateNights(formData.check_in_date, formData.check_out_date);
      if (nights > 0) {
        checkAvailability(formData.accommodation_id, formData.check_in_date, formData.check_out_date);
      }
    } else {
      setAvailableRooms([]);
      setAvailabilityChecked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.accommodation_id, formData.check_in_date, formData.check_out_date]);

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
  // Ouvre le check-in si ?checkin=<bookingId> est dans l'URL
  useEffect(() => {
    if (typeof window !== "undefined" && !loading) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "1") {
        openAddModal();
      }
      const checkinId = params.get("checkin");
      if (checkinId) {
        const target = bookings.find((b) => b.id === checkinId);
        if (target && (target.status === "confirmed")) {
          openCompleteClientModal(target);
        }
      }
      // Nettoyer l'URL pour éviter de rouvrir la modal au refresh
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bookings]);

  // Nettoyage du blob URL de la facture lors du démontage du composant
  useEffect(() => {
    return () => {
      if (invoicePdfBlobUrlRef.current) {
        URL.revokeObjectURL(invoicePdfBlobUrlRef.current);
        invoicePdfBlobUrlRef.current = null;
      }
    };
  }, []);

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

      // Scores de réputation (vue client_profiles) pour le badge du drawer —
      // réservé à la formule Entreprise.
      const hasClientProfiles = canAccessFeature("clientSmartProfile", subData?.plan);
      setHasClientProfiles(hasClientProfiles);
      if (hasClientProfiles) {
        const { data: profileData } = await supabase
          .from("client_profiles")
          .select("client_id, score, tier");
        if (profileData) {
          const map: Record<string, { score: number; tier: ClientScoreTier }> = {};
          (profileData as { client_id: string; score: number; tier: ClientScoreTier }[]).forEach((p) => {
            map[p.client_id] = { score: p.score, tier: p.tier };
          });
          setClientProfiles(map);
        }
      }

      // Pré-sélectionner la résidence si le réceptionniste n'en a qu'une
      if (userData.role === "receptionniste" && activeAccId) {
        setFormData((prev) => ({ ...prev, accommodation_id: activeAccId ?? "" }));
      }

      accommodationFilterRef.current = userData.role === "receptionniste" ? (activeAccId ?? undefined) : (activeAccommodationId ?? undefined);
      setAccomFilter(
        userData.role === "receptionniste" ? (activeAccId ?? "all") : (activeAccommodationId ?? "all")
      );
      await runOverstayCheck();
      await loadBookings(userData.tenant_id, accommodationFilterRef.current);
      await loadInvoices(userData.tenant_id);
      await loadExtensionRequests(userData.tenant_id);
    } catch (err) {
      toast.error("Oups, les données n'ont pas pu se charger... Réessayez 🔄");
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
      toast.error("Les réservations sont introuvables pour l'instant 🤔");
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

   async function loadRoomsForAccommodation(accId: string): Promise<RoomType[]> {
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
         return types;
       }
      } catch (err) {
        toast.error("Les chambres ne veulent pas se charger... 🛏️");
        console.error(err);
      }
      return [];
    }

    // Vérifie la disponibilité des chambres pour un établissement et des dates données
    async function checkAvailability(accId: string, checkIn: string, checkOut: string) {
      setAvailabilityLoading(true);
      setAvailabilityChecked(false);
      setAvailableRooms([]);
      try {
        const supabase = createClient();
        // 1. Charger toutes les chambres de l'établissement qui ne sont pas en maintenance
        //    RLS filtre automatiquement par tenant via la jointure accommodations.
        const { data: allRooms, error: roomErr } = await supabase
          .from("rooms")
          .select("*, room_type:room_types(*)")
          .eq("accommodation_id", accId)
          .order("room_number");
        if (roomErr) {
          console.error("Erreur chargement chambres:", roomErr);
          throw roomErr;
        }
        if (!allRooms || allRooms.length === 0) {
          setAvailableRooms([]);
          setAvailabilityChecked(true);
          setAvailabilityLoading(false);
          return;
        }
        // 2. Charger les réservations qui chevauchent les dates demandées.
        //    RLS filtre par tenant_id automatiquement (bookings_select_*).
        const { data: overlaps, error: bookingErr } = await supabase
          .from("bookings")
          .select("room_id")
          .eq("accommodation_id", accId)
          .in("status", ["confirmed", "checked_in"])
          .lt("check_in_date", checkOut)
          .gt("check_out_date", checkIn);
        if (bookingErr) {
          console.error("Erreur chargement réservations:", bookingErr);
          throw bookingErr;
        }
        const bookedRoomIds = new Set(
          (overlaps || []).filter((b) => b.room_id != null).map((b) => b.room_id as string)
        );
        // 3. Filtrer : seules les chambres sans réservation qui chevauchent sont libres.
        //    On N'utilise PAS le statut de la chambre : une chambre "occupied"
        //    dont le client part aujourd'hui est libre pour demain.
        const free = (allRooms as unknown as (Room & { room_type?: RoomType })[]).filter(
          (r) => !bookedRoomIds.has(r.id)
        );
        setAvailableRooms(free);
        setAvailabilityChecked(true);
      } catch (err) {
        console.error("Erreur vérification disponibilité:", err);
        toast.error("Erreur de disponibilité — vérifiez la console pour le détail 🔍");
        setAvailableRooms([]);
        setAvailabilityChecked(true);
      } finally {
        setAvailabilityLoading(false);
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

        // Le POST peut retourner le PDF binaire ou une erreur JSON.
        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          toast.error((result as { error?: string }).error || "La facture n'a pas pu être générée 📄", { id: loadingToast });
          return;
        }

        if (contentType.includes("application/pdf")) {
          // Réponse binaire : le PDF est retourné directement.
          const pdfBlob = await response.blob();
          // Libérer l'ancien blob URL s'il existe
          if (invoicePdfBlobUrlRef.current) {
            URL.revokeObjectURL(invoicePdfBlobUrlRef.current);
          }
          const blobUrl = URL.createObjectURL(pdfBlob);
          invoicePdfBlobUrlRef.current = blobUrl;

          const invoiceNumber = response.headers.get("x-invoice-number") || "";
          const alreadyGenerated = response.headers.get("x-already-generated") === "true";
          // Mettre à jour la map des factures avec les infos de base
          setInvoicesMap((prev) => ({
            ...prev,
            [booking.id]: {
              ...(prev[booking.id] || {}),
              id: booking.id,
              booking_id: booking.id,
              tenant_id: booking.tenant_id,
              invoice_number: invoiceNumber,
              pdf_url: blobUrl,
              total_amount: booking.total_amount || 0,
              amount: booking.total_amount || 0,
              tax_amount: 0,
              status: "draft",
              created_by: userId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as Invoice,
          }));
          setSelectedBookingForInvoice(booking);
          setInvoiceModalOpen(true);

          if (alreadyGenerated) {
            toast("Facture existante retrouvée.", { id: loadingToast, duration: 3000 });
          } else {
            toast.success("Facture prête ! 🧾", { id: loadingToast });
          }
        } else {
          // Fallback : réponse JSON (ancien comportement)
          const result = await response.json();
          const invoice = result.invoice as Invoice;
          setInvoicesMap((prev) => ({ ...prev, [booking.id]: invoice }));
          setSelectedBookingForInvoice(booking);
          setInvoiceModalOpen(true);
          toast.success("Facture générée avec succès !", { id: loadingToast });
        }
      } catch (err) {
        toast.error("Oups, un petit souci technique ! Réessayez 🤕", { id: loadingToast });
        console.error(err);
      }
    }

    async function handleSendInvoice(invoice: Invoice) {
      const email = emailInput.trim();
      if (!email) {
        toast.error("Ajoutez une adresse email pour envoyer la facture ✉️");
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
        toast.success("Facture envoyée par email ✉️", { id: loadingToast });
      } catch (err) {
        toast.error("L'envoi a échoué... Vérifiez votre connexion ✉️", { id: loadingToast });
        console.error(err);
      }
    }

    async function handleDownloadInvoice(invoice: Invoice) {
      try {
        const response = await fetch(`/api/invoice/generate?bookingId=${encodeURIComponent(invoice.booking_id)}`);
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/pdf")) {
          const pdfBlob = await response.blob();
          const blobUrl = URL.createObjectURL(pdfBlob);
          window.open(blobUrl, "_blank", "noopener,noreferrer");
          // Nettoyage différé
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        } else {
          // Fallback JSON
          const result = await response.json();
          if (!response.ok || !result.invoice?.pdf_url) throw new Error(result.error || "Aucun PDF disponible pour cette facture.");
          window.open(result.invoice.pdf_url, "_blank", "noopener,noreferrer");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "L'action a échoué : ouvrir la facture 📄");
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
    const singleAccId = accommodations.length === 1 ? accommodations[0].id : "";
    // Si une seule résidence, la pré-sélectionner pour que la vérification
    // de disponibilité se déclenche automatiquement
    if (singleAccId) {
      loadRoomsForAccommodation(singleAccId);
    }
    setFormData({
      accommodation_id: singleAccId,
      room_type_id: "",
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
    setNameSuggestions([]);
    setNameSuggestionsOpen(false);
    setModalOpen(true);
  }

  async function handleSave() {
    setError("");
    if (!formData.accommodation_id || !formData.room_id || !formData.check_in_date || !formData.check_out_date) {
      setError("Il manque des champs obligatoires ! Remplissez tout 📋");
      return;
    }

    const nights = calculateNights(formData.check_in_date, formData.check_out_date);
    if (nights <= 0) {
      setError("La date de départ doit être après l'arrivée 📅");
      return;
    }

    const negotiatedPrice = parseInt(formData.negotiated_price) || 0;
    if (negotiatedPrice <= 0) {
      setError("Le prix doit être supérieur à 0 💰");
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
            accommodation_id: formData.accommodation_id || null,
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
          setError("Oups, le client n'a pas pu être créé : " + clientErr.message);
          setSaving(false);
          return;
        }
        clientId = newClient.id;
      }

      if (!clientId) {
        setError("On a besoin d'un client ! Sélectionnez un existant ou créez-en un 👤");
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
        setError("La vérification de disponibilité a échoué 🔄");
        setSaving(false);
        return;
      }

      if (!isAvailable) {
        setError("Cette chambre est déjà réservée pour ces dates 📅 Essayez d'autres dates ou une autre chambre.");
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
        p_booking_source: 'manual',
      });

      if (bookingErr) {
        if (bookingErr.message.includes("DOUBLE_BOOKING")) {
          setError("Conflit de réservation détecté ! Cette chambre est prise pour ces dates 🚫");
        } else {
          setError("La réservation n'a pas pu être créée : " + bookingErr.message);
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
          toast.error("Réservation créée ✅ mais le paiement a échoué : " + payErr.message);
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
          p_allow_early: false,
          p_allow_late: false,
        });
        if (checkInErr) {
          toast.error("Réservation créée ✅ mais le check-in a échoué : " + checkInErr.message);
        } else {
          toast.success("Réservation créée, check-in effectué et paiement enregistré ✓");
        }
      } else {
        toast.success(formData.payment_method
          ? "Réservation créée et paiement enregistré ✓"
          : "Réservation enregistrée ! 🎉"
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
        toast.error("Oups : " + error.message);
      } else {
        setCleaningModalOpen(false);
        toast.success("Ménage demandé ! Les ménagères sont prévenues 🧹");
      }
    } catch {
      toast.error("Oups, un petit souci technique ! Réessayez 🤕");
    } finally {
      setCleaningLoading(false);
    }
  }

  async function handleAction(bookingId: string, action: "check_in" | "check_out" | "cancel" | "no_show") {
    if (action === "cancel" || action === "no_show") {
      setConfirmAction({ id: bookingId, action });
      return;
    }

    // Check-in : ouvrir la modal de confirmation d'arrivée & complément d'identité client
    if (action === "check_in") {
      const b = bookings.find((x) => x.id === bookingId);
      if (b) {
        openCompleteClientModal(b);
        return;
      }
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

  // Ouvre la modal pour compléter / modifier la fiche client
  function openCompleteClientModal(b: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    setCheckinBooking(b);
    const c = b.client;
    setCheckinForm({
      full_name: c?.full_name || "",
      phone: c?.phone || "",
      email: c?.email || "",
      id_type: c?.id_type || "",
      id_number: c?.id_number || "",
      nationality: c?.nationality || "",
      emergency_contact: c?.emergency_contact || "",
    });
    setCheckinRoomTypeId(b.room?.room_type_id || "");
    setCheckinRoomId(b.room_id || "");
    setCheckinModalOpen(true);
  }

  // Enregistre uniquement les informations client (sans changer le statut de la réservation)
  async function handleSaveClientOnly() {
    if (!checkinBooking || !checkinBooking.client_id) return;
    setCheckinSaving(true);
    try {
      const supabase = createClient();
      const { error: clientErr } = await supabase
        .from("clients")
        .update({
          full_name: checkinForm.full_name.trim(),
          phone: checkinForm.phone.trim() || null,
          email: checkinForm.email.trim() || null,
          id_type: checkinForm.id_type || null,
          id_number: checkinForm.id_number.trim() || null,
          nationality: checkinForm.nationality.trim() || null,
          emergency_contact: checkinForm.emergency_contact.trim() || null,
        })
        .eq("id", checkinBooking.client_id);

      if (clientErr) {
        toast.error("La mise à jour a échoué : " + clientErr.message);
        setCheckinSaving(false);
        return;
      }

      toast.success("Fiche client mise à jour 👤");
      setCheckinModalOpen(false);
      loadBookings(tenantId);
    } catch {
      toast.error("La sauvegarde a foiré 😅");
    } finally {
      setCheckinSaving(false);
    }
  }

  // Valide le Check-in avec mise à jour facultative des informations client (CNI, etc.)
  async function handleConfirmCheckin() {
    if (!checkinBooking) return;
    setCheckinSaving(true);
    try {
      const supabase = createClient();
      if (checkinBooking.client_id) {
        const { error: clientErr } = await supabase
          .from("clients")
          .update({
            full_name: checkinForm.full_name.trim(),
            phone: checkinForm.phone.trim() || null,
            email: checkinForm.email.trim() || null,
            id_type: checkinForm.id_type || null,
            id_number: checkinForm.id_number.trim() || null,
            nationality: checkinForm.nationality.trim() || null,
            emergency_contact: checkinForm.emergency_contact.trim() || null,
          })
          .eq("id", checkinBooking.client_id);

        if (clientErr) {
          toast.error("La mise à jour client a échoué : " + clientErr.message);
          setCheckinSaving(false);
          return;
        }
      }

      // Si la chambre a changé, mettre à jour la réservation
      if (checkinRoomId && checkinRoomId !== checkinBooking.room_id) {
        const { error: roomErr } = await supabase
          .from("bookings")
          .update({ room_id: checkinRoomId })
          .eq("id", checkinBooking.id);

        if (roomErr) {
          toast.error("Le changement de chambre a échoué : " + roomErr.message);
          setCheckinSaving(false);
          return;
        }
      }

      setCheckinModalOpen(false);
      await executeAction(checkinBooking.id, "check_in");
    } catch {
      toast.error("Le check-in a échoué 🔄");
    } finally {
      setCheckinSaving(false);
    }
  }

  // ── AUTOCOMPLETE CLIENT DANS LE CHAMP NOM ───────────────────────────────
  // Recherche locale dans la liste des clients déjà chargés (pas de requête DB).
  // Si le nom correspond à un ancien client → affiche les suggestions.
  // Si aucun match → le réceptionniste continue de taper le nom du nouveau client.
  function searchClientsByName(query: string) {
    if (nameSuggestionsTimeoutRef.current) clearTimeout(nameSuggestionsTimeoutRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setNameSuggestions([]);
      setNameSuggestionsOpen(false);
      return;
    }
    setNameSuggestionsLoading(true);
    nameSuggestionsTimeoutRef.current = setTimeout(() => {
      const q = query.trim().toLowerCase();
      const results = clients.filter((c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      ).slice(0, 8);
      setNameSuggestions(results);
      setNameSuggestionsOpen(results.length > 0);
      setNameSuggestionsLoading(false);
    }, 150);
  }

  function selectClientFromSuggestions(client: Client) {
    setFormData({
      ...formData,
      client_id: client.id,
      newClientName: client.full_name,
      newClientPhone: client.phone || "",
      newClientEmail: client.email || "",
      newClientIdType: client.id_type || "",
      newClientIdNumber: client.id_number || "",
      newClientEmergencyContact: client.emergency_contact || "",
      newClientNationality: client.nationality || "",
    });
    setNameSuggestionsOpen(false);
    setNameSuggestions([]);
  }

  function clearClientSelection() {
    setFormData({
      ...formData,
      client_id: "",
      newClientName: "",
      newClientPhone: "",
      newClientEmail: "",
      newClientIdType: "",
      newClientIdNumber: "",
      newClientEmergencyContact: "",
      newClientNationality: "",
    });
    setNameSuggestionsOpen(false);
  }

  // ── CHANGEMENT DE CHAMBRE PENDANT LE SÉJOUR ──────────────────────────────
  function openChangeRoomModal(b: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    setChangeRoomBooking(b);
    setChangeRoomTypeId(b.room?.room_type_id || "");
    setChangeRoomId("");
    setChangeRoomOpen(true);
  }

  // Calcul du supplément pro-rata quand on change de chambre
  function calcChangeRoomSupplement(): { oldNights: number; remainingNights: number; oldPricePerNight: number; newPricePerNight: number; supplement: number } {
    if (!changeRoomBooking || !changeRoomId) return { oldNights: 0, remainingNights: 0, oldPricePerNight: 0, newPricePerNight: 0, supplement: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkOut = new Date(changeRoomBooking.check_out_date);
    checkOut.setHours(0, 0, 0, 0);
    const remainingNights = Math.max(1, Math.ceil((checkOut.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const oldPricePerNight = changeRoomBooking.negotiated_price || 0;
    const newRoom = rooms.find((r) => r.id === changeRoomId);
    const newRoomType = roomTypes.find((rt) => rt.id === changeRoomTypeId);
    const newPricePerNight = newRoomType?.base_price || oldPricePerNight;
    const oldNights = (changeRoomBooking.nights_count || 1) - remainingNights;
    const oldCost = oldNights * oldPricePerNight;
    const newCost = remainingNights * newPricePerNight;
    const totalAlreadyPaid = changeRoomBooking.amount_paid || 0;
    const newTotal = oldCost + newCost;
    const supplement = Math.max(0, newTotal - totalAlreadyPaid);
    return { oldNights, remainingNights, oldPricePerNight, newPricePerNight, supplement };
  }

  // Confirmation du changement de chambre
  async function handleConfirmChangeRoom() {
    if (!changeRoomBooking || !changeRoomId) return;
    const { supplement, remainingNights, newPricePerNight } = calcChangeRoomSupplement();
    setChangeRoomSaving(true);
    try {
      const supabase = createClient();
      const oldRoomId = changeRoomBooking.room_id;

      // 1. Mettre à jour la réservation : chambre + prix
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({
          room_id: changeRoomId,
          negotiated_price: newPricePerNight,
          total_amount: (changeRoomBooking.negotiated_price || 0) * ((changeRoomBooking.nights_count || 1) - remainingNights) + newPricePerNight * remainingNights,
        })
        .eq("id", changeRoomBooking.id);

      if (updateErr) {
        toast.error("La modification de la réservation a échoué : " + updateErr.message);
        setChangeRoomSaving(false);
        return;
      }

      // 2. Libérer l'ancienne chambre → cleaning
      if (oldRoomId) {
        await supabase.from("rooms").update({ status: "cleaning" }).eq("id", oldRoomId);
      }

      // 3. Occuper la nouvelle chambre
      await supabase.from("rooms").update({ status: "occupied" }).eq("id", changeRoomId);

      // 4. Enregistrer l'activité dans l'historique du séjour
      const oldRoom = rooms.find((r) => r.id === oldRoomId);
      const newRoomTarget = rooms.find((r) => r.id === changeRoomId);
      await supabase.from("stay_activities").insert({
        tenant_id: changeRoomBooking.tenant_id,
        booking_id: changeRoomBooking.id,
        client_id: changeRoomBooking.client_id,
        activity_type: "room_change",
        title: "Changement de chambre",
        description: `${oldRoom?.room_number || "—"} → ${newRoomTarget?.room_number || "—"}${supplement > 0 ? ` — Supplément ${fmt(supplement)}` : ""}`,
        created_by: userId,
      });

      // 4. Enregistrer le paiement du supplément
      if (supplement > 0) {
        const { error: payErr } = await supabase
          .from("payments")
          .insert({
            tenant_id: changeRoomBooking.tenant_id,
            booking_id: changeRoomBooking.id,
            accommodation_id: changeRoomBooking.accommodation_id,
            amount: supplement,
            payment_method: "cash",
            payment_date: new Date().toISOString(),
            received_by: userId,
            operation_type: "booking",
            notes: `Changement de chambre — supplément ${remainingNights} nuit(s)`,
          });

        if (payErr) {
          toast.error("Chambre changée ✅ mais le paiement du supplément a échoué : " + payErr.message);
        }
      }

      const newRoom = rooms.find((r) => r.id === changeRoomId);
      toast.success(`Chambre changée → ${newRoom?.room_number || "—"}${supplement > 0 ? ` — supplément de ${fmt(supplement)} enregistré` : ""} ✓`);
      setChangeRoomOpen(false);
      await loadBookings(tenantId, accommodationFilterRef.current);
    } catch {
      toast.error("Le changement de chambre a échoué 🛏️");
    } finally {
      setChangeRoomSaving(false);
    }
  }

  // ── CHECK-IN EXPRESS (discrétion) ────────────────────────────────────────
  async function handleExpressCheckin(b: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    // Sécurité : le client doit avoir été vérifié physiquement au moins une fois
    // (CNI enregistrée + au moins un séjour antérieur check-in ou check-out)
    if (!b.client?.id_number) {
      toast.error("C'est la première fois ! Faites un check-in normal pour vérifier la CNI 🪪");
      return;
    }
    setActioningId(b.id);
    try {
      const supabase = createClient();
      // Vérifier qu'il y a au moins un séjour antérieur (hors réservation actuelle)
      const { data: prevBookings, error: prevErr } = await supabase
        .from("bookings")
        .select("id")
        .eq("client_id", b.client_id)
        .neq("id", b.id)
        .in("status", ["checked_in", "checked_out"])
        .limit(1);
      if (prevErr || !prevBookings || prevBookings.length === 0) {
        toast.error("Client nouveau ! Faites un check-in normal d'abord pour l'enregistrer 🆕");
        setActioningId("");
        return;
      }
      const { error } = await supabase.rpc("check_in_booking", {
        p_booking_id: b.id,
        p_user_id: userId,
        p_allow_early: false,
        p_allow_late: false,
      });
      if (error) {
        if (error.message.includes("CHECK_IN_TOO_EARLY")) {
          toast.error("Trop tôt ! L'arrivée est prévue le " + formatDate(b.check_in_date) + ".");
        } else if (error.message.includes("CHECK_IN_TOO_LATE")) {
          toast.error("Trop tard, le séjour a expiré ⏰ Le client ne peut plus être installé.");
        } else {
          toast.error("Check-in express raté : " + error.message);
        }
        return;
      }
      // Afficher la chambre pour programmer la carte
      toast.success(`Check-in express terminé ! Remettez la carte à ${b.room?.room_number || "—"} 🔑`, { duration: 8000 });
      await loadBookings(tenantId, accommodationFilterRef.current);
    } catch {
      toast.error("Le check-in express a échoué 🔄");
    } finally {
      setActioningId("");
    }
  }

  // Sauvegarde des modifications du client depuis le drawer latéral
  async function handleSaveDrawerClient() {
    if (!selectedClient) return;
    setDrawerClientSaving(true);
    try {
      const supabase = createClient();
      const { data: updatedClient, error: err } = await supabase
        .from("clients")
        .update({
          full_name: drawerClientForm.full_name.trim(),
          phone: drawerClientForm.phone.trim() || null,
          email: drawerClientForm.email.trim() || null,
          id_type: drawerClientForm.id_type || null,
          id_number: drawerClientForm.id_number.trim() || null,
          nationality: drawerClientForm.nationality.trim() || null,
          emergency_contact: drawerClientForm.emergency_contact.trim() || null,
        })
        .eq("id", selectedClient.id)
        .select()
        .single();

      if (err) {
        toast.error("La mise à jour a échoué : " + err.message);
        return;
      }

      toast.success("Fiche client à jour 👤");
      setSelectedClient(updatedClient);
      setEditingClientInDrawer(false);
      loadBookings(tenantId);
    } catch {
      toast.error("Oups, la sauvegarde a échoué 📝");
    } finally {
      setDrawerClientSaving(false);
    }
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

  // Ouvre la modal de modification : pré-remplit les champs avec les valeurs
  // actuelles et charge les chambres de l'établissement concerné.
  function openEditModal(booking: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    setEditBooking(booking);
    setEditForm({
      check_in_date: booking.check_in_date,
      check_out_date: booking.check_out_date,
      room_id: booking.room_id || "",
      negotiated_price: String(booking.negotiated_price ?? ""),
    });
    setEditError("");
    setEditModalOpen(true);
    loadRoomsForAccommodation(booking.accommodation_id);
  }

  // Modifie la réservation (dates, chambre, prix) via la RPC update_booking.
  async function handleSaveEdit() {
    if (!editBooking) return;
    const nights = calculateNights(editForm.check_in_date, editForm.check_out_date);
    if (nights <= 0) {
      setEditError("La date de départ doit être après la date d'arrivée.");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_booking", {
        p_booking_id: editBooking.id,
        p_user_id: userId,
        p_check_in_date: editForm.check_in_date || null,
        p_check_out_date: editForm.check_out_date || null,
        p_room_id: editForm.room_id || null,
        p_negotiated_price: editForm.negotiated_price ? Math.round(Number(editForm.negotiated_price)) : null,
      });
      if (error) {
        if (error.message.includes("DOUBLE_BOOKING")) {
          setEditError("Conflit ! Cette chambre est déjà réservée sur la nouvelle période 📅");
        } else if (error.message.includes("CHECKED_IN")) {
          setEditError("L'arrivée ne peut plus être changée après l'installation du client 🔒");
        } else {
          setEditError(error.message);
        }
        return;
      }
      setEditModalOpen(false);
      setEditBooking(null);
      await runOverstayCheck();
      loadBookings(tenantId);
      loadInvoices(tenantId);
      toast.success("Réservation modifiée ✏️");
    } catch (err) {
      setEditError("Une erreur est survenue lors de la modification.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Prolonge le séjour : nouvelle date de départ, recalcul du montant total dû.
  // Si la réceptionniste indique que le client a payé le supplément, le paiement
  // est enregistré en caisse (payments) et le statut de la réservation est mis à jour.
  async function handleExtendBooking() {
    if (!extendBooking || !extendDate) return;
    const nights = calculateNights(extendBooking.check_in_date, extendDate);
    if (nights <= 0) {
      toast.error("La date de départ doit être après l'arrivée 📅");
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
          toast.error("Conflit ! La chambre est prise sur la période prolongée 📅");
        } else if (error.message.includes("INVALID_CHECK_OUT")) {
          toast.error("La date de départ doit être après la date d'arrivée.");
        } else {
          toast.error("La prolongation a échoué : " + error.message);
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
          toast.error("Séjour prolongé ✅ mais le paiement a échoué : " + payErr.message);
        } else {
          // Le trigger DB update_booking_payment_status recalcule automatiquement
          // amount_paid et payment_status (source de vérité : somme des paiements
          // liés à la réservation). Aucune mise à jour manuelle ici : elle
          // écraserait le calcul du trigger avec une valeur obsolète (statut
          // « partiel » erroné après paiement).
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
      toast.error("La prolongation a échoué 🔄");
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
      toast.success("Prolongation refusée 🚫");
      setRejectTarget(null);
      await loadExtensionRequests(tenantId);
    } catch (err) {
      toast.error("La demande n'a pas pu être refusée : " + (err as Error).message);
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
        toast.error("Le check-out n'a pas pu être confirmé : " + uErr.message);
        return false;
      }
    }
    return true;
  }

  // Règle le solde restant au check-out : encaisse le reliquat (payments),
  // puis confirme le départ. Le trigger recalcule automatiquement le statut.
  // Génération automatique de facture après check-out (best-effort, silencieux)
  async function autoGenerateInvoice(bookingId: string) {
    try {
      await fetch("/api/invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      loadInvoices(tenantId);
    } catch {
      // Silencieux : la facture pourra être générée manuellement
    }
  }

  async function handleCheckoutConfirm() {
    const b = checkoutBooking;
    if (!b) return;
    const amount = Math.round(Number(checkoutForm.amount)) || 0;
    if (amount < 0) {
      toast.error("Le montant doit être positif (> 0) 💰");
      return;
    }
    if (amount > 0 && !checkoutForm.payment_method) {
      toast.error("Choisissez un moyen de paiement 💳");
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
          toast.error("Check-out confirmé ✅ mais le règlement a échoué : " + payErr.message);
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
      // Génération automatique de la facture (best-effort)
      autoGenerateInvoice(b.id);
    } catch (err) {
      toast.error("Le check-out a échoué 🔄");
      console.error(err);
    } finally {
      setCheckoutSaving(false);
    }
  }

  // Check-out sans encaisser le solde (le client réglera plus tard) :
  // conserve la traçabilité en laissant un solde "partial".
    async function handleCheckoutSkip() {
    if (!checkoutBooking) return;
    setCheckoutSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("bookings")
        .update({ payment_status: "partial", updated_at: new Date().toISOString() })
        .eq("id", checkoutBooking.id);
      if (error) throw error;
      setInvoicesMap((prev) => {
        const inv = { ...prev[checkoutBooking.id] };
        if (inv) inv.status = "sent";
        return { ...prev, [checkoutBooking.id]: inv };
      });
      toast.info("Solde en attente — le client réglera plus tard ⏳");
      setCheckoutModalOpen(false);
      setCheckoutBooking(null);
      loadBookings(tenantId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La mise à jour a échoué... Réessayez 🔄");
    } finally {
      setCheckoutSaving(false);
    }
  }

  // ── Enregistrer un paiement partiel en cours de séjour ────────────────────
  function openPaymentModal(booking: Booking & { client?: Client; room?: Room; room_type?: RoomType }) {
    const remaining = Math.max(0, (booking.total_amount || 0) - (booking.amount_paid || 0));
    setPaymentBooking(booking);
    setPaymentForm({
      amount: remaining > 0 ? String(remaining) : "",
      payment_method: "cash",
      mobile_money_operator: "",
    });
    setPaymentModalOpen(true);
  }

  async function handleRecordPayment() {
    if (!paymentBooking) return;
    const amount = Math.round(Number(paymentForm.amount));
    if (!amount || amount <= 0) {
      toast.error("Le montant doit être supérieur à 0 💰");
      return;
    }
    const remaining = Math.max(0, (paymentBooking.total_amount || 0) - (paymentBooking.amount_paid || 0));
    if (amount > remaining) {
      toast.error(`Le montant dépasse le solde restant (${fmt(remaining)}) 💰`);
      return;
    }
    if (!paymentForm.payment_method) {
      toast.error("Sélectionnez d'abord un moyen de paiement 💳");
      return;
    }
    setPaymentSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("payments").insert({
        tenant_id: paymentBooking.tenant_id,
        booking_id: paymentBooking.id,
        accommodation_id: paymentBooking.room?.accommodation_id || paymentBooking.accommodation_id,
        amount,
        payment_method: paymentForm.payment_method,
        mobile_money_operator: paymentForm.payment_method === "mobile_money" ? paymentForm.mobile_money_operator || null : null,
        payment_date: new Date().toISOString(),
        received_by: userId,
        operation_type: "booking",
        notes: `Paiement partiel en cours de séjour — reste dû`,
      });
      if (error) throw error;
      // Le trigger DB update_booking_payment_status recalcule automatiquement
      // amount_paid et payment_status (source de vérité : somme des paiements).
      toast.success(`Paiement de ${fmt(amount)} enregistré ✓`);
      setPaymentModalOpen(false);
      setPaymentBooking(null);
      loadBookings(tenantId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Le paiement n'a pas pu être enregistré 💰");
    } finally {
      setPaymentSaving(false);
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

       const { error: rpcErr } = await supabase.rpc(rpcName, {
         p_booking_id: bookingId,
         p_user_id: userId,
         ...(rpcName === "check_in_booking" ? { p_allow_early: false, p_allow_late: false } : {}),
       });

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
           toast.error("L'action a échoué : " + updateErr.message);
           return;
         }
       }

       toast.success("C'est fait ! ✅");
       setConfirmAction(null);
       await runOverstayCheck();
       loadBookings(tenantId);
       // Génération automatique de la facture au check-out (best-effort)
       if (action === "check_out") autoGenerateInvoice(bookingId);
     } catch (err) {
       toast.error("L'action a échoué 🔄");
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
    toast.success("Export CSV prêt ! 📊");
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
    return <BookingsSkeleton />;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Réservations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{bookings.length} réservation{bookings.length > 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAddModal} className="flex-shrink-0">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nouvelle réservation</span>
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
                          toast.error("Réservation introuvable 🤷");
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
      <div className="flex flex-col md:flex-row gap-2 md:gap-3 md:flex-wrap">
        <div className="relative flex-1 min-w-[200px] md:min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par code, client, chambre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
          />
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-1 overflow-x-auto">
          <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">Du</span>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white outline-none"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">au</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="text-sm bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
        {accommodations.length > 1 && (
          <select
            value={accomFilter}
            onChange={(e) => {
              userPickedAccomRef.current = true;
              setAccomFilter(e.target.value);
              accommodationFilterRef.current = e.target.value === "all" ? undefined : e.target.value;
              loadBookingsRef.current(tenantId, accommodationFilterRef.current);
            }}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
            title="Filtrer par résidence"
          >
            <option value="all">Toutes les résidences</option>
            {accommodations.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
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
        <Button variant="outline" onClick={exportToCSV} className="gap-2 flex-1 md:flex-none justify-center">
          <Download className="w-4 h-4" /> <span className="sm:hidden">CSV</span><span className="hidden sm:inline">Export CSV</span>
        </Button>
        </div>
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
          <>
          {/* Version mobile : cartes empilées, action principale prioritaire */}
          <div className="md:hidden space-y-2.5 p-2.5">
            {paginatedBookings.map((b) => {
              const overdue = b.status === "checked_in" && (b.is_overstay || isBookingOverdue(b));
              const primaryAction =
                b.status === "confirmed"
                  ? { type: "check_in" as const }
                  : b.status === "checked_in"
                    ? { type: "check_out" as const }
                    : null;
              return (
                <div
                  key={b.id}
                  onClick={() => b.client && setSelectedClient(b.client)}
                  className={`rounded-2xl border bg-[var(--card-bg,var(--surface))] shadow-[var(--shadow-sm)] overflow-hidden cursor-pointer ${
                    overdue ? "border-red-200 dark:border-red-900/50" : "border-[var(--border-card)]"
                  }`}
                >
                  {/* En-tête : client + statut */}
                  <div className="flex items-center gap-2.5 p-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--primary-color,#0C1C33)] flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {b.client?.full_name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {b.client?.full_name || "Client sans profil"}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {b.booking_code} · {b.nights_count} nuit{b.nights_count > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${getBookingStatusColor(b.status)}`}>
                        {getBookingStatusLabel(b.status)}
                      </span>
                      {!b.client?.id_number && (b.status === "confirmed" || b.status === "checked_in") && (
                        <span className="inline-flex items-center" title="CNI/Passeport non renseigné">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 dark:bg-amber-500/60" />
                        </span>
                      )}
                      {overdue && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getOverstayColor()}`}>
                          {getOverstayLabel()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Infos séjour + paiement */}
                  <div className="px-3 pb-2 grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-xl bg-[var(--surface-muted)]">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Chambre</p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Ch. {b.room?.room_number || "—"}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{b.room_type?.name || ""}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--surface-muted)]">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Paiement</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{fmt(b.total_amount)}</p>
                      <span className={`text-[11px] ${getPaymentStatusColor(b.payment_status)}`}>{getPaymentStatusLabel(b.payment_status)}</span>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="px-3 pb-3">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-muted)]">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Arrivée</p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{formatDate(b.check_in_date)}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                      <div className="min-w-0 text-right">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Départ</p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {formatDate(b.check_out_date)}{b.check_out_time ? ` · ${formatTime(b.check_out_time)}` : ""}
                        </p>
                      </div>
                    </div>
                    {overdue && (
                      <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mt-1.5">
                        Départ prévu dépassé — prolonger ou libérer la chambre
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 p-3 border-t border-[var(--border-subtle)]">
                    {b.status === "cancelled" || b.status === "no_show" ? (
                      <span className="flex-1 text-[11px] text-slate-400">Aucune action disponible</span>
                    ) : (
                      <>
                        {primaryAction && (
                          <Button
                            variant={primaryAction.type === "check_in" ? "success" : "secondary"}
                            size="sm"
                            className={`flex-1 ${primaryAction.type === "check_out" ? "bg-orange-500 text-white hover:bg-orange-600" : ""}`}
                            loading={actioningId === b.id}
                            disabled={actioningId === b.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrimaryAction(b.id, primaryAction.type);
                            }}
                          >
                            {primaryAction.type === "check_in" ? (
                              <><LogIn className="w-3.5 h-3.5" /> Check-in</>
                            ) : (
                              <><LogOut className="w-3.5 h-3.5" /> Check-out</>
                            )}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger aria-label="Plus d'actions" disabled={actioningId === b.id} className="h-10 w-10">
                            <MoreHorizontal className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Séjour</DropdownMenuLabel>
                             {(b.status === "confirmed" || b.status === "checked_in") && !b.client?.id_number && b.booking_source !== 'external' && (
                              <DropdownMenuItem onSelect={() => openCompleteClientModal(b)} className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium">
                                <Pencil className="w-4 h-4" /> Compléter / Modifier la fiche client
                              </DropdownMenuItem>
                            )}
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
                            {b.status === "confirmed" && (
                              <DropdownMenuItem onSelect={() => handleExpressCheckin(b)}>
                                <Zap className="w-4 h-4 text-emerald-500" /> Check-in express (discrétion)
                              </DropdownMenuItem>
                            )}
                            {b.status === "checked_in" && (
                              <DropdownMenuItem onSelect={() => openExtendModal(b)}>
                                <Calendar className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Prolonger le séjour
                              </DropdownMenuItem>
                            )}
                            {b.status === "checked_in" && (
                              <DropdownMenuItem onSelect={() => openChangeRoomModal(b)}>
                                <ArrowLeftRight className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Changer de chambre
                              </DropdownMenuItem>
                            )}
                             {(b.status === "confirmed" || b.status === "checked_in") && !b.client?.id_number && b.booking_source !== 'external' && (
                              <DropdownMenuItem onSelect={() => openEditModal(b)}>
                                <Pencil className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Modifier les dates / tarifs
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
                            {b.payment_status !== "paid" && (b.total_amount || 0) > (b.amount_paid || 0) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => openPaymentModal(b)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                                  <Wallet className="w-4 h-4" /> Enregistrer un paiement
                                </DropdownMenuItem>
                              </>
                            )}
                             {(b.status === "confirmed" || b.status === "checked_in") && !b.client?.id_number && b.booking_source !== 'external' && (
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
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Version desktop : tableau */}
          <div className="hidden md:block overflow-x-auto">
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
                          {hasClientProfiles && (
                            <ClientScoreBadge
                              score={clientProfiles[b.client.id]?.score}
                              tier={clientProfiles[b.client.id]?.tier}
                              clientId={b.client.id}
                              showValue={false}
                              className="mt-0.5"
                            />
                          )}
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
                        {!b.client?.id_number && (b.status === "confirmed" || b.status === "checked_in") && (
                          <span className="inline-flex items-center" title="CNI/Passeport non renseigné">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 dark:bg-amber-500/60" />
                          </span>
                        )}
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
                             {(b.status === "confirmed" || b.status === "checked_in") && !b.client?.id_number && b.booking_source !== 'external' && (
                              <DropdownMenuItem onSelect={() => openCompleteClientModal(b)} className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium">
                                <Pencil className="w-4 h-4" /> Compléter / Modifier la fiche client
                              </DropdownMenuItem>
                            )}
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
                             {(b.status === "confirmed" || b.status === "checked_in") && !b.client?.id_number && b.booking_source !== 'external' && (
                              <DropdownMenuItem onSelect={() => openEditModal(b)}>
                                <Pencil className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Modifier les dates / tarifs
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
                             {b.payment_status !== "paid" && (b.total_amount || 0) > (b.amount_paid || 0) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => openPaymentModal(b)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                                  <Wallet className="w-4 h-4" /> Enregistrer un paiement
                                </DropdownMenuItem>
                              </>
                            )}
                             {(b.status === "confirmed" || b.status === "checked_in") && !b.client?.id_number && b.booking_source !== 'external' && (
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
          </>
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
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                      {selectedClient.full_name}
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!editingClientInDrawer) {
                          setDrawerClientForm({
                            full_name: selectedClient.full_name || "",
                            phone: selectedClient.phone || "",
                            email: selectedClient.email || "",
                            id_type: selectedClient.id_type || "",
                            id_number: selectedClient.id_number || "",
                            nationality: selectedClient.nationality || "",
                            emergency_contact: selectedClient.emergency_contact || "",
                          });
                        }
                        setEditingClientInDrawer(!editingClientInDrawer);
                      }}
                      className="h-8 px-2.5 text-xs gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {editingClientInDrawer ? "Annuler" : "Modifier"}
                    </Button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Détails du client</p>
                    {hasClientProfiles && (
                      <>
                        <ClientScoreBadge
                          score={clientProfiles[selectedClient.id]?.score}
                          tier={clientProfiles[selectedClient.id]?.tier}
                          showValue={false}
                        />
                        <Link
                          href={`/dashboard/clients/${selectedClient.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary-color,#0C1C33)] hover:underline"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Fiche intelligente
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedClient(null);
                    setEditingClientInDrawer(false);
                  }}
                  className="ml-4 p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {editingClientInDrawer ? (
                  /* Formulaire d'édition directe */
                  <div className="space-y-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Modifier les informations client</h3>
                    <Input
                      label="Nom & Prénom"
                      value={drawerClientForm.full_name}
                      onChange={(e) => setDrawerClientForm({ ...drawerClientForm, full_name: e.target.value })}
                      placeholder="Nom complet"
                    />
                    <Input
                      label="Téléphone"
                      value={drawerClientForm.phone}
                      onChange={(e) => setDrawerClientForm({ ...drawerClientForm, phone: e.target.value })}
                      placeholder="+221 ..."
                    />
                    <Input
                      label="Email"
                      type="email"
                      value={drawerClientForm.email}
                      onChange={(e) => setDrawerClientForm({ ...drawerClientForm, email: e.target.value })}
                      placeholder="client@exemple.com"
                    />
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type de pièce d'identité</label>
                      <select
                        value={drawerClientForm.id_type}
                        onChange={(e) => setDrawerClientForm({ ...drawerClientForm, id_type: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
                      >
                        <option value="">Non renseigné</option>
                        <option value="CNI">Carte Nationale d'Identité (CNI)</option>
                        <option value="Passeport">Passeport</option>
                        <option value="Permis de conduire">Permis de conduire</option>
                        <option value="Carte consulaire">Carte consulaire / Séjour</option>
                        <option value="Autre">Autre document</option>
                      </select>
                    </div>
                    <Input
                      label="Numéro de pièce"
                      value={drawerClientForm.id_number}
                      onChange={(e) => setDrawerClientForm({ ...drawerClientForm, id_number: e.target.value })}
                      placeholder="N° CNI ou Passeport"
                    />
                    <Input
                      label="Nationalité"
                      value={drawerClientForm.nationality}
                      onChange={(e) => setDrawerClientForm({ ...drawerClientForm, nationality: e.target.value })}
                      placeholder="Ex: Sénégalaise..."
                    />
                    <Input
                      label="Contact d'urgence"
                      value={drawerClientForm.emergency_contact}
                      onChange={(e) => setDrawerClientForm({ ...drawerClientForm, emergency_contact: e.target.value })}
                      placeholder="Proche à contacter"
                    />
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1" onClick={() => setEditingClientInDrawer(false)}>
                        Annuler
                      </Button>
                      <Button className="flex-1" onClick={handleSaveDrawerClient} loading={drawerClientSaving}>
                        Enregistrer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Contact */}
                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Contact</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Téléphone principal</label>
                          <p className="text-sm text-slate-900 dark:text-white">{selectedClient.phone || "—"}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email</label>
                          {selectedClient.email ? (
                            <p className="text-sm text-slate-900 dark:text-white break-words">{selectedClient.email}</p>
                          ) : (
                            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                              Non renseigné
                            </span>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Contact d'urgence</label>
                          <p className="text-sm text-slate-900 dark:text-white break-words">{selectedClient.emergency_contact || "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Pièce d'identité & Nationalité */}
                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Identité & Nationalité</h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Pièce</label>
                          <p className="text-sm text-slate-900 dark:text-white">{selectedClient.id_type || "—"}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Numéro de pièce</label>
                          <p className="text-sm text-slate-900 dark:text-white break-words">
                            {selectedClient.id_number ? (
                              selectedClient.id_number
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                ⚠️
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nationalité</label>
                        <p className="text-sm text-slate-900 dark:text-white">{selectedClient.nationality || "—"}</p>
                      </div>
                    </div>
                  </>
                )}

                {/* Historique des réservations */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Historique des réservations</h3>
                  {bookings.filter(bk => bk.client_id === selectedClient.id).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Aucune réservation enregistrée.</p>
                  ) : (
                    <div className="space-y-2">
                      {bookings.filter(bk => bk.client_id === selectedClient.id).map(bk => (
                        <div key={bk.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{bk.booking_code}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                            {formatDate(bk.check_in_date)} → {formatDate(bk.check_out_date)} — {bk.nights_count} nuit{bk.nights_count > 1 ? "s" : ""}
                          </p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{fmt(bk.total_amount)} — {getBookingStatusLabel(bk.status)}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setExpandedTimelineBookingId(expandedTimelineBookingId === bk.id ? null : bk.id)}
                                className="p-1 rounded text-[var(--primary-color,#0C1C33)] hover:bg-[var(--primary-muted)] text-xs flex items-center gap-1 font-medium"
                                title="Historique du séjour"
                              >
                                <History className="w-3.5 h-3.5" /> Historique
                              </button>
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
                          {expandedTimelineBookingId === bk.id && (
                            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                              <StayTimeline bookingId={bk.id} tenantId={tenantId} clientId={selectedClient.id} />
                            </div>
                          )}
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

          {/* ═══ ÉTAPE 1 : Dates ═══ */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date d'arrivée" type="date" value={formData.check_in_date} onChange={(e) => setFormData({ ...formData, check_in_date: e.target.value })} />
            <Input label="Date de départ" type="date" value={formData.check_out_date} onChange={(e) => setFormData({ ...formData, check_out_date: e.target.value })} />
          </div>

          {formData.check_in_date && formData.check_out_date && calculateNights(formData.check_in_date, formData.check_out_date) <= 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">La date de départ doit être après la date d'arrivée.</p>
          )}

          {/* ═══ ÉTAPE 2 : Établissement ═══ */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Établissement</label>
            <select
              value={formData.accommodation_id}
              onChange={async (e) => {
                const accId = e.target.value;
                setFormData({ ...formData, accommodation_id: accId, room_type_id: "", room_id: "" });
                const types = await loadRoomsForAccommodation(accId);
                if (types.length === 1) {
                  setFormData((prev) => ({ ...prev, accommodation_id: accId, room_type_id: types[0].id, room_id: "" }));
                }
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Sélectionner un établissement</option>
              {accommodations.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          {/* ═══ ÉTAPE 3 : Résultat disponibilité ═══ */}
          {availabilityLoading && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Vérification de la disponibilité...
            </div>
          )}

          {availabilityChecked && !availabilityLoading && (
            <div className={`p-4 rounded-xl text-sm ${availableRooms.length > 0 ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"}`}>
              {availableRooms.length > 0 ? (
                <>✅ <strong>{availableRooms.length}</strong> chambre(s) disponible(s) pour ces dates.</>
              ) : (
                <>❌ Aucune chambre disponible pour ces dates. Changez les dates ou l'établissement.</>
              )}
            </div>
          )}

          {/* ═══ ÉTAPE 4 : Chambre (uniquement si des chambres sont disponibles) ═══ */}
          {availabilityChecked && availableRooms.length > 0 && (
            <>
              {/* Type de chambre */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type de chambre</label>
                <select
                  value={formData.room_type_id}
                  onChange={(e) => {
                    setFormData({ ...formData, room_type_id: e.target.value, room_id: "" });
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sélectionner un type</option>
                  {Array.from(new Map(availableRooms.map((r) => [r.room_type_id, r.room_type])).values())
                    .filter(Boolean)
                    .map((rt) => (
                      <option key={rt!.id} value={rt!.id}>{rt!.name} — {fmt(rt!.base_price)}/nuit</option>
                    ))}
                </select>
              </div>

              {/* Numéro de chambre */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Numéro de chambre</label>
                <select
                  value={formData.room_id}
                  onChange={(e) => {
                    const selectedRoom = availableRooms.find((r) => r.id === e.target.value);
                    const rt = roomTypes.find((t) => t.id === formData.room_type_id);
                    setFormData({ ...formData, room_id: e.target.value, negotiated_price: rt?.base_price.toString() || selectedRoom?.room_type?.base_price.toString() || "" });
                  }}
                  disabled={!formData.room_type_id}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="">{formData.room_type_id ? "Sélectionner une chambre" : "Choisir un type d'abord"}</option>
                  {availableRooms
                    .filter((r) => !formData.room_type_id || r.room_type_id === formData.room_type_id)
                    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Chambre {r.room_number}{r.floor ? ` (étage ${r.floor})` : ""} — {r.room_type?.name || ""}
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}

          {/* Client — champ unifié avec autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nom du client</label>
            <div className="relative">
              <input
                type="text"
                value={formData.newClientName}
                onChange={(e) => {
                  const val = e.target.value;
                  if (formData.client_id) {
                    // On sort du mode "client existant" — on garde les infos
                    // pré-remplies pour que le réceptionniste puisse les éditer
                    setFormData((prev) => ({
                      ...prev,
                      client_id: "",
                      newClientName: val,
                    }));
                  } else {
                    setFormData({ ...formData, newClientName: val });
                  }
                  searchClientsByName(val);
                }}
                onBlur={() => setTimeout(() => setNameSuggestionsOpen(false), 200)}
                placeholder="Tapez le nom du client..."
                className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {nameSuggestionsLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 animate-spin" />
              )}
              {formData.client_id && !nameSuggestionsLoading && (
                <button type="button" onClick={clearClientSelection} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Suggestions clients existants */}
            {nameSuggestionsOpen && nameSuggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-60 overflow-auto">
                {nameSuggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectClientFromSuggestions(c)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 last:border-0"
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{c.full_name}</p>
                    <p className="text-xs text-zinc-500">
                      {c.phone ? `📱 ${c.phone}` : ""}{c.phone && c.email ? " · " : ""}{c.email ? `✉️ ${c.email}` : ""}
                    </p>
                    {c.id_number && <p className="text-[10px] text-zinc-400 mt-0.5">CNI: {c.id_number}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Champs détaillés — visibles uniquement si aucun client existant n'est sélectionné */}
          {!formData.client_id && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Téléphone (optionnel)" value={formData.newClientPhone} onChange={(e) => setFormData({ ...formData, newClientPhone: e.target.value })} placeholder="+225 07 00 00 00 00" />
                <Input label="Email (optionnel)" type="email" value={formData.newClientEmail} onChange={(e) => setFormData({ ...formData, newClientEmail: e.target.value })} placeholder="jean@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Contact d'urgence (optionnel)" value={formData.newClientEmergencyContact} onChange={(e) => setFormData({ ...formData, newClientEmergencyContact: e.target.value })} placeholder="+225 01 00 00 00 00" />
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Numéro de pièce (optionnel)" value={formData.newClientIdNumber} onChange={(e) => setFormData({ ...formData, newClientIdNumber: e.target.value })} placeholder="Numéro..." />
                <Input label="Nationalité (optionnel)" value={formData.newClientNationality} onChange={(e) => setFormData({ ...formData, newClientNationality: e.target.value })} placeholder="Ivoirienne" />
              </div>
            </div>
          )}

          {formData.check_in_date && formData.check_out_date && calculateNights(formData.check_in_date, formData.check_out_date) > 0 && (
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

      {/* Modal Modifier la réservation (dates, chambre, prix) */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Modifier la réservation"
        description={editBooking ? `${editBooking.client?.full_name || "Client"} · Ch. ${editBooking.room?.room_number || "—"} · ${formatDate(editBooking.check_in_date)} → ${formatDate(editBooking.check_out_date)}` : ""}
      >
        <div className="space-y-3">
          {editError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {editError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date d&apos;arrivée</label>
            <Input
              type="date"
              value={editForm.check_in_date}
              disabled={editBooking?.status === "checked_in"}
              onChange={(e) => setEditForm({ ...editForm, check_in_date: e.target.value })}
            />
            {editBooking?.status === "checked_in" && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Client installé : la date d&apos;arrivée ne peut plus être modifiée.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date de départ</label>
            <Input
              type="date"
              value={editForm.check_out_date}
              min={editForm.check_in_date || undefined}
              onChange={(e) => setEditForm({ ...editForm, check_out_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Chambre</label>
            <select
              value={editForm.room_id}
              onChange={(e) => {
                const room = rooms.find((r) => r.id === e.target.value);
                const rt = roomTypes.find((t) => t.id === room?.room_type_id);
                setEditForm({
                  ...editForm,
                  room_id: e.target.value,
                  negotiated_price: rt?.base_price != null ? String(rt.base_price) : editForm.negotiated_price,
                });
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
            >
              <option value="">Conserver la chambre actuelle ({editBooking?.room?.room_number || "—"})</option>
              {rooms
                .filter((r) => !editBooking || r.accommodation_id === editBooking.accommodation_id)
                .map((r) => {
                  const rt = roomTypes.find((t) => t.id === r.room_type_id);
                  return (
                    <option key={r.id} value={r.id}>
                      Ch. {r.room_number} — {rt?.name || ""} — {rt ? fmt(rt.base_price) : ""}
                    </option>
                  );
                })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Prix par nuit (FCFA)</label>
            <Input
              type="number"
              value={editForm.negotiated_price}
              min={0}
              onChange={(e) => setEditForm({ ...editForm, negotiated_price: e.target.value })}
            />
          </div>

          {editBooking && (() => {
            const nights = calculateNights(editForm.check_in_date, editForm.check_out_date);
            const price = Number(editForm.negotiated_price) || 0;
            if (nights <= 0 || price <= 0) return null;
            return (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">
                  Nouveau total : <strong>{fmt(nights * price)}</strong> ({nights} nuit(s) × {fmt(price)}).
                  Le statut de paiement sera recalculé automatiquement.
                </p>
              </div>
            );
          })()}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setEditModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSaveEdit} loading={saving}>
              <Pencil className="w-4 h-4" /> Enregistrer les modifications
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Check-in enrichi : confirmation d'arrivée & complément d'identité client */}
      <Modal
        open={checkinModalOpen}
        onClose={() => setCheckinModalOpen(false)}
        title="Confirmation de Check-in (Arrivée)"
        description={checkinBooking ? `Réservation ${checkinBooking.booking_code} · Ch. ${checkinBooking.room?.room_number || "—"} · Arrivée le ${formatDate(checkinBooking.check_in_date)}` : ""}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-xs">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Check-in du client à la réception</p>
              <p className="mt-0.5">Vérifiez et complétez les informations d'identité du client (CNI/Passeport) avant de valider son entrée dans l'établissement.</p>
            </div>
          </div>
          {/* Sélection de la chambre assignée */}
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-3">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 uppercase tracking-wide">Chambre assignée</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type de chambre</label>
                <select
                  value={checkinRoomTypeId}
                  onChange={(e) => {
                    setCheckinRoomTypeId(e.target.value);
                    // Reset room selection when type changes
                    const firstRoom = rooms.find((r) => r.room_type_id === e.target.value && r.status === "available");
                    setCheckinRoomId(firstRoom?.id || "");
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Sélectionner un type</option>
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>{rt.name} — {formatAmount(rt.base_price)}/nuit</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Chambre disponible</label>
                <select
                  value={checkinRoomId}
                  onChange={(e) => setCheckinRoomId(e.target.value)}
                  disabled={!checkinRoomTypeId}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <option value="">Sélectionner une chambre</option>
                  {rooms
                    .filter((r) => r.room_type_id === checkinRoomTypeId && r.status === "available")
                    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Chambre {r.room_number}{r.floor ? ` (étage ${r.floor})` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {checkinBooking?.room && checkinRoomId !== checkinBooking.room_id && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                ⚠️ Changement de chambre : {checkinBooking.room.room_number} → {rooms.find((r) => r.id === checkinRoomId)?.room_number || "—"}
              </p>
            )}
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Nom & Prénom"
              value={checkinForm.full_name}
              onChange={(e) => setCheckinForm({ ...checkinForm, full_name: e.target.value })}
              placeholder="Nom complet"
              required
            />
            <Input
              label="Téléphone"
              value={checkinForm.phone}
              onChange={(e) => setCheckinForm({ ...checkinForm, phone: e.target.value })}
              placeholder="+221 ..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={checkinForm.email}
              onChange={(e) => setCheckinForm({ ...checkinForm, email: e.target.value })}
              placeholder="client@exemple.com"
            />
            <Input
              label="Nationalité"
              value={checkinForm.nationality}
              onChange={(e) => setCheckinForm({ ...checkinForm, nationality: e.target.value })}
              placeholder="Ex: Sénégalaise, Ivoirienne..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type de pièce d'identité</label>
              <select
                value={checkinForm.id_type}
                onChange={(e) => setCheckinForm({ ...checkinForm, id_type: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                <option value="">Sélectionner un type</option>
                <option value="CNI">Carte Nationale d'Identité (CNI)</option>
                <option value="Passeport">Passeport</option>
                <option value="Permis de conduire">Permis de conduire</option>
                <option value="Carte consulaire">Carte consulaire / Séjour</option>
                <option value="Autre">Autre document</option>
              </select>
            </div>
            <Input
              label="Numéro de pièce"
              value={checkinForm.id_number}
              onChange={(e) => setCheckinForm({ ...checkinForm, id_number: e.target.value })}
              placeholder="N° de la pièce"
            />
          </div>

          <Input
            label="Contact d'urgence (Optionnel)"
            value={checkinForm.emergency_contact}
            onChange={(e) => setCheckinForm({ ...checkinForm, emergency_contact: e.target.value })}
            placeholder="Nom et numéro du proche"
          />

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setCheckinModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="secondary" className="flex-1" onClick={handleSaveClientOnly} loading={checkinSaving}>
              <Pencil className="w-4 h-4 mr-1.5" /> Enregistrer la fiche
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConfirmCheckin} loading={checkinSaving}>
              <LogIn className="w-4 h-4 mr-1.5" /> Enregistrer & Check-in
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
                  <PdfPreview
                    url={invoicesMap[selectedBookingForInvoice.id]?.pdf_url || ""}
                    className="w-full h-full p-2"
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

      {/* ============ MODAL CHANGEMENT DE CHAMBRE ============ */}
      <Modal
        open={changeRoomOpen}
        onClose={() => setChangeRoomOpen(false)}
        title="Changer de chambre"
        description={changeRoomBooking ? `${changeRoomBooking.client?.full_name || "Client"} · Actuellement : Ch. ${changeRoomBooking.room?.room_number || "—"}` : ""}
        size="md"
      >
        <div className="space-y-4">
          {/* Résumé du séjour actuel */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-xs">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Changement de chambre en cours de séjour</p>
              <p className="mt-0.5">La chambre actuelle sera libérée et mise en ménage. Si le nouveau type de chambre a un tarif différent, le supplément sera calculé sur les nuits restantes.</p>
            </div>
          </div>

          {/* Sélection type + chambre */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nouveau type de chambre</label>
              <select
                value={changeRoomTypeId}
                onChange={(e) => {
                  setChangeRoomTypeId(e.target.value);
                  const firstRoom = rooms.find((r) => r.room_type_id === e.target.value && r.status === "available");
                  setChangeRoomId(firstRoom?.id || "");
                }}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                <option value="">Sélectionner un type</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>{rt.name} — {formatAmount(rt.base_price)}/nuit</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Chambre disponible</label>
              <select
                value={changeRoomId}
                onChange={(e) => setChangeRoomId(e.target.value)}
                disabled={!changeRoomTypeId}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)] disabled:opacity-50"
              >
                <option value="">Sélectionner une chambre</option>
                {rooms
                  .filter((r) => r.room_type_id === changeRoomTypeId && r.status === "available")
                  .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      Chambre {r.room_number}{r.floor ? ` (étage ${r.floor})` : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Récapitulatif financier */}
          {changeRoomId && (() => {
            const { oldNights, remainingNights, oldPricePerNight, newPricePerNight, supplement } = calcChangeRoomSupplement();
            return (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2 text-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Récapitulatif</p>
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>Nuits déjà consommées ({oldNights})</span>
                  <span className="font-medium">{formatAmount(oldNights * oldPricePerNight)}</span>
                </div>
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>Nuits restantes ({remainingNights}) × {formatAmount(newPricePerNight)}</span>
                  <span className="font-medium">{formatAmount(remainingNights * newPricePerNight)}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between font-semibold">
                  <span>Nouveau total</span>
                  <span>{formatAmount(oldNights * oldPricePerNight + remainingNights * newPricePerNight)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Déjà payé</span>
                  <span>- {formatAmount(changeRoomBooking?.amount_paid || 0)}</span>
                </div>
                {supplement > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                    <span>Supplément à payer</span>
                    <span>{formatAmount(supplement)}</span>
                  </div>
                )}
                {supplement === 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400 font-semibold">
                    <span>Aucun supplément</span>
                    <span>✓</span>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setChangeRoomOpen(false)}>
              Annuler
            </Button>
            <Button className="flex-1" onClick={handleConfirmChangeRoom} loading={changeRoomSaving} disabled={!changeRoomId}>
              <ArrowLeftRight className="w-4 h-4" /> Confirmer le changement
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============ MODAL PAIEMENT PARTIEL ============ */}
      <Modal
        open={!!paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Enregistrer un paiement"
        description={paymentBooking ? `${paymentBooking.client?.full_name || "Client"} · Ch. ${paymentBooking.room?.room_number || "—"} · Solde restant : ${fmt(Math.max(0, (paymentBooking.total_amount || 0) - (paymentBooking.amount_paid || 0)))}` : ""}
      >
        <div className="space-y-3">
          {paymentBooking && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p>
                  Total séjour : <strong>{fmt(paymentBooking.total_amount)}</strong>
                  {" · "}Déjà payé : <strong>{fmt(paymentBooking.amount_paid)}</strong>
                </p>
                <p className="mt-1 font-semibold">
                  Solde restant dû : <strong>{fmt(Math.max(0, (paymentBooking.total_amount || 0) - (paymentBooking.amount_paid || 0)))}</strong>
                </p>
              </div>
            </div>
          )}
          <Input
            label="Montant reçu (FCFA)"
            type="number"
            value={paymentForm.amount}
            onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
            placeholder={paymentBooking ? String(Math.max(0, (paymentBooking.total_amount || 0) - (paymentBooking.amount_paid || 0))) : ""}
          />
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Moyen de paiement</label>
            <select
              value={paymentForm.payment_method}
              onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
            >
              <option value="cash">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank">Virement bancaire</option>
              <option value="wave">Wave</option>
              <option value="other">Autre</option>
            </select>
          </div>
          {paymentForm.payment_method === "mobile_money" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Opérateur</label>
              <select
                value={paymentForm.mobile_money_operator}
                onChange={(e) => setPaymentForm({ ...paymentForm, mobile_money_operator: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                <option value="">Sélectionner</option>
                <option value="orange_money">Orange Money</option>
                <option value="mtn_money">MTN Money</option>
                <option value="moov_money">Moov Money</option>
                <option value="wave">Wave</option>
                <option value="other">Autre</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setPaymentModalOpen(false)}>
              Annuler
            </Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleRecordPayment} loading={paymentSaving}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Enregistrer le paiement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
