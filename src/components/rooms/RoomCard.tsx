"use client";
import { useState } from "react";

import {
  BedDouble,
  CheckCircle2,
  Clock,
  Wrench,
  AlertTriangle,
  MoreHorizontal,
  ChevronDown,
  User,
  Calendar,
  AlertCircle,
  ChevronRight,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

type RoomStatus = "available" | "occupied" | "cleaning" | "maintenance" | "alert";

interface StatusConfig {
  bg: string;
  text: string;
  border: string;
  icon: React.ElementType;
  labelFr: string;
  labelEn: string;
  pulse: boolean;
}

export const STATUS_CONFIG: Record<RoomStatus, StatusConfig> = {
  available: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-100 dark:border-emerald-900/30",
    icon: CheckCircle2,
    labelFr: "Libre",
    labelEn: "Available",
    pulse: false,
  },
  occupied: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-100 dark:border-red-900/30",
    icon: BedDouble,
    labelFr: "Occupée",
    labelEn: "Occupied",
    pulse: false,
  },
  cleaning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-100 dark:border-amber-900/30",
    icon: Clock,
    labelFr: "Ménage",
    labelEn: "Cleaning",
    pulse: true,
  },
  maintenance: {
    bg: "bg-orange-50 dark:bg-orange-900/20",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-100 dark:border-orange-900/30",
    icon: Wrench,
    labelFr: "Maintenance",
    labelEn: "Maintenance",
    pulse: true,
  },
  alert: {
    bg: "bg-rose-50 dark:bg-rose-900/20",
    text: "text-rose-700 dark:text-rose-400",
    border: "border-rose-100 dark:border-rose-900/30",
    icon: AlertTriangle,
    labelFr: "Alerte",
    labelEn: "Alert",
    pulse: true,
  },
};

const ROOM_TYPE_ILLUSTRATIONS: Record<string, { gradient: string; icon: React.ElementType }> = {
  standard: { gradient: "from-indigo-500 to-purple-600", icon: BedDouble },
  deluxe: { gradient: "from-pink-500 to-rose-600", icon: BedDouble },
  suite: { gradient: "from-amber-500 to-orange-600", icon: BedDouble },
  famille: { gradient: "from-emerald-500 to-teal-600", icon: BedDouble },
  single: { gradient: "from-slate-500 to-gray-600", icon: BedDouble },
  double: { gradient: "from-blue-500 to-cyan-600", icon: BedDouble },
};

