"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Phone,
  Mail,
  CreditCard,
  BedDouble,
  User,
  Info,
  Globe,
  Calendar,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getRoomStatusLabel,
  getRoomStatusChartColor,
  getPaymentMethodLabel,
  canAccessPlanFeature,
  isBookingOverdue,
} from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { useAccommodation } from "@/hooks/use-accommodation";
import { useLanguage } from "@/hooks/use-language";
import { translations, type Lang } from "@/lib/translations";
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
  clientIncomplete?: boolean;
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

/** Formate un montant sans symbole de devise (converti depuis XOF) */
function formatAmountOnly(amountInXof: number, currencyCode: string, lang: Lang = "fr"): string {
  const converted = convertXofTo(amountInXof, currencyCode);
  const decimals = getCurrencyDecimals(currencyCode);
  return new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .format(converted || 0)
    .replace(/[\u202F\u00A0]/g, " ");
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
  const { lang } = useLanguage();
  const dt = (translations[lang] ?? translations["fr"]).dashboard;
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (!portalTarget) return null;

  return createPortal(
    <>
      {/* Overlay — hidden on mobile, visible on desktop */}
      <div
        className="hidden lg:block fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
        onClick={onClose}
      />

      {/* Drawer — fullscreen mobile, right drawer desktop */}
      <div className="fixed inset-0 z-[60] flex w-full h-full lg:inset-y-0 lg:inset-x-auto lg:right-0 lg:top-auto lg:bottom-auto lg:w-[480px] lg:h-full lg:max-h-none lg:rounded-none transform transition-transform duration-300 ease-in-out">
        <div className="relative h-full w-full overflow-y-auto bg-white dark:bg-slate-800 lg:rounded-none border-b border-slate-200 dark:border-slate-700 lg:border-l lg:border-b-0 shadow-2xl flex flex-col">

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

          <div className="flex-1 p-3 space-y-3">
          {/* Infos client */}
          <section>
              <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
               <User className="w-3.5 h-3.5" /> {dt.clientInfo}
             </h3>
            <div className="space-y-2">
              {movement.clientPhone && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                  <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                  <div>
                     <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.phone}</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{movement.clientPhone}</p>
                  </div>
                </div>
              )}
              {movement.clientEmail && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                  <div>
                     <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.email}</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{movement.clientEmail}</p>
                  </div>
                </div>
              )}
              {movement.clientNationality && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                  <Info className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                  <div>
                     <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.nationality}</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{movement.clientNationality}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Chambre */}
          <section>
              <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
               <BedDouble className="w-3.5 h-3.5" /> {dt.stay}
             </h3>
            <div className="p-4 rounded-xl bg-[var(--primary-muted)] border border-[var(--primary-color)]/20 space-y-3">
              <div className="flex justify-between">
                 <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.room}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">Ch. {movement.roomNumber}</span>
              </div>
              <div className="flex justify-between">
                 <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.roomType}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{movement.roomType}</span>
              </div>
              {movement.checkInDate && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.arrival}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                     {new Date(movement.checkInDate + "T00:00:00").toLocaleDateString(lang, { day: "numeric", month: "long" })}
                  </span>
                </div>
              )}
              {movement.checkOutDate && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.departure}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                     {new Date(movement.checkOutDate + "T00:00:00").toLocaleDateString(lang, { day: "numeric", month: "long" })}
                  </span>
                </div>
              )}
              {movement.nightsCount && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.duration}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{movement.nightsCount} {dt.nights}{movement.nightsCount > 1 ? (lang === "en" ? "s" : "s") : ""}</span>
                </div>
              )}
              {movement.numberOfGuests && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.guests}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{movement.numberOfGuests}</span>
                </div>
              )}
            </div>
          </section>

          {/* Paiement */}
          <section>
              <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
               <CreditCard className="w-3.5 h-3.5" /> {dt.payment}
             </h3>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-3">
              <div className="flex justify-between">
                 <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.totalAmount}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(movement.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                 <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.collected}</span>
                <span className={`text-sm font-bold ${movement.amountPaid >= movement.totalAmount ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                  {fmt(movement.amountPaid)}
                </span>
              </div>
              {movement.paymentMethod && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.method}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                     {getPaymentMethodLabel(movement.paymentMethod, lang)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between">
                 <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{dt.status}</span>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  movement.paymentStatus === "paid"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : movement.paymentStatus === "partial"
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}>
                   {movement.paymentStatus === "paid" ? dt.paid : movement.paymentStatus === "partial" ? dt.partial : dt.unpaid}
                </span>
              </div>
            </div>
          </section>

          {/* Demandes spéciales */}
          {movement.specialRequests && (
            <section>
               <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">{dt.specialRequests}</h3>
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
              disabled={actionLoading === movement.id || (movement.movementType === "check_in" && movement.clientIncomplete)}
              title={movement.movementType === "check_in" && movement.clientIncomplete ? "Complétez la fiche client (CNI/Passeport) avant de procéder au check-in" : undefined}
              onClick={async () => {
                const success = await onAction(movement.id, movement.movementType);
                if (success) onClose();
              }}
            >
              {movement.movementType === "check_in" ? (
                <><LogIn className="w-4 h-4" /> {dt.checkInAction}</>
              ) : (
                <><LogOut className="w-4 h-4" /> {dt.checkOutAction}</>
              )}
            </Button>
          </div>
        )}
        </div>
      </div>
    </>,
    portalTarget
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

function LineChart({ data, fmt, currencyCode, lang }: { data: MonthlyRevenueData[]; fmt: (amount: number) => string; currencyCode: string; lang: Lang }) {
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
               {formatAmountOnly(line.value, currencyCode, lang)}
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
// SECTION CARD — conteneur raffiné, bordure uniforme sur les 4 côtés
// ============================================================================

function SectionCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-[var(--border-card)] bg-[var(--card-bg,var(--surface))] shadow-[var(--shadow-md)] overflow-hidden ${className}`}>
      {children}
    </div>
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
    <div className="p-4 md:p-5 border-b border-[var(--border-card)] flex flex-wrap items-center gap-3">
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
// MOUVEMENTS — VUE MOBILE (cartes, < 1024px)
// Version desktop (tableau) inchangée : le mobile empile chaque mouvement en
// carte tactile, priorité à l'action principale (check-in/out) et au détail.
// ============================================================================

