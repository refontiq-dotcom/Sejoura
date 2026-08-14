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
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Phone,
  Mail,
  CreditCard,
  BedDouble,
  User,
  Info,
} from "lucide-react";
import {
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getRoomStatusLabel,
  getRoomStatusChartColor,
  canAccessPlanFeature,
} from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { convertXofTo, getCurrencyDecimals } from "@/lib/currencyConverter";
import { createClient } from "@/lib/supabase/client";
import { DashboardSkeletons } from "@/components/ui/skeletons";
import { AlertCircle, PlusCircle, RefreshCw, Plus } from "lucide-react";
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
  clientPhone?: string;
  clientEmail?: string;
  clientNationality?: string;
  roomNumber: string;
  roomType: string;
  accommodationName?: string;
  time: string;
  movementType: "check_in" | "check_out";
  paymentStatus: string;
  paymentMethod?: string;
  totalAmount: number;
  amountPaid: number;
  bookingStatus: string;
  checkInDate?: string;
  checkOutDate?: string;
  nightsCount?: number;
  numberOfGuests?: number;
  specialRequests?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Date locale au format YYYY-MM-DD (évite les décalages UTC de toISOString) */
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Extrait la date locale YYYY-MM-DD depuis un TIMESTAMPTZ ou une DATE */
function toLocalDateStr(value: string): string {
  if (value.length === 10) return value; // DATE simple
  const d = new Date(value);
  if (isNaN(d.getTime())) return value.slice(0, 10);
  return toLocalISODate(d);
}

/** Formate un montant sans symbole de devise (converti depuis XOF, locale fr-FR) */
function formatAmountOnly(amountInXof: number, currencyCode: string): string {
  const converted = convertXofTo(amountInXof, currencyCode);
  const decimals = getCurrencyDecimals(currencyCode);
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(converted || 0);
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
      const value = (err as Record<string, unknown>)[key];
      return `${key}: ${value}`;
    }).filter(Boolean);
    if (entries.length > 0) {
      return new Error(entries.join(" | "));
    }
  }
  return new Error(String(err ?? "Erreur inconnue"));
}

// ============================================================================
// CLIENT DRAWER — Panneau latéral détail client
// ============================================================================

