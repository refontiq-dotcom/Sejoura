"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  TrendingUp,
  Wallet,
  LogIn,
  LogOut,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  formatFCFA,
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getRoomStatusLabel,
  getRoomStatusChartColor,
} from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { DashboardSkeletons } from "@/components/ui/skeletons";
import { AlertCircle, PlusCircle, RefreshCw } from "lucide-react";
import type { Booking, Client, Room, RoomType } from "@/types/database";

// ============================================================================
// TYPES
// ============================================================================

interface KPIData {
  occupancyRate: number;
  dailyRevenue: number;
  expectedCheckins: number;
  expectedCheckouts: number;
  cleaningPending: number;
  cleaningDone: number;
}

interface Movement {
  id: string;
  bookingCode: string;
  clientName: string;
  roomNumber: string;
  roomType: string;
  time: string;
  movementType: "check_in" | "check_out";
  paymentStatus: string;
  totalAmount: number;
  amountPaid: number;
  bookingStatus: string;
}

interface RoomStatusData {
  status: string;
  count: number;
}

interface MonthlyRevenueData {
  month: string;
  revenue: number;
}

function normalizeUnknownError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object") {
    const entries = Object.getOwnPropertyNames(err).map((key) => {
      const value = (err as any)[key];
      return `${key}: ${value}`;
    }).filter(Boolean);
    if (entries.length > 0) {
      return new Error(entries.join(" | "));
    }
  }
  return new Error(String(err ?? "Erreur inconnue"));
}

// ============================================================================
// DONUT CHART (SVG natif, sans dépendance externe)
// ============================================================================