function normalizeTypeKey(name?: string): string {
  if (!name) return "standard";
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[àâä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o")
    .replace(/[ùûü]/g, "u")
    .replace(/[ç]/g, "c");
}

export function RoomCard({
  room,
  lang,
  fmt,
  onStatusChange,
  updating,
  onClick,
  currentClientName,
  checkOutDate,
  needsCleaning,
  lastCleanedAt,
  onEdit,
  onDuplicate,
  onDelete,
  canManage = true,
}: {
  room: RoomWithType;
  lang: "fr" | "en";
  fmt: (amount: number) => string;
  onStatusChange: (id: string, status: RoomStatus) => void;
  onClick?: () => void;
  currentClientName?: string | null;
  checkOutDate?: string | null;
  needsCleaning?: boolean;
  lastCleanedAt?: string | null;
  updating: boolean;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
}) {
  const status = (room.status as RoomStatus) ?? "available";
  const config = STATUS_CONFIG[status];
  const label = lang === "fr" ? config.labelFr : config.labelEn;
  const illustration =
    ROOM_TYPE_ILLUSTRATIONS[normalizeTypeKey(room.room_type_name)] ??
    ROOM_TYPE_ILLUSTRATIONS.standard;

  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);

  const isOpen = status === "available";
  const pulseClass = config.pulse ? "animate-pulse" : "";

  return (
    <article
      className={`group relative flex flex-col rounded-2xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer ${onClick ? "hover:border-blue-500 dark:hover:border-blue-500/50" : ""}`}
      onClick={onClick}
    >
      <div className="relative h-40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 dark:from-slate-900/80 to-slate-200 dark:to-slate-800/80" />
        <div
          className={`absolute inset-0 flex items-center justify-center ${illustration.gradient} opacity-90`}
        >
          <illustration.icon className="w-12 h-12 text-white/90 drop-shadow-lg" />
        </div>
        <div className="absolute top-3 left-3 z-10">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white text-xs font-bold shadow-sm backdrop-blur-sm"
          >
            {room.room_number}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3 z-10 flex justify-between items-end">
          <span className={`px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium ${pulseClass}`}>
            {room.floor != null
              ? lang === "fr"
                ? `Ét. ${room.floor}`
                : `Fl. ${room.floor}`
              : lang === "fr"
              ? "Sans étage"
              : "No floor"}
          </span>
          <span className="px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium">
            {room.room_type_price != null ? fmt(room.room_type_price) : "—"}
          </span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
                {room.room_number}
              </h3>
              {onClick && (
                <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-blue-500 transition-colors" />
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {room.room_type_name ||
                (lang === "fr" ? "Type non défini" : "Type undefined")}
            </p>

            {/* Badges intelligents */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {currentClientName && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] font-medium border border-blue-100 dark:border-blue-900/30"
                >
                  <User className="w-3 h-3" />
                  {currentClientName}
                </span>
              )}
              {checkOutDate && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[10px] font-medium border border-amber-100 dark:border-amber-900/30"
                >
                  <Calendar className="w-3 h-3" />
                  {lang === "fr" ? `Départ ${checkOutDate}` : `Checkout ${checkOutDate}`}
                </span>
              )}
              {needsCleaning && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 text-[10px] font-medium border border-rose-100 dark:border-rose-900/30 ${pulseClass}`}
                >
                  <AlertCircle className="w-3 h-3" />
                  {lang === "fr" ? "Ménage requis" : "Cleaning needed"}
                </span>
              )}
            </div>
          </div>
          {canManage && (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Plus d'actions"
                  className="h-9 w-9 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{lang === "fr" ? "Chambre" : "Room"}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={onEdit}
                    icon={<Pencil className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />}
                  >
                    {lang === "fr" ? "Modifier" : "Edit"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onDuplicate}
                    icon={<Copy className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />}
                  >
                    {lang === "fr" ? "Dupliquer" : "Duplicate"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onDelete}
                    icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                    className="text-red-600 dark:text-red-400"
                  >
                    {lang === "fr" ? "Supprimer" : "Delete"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border} ${pulseClass}`}
          >
            <config.icon className="w-3 h-3" />
            {label}
          </div>
          {lastCleanedAt && status !== "available" && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              {lang === "fr" ? `Nettoyé : ${lastCleanedAt}` : `Cleaned: ${lastCleanedAt}`}
            </p>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-[var(--card-border,var(--border))]/50">
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsStatusMenuOpen((prev) => !prev);
              }}
              disabled={updating}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-[var(--card-border,var(--border))]/50 bg-[var(--card-bg,var(--surface))]/50 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${config.text}`} />
                {label}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 ${config.text} transition-transform duration-200 ${isStatusMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isStatusMenuOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--card-border,var(--border))] bg-white dark:bg-slate-800 shadow-lg py-2 animate-in fade-in zoom-in duration-150">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const isActive = status === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={updating}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsStatusMenuOpen(false);
                      if (key !== status) onStatusChange(room.id, key as RoomStatus);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      isActive
                        ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    } disabled:opacity-50 disabled:pointer-events-none`}
                  >
                    <cfg.icon className="w-3.5 h-3.5 shrink-0" />
                    {lang === "fr" ? cfg.labelFr : cfg.labelEn}
                  </button>
                );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={`absolute top-4 right-4 z-20 flex h-6 w-6 items-center justify-center rounded-full ${
          isOpen
            ? "bg-emerald-500 text-white shadow-lg"
            : "bg-slate-400 text-white shadow-md"
        }`}
        aria-label={isOpen ? (lang === "fr" ? "Disponible" : "Available") : (lang === "fr" ? "Indisponible" : "Unavailable")}
      >
        {isOpen ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <Clock className="w-3 h-3" />
        )}
      </div>

      {/* Overlay visuel au survol si cliquable */}
      {onClick && (
        <div className="absolute inset-0 bg-white/0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition-colors" />
      )}
    </article>
  );
}