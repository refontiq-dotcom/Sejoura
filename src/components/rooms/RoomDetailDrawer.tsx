"use client";

import {
  X,
  BedDouble,
  CheckCircle2,
  Clock,
  Wrench,
  AlertTriangle,
  User,
  Calendar,
  RefreshCw,
} from "lucide-react";

interface RoomDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  room: {
    id: string;
    room_number: string;
    floor: number | null;
    status: string;
    room_type_name?: string;
    room_type_price?: number;
    currentClientName?: string | null;
    checkOutDate?: string | null;
    needsCleaning?: boolean;
    lastCleanedAt?: string | null;
  };
  lang: "fr" | "en";
  onStatusChange: (id: string, status: string) => void;
  updating: boolean;
}

const STATUS_LABELS: Record<string, { fr: string; en: string; color: string }> = {
  available: { fr: "Libre", en: "Available", color: "text-emerald-600 dark:text-emerald-400" },
  occupied: { fr: "Occupée", en: "Occupied", color: "text-red-600 dark:text-red-400" },
  cleaning: { fr: "Ménage", en: "Cleaning", color: "text-amber-600 dark:text-amber-400" },
  maintenance: { fr: "Maintenance", en: "Maintenance", color: "text-orange-600 dark:text-orange-400" },
  alert: { fr: "Alerte", en: "Alert", color: "text-rose-600 dark:text-rose-400" },
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  available: CheckCircle2,
  occupied: BedDouble,
  cleaning: Clock,
  maintenance: Wrench,
  alert: AlertTriangle,
};

export function RoomDetailDrawer({
  open,
  onClose,
  room,
  lang,
  onStatusChange,
  updating,
}: RoomDetailDrawerProps) {
  if (!open) return null;

  const statusInfo = STATUS_LABELS[room.status] ?? STATUS_LABELS.available;
  const StatusIcon = STATUS_ICONS[room.status] ?? BedDouble;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-2xl bg-[var(--card-bg,var(--surface))] border border-[var(--card-border,var(--border))] rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-[var(--card-border,var(--border))]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center">
              <BedDouble className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {room.room_number}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {room.room_type_name || (lang === "fr" ? "Type non défini" : "Type undefined")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${statusInfo.color.replace("text-", "bg-")}10 dark:${statusInfo.color.replace("text-", "bg-")}900/30`}>
              <StatusIcon className="w-4 h-4" style={{ color: "currentColor" }} />
            </div>
            <div>
              <span className={`font-semibold ${statusInfo.color}`}>
                {lang === "fr" ? statusInfo.fr : statusInfo.en}
              </span>
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                #{room.id.slice(0, 8)}
              </span>
            </div>
          </div>

          {room.currentClientName && (
            <div className="rounded-xl border border-[var(--card-border,var(--border))] bg-blue-50 dark:bg-blue-900/10 p-4">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {lang === "fr" ? "Client actuel" : "Current guest"}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    {room.currentClientName}
                  </p>
                  {room.checkOutDate && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                      {lang === "fr"
                        ? `Départ prévu : ${room.checkOutDate}`
                        : `Checkout: ${room.checkOutDate}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              type="button"
              disabled={updating}
              onClick={() => onStatusChange(room.id, "available")}
              className={`px-3 py-2 rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium transition-colors disabled:opacity-50 ${room.status === "available" ? "bg-emerald-50 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {lang === "fr" ? "Marquer libre" : "Mark available"}
            </button>
            <button
              type="button"
              disabled={updating}
              onClick={() => onStatusChange(room.id, "cleaning")}
              className={`px-3 py-2 rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium transition-colors disabled:opacity-50 ${room.status === "cleaning" ? "bg-amber-50 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/30" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
            >
              <Clock className="w-4 h-4 mr-2" />
              {lang === "fr" ? "Demander ménage" : "Request cleaning"}
            </button>
            <button
              type="button"
              disabled={updating}
              onClick={() => onStatusChange(room.id, "maintenance")}
              className={`px-3 py-2 rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium transition-colors disabled:opacity-50 ${room.status === "maintenance" ? "bg-orange-50 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-900/30" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
            >
              <Wrench className="w-4 h-4 mr-2" />
              {lang === "fr" ? "Maintenance" : "Maintenance"}
            </button>
            <button
              type="button"
              disabled={updating}
              onClick={() => onStatusChange(room.id, "alert")}
              className={`px-3 py-2 rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium transition-colors disabled:opacity-50 ${room.status === "alert" ? "bg-rose-50 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/30" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              {lang === "fr" ? "Signaler alerte" : "Report alert"}
            </button>
          </div>
          <div className="rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--input-bg,var(--surface))] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              {lang === "fr" ? "Détails techniques" : "Technical details"}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">
                  {lang === "fr" ? "Étage" : "Floor"}
                </span>
                <span className="text-slate-900 dark:text-white font-medium">
                  {room.floor != null ? (lang === "fr" ? `Ét. ${room.floor}` : `Fl. ${room.floor}`) : (lang === "fr" ? "Non renseigné" : "Not set")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">
                  {lang === "fr" ? "Prix de base" : "Base price"}
                </span>
                <span className="text-slate-900 dark:text-white font-medium">
                  {room.room_type_price != null ? room.room_type_price + " XOF" : "—"}
                </span>
              </div>
              {room.lastCleanedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === "fr" ? "Dernier nettoyage" : "Last cleaned"}
                  </span>
                  <span className="text-slate-900 dark:text-white font-medium text-[10px]">
                    {room.lastCleanedAt}
                  </span>
                </div>
              )}
              {room.needsCleaning && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === "fr" ? "Attention requise" : "Attention needed"}
                  </span>
                  <span className="text-rose-600 dark:text-rose-400 font-medium text-xs">
                    {lang === "fr" ? "Ménage à planifier" : "Cleaning to schedule"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))]/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {lang === "fr" ? "Fermer et actualiser" : "Close and refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}