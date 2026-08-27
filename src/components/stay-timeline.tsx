"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CreditCard,
  Hammer,
  LogIn,
  LogOut,
  MessageSquare,
  Package,
  Plus,
  StickyNote,
  XCircle,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type {
  StayActivity,
  StayActivityType,
  StayNote,
  StayNoteSeverity,
  StayNoteType,
} from "@/types/database";

interface TimelineItem {
  key: string;
  at: string;
  title: string;
  description: string | null;
  type: StayActivityType | "note";
  noteType?: StayNoteType;
  severity?: StayNoteSeverity;
}

const ACTIVITY_STYLE: Record<
  StayActivityType | "note",
  { icon: LucideIcon; color: string; dot: string }
> = {
  booking_created: { icon: CalendarPlus, color: "text-blue-500", dot: "bg-blue-500" },
  check_in: { icon: LogIn, color: "text-emerald-500", dot: "bg-emerald-500" },
  check_out: { icon: LogOut, color: "text-slate-400", dot: "bg-slate-400" },
  booking_extended: { icon: CalendarPlus, color: "text-indigo-500", dot: "bg-indigo-500" },
  overstay_detected: { icon: AlertTriangle, color: "text-amber-500", dot: "bg-amber-500" },
  overstay_auto_checkout: { icon: AlertTriangle, color: "text-red-500", dot: "bg-red-500" },
  service_request: { icon: BellRing, color: "text-sky-500", dot: "bg-sky-500" },
  service_request_done: { icon: CheckCircle2, color: "text-emerald-500", dot: "bg-emerald-500" },
  stay_extension_requested: { icon: Clock, color: "text-violet-500", dot: "bg-violet-500" },
  stay_extension_approved: { icon: CheckCircle2, color: "text-emerald-500", dot: "bg-emerald-500" },
  stay_extension_rejected: { icon: XCircle, color: "text-red-500", dot: "bg-red-500" },
  payment: { icon: CreditCard, color: "text-green-600", dot: "bg-green-600" },
  room_change: { icon: ArrowLeftRight, color: "text-purple-500", dot: "bg-purple-500" },
  note: { icon: StickyNote, color: "text-rose-500", dot: "bg-rose-500" },
};

const NOTE_TYPE_LABELS: Record<StayNoteType, string> = {
  incident: "Incident",
  damage: "Dégât matériel",
  forgotten_object: "Objet oublié",
  feedback: "Avis / Remarque",
  other: "Autre",
};

const NOTE_TYPE_ICONS: Record<StayNoteType, LucideIcon> = {
  incident: AlertTriangle,
  damage: Hammer,
  forgotten_object: Package,
  feedback: MessageSquare,
  other: StickyNote,
};

const NOTE_SEVERITY_LABELS: Record<StayNoteSeverity, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

const NOTE_SEVERITY_COLORS: Record<StayNoteSeverity, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function toItem(activity: StayActivity): TimelineItem {
  return {
    key: `a-${activity.id}`,
    at: activity.created_at,
    title: activity.title,
    description: activity.description,
    type: activity.activity_type,
  };
}

function noteToItem(note: StayNote): TimelineItem {
  return {
    key: `n-${note.id}`,
    at: note.created_at,
    title: NOTE_TYPE_LABELS[note.note_type],
    description: note.description,
    type: "note",
    noteType: note.note_type,
    severity: note.severity,
  };
}

interface StayTimelineProps {
  bookingId: string;
  tenantId: string;
  clientId?: string | null;
}

export function StayTimeline({ bookingId, tenantId, clientId }: StayTimelineProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [noteType, setNoteType] = useState<StayNoteType>("other");
  const [severity, setSeverity] = useState<StayNoteSeverity>("low");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!bookingId) return;
    const supabase = createClient();

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (session && !userId) {
      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (userData) setUserId(userData.id);
    }

    const [activitiesRes, notesRes] = await Promise.all([
      supabase
        .from("stay_activities")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("stay_notes")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false }),
    ]);

    const activities = (activitiesRes.data as StayActivity[] | null) || [];
    const notes = (notesRes.data as StayNote[] | null) || [];
    const merged: TimelineItem[] = [
      ...activities.map(toItem),
      ...notes.map(noteToItem),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    setItems(merged);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      if (cancelled) return;
      await load();
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasNotes = useMemo(() => items.some((i) => i.type === "note"), [items]);

  async function handleSubmitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Décrivez le comportement à noter 📝");
      return;
    }
    setSaving(true);
    if (!bookingId) {
      setSaving(false);
      toast.error("Cette note doit être rattachée à une réservation. Sélectionnez d'abord le séjour concerné.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("stay_notes").insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      client_id: clientId ?? null,
      note_type: noteType,
      severity,
      description: description.trim(),
      created_by: userId,
    });
    setSaving(false);

    if (error) {
      const message = /null value in column "booking_id"/.test(error.message)
        ? "Impossible d'enregistrer la note : le séjour associé est introuvable. Réessayez ou re-sélectionnez la réservation."
        : error.message || "L'action a échoué : enregistrer la note.";
      toast.error(message);
      return;
    }

    toast.success("Note enregistrée 📝");
    setDescription("");
    setFormOpen(false);
    await load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Historique du séjour
        </h4>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--primary-color,#0C1C33)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> Note
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmitNote}
          className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Type
              </label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as StayNoteType)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                {(Object.keys(NOTE_TYPE_LABELS) as StayNoteType[]).map((t) => (
                  <option key={t} value={t}>
                    {NOTE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Gravité
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as StayNoteSeverity)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                {(Object.keys(NOTE_SEVERITY_LABELS) as StayNoteSeverity[]).map((s) => (
                  <option key={s} value={s}>
                    {NOTE_SEVERITY_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Ex : verre cassé dans la chambre, porte de salle de bain endommagée, téléphone oublié…"
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)] resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-3 text-center">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400 py-3 text-center">
          Aucun mouvement enregistré pour ce séjour.
        </p>
      ) : (
        <div className="relative space-y-0">
          {items.map((item) => {
            const style = ACTIVITY_STYLE[item.type] || ACTIVITY_STYLE.note;
            const Icon = item.type === "note" ? NOTE_TYPE_ICONS[item.noteType || "other"] : style.icon;
            return (
              <div key={item.key} className="relative flex gap-3 pb-4 last:pb-0">
                {items[items.length - 1].key !== item.key && (
                  <span className="absolute left-[9px] top-6 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                )}
                <span className={`relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${style.dot}`}>
                  <Icon className="w-3 h-3 text-white" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-slate-900 dark:text-white">{item.title}</p>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {formatDateTime(item.at)}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</p>
                  )}
                  {item.type === "note" && item.severity && (
                    <span className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${NOTE_SEVERITY_COLORS[item.severity]}`}>
                      Gravité : {NOTE_SEVERITY_LABELS[item.severity]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasNotes && (
        <p className="text-[10px] text-slate-400 italic">
          Les notes comportement (rose) sont internes au personnel.
        </p>
      )}
    </div>
  );
}
