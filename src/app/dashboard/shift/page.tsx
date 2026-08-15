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
} from "lucide-react";
import { getActiveAssignmentId } from "@/lib/assignments";
import { isMobileMoney, getMobileMoneyOperatorLabel, MOBILE_MONEY_OPERATORS } from "@/lib/utils";
import type { Payment, Booking } from "@/types/database";

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
  // ── Modal opération manuelle ──────────────────────────────
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState({
    operation_type: "manual_in" as "manual_in" | "manual_out",
    amount: "",
    payment_method: "cash",
    mobile_money_operator: "",
    notes: "",
  });
  // ──────────────────────────────────────────────────
  const [shiftStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  });
  const [now] = useState(new Date().toISOString());

  useEffect(() => {
    loadData();
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

      // Charge les paiements du shift (aujourd'hui) reçus par cet utilisateur
      // Pour un admin, on charge tous les paiements du jour
      let query = supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .gte("payment_date", shiftStart)
        .order("payment_date", { ascending: false });

      if (userData.role === "receptionniste") {
        query = query.eq("received_by", userData.id);
      }

      const { data: payData } = await query;
      if (!payData) return;

      // Charge les infos de booking pour chaque paiement
      const bookingIds = [...new Set(payData.map((p: Payment) => p.booking_id))];
      let enrichedPayments: ShiftPayment[] = payData as Payment[];

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
          enrichedPayments = payData.map((p: Payment) => {
            const b = (bookingData as any[]).find((bk) => bk.id === p.booking_id);
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

      // Filtrer par résidence active pour les réceptionnistes
      if (userData.role === "receptionniste" && activeAccId) {
        bkQuery = bkQuery.eq("accommodation_id", activeAccId);
      }

      const { data: bkData } = await bkQuery;
      if (bkData) setBookings(bkData as unknown as Booking[]);

    } catch (err) {
      toast.error("Impossible de charger les données du shift.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function addManualOperation() {
    const amount = parseInt(manualForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Le montant doit être supérieur à 0.");
      return;
    }
    if (!manualForm.notes.trim()) {
      toast.error("Veuillez indiquer la raison de l'opération.");
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
          ? `➕ Entrée de ${fmt(amount)} enregistrée ✓`
          : `➖ Sortie de ${fmt(amount)} enregistrée ✓`
      );
      setManualModalOpen(false);
      setManualForm({ operation_type: "manual_in", amount: "", payment_method: "cash", mobile_money_operator: "", notes: "" });
      // Recharger les paiements
      await loadData();
    } catch {
      toast.error("Une erreur est survenue.");
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

  // Calculs du shift
  const totalCaisse = payments.reduce((sum, p) => sum + p.amount, 0);
  const byCash = payments.filter((p) => p.payment_method === "cash").reduce((s, p) => s + p.amount, 0);
  const byMobileMoney = payments.filter((p) => isMobileMoney(p.payment_method)).reduce((s, p) => s + p.amount, 0);
  const byOther = payments.filter((p) => p.payment_method !== "cash" && !isMobileMoney(p.payment_method)).reduce((s, p) => s + p.amount, 0);
  const checkedIn = bookings.filter((b) => b.status === "checked_in").length;
  const checkinsToday = bookings.filter((b) => b.check_in_date === new Date().toISOString().split("T")[0]).length;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <User className="w-4 h-4" />
            <span>{userName}</span>
          </div>
          <Button onClick={() => setManualModalOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Opération de caisse
          </Button>
        </div>
      </div>

      {/* Bannière info admin */}
      {isAdmin && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <ShieldAlert className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Vue administrateur — tous les encaissements du jour sont affichés, quel que soit le réceptionniste.
          </p>
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
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">depuis minuit</p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Heure</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Réservation</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Client</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Chambre</th>
                  <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Mode</th>
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
                      <td className="py-3 px-2 text-right">
                        <span className="font-bold text-slate-900 dark:text-white">{fmt(p.amount)}</span>
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
                  <td colSpan={5} className="py-3 px-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
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
              Type d'opération
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
              Enregistrer l'opération
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
