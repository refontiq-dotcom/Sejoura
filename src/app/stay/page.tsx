"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Bed,
  Headphones,
  Phone,
  MessageCircle,
  MapPin,
  Clock,
  CheckCircle2,
  Home,
  ShoppingBag,
  Wallet,
  Contact,
  CalendarDays,
  LogOut,
  Wifi,
  ArrowRight,
  X,
  Loader2,
  AlertTriangle,
  PartyPopper,
  KeyRound,
  Info,
  Moon,
} from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { getThemePresetById } from "@/lib/colors";
import type { ClientStayPayload } from "@/types/database";

type Tab = "home" | "services" | "payment" | "contact";

// Résout la couleur primaire de l'établissement : accepte un hex (#0C1C33) ou
// un identifiant de thème ("navy") stocké en base (settings → thème).
function resolvePrimaryColor(value?: string | null): string {
  if (!value || !value.trim()) return "#0C1C33";
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  return getThemePresetById(clean).sidebarBg;
}

interface ServiceRequestDraft {
  type: string;
  message: string;
  submitting: boolean;
}

const SERVICE_DEFS = [
  {
    type: "cleaning",
    label: "Ménage",
    description: "Demander un nettoyage de votre chambre",
    icon: Sparkles,
    color: "bg-emerald-500",
  },
  {
    type: "linen",
    label: "Literie / linge",
    description: "Draps, serviettes ou linge supplémentaire",
    icon: Bed,
    color: "bg-sky-500",
  },
  {
    type: "assistance",
    label: "Assistance",
    description: "Une question ou un besoin particulier ?",
    icon: Headphones,
    color: "bg-amber-500",
  },
] as const;