function MovementCardList({
  movements,
  onAction,
  actionLoading,
  onOpenDetails,
  fmt,
  isPastDate,
  isToday,
}: {
  movements: Movement[];
  onAction: (id: string, action: "check_in" | "check_out") => Promise<boolean>;
  actionLoading: string;
  onOpenDetails: (m: Movement) => void;
  fmt: (n: number) => string;
  isPastDate: boolean;
  isToday: boolean;
}) {
  const { lang } = useLanguage();
  const dt = (translations[lang] ?? translations["fr"]).dashboard;
  return (
    <div className="md:hidden grid grid-cols-2 gap-2.5 p-2.5">
      {movements.length === 0 ? (
        <div className="col-span-2 p-6 text-center text-slate-600 dark:text-slate-300 text-sm font-medium">
          {isToday
            ? dt.noMovementsToday
            : isPastDate
              ? dt.noMovementsPast
              : dt.noMovementsFuture}
        </div>
      ) : (
        movements.map((m) => {
          const canAct =
            !isPastDate &&
            ((m.movementType === "check_in" && m.bookingStatus === "confirmed") ||
              (m.movementType === "check_out" && m.bookingStatus === "checked_in"));
          const isIn = m.movementType === "check_in";
          return (
            <div
              key={m.id}
              onClick={() => onOpenDetails(m)}
              className={`rounded-2xl border bg-[var(--card-bg,var(--surface))] shadow-[var(--shadow-sm)] overflow-hidden min-w-0 ${
                isIn ? "border-emerald-200 dark:border-emerald-900/50" : "border-orange-200 dark:border-orange-900/50"
              }`}
            >
              {/* En-tête client */}
              <div className="flex items-center gap-2 p-2.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 ${
                    isIn ? "bg-emerald-500" : "bg-orange-500"
                  }`}
                >
                  {m.clientName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{m.clientName}</p>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">{m.bookingCode}</p>
                </div>
              </div>

              {/* Badge heure */}
              <div className="px-2.5 pb-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                    isIn
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                  }`}
                >
                  {isIn ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                  {m.time}
                </span>
              </div>

              {/* Détails chambre + paiement */}
              <div className="px-2.5 pb-2 space-y-1.5">
                <div className="p-2 rounded-xl bg-[var(--surface-muted)]">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{dt.movements.accommodation}</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Ch. {m.roomNumber}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{m.roomType}</p>
                </div>
                <div className="p-2 rounded-xl bg-[var(--surface-muted)]">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{dt.movements.payment}</p>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${getPaymentStatusColor(m.paymentStatus)}`}>
                    {getPaymentStatusLabel(m.paymentStatus, lang)}
                  </span>
                  <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                    {fmt(m.amountPaid)} / {fmt(m.totalAmount)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 p-2.5 border-t border-[var(--border-subtle)]">
                {canAct ? (
                  <Button
                    variant={isIn ? "primary" : "secondary"}
                    size="sm"
                    className="flex-1"
                    loading={actionLoading === m.id}
                    disabled={actionLoading === m.id || (isIn && m.clientIncomplete)}
                    title={isIn && m.clientIncomplete ? "Complétez la fiche client (CNI/Passeport) avant de procéder au check-in" : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(m.id, m.movementType);
                    }}
                  >
                    {isIn ? <LogIn className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                    <span className="sr-only sm:not-sr-only">
                      {isIn ? dt.checkInAction : dt.checkOutAction}
                    </span>
                  </Button>
                ) : (
                  <span className="flex-1 text-[10px] font-medium text-slate-400 truncate">
                    {m.bookingStatus === "checked_out" ? dt.completed : m.bookingStatus === "cancelled" ? dt.cancelled : m.bookingStatus === "checked_in" ? dt.onSite : dt.confirmed}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpenDetails(m); }}>
                  {dt.details}
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function DashboardPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = (translations[lang] ?? translations["fr"]).dashboard;
  const { currency, fmt } = useCurrency();
  const { activeAccommodationId } = useAccommodation();
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
  const [tenantId, setTenantId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string>("");
  const [hasAccommodations, setHasAccommodations] = useState(true);
  const [error, setError] = useState(false);
  const loadRetriesRef = useRef(0);
  const dashboardLoadedRef = useRef(false);
  const [overstayCount, setOverstayCount] = useState(0);
  const [onlineBookingCount, setOnlineBookingCount] = useState(0);
  const [overstayBookings, setOverstayBookings] = useState<Array<{
    id: string; bookingCode: string; clientName: string; roomNumber: string;
    accommodationName: string; checkOutDate: string; daysOverdue: number;
  }>>([]);
  const [onlineBookingsList, setOnlineBookingsList] = useState<Array<{
    id: string; bookingCode: string; clientName: string; roomNumber: string;
    accommodationName: string; checkInDate: string; checkOutDate: string;
    totalAmount: number; numberOfGuests: number; createdAt: string;
  }>>([]);
  const [overstayExpanded, setOverstayExpanded] = useState(false);
  const [onlineExpanded, setOnlineExpanded] = useState(false);
  const [bannerActionLoading, setBannerActionLoading] = useState<string>("");
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
          // Après l'étape 2 (onboarding), le profil peut prendre quelques secondes
          // à être visible côté client après la création par service_role.
          // On retry en silence sans bloquer l'utilisateur.
          if (!isSilent && loadRetriesRef.current < 10) {
            loadRetriesRef.current += 1;
            const delay = 1000 + loadRetriesRef.current * 500;
            setTimeout(() => loadDashboardData(false, date), delay);
            return;
          }
          // Après tous les retries, afficher le dashboard vide (plan free)
          // au lieu d'un écran d'erreur bloquant.
          console.warn("loadDashboardData: user data not available after retries, showing empty dashboard");
          // Afficher le dashboard vide sans données utilisateur
          setHasAccommodations(false);
          if (!isSilent) setLoading(false);
          return;
        }

        setUserId(userData.id);
        setUserRole(userData.role || "");
        setTenantId(userData.tenant_id);

        const tenantId = userData.tenant_id;
        const now = new Date();
        const today = toLocalISODate(now);
        const targetDate = date || today;

        // Détection intelligente des dépassements de séjour (alerte + auto
        // check-out après délai de grâce). Exécutée régulièrement ici (30 s)
        // et couverte par le cron pg_cron.
        (async () => {
          try {
            await supabase.rpc("check_overstays", {
              p_alert_after_minutes: 0,
              p_auto_checkout_after_minutes: 120,
            });
          } catch {
            // Silencieux : l'échec ne doit pas bloquer l'affichage
          }
        })();

        // Fenêtre de 12 mois glissants pour le graphique des recettes
        const twelveMonthsAgo = toLocalISODate(new Date(now.getFullYear(), now.getMonth() - 11, 1));

        const [subscriptionsData, bookingsData, paymentsData, cleaningTasksData, accommodationsData] =
          await Promise.all([
            supabase
              .from("subscriptions")
              .select("plan")
              .eq("tenant_id", tenantId)
              .maybeSingle(),
            (() => {
              let bookingsQuery = supabase
                .from("bookings")
                .select(`
                  id,
                  booking_code,
                  check_in_date,
                  check_in_time,
                  check_out_date,
                  check_out_time,
                  payment_status,
                  payment_method,
                  total_amount,
                  amount_paid,
                  status,
                  nights_count,
                  number_of_guests,
                  special_requests,
                  is_overstay,
                  accommodation_id,
                  client:clients(full_name, phone, email, nationality, id_number),
                  room:rooms(room_number, room_type:room_types(name), accommodation:accommodations(name))
                `)
                .eq("tenant_id", tenantId)
                .in("status", ["confirmed", "checked_in", "checked_out", "cancelled"])
                .lte("check_in_date", targetDate)
                .gte("check_out_date", targetDate);
              // Filtrer par résidence active (multi-résidences)
              if (activeAccommodationId) {
                bookingsQuery = bookingsQuery.eq("accommodation_id", activeAccommodationId);
              }
              return bookingsQuery;
            })(),
            (() => {
              let paymentsQuery = supabase
                .from("payments")
                .select("amount, payment_date")
                .eq("tenant_id", tenantId)
                .gte("payment_date", `${twelveMonthsAgo}T00:00:00`);
              // Filtrer par résidence active (multi-résidences) : le filtrage est
              // fait en base via payments.accommodation_id, pas côté client.
              if (activeAccommodationId) {
                paymentsQuery = paymentsQuery.eq("accommodation_id", activeAccommodationId);
              }
              return paymentsQuery;
            })(),
            (() => {
              let cleaningQuery = supabase
                .from("cleaning_tasks")
                .select("status, created_at")
                .eq("tenant_id", tenantId)
                .gte("created_at", `${targetDate}T00:00:00`)
                .lte("created_at", `${targetDate}T23:59:59.999`);
              if (activeAccommodationId) {
                cleaningQuery = cleaningQuery.eq("accommodation_id", activeAccommodationId);
              }
              return cleaningQuery;
            })(),
            supabase
              .from("accommodations")
              .select("id")
              .eq("tenant_id", tenantId),
          ]);

        // Les erreurs sur les requêtes secondaires (bookings, payments, etc.)
        // ne doivent PAS bloquer l'affichage du dashboard. Pour un tout nouvel
        // utilisateur après l'étape 2, les données créées par service_role
        // peuvent prendre quelques secondes à être visibles côté client (RLS).
        // On log les erreurs et on utilise des tableaux vides en fallback.
        if (subscriptionsData.error) {
          console.warn("subscriptions query error (will retry):", subscriptionsData.error.message);
          if (!isSilent && loadRetriesRef.current < 5) {
            loadRetriesRef.current += 1;
            setTimeout(() => loadDashboardData(false, date), 2000);
            return;
          }
        }
        if (bookingsData.error) console.warn("bookings query error:", bookingsData.error.message);
        if (paymentsData.error) console.warn("payments query error:", paymentsData.error.message);
        if (cleaningTasksData.error) console.warn("cleaning_tasks query error:", cleaningTasksData.error.message);
        if (accommodationsData.error) console.warn("accommodations query error:", accommodationsData.error.message);

        const planValue = (subscriptionsData.data?.plan as string | undefined) || "free";
        setPlan(planValue);

        const bookings = (bookingsData.data || []) as unknown as (Booking & { client?: Client; room?: Room; room_type?: RoomType })[];
        const accommodations = (accommodationsData.data || []) as { id: string }[];
        const accommodationIds = accommodations.map((a) => a.id);
        
        setHasAccommodations(accommodationIds.length > 0);

        // Pas d'établissement => pas de chambres : on évite la requête avec un UUID factice
        let rooms: { status: string }[] = [];
        const roomIds = activeAccommodationId ? [activeAccommodationId] : accommodationIds;
        if (roomIds.length > 0) {
          const roomsDataResult = await supabase
            .from("rooms")
            .select("status")
            .in("accommodation_id", roomIds);
          if (roomsDataResult.error) throw new Error(roomsDataResult.error.message || "Erreur lors de la récupération des chambres.");
          rooms = (roomsDataResult.data || []) as unknown as { status: string }[];
        }
        const rawPayments = (paymentsData.data || []) as unknown as {
          amount: number;
          payment_date: string;
        }[];
        const payments = rawPayments;
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

        // Nombre de séjours en dépassement (client encore en chambre après le
        // départ prévu) : calculé sur TOUTES les réservations checked_in du
        // tenant — et non sur la fenêtre de dates du jour — pour rester
        // cohérent avec le filtre « Dépassement » de la page Réservations.
        {
          let overstayQuery = supabase
            .from("bookings")
            .select(`
              id, booking_code, status, check_out_date, check_out_time, is_overstay,
              client:clients(full_name),
              room:rooms(room_number, accommodation:accommodations(name))
            `)
            .eq("tenant_id", tenantId)
            .eq("status", "checked_in");
          if (activeAccommodationId) {
            overstayQuery = overstayQuery.eq("accommodation_id", activeAccommodationId);
          }
          const overstayData = await overstayQuery;
          const todayMs = new Date().getTime();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const overdue = (overstayData.data || [] as any[]).filter(
            (b: any) => b.is_overstay || isBookingOverdue({ status: b.status, check_out_date: b.check_out_date, check_out_time: b.check_out_time })
          ).map((b: any) => {
            const checkoutMs = new Date(b.check_out_date).getTime();
            const daysOverdue = Math.max(1, Math.floor((todayMs - checkoutMs) / 86400000));
            const room = b.room as { room_number?: string; accommodation?: { name?: string } } | null;
            const client = b.client as { full_name?: string } | null;
            return {
              id: b.id as string,
              bookingCode: b.booking_code as string,
              clientName: client?.full_name || "—",
              roomNumber: room?.room_number || "—",
              accommodationName: room?.accommodation?.name || "",
              checkOutDate: b.check_out_date as string,
              daysOverdue: daysOverdue || 1,
            };
          });
          setOverstayBookings(overdue);
          setOverstayCount(overdue.length);
        }

        // Nombre de réservations en ligne (booking_source = 'external') en
        // attente de traitement (confirmées, pas encore check-in).
        {
          let onlineQuery = supabase
            .from("bookings")
            .select(`
              id, booking_code, check_in_date, check_out_date, total_amount, number_of_guests, created_at,
              client:clients(full_name),
              room:rooms(room_number, accommodation:accommodations(name))
            `)
            .eq("tenant_id", tenantId)
            .eq("booking_source", "external")
            .eq("status", "confirmed");
          if (activeAccommodationId) {
            onlineQuery = onlineQuery.eq("accommodation_id", activeAccommodationId);
          }
          const onlineData = await onlineQuery;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const onlineList = (onlineData.data || [] as any[]).map((b: any) => {
            const room = b.room as { room_number?: string; accommodation?: { name?: string } } | null;
            const client = b.client as { full_name?: string } | null;
            return {
              id: b.id as string,
              bookingCode: b.booking_code as string,
              clientName: client?.full_name || "—",
              roomNumber: room?.room_number || "—",
              accommodationName: room?.accommodation?.name || "",
              checkInDate: b.check_in_date as string,
              checkOutDate: b.check_out_date as string,
              totalAmount: b.total_amount as number,
              numberOfGuests: b.number_of_guests as number,
              createdAt: b.created_at as string,
            };
          });
          setOnlineBookingsList(onlineList);
          setOnlineBookingCount(onlineList.length);
        }

        // Une réservation arrivant ET repartant le jour cible génère deux mouvements distincts
        const movements: Movement[] = targetBookings.flatMap((b) => {
          const base = {
            bookingCode: b.booking_code,
            clientName: b.client?.full_name || "—",
            clientPhone: b.client?.phone || undefined,
            clientEmail: b.client?.email || undefined,
            clientNationality: b.client?.nationality || undefined,
            roomNumber: b.room?.room_number || "—",
            roomType: (b.room as unknown as { room_type?: { name?: string } })?.room_type?.name || "—",
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
            clientIncomplete: !b.client?.id_number,
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
          labelByKey[key] = d.toLocaleString(lang, { month: "short" });
        }
        for (let i = 11; i >= 6; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          prevKeys.push(key);
          labelByKey[key] = d.toLocaleString(lang, { month: "short" });
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
        // Après l'étape 2 (onboarding), les données créées par service_role
        // peuvent prendre du temps à être visibles côté client via RLS.
        // Au lieu de bloquer l'utilisateur sur un écran d'erreur, on continue
        // avec les données par défaut (tableaux vides, plan "free").
        const normalizedError = normalizeUnknownError(err);
        console.error("loadDashboardData error:", normalizedError, err);
        // Ne pas setError(true) : le dashboard affiche quand même les KPIs à zéro
        // et l'utilisateur peut interagir avec l'app. Le prochain polling (30s)
        // ou la navigation rechargera les données correctement.
      } finally {
        if (!isSilent) setLoading(false);
      }
  }, [activeAccommodationId, lang]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    // Premier chargement : skeleton complet. Changements suivants (date,
    // résidence active, langue) : rechargement silencieux — le contenu déjà
    // affiché reste visible et se met à jour sans faire "disparaître" la page.
    const initialLoad = setTimeout(() => {
      if (!cancelled) {
        loadDashboardData(dashboardLoadedRef.current, selectedDate);
        dashboardLoadedRef.current = true;
      }
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

  // Temps réel : rechargement immédiat dès qu'une donnée change.
  // - bookings : création, check-in/out, paiement
  // - cleaning_tasks : tâche marquée faite/en attente (compteurs ménage)
  // - payments : paiement enregistré (revenus)
  // Les rooms n'ont pas de tenant_id → couvert par le polling 30s.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    const supabase = createClient();
    const refresh = () => {
      if (!cancelled) loadDashboardData(true, selectedDate);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel("dashboard-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `tenant_id=eq.${tenantId}` },
          refresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cleaning_tasks", filter: `tenant_id=eq.${tenantId}` },
          refresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payments", filter: `tenant_id=eq.${tenantId}` },
          refresh,
        )
        .subscribe();
    } catch {
      // Realtime est best-effort : un échec ne doit pas casser le dashboard
      console.warn("Realtime channel subscription failed, falling back to polling only");
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenantId, selectedDate, loadDashboardData]);

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
  const formattedSelectedDate = new Date(selectedDate + "T00:00:00").toLocaleDateString(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Formate une date en "il y a Xh" / "il y a Xjour(s)" / "il y a Xmin"
  function formatTimeAgo(dateStr: string, locale: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return "";
    const diffMs = now - then;
    if (diffMs < 0) return locale === "en" ? "just now" : "à l'instant";
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (minutes < 1) return locale === "en" ? "just now" : "à l'instant";
    if (minutes < 60) return locale === "en" ? `${minutes}m ago` : `il y a ${minutes}min`;
    if (hours < 24) return locale === "en" ? `${hours}h ago` : `il y a ${hours}h`;
    return locale === "en" ? `${days}d ago` : `il y a ${days}j`;
  }

  async function handleMovementAction(movementId: string, action: "check_in" | "check_out"): Promise<boolean> {
    // L'id du mouvement est suffixé ("<bookingId>-in" / "<bookingId>-out")
    const bookingId = movementId.replace(/-(in|out)$/, "");

    // Le check-in redirige vers la page réservations pour le flow complet
    if (action === "check_in") {
      router.push(`/dashboard/bookings?checkin=${bookingId}`);
      return true;
    }

    setActionLoading(movementId);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("check_out_booking", {
        p_booking_id: bookingId,
        p_user_id: userId,
      });

      if (rpcErr) {
        toast.error("L'action a échoué : effectuer le check-out : " + rpcErr.message);
        return false;
      }

      toast.success("Check-out effectué avec succès ✓");
      loadDashboardData(true, selectedDate);
      return true;
    } catch {
      toast.error("Oups, l'action a échoué : action.");
      return false;
    } finally {
      setActionLoading("");
    }
  }

  async function handleBannerCheckout(bookingId: string) {
    setBannerActionLoading(bookingId);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("check_out_booking", {
        p_booking_id: bookingId,
        p_user_id: userId,
      });
      if (rpcErr) {
        toast.error(lang === "en" ? "Check-out failed: " + rpcErr.message : "Échec du check-out : " + rpcErr.message);
        return;
      }
      toast.success(lang === "en" ? "Check-out completed ✓" : "Check-out effectué avec succès ✓");
      loadDashboardData(true, selectedDate);
    } catch {
      toast.error(lang === "en" ? "Action failed" : "L'action a échoué");
    } finally {
      setBannerActionLoading("");
    }
  }

  async function handleBannerCancelOnline(bookingId: string) {
    setBannerActionLoading(bookingId);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId);
      if (updErr) {
        toast.error(lang === "en" ? "Cancellation failed: " + updErr.message : "Annulation échouée : " + updErr.message);
        return;
      }
      toast.success(lang === "en" ? "Booking cancelled" : "Réservation annulée");
      loadDashboardData(true, selectedDate);
    } catch {
      toast.error(lang === "en" ? "Action failed" : "L'action a échoué");
    } finally {
      setBannerActionLoading("");
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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.error.title}</h2>
        <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{t.error.copy}</p>
        <Button onClick={() => { loadRetriesRef.current = 0; loadDashboardData(false, selectedDate); }} className="gap-2">
          <RefreshCw className="w-4 h-4" /> {t.error.retry}
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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white text-center">{t.welcomeTitle}</h2>
        <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500 max-w-md text-center">
          {t.welcomeCopy}
        </p>
        <div className="pt-4">
          <Button onClick={() => router.push("/dashboard/residences")} className="gap-2" size="lg">
            <PlusCircle className="w-5 h-5" /> {t.addFirstResidence}
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
                 ? t.today
                 : isPastDate
                   ? t.pastActivities
                   : t.upcomingActivities}
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
          {!isToday && (
            <button
              onClick={() => handleDateChange(toLocalISODate(new Date()))}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--primary-color,#0C1C33)] hover:bg-[var(--primary-muted)] transition-colors"
            >
              {"Aujourd'hui"}
            </button>
          )}
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
        </div>
      </div>

                  {/* 0b. ALERTE DEPASSEMENT DE SEJOUR — intelligente avec urgence dynamique */}
      {overstayCount > 0 && (() => {
        // Niveau d'urgence dynamique base sur le max jours de depassement
        const maxDays = Math.max(...overstayBookings.map(b => b.daysOverdue));
        const isCritical = maxDays >= 4;
        const isUrgent = maxDays >= 2;
        const urgencyLevel = isCritical ? "critical" : isUrgent ? "urgent" : "warning";

        const bannerBg = isCritical
          ? "bg-red-100 dark:bg-red-950/50 border-red-400 dark:border-red-700"
          : isUrgent
            ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            : "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
        const iconBg = isCritical
          ? "bg-red-700 animate-pulse"
          : isUrgent
            ? "bg-red-600"
            : "bg-orange-500";
        const titleColor = isCritical
          ? "text-red-800 dark:text-red-200"
          : isUrgent
            ? "text-red-700 dark:text-red-300"
            : "text-orange-700 dark:text-orange-300";
        const badgeClass = isCritical
          ? "bg-red-600 text-white animate-pulse"
          : isUrgent
            ? "bg-red-500 text-white"
            : "bg-orange-500 text-white";

        return (
          <div className={`rounded-xl border animate-fade-in overflow-hidden ${bannerBg}`}>
            {/* En-tete */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 rounded-lg text-white flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${titleColor}`}>
                    {t.overstay.title.replace("{count}", String(overstayCount))}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}>
                    {isCritical ? t.overstay.urgencyCritical : isUrgent ? t.overstay.urgencyUrgent : t.overstay.urgencyWarning}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {t.overstay.actionHint}
                </p>
              </div>
              <button
                onClick={() => setOverstayExpanded(!overstayExpanded)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
              >
                {overstayExpanded ? t.overstay.hideDetails : t.overstay.showDetails}
                {overstayExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="flex-shrink-0 border-current opacity-80 hover:opacity-100"
                onClick={() => router.push("/dashboard/bookings?status=overdue")}
              >
                {t.overstay.viewBookings}
              </Button>
            </div>

            {/* Resume compact (toujours visible quand replie) */}
            {!overstayExpanded && overstayBookings.length > 0 && (
              <div className="px-4 pb-2.5 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {overstayBookings.slice(0, 3).map((b) => (
                    <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/70 dark:bg-white/10 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-600 dark:text-red-400 text-[10px] font-bold">
                        {b.clientName.charAt(0)}
                      </span>
                      Ch. {b.roomNumber}
                      <span className="text-red-500 dark:text-red-400 font-bold">+{b.daysOverdue}j</span>
                    </span>
                  ))}
                  {overstayBookings.length > 3 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white/50 dark:bg-white/5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t.overstay.moreItems.replace("{count}", String(overstayBookings.length - 3))}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Detail expandable */}
            {overstayExpanded && (
              <div className="border-t border-current/10 divide-y divide-current/5">
                {overstayBookings.map((b) => {
                  const isCriticalItem = b.daysOverdue >= 4;
                  const isUrgentItem = b.daysOverdue >= 2;
                  const itemBadge = isCriticalItem
                    ? "bg-red-600 text-white"
                    : isUrgentItem
                      ? "bg-red-500 text-white"
                      : "bg-orange-500 text-white";
                  return (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 bg-white/40 dark:bg-white/5">
                      <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-600 dark:text-red-400 text-xs font-bold flex-shrink-0">
                        {b.clientName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{b.clientName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Ch. {b.roomNumber}{b.accommodationName ? ` · ${b.accommodationName}` : ""} · {b.bookingCode}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${itemBadge}`}>
                        +{b.daysOverdue}j
                      </span>
                      <button
                        onClick={() => handleBannerCheckout(b.id)}
                        disabled={bannerActionLoading === b.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {bannerActionLoading === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {t.overstay.checkOut}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 0c. ALERTE RESERVATIONS EN LIGNE — intelligente avec texte temporel */}
      {onlineBookingCount > 0 && (
        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 animate-fade-in overflow-hidden">
          {/* En-tete */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {t.onlineBookings.title.replace("{count}", String(onlineBookingCount))}
              </p>
              <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80">
                {t.onlineBookings.actionHint}
              </p>
            </div>
            <button
              onClick={() => setOnlineExpanded(!onlineExpanded)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            >
              {onlineExpanded ? t.onlineBookings.hideDetails : t.onlineBookings.showDetails}
              {onlineExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
              onClick={() => router.push("/dashboard/bookings?source=online")}
            >
              {t.onlineBookings.viewBookings}
            </Button>
          </div>

          {/* Resume compact (toujours visible quand replie) */}
          {!onlineExpanded && onlineBookingsList.length > 0 && (
            <div className="px-4 pb-2.5 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {onlineBookingsList.slice(0, 3).map((b) => {
                  const elapsed = formatTimeAgo(b.createdAt, lang);
                  return (
                    <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/70 dark:bg-white/10 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                        {b.clientName.charAt(0)}
                      </span>
                      {b.clientName.split(" ")[0]}
                      <span className="text-indigo-500 dark:text-indigo-400 text-[10px]">· {elapsed}</span>
                    </span>
                  );
                })}
                {onlineBookingsList.length > 3 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white/50 dark:bg-white/5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {t.onlineBookings.moreItems.replace("{count}", String(onlineBookingsList.length - 3))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Detail expandable */}
          {onlineExpanded && (
            <div className="border-t border-indigo-200 dark:border-indigo-800 divide-y divide-indigo-200/50 dark:divide-indigo-800/50">
              {onlineBookingsList.map((b) => {
                const elapsed = formatTimeAgo(b.createdAt, lang);
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 bg-white/50 dark:bg-indigo-950/20">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold flex-shrink-0">
                      {b.clientName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{b.clientName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {b.checkInDate} → {b.checkOutDate} · {t.onlineBookings.guests.replace("{count}", String(b.numberOfGuests))}{b.accommodationName ? ` · ${b.accommodationName}` : ""}
                      </p>
                    </div>
                    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 whitespace-nowrap font-medium">
                      {elapsed}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => router.push(`/dashboard/bookings?checkin=${b.id}`)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.onlineBookings.checkIn}
                      </button>
                      <button
                        onClick={() => handleBannerCancelOnline(b.id)}
                        disabled={bannerActionLoading === b.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {bannerActionLoading === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        {t.onlineBookings.decline}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

{/* 1. BARRE DE CARTES SPÉCIALES — 4 KPIs */}
      {isReceptionniste ? (
        /* ── Vue Réceptionniste : 4 KPIs colorés, compacts et opérationnels ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* KPI: Arrivées prévues */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-emerald-200 dark:ring-emerald-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white ring-1 ring-emerald-600/30 dark:bg-emerald-500/25 dark:text-emerald-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <LogIn className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.expectedCheckins}</p>
                 <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">{t.arrivalsExpected}</p>
              </div>
            </div>
          </Card>

          {/* KPI: Départs prévus */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-orange-200 dark:ring-orange-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500 text-white ring-1 ring-orange-600/30 dark:bg-orange-500/25 dark:text-orange-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.expectedCheckouts}</p>
                 <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">{t.departuresExpected}</p>
              </div>
            </div>
          </Card>

          {/* KPI: Chambres à nettoyer */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-amber-200 dark:ring-amber-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white ring-1 ring-amber-600/30 dark:bg-amber-500/25 dark:text-amber-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.cleaningPending}</p>
                 <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">{t.roomsToClean}</p>
              </div>
            </div>
          </Card>

          {/* KPI: Taux d'occupation */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-950/50 dark:to-slate-900 shadow-[var(--shadow-sm)] ring-1 ring-blue-200 dark:ring-blue-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500 text-white ring-1 ring-blue-600/30 dark:bg-blue-500/25 dark:text-blue-300 flex items-center justify-center flex-shrink-0 shadow-sm">
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
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-blue-200 dark:ring-blue-900/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-500 text-white ring-1 ring-blue-600/30 dark:bg-blue-500/25 dark:text-blue-300 flex items-center justify-center shadow-sm flex-shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{kpis.occupancyRate}%</p>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">{t.occupancyRate}</p>
                </div>
              </div>
              <Badge variant="info">{isToday ? t.today : isPastDate ? t.pastActivities : t.upcomingActivities}</Badge>
            </div>
            <div className="mt-3">
              <div className="h-1.5 bg-white/70 dark:bg-slate-800/80 rounded-full overflow-hidden ring-1 ring-blue-500/10">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-sky-500 rounded-full transition-all"
                  style={{ width: `${kpis.occupancyRate}%` }}
                />
              </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">{t.percentageOccupied}</p>
            </div>
          </Card>

          {/* KPI 2: Encaissements du jour — Émeraude */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-emerald-200 dark:ring-emerald-900/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white ring-1 ring-emerald-600/30 dark:bg-emerald-500/25 dark:text-emerald-300 flex items-center justify-center shadow-sm flex-shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none truncate">
                    {formatAmountOnly(kpis.dailyRevenue, currency.code, lang)}
                  </p>
                   <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">{t.kpis.dailyRevenue}</p>
                </div>
              </div>
              <Badge variant="success">{currency.code}</Badge>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-3">
              {isToday
                ? t.kpis.dailyRevenueCopy
                : `${currency.symbol} ${lang === "en" ? "collected" : "encaissés"} le ${new Date(selectedDate + "T00:00:00").toLocaleDateString(lang, { day: "numeric", month: "short" })}`}
            </p>
          </Card>

          {/* KPI 3: Entrées / Sorties prévues — Orange */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-orange-200 dark:ring-orange-900/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white ring-1 ring-orange-600/30 dark:bg-orange-500/25 dark:text-orange-300 flex items-center justify-center shadow-sm flex-shrink-0">
                  <LogIn className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">Mouvements</p>
                  <div className="flex items-center gap-5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <LogIn className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.expectedCheckins}</span>
                      </div>
                       <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{t.arrivalsExpected}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <LogOut className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <span className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.expectedCheckouts}</span>
                      </div>
                       <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{t.departuresExpected}</p>
                    </div>
                  </div>
                </div>
              </div>
               <Badge variant="warning">{isToday ? t.today : isPastDate ? t.pastActivities : t.upcomingActivities}</Badge>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-3">
              {isToday ? t.expectedArrivalsDepartures : t.recordedArrivalsDepartures}
            </p>
          </Card>

          {/* KPI 4: État Ménage — Violet */}
          <Card className="p-4 rounded-2xl border-0 bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950/50 dark:to-slate-900 shadow-[var(--shadow-md)] ring-1 ring-violet-200 dark:ring-violet-900/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-violet-500 text-white ring-1 ring-violet-600/30 dark:bg-violet-500/25 dark:text-violet-300 flex items-center justify-center shadow-sm flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">État du ménage</p>
                  <div className="flex items-center gap-5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.cleaningPending}</span>
                      </div>
                       <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{t.kpis.toClean}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">{kpis.cleaningDone}</span>
                      </div>
                       <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{t.kpis.ready}</p>
                    </div>
                  </div>
                </div>
              </div>
              <Badge variant="purple">Ménage</Badge>
            </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-3">{t.cleanlinessStatus}</p>
            </Card>
        </div>
      )}

      {/* 2. CONTENEUR PRINCIPAL — Mouvements du jour */}
      {isReceptionniste ? (
        /* ── Vue Réceptionniste : Mouvements en pleine largeur avec actions rapides ── */
        <SectionCard>
          <SectionHeader
            icon={<LogIn className="w-5 h-5" />}
            iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-blue-500/20"
             title={isToday ? t.movements.title : isPastDate ? t.noMovementsPast : t.noMovementsFuture}
             subtitle={isToday
               ? t.movements.subtitle
               : `Arrivées et départs du ${new Date(selectedDate + "T00:00:00").toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" })}`}
            action={
              <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/bookings")}>
                Voir tout
                <ArrowRight className="w-4 h-4" />
              </Button>
            }
          />

          {/* Version mobile : cartes empilées */}
          <MovementCardList
            movements={movements}
            onAction={handleMovementAction}
            actionLoading={actionLoading}
            onOpenDetails={(m) => setDrawerMovement(m)}
            fmt={fmt}
            isPastDate={isPastDate}
            isToday={isToday}
          />

          {/* Version desktop : tableau */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    {t.movements.client}
                  </th>
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    {t.movements.accommodation}
                  </th>
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    {t.movements.time}
                  </th>
                  <th className="text-left p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    {t.movements.payment}
                  </th>
                  <th className="text-right p-2.5 text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    {t.movements.action}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
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
                          {getPaymentStatusLabel(m.paymentStatus, lang)}
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
                            disabled={actionLoading === m.id || (m.movementType === "check_in" && m.clientIncomplete)}
                            title={m.movementType === "check_in" && m.clientIncomplete ? "Complétez la fiche client (CNI/Passeport) avant de procéder au check-in" : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMovementAction(m.id, m.movementType);
                            }}
                          >
                             {m.movementType === "check_in" ? t.checkInAction : t.checkOutAction}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDrawerMovement(m)}
                        >
                          {t.details}
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
          <SectionCard className="lg:col-span-7">
            <SectionHeader
              icon={<LogIn className="w-5 h-5" />}
              iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-blue-500/20"
              title={isToday ? t.movements.title : isPastDate ? t.noMovementsPast : t.noMovementsFuture}
              subtitle={isToday
                ? t.movements.subtitle
                : `Arrivées et départs du ${new Date(selectedDate + "T00:00:00").toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" })}`}
              action={
                <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/bookings")}>
                  {t.movements.viewAll}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              }
            />

            {/* Version mobile : cartes empilées */}
            <MovementCardList
              movements={movements}
              onAction={handleMovementAction}
              actionLoading={actionLoading}
              onOpenDetails={(m) => setDrawerMovement(m)}
              fmt={fmt}
              isPastDate={isPastDate}
              isToday={isToday}
            />

            {/* Version desktop : tableau */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
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
                <tbody className="divide-y divide-[var(--border-subtle)]">
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
                            {getPaymentStatusLabel(m.paymentStatus, lang)}
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
                                     {m.bookingStatus === "checked_out" ? t.completed : m.bookingStatus === "cancelled" ? t.cancelled : m.bookingStatus === "checked_in" ? t.onSite : t.confirmed}
                          </Badge>
                        ) : (
                          <Button
                            variant={m.movementType === "check_in" ? "primary" : "secondary"}
                            size="sm"
                            loading={actionLoading === m.id}
                            disabled={actionLoading === m.id || (m.movementType === "check_in" && m.clientIncomplete)}
                            title={m.movementType === "check_in" && m.clientIncomplete ? "Complétez la fiche client (CNI/Passeport) avant de procéder au check-in" : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMovementAction(m.id, m.movementType);
                            }}
                          >
                             {m.movementType === "check_in" ? t.checkInAction : t.checkOutAction}
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
          <SectionCard className="lg:col-span-3">
            <SectionHeader
              icon={<Sparkles className="w-5 h-5" />}
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-300 ring-violet-500/20"
              title={t.kpis.roomStatus}
              subtitle={t.kpis.roomStatusCopy}
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
                         {getRoomStatusLabel(item.status, lang)}
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t.enterpriseFeaturesAvailable}</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">{t.advancedAccountingReserved}</p>
            </div>
            <Button variant="primary" onClick={() => router.push("/dashboard/subscription")} className="whitespace-nowrap shrink-0 w-full sm:w-auto justify-center text-xs sm:text-sm">{t.switchToEnterprise}</Button>
          </div>
        </Card>
      )}

      {/* 4. CONTENEUR INFÉRIEUR — Graphique linéaire des recettes (réservé aux admins) */}
      {!isReceptionniste && (
        <SectionCard>
          <SectionHeader
            icon={<Wallet className="w-5 h-5" />}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-500/20"
            title={t.revenueTracking}
            subtitle={t.revenueTrend.replace("{currency}", currency.symbol)}
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
            <LineChart data={monthlyRevenue} fmt={fmt} currencyCode={currency.code} lang={lang} />
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