function DonutChart({ data }: { data: RoomStatusData[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
        <span className="text-4xl font-bold text-slate-300">0</span>
        <span className="text-sm mt-1">Chambres</span>
      </div>
    );
  }

  const radius = 70;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <svg width="200" height="200" viewBox="0 0 200 200" className="transform -rotate-90">
          {/* Cercle de fond */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-700"
          />
          {/* Segments */}
          {data.map((item, index) => {
            const percentage = item.count / total;
            const dashLength = percentage * circumference;
            const circle = (
              <circle
                key={index}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={getRoomStatusChartColor(item.status)}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            );
            offset += dashLength;
            return circle;
          })}
        </svg>
        {/* Centre */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{total}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">Chambres</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LINE CHART (SVG natif)
// ============================================================================

function LineChart({ data }: { data: MonthlyRevenueData[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
        Aucune donnée disponible
      </div>
    );
  }

  const width = 800;
  const height = 250;
  const padding = { top: 20, right: 20, bottom: 40, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const minRevenue = 0;

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.revenue - minRevenue) / (maxRevenue - minRevenue)) * chartHeight;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  // Lignes de grille
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = padding.top + chartHeight - t * chartHeight;
    const value = Math.round(t * maxRevenue);
    return { y, value };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grille horizontale */}
        {gridLines.map((line, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={line.y}
              x2={width - padding.right}
              y2={line.y}
              stroke="currentColor"
              strokeWidth="1"
              className="text-slate-200 dark:text-slate-700"
              strokeDasharray="4 4"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              textAnchor="end"
              className="text-xs fill-slate-400"
            >
              {formatFCFA(line.value).replace(" FCFA", "")}
            </text>
          </g>
        ))}

        {/* Aire */}
        <path d={areaD} fill="url(#revenueGradient)" />

        {/* Ligne */}
        <path
          d={pathD}
          fill="none"
          stroke="#6366f1"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points & Tooltips */}
        {points.map((p, i) => (
          <g 
            key={i} 
            className="cursor-pointer"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? "7" : "5"}
              fill="#6366f1"
              stroke="white"
              strokeWidth="2"
              className="dark:stroke-slate-800 transition-all"
            />
            <text
              x={p.x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className={`text-xs ${hoveredIndex === i ? "fill-indigo-600 font-bold" : "fill-slate-500 dark:fill-slate-400"}`}
            >
              {p.month}
            </text>

            {/* Tooltip Card */}
            {hoveredIndex === i && (
              <g className="animate-fade-in pointer-events-none">
                <rect
                  x={p.x - 60}
                  y={p.y - 35}
                  width="120"
                  height="26"
                  rx="6"
                  fill="#1e293b"
                  className="shadow-lg"
                />
                <text
                  x={p.x}
                  y={p.y - 18}
                  textAnchor="middle"
                  fill="#ffffff"
                  className="text-xs font-semibold"
                >
                  {formatFCFA(p.revenue)}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIData>({
    occupancyRate: 0,
    dailyRevenue: 0,
    expectedCheckins: 0,
    expectedCheckouts: 0,
    cleaningPending: 0,
    cleaningDone: 0,
  });
  const [movements, setMovements] = useState<Movement[]>([]);
  const [roomStatusData, setRoomStatusData] = useState<RoomStatusData[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenueData[]>([]);
  const [trendPercentage, setTrendPercentage] = useState(0);
  const [userId, setUserId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string>("");
  const [hasAccommodations, setHasAccommodations] = useState(true);
  const [error, setError] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
        const supabase = createClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(sessionError.message || "Erreur de session Supabase");
        }
        if (!sessionData?.session) {
          setLoading(false);
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("id, tenant_id")
          .eq("auth_user_id", sessionData.session.user.id)
          .maybeSingle();

        if (userError || !userData?.tenant_id) {
          setError(true);
          toast.error("Compte utilisateur introuvable. Veuillez contacter l'administrateur.");
          setLoading(false);
          return;
        }

        setUserId(userData.id);

        const tenantId = userData.tenant_id;
        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split("T")[0];

        const [bookingsData, paymentsData, cleaningTasksData, accommodationsData] =
          await Promise.all([
            supabase
              .from("bookings")
              .select(`
                *,
                client:clients(*),
                room:rooms(*, room_type:room_types(*))
              `)
              .eq("tenant_id", tenantId)
              .in("status", ["confirmed", "checked_in"]),
            supabase
              .from("payments")
              .select("amount, payment_date")
              .eq("tenant_id", tenantId),
            supabase
              .from("cleaning_tasks")
              .select("status")
              .eq("tenant_id", tenantId),
            supabase
              .from("accommodations")
              .select("id")
              .eq("tenant_id", tenantId),
          ]);

        if (bookingsData.error) throw new Error(bookingsData.error.message || "Erreur lors de la récupération des réservations.");
        if (paymentsData.error) throw new Error(paymentsData.error.message || "Erreur lors de la récupération des paiements.");
        if (cleaningTasksData.error) throw new Error(cleaningTasksData.error.message || "Erreur lors de la récupération des tâches de ménage.");
        if (accommodationsData.error) throw new Error(accommodationsData.error.message || "Erreur lors de la récupération des établissements.");

        const bookings = (bookingsData.data || []) as unknown as (Booking & { client?: Client; room?: Room; room_type?: RoomType })[];
        const accommodations = (accommodationsData.data || []) as { id: string }[];
        const accommodationIds = accommodations.map((a) => a.id);
        
        setHasAccommodations(accommodationIds.length > 0);

        const roomsQuery = supabase
          .from("rooms")
          .select("status")
          .in("accommodation_id", accommodationIds.length > 0 ? accommodationIds : ["00000000-0000-0000-0000-000000000000"]);

        const roomsDataResult = await roomsQuery;
        if (roomsDataResult.error) throw new Error(roomsDataResult.error.message || "Erreur lors de la récupération des chambres.");
        const rooms = (roomsDataResult.data || []) as unknown as { status: string }[];
        const payments = (paymentsData.data || []) as unknown as { amount: number; payment_date: string }[];
        const cleaningTasks = (cleaningTasksData.data || []) as unknown as { status: string }[];

        const todayBookings = bookings.filter((b) => {
          return b.check_in_date === today || b.check_out_date === today;
        });

        const expectedCheckins = bookings.filter(
          (b) => b.check_in_date === today && b.status === "confirmed"
        ).length;
        const expectedCheckouts = bookings.filter(
          (b) => b.check_out_date === today && b.status === "checked_in"
        ).length;

        const todayPayments = payments.filter(
          (p) => p.payment_date === today
        );
        const dailyRevenue = todayPayments.reduce((sum, p) => sum + p.amount, 0);

        const totalRooms = rooms.length || 1;
        const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
        const occupancyRate = Math.round((occupiedRooms / totalRooms) * 100);

        const cleaningPending = cleaningTasks.filter(
          (t) => t.status === "pending" || t.status === "claimed"
        ).length;
        const cleaningDone = cleaningTasks.filter(
          (t) => t.status === "done"
        ).length;

        setKpis({
          occupancyRate,
          dailyRevenue,
          expectedCheckins,
          expectedCheckouts,
          cleaningPending,
          cleaningDone,
        });

        const movements: Movement[] = todayBookings.map((b) => ({
          id: b.id,
          bookingCode: b.booking_code,
          clientName: b.client?.full_name || "—",
          roomNumber: b.room?.room_number || "—",
          roomType: b.room_type?.name || "—",
          time: b.check_in_date === today ? b.check_in_time || "14:00" : b.check_out_time || "11:00",
          movementType: b.check_in_date === today ? "check_in" : "check_out",
          paymentStatus: b.payment_status,
          totalAmount: b.total_amount,
          amountPaid: b.amount_paid,
          bookingStatus: b.status,
        }));

        setMovements(movements);

        const statusCounts: Record<string, number> = {};
        rooms.forEach((r) => {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        });
        setRoomStatusData([
          { status: "occupied", count: statusCounts["occupied"] || 0 },
          { status: "available", count: statusCounts["available"] || 0 },
          { status: "cleaning", count: statusCounts["cleaning"] || 0 },
          { status: "alert", count: statusCounts["alert"] || 0 },
        ]);

        const monthMap: Record<string, number> = {};
        const monthMapPrev: Record<string, number> = {};
        const monthLabels: string[] = [];
        const monthLabelsPrev: string[] = [];

        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const label = d.toLocaleString("fr-FR", { month: "short" });
          monthLabels.push(label);
        }
        for (let i = 11; i >= 6; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const label = d.toLocaleString("fr-FR", { month: "short" });
          monthLabelsPrev.push(label);
        }

        payments.forEach((p) => {
          const d = new Date(p.payment_date);
          const key = d.toLocaleString("fr-FR", { month: "short" });
          if (monthLabels.includes(key)) {
            monthMap[key] = (monthMap[key] || 0) + p.amount;
          }
          if (monthLabelsPrev.includes(key)) {
            monthMapPrev[key] = (monthMapPrev[key] || 0) + p.amount;
          }
        });

        const monthlyData: MonthlyRevenueData[] = monthLabels.map((month) => ({
          month,
          revenue: monthMap[month] || 0,
        }));
        setMonthlyRevenue(monthlyData);

        const currentTotal = monthLabels.reduce((sum, m) => sum + (monthMap[m] || 0), 0);
        const previousTotal = monthLabelsPrev.reduce((sum, m) => sum + (monthMapPrev[m] || 0), 0);
        const trend = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
        setTrendPercentage(trend);
      } catch (err) {
        setError(true);
        toast.error("Impossible de charger les données du tableau de bord.");
        const normalizedError = normalizeUnknownError(err);
        console.error(normalizedError, err);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  async function handleMovementAction(bookingId: string, action: "check_in" | "check_out") {
    setActionLoading(bookingId);
    try {
      const supabase = createClient();
      const rpcName = action === "check_in" ? "check_in_booking" : "check_out_booking";
      const { error } = await supabase.rpc(rpcName, {
        p_booking_id: bookingId,
        p_user_id: userId,
      });

      if (error) {
        toast.error("Erreur: " + error.message);
        return;
      }

      toast.success(action === "check_in" ? "Check-in effectué avec succès." : "Check-out effectué avec succès.");
      loadDashboardData();
    } catch {
      toast.error("Une erreur est survenue lors de l'action.");
    } finally {
      setActionLoading("");
    }
  }

  if (loading) {
    return <DashboardSkeletons />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Erreur de chargement</h2>
        <p className="text-slate-500 dark:text-slate-400">Une erreur est survenue lors de la récupération de vos données.</p>
        <Button onClick={loadDashboardData} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Réessayer
        </Button>
      </div>
    );
  }

  if (!hasAccommodations) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-2">
          <Sparkles className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center">Bienvenue sur Séjoura !</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md text-center">
          Pour commencer à utiliser votre tableau de bord, vous devez d'abord créer votre premier établissement et y ajouter des chambres.
        </p>
        <div className="pt-4">
          <Button onClick={() => router.push("/dashboard/residences")} className="gap-2" size="lg">
            <PlusCircle className="w-5 h-5" /> Ajouter un établissement
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. BARRE DE CARTES SPÉCIALES — 4 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Taux d'occupation */}
        <Card className="p-5 hover:shadow-md transition-shadow border-t-4 border-t-blue-500 dark:border-t-blue-400">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <Badge variant="info">Aujourd'hui</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Taux d'occupation</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{kpis.occupancyRate}%</p>
          <div className="mt-3 h-2 bg-[var(--muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
              style={{ width: `${kpis.occupancyRate}%` }}
            />
          </div>
        </Card>

        {/* KPI 2: Encaissements du jour */}
        <Card className="p-5 hover:shadow-md transition-shadow border-t-4 border-t-emerald-500 dark:border-t-emerald-400">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <Badge variant="success">FCFA</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Encaissements du jour</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {formatFCFA(kpis.dailyRevenue).replace(" FCFA", "")}
          </p>
          <p className="text-xs text-slate-400 mt-2">FCFA encaissés aujourd'hui</p>
        </Card>

        {/* KPI 3: Entrées / Sorties prévues */}
        <Card className="p-5 hover:shadow-md transition-shadow border-t-4 border-t-blue-500 dark:border-t-blue-400">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <LogIn className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Entrées / Sorties</p>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <LogIn className="w-4 h-4 text-emerald-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.expectedCheckins}</span>
              </div>
              <p className="text-xs text-slate-400">Arrivées</p>
            </div>
            <div className="w-px h-10 bg-slate-200 dark:bg-slate-700" />
            <div>
              <div className="flex items-center gap-1.5">
                <LogOut className="w-4 h-4 text-orange-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.expectedCheckouts}</span>
              </div>
              <p className="text-xs text-slate-400">Départs</p>
            </div>
          </div>
        </Card>

        {/* KPI 4: État Ménage */}
        <Card className="p-5 hover:shadow-md transition-shadow border-t-4 border-t-purple-500 dark:border-t-purple-400">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">État du ménage</p>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.cleaningPending}</span>
              </div>
              <p className="text-xs text-slate-400">À nettoyer</p>
            </div>
            <div className="w-px h-10 bg-slate-200 dark:bg-slate-700" />
            <div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.cleaningDone}</span>
              </div>
              <p className="text-xs text-slate-400">Prêtes</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 2. CONTENEUR PRINCIPAL GAUCHE (70%) + 3. CONTENEUR SECONDAIRE DROITE (30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Tableau des mouvements du jour (70%) */}
        <Card className="lg:col-span-7 overflow-hidden border-t-4 border-t-blue-500 dark:border-t-blue-400">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Mouvements du jour
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Arrivées et départs prévus aujourd'hui
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/bookings")}>
              Voir tout
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Logement
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Heure
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Paiement
                  </th>
                  <th className="text-right p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                      Aucun mouvement prévu aujourd'hui
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                          {m.clientName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {m.clientName}
                          </p>
                          <p className="text-xs text-slate-400">{m.bookingCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Ch. {m.roomNumber}
                      </p>
                      <p className="text-xs text-slate-400">{m.roomType}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {m.movementType === "check_in" ? (
                          <LogIn className="w-4 h-4 text-green-500" />
                        ) : (
                          <LogOut className="w-4 h-4 text-orange-500" />
                        )}
                        <span className="text-sm text-slate-700 dark:text-slate-300">{m.time}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(m.paymentStatus)}`}
                        >
                          {getPaymentStatusLabel(m.paymentStatus)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatFCFA(m.amountPaid)} / {formatFCFA(m.totalAmount)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant={m.movementType === "check_in" ? "primary" : "secondary"}
                        size="sm"
                        loading={actionLoading === m.id}
                        disabled={actionLoading === m.id}
                        onClick={() => handleMovementAction(m.id, m.movementType)}
                      >
                        {m.movementType === "check_in" ? "Check-in" : "Check-out"}
                      </Button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Donut Chart — État du parc (30%) */}
        <Card className="lg:col-span-3 p-5 border-t-4 border-t-indigo-500 dark:border-t-indigo-400">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            État du parc
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Répartition en temps réel
          </p>

          <DonutChart data={roomStatusData} />

          {/* Légende */}
          <div className="mt-6 space-y-2.5">
            {roomStatusData.map((item) => (
              <div key={item.status} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getRoomStatusChartColor(item.status) }}
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {getRoomStatusLabel(item.status)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 4. CONTENEUR INFÉRIEUR — Graphique linéaire des recettes */}
      <Card className="p-5 border-t-4 border-t-emerald-500 dark:border-t-emerald-400">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Suivi des recettes mensuelles
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Évolution des encaissements (en FCFA)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20">
              <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                {trendPercentage >= 0 ? "+" : ""}{trendPercentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <LineChart data={monthlyRevenue} />
      </Card>
    </div>
  );
}