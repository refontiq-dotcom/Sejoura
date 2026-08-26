"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import {
  ClipboardList,
  Loader2,
  Clock,
  Wallet,
  CreditCard,
  TrendingUp,
  BedDouble,
  User,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Banknote,
  Smartphone,
  Building,
  HelpCircle,
  ShieldAlert,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Power,
  LogOut,
  History,
  Scale,
  Users,
  RefreshCw,
  Timer,
} from "lucide-react";
import { getActiveAssignmentId } from "@/lib/assignments";
import { isMobileMoney, getMobileMoneyOperatorLabel, MOBILE_MONEY_OPERATORS } from "@/lib/utils";
import type { Payment, Booking, Shift } from "@/types/database";

interface ShiftPayment extends Payment {
  booking?: {
    booking_code: string;
    room_number: string;
    client_name: string;
    check_in_date: string;
    check_out_date: string;
    total_amount: number;
    payment_status: string;
  };
  receptionist_name?: string;
}

const METHOD_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  cash: { label: "Espèces", icon: Banknote },
  wave: { label: "Wave", icon: Smartphone },
  pi_spi: { label: "Pi-SPI", icon: Smartphone },
  mobile_money: { label: "Mobile Money", icon: Smartphone },
  bank: { label: "Virement", icon: Building },
  other: { label: "Autre", icon: HelpCircle },
};

const METHOD_COLORS: Record<string, string> = {
  cash: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  wave: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  pi_spi: "bg-[var(--primary-muted)] text-[var(--primary-muted-foreground)] font-semibold",
  mobile_money: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  bank: "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
  other: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
};

function formatPaymentTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function fmtSigned(amount: number, fmt: (n: number) => string) {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${fmt(Math.abs(amount))}`;
}

export default function ShiftPage() {
  const router = useRouter();
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [payments, setPayments] = useState<ShiftPayment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // ── Shift de caisse ─────────────────────────────────────────────────────
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [closedShifts, setClosedShifts] = useState<Shift[]>([]);
  const [openShiftsAll, setOpenShiftsAll] = useState<Shift[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  // Modal ouverture de shift
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false);
  const [openShiftSaving, setOpenShiftSaving] = useState(false);
  const [openShiftForm, setOpenShiftForm] = useState({ opening_cash: "", notes: "" });

  // Modal fermeture de shift (relève de caisse)
  const [closeShiftModalOpen, setCloseShiftModalOpen] = useState(false);
  const [closeShiftSaving, setCloseShiftSaving] = useState(false);
  const [closeShiftForm, setCloseShiftForm] = useState({ counted_cash: "", notes: "" });

  // ── Modal opération manuelle ──────────────────────────────────────────────
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState({
    operation_type: "manual_in" as "manual_in" | "manual_out",
    amount: "",
    payment_method: "cash",
    mobile_money_operator: "",
    notes: "",
  });

  const [shiftStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  });

  // Espèces encaissées depuis l'ouverture du shift (sorties manuelles = négatives)
  const cashSinceShiftOpen = payments
    .filter((p) => p.payment_method === "cash" && activeShift && p.payment_date >= activeShift.opened_at)
    .reduce((s, p) => s + p.amount, 0);
  const expectedCashLive = (activeShift?.opening_cash || 0) + cashSinceShiftOpen;

  const totalCaisse = payments.reduce((sum, p) => sum + p.amount, 0);
  const byCash = payments.filter((p) => p.payment_method === "cash").reduce((s, p) => s + p.amount, 0);
  const byMobileMoney = payments.filter((p) => isMobileMoney(p.payment_method)).reduce((s, p) => s + p.amount, 0);
  const byOther = payments.filter((p) => p.payment_method !== "cash" && !isMobileMoney(p.payment_method)).reduce((s, p) => s + p.amount, 0);
  const checkedIn = bookings.filter((b) => b.status === "checked_in").length;
  const checkinsToday = bookings.filter((b) => b.check_in_date === new Date().toISOString().split("T")[0]).length;

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/"); return; }

      const { data: userData } = await supabase
        .from("users")
        .select("id, full_name, role, tenant_id, accommodation_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setUserName(userData.full_name);
      setUserId(userData.id);
      setTenantId(userData.tenant_id);
      setIsAdmin(userData.role === "admin_residence");

      const isReceptionist = userData.role === "receptionniste";
      const isAdminUser = userData.role === "admin_residence";

      // ── Shift actif (réceptionniste) ────────────────────────────────────
      let active: Shift | null = null;
      if (isReceptionist) {
        const { data: shiftData } = await supabase
          .from("shifts")
          .select("*")
          .eq("tenant_id", userData.tenant_id)
          .eq("receptionist_id", userData.id)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        active = shiftData as Shift | null;
        setActiveShift(active);
      } else {
        setActiveShift(null);
      }

      // ── Historique des shifts fermés (traçabilité de qui a laissé quoi) ─
      const { data: closedData } = await supabase
        .from("shifts")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(15);
      setClosedShifts((closedData as Shift[]) || []);

      // ── Noms des employés (pour l'historique et la vue admin) ───────────
      const staffMap: Record<string, string> = {};
      const { data: staffData } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("tenant_id", userData.tenant_id);
      if (staffData) {
        staffData.forEach((u: { id: string; full_name: string }) => { staffMap[u.id] = u.full_name; });
        setStaffNames(staffMap);
      }

      // ── Shifts ouverts en ce moment (vue admin) ─────────────────────────
      if (isAdminUser) {
        const { data: openData } = await supabase
          .from("shifts")
          .select("*")
          .eq("tenant_id", userData.tenant_id)
          .eq("status", "open")
          .order("opened_at", { ascending: false });
        setOpenShiftsAll((openData as Shift[]) || []);
      }

      // ── Paiements ───────────────────────────────────────────────────────
      // Réceptionniste : son shift (ou la journée si aucun shift ouvert).
      // Admin : toute la journée, tous les réceptionnistes.
      // Les paiements d'abonnement plateforme (operation_type = subscription)
      // sont exclus du shift de caisse.
      const fromDate = isReceptionist && active?.opened_at ? active.opened_at : shiftStart;
      let query = supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .gte("payment_date", fromDate)
        .neq("operation_type", "subscription")
        .order("payment_date", { ascending: false });

      if (isReceptionist) {
        query = query.eq("received_by", userData.id);
      }

      const { data: payData } = await query;
      if (!payData) return;

      // Charge les infos de booking pour chaque paiement
      const bookingIds = [...new Set(payData.map((p: Payment) => p.booking_id))];
      let enrichedPayments: ShiftPayment[] = (payData as Payment[]).map((p) => ({
        ...p,
        receptionist_name: staffMap[p.received_by],
      }));

      if (bookingIds.length > 0) {
        const { data: bookingData } = await supabase
          .from("bookings")
          .select(`
            id,
            booking_code,
            check_in_date,
            check_out_date,
            total_amount,
            payment_status,
            room:rooms(room_number),
            client:clients(full_name)
          `)
          .in("id", bookingIds);

        if (bookingData) {
          const bookingRows = bookingData as unknown as {
            id: string;
            booking_code: string;
            check_in_date: string;
            check_out_date: string;
            total_amount: number;
            payment_status: string;
            room?: { room_number: string } | null;
            client?: { full_name: string } | null;
          }[];
          enrichedPayments = (payData as Payment[]).map((p) => {
            const b = bookingRows.find((bk) => bk.id === p.booking_id);
            return {
              ...p,
              booking: b
                ? {
                    booking_code: b.booking_code,
                    room_number: b.room?.room_number || "—",
                    client_name: b.client?.full_name || "—",
                    check_in_date: b.check_in_date,
                    check_out_date: b.check_out_date,
                    total_amount: b.total_amount,
                    payment_status: b.payment_status,
                  }
                : undefined,
              receptionist_name: staffMap[p.received_by],
            };
          });
        }
      }

      setPayments(enrichedPayments);

      // Résoudre l'établissement actif pour le filtrage des réservations
      const activeAccId = await getActiveAssignmentId(supabase, userData.id, userData.accommodation_id);
      setAccommodationId(activeAccId);

      // Réservations actives du jour (check-in ou en séjour) pour la vue d'ensemble
      const today = new Date().toISOString().split("T")[0];
      let bkQuery = supabase
        .from("bookings")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .or(`check_in_date.eq.${today},status.eq.checked_in`);

      if (isReceptionist && activeAccId) {
        bkQuery = bkQuery.eq("accommodation_id", activeAccId);
      }

      const { data: bkData } = await bkQuery;
      if (bkData) setBookings(bkData as unknown as Booking[]);

    } catch (err) {
      toast.error("Les données du shift sont introuvables 🤔");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── Temps réel : rafraîchit les paiements dès qu'un encaissement arrive ──
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("shift-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => loadData()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ouverture du shift ────────────────────────────────────────────────────
  function openOpenShiftModal() {
    // Suggère la reprise de caisse du dernier shift fermé (collègue)
    const lastClosed = closedShifts[0];
    const suggestion = lastClosed?.counted_cash ?? 0;
    setOpenShiftForm({
      opening_cash: suggestion > 0 ? String(suggestion) : "",
      notes: lastClosed?.counted_cash != null
        ? `Reprise de la caisse (${fmt(lastClosed.counted_cash)}) laissée par ${staffNames[lastClosed.receptionist_id] || "le collègue"}`
        : "",
    });
    setOpenShiftModalOpen(true);
  }

  async function handleOpenShift() {
    const opening = Math.round(Number(openShiftForm.opening_cash)) || 0;
    if (opening < 0) {
      toast.error("Le fond de caisse ne peut pas être négatif 💰");
      return;
    }
    setOpenShiftSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("open_shift", {
        p_user_id: userId,
        p_accommodation_id: accommodationId,
        p_opening_cash: opening,
        p_notes: openShiftForm.notes?.trim() || null,
      });
      if (error) {
        toast.error("Erreur lors de l'ouverture du shift : " + error.message);
        return;
      }
      toast.success("Shift ouvert — fond de caisse " + fmt(opening) + " ✓");
      setOpenShiftModalOpen(false);
      await loadData();
    } catch {
      toast.error("Oups, un petit souci technique ! Réessayez 🤕");
    } finally {
      setOpenShiftSaving(false);
    }
  }

  // ── Fermeture du shift (relève de caisse) ────────────────────────────────
  function openCloseShiftModal() {
    setCloseShiftForm({
      counted_cash: String(expectedCashLive),
      notes: "",
    });
    setCloseShiftModalOpen(true);
  }

  async function handleCloseShift() {
    if (!activeShift) return;
    const counted = Math.round(Number(closeShiftForm.counted_cash));
    if (Number.isNaN(counted) || counted < 0) {
      toast.error("Le montant de la caisse n'est pas valide 💰");
      return;
    }
    setCloseShiftSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("close_shift", {
        p_shift_id: activeShift.id,
        p_counted_cash: counted,
        p_notes: closeShiftForm.notes?.trim() || null,
      });
      if (error) {
        toast.error("La fermeture du shift a échoué : " + error.message);
        return;
      }
      const diff = (data as Shift)?.difference ?? 0;
      if (diff === 0) {
        toast.success("Shift fermé — caisse exacte ✓ 💯");
      } else {
        toast.warning(`Shift fermé — écart de ${fmtSigned(diff, fmt)}`);
      }
      setCloseShiftModalOpen(false);
      setActiveShift(null);
      await loadData();
    } catch {
      toast.error("Oups, un petit souci technique ! Réessayez 🤕");
    } finally {
      setCloseShiftSaving(false);
    }
  }

  async function addManualOperation() {
    const amount = Math.round(Number(manualForm.amount));
    if (!amount || amount <= 0) {
      toast.error("Le montant doit être supérieur à 0.");
      return;
    }
    if (!manualForm.notes.trim()) {
      toast.error("Indiquez la raison de l'opération.");
      return;
    }
    setManualSaving(true);
    try {
      const supabase = createClient();
      // Les sorties de caisse sont enregistrées avec un montant négatif
      const signedAmount = manualForm.operation_type === "manual_out" ? -amount : amount;
      const { error } = await supabase.from("payments").insert({
        tenant_id: tenantId,
        booking_id: null,
        accommodation_id: accommodationId,
        amount: signedAmount,
        payment_method: manualForm.payment_method,
        mobile_money_operator: manualForm.payment_method === "mobile_money" ? manualForm.mobile_money_operator || null : null,
        payment_date: new Date().toISOString(),
        received_by: userId,
        operation_type: manualForm.operation_type,
        notes: manualForm.notes,
      });
      if (error) {
        toast.error("Erreur lors de l'enregistrement : " + error.message);
        return;
      }
      toast.success(
        manualForm.operation_type === "manual_in"
          ? `Entrée de ${fmt(amount)} enregistrée ✓`
          : `Sortie de ${fmt(amount)} enregistrée ✓`
      );
      setManualModalOpen(false);
      setManualForm({ operation_type: "manual_in", amount: "", payment_method: "cash", mobile_money_operator: "", notes: "" });
      await loadData();
    } catch {
      toast.error("Oups, un petit souci technique ! Réessayez 🤕");
    } finally {
      setManualSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Mon Shift / Caisse</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--primary-muted)] text-[var(--primary-muted-foreground)] border border-[var(--primary-color)]/20">
              <Clock className="w-3 h-3" />
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
            {isAdmin ? "Vue globale des encaissements du jour" : `Encaissements du shift de ${userName}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 min-w-0">
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{userName}</span>
          </div>
          <Button onClick={() => setManualModalOpen(true)} className="gap-2" variant="outline" size="sm">
            <Plus className="w-4 h-4" /> Opération de caisse
          </Button>
        </div>
      </div>

      {/* ── Contrôle du shift (réceptionniste) ─────────────────────────────── */}
      {!isAdmin && (
        activeShift ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <Timer className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                  Shift ouvert
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3" /> depuis {formatPaymentTime(activeShift.opened_at)}
                  </span>
                </p>
                <p className="text-xs text-green-700/80 dark:text-green-300/80 mt-0.5">
                  Fond de caisse {fmt(activeShift.opening_cash)} · Espèces encaissées {fmt(cashSinceShiftOpen)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:ml-auto">
              <div className="text-right">
                <p className="text-xs text-green-700/70 dark:text-green-300/70">Caisse attendue</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{fmt(expectedCashLive)}</p>
              </div>
              <Button onClick={openCloseShiftModal} className="gap-2 bg-green-700 hover:bg-green-800">
                <LogOut className="w-4 h-4" /> Fermer mon shift
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Power className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Aucun shift ouvert</p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                  Ouvrez votre shift pour tracer votre caisse et permettre la relève de votre collègue.
                </p>
              </div>
            </div>
            <div className="sm:ml-auto">
              <Button onClick={openOpenShiftModal} className="gap-2">
                <Power className="w-4 h-4" /> Ouvrir mon shift
              </Button>
            </div>
          </div>
        )
      )}

      {/* ── Vue admin : shifts ouverts en ce moment ────────────────────────── */}
      {isAdmin && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <ShieldAlert className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300 min-w-0">
            <span className="font-semibold">Vue administrateur</span> — tous les encaissements du jour sont affichés, quel que soit le réceptionniste.
            {openShiftsAll.length > 0 && (
              <span className="flex items-start gap-1.5 mt-1 text-xs gap-x-1.5">
                <Users className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                <span>Shifts ouverts :{" "}
                {openShiftsAll.map((s) => `${staffNames[s.receptionist_id] || "Réceptionniste"} (${formatPaymentTime(s.opened_at)}, fond ${fmt(s.opening_cash)})`).join(" · ")}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI Caisse */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-3 col-span-1 md:col-span-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center">
              <Wallet className="w-6 h-6 text-[var(--primary-muted-foreground)]" />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide font-medium">Total Caisse</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{fmt(totalCaisse)}</p>
            </div>
          </div>
          <div className="space-y-1.5 mt-2 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:text-slate-500"><Banknote className="w-3.5 h-3.5" /> Espèces</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(byCash)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:text-slate-500"><Smartphone className="w-3.5 h-3.5" /> Mobile Money</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(byMobileMoney)}</span>
            </div>
            {byOther > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:text-slate-500"><CreditCard className="w-3.5 h-3.5" /> Autres</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(byOther)}</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide font-medium">Paiements reçus</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{payments.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {isAdmin ? "aujourd'hui" : activeShift ? "depuis l'ouverture" : "depuis minuit"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <BedDouble className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide font-medium">Chambres occupées</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{checkedIn}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{checkinsToday} check-in(s) aujourd&apos;hui</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Résumé de relève */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-500" />
            Résumé de relève
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">{new Date().toLocaleTimeString("fr-FR")}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Espèces en caisse", value: fmt(byCash), color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
            { label: "Mobile Money", value: fmt(byMobileMoney), color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
            { label: "Autres modes", value: fmt(byOther), color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" },
            { label: "Total général", value: fmt(totalCaisse), color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
          ].map((item) => (
            <div key={item.label} className={`p-3 rounded-lg ${item.bg}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Historique / traçabilité des shifts ────────────────────────────── */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            Historique des shifts
          </h2>
          {closedShifts.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">{closedShifts.length} shift(s) fermé(s)</span>
          )}
        </div>
        {closedShifts.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
            Aucun shift fermé pour le moment. La relève de caisse apparaîtra ici.
          </p>
        ) : (
          <>
          {/* Cartes mobiles */}
          <div className="md:hidden grid grid-cols-2 gap-2.5">
            {closedShifts.map((s) => {
              const diff = s.difference ?? 0;
              return (
                <div key={s.id} className="rounded-2xl border border-[var(--border-card)] bg-[var(--card-bg,var(--surface))] p-3 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {staffNames[s.receptionist_id] || "Réceptionniste"}
                    </p>
                    <div className="flex-shrink-0 text-right">
                      {diff === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Exact
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          <Scale className="w-3.5 h-3.5" />
                          {fmtSigned(diff, fmt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{s.closed_at ? formatDateTime(s.closed_at) : "—"}</span>
                  </p>
                  <div className="space-y-1 mt-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Ouverture</span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{fmt(s.opening_cash)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Attendu</span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{fmt(s.expected_cash ?? 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Compté</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{fmt(s.counted_cash ?? 0)}</span>
                    </div>
                  </div>
                  {s.notes && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 truncate">{s.notes}</p>}
                </div>
              );
            })}
          </div>
          {/* Tableau desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="text-left py-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Fermé le</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Réceptionniste</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Ouverture</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Attendu</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Compté</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Écart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {closedShifts.map((s) => {
                  const diff = s.difference ?? 0;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{s.closed_at ? formatDateTime(s.closed_at) : "—"}</span>
                        </div>
                        {s.notes && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{s.notes}</p>}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {staffNames[s.receptionist_id] || "Réceptionniste"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-600 dark:text-slate-300">{fmt(s.opening_cash)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-600 dark:text-slate-300">{fmt(s.expected_cash ?? 0)}</td>
                      <td className="py-2.5 px-2 text-right font-semibold text-slate-900 dark:text-white">{fmt(s.counted_cash ?? 0)}</td>
                      <td className="py-2.5 px-2 text-right">
                        {diff === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Exact
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            <Scale className="w-3.5 h-3.5" />
                            {fmtSigned(diff, fmt)}
                          </span>
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
      </Card>

      {/* Tableau des paiements du shift */}
      <Card className="p-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Paiements du shift ({payments.length})
        </h2>
        {payments.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="w-12 h-12 text-slate-300 dark:text-slate-600 dark:text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Aucun paiement enregistré pour ce shift</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Les paiements apparaissent ici dès qu&apos;ils sont enregistrés dans les réservations</p>
          </div>
        ) : (
          <>
          {/* Cartes mobiles */}
          <div className="md:hidden grid grid-cols-2 gap-2.5">
            {payments.map((p) => {
              const methodInfo = METHOD_LABELS[p.payment_method] || METHOD_LABELS.other;
              const MethodIcon = methodInfo.icon;
              return (
                <div key={p.id} className="rounded-2xl border border-[var(--border-card)] bg-[var(--card-bg,var(--surface))] p-3 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg truncate">
                      {p.booking?.booking_code || "—"}
                    </span>
                    <span className={`flex-shrink-0 font-bold ${p.amount < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                      {fmt(p.amount)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1 truncate">
                    {p.booking?.client_name || "—"}
                  </p>
                  {p.booking?.room_number ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <BedDouble className="w-3 h-3 flex-shrink-0" />
                      Ch. {p.booking.room_number}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-0.5">—</p>
                  )}
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium mt-2 ${METHOD_COLORS[p.payment_method] || METHOD_COLORS.other}`}>
                    <MethodIcon className="w-3 h-3" />
                    {methodInfo.label}
                    {p.payment_method === "mobile_money" && p.mobile_money_operator && (
                      <span className="opacity-80">· {getMobileMoneyOperatorLabel(p.mobile_money_operator)}</span>
                    )}
                  </span>
                  {isAdmin && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 truncate">
                      {p.receptionist_name || "—"}
                    </p>
                  )}
                  {p.booking?.payment_status === "paid" ? (
                    <p className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400 mt-1">
                      <CheckCircle2 className="w-3 h-3" /> Soldé
                    </p>
                  ) : p.booking?.payment_status === "partial" ? (
                    <p className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 dark:text-orange-400 mt-1">
                      <ArrowRight className="w-3 h-3" /> Partiel
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">—</p>
                  )}
                </div>
              );
            })}
            <div className="flex flex-col gap-0.5 items-start justify-center p-3 rounded-2xl border border-[var(--border-card)] bg-[var(--card-bg,var(--surface))] min-w-0">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Total encaissé ce shift</span>
              <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{fmt(totalCaisse)}</span>
            </div>
          </div>
          {/* Tableau desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Heure</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Réservation</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Client</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Chambre</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Mode</th>
                  {isAdmin && (
                    <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Reçu par</th>
                  )}
                  <th className="text-right py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Montant</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {payments.map((p) => {
                  const methodInfo = METHOD_LABELS[p.payment_method] || METHOD_LABELS.other;
                  const MethodIcon = methodInfo.icon;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatPaymentTime(p.payment_date)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg">
                          {p.booking?.booking_code || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {p.booking?.client_name || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        {p.booking?.room_number ? (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <BedDouble className="w-3.5 h-3.5" />
                            Ch. {p.booking.room_number}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${METHOD_COLORS[p.payment_method] || METHOD_COLORS.other}`}>
                          <MethodIcon className="w-3 h-3" />
                          {methodInfo.label}
                          {p.payment_method === "mobile_money" && p.mobile_money_operator && (
                            <span className="opacity-80">· {getMobileMoneyOperatorLabel(p.mobile_money_operator)}</span>
                          )}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2">
                          <span className="text-slate-600 dark:text-slate-300">{p.receptionist_name || "—"}</span>
                        </td>
                      )}
                      <td className="py-3 px-2 text-right">
                        <span className={`font-bold ${p.amount < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                          {fmt(p.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        {p.booking?.payment_status === "paid" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Soldé
                          </span>
                        ) : p.booking?.payment_status === "partial" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                            <ArrowRight className="w-3.5 h-3.5" /> Partiel
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-600">
                  <td colSpan={isAdmin ? 7 : 6} className="py-3 px-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Total encaissé ce shift
                  </td>
                  <td className="py-3 px-2 text-right">
                    <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{fmt(totalCaisse)}</span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </Card>

      {/* Réservations actives du jour */}
      {bookings.length > 0 && (
        <Card className="p-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-500" />
            Réservations actives du jour ({bookings.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bookings.map((b) => (
              <div key={b.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <BedDouble className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {b.booking_code}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {formatShortDate(b.check_in_date)} → {formatShortDate(b.check_out_date)}
                  </p>
                </div>
                <Badge
                  variant={
                    b.status === "checked_in" ? "success"
                    : b.status === "confirmed" ? "default"
                    : "error"
                  }
                >
                  {b.status === "checked_in" ? "Présent" : b.status === "confirmed" ? "Confirmé" : b.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal d'ouverture de shift */}
      <Modal
        open={openShiftModalOpen}
        onClose={() => setOpenShiftModalOpen(false)}
        title="Ouvrir mon shift"
        description="Saisissez le fond de caisse que vous reprenez avant de commencer votre service."
      >
        <div className="space-y-3">
          <Input
            label="Fond de caisse (reprise)"
            type="number"
            placeholder="Ex: 50000"
            value={openShiftForm.opening_cash}
            onChange={(e) => setOpenShiftForm({ ...openShiftForm, opening_cash: e.target.value })}
          />
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Note de reprise (visible par le collègue suivant)
            </label>
            <textarea
              rows={3}
              value={openShiftForm.notes}
              onChange={(e) => setOpenShiftForm({ ...openShiftForm, notes: e.target.value })}
              placeholder="Ex: Reprise de la caisse laissée par Marie"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setOpenShiftModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleOpenShift} loading={openShiftSaving}>
              <Power className="w-4 h-4" /> Ouvrir le shift
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de fermeture de shift (relève de caisse) */}
      <Modal
        open={closeShiftModalOpen}
        onClose={() => setCloseShiftModalOpen(false)}
        title="Fermer mon shift"
        description="Comptez la caisse physique puis validez la relève pour votre collègue."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Fond de caisse</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{fmt(activeShift?.opening_cash ?? 0)}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Espèces encaissées</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{fmt(cashSinceShiftOpen)}</p>
            </div>
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-xs text-green-600 dark:text-green-400 mb-1">Caisse attendue</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-300">{fmt(expectedCashLive)}</p>
            </div>
          </div>

          <Input
            label="Caisse comptée physiquement"
            type="number"
            value={closeShiftForm.counted_cash}
            onChange={(e) => setCloseShiftForm({ ...closeShiftForm, counted_cash: e.target.value })}
          />

          {(() => {
            const counted = Math.round(Number(closeShiftForm.counted_cash));
            const diff = Number.isNaN(counted) ? 0 : counted - expectedCashLive;
            if (Number.isNaN(counted)) return null;
            return (
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold ${diff === 0 ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800" : diff > 0 ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"}`}>
                <Scale className="w-4 h-4" />
                {diff === 0 ? "Caisse exacte — aucune différence" : `Écart de caisse : ${fmtSigned(diff, fmt)}`}
              </div>
            );
          })()}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Note de relève (pour votre collègue)
            </label>
            <textarea
              rows={3}
              value={closeShiftForm.notes}
              onChange={(e) => setCloseShiftForm({ ...closeShiftForm, notes: e.target.value })}
              placeholder="Ex: 50000 en caisse, coffre verrouillé, clé au tiroir"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setCloseShiftModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCloseShift} loading={closeShiftSaving} variant="success">
              <RefreshCw className="w-4 h-4" /> Fermer et transmettre
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal d'opération manuelle */}
      <Modal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        title="Ajouter une opération de caisse"
        description="Entrée ou sortie de caisse manuelle avec traçabilité"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Type d&apos;opération
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setManualForm({ ...manualForm, operation_type: "manual_in" })}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                  manualForm.operation_type === "manual_in"
                    ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <ArrowDownCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                Entrée de fond
              </button>
              <button
                type="button"
                onClick={() => setManualForm({ ...manualForm, operation_type: "manual_out" })}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                  manualForm.operation_type === "manual_out"
                    ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <ArrowUpCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                Sortie / Dépense
              </button>
            </div>
          </div>

          <Input
            label="Montant"
            type="number"
            placeholder="Ex: 5000"
            value={manualForm.amount}
            onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Mode de paiement
            </label>
            <select
              value={manualForm.payment_method}
              onChange={(e) => setManualForm({ ...manualForm, payment_method: e.target.value })}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white"
            >
              <option value="cash">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank">Virement bancaire</option>
              <option value="other">Autre</option>
            </select>
          </div>

          {manualForm.payment_method === "mobile_money" && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Opérateur Mobile Money
              </label>
              <select
                value={manualForm.mobile_money_operator}
                onChange={(e) => setManualForm({ ...manualForm, mobile_money_operator: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white"
              >
                <option value="">Sélectionner un opérateur</option>
                {MOBILE_MONEY_OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>
          )}

          <Input
            label="Raison / Note (Obligatoire)"
            placeholder="Ex: Fond de caisse initial ou Achat fournitures"
            value={manualForm.notes}
            onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setManualModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={addManualOperation} loading={manualSaving}>
              Enregistrer l&apos;opération
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