function formatDateFR(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function formatDateLongFR(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function firstName(fullName: string): string {
  const clean = fullName.trim();
  if (!clean) return "";
  return clean.split(/\s+/)[0];
}

export default function StayPage() {
  return <StayPortal />;
}

function StayPortal() {
  const { fmt } = useCurrency();
  const [data, setData] = useState<ClientStayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  const [now, setNow] = useState(() => Date.now());
  const [request, setRequest] = useState<ServiceRequestDraft | null>(null);
  const [sentRequests, setSentRequests] = useState<Record<string, number>>({});
  const tokenRef = useRef<string>("");
  const lookupInFlight = useRef(false);

  const primaryColor = resolvePrimaryColor(data?.tenant?.primary_color);

  const loadStay = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || lookupInFlight.current) return;
    lookupInFlight.current = true;
    try {
      const res = await fetch(`/api/stay/lookup?token=${encodeURIComponent(token)}`);
      const json = (await res.json()) as ClientStayPayload;
      if (res.ok && json && typeof json.valid === "boolean") {
        setData(json);
      }
    } catch {
      // Réessai au prochain tick
    } finally {
      lookupInFlight.current = false;
    }
  }, []);

  // Lecture du token depuis l'URL + chargement initial
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData({
        valid: false,
        state: "invalid",
        reason: "Lien manquant. Utilisez le lien reçu par l'établissement.",
      });
      setLoading(false);
      return;
    }
    tokenRef.current = token;
    setLoading(true);
    loadStay().finally(() => setLoading(false));
  }, [loadStay]);

  // Polling intelligent : rafraîchit l'état toutes les 60 s et à chaque retour
  // sur l'onglet (détecte check-out, prolongation, auto check-out).
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      loadStay();
    }, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        loadStay();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadStay]);

  const valid = Boolean(data?.valid);
  const state = data?.state ?? "invalid";
  const isActive = valid && state === "active";

  // Branding de l'établissement
  useEffect(() => {
    if (!primaryColor) return;
    const root = document.documentElement;
    root.style.setProperty("--portal", primaryColor);
    return () => {
      root.style.removeProperty("--portal");
    };
  }, [primaryColor]);

  if (loading) {
    return <PortalSplash color={primaryColor} />;
  }

  if (!data || !isActive) {
    return <PortalStateView payload={data} />;
  }

  const booking = data.booking!;
  const tenant = data.tenant!;
  const accommodation = data.accommodation!;
  const room = data.room!;
  const client = data.client!;

  const checkOutDate = new Date(`${booking.check_out_date}T${booking.check_out_time || "11:00"}`);
  const checkInDate = new Date(`${booking.check_in_date}T${booking.check_in_time || "14:00"}`);
  const isCheckedIn = booking.status === "checked_in";
  const isOverstay = isCheckedIn && now > checkOutDate.getTime();

  const daysUntilCheckIn = Math.ceil((checkInDate.getTime() - now) / 86_400_000);
  const daysLeft = Math.max(0, Math.ceil((checkOutDate.getTime() - now) / 86_400_000));
  const nightsElapsed = isCheckedIn
    ? Math.max(0, Math.round((now - checkInDate.getTime()) / 86_400_000))
    : 0;
  const progress = booking.nights_count > 0
    ? Math.min(100, Math.round((nightsElapsed / booking.nights_count) * 100))
    : 0;

  const statusChip = isCheckedIn
    ? isOverstay
      ? { label: "Séjour prolongé", className: "bg-amber-500 text-white" }
      : { label: "Séjour en cours", className: "bg-emerald-500 text-white" }
    : { label: "Arrivée prévue", className: "bg-blue-500 text-white" };

  const remaining = Math.max(0, booking.total_amount - booking.amount_paid);

  const handleRequestOpen = (type: string) => {
    setRequest({ type, message: "", submitting: false });
  };

  const handleRequestSubmit = async () => {
    if (!request || request.submitting) return;
    setRequest({ ...request, submitting: true });
    try {
      const res = await fetch("/api/stay/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current, request_type: request.type, message: request.message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Échec de la demande");
      setSentRequests((prev) => ({ ...prev, [request.type]: (prev[request.type] || 0) + 1 }));
      setRequest(null);
    } catch (err) {
      setRequest({ ...request, submitting: false, message: request.message });
      window.alert(err instanceof Error ? err.message : "Une erreur est survenue.");
    }
  };

  const whatsappLink = tenant.contact_phone
    ? `https://wa.me/${tenant.contact_phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
        `Bonjour ${tenant.company_name}, je suis en chambre ${room.room_number} (${booking.booking_code}).`
      )}`
    : "";

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[var(--background)] text-[var(--foreground)]"
      style={{ ["--primary-color" as string]: primaryColor }}
    >
      {/* ── Header ── */}
      <header className="relative overflow-hidden px-5 pt-6 pb-5 text-white"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, color-mix(in srgb, ${primaryColor} 75%, #0C1C33) 100%)`,
        }}>
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt={tenant.company_name} className="h-10 w-10 rounded-xl bg-white/90 object-contain p-1" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 font-bold text-lg">
                {(tenant.company_name || "S").charAt(0)}
              </div>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/70">{tenant.company_name}</p>
              <p className="text-sm font-bold leading-tight">
                {firstName(client.full_name) ? `Bonjour ${firstName(client.full_name)}` : "Bonjour et bienvenue"}
              </p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold shadow ${statusChip.className}`}>
            {statusChip.label}
          </span>
        </div>
      </header>

      {/* ── Contenu ── */}
      <main className="flex-1 space-y-4 px-4 pb-28 pt-4">
        {tab === "home" && (
          <>
            {/* Carte du séjour */}
            <div className="relative overflow-hidden rounded-3xl border border-[var(--border-card)] bg-white p-5 shadow-sm dark:bg-slate-900">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Chambre</p>
                  <p className="mt-0.5 text-3xl font-extrabold tracking-tight">{room.room_number}</p>
                  <p className="text-xs text-slate-500">{room.room_type_name || "Chambre"}{room.floor ? ` · Étage ${room.floor}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Code séjour</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-[var(--primary-color)]">{booking.booking_code}</p>
                  <p className="text-[11px] text-slate-400">{booking.nights_count} nuit{booking.nights_count > 1 ? "s" : ""}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
                <div className="text-center">
                  <p className="text-[10px] uppercase text-slate-400">Arrivée</p>
                  <p className="text-sm font-bold">{formatDateFR(booking.check_in_date)}</p>
                  <p className="text-[11px] text-slate-500">{booking.check_in_time}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
                <div className="text-center">
                  <p className="text-[10px] uppercase text-slate-400">Départ</p>
                  <p className="text-sm font-bold">{formatDateFR(booking.check_out_date)}</p>
                  <p className="text-[11px] text-slate-500">{booking.check_out_time}</p>
                </div>
              </div>
            </div>

            {/* Compte à rebours / progression */}
            <div className="rounded-3xl border border-[var(--border-card)] bg-white p-5 shadow-sm dark:bg-slate-900">
              {isCheckedIn ? (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        {isOverstay ? "Séjour prolongé" : "Temps restant"}
                      </p>
                      <p className="text-4xl font-extrabold leading-none text-[var(--primary-color)]">
                        {isOverstay ? "∞" : `${daysLeft} j`}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {isOverstay ? "En attendant votre départ, profitez de votre séjour." : "dont vous pourrez encore profiter"}
                    </p>
                  </div>
                  {!isOverstay && (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-[var(--primary-color)] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Avant votre arrivée</p>
                      <p className="text-4xl font-extrabold leading-none text-[var(--primary-color)]">
                        {daysUntilCheckIn > 0 ? `${daysUntilCheckIn} j` : "Aujourd'hui"}
                      </p>
                    </div>
                    <p className="flex items-center gap-1 text-xs text-slate-400"><CalendarDays className="h-4 w-4" /> {formatDateLongFR(booking.check_in_date)}</p>
                  </div>
                </>
              )}
            </div>

            {/* Informations pratiques */}
            <div className="rounded-3xl border border-[var(--border-card)] bg-white p-5 shadow-sm dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold">Informations pratiques</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-300">
                    {accommodation.name}
                    {accommodation.address ? ` · ${accommodation.address}` : ""}
                    {accommodation.city ? `, ${accommodation.city}` : ""}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-300">
                    Check-in {booking.check_in_time} · Check-out {booking.check_out_time}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-300">Wi-Fi gratuit disponible</span>
                </li>
                {booking.special_requests ? (
                  <li className="flex items-start gap-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-300">« {booking.special_requests} »</span>
                  </li>
                ) : null}
              </ul>
            </div>

            {/* Accès rapides */}
            <button
              onClick={() => setTab("services")}
              className="flex w-full items-center justify-between rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-left dark:border-emerald-900 dark:bg-emerald-900/30"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white"><Sparkles className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-bold text-emerald-900 dark:text-emerald-100">Besoin de quelque chose ?</span>
                  <span className="block text-xs text-emerald-700 dark:text-emerald-300">Demandez un service à la réception</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-emerald-600" />
            </button>
          </>
        )}

        {tab === "services" && (
          <>
            <div className="px-1 pt-1">
              <h2 className="text-lg font-extrabold">Services</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Votre demande est transmise instantanément au personnel.
              </p>
            </div>
            <div className="space-y-3">
              {SERVICE_DEFS.map((service) => {
                const Icon = service.icon;
                const sentCount = sentRequests[service.type] || 0;
                return (
                  <button
                    key={service.type}
                    onClick={() => handleRequestOpen(service.type)}
                    className="flex w-full items-center gap-4 rounded-3xl border border-[var(--border-card)] bg-white p-4 text-left shadow-sm transition active:scale-[0.98] dark:bg-slate-900"
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${service.color} text-white`}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold">{service.label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{service.description}</span>
                      {sentCount > 0 && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> {sentCount} demande{sentCount > 1 ? "s" : ""} envoyée{sentCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tab === "payment" && (
          <>
            <div className="px-1 pt-1">
              <h2 className="text-lg font-extrabold">Paiement</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Récapitulatif de votre séjour.</p>
            </div>
            <div className="rounded-3xl border border-[var(--border-card)] bg-white p-5 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3 dark:border-slate-700">
                <span className="text-sm text-slate-500 dark:text-slate-400">Montant du séjour</span>
                <span className="text-sm font-bold">{fmt(booking.total_amount)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-slate-200 py-3 dark:border-slate-700">
                <span className="text-sm text-slate-500 dark:text-slate-400">Déjà réglé</span>
                <span className="text-sm font-bold text-emerald-600">− {fmt(booking.amount_paid)}</span>
              </div>
              <div className="flex items-center justify-between pt-3">
                <span className="text-sm font-bold">Restant dû</span>
                <span className={`text-lg font-extrabold ${remaining > 0 ? "text-amber-500" : "text-emerald-600"}`}>
                  {remaining > 0 ? fmt(remaining) : "Soldé ✓"}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Pour tout règlement ou question, merci de contacter la réception.</span>
            </div>
          </>
        )}

        {tab === "contact" && (
          <>
            <div className="px-1 pt-1">
              <h2 className="text-lg font-extrabold">Contact</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Nous sommes à votre disposition.</p>
            </div>
            <div className="space-y-3">
              {tenant.contact_phone && (
                <a
                  href={`tel:${tenant.contact_phone.replace(/[^0-9]/g, "")}`}
                  className="flex w-full items-center gap-4 rounded-3xl border border-[var(--border-card)] bg-white p-4 shadow-sm dark:bg-slate-900"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-color)] text-white">
                    <Phone className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold">Appeler la réception</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{tenant.contact_phone}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </a>
              )}
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-4 rounded-3xl border border-[var(--border-card)] bg-white p-4 shadow-sm dark:bg-slate-900"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold">Écrire sur WhatsApp</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">Réponse rapide de l&apos;équipe</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </a>
              )}
              <div className="rounded-3xl border border-[var(--border-card)] bg-white p-4 shadow-sm dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">{accommodation.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {[accommodation.address, accommodation.city].filter(Boolean).join(", ") || "Côte d'Ivoire"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>En cas d&apos;urgence, contactez immédiatement la réception ou le numéro d&apos;urgence local.</span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Barre de navigation basse ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-[var(--border)] bg-white/90 backdrop-blur-lg dark:bg-slate-900/90">
        <div className="grid grid-cols-4">
          <TabButton active={tab === "home"} onClick={() => setTab("home")} icon={Home} label="Accueil" />
          <TabButton active={tab === "services"} onClick={() => setTab("services")} icon={ShoppingBag} label="Services" />
          <TabButton active={tab === "payment"} onClick={() => setTab("payment")} icon={Wallet} label="Paiement" />
          <TabButton active={tab === "contact"} onClick={() => setTab("contact")} icon={Contact} label="Contact" />
        </div>
      </nav>

      {/* ── Sheet de demande de service ── */}
      {request && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => !request.submitting && setRequest(null)}>
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-extrabold">
                {SERVICE_DEFS.find((s) => s.type === request.type)?.label}
              </h3>
              <button onClick={() => setRequest(null)} disabled={request.submitting} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={request.message}
              onChange={(e) => setRequest({ ...request, message: e.target.value })}
              disabled={request.submitting}
              rows={4}
              placeholder="Précisez votre demande (facultatif)…"
              className="w-full resize-none rounded-2xl border border-[var(--input-border)] bg-[var(--surface-sunken)] p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
            />
            <Button
              className="mt-4 w-full"
              onClick={handleRequestSubmit}
              loading={request.submitting}
            >
              {request.submitting ? "Envoi…" : "Envoyer la demande"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
        active ? "text-[var(--primary-color)]" : "text-slate-400"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function PortalSplash({ color }: { color: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 bg-[var(--background)]">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 70%, #0C1C33) 100%)` }}
      >
        <KeyRound className="h-7 w-7" />
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      <p className="text-xs text-slate-400">Chargement de votre séjour…</p>
    </div>
  );
}

function PortalStateView({ payload }: { payload: ClientStayPayload | null }) {
  const { fmt } = useCurrency();
  const state = payload?.state ?? "invalid";
  const reason = payload?.reason;

  const configs = {
    invalid: {
      icon: AlertTriangle,
      title: "Accès introuvable",
      subtitle: reason || "Ce lien est invalide ou a expiré.",
      accent: "text-slate-500 bg-slate-100 dark:bg-slate-800",
    },
    unavailable: {
      icon: AlertTriangle,
      title: "Service indisponible",
      subtitle: reason || "L'espace client n'est pas disponible pour cet établissement.",
      accent: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
    },
    ended: {
      icon: PartyPopper,
      title: "Merci de votre visite !",
      subtitle: "Votre séjour est terminé. Nous espérons vous revoir bientôt.",
      accent: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
    },
    cancelled: {
      icon: X,
      title: "Séjour annulé",
      subtitle: "Cette réservation a été annulée.",
      accent: "text-red-500 bg-red-50 dark:bg-red-900/20",
    },
    expired: {
      icon: LogOut,
      title: "Séjour terminé",
      subtitle: "La période de votre séjour est écoulée.",
      accent: "text-slate-500 bg-slate-100 dark:bg-slate-800",
    },
  } as const;

  const cfg = state in configs ? configs[state as keyof typeof configs] : configs.invalid;
  const Icon = cfg.icon;
  const booking = payload?.booking;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 bg-[var(--background)] px-8 text-center">
      <div className={`flex h-20 w-20 items-center justify-center rounded-3xl ${cfg.accent}`}>
        <Icon className="h-9 w-9" />
      </div>
      <div>
        <h1 className="text-xl font-extrabold text-[var(--foreground)]">{cfg.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{cfg.subtitle}</p>
      </div>
      {booking && state === "ended" && (
        <div className="w-full rounded-3xl border border-[var(--border-card)] bg-white p-4 text-left text-sm shadow-sm dark:bg-slate-900">
          <p className="font-bold">{booking.booking_code}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {booking.nights_count} nuit{booking.nights_count > 1 ? "s" : ""} · {fmt(booking.total_amount)}
          </p>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Moon className="h-3.5 w-3.5" /> {payload?.tenant?.company_name || "Séjoura"}
      </p>
    </div>
  );
}
