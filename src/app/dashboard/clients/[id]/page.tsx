"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { canAccessFeature } from "@/lib/subscription-plans";
import { formatAmount, formatDate, formatDateLong, formatNumber } from "@/lib/utils";
import { ClientScoreBadge } from "@/components/client-score-badge";
import { StayTimeline } from "@/components/stay-timeline";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  History,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  CalendarDays,
  ShieldCheck,
  Heart,
  Banknote,
  AlertTriangle,
  Info,
  Sparkles,
} from "lucide-react";
import type { ClientProfilePayload, ClientProfileSignal } from "@/types/database";

type BookingRow = {
  id: string;
  booking_code: string;
  status: string;
  payment_status: string;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  total_amount: number;
  amount_paid: number;
  room_id: string | null;
  room: { room_number: string }[] | null;
};

const TIER_LABEL: Record<string, string> = {
  excellent: "Excellent",
  bon: "Bon",
  moyen: "Moyen",
  a_surveiller: "À surveiller",
  mauvais: "Mauvais",
};

const DIMENSION_META: { key: "reliability" | "behavior" | "loyalty" | "value"; label: string; weight: string; icon: typeof ShieldCheck; color: string }[] = [
  { key: "reliability", label: "Fiabilité", weight: "40 %", icon: ShieldCheck, color: "bg-emerald-500" },
  { key: "behavior", label: "Comportement", weight: "30 %", icon: Heart, color: "bg-blue-500" },
  { key: "loyalty", label: "Fidélité", weight: "20 %", icon: Sparkles, color: "bg-violet-500" },
  { key: "value", label: "Valeur", weight: "10 %", icon: Banknote, color: "bg-amber-500" },
];

const SIGNAL_META: Record<ClientProfileSignal["tone"], { icon: typeof TrendingUp; className: string }> = {
  positive: { icon: TrendingUp, className: "text-emerald-500 bg-emerald-500/10" },
  negative: { icon: TrendingDown, className: "text-red-500 bg-red-500/10" },
  neutral: { icon: Info, className: "text-zinc-500 bg-zinc-500/10" },
};

const STATUS_BADGE: Record<string, { variant: "success" | "warning" | "info" | "error" | "default" | "outline"; label: string }> = {
  confirmed: { variant: "info", label: "Confirmé" },
  checked_in: { variant: "default", label: "En séjour" },
  checked_out: { variant: "outline", label: "Terminé" },
  cancelled: { variant: "error", label: "Annulé" },
  no_show: { variant: "error", label: "No-show" },
};