function ClientDrawer({
  movement,
  onClose,
  onAction,
  actionLoading,
  fmt,
  isPastDate,
}: {
  movement: Movement;
  onClose: () => void;
  onAction: (id: string, action: "check_in" | "check_out") => Promise<boolean>;
  actionLoading: string;
  fmt: (n: number) => string;
  isPastDate: boolean;
}) {
  const paymentLabel: Record<string, string> = {
    cash: "Espèces",
    wave: "Wave",
    pi_spi: "PI-SPI",
    bank: "Virement",
    other: "Autre",
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col bg-white dark:bg-slate-800 shadow-2xl border-l border-slate-200 dark:border-slate-700 animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--primary-color,#0C1C33)] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {movement.clientName.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{movement.clientName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{movement.bookingCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Infos client */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> Informations client
            </h3>
            <div className="space-y-2">
              {movement.clientPhone && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                  <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Téléphone</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{movement.clientPhone}</p>
                  </div>
                </div>
              )}
              {movement.clientEmail && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Email</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{movement.clientEmail}</p>
                  </div>
                </div>
              )}
              {movement.clientNationality && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                  <Info className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Nationalité</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{movement.clientNationality}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Chambre */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <BedDouble className="w-3.5 h-3.5" /> Séjour
            </h3>
            <div className="p-4 rounded-xl bg-[var(--primary-muted)] border border-[var(--primary-color)]/20 space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Chambre</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">Ch. {movement.roomNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Type</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{movement.roomType}</span>
              </div>
              {movement.checkInDate && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Arrivée</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {new Date(movement.checkInDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                  </span>
                </div>
              )}
              {movement.checkOutDate && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Départ</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {new Date(movement.checkOutDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                  </span>
                </div>
              )}
              {movement.nightsCount && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Durée</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{movement.nightsCount} nuit{movement.nightsCount > 1 ? "s" : ""}</span>
                </div>
              )}
              {movement.numberOfGuests && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Voyageurs</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{movement.numberOfGuests}</span>
                </div>
              )}
            </div>
          </section>

          {/* Paiement */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5" /> Paiement
            </h3>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Montant total</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(movement.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Encaissé</span>
                <span className={`text-sm font-bold ${movement.amountPaid >= movement.totalAmount ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                  {fmt(movement.amountPaid)}
                </span>
              </div>
              {movement.paymentMethod && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Mode</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {paymentLabel[movement.paymentMethod] || movement.paymentMethod}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Statut</span>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  movement.paymentStatus === "paid"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : movement.paymentStatus === "partial"
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}>
                  {movement.paymentStatus === "paid" ? "Soldé" : movement.paymentStatus === "partial" ? "Partiel" : "Non payé"}
                </span>
              </div>
            </div>
          </section>

          {/* Demandes spéciales */}
          {movement.specialRequests && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Demandes spéciales</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800">
                {movement.specialRequests}
              </p>
            </section>
          )}
        </div>

        {/* Actions — affichées uniquement si le statut de la réservation le permet */}
        {!isPastDate &&
          ((movement.movementType === "check_in" && movement.bookingStatus === "confirmed") ||
            (movement.movementType === "check_out" && movement.bookingStatus === "checked_in")) && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              className="w-full"
              variant={movement.movementType === "check_in" ? "primary" : "secondary"}
              loading={actionLoading === movement.id}
              disabled={actionLoading === movement.id}
              onClick={async () => {
                const success = await onAction(movement.id, movement.movementType);
                if (success) onClose();
              }}
            >
              {movement.movementType === "check_in" ? (
                <><LogIn className="w-4 h-4" /> Effectuer le Check-in</>
              ) : (
                <><LogOut className="w-4 h-4" /> Effectuer le Check-out</>
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// DONUT CHART (SVG natif, sans dépendance externe)
// ============================================================================

function DonutChart({ data }: { data: RoomStatusData[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500">
        <span className="text-4xl font-bold text-slate-300">0</span>
        <span className="text-sm mt-1">Chambres</span>
      </div>
    );
  }

  const radius = 70;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  const segments = data.reduce((acc, item, index) => {
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
        strokeDashoffset={-acc.offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    );
    return {
      elements: [...acc.elements, circle],
      offset: acc.offset + dashLength,
    };
  }, { elements: [] as React.ReactNode[], offset: 0 });

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
          {segments.elements}
        </svg>
        {/* Centre */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{total}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Chambres</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LINE CHART (SVG natif)
// ============================================================================

function LineChart({ data, fmt, currencyCode }: { data: MonthlyRevenueData[]; fmt: (amount: number) => string; currencyCode: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
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
               {formatAmountOnly(line.value, currencyCode)}
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
              className={`text-xs ${hoveredIndex === i ? "fill-[var(--primary-color,#0C1C33)] font-bold" : "fill-slate-500 dark:fill-slate-400"}`}
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
                  {fmt(p.revenue)}
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
// SECTION CARD — conteneur avec bandeau d'accent coloré
// ============================================================================

function SectionCard({
  accent,
  className = "",
  children,
}: {
  accent: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`rounded-2xl shadow-[var(--shadow-md)] overflow-hidden ${className}`}>
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
      {children}
    </Card>
  );
}

// En-tête générique d'une carte de section : chip icône coloré + titre + action
function SectionHeader({
  icon,
  iconClass,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="p-4 md:p-5 border-b border-[var(--border)] flex flex-wrap items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ${iconClass}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">{title}</h2>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function DashboardPage() {
  const router = useRouter();
  const { currency, fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState("standard");
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
  const [userRole, setUserRole] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string>("");
  const [hasAccommodations, setHasAccommodations] = useState(true);
  const [error, setError] = useState(false);
  const [drawerMovement, setDrawerMovement] = useState<Movement | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalISODate(new Date()));

  const loadDashboardData = useCallback(async (isSilent = false, date?: string) => {
    if (!isSilent) setLoading(true);
    setError(false);
    try {
        const supabase = createClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(sessionError.message || "Erreur de session Supabase");
        }
        if (!sessionData?.session) {
          if (!isSilent) setLoading(false);
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("id, tenant_id, role")
          .eq("auth_user_id", sessionData.session.user.id)
          .maybeSingle();

        if (userError || !userData?.tenant_id) {
          setError(true);
          if (!isSilent) setLoading(false);
          return;
        }

        setUserId(userData.id);
        setUserRole(userData.role || "");

        const tenantId = userData.tenant_id;
        const now = new Date();
        const today = toLocalISODate(now);
        const targetDate = date || today;

        // Fenêtre de 12 mois glissants pour le graphique des recettes
        const twelveMonthsAgo = toLocalISODate(new Date(now.getFullYear(), now.getMonth() - 11, 1));

        const [subscriptionsData, bookingsData, paymentsData, cleaningTasksData, accommodationsData] =
          await Promise.all([
            supabase
              .from("subscriptions")
              .select("plan")
              .eq("tenant_id", tenantId)
              .single(),
            supabase
              .from("bookings")
              .select(`
                *,
                client:clients(*),
                room:rooms(*, room_type:room_types(*), accommodation:accommodations(name))
              `)
              .eq("tenant_id", tenantId)
              .in("status", ["confirmed", "checked_in", "checked_out", "cancelled"])
              .lte("check_in_date", targetDate)
              .gte("check_out_date", targetDate),
            supabase
              .from("payments")
              .select("amount, payment_date")
              .eq("tenant_id", tenantId)
              .gte("payment_date", `${twelveMonthsAgo}T00:00:00`),
            supabase
              .from("cleaning_tasks")
              .select("status, created_at")
              .eq("tenant_id", tenantId)
              .gte("created_at", `${targetDate}T00:00:00`)
              .lte("created_at", `${targetDate}T23:59:59.999`),
            supabase
              .from("accommodations")
              .select("id")
              .eq("tenant_id", tenantId),
          ]);

        if (subscriptionsData.error) throw new Error(subscriptionsData.error.message || "Erreur lors de la récupération de l'abonnement.");
        if (bookingsData.error) throw new Error(bookingsData.error.message || "Erreur lors de la récupération des réservations.");
        if (paymentsData.error) throw new Error(paymentsData.error.message || "Erreur lors de la récupération des paiements.");
        if (cleaningTasksData.error) throw new Error(cleaningTasksData.error.message || "Erreur lors de la récupération des tâches de ménage.");
        if (accommodationsData.error) throw new Error(accommodationsData.error.message || "Erreur lors de la récupération des établissements.");

        const planValue = (subscriptionsData.data?.plan as string | undefined) || "standard";
        setPlan(planValue);

        const bookings = (bookingsData.data || []) as unknown as (Booking & { client?: Client; room?: Room; room_type?: RoomType })[];
        const accommodations = (accommodationsData.data || []) as { id: string }[];
        const accommodationIds = accommodations.map((a) => a.id);
        
        setHasAccommodations(accommodationIds.length > 0);

        // Pas d'établissement => pas de chambres : on évite la requête avec un UUID factice
        let rooms: { status: string }[] = [];
        if (accommodationIds.length > 0) {
          const roomsDataResult = await supabase
            .from("rooms")
            .select("status")
            .in("accommodation_id", accommodationIds);
          if (roomsDataResult.error) throw new Error(roomsDataResult.error.message || "Erreur lors de la récupération des chambres.");
          rooms = (roomsDataResult.data || []) as unknown as { status: string }[];
        }
        const payments = (paymentsData.data || []) as unknown as { amount: number; payment_date: string }[];
        const cleaningTasks = (cleaningTasksData.data || []) as unknown as { status: string }[];

        const targetBookings = bookings.filter((b) => {
          return b.check_in_date === targetDate || b.check_out_date === targetDate;
        });

        const expectedCheckins = bookings.filter(
          (b) => b.check_in_date === targetDate && b.status === "confirmed"
        ).length;
        const expectedCheckouts = bookings.filter(
          (b) => b.check_out_date === targetDate && b.status === "checked_in"
        ).length;

        // payment_date est un TIMESTAMPTZ : on compare la date locale, pas la chaîne brute
        const targetPayments = payments.filter(
          (p) => toLocalDateStr(p.payment_date) === targetDate
        );
        const dailyRevenue = targetPayments.reduce((sum, p) => sum + p.amount, 0);

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

        // Une réservation arrivant ET repartant le jour cible génère deux mouvements distincts
        const movements: Movement[] = targetBookings.flatMap((b) => {
          const base = {
            bookingCode: b.booking_code,
            clientName: b.client?.full_name || "—",
            clientPhone: b.client?.phone || undefined,
            clientEmail: b.client?.email || undefined,
            clientNationality: b.client?.nationality || undefined,
            roomNumber: b.room?.room_number || "—",
            roomType: b.room_type?.name || "—",
            accommodationName: (b.room as unknown as { accommodation?: { name?: string } })?.accommodation?.name || undefined,
            paymentStatus: b.payment_status,
            paymentMethod: (b as unknown as Record<string, unknown>).payment_method as string | undefined,
            totalAmount: b.total_amount,
            amountPaid: b.amount_paid,
            bookingStatus: b.status,
            checkInDate: b.check_in_date,
            checkOutDate: b.check_out_date,
            nightsCount: b.nights_count,
            numberOfGuests: b.number_of_guests,
            specialRequests: b.special_requests || undefined,
          };
          const entries: Movement[] = [];
          if (b.check_in_date === targetDate) {
            entries.push({
              ...base,
              id: `${b.id}-in`,
              time: b.check_in_time || "14:00",
              movementType: "check_in",
            });
          }
          if (b.check_out_date === targetDate) {
            entries.push({
              ...base,
              id: `${b.id}-out`,
              time: b.check_out_time || "11:00",
              movementType: "check_out",
            });
          }
          return entries;
        });

        // Tri chronologique (départs le matin avant les arrivées de l'après-midi)
        movements.sort((a, b) => a.time.localeCompare(b.time));

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

        // Clés YYYY-MM pour éviter les collisions de libellés entre années (ex. "janv." 2025 vs 2026)
        const monthMap: Record<string, number> = {};
        const currentKeys: string[] = [];
        const prevKeys: string[] = [];
        const labelByKey: Record<string, string> = {};

        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          currentKeys.push(key);
          labelByKey[key] = d.toLocaleString("fr-FR", { month: "short" });
        }
        for (let i = 11; i >= 6; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          prevKeys.push(key);
          labelByKey[key] = d.toLocaleString("fr-FR", { month: "short" });
        }

        payments.forEach((p) => {
          const key = toLocalDateStr(p.payment_date).slice(0, 7);
          if (currentKeys.includes(key) || prevKeys.includes(key)) {
            monthMap[key] = (monthMap[key] || 0) + p.amount;
          }
        });

        const monthlyData: MonthlyRevenueData[] = currentKeys.map((key) => ({
          month: labelByKey[key],
          revenue: monthMap[key] || 0,
        }));
        setMonthlyRevenue(monthlyData);

        const currentTotal = currentKeys.reduce((sum, k) => sum + (monthMap[k] || 0), 0);
        const previousTotal = prevKeys.reduce((sum, k) => sum + (monthMap[k] || 0), 0);
        const trend = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
        setTrendPercentage(trend);
      } catch (err) {
        setError(true);
        const normalizedError = normalizeUnknownError(err);
        console.error(normalizedError, err);
      } finally {
        if (!isSilent) setLoading(false);
      }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    // setTimeout(0) : évite un setState synchrone dans le corps de l'effet (eslint)
    const initialLoad = setTimeout(() => {
      if (!cancelled) loadDashboardData(false, selectedDate);
    }, 0);

    // Polling silencieux toutes les 30 s, sans chevauchement de requêtes
    const interval = setInterval(async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await loadDashboardData(true, selectedDate);
      } finally {
        inFlight = false;
      }
    }, 30000);

    return () => {
      cancelled = true;
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadDashboardData, selectedDate]);

  function handleDateChange(newDate: string) {
    setSelectedDate(newDate);
  }

  function shiftDate(days: number) {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    handleDateChange(toLocalISODate(d));
  }

  const todayStr = toLocalISODate(new Date());
  const isToday = selectedDate === todayStr;
  const isPastDate = selectedDate < todayStr;
  const isReceptionniste = userRole === "receptionniste";
  const formattedSelectedDate = new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  async function handleMovementAction(movementId: string, action: "check_in" | "check_out"): Promise<boolean> {
    // L'id du mouvement est suffixé ("<bookingId>-in" / "<bookingId>-out")
    const bookingId = movementId.replace(/-(in|out)$/, "");
    setActionLoading(movementId);
    try {
      const supabase = createClient();
      const rpcName = action === "check_in" ? "check_in_booking" : "check_out_booking";
      const { error: rpcErr } = await supabase.rpc(rpcName, {
        p_booking_id: bookingId,
        p_user_id: userId,
      });

      if (rpcErr) {
        // La RPC applique les gardes de statut et écrit dans audit_logs : on ne la contourne pas
        toast.error("Impossible d'effectuer l'action : " + rpcErr.message);
        return false;
      }

      toast.success(action === "check_in" ? "Check-in effectué avec succès ✓" : "Check-out effectué avec succès ✓");
      loadDashboardData(true, selectedDate);
      return true;
    } catch {
      toast.error("Une erreur est survenue lors de l'action.");
      return false;
    } finally {
      setActionLoading("");
    }
  }

  if (loading) {
    return <DashboardSkeletons />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-3 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Erreur de chargement</h2>
        <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Une erreur est survenue lors de la récupération de vos données.</p>
        <Button onClick={() => loadDashboardData(false, selectedDate)} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Réessayer
        </Button>
      </div>
    );
  }

  if (!hasAccommodations) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-3 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-[var(--primary-muted)] flex items-center justify-center mb-2">
          <Sparkles className="w-10 h-10 text-[var(--primary-color,#0C1C33)]" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white text-center">Bienvenue sur Séjoura !</h2>
        <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500 max-w-md text-center">
          {"Pour commencer à utiliser votre tableau de bord, vous devez d'abord créer votre premier établissement et y ajouter des chambres."}
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
    <div className={isReceptionniste ? "space-y-2 animate-fade-in" : "space-y-3 animate-fade-in"}>
      {/* 0. SÉLECTEUR DE DATE (discret) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
        <div className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary-color)]/10 text-[var(--primary-color,#0C1C33)] dark:text-white flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 capitalize">{formattedSelectedDate}</p>
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {isToday
                ? "Aujourd'hui"
                : isPastDate
                  ? "Activités passées"
                  : "Activités à venir"}
            </p>
          </div>
        </div>

        {isReceptionniste && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => router.push("/dashboard/bookings?new=1")}
          >
            <Plus className="w-4 h-4" /> Réservation rapide
          </Button>
        )}

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-sm">
          <button
            onClick={() => shiftDate(-1)}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-[var(--surface-muted)] hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Jour précédent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && handleDateChange(e.target.value)}
            className="px-2 py-1.5 rounded-lg border-0 bg-transparent text-xs font-semibold text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--primary-color,#0C1C33)] transition-all"
          />
          <button
            onClick={() => shiftDate(1)}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-[var(--surface-muted)] hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Jour suivant"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isToday && (
            <button
              onClick={() => handleDateChange(toLocalISODate(new Date()))}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--primary-color,#0C1C33)] hover:bg-[var(--primary-muted)] transition-colors"
            >
              {"Aujourd'hui"}
            </button>
          )}
        </div>
      </div>

      {/* 1. BARRE DE CARTES SPÉCIALES — 4 KPIs */}
      {isReceptionniste ? (
        /* ── Vue Réceptionniste : 4 KPIs colorés, compacts et opérationnels ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* KPI: Arrivées prévues */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-emerald-50 to-teal-100/70 dark:from-emerald-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-emerald-100 dark:ring-emerald-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-emerald-500/20 ring-1 ring-emerald-500/20 text-emerald-600 dark:text-emerald-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <LogIn className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.expectedCheckins}</p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">Arrivées prévues</p>
              </div>
            </div>
          </Card>

          {/* KPI: Départs prévus */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-orange-50 to-amber-100/70 dark:from-orange-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-orange-100 dark:ring-orange-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-orange-500/20 ring-1 ring-orange-500/20 text-orange-600 dark:text-orange-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.expectedCheckouts}</p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">Départs prévus</p>
              </div>
            </div>
          </Card>

          {/* KPI: Chambres à nettoyer */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-amber-50 to-yellow-100/70 dark:from-amber-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-amber-100 dark:ring-amber-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-amber-500/20 ring-1 ring-amber-500/20 text-amber-600 dark:text-amber-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.cleaningPending}</p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">Chambres à nettoyer</p>
              </div>
            </div>
          </Card>

          {/* KPI: Taux d'occupation */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-blue-50 to-sky-100/70 dark:from-blue-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-blue-100 dark:ring-blue-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-blue-500/20 ring-1 ring-blue-500/20 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.occupancyRate}%</p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">{"Taux d'occupation"}</p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        /* ── Vue Admin : 4 KPIs colorés, chacun avec son identité visuelle ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Taux d'occupation — Bleu */}
          <Card className="p-5 rounded-2xl border-0 bg-gradient-to-br from-blue-50 to-sky-100/60 dark:from-blue-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-blue-100 dark:ring-blue-900/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/80 dark:bg-blue-500/20 ring-1 ring-blue-500/20 text-blue-600 dark:text-blue-300 flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <Badge variant="info">{isToday ? "Aujourd'hui" : isPastDate ? "Passé" : "À venir"}</Badge>
              </div>
              <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 mb-1">{"Taux d'occupation"}</p>
              <p className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.occupancyRate}%</p>
            </div>
            <div className="mt-4">
              <div className="h-2 bg-white/70 dark:bg-slate-800/80 rounded-full overflow-hidden ring-1 ring-blue-500/10">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-sky-500 rounded-full transition-all"
                  style={{ width: `${kpis.occupancyRate}%` }}
                />
              </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Pourcentage de chambres occupées</p>
            </div>
          </Card>

          {/* KPI 2: Encaissements du jour — Émeraude */}
          <Card className="p-5 rounded-2xl border-0 bg-gradient-to-br from-emerald-50 to-teal-100/60 dark:from-emerald-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-emerald-100 dark:ring-emerald-900/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/80 dark:bg-emerald-500/20 ring-1 ring-emerald-500/20 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shadow-sm">
                  <Wallet className="w-5 h-5" />
                </div>
                <Badge variant="success">{currency.code}</Badge>
              </div>
              <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Encaissements</p>
              <p className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                {formatAmountOnly(kpis.dailyRevenue, currency.code)}
              </p>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-4">
              {isToday ? `${currency.symbol} encaissés aujourd'hui` : `${currency.symbol} encaissés le ${new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
            </p>
          </Card>

          {/* KPI 3: Entrées / Sorties prévues — Orange */}
          <Card className="p-5 rounded-2xl border-0 bg-gradient-to-br from-orange-50 to-amber-100/60 dark:from-orange-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-orange-100 dark:ring-orange-900/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/80 dark:bg-orange-500/20 ring-1 ring-orange-500/20 text-orange-600 dark:text-orange-300 flex items-center justify-center shadow-sm">
                  <LogIn className="w-5 h-5" />
                </div>
                <Badge variant="warning">{isToday ? "Aujourd'hui" : isPastDate ? "Passé" : "À venir"}</Badge>
              </div>
              <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Mouvements</p>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="flex items-center gap-1.5">
                    <LogIn className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.expectedCheckins}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Arrivées</p>
                </div>
                <div className="w-px h-9 bg-white/80 dark:bg-slate-700/80" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <LogOut className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.expectedCheckouts}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Départs</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-4">
              {isToday ? "Arrivées et départs prévus" : "Arrivées et départs enregistrés"}
            </p>
          </Card>

          {/* KPI 4: État Ménage — Violet */}
          <Card className="p-5 rounded-2xl border-0 bg-gradient-to-br from-violet-50 to-purple-100/60 dark:from-violet-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-violet-100 dark:ring-violet-900/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/80 dark:bg-violet-500/20 ring-1 ring-violet-500/20 text-violet-600 dark:text-violet-300 flex items-center justify-center shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <Badge variant="purple">Ménage</Badge>
              </div>
              <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 mb-1">État du ménage</p>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.cleaningPending}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">À nettoyer</p>
                </div>
                <div className="w-px h-9 bg-white/80 dark:bg-slate-700/80" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.cleaningDone}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Prêtes</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-4">Statut de propreté des chambres</p>
          </Card>
        </div>
      )}

      {/* 2. CONTENEUR PRINCIPAL — Mouvements du jour */}
      {isReceptionniste ? (
        /* ── Vue Réceptionniste : Mouvements en pleine largeur avec actions rapides ── */
        <SectionCard accent="from-blue-500 via-indigo-500 to-violet-500">
          <SectionHeader
            icon={<LogIn className="w-5 h-5" />}
            iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-blue-500/20"
            title={isToday ? "Mouvements du jour" : isPastDate ? "Activités passées" : "Activités à venir"}
            subtitle={isToday
              ? "Arrivées et départs prévus aujourd'hui"
              : `Arrivées et départs du ${new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`}
            action={
              <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/bookings")}>
                Voir tout
                <ArrowRight className="w-4 h-4" />
              </Button>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    Client
                  </th>
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    Logement
                  </th>
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    Heure
                  </th>
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    Paiement
                  </th>
                  <th className="text-right p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-600 dark:text-slate-300 text-sm font-medium">
                      {isToday
                        ? "Aucun mouvement prévu aujourd'hui"
                        : isPastDate
                          ? "Aucune activité enregistrée pour cette date"
                          : "Aucune activité prévue pour cette date"}
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-[var(--surface-hover)] transition-colors"
                  >
                     <td className="p-2.5">
                       <div className="flex items-center gap-2.5">
                         <div className="w-7 h-7 rounded-full bg-[var(--primary-color,#0C1C33)] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                           {m.clientName.charAt(0)}
                         </div>
                         <div>
                           <p className="text-sm font-semibold text-slate-900 dark:text-white">
                             {m.clientName}
                           </p>
                           <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{m.bookingCode}</p>
                         </div>
                       </div>
                     </td>
                     <td className="p-2.5">
                       <p className="text-sm font-semibold text-slate-900 dark:text-white">
                         Ch. {m.roomNumber}
                       </p>
                       <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{m.roomType}</p>
                     </td>
                     <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        {m.movementType === "check_in" ? (
                          <LogIn className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <LogOut className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                        )}
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{m.time}</span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${getPaymentStatusColor(m.paymentStatus)}`}
                        >
                          {getPaymentStatusLabel(m.paymentStatus)}
                        </span>
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          {fmt(m.amountPaid)} / {fmt(m.totalAmount)}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isPastDate &&
                          ((m.movementType === "check_in" && m.bookingStatus === "confirmed") ||
                            (m.movementType === "check_out" && m.bookingStatus === "checked_in")) && (
                          <Button
                            variant={m.movementType === "check_in" ? "primary" : "secondary"}
                            size="sm"
                            loading={actionLoading === m.id}
                            disabled={actionLoading === m.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMovementAction(m.id, m.movementType);
                            }}
                          >
                            {m.movementType === "check_in" ? "Check-in" : "Check-out"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDrawerMovement(m)}
                        >
                          Détails
                        </Button>
                      </div>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        /* ── Vue Admin : 70% mouvements + 30% donut ── */
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
          {/* Tableau des mouvements (70%) */}
          <SectionCard accent="from-blue-500 via-indigo-500 to-violet-500" className="lg:col-span-7">
            <SectionHeader
              icon={<LogIn className="w-5 h-5" />}
              iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-blue-500/20"
              title={isToday ? "Mouvements du jour" : isPastDate ? "Activités passées" : "Activités à venir"}
              subtitle={isToday
                ? "Arrivées et départs prévus aujourd'hui"
                : `Arrivées et départs du ${new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`}
              action={
                <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/bookings")}>
                  Voir tout
                  <ArrowRight className="w-4 h-4" />
                </Button>
              }
            />

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                    <th className="text-left p-4 text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                      Client
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                      Logement
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                      Heure
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                      Paiement
                    </th>
                    <th className="text-right p-4 text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-600 dark:text-slate-300 text-sm font-medium">
                        {isToday
                          ? "Aucun mouvement prévu aujourd'hui"
                          : isPastDate
                            ? "Aucune activité enregistrée pour cette date"
                            : "Aucune activité prévue pour cette date"}
                      </td>
                    </tr>
                  ) : (
                    movements.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                      onClick={() => setDrawerMovement(m)}
                    >
                       <td className="p-3">
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-[var(--primary-color,#0C1C33)] flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                             {m.clientName.charAt(0)}
                           </div>
                           <div>
                             <p className="text-sm font-semibold text-slate-900 dark:text-white">
                               {m.clientName}
                             </p>
                             <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{m.bookingCode}</p>
                           </div>
                         </div>
                       </td>
                       <td className="p-3">
                         <p className="text-sm font-semibold text-slate-900 dark:text-white">
                           Ch. {m.roomNumber}
                         </p>
                         <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{m.roomType}</p>
                       </td>
                       <td className="p-3">
                        <div className="flex items-center gap-2">
                          {m.movementType === "check_in" ? (
                            <LogIn className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <LogOut className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          )}
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{m.time}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getPaymentStatusColor(m.paymentStatus)}`}
                          >
                            {getPaymentStatusLabel(m.paymentStatus)}
                          </span>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {fmt(m.amountPaid)} / {fmt(m.totalAmount)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        {isPastDate ||
                        !(
                          (m.movementType === "check_in" && m.bookingStatus === "confirmed") ||
                          (m.movementType === "check_out" && m.bookingStatus === "checked_in")
                        ) ? (
                          <Badge variant={m.bookingStatus === "checked_out" ? "success" : m.bookingStatus === "cancelled" ? "error" : "info"}>
                            {m.bookingStatus === "checked_out" ? "Terminé" : m.bookingStatus === "cancelled" ? "Annulé" : m.bookingStatus === "checked_in" ? "Sur place" : "Confirmé"}
                          </Badge>
                        ) : (
                          <Button
                            variant={m.movementType === "check_in" ? "primary" : "secondary"}
                            size="sm"
                            loading={actionLoading === m.id}
                            disabled={actionLoading === m.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMovementAction(m.id, m.movementType);
                            }}
                          >
                            {m.movementType === "check_in" ? "Check-in" : "Check-out"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Donut Chart — État du parc (30%) */}
          <SectionCard accent="from-violet-500 via-purple-500 to-fuchsia-500" className="lg:col-span-3">
            <SectionHeader
              icon={<Sparkles className="w-5 h-5" />}
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-300 ring-violet-500/20"
              title="État du parc"
              subtitle="Répartition en temps réel"
            />

            <div className="p-4 md:p-5">
              <DonutChart data={roomStatusData} />

              {/* Légende */}
              <div className="mt-5 space-y-2.5">
                {roomStatusData.map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full ring-2 ring-white/60 dark:ring-slate-800"
                        style={{ backgroundColor: getRoomStatusChartColor(item.status) }}
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {getRoomStatusLabel(item.status)}
                      </span>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {!isReceptionniste && !canAccessPlanFeature(plan, "advancedAccounting") && (
        <Card className="p-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Fonctionnalités Entreprise disponibles</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">La comptabilité avancée, le boost Trouvetou et l’API Séjoura sont réservés à la formule Entreprise.</p>
            </div>
            <Button variant="primary" onClick={() => router.push("/dashboard/subscription")}>Passer à la formule Entreprise</Button>
          </div>
        </Card>
      )}

      {/* 4. CONTENEUR INFÉRIEUR — Graphique linéaire des recettes (réservé aux admins) */}
      {!isReceptionniste && (
        <SectionCard accent="from-emerald-500 via-teal-500 to-cyan-500">
          <SectionHeader
            icon={<Wallet className="w-5 h-5" />}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-500/20"
            title="Suivi des recettes mensuelles"
            subtitle={`Évolution des encaissements (en ${currency.symbol})`}
            action={
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-emerald-500/20">
                <TrendingUp className={`w-4 h-4 ${trendPercentage >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`} />
                <span className={`text-sm font-bold tabular-nums ${trendPercentage >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
                  {trendPercentage >= 0 ? "+" : ""}{trendPercentage.toFixed(1)}%
                </span>
              </div>
            }
          />

          <div className="p-4 md:p-5">
            <LineChart data={monthlyRevenue} fmt={fmt} currencyCode={currency.code} />
          </div>
        </SectionCard>
      )}
      {drawerMovement && (
        <ClientDrawer
          movement={drawerMovement}
          onClose={() => setDrawerMovement(null)}
          onAction={handleMovementAction}
          actionLoading={actionLoading}
          fmt={fmt}
          isPastDate={isPastDate}
        />
      )}
    </div>
  );
}