export default function ClientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ClientProfilePayload | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  // Fiche intelligente réservée à la formule Entreprise
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    async function load() {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/");
          return;
        }

        const { data: userData } = await supabase
          .from("users")
          .select("tenant_id")
          .eq("auth_user_id", session.user.id)
          .single();
        if (!userData?.tenant_id) return;
        setTenantId(userData.tenant_id);

        // Contrôle d'accès : la fiche intelligente est réservée à Entreprise
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("plan")
          .eq("tenant_id", userData.tenant_id)
          .maybeSingle();
        if (!canAccessFeature("clientSmartProfile", subData?.plan)) {
          setLocked(true);
          setLoading(false);
          return;
        }

        const [profileRes, bookingsRes] = await Promise.all([
          supabase.rpc("get_client_profile", { p_client_id: clientId }).then((res) => {
            // Si le RPC retourne null ou un objet sans ok, construire un payload par défaut
            if (!res.error && (!res.data || res.data.ok === undefined || res.data.ok === null)) {
              return { data: { ok: true, client: null, profile: null }, error: null };
            }
            return res;
          }),
          supabase
            .from("bookings")
            .select(
              "id, booking_code, status, payment_status, check_in_date, check_out_date, nights_count, total_amount, amount_paid, room_id, room:rooms!room_id(room_number)"
            )
            .eq("client_id", clientId)
            .order("check_in_date", { ascending: false })
            .limit(100),
        ]);

        if (profileRes.error) {
          console.error("get_client_profile RPC error:", profileRes.error);
          toast.error("Erreur lors du chargement du dossier client : " + (profileRes.error.message || "Erreur inconnue"));
          setPayload(null);
        } else {
          const data = profileRes.data as ClientProfilePayload;
          if (!data || data.ok === false || data.ok === undefined) {
            toast.error(data?.error || "Client introuvable ou dossier vide.");
            setPayload(null);
          } else {
            setPayload(data);
          }
        }
        setBookings((bookingsRes.data as unknown as BookingRow[] | null) || []);
      } catch (err) {
        console.error("client profile load failed", err);
        toast.error("Impossible de charger le dossier client.");
      } finally {
        setLoading(false);
      }
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const profile = payload?.profile ?? null;
  const client = payload?.client ?? null;

  const dimensionValues = useMemo(() => {
    if (!profile) return null;
    return DIMENSION_META.map((d) => ({
      ...d,
      value: profile.score.dimensions[d.key],
    }));
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-amber-800 dark:text-amber-300">
            Fiche client intelligente
          </h2>
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            Cette fonctionnalité est réservée à la formule Entreprise : score de réputation, signaux automatiques et dossier client complet.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/subscription")}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Débloquer avec le plan Entreprise
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-3 block mx-auto text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  if (!payload?.ok || !client || !profile) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="text-sm text-zinc-500">Ce dossier client est introuvable ou inaccessible.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/accounting")}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--primary-color,#0C1C33)] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Retour à la Comptabilité
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Bouton retour */}
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Retour
      </button>

      {/* En-tête identité */}
      <div className="rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)] p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[var(--primary-muted,#eef2ff)] flex items-center justify-center font-bold text-xl text-[var(--primary-color,#0C1C33)] flex-shrink-0">
              {client.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{client.full_name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <ClientScoreBadge score={profile.score.total} tier={profile.score.tier} showValue={false} />
                {client.nationality && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                    <MapPin className="w-3 h-3" /> {client.nationality}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            {client.phone && (
              <a
                href={`https://wa.me/${client.phone.replace(/[^+\d]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
            {client.phone && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-300">
                <Phone className="w-3.5 h-3.5" /> {client.phone}
              </span>
            )}
            {client.email && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-300">
                <User className="w-3.5 h-3.5" /> {client.email}
              </span>
            )}
          </div>
        </div>

        {(() => {
          const activeBooking = bookings.find((b) => b.status === "checked_in" || b.status === "confirmed");
          const currentRoom = activeBooking?.room?.[0]?.room_number;
          return currentRoom ? (
            <p className="mt-3 text-[11px] text-zinc-400">
              Chambre actuelle : <span className="font-medium text-slate-600 dark:text-slate-300">{currentRoom}</span>
              {activeBooking ? ` · Séjour ${formatDate(activeBooking.check_in_date)} → ${formatDate(activeBooking.check_out_date)}` : ""}
            </p>
          ) : null;
        })()}
        {client.id_type && (
          <p className="mt-3 text-[11px] text-zinc-400">
            Pièce d&apos;identité : {client.id_type}
            {client.id_number ? ` · ${client.id_number}` : ""}
            {client.address ? ` · ${client.address}` : ""}
          </p>
        )}
        <p className="mt-1 text-[11px] text-zinc-400">
          Client depuis le {client.created_at ? formatDateLong(client.created_at) : "—"}
        </p>
      </div>

      {/* Score + dimensions */}
      <div className="grid gap-4 md:grid-cols-5">
        <div className="md:col-span-2 rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)] p-5">
          <p className="text-xs font-medium text-zinc-500 mb-3">Score de réputation</p>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-strong,#e2e8f0)" strokeWidth="10" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--primary-color,#0C1C33)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${profile.score.total * 2.64} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{profile.score.total}</span>
                <span className="text-[10px] text-zinc-400">/ 100</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {TIER_LABEL[profile.score.tier] ?? profile.score.tier}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                Calculé automatiquement à partir des séjours, paiements et signalements.
              </p>
            </div>
          </div>
        </div>

        <div className="md:col-span-3 rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)] p-5 space-y-3">
          <p className="text-xs font-medium text-zinc-500">Détail des dimensions</p>
          {dimensionValues?.map((d) => (
            <div key={d.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <d.icon className="w-3.5 h-3.5 text-zinc-400" /> {d.label}
                  <span className="text-[10px] text-zinc-400 font-normal">({d.weight})</span>
                </span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">{Math.round(d.value)}/100</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700/50 overflow-hidden">
                <div className={`h-full rounded-full ${d.color} transition-all`} style={{ width: `${Math.max(0, Math.min(100, d.value))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Signaux */}
      {profile.signals.length > 0 && (
        <div className="rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)] p-5">
          <p className="text-xs font-medium text-zinc-500 mb-3">Signaux automatiques</p>
          <div className="flex flex-wrap gap-2">
            {profile.signals.map((s, i) => {
              const meta = SIGNAL_META[s.tone] ?? SIGNAL_META.neutral;
              const Icon = meta.icon;
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${meta.className}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {s.text}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)]">
          <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><CalendarDays className="w-3 h-3" /> Séjours</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white tabular-nums">{profile.stats.stay_count}</p>
          <p className="text-[11px] text-zinc-400">{profile.stats.total_nights} nuits</p>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)]">
          <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><Banknote className="w-3 h-3" /> Chiffre d&apos;affaires</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{formatAmount(profile.stats.total_revenue)}</p>
          <p className="text-[11px] text-zinc-400">encaissé {formatAmount(profile.stats.total_paid)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)]">
          <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><Wallet className="w-3 h-3" /> Panier moyen</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{formatAmount(profile.stats.avg_stay_amount)}</p>
          <p className="text-[11px] text-zinc-400">par séjour</p>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)]">
          <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><AlertTriangle className="w-3 h-3" /> Solde dû</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${profile.stats.balance_due > 0 ? "text-red-600" : "text-green-600"}`}>
            {profile.stats.balance_due > 0 ? formatAmount(profile.stats.balance_due) : "À jour"}
          </p>
          <p className="text-[11px] text-zinc-400">{profile.stats.preferred_room_type ? `préfère ${profile.stats.preferred_room_type}` : "chambre non déterminée"}</p>
        </div>
      </div>

      {/* Réservations */}
      <div className="rounded-2xl bg-[var(--card-bg,#fff)] border border-[var(--card-border,#e5e7eb)] p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          Réservations ({bookings.length})
        </h3>
        {bookings.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6 text-center">Aucune réservation</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => {
              const status = STATUS_BADGE[b.status] ?? { variant: "default" as const, label: b.status };
              return (
                <div key={b.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {b.booking_code}
                        <span className="ml-2 text-xs font-normal text-zinc-400">
                          {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {formatNumber(b.nights_count)} nuit{b.nights_count > 1 ? "s" : ""}
                        {b.room?.[0]?.room_number ? ` · Chambre ${b.room[0].room_number}` : ""}
                        {" · "}
                        {formatAmount(b.total_amount)} · payé {formatAmount(b.amount_paid)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Badge variant={b.payment_status === "paid" ? "success" : b.payment_status === "partial" ? "warning" : "error"}>
                          {b.payment_status === "paid" ? "Soldé" : b.payment_status === "partial" ? "Partiel" : b.payment_status === "refunded" ? "Remboursé" : "Impayé"}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedBookingId(expandedBookingId === b.id ? null : b.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--primary-color,#0C1C33)] hover:underline"
                      >
                        <History className="w-3 h-3" />
                        {expandedBookingId === b.id ? "Masquer l'historique" : "Historique du séjour"}
                      </button>
                    </div>
                  </div>
                  {expandedBookingId === b.id && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                      <StayTimeline bookingId={b.id} tenantId={tenantId} clientId={clientId} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
