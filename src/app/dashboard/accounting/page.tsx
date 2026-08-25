"use client";

import { toast } from "sonner";
import { useState, useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  formatDate,
  getExpenseCategoryLabel,
  getPaymentMethodLabel,
  getMobileMoneyOperatorLabel,
  isMobileMoney,
  MOBILE_MONEY_OPERATORS,
  canAccessPlanFeature,
} from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { useAccommodation } from "@/hooks/use-accommodation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StayTimeline } from "@/components/stay-timeline";
import { ClientScoreBadge } from "@/components/client-score-badge";
import type { Expense, AuditLog, Payment, Invoice, Client, Booking, ClientScoreTier, InvoiceStatus } from "@/types/database";


// ── Actions d'audit : emojis + labels FR + couleurs + catégories ──
const AUDIT_ACTIONS: Record<string, { label: string; emoji: string; color: string; bg: string; category: string }> = {
  "booking.created":        { label: "Réservation créée",            emoji: "📅", color: "text-blue-600",     bg: "bg-blue-50 dark:bg-blue-950/30",     category: "reservation" },
  "booking.checked_in":     { label: "Check-in effectué",            emoji: "✅", color: "text-emerald-600",  bg: "bg-emerald-50 dark:bg-emerald-950/30", category: "reservation" },
  "booking.checked_out":    { label: "Check-out effectué",           emoji: "🏁", color: "text-amber-600",    bg: "bg-amber-50 dark:bg-amber-950/30",   category: "reservation" },
  "booking.cancelled":      { label: "Réservation annulée",          emoji: "❌", color: "text-red-600",      bg: "bg-red-50 dark:bg-red-950/30",       category: "reservation" },
  "booking.payment_recorded": { label: "Paiement enregistré",        emoji: "💰", color: "text-emerald-600",  bg: "bg-emerald-50 dark:bg-emerald-950/30", category: "paiement" },
  "price_change":           { label: "Prix modifié",                 emoji: "📊", color: "text-purple-600",   bg: "bg-purple-50 dark:bg-purple-950/30",  category: "paiement" },
  "overstay_detected":      { label: "Séjour prolongé détecté",      emoji: "⏰", color: "text-orange-600",   bg: "bg-orange-50 dark:bg-orange-950/30",  category: "systeme" },
  "auto_checkout":          { label: "Check-out automatique",        emoji: "⚡", color: "text-orange-600",   bg: "bg-orange-50 dark:bg-orange-950/30",  category: "systeme" },
  "invoice_generated":      { label: "Facture générée",              emoji: "📄", color: "text-indigo-600",   bg: "bg-indigo-50 dark:bg-indigo-950/30",  category: "facturation" },
  "invoice_sent":           { label: "Facture envoyée",              emoji: "📩", color: "text-blue-600",     bg: "bg-blue-50 dark:bg-blue-950/30",     category: "facturation" },
  "invoice_paid":           { label: "Facture payée",                emoji: "✅", color: "text-emerald-600",  bg: "bg-emerald-50 dark:bg-emerald-950/30", category: "facturation" },
  "invoice_cancelled":      { label: "Facture annulée",              emoji: "❌", color: "text-red-600",      bg: "bg-red-50 dark:bg-red-950/30",       category: "facturation" },
  "expense.created":        { label: "Dépense enregistrée",          emoji: "🧾", color: "text-rose-600",     bg: "bg-rose-50 dark:bg-rose-950/30",     category: "depense" },
  "expense.updated":        { label: "Dépense modifiée",             emoji: "✏️",  color: "text-rose-600",     bg: "bg-rose-50 dark:bg-rose-950/30",     category: "depense" },
  "auth.login":             { label: "Connexion",                    emoji: "🔑", color: "text-slate-600",    bg: "bg-slate-50 dark:bg-slate-950/30",   category: "auth" },
  "auth.logout":            { label: "Déconnexion",                  emoji: "🔒", color: "text-slate-600",    bg: "bg-slate-50 dark:bg-slate-950/30",   category: "auth" },
  "employee.created":       { label: "Employé ajouté",               emoji: "👤", color: "text-cyan-600",     bg: "bg-cyan-50 dark:bg-cyan-950/30",     category: "personnel" },
  "employee.updated":       { label: "Employé modifié",              emoji: "✏️",  color: "text-cyan-600",     bg: "bg-cyan-50 dark:bg-cyan-950/30",     category: "personnel" },
  "employee.deleted":       { label: "Employé supprimé",             emoji: "🚫", color: "text-red-600",      bg: "bg-red-50 dark:bg-red-950/30",       category: "personnel" },
  "employee.role_changed":  { label: "Rôle modifié",                 emoji: "👑", color: "text-cyan-600",     bg: "bg-cyan-50 dark:bg-cyan-950/30",     category: "personnel" },
  "room.status_changed":    { label: "Statut chambre modifié",       emoji: "🏠", color: "text-violet-600",   bg: "bg-violet-50 dark:bg-violet-950/30", category: "chambre" },
  "room.created":           { label: "Chambre créée",                emoji: "🏠", color: "text-violet-600",   bg: "bg-violet-50 dark:bg-violet-950/30", category: "chambre" },
  "subscription.activated": { label: "Abonnement activé",            emoji: "📈", color: "text-emerald-600",  bg: "bg-emerald-50 dark:bg-emerald-950/30", category: "abonnement" },
  "subscription.expired":   { label: "Abonnement expiré",            emoji: "⏳", color: "text-red-600",      bg: "bg-red-50 dark:bg-red-950/30",       category: "abonnement" },
  "subscription.plan_changed": { label: "Formule changée",           emoji: "🔄", color: "text-purple-600",   bg: "bg-purple-50 dark:bg-purple-950/30",  category: "abonnement" },
  "settings.updated":       { label: "Paramètres modifiés",          emoji: "⚙️",  color: "text-slate-600",    bg: "bg-slate-50 dark:bg-slate-950/30",   category: "parametres" },
  "settings.logo_uploaded": { label: "Logo mis à jour",              emoji: "🖼️",  color: "text-slate-600",    bg: "bg-slate-50 dark:bg-slate-950/30",   category: "parametres" },
};

const AUDIT_CATEGORIES: Record<string, { label: string; emoji: string }> = {
  reservation: { label: "Réservations",        emoji: "📅" },
  paiement:    { label: "Paiements",           emoji: "💰" },
  facturation: { label: "Facturation",         emoji: "📄" },
  depense:     { label: "Dépenses",            emoji: "🧾" },
  systeme:     { label: "Système",             emoji: "⚙️" },
  auth:        { label: "Authentification",    emoji: "🔑" },
  personnel:   { label: "Personnel",           emoji: "👤" },
  chambre:     { label: "Chambres",            emoji: "🏠" },
  abonnement:  { label: "Abonnement",          emoji: "📈" },
  parametres:  { label: "Paramètres",          emoji: "⚙️" },
};

function getAuditActionInfo(action: string) {
  if (AUDIT_ACTIONS[action]) return AUDIT_ACTIONS[action];
  const guess = action.replace(/[._]/g, " ");
  return { label: guess.charAt(0).toUpperCase() + guess.slice(1), emoji: "📝", color: "text-[var(--foreground-muted)]", bg: "bg-[var(--surface-sunken)]", category: "systeme" };
}

function buildAuditSummary(log: AuditLog, users: Record<string, string>): string {
  const who = users[log.user_id || ""] || "Le système";
  const vals = log.new_values || log.old_values || {};

  switch (log.action) {
    case "booking.checked_in":
      return who + " a effectué le check-in" + (vals.room_number ? " (chambre " + vals.room_number + ")" : "") + (vals.client_name ? " pour " + vals.client_name : "");
    case "booking.checked_out":
      return who + " a effectué le check-out" + (vals.room_number ? " (chambre " + vals.room_number + ")" : "");
    case "booking.cancelled":
      return who + " a annulé la réservation" + (vals.client_name ? " de " + vals.client_name : "");
    case "booking.created":
      return who + " a créé une réservation" + (vals.client_name ? " pour " + vals.client_name : "") + (vals.room_number ? " (chambre " + vals.room_number + ")" : "");
    case "price_change": {
      const old = log.old_values?.negotiated_price;
      const nw = log.new_values?.negotiated_price;
      if (old != null && nw != null) {
        const diff = Number(nw) - Number(old);
        const sign = diff > 0 ? "+" : "";
        return who + " a modifié le prix : " + new Intl.NumberFormat("fr-FR").format(Number(old)) + " → " + new Intl.NumberFormat("fr-FR").format(Number(nw)) + " FCFA (" + sign + new Intl.NumberFormat("fr-FR").format(diff) + " FCFA)";
      }
      return who + " a modifié le prix";
    }
    case "overstay_detected":
      return "Dépassement de séjour détecté automatiquement" + (vals.client_name ? " pour " + vals.client_name : "");
    case "auto_checkout":
      return "Check-out automatique effectué" + (vals.room_number ? " (chambre " + vals.room_number + ")" : "");
    case "invoice_generated":
      return who + " a généré " + (vals.invoice_number ? "la facture " + vals.invoice_number : "une facture") + (vals.total_amount ? " — " + new Intl.NumberFormat("fr-FR").format(Number(vals.total_amount)) + " FCFA" : "");
    case "expense.created":
      return who + " a enregistré une dépense" + (vals.amount ? " de " + new Intl.NumberFormat("fr-FR").format(Number(vals.amount)) + " FCFA" : "") + (vals.description ? " : " + vals.description : "");
    case "expense.updated":
      return who + " a modifié une dépense" + (vals.description ? " : " + vals.description : "");
    case "auth.login":
      return who + " s'est connecté(e)";
    case "auth.logout":
      return who + " s'est déconnecté(e)";
    case "employee.created":
      return who + " a ajouté l'employé" + (vals.full_name ? " " + vals.full_name : "");
    case "employee.deleted":
      return who + " a supprimé l'employé" + (vals.full_name ? " " + vals.full_name : "");
    case "subscription.activated":
      return "Abonnement " + (vals.plan || "") + " activé";
    case "subscription.expired":
      return "L'abonnement a expiré";
    case "subscription.plan_changed":
      return "Formule changée" + (vals.plan ? " vers " + vals.plan : "");
    default:
      return who + " a effectué une action sur " + log.entity_type;
  }
}

function groupAuditLogsByDate(logs: AuditLog[]): { group: string; items: AuditLog[] }[] {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const groups: Record<string, AuditLog[]> = {};
  const order: string[] = [];
  for (const log of logs) {
    const d = log.created_at.slice(0, 10);
    let key: string;
    if (d === today) key = "Aujourd'hui";
    else if (d === yesterday) key = "Hier";
    else key = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(log);
  }
  return order.map((g) => ({ group: g, items: groups[g] }));
}

// ── Libellés lisibles pour les champs d'audit ──
const AUDIT_FIELD_LABELS: Record<string, string> = {
  negotiated_price: "Prix négocié",
  total_amount: "Montant total",
  payment_status: "Statut du paiement",
  status: "Statut",
  room_number: "Numéro de chambre",
  client_name: "Nom du client",
  start_date: "Date de début",
  end_date: "Date de fin",
  base_price: "Prix de base",
  amount: "Montant",
  category: "Catégorie",
  description: "Description",
  expense_date: "Date de la dépense",
  full_name: "Nom complet",
  email: "E-mail",
  phone: "Téléphone",
  role: "Rôle",
  plan: "Formule",
  room_type: "Type de chambre",
  capacity: "Capacité",
  surface_m2: "Surface (m²)",
  amenities: "Commodités",
  featured_images: "Photos",
  is_listed_on_trouvetou: "Publié sur Trouvetou",
  method: "Méthode de paiement",
  operator: "Opérateur",
  paid_at: "Date de paiement",
  notes: "Notes",
  extended_by: "Extendu par",
  nights_count: "Nombre de nuits",
  check_in_date: "Date d'arrivée",
  check_out_date: "Date de départ",
  check_out_time: "Heure de départ",
  amount_paid: "Montant payé",
  booking_id: "Réservation",
  client_id: "Client",
  room_id: "Chambre",
  accommodation_id: "Établissement",
  user_id: "Utilisateur",
  tenant_id: "Établissement",
  invoice_number: "Numéro de facture",
  pdf_url: "Lien PDF",
  booking_code: "Code réservation",
  nights: "Nuits",
  stayCount: "Séjours",
  totalSpent: "CA total",
  paid: "Montant payé",
  balance: "Solde",
  score: "Score",
  tier: "Niveau",
  nationality: "Nationalité",
  id_type: "Type de pièce",
  id_number: "Numéro de pièce",
};

/** Transforme une clé snake_case en libellé lisible */
function auditFieldLabel(key: string): string {
  return AUDIT_FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Formate une valeur brute pour l'affichage */
// Champs qui contiennent des UUIDs internes — on les cache
const UUID_FIELDS = new Set([
  "extended_by", "booking_id", "client_id", "room_id", "accommodation_id",
  "user_id", "tenant_id", "entity_id",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Formate une valeur brute pour l'affichage */
function auditFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") {
    if (["negotiated_price", "total_amount", "amount", "base_price", "amount_paid"].includes(key)) {
      return new Intl.NumberFormat("fr-FR").format(value) + " FCFA";
    }
    return String(value);
  }
  const s = String(value);
  // Masquer les UUIDs
  if (UUID_FIELDS.has(key) && UUID_RE.test(s)) return "—";
  if (UUID_RE.test(s) && key.endsWith("_id")) return "—";
  // Dates ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && s.length <= 10) {
    try { return new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); } catch {}
  }
  // Heures HH:MM:SS
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.replace(":00", "").replace(/^0/, "") + " h";
  }
  return s;
}
import { Send, XCircle } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Wallet,
  Plus,
  Loader2,
  TrendingUp,
  TrendingDown,
  ScrollText,
  Download,
  Receipt,
  Eye,
  Lock,
  Sparkles,
  RefreshCw,
  Search,
  Users,
  User,
  Phone,
  Pencil,
  Trash2,
  Banknote,
  Smartphone,
  Building,
  Coins,
  Calendar,
  FileText,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  History,
  Landmark,
  Zap,
  Wrench,
  Package,
  Megaphone,
  PieChart as PieChartIcon,
} from "lucide-react";

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  partial: "Partielle",
  cancelled: "Annulée",
};

// Transitions de statut valides pour les factures
// Seules ces transitions sont autorisées : on ne peut pas revenir en arrière
// ni sauter d'état (ex: directement draft → paid sans passer par sent)
const VALID_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["sent", "cancelled"],      // Brouillon → envoyée ou annulée
  sent: ["paid", "partial", "cancelled"], // Envoyée → payée, partielle ou annulée
  partial: ["paid", "cancelled"],     // Partielle → payée ou annulée
  paid: [],                            // Payée → état terminal
  cancelled: [],                       // Annulée → état terminal
};

// Configuration des actions par statut
const INVOICE_STATUS_ACTIONS: Record<InvoiceStatus, { status: InvoiceStatus; label: string; icon: string; color: string }[]> = {
  draft: [
    { status: "sent", label: "Marquer envoyée", icon: "send", color: "blue" },
    { status: "cancelled", label: "Annuler", icon: "cancel", color: "red" },
  ],
  sent: [
    { status: "paid", label: "Marquer payée", icon: "paid", color: "green" },
    { status: "partial", label: "Paiement partiel", icon: "partial", color: "amber" },
    { status: "cancelled", label: "Annuler", icon: "cancel", color: "red" },
  ],
  partial: [
    { status: "paid", label: "Marquer payée", icon: "paid", color: "green" },
    { status: "cancelled", label: "Annuler", icon: "cancel", color: "red" },
  ],
  paid: [],
  cancelled: [],
};

const EXPENSE_CATEGORY_GROUPS: { group: string; items: { value: string; hint?: string }[] }[] = [
  {
    group: "Charges",
    items: [
      { value: "utilities", hint: "CIE, SODECI, Internet" },
      { value: "rent", hint: "Loyer du local" },
      { value: "taxes", hint: "Taxes & impôts" },
    ],
  },
  {
    group: "Opérationnel",
    items: [
      { value: "supplies", hint: "Blanchisserie, Produits d'entretien" },
      { value: "maintenance", hint: "Maintenance & réparations" },
      { value: "marketing", hint: "Marketing & publicité" },
    ],
  },
  {
    group: "Personnel",
    items: [{ value: "salaries", hint: "Salaire, Avance, Prime" }],
  },
  {
    group: "Autre sortie de caisse",
    items: [{ value: "other", hint: "Autre dépense / sortie de caisse" }],
  },
];

const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.items.map((i) => i.value));

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  salaries: "#0C1C33",
  utilities: "#3b82f6",
  maintenance: "#f59e0b",
  supplies: "#10b981",
  marketing: "#8b5cf6",
  rent: "#c2944e",
  taxes: "#ef4444",
  other: "#64748b",
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  salaries: Users,
  utilities: Zap,
  maintenance: Wrench,
  supplies: Package,
  marketing: Megaphone,
  rent: Building,
  taxes: Landmark,
  other: Coins,
};

type TabKey = "overview" | "revenue" | "expenses" | "invoices" | "audit" | "clients";
type PeriodKey = "today" | "7d" | "month" | "30d" | "12m" | "custom";

interface EnrichedPayment extends Payment {
  booking?: {
    booking_code: string;
    client_name: string;
    room_number: string;
    total_amount: number;
    payment_status: string;
  } | null;
}

function paymentMethodDisplay(p: { payment_method: string; mobile_money_operator?: string | null }): string {
  const base = getPaymentMethodLabel(p.payment_method);
  if (p.payment_method === "mobile_money" && p.mobile_money_operator) {
    return `${base} · ${getMobileMoneyOperatorLabel(p.mobile_money_operator)}`;
  }
  return base;
}

interface EnrichedInvoice extends Invoice {
  booking?: { booking_code: string; client_name: string } | null;
}

interface ClientWithStats extends Client {
  bookings: Booking[];
  stayCount: number;
  nights: number;
  totalSpent: number;
  paid: number;
  balance: number;
  score?: number | null;
  tier?: ClientScoreTier | null;
}

type BookingBriefRow = {
  id: string;
  booking_code: string;
  total_amount: number;
  payment_status: string;
  client: { full_name: string }[] | null;
  room: { room_number: string }[] | null;
};

type InvoiceBookingRow = {
  id: string;
  booking_code: string;
  client: { full_name: string }[] | null;
};

type ClientWithBookingsRow = Omit<Client, "bookings"> & {
  bookings: Booking[] | null;
};

// ============================================================================
// Helpers de dates & périodes
// ============================================================================

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function todayISO(): string {
  return isoDate(new Date());
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function monthStartISO(): string {
  const d = new Date();
  d.setDate(1);
  return isoDate(d);
}

function monthsAgoStartISO(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - (n - 1));
  d.setDate(1);
  return isoDate(d);
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
}

function inRange(iso: string, start: string, end: string): boolean {
  const day = iso.slice(0, 10);
  return day >= start && day <= end;
}

const PERIOD_PRESETS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "7d", label: "7 jours" },
  { key: "month", label: "Ce mois" },
  { key: "30d", label: "30 jours" },
  { key: "12m", label: "12 mois" },
  { key: "custom", label: "Personnalisé" },
];

function defaultRange(key: PeriodKey): { start: string; end: string } {
  switch (key) {
    case "today":
      return { start: todayISO(), end: todayISO() };
    case "7d":
      return { start: daysAgoISO(6), end: todayISO() };
    case "month":
      return { start: monthStartISO(), end: todayISO() };
    case "30d":
      return { start: daysAgoISO(29), end: todayISO() };
    case "12m":
      return { start: monthsAgoStartISO(12), end: todayISO() };
    default:
      return { start: daysAgoISO(29), end: todayISO() };
  }
}

// ============================================================================
// Sous-composants (KPIs, graphiques, sélecteur de période)
// ============================================================================

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  badge?: string;
  variant?: "emerald" | "rose" | "blue" | "amber" | "purple";
}

const KPI_STYLES: Record<NonNullable<KpiCardProps["variant"]>, {
  card: string;
  iconBg: string;
  badge: "success" | "error" | "info" | "warning" | "purple";
}> = {
  emerald: {
    card: "bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/50 dark:to-slate-900 ring-1 ring-emerald-200 dark:ring-emerald-900/40",
    iconBg: "bg-emerald-500 text-white ring-1 ring-emerald-600/30 dark:bg-emerald-500/25 dark:text-emerald-300",
    badge: "success",
  },
  rose: {
    card: "bg-gradient-to-br from-rose-100 to-red-100 dark:from-rose-950/50 dark:to-slate-900 ring-1 ring-rose-200 dark:ring-rose-900/40",
    iconBg: "bg-rose-500 text-white ring-1 ring-rose-600/30 dark:bg-rose-500/25 dark:text-rose-300",
    badge: "error",
  },
  blue: {
    card: "bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-950/50 dark:to-slate-900 ring-1 ring-blue-200 dark:ring-blue-900/40",
    iconBg: "bg-blue-500 text-white ring-1 ring-blue-600/30 dark:bg-blue-500/25 dark:text-blue-300",
    badge: "info",
  },
  amber: {
    card: "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/50 dark:to-slate-900 ring-1 ring-amber-200 dark:ring-amber-900/40",
    iconBg: "bg-amber-500 text-white ring-1 ring-amber-600/30 dark:bg-amber-500/25 dark:text-amber-300",
    badge: "warning",
  },
  purple: {
    card: "bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950/50 dark:to-slate-900 ring-1 ring-violet-200 dark:ring-violet-900/40",
    iconBg: "bg-violet-500 text-white ring-1 ring-violet-600/30 dark:bg-violet-500/25 dark:text-violet-300",
    badge: "purple",
  },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  badge,
  variant = "blue",
}: KpiCardProps) {
  const positive = delta != null && delta >= 0;
  const style = KPI_STYLES[variant];

  return (
    <div className={`p-4 rounded-2xl border-0 shadow-[var(--shadow-md)] transition-all hover:shadow-[var(--shadow-lg)] ${style.card}`}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0 ${style.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white leading-none truncate">{value}</p>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mt-1 truncate">{label}</p>
          </div>
        </div>
        {badge ? (
          <Badge variant={style.badge}>{badge}</Badge>
        ) : delta != null ? (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
              positive
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            }`}
          >
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        ) : null}
      </div>
      {sub && (
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-3 truncate">{sub}</p>
      )}
    </div>
  );
}

function CashFlowChart({
  data,
  fmt,
}: {
  data: { month: string; revenue: number; expenses: number }[];
  fmt: (amount: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 760;
  const height = 240;
  const padL = 72;
  const padR = 14;
  const padT = 14;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...data.flatMap((d) => [d.revenue, d.expenses]), 0) || 1;

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-[var(--foreground-subtle)]">
        Aucune donnée sur la période
      </div>
    );
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = padT + innerH - t * innerH;
    return { y, value: Math.round(t * max) };
  });

  const groupW = innerW / data.length;
  const barW = Math.min(20, groupW * 0.3);

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={width - padR} y2={g.y} stroke="currentColor" strokeWidth="1" className="text-[var(--foreground-muted)]" strokeDasharray="4 4" />
            <text x={padL - 8} y={g.y + 4} textAnchor="end" className="text-[10px] fill-[var(--foreground-subtle)]">
              {fmt(g.value).replace(/[^\d\s.]/g, "").trim()}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = padL + i * groupW + groupW / 2;
          const hR = (d.revenue / max) * innerH;
          const hE = (d.expenses / max) * innerH;
          const yR = padT + innerH - hR;
          const yE = padT + innerH - hE;
          const opacity = hovered == null || hovered === i ? 1 : 0.35;
          return (
            <g
              key={d.month}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <rect x={padL + i * groupW} y={padT} width={groupW} height={innerH} fill="transparent" />
              <rect x={cx - barW - 2} y={yR} width={barW} height={Math.max(hR, 1)} rx="3" fill="#d4d4d8" opacity={opacity} />
              <rect x={cx + 2} y={yE} width={barW} height={Math.max(hE, 1)} rx="3" fill="#ef4444" opacity={opacity} />
              <text x={cx} y={height - 8} textAnchor="middle" className="text-[10px] fill-[var(--foreground-subtle)]">
                {monthLabel(d.month)}
              </text>
              {hovered === i && (
                <g>
                  <rect x={Math.min(cx - 56, width - 130)} y={padT - 2} width="118" height="46" rx="8" fill="#27272a" opacity="0.95" />
                  <text x={Math.min(cx - 56, width - 130) + 10} y={padT + 14} className="text-[10px] fill-[var(--foreground-inverse)]">
                    Recettes : {fmt(d.revenue)}
                  </text>
                  <text x={Math.min(cx - 56, width - 130) + 10} y={padT + 30} className="text-[10px] fill-[var(--foreground-inverse)]">
                    Dépenses : {fmt(d.expenses)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-5 text-xs text-[var(--foreground-subtle)] mt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[var(--border-strong)]" /> Recettes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-500" /> Dépenses
        </span>
      </div>
    </div>
  );
}

function CategoryBreakdown({
  items,
  fmt,
}: {
  items: { category: string; amount: number }[];
  fmt: (amount: number) => string;
}) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const sorted = [...items].sort((a, b) => b.amount - a.amount).filter((i) => i.amount > 0);
  if (sorted.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--foreground-subtle)]">
        Aucune dépense sur la période
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {sorted.map((it) => {
        const pct = total > 0 ? (it.amount / total) * 100 : 0;
        const Icon = CATEGORY_ICONS[it.category] || Coins;
        return (
          <div key={it.category}>
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--foreground-muted)]">
                <Icon className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                {getExpenseCategoryLabel(it.category)}
              </span>
              <span className="text-xs font-semibold text-white">
                {fmt(it.amount)}
                <span className="ml-2 text-[10px] font-normal text-[var(--foreground-subtle)]">{pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--border)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function compactAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1000) return (n / 1000).toFixed(0).replace(/\.0$/, "") + "k";
  return String(n);
}

function DailyCashFlowChart({
  data,
  fmt,
}: {
  data: { date: string; label: string; entrées: number; sorties: number }[];
  fmt: (amount: number) => string;
}) {
  const hasData = data.some((d) => d.entrées > 0 || d.sorties > 0);
  if (!hasData) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-[var(--foreground-subtle)]">
        Aucune donnée sur la période
      </div>
    );
  }
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={compactAmount}
          />
          <Tooltip
            formatter={(value, name) => [fmt(Number(value)), String(name)]}
            labelFormatter={(label) => `Jour du ${String(label)}`}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #3f3f46",
              backgroundColor: "#18181b",
              fontSize: 12,
              color: "#f4f4f5",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
          />
          <Line
            type="monotone"
            dataKey="entrées"
            name="Entrées (Recettes)"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={{ r: 2.5, strokeWidth: 0, fill: "#22c55e" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="sorties"
            name="Sorties (Dépenses)"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={{ r: 2.5, strokeWidth: 0, fill: "#ef4444" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryPie({
  items,
  fmt,
}: {
  items: { category: string; amount: number }[];
  fmt: (amount: number) => string;
}) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const sorted = [...items].sort((a, b) => b.amount - a.amount).filter((i) => i.amount > 0);

  if (sorted.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--foreground-subtle)]">
        Aucune dépense sur la période
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-44 h-44 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sorted}
              dataKey="amount"
              nameKey="category"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={3}
              stroke="none"
            >
              {sorted.map((entry) => (
                <Cell key={entry.category} fill={EXPENSE_CATEGORY_COLORS[entry.category] || "#64748b"} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [fmt(Number(value)), getExpenseCategoryLabel(String(name))]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #3f3f46",
                backgroundColor: "#18181b",
                fontSize: 12,
                color: "#f4f4f5",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg font-bold text-white">{fmt(total)}</p>
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)]">Total</p>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {sorted.map((it) => {
          const pct = total > 0 ? (it.amount / total) * 100 : 0;
          const color = EXPENSE_CATEGORY_COLORS[it.category] || "#64748b";
          return (
            <div key={it.category} className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-[var(--foreground-muted)] flex-1 truncate">
                {getExpenseCategoryLabel(it.category)}
              </span>
              <span className="text-xs font-semibold text-white">{fmt(it.amount)}</span>
              <span className="text-[10px] text-[var(--foreground-subtle)] w-9 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeriodSelector({
  startDate,
  endDate,
  onChange,
  onPreset,
  preset,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  onPreset: (key: PeriodKey) => void;
  preset: PeriodKey;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 bg-[var(--surface-sunken)] p-1 rounded-lg border border-[var(--border)] overflow-x-auto shrink-0">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              preset === p.key
                ? "bg-white text-[var(--foreground)]"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="text-[11px] px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--border-strong)] [color-scheme:dark]"
        />
        <span className="text-[11px] text-[var(--foreground-muted)]">→</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="text-[11px] px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--border-strong)] [color-scheme:dark]"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Page principale
// ============================================================================

export default function AccountingPage() {
  const router = useRouter();
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<EnrichedPayment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [auditFilter, setAuditFilter] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<EnrichedInvoice[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [accommodations, setAccommodations] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [usersById, setUsersById] = useState<Record<string, string>>({});

  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState("standard");

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [preset, setPreset] = useState<PeriodKey>("month");
  const [startDate, setStartDate] = useState(() => defaultRange("month").start);
  const [endDate, setEndDate] = useState(() => defaultRange("month").end);

  // Filtres
  const [revenueMethod, setRevenueMethod] = useState("all");
  const [revenueType, setRevenueType] = useState("all");
  const [revenueSearch, setRevenueSearch] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | "unpaid" | "loyal" | "recent" | "vip">("all");
  const [clientSort, setClientSort] = useState<{ key: "name" | "revenue" | "score" | "stays"; direction: "asc" | "desc" }>({ key: "score", direction: "desc" });

  // Tri
  const [expenseSort, setExpenseSort] = useState<{ key: "date" | "amount"; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const [revenueSort, setRevenueSort] = useState<{ key: "date" | "amount"; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });

  // Modals
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientWithStats | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const [expenseForm, setExpenseForm] = useState({
    category: "utilities",
    description: "",
    amount: "",
    expense_date: todayISO(),
    accommodation_id: "",
  });

  // Modal de changement de statut facture
  const [invoiceStatusTarget, setInvoiceStatusTarget] = useState<{ invoice: Invoice; newStatus: InvoiceStatus } | null>(null);
  const [updatingInvoiceStatus, setUpdatingInvoiceStatus] = useState(false);

  const [exportingPdf, setExportingPdf] = useState(false);

  // Les dépenses suivent la résidence active (sélecteur du header).
  const { activeAccommodationId } = useAccommodation();
  const userPickedExpAccRef = useRef(false);
  const [expAccFilter, setExpAccFilter] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, []);

  // Suit la résidence active : les dépenses se refiltrent automatiquement
  // tant que l'utilisateur n'a pas choisi une résidence explicite.
  useEffect(() => {
    if (userPickedExpAccRef.current) return;
    setExpAccFilter(activeAccommodationId ?? "all");
    loadDataRef.current(activeAccommodationId ?? undefined);
  }, [activeAccommodationId]);

  // Temps réel : recharge dès qu'une réservation, un paiement ou une facture
  // change (via Réservations, la caisse, le shift ou l'espace client) pour
  // garder les statistiques et le dossier client à jour.
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("accounting-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `tenant_id=eq.${tenantId}` },
        () => loadDataRef.current()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `tenant_id=eq.${tenantId}` },
        () => loadDataRef.current()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `tenant_id=eq.${tenantId}` },
        () => loadDataRef.current()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  async function loadData(accId?: string) {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setUserId(userData.id);
      setTenantId(userData.tenant_id);

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setPlan(subData.plan);

      const tid = userData.tenant_id;

      const [exp, pay, log, inv, acc, usersRes] = await Promise.all([
        (() => {
          const effectiveAccId = accId ?? (expAccFilter === "all" ? undefined : expAccFilter);
          let q = supabase.from("expenses").select("*").eq("tenant_id", tid).order("expense_date", { ascending: false }).limit(300);
          if (effectiveAccId) q = q.eq("accommodation_id", effectiveAccId);
          return q;
        })(),
        supabase.from("payments").select("*").eq("tenant_id", tid).order("payment_date", { ascending: false }).limit(500),
        supabase.from("audit_logs").select("*").eq("tenant_id", tid).order("created_at", { ascending: false }).limit(120),
        supabase.from("invoices").select("*").eq("tenant_id", tid).order("created_at", { ascending: false }).limit(250),
        supabase.from("accommodations").select("id, name").eq("tenant_id", tid).order("name"),
        supabase.from("users").select("id, full_name").eq("tenant_id", tid),
      ]);

      if (exp.data) setExpenses(exp.data as unknown as Expense[]);
      if (log.data) setAuditLogs(log.data as unknown as AuditLog[]);
      if (acc.data) setAccommodations(acc.data as { id: string; name: string }[]);
      if (usersRes.data) {
        const map: Record<string, string> = {};
        (usersRes.data as { id: string; full_name: string }[]).forEach((u) => (map[u.id] = u.full_name));
        setUsersById(map);
      }

      // Enrichir les paiements avec les infos de réservation
      const payData = (pay.data as Payment[] | null) || [];
      const enrichedPayments: EnrichedPayment[] = payData.map((p) => ({ ...p }));
      const bookingIds = [...new Set(payData.filter((p) => p.booking_id).map((p) => p.booking_id as string))];
      const bookingById: Record<string, { booking_code: string; total_amount: number; payment_status: string; client_name: string; room_number: string }> = {};
      if (bookingIds.length > 0) {
        const { data: bk } = await supabase
          .from("bookings")
          .select("id, booking_code, total_amount, payment_status, client:clients(full_name), room:rooms(room_number)")
          .in("id", bookingIds);
        if (bk) {
          (bk as BookingBriefRow[]).forEach((b) => {
            bookingById[b.id] = {
              booking_code: b.booking_code,
              total_amount: b.total_amount,
              payment_status: b.payment_status,
              client_name: b.client?.[0]?.full_name || "—",
              room_number: b.room?.[0]?.room_number || "—",
            };
          });
        }
      }
      enrichedPayments.forEach((p) => {
        if (p.booking_id && bookingById[p.booking_id]) {
          p.booking = bookingById[p.booking_id];
        }
      });
      setPayments(enrichedPayments);

      // Enrichir les factures avec les infos de réservation
      const invData = (inv.data as Invoice[] | null) || [];
      const invBookingIds = [...new Set(invData.map((i) => i.booking_id))];
      const invBookingById: Record<string, { booking_code: string; client_name: string }> = {};
      if (invBookingIds.length > 0) {
        const { data: ibk } = await supabase
          .from("bookings")
          .select("id, booking_code, client:clients(full_name)")
          .in("id", invBookingIds);
        if (ibk) {
          (ibk as InvoiceBookingRow[]).forEach((b) => {
            invBookingById[b.id] = {
              booking_code: b.booking_code,
              client_name: b.client?.[0]?.full_name || "—",
            };
          });
        }
      }
      setInvoices(
        invData.map((i) => ({
          ...i,
          booking: i.booking_id ? invBookingById[i.booking_id] : undefined,
        }))
      );

      // Réservations pour les créances
      const { data: bkAll } = await supabase
        .from("bookings")
        .select("id, booking_code, status, total_amount, amount_paid, payment_status, check_in_date, check_out_date")
        .eq("tenant_id", tid)
        .order("check_in_date", { ascending: false })
        .limit(300);
      if (bkAll) setBookings(bkAll as unknown as Booking[]);

      // Clients pour le CRM
      const { data: clData } = await supabase
        .from("clients")
        .select(`
          *,
          bookings(booking_code, check_in_date, check_out_date, status, total_amount, amount_paid, payment_status, nights_count)
        `)
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
        .limit(400);

      if (clData) {
        const stats: ClientWithStats[] = (clData as ClientWithBookingsRow[]).map((c) => {
          const bks = (c.bookings || []) as Booking[];
          const nights = bks.reduce((s, b) => s + (b.nights_count || 0), 0);
          const totalSpent = bks.reduce((s, b) => s + (b.total_amount || 0), 0);
          const paid = bks.reduce((s, b) => s + (b.amount_paid || 0), 0);
          const balance = bks.reduce(
            (s, b) =>
              s +
              (b.status === "confirmed" || b.status === "checked_in" ? (b.total_amount || 0) - (b.amount_paid || 0) : 0),
            0
          );
          return {
            ...c,
            bookings: bks,
            stayCount: bks.length,
            nights,
            totalSpent,
            paid,
            balance,
          } as ClientWithStats;
        });

        // Scores de réputation (vue client_profiles) — fusionnés dans les stats
        const { data: profiles } = await supabase
          .from("client_profiles")
          .select("client_id, score, tier");
        const scoreById: Record<string, { score: number; tier: ClientScoreTier }> = {};
        (profiles || []).forEach((p) => {
          scoreById[p.client_id] = { score: p.score, tier: p.tier };
        });
        stats.forEach((c) => {
          const s = scoreById[c.id];
          if (s) {
            c.score = s.score;
            c.tier = s.tier;
          }
        });

        setClients(stats);
      }
    } catch (err) {
      toast.error("Impossible de charger les données. Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    toast.success("Données actualisées");
  }

  // ============================================================================
  // Données filtrées
  // ============================================================================

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => inRange(e.expense_date, startDate, endDate))
      .filter((e) => (expenseCategory === "all" ? true : e.category === expenseCategory))
      .filter((e) => (expenseSearch ? e.description.toLowerCase().includes(expenseSearch.toLowerCase()) : true))
      .sort((a, b) => {
        const aVal = expenseSort.key === "date" ? a.expense_date : a.amount;
        const bVal = expenseSort.key === "date" ? b.expense_date : b.amount;
        return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) * (expenseSort.direction === "asc" ? 1 : -1);
      });
  }, [expenses, startDate, endDate, expenseCategory, expenseSearch, expenseSort]);

  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => inRange(p.payment_date, startDate, endDate))
      .filter((p) => {
        if (revenueMethod === "all") return true;
        if (revenueMethod === "mobile_money") return isMobileMoney(p.payment_method);
        return p.payment_method === revenueMethod;
      })
      .filter((p) => (revenueType === "all" ? true : (p.operation_type || "booking") === revenueType))
      .filter((p) => {
        if (!revenueSearch) return true;
        const q = revenueSearch.toLowerCase();
        const ref = (p.reference || "").toLowerCase();
        const bk = (p.booking?.booking_code || "").toLowerCase();
        const cl = (p.booking?.client_name || "").toLowerCase();
        const notes = (p.notes || "").toLowerCase();
        return ref.includes(q) || bk.includes(q) || cl.includes(q) || notes.includes(q);
      })
      .sort((a, b) => {
        const aVal = revenueSort.key === "date" ? a.payment_date : a.amount;
        const bVal = revenueSort.key === "date" ? b.payment_date : b.amount;
        return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) * (revenueSort.direction === "asc" ? 1 : -1);
      });
  }, [payments, startDate, endDate, revenueMethod, revenueType, revenueSearch, revenueSort]);

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => inRange(inv.created_at, startDate, endDate))
      .filter((inv) => (invoiceStatus === "all" ? true : inv.status === invoiceStatus))
    .filter((inv) => {
      if (!invoiceSearch) return true;
      const q = invoiceSearch.toLowerCase();

      return (
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.booking?.client_name?.toLowerCase().includes(q) ||

        inv.booking?.booking_code?.toLowerCase().includes(q) ||
        inv.status?.toLowerCase().includes(q)
      );
    });
  }, [invoices, startDate, endDate, invoiceStatus, invoiceSearch]);

  const filteredClients = useMemo(() => {
    let list = clients;
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      list = list.filter((c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
      );
    }
    if (clientFilter === "unpaid") list = list.filter((c) => c.balance > 0);
    else if (clientFilter === "loyal") list = list.filter((c) => c.stayCount >= 3);
    else if (clientFilter === "recent") {
      const d = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      list = list.filter((c) => c.bookings.some((b) => b.check_in_date >= d));
    }
    else if (clientFilter === "vip") list = list.filter((c) => (c.score || 0) >= 80);
    list = [...list].sort((a, b) => {
      const d = clientSort.direction === "asc" ? 1 : -1;
      switch (clientSort.key) {
        case "name": return d * a.full_name.localeCompare(b.full_name);
        case "revenue": return d * (a.totalSpent - b.totalSpent);
        case "score": return d * ((a.score || 0) - (b.score || 0));
        case "stays": return d * (a.stayCount - b.stayCount);
        default: return 0;
      }
    });
    return list;
  }, [clients, clientSearch, clientFilter, clientSort]);

  // ============================================================================
  // ─ KPIs CRM ─
  const crmTotalClients = clients.length;
  const crmTotalRevenue = clients.reduce((s, c) => s + c.totalSpent, 0);
  const crmUnpaidClients = clients.filter((c) => c.balance > 0).length;
  const crmUnpaidTotal = clients.reduce((s, c) => s + c.balance, 0);
  const crmLoyalClients = clients.filter((c) => c.stayCount >= 3).length;
  const crmAvgScore = clients.length > 0 ? Math.round(clients.reduce((s, c) => s + (c.score || 0), 0) / clients.length) : 0;

  // KPIs
  // ============================================================================

  const totalRevenue = filteredPayments.filter((p) => p.amount > 0).reduce((s, p) => s + p.amount, 0);
  const cashOut = Math.abs(filteredPayments.filter((p) => p.amount < 0).reduce((s, p) => s + p.amount, 0));
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const totalOutflows = totalExpenses + cashOut;
  const netProfit = totalRevenue - totalOutflows;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Période précédente (comparaison)
  const prevRange = useMemo(() => {
    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    return { start: addDaysISO(startDate, -(Math.round(days) + 1)), end: addDaysISO(startDate, -1) };
  }, [startDate, endDate]);

  const prevRevenue = useMemo(
    () => payments.filter((p) => p.amount > 0 && inRange(p.payment_date, prevRange.start, prevRange.end)).reduce((s, p) => s + p.amount, 0),
    [payments, prevRange]
  );
  const prevExpenses = useMemo(
    () => expenses.filter((e) => inRange(e.expense_date, prevRange.start, prevRange.end)).reduce((s, e) => s + e.amount, 0),
    [expenses, prevRange]
  );
  const prevOutflows = useMemo(
    () =>
      payments
        .filter((p) => p.amount < 0 && inRange(p.payment_date, prevRange.start, prevRange.end))
        .reduce((s, p) => s + Math.abs(p.amount), 0) + prevExpenses,
    [payments, prevExpenses, prevRange]
  );

  const revenueDelta = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;
  const expenseDelta = prevOutflows > 0 ? ((totalOutflows - prevOutflows) / prevOutflows) * 100 : null;

  const byMethod = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPayments.filter((p) => p.amount > 0).forEach((p) => (map[p.payment_method] = (map[p.payment_method] || 0) + p.amount));
    return map;
  }, [filteredPayments]);

  // Détail par opérateur Mobile Money (Wave, Orange Money, …) pour ne rien perdre
  // dans l'agrégat « Mobile Money » affiché dans la répartition.
  const mobileMoneyBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPayments
      .filter((p) => p.amount > 0 && isMobileMoney(p.payment_method))
      .forEach((p) => {
        const op = p.mobile_money_operator || "mobile_money";
        map[op] = (map[op] || 0) + p.amount;
      });
    return map;
  }, [filteredPayments]);

  const mobileMoneyTotal = Object.values(mobileMoneyBreakdown).reduce((s, v) => s + v, 0);

  // Nombre de modes réellement utilisés, avec Mobile Money compté comme un seul mode.
  const activeMethodCount =
    (byMethod.cash ? 1 : 0) +
    (mobileMoneyTotal > 0 ? 1 : 0) +
    (byMethod.bank ? 1 : 0) +
    (byMethod.other ? 1 : 0);

  const receivable = useMemo(
    () =>
      bookings
        .filter((b) => (b.status === "confirmed" || b.status === "checked_in") && (b.total_amount - b.amount_paid) > 0)
        .reduce((s, b) => s + (b.total_amount - b.amount_paid), 0),
    [bookings]
  );

  const monthlySeries = useMemo(() => {
    const now = new Date();
    const series: { month: string; revenue: number; expenses: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      series.push({ month: monthKey(isoDate(d)), revenue: 0, expenses: 0 });
    }
    payments.forEach((p) => {
      const k = monthKey(p.payment_date);
      const s = series.find((x) => x.month === k);
      if (s) s.revenue += p.amount > 0 ? p.amount : 0;
    });
    expenses.forEach((e) => {
      const k = monthKey(e.expense_date);
      const s = series.find((x) => x.month === k);
      if (s) s.expenses += e.amount;
    });
    return series;
  }, [payments, expenses]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => (map[e.category] = (map[e.category] || 0) + e.amount));
    return Object.entries(map).map(([category, amount]) => ({ category, amount }));
  }, [filteredExpenses]);

  const dailySeries = useMemo(() => {
    const map: Record<string, { entrées: number; sorties: number }> = {};
    let cursor = startDate;
    let guard = 0;
    while (cursor <= endDate && guard < 4000) {
      map[cursor] = { entrées: 0, sorties: 0 };
      const [y, m, d] = cursor.split("-").map(Number);
      cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split("T")[0];
      guard++;
    }
    filteredPayments.forEach((p) => {
      const k = p.payment_date.slice(0, 10);
      if (map[k]) {
        if (p.amount > 0) map[k].entrées += p.amount;
        else map[k].sorties += Math.abs(p.amount);
      }
    });
    filteredExpenses.forEach((e) => {
      if (map[e.expense_date]) map[e.expense_date].sorties += e.amount;
    });
    return Object.entries(map).map(([date, v]) => ({
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      entrées: v.entrées,
      sorties: v.sorties,
    }));
  }, [filteredPayments, filteredExpenses, startDate, endDate]);

  const hasAccess = canAccessPlanFeature(plan, "advancedAccounting");

  // ============================================================================
  // Actions métier
  // ============================================================================

  function openNewExpense() {
    setEditingExpense(null);
    setExpenseForm({
      category: "utilities",
      description: "",
      amount: "",
      expense_date: todayISO(),
      accommodation_id: activeAccommodationId || "",
    });
    setExpenseModalOpen(true);
  }

  function openEditExpense(exp: Expense) {
    setEditingExpense(exp);
    setExpenseForm({
      category: exp.category,
      description: exp.description,
      amount: String(exp.amount),
      expense_date: exp.expense_date,
      accommodation_id: exp.accommodation_id || "",
    });
    setExpenseModalOpen(true);
  }

  async function handleSaveExpense() {
    if (!expenseForm.category) {
      toast.error("Veuillez choisir une catégorie.");
      return;
    }
    if (!expenseForm.description.trim()) {
      toast.error("Veuillez indiquer une description.");
      return;
    }
    const amount = parseInt(expenseForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Le montant doit être supérieur à 0.");
      return;
    }
    if (!expenseForm.expense_date) {
      toast.error("Veuillez choisir une date.");
      return;
    }
    setSavingExpense(true);
    try {
      const supabase = createClient();
      const payload = {
        tenant_id: tenantId,
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        amount,
        expense_date: expenseForm.expense_date,
        accommodation_id: expenseForm.accommodation_id || null,
        created_by: userId,
      };
      if (editingExpense) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editingExpense.id);
        if (error) throw error;
        toast.success("Dépense modifiée");
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
        toast.success("Dépense enregistrée");
      }
      setExpenseModalOpen(false);
      loadData();
    } catch (err) {
      toast.error("Impossible d'enregistrer la dépense : " + ((err as Error)?.message || "erreur"));
    } finally {
      setSavingExpense(false);
    }
  }

  async function handleDeleteExpense() {
    if (!deletingExpense) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("expenses").delete().eq("id", deletingExpense.id);
      if (error) throw error;
      toast.success("Dépense supprimée");
      setDeletingExpense(null);
      loadData();
    } catch (err) {
      toast.error("Impossible de supprimer : " + ((err as Error)?.message || "erreur"));
    }
  }

  // ============================================================================
  // Exports CSV
  // ============================================================================

  function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportExpensesCSV() {
    if (filteredExpenses.length === 0) return;
    downloadCSV(
      `depenses_${startDate}_${endDate}.csv`,
      ["Date", "Catégorie", "Description", "Établissement", "Montant"],
      filteredExpenses.map((e) => [
        e.expense_date,
        getExpenseCategoryLabel(e.category),
        e.description,
        accommodations.find((a) => a.id === e.accommodation_id)?.name || "",
        e.amount,
      ])
    );
    toast.success("Export CSV réussi");
  }

  function exportRevenueCSV() {
    if (filteredPayments.length === 0) return;
    downloadCSV(
      `recettes_${startDate}_${endDate}.csv`,
      ["Date", "Réservation", "Client", "Méthode", "Référence", "Type", "Montant"],
      filteredPayments.map((p) => [
        p.payment_date,
        p.booking?.booking_code || "",
        p.booking?.client_name || (p.notes || ""),
        paymentMethodDisplay(p),
        p.reference || "",
        p.operation_type === "manual_out" ? "Sortie de caisse" : p.operation_type === "manual_in" ? "Entrée de caisse" : "Paiement",
        p.amount,
      ])
    );
    toast.success("Export CSV réussi");
  }

  function exportInvoicesCSV() {
    if (filteredInvoices.length === 0) return;
    downloadCSV(
      `factures_${startDate}_${endDate}.csv`,
      ["N° Facture", "Date", "Client", "Réservation", "Sous-total", "TVA", "Total", "Statut"],
      filteredInvoices.map((inv) => [
        inv.invoice_number,
        formatDate(inv.created_at),
        inv.booking?.client_name || "",
        inv.booking?.booking_code || "",
        inv.amount,
        inv.tax_amount,
        inv.total_amount,
        INVOICE_STATUS_LABELS[inv.status] || inv.status,
      ])
    );
    toast.success("Export CSV réussi");
  }

  async function handleOpenInvoice(inv: EnrichedInvoice) {
    try {
      const response = await fetch(`/api/invoice/generate?bookingId=${encodeURIComponent(inv.booking_id)}`);
      const result = await response.json();
      if (!response.ok || !result.invoice?.pdf_url) throw new Error(result.error || "Aucun PDF disponible pour cette facture.");
      window.open(result.invoice.pdf_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'ouvrir la facture.");
    }
  }

  // Changement intelligent de statut facture
  function openInvoiceStatusChange(invoice: Invoice, newStatus: InvoiceStatus) {
    // Vérifie que la transition est valide
    const validTransitions = VALID_INVOICE_TRANSITIONS[invoice.status];
    if (!validTransitions.includes(newStatus)) {
      toast.error(`Transition invalide : ${invoice.status} → ${newStatus}`);
      return;
    }
    setInvoiceStatusTarget({ invoice, newStatus });
  }

  async function confirmInvoiceStatusChange() {
    if (!invoiceStatusTarget) return;
    const { invoice, newStatus } = invoiceStatusTarget;
    setUpdatingInvoiceStatus(true);
    try {
      const supabase = createClient();
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Données supplémentaires selon le statut cible
      if (newStatus === "sent") {
        updateData.sent_at = new Date().toISOString();
      } else if (newStatus === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", invoice.id);

      if (error) throw error;

      // Met à jour le state local
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id
            ? { ...inv, ...updateData } as Invoice
            : inv
        )
      );

      toast.success(`Facture marquée comme « ${INVOICE_STATUS_LABELS[newStatus]} »`);
      setInvoiceStatusTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du changement de statut.");
    } finally {
      setUpdatingInvoiceStatus(false);
    }
  }

  // Label de transition pour la confirmation
  function getTransitionLabel(from: InvoiceStatus, to: InvoiceStatus): string {
    const labels: Record<string, string> = {
      "draft-sent": "Envoyer la facture",
      "draft-cancelled": "Annuler la facture",
      "sent-paid": "Marquer la facture comme payée",
      "sent-partial": "Enregistrer un paiement partiel",
      "sent-cancelled": "Annuler la facture envoyée",
      "partial-paid": "Marquer la facture comme entièrement payée",
      "partial-cancelled": "Annuler la facture",
    };
    return labels["`${from}-${to}`"] || `Changer le statut vers « ${INVOICE_STATUS_LABELS[to]} »`;
  }

  function exportClientsCSV() {
    if (filteredClients.length === 0) return;
    downloadCSV(
      `clients_${todayISO()}.csv`,
      ["Nom", "Téléphone", "Email", "Nationalité", "Séjours", "Nuits", "CA total", "Encaissé", "Solde dû"],
      filteredClients.map((c) => [
        c.full_name,
        c.phone || "",
        c.email || "",
        c.nationality || "",
        c.stayCount,
        c.nights,
        c.totalSpent,
        c.paid,
        c.balance,
      ])
    );
    toast.success("Export CSV réussi");
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      const res = await fetch("/api/accounting/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: startDate, end: endDate }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(errData?.error || "Impossible de générer le rapport PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `rapport-financier_${startDate}_${endDate}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Rapport financier PDF généré");
    } catch (err) {
      console.error(err);
      toast.error("Impossible de générer le rapport PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  // ============================================================================
  // Rendu
  // ============================================================================

  if (loading && expenses.length === 0 && payments.length === 0 && invoices.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  // ── Données dérivées pour le journal d'audit ──
  const filteredAuditLogs = auditFilter
    ? auditLogs.filter((l) => getAuditActionInfo(l.action).category === auditFilter)
    : auditLogs;
  const groupedAuditLogs = groupAuditLogsByDate(filteredAuditLogs);
  const presentAuditCategories = [...new Set(auditLogs.map((l) => getAuditActionInfo(l.action).category))];

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { key: "overview", label: "Vue d'ensemble", icon: Wallet },
    { key: "revenue", label: "Recettes", icon: TrendingUp, badge: filteredPayments.length },
    { key: "expenses", label: "Dépenses", icon: TrendingDown, badge: filteredExpenses.length },
    { key: "invoices", label: "Factures", icon: Receipt, badge: filteredInvoices.length },
    { key: "audit", label: "Journal", icon: ScrollText },
    { key: "clients", label: "Clients (CRM)", icon: Users, badge: filteredClients.length },
  ];

  return (
    <div className="space-y-3 animate-fade-in relative">
      {!hasAccess && (
        <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Module comptabilité avancée</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Réservé à la formule Entreprise : dépenses, charges, recettes, factures, journal d&apos;audit et suivi client.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => router.push("/dashboard/subscription")} className="w-full sm:w-auto justify-center">
              <Sparkles className="w-4 h-4" /> Débloquer avec Entreprise
            </Button>
          </div>
        </Card>
      )}

      <div className={!hasAccess ? "opacity-70" : ""}>
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Comptabilité</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Recettes, dépenses, factures, créances et suivi client
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="md" onClick={handleRefresh} loading={refreshing} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Actualiser
            </Button>
            <Button onClick={openNewExpense} className="gap-2">
              <Plus className="w-4 h-4" /> Nouvelle dépense
            </Button>
          </div>
        </div>

        {/* Panneau Smart & Compact */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-4 space-y-5">
          {/* Sélecteur de période */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-wrap">
            <PeriodSelector
              startDate={startDate}
              endDate={endDate}
              preset={preset}
              onChange={(s, e) => {
                setStartDate(s);
                setEndDate(e);
                if (s <= e) setPreset("custom");
              }}
              onPreset={(key) => {
                const r = defaultRange(key);
                setPreset(key);
                setStartDate(r.start);
                setEndDate(r.end);
              }}
            />
            <p className="text-[11px] text-[var(--foreground-subtle)]">
              {filteredPayments.length} paiements · {filteredExpenses.length} dépenses · {filteredInvoices.length} factures
            </p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={TrendingUp}
              label="Recettes"
              value={fmt(totalRevenue)}
              sub={`${activeMethodCount} mode(s) de paiement`}
              delta={revenueDelta}
              variant="emerald"
              badge="Recettes"
            />
            <KpiCard
              icon={TrendingDown}
              label="Dépenses"
              value={fmt(totalOutflows)}
              sub={
                totalExpenses > 0 && cashOut > 0
                  ? `charges ${fmt(totalExpenses)} · sorties ${fmt(cashOut)}`
                  : cashOut > 0
                    ? `dont ${fmt(cashOut)} sorties de caisse`
                    : "charges de la période"
              }
              delta={expenseDelta}
              variant="rose"
              badge="Sorties"
            />
            <KpiCard
              icon={Wallet}
              label="Bénéfice net"
              value={fmt(netProfit)}
              sub={totalRevenue > 0 ? `marge brute ${margin.toFixed(1)}%` : "sur la période"}
              variant="blue"
              badge={totalRevenue > 0 ? `Marge ${margin.toFixed(1)}%` : "Bénéfice"}
            />
            <KpiCard
              icon={AlertTriangle}
              label="Créances clients"
              value={fmt(receivable)}
              sub={`${bookings.filter((b) => (b.status === "confirmed" || b.status === "checked_in") && b.total_amount > b.amount_paid).length} réservation(s) impayée(s)`}
              variant="amber"
              badge="Créances"
            />
          </div>

          {/* Répartition par mode de paiement */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-5 lg:gap-x-6 p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-[var(--shadow-sm)]">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold w-full sm:w-auto">Modes de paiement</span>
            {[
              { method: "cash", label: "Espèces", icon: Banknote },
              { method: "mobile_money", label: "Mobile Money", icon: Smartphone, aggregate: true },
              { method: "bank", label: "Virement", icon: Building },
              { method: "other", label: "Autre", icon: Coins },
            ].map(({ method, label, icon: Icon, aggregate }) => {
              if (aggregate) {
                return (
                  <div key={method} className="relative group flex items-center gap-1.5 sm:gap-2 cursor-help bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 sm:px-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{label}</span>
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums">{mobileMoneyTotal > 0 ? fmt(mobileMoneyTotal) : "—"}</span>
                    {mobileMoneyTotal > 0 && (
                      <div className="pointer-events-none absolute bottom-full left-0 mb-2 z-20 hidden group-hover:block w-max rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-xl">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Détail Mobile Money · Wave · Orange Money · MTN Money · Moov Money · Pi-SPI
                        </p>
                        {MOBILE_MONEY_OPERATORS.map((op) => (
                          <div key={op.value} className="flex items-center justify-between gap-6 text-[11px] py-0.5">
                            <span className="text-slate-600 dark:text-slate-400">{op.label}</span>
                            <span className="font-bold text-slate-900 dark:text-white tabular-nums">{mobileMoneyBreakdown[op.value] ? fmt(mobileMoneyBreakdown[op.value]) : "—"}</span>
                          </div>
                        ))}
                        {mobileMoneyBreakdown["mobile_money"] > 0 && (
                          <div className="flex items-center justify-between gap-6 text-[11px] py-0.5">
                            <span className="text-slate-600 dark:text-slate-400">Opérateur non précisé</span>
                            <span className="font-bold text-slate-900 dark:text-white tabular-nums">{fmt(mobileMoneyBreakdown["mobile_money"])}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              const val = byMethod[method] || 0;
              return (
                <div key={method} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{label}</span>
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums">{val > 0 ? fmt(val) : "—"}</span>
                </div>
              );
            })}
          </div>

          {/* Onglets */}
          <div className="flex gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? "bg-[var(--primary-color,#0C1C33)] text-white shadow-md"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.badge != null && tab.badge > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        active ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

        {/* ============ VUE D'ENSEMBLE ============ */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <Card className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Entrées vs Sorties (jour par jour)
                </h2>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                  {formatDate(startDate)} → {formatDate(endDate)}
                </span>
              </div>
              <DailyCashFlowChart data={dailySeries} fmt={fmt} />
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-[var(--shadow-sm)]">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Flux de trésorerie (12 mois)
                </h2>
                <CashFlowChart data={monthlySeries} fmt={fmt} />
              </Card>
              <Card className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-[var(--shadow-sm)]">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Répartition des dépenses
                </h2>
                <CategoryBreakdown items={categoryBreakdown} fmt={fmt} />
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Dernières dépenses</h2>
                  <button
                    onClick={() => setActiveTab("expenses")}
                    className="text-xs font-semibold text-[var(--primary-color,#0C1C33)] hover:underline transition-colors"
                  >
                    Tout voir →
                  </button>
                </div>
                {filteredExpenses.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">Aucune dépense sur la période</p>
                ) : (
                  <div className="space-y-2">
                    {filteredExpenses.slice(0, 5).map((exp) => (
                      <div key={exp.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{exp.description}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {getExpenseCategoryLabel(exp.category)} • {formatDate(exp.expense_date)}
                          </p>
                        </div>
                        <p className="text-xs font-extrabold text-rose-600 dark:text-rose-400 flex-shrink-0 tabular-nums">{fmt(exp.amount)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Dernières recettes</h2>
                  <button
                    onClick={() => setActiveTab("revenue")}
                    className="text-xs font-semibold text-[var(--primary-color,#0C1C33)] hover:underline transition-colors"
                  >
                    Tout voir →
                  </button>
                </div>
                {filteredPayments.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">Aucune recette sur la période</p>
                ) : (
                  <div className="space-y-2">
                    {filteredPayments.slice(0, 5).map((pay) => (
                      <div key={pay.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {pay.booking?.client_name || "Opération de caisse"}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {paymentMethodDisplay(pay)} • {formatDate(pay.payment_date)}
                          </p>
                        </div>
                        <p className={`text-xs font-extrabold ${pay.amount < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"} flex-shrink-0 tabular-nums`}>
                          {pay.amount < 0 ? "-" : ""}
                          {fmt(Math.abs(pay.amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ============ RECETTES ============ */}
        {activeTab === "revenue" && (
          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border-card)] overflow-hidden">
            <div className="p-3 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center gap-2 bg-[var(--surface-sunken)]">
              <div className="flex gap-2 flex-wrap items-center flex-1">
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                  <input
                    type="text"
                    placeholder="Rechercher (client, réf, réservation)"
                    value={revenueSearch}
                    onChange={(e) => setRevenueSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--border-strong)] w-full sm:w-56"
                  />
                </div>
                <select
                  value={revenueMethod}
                  onChange={(e) => setRevenueMethod(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] focus:outline-none"
                >
                  <option value="all">Tous les modes</option>
                  <option value="cash">Espèces</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank">Virement</option>
                  <option value="other">Autre</option>
                </select>
                <select
                  value={revenueType}
                  onChange={(e) => setRevenueType(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] focus:outline-none"
                >
                  <option value="all">Tous les types</option>
                  <option value="booking">Paiements réservation</option>
                  <option value="manual_in">Entrées de caisse</option>
                  <option value="manual_out">Sorties de caisse</option>
                </select>
                <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/shift")} className="gap-1.5 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]">
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Caisse du jour
                </Button>
              </div>
              <div className="sm:ml-auto flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleExportPdf} loading={exportingPdf} className="gap-2 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]">
                  <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Rapport Financier PDF</span><span className="sm:hidden">PDF</span>
                </Button>
                <Button variant="outline" size="sm" onClick={exportRevenueCSV} className="gap-2 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]" disabled={filteredPayments.length === 0}>
                  <Download className="w-4 h-4" /> CSV
                </Button>
              </div>
            </div>

            {filteredPayments.length === 0 ? (
              <div className="p-12 text-center">
                <TrendingUp className="w-12 h-12 text-[var(--foreground-muted)] mx-auto mb-4" />
                <p className="text-sm text-[var(--foreground-subtle)] mb-4">Aucune recette sur la période</p>
                <Button size="sm" className="!bg-[var(--surface-muted)] !text-[var(--foreground)] hover:!bg-white" onClick={() => router.push("/dashboard/shift")}>
                  <ArrowLeftRight className="w-4 h-4" /> Encaisser depuis la caisse
                </Button>
              </div>
            ) : (
              <>
              {/* Cartes mobiles */}
              <div className="md:hidden divide-y divide-[var(--border-subtle)]">
                {filteredPayments.map((pay) => {
                  const isOut = pay.amount < 0;
                  return (
                    <div key={pay.id} className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {pay.booking?.booking_code && (
                            <span className="font-mono text-[11px] bg-[var(--surface-muted)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded">
                              {pay.booking.booking_code}
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--foreground-subtle)] whitespace-nowrap">{formatDate(pay.payment_date)}</span>
                        </div>
                        <p className="text-xs font-medium text-[var(--foreground)] mt-1 truncate">
                          {pay.booking?.client_name || (pay.notes ? pay.notes : "Opération de caisse")}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge variant={isOut ? "error" : "info"} className={isOut ? "!bg-red-500/15 !text-red-400" : "!bg-blue-500/15 !text-blue-400"}>
                            {paymentMethodDisplay(pay)}
                          </Badge>
                          {pay.reference && <span className="text-[11px] text-[var(--foreground-subtle)]">{pay.reference}</span>}
                        </div>
                      </div>
                      <p className={`text-sm font-bold flex-shrink-0 ${isOut ? "text-red-400" : "text-emerald-400"}`}>
                        {isOut ? "-" : ""}
                        {fmt(Math.abs(pay.amount))}
                      </p>
                    </div>
                  );
                })}
                <div className="p-3 flex items-center justify-between border-t border-[var(--border)]">
                  <span className="text-xs font-semibold text-[var(--foreground-muted)]">Total recettes nettes</span>
                  <span className="text-sm font-bold text-white">
                    {fmt(filteredPayments.reduce((s, p) => s + p.amount, 0))}
                  </span>
                </div>
              </div>
              {/* Tableau desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th
                        aria-sort={revenueSort.key === "date" ? (revenueSort.direction === "asc" ? "ascending" : "descending") : "none"}
                        className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider cursor-pointer"
                        onClick={() =>
                          setRevenueSort({ key: "date", direction: revenueSort.direction === "asc" ? "desc" : "asc" })
                        }
                      >
                        Date {revenueSort.key === "date" ? (revenueSort.direction === "asc" ? <ArrowUp className="w-3 h-3 inline-block" /> : <ArrowDown className="w-3 h-3 inline-block" />) : <ArrowUpDown className="w-3 h-3 inline-block opacity-30" />}
                      </th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Client / Opération</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Méthode</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Référence</th>
                      <th
                        aria-sort={revenueSort.key === "amount" ? (revenueSort.direction === "asc" ? "ascending" : "descending") : "none"}
                        className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider cursor-pointer"
                        onClick={() =>
                          setRevenueSort({ key: "amount", direction: revenueSort.direction === "asc" ? "desc" : "asc" })
                        }
                      >
                        Montant {revenueSort.key === "amount" ? (revenueSort.direction === "asc" ? <ArrowUp className="w-3 h-3 inline-block" /> : <ArrowDown className="w-3 h-3 inline-block" />) : <ArrowUpDown className="w-3 h-3 inline-block opacity-30" />}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredPayments.map((pay) => {
                      const isOut = pay.amount < 0;
                      return (
                        <tr key={pay.id} className="hover:bg-[var(--surface-hover)]">
                          <td className="p-2.5 text-xs text-[var(--foreground-muted)] whitespace-nowrap">{formatDate(pay.payment_date)}</td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-2">
                              {pay.booking?.booking_code && (
                                <span className="font-mono text-[11px] bg-[var(--surface-muted)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded">
                                  {pay.booking.booking_code}
                                </span>
                              )}
                              <span className="text-xs font-medium text-[var(--foreground)]">
                                {pay.booking?.client_name || (pay.notes ? pay.notes : "Opération de caisse")}
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5">
                            <Badge variant={isOut ? "error" : "info"} className={isOut ? "!bg-red-500/15 !text-red-400" : "!bg-blue-500/15 !text-blue-400"}>
                              {paymentMethodDisplay(pay)}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-xs text-[var(--foreground-muted)]">{pay.reference || "—"}</td>
                          <td className={`p-2.5 text-right text-xs font-bold ${isOut ? "text-red-400" : "text-emerald-400"}`}>
                            {isOut ? "-" : ""}
                            {fmt(Math.abs(pay.amount))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--border)]">
                      <td colSpan={4} className="p-2.5 text-xs font-semibold text-[var(--foreground-muted)]">
                        Total recettes nettes
                      </td>
                      <td className="p-2.5 text-right text-sm font-bold text-white">
                        {fmt(filteredPayments.reduce((s, p) => s + p.amount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {/* ============ DÉPENSES ============ */}
        {activeTab === "expenses" && (
          <div className="space-y-4">
            {categoryBreakdown.length > 0 && (
              <div className="rounded-xl bg-[var(--surface)] border border-[var(--border-card)] p-3.5">
                <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-[var(--foreground-subtle)]" /> Où va le budget (par catégorie)
                </h2>
                <CategoryPie items={categoryBreakdown} fmt={fmt} />
              </div>
            )}

            <div className="rounded-xl bg-[var(--surface)] border border-[var(--border-card)] overflow-hidden">
            <div className="p-3 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center gap-2 bg-[var(--surface-sunken)]">
              <div className="flex gap-2 flex-wrap items-center flex-1">
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                  <input
                    type="text"
                    placeholder="Rechercher une dépense"
                    value={expenseSearch}
                    onChange={(e) => setExpenseSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--border-strong)] w-full sm:w-56"
                  />
                </div>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] focus:outline-none"
                >
                  <option value="all">Toutes les catégories</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {getExpenseCategoryLabel(cat)}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={openNewExpense} className="gap-1.5 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]">
                  <Plus className="w-3.5 h-3.5" /> Ajouter
                </Button>
              </div>
              <div className="sm:ml-auto flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleExportPdf} loading={exportingPdf} className="gap-2 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]">
                  <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Rapport Financier PDF</span><span className="sm:hidden">PDF</span>
                </Button>
                <Button variant="outline" size="sm" onClick={exportExpensesCSV} className="gap-2 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]" disabled={filteredExpenses.length === 0}>
                  <Download className="w-4 h-4" /> CSV
                </Button>
              </div>
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="p-12 text-center">
                <TrendingDown className="w-12 h-12 text-[var(--foreground-muted)] mx-auto mb-4" />
                <p className="text-sm text-[var(--foreground-subtle)] mb-4">Aucune dépense sur la période</p>
                <Button className="!bg-[var(--surface-muted)] !text-[var(--foreground)] hover:!bg-white" onClick={openNewExpense}>
                  <Plus className="w-4 h-4" /> Enregistrer une dépense
                </Button>
              </div>
            ) : (
              <>
              {/* Cartes mobiles */}
              <div className="md:hidden divide-y divide-[var(--border-subtle)]">
                {filteredExpenses.map((exp) => (
                  <div key={exp.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--foreground)] truncate">{exp.description}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge variant="theme" className="!bg-[var(--surface-muted)] !text-[var(--foreground-muted)]">
                            {getExpenseCategoryLabel(exp.category)}
                          </Badge>
                          <span className="text-[11px] text-[var(--foreground-subtle)]">
                            {accommodations.find((a) => a.id === exp.accommodation_id)?.name || "—"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">{formatDate(exp.expense_date)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-sm font-bold text-red-400">{fmt(exp.amount)}</span>
                        <button
                          onClick={() => openEditExpense(exp)}
                          title="Modifier"
                          className="p-1.5 rounded-md text-[var(--foreground-subtle)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingExpense(exp)}
                          title="Supprimer"
                          className="p-1.5 rounded-md text-[var(--foreground-subtle)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="p-3 flex items-center justify-between border-t border-[var(--border)]">
                  <span className="text-xs font-semibold text-[var(--foreground-muted)]">Total dépenses</span>
                  <span className="text-sm font-bold text-red-400">
                    {fmt(filteredExpenses.reduce((s, e) => s + e.amount, 0))}
                  </span>
                </div>
              </div>
              {/* Tableau desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Description</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Catégorie</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Établissement</th>
                      <th
                        aria-sort={expenseSort.key === "date" ? (expenseSort.direction === "asc" ? "ascending" : "descending") : "none"}
                        className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider cursor-pointer"
                        onClick={() => setExpenseSort({ key: "date", direction: expenseSort.direction === "asc" ? "desc" : "asc" })}
                      >
                        Date {expenseSort.key === "date" ? (expenseSort.direction === "asc" ? <ArrowUp className="w-3 h-3 inline-block" /> : <ArrowDown className="w-3 h-3 inline-block" />) : <ArrowUpDown className="w-3 h-3 inline-block opacity-30" />}
                      </th>
                      <th
                        aria-sort={expenseSort.key === "amount" ? (expenseSort.direction === "asc" ? "ascending" : "descending") : "none"}
                        className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider cursor-pointer"
                        onClick={() => setExpenseSort({ key: "amount", direction: expenseSort.direction === "asc" ? "desc" : "asc" })}
                      >
                        Montant {expenseSort.key === "amount" ? (expenseSort.direction === "asc" ? <ArrowUp className="w-3 h-3 inline-block" /> : <ArrowDown className="w-3 h-3 inline-block" />) : <ArrowUpDown className="w-3 h-3 inline-block opacity-30" />}
                      </th>
                      <th className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-[var(--surface-hover)] group">
                        <td className="p-2.5 text-xs font-medium text-[var(--foreground)]">{exp.description}</td>
                        <td className="p-2.5">
                          <Badge variant="theme" className="!bg-[var(--surface-muted)] !text-[var(--foreground-muted)]">
                            {getExpenseCategoryLabel(exp.category)}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)]">
                          {accommodations.find((a) => a.id === exp.accommodation_id)?.name || "—"}
                        </td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)] whitespace-nowrap">{formatDate(exp.expense_date)}</td>
                        <td className="p-2.5 text-right text-xs font-bold text-red-400">{fmt(exp.amount)}</td>
                        <td className="p-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditExpense(exp)}
                              title="Modifier"
                              className="p-1.5 rounded-md text-[var(--foreground-subtle)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingExpense(exp)}
                              title="Supprimer"
                              className="p-1.5 rounded-md text-[var(--foreground-subtle)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--border)]">
                      <td colSpan={4} className="p-2.5 text-xs font-semibold text-[var(--foreground-muted)]">
                        Total dépenses
                      </td>
                      <td className="p-2.5 text-right text-sm font-bold text-red-400">
                        {fmt(filteredExpenses.reduce((s, e) => s + e.amount, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </>
            )}
          </div>
          </div>
        )}

        {/* ============ FACTURES ============ */}
        {activeTab === "invoices" && (
          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border-card)] overflow-hidden">
            <div className="p-3 border-b border-[var(--border)] flex flex-col sm:flex-row gap-2 sm:items-center bg-[var(--surface-sunken)]">
              <div className="flex gap-2 flex-wrap items-center flex-1">
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                  <input
                    type="text"
                    placeholder="Rechercher (n° facture, client, réservation)"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--border-strong)] w-full sm:w-56"
                  />
                </div>
                <select
                  value={invoiceStatus}
                  onChange={(e) => setInvoiceStatus(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] focus:outline-none"
                >
                  <option value="all">Tous les statuts</option>
                  {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:ml-auto">
                <Button variant="outline" size="sm" onClick={exportInvoicesCSV} className="gap-2 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]" disabled={filteredInvoices.length === 0}>
                  <Download className="w-4 h-4" /> Exporter CSV
                </Button>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-12 h-12 text-[var(--foreground-muted)] mx-auto mb-4" />
                <p className="text-sm text-[var(--foreground-subtle)] mb-2">Aucune facture sur la période</p>
                <p className="text-xs text-[var(--foreground-subtle)]">
                  Les factures sont générées depuis la page Réservations.
                </p>
              </div>
            ) : (
              <>
              {/* Cartes mobiles */}
              <div className="md:hidden divide-y divide-[var(--border-subtle)]">
                {filteredInvoices.map((inv) => (
                  <div key={inv.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-[var(--foreground)]">{inv.invoice_number}</span>
                          <span className="text-[11px] text-[var(--foreground-subtle)] whitespace-nowrap">{formatDate(inv.created_at)}</span>
                        </div>
                        <p className="text-xs text-[var(--foreground-muted)] mt-1 truncate">
                          {inv.booking?.client_name || "—"}
                          {inv.booking?.booking_code ? ` · ${inv.booking.booking_code}` : ""}
                        </p>
                        <Badge
                          variant={inv.status === "paid" ? "success" : inv.status === "sent" ? "default" : inv.status === "draft" ? "info" : inv.status === "partial" ? "warning" : "error"}
                          className={
                            inv.status === "paid"
                              ? "!bg-emerald-500/15 !text-emerald-400"
                              : inv.status === "sent"
                                ? "!bg-[var(--surface-muted)] !text-[var(--foreground-muted)]"
                                : inv.status === "draft"
                                  ? "!bg-blue-500/15 !text-blue-400"
                                  : inv.status === "partial"
                                    ? "!bg-amber-500/15 !text-amber-400"
                                    : "!bg-red-500/15 !text-red-400"
                          }
                        >
                          {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="text-right mr-1">
                          <p className="text-sm font-bold text-[var(--foreground)]">{fmt(inv.total_amount)}</p>
                          <p className="text-[10px] text-[var(--foreground-subtle)]">TTC</p>
                        </div>
                        {inv.pdf_url && (
                          <button
                            onClick={() => handleOpenInvoice(inv)}
                            title="Voir la facture PDF"
                            className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {inv.pdf_url && (
                          <button
                            onClick={() => handleOpenInvoice(inv)}
                            title="Télécharger la facture"
                            className="p-1.5 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Actions intelligentes par statut */}
                        {INVOICE_STATUS_ACTIONS[inv.status]?.map((action) => (
                          <button
                            key={action.status}
                            onClick={() => openInvoiceStatusChange(inv, action.status)}
                            title={action.label}
                            className={`p-1.5 rounded-md transition-colors ${
                              action.color === "green"
                                ? "text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                : action.color === "blue"
                                ? "text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                                : action.color === "amber"
                                ? "text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                : "text-red-500 hover:text-red-400 hover:bg-red-500/10"
                            }`}
                          >
                            {action.icon === "send" && <Send className="w-3.5 h-3.5" />}
                            {action.icon === "paid" && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {action.icon === "partial" && <AlertTriangle className="w-3.5 h-3.5" />}
                            {action.icon === "cancel" && <XCircle className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--foreground-subtle)] mt-1.5">
                      Sous-total {fmt(inv.amount)} · TVA {fmt(inv.tax_amount)}
                    </p>
                  </div>
                ))}
              </div>
              {/* Tableau desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">N° Facture</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Date</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Client</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Réservation</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Sous-total</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">TVA</th>
                      <th className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Total TTC</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Statut</th>
                      <th className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[var(--surface-hover)]">
                        <td className="p-2.5 text-xs font-medium text-[var(--foreground)]">{inv.invoice_number}</td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)] whitespace-nowrap">{formatDate(inv.created_at)}</td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)]">{inv.booking?.client_name || "—"}</td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)]">{inv.booking?.booking_code || "—"}</td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)]">{fmt(inv.amount)}</td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)]">{fmt(inv.tax_amount)}</td>
                        <td className="p-2.5 text-right text-xs font-bold text-[var(--foreground)]">{fmt(inv.total_amount)}</td>
                        <td className="p-2.5">
                          <Badge
                            variant={inv.status === "paid" ? "success" : inv.status === "sent" ? "default" : inv.status === "draft" ? "info" : inv.status === "partial" ? "warning" : "error"}
                            className={
                              inv.status === "paid"
                                ? "!bg-emerald-500/15 !text-emerald-400"
                                : inv.status === "sent"
                                  ? "!bg-[var(--surface-muted)] !text-[var(--foreground-muted)]"
                                  : inv.status === "draft"
                                    ? "!bg-blue-500/15 !text-blue-400"
                                    : inv.status === "partial"
                                      ? "!bg-amber-500/15 !text-amber-400"
                                      : "!bg-red-500/15 !text-red-400"
                            }
                          >
                            {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                          </Badge>
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {inv.pdf_url && (
                              <button
                                onClick={() => handleOpenInvoice(inv)}
                                title="Voir la facture PDF"
                                className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {inv.pdf_url && (
                              <button
                                onClick={() => handleOpenInvoice(inv)}
                                title="Télécharger la facture"
                                className="p-1.5 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Actions intelligentes par statut */}
                            {INVOICE_STATUS_ACTIONS[inv.status]?.map((action) => (
                              <button
                                key={action.status}
                                onClick={() => openInvoiceStatusChange(inv, action.status)}
                                title={action.label}
                                className={`p-1.5 rounded-md transition-colors ${
                                  action.color === "green"
                                    ? "text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                    : action.color === "blue"
                                    ? "text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                                    : action.color === "amber"
                                    ? "text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                    : "text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                }`}
                              >
                                {action.icon === "send" && <Send className="w-3.5 h-3.5" />}
                                {action.icon === "paid" && <CheckCircle2 className="w-3.5 h-3.5" />}
                                {action.icon === "partial" && <AlertTriangle className="w-3.5 h-3.5" />}
                                {action.icon === "cancel" && <XCircle className="w-3.5 h-3.5" />}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

                {/* ============ JOURNAL D'AUDIT ============ */}
        {activeTab === "audit" && (
            <div className="rounded-xl bg-[var(--surface)] border border-[var(--border-card)] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <History className="w-4 h-4 text-[var(--foreground-subtle)]" /> Journal d'audit
                </h2>
                <span className="text-[11px] text-[var(--foreground-subtle)]">{filteredAuditLogs.length} / {auditLogs.length} entrées</span>
              </div>

              {presentAuditCategories.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button onClick={() => setAuditFilter(null)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${!auditFilter ? "bg-[var(--foreground)] text-[var(--surface)] border-[var(--foreground)]" : "bg-[var(--surface-sunken)] text-[var(--foreground-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}>
                    Tous
                  </button>
                  {presentAuditCategories.map((cat) => {
                    const catInfo = AUDIT_CATEGORIES[cat] || { label: cat, emoji: "" };
                    const active = auditFilter === cat;
                    return (
                      <button key={cat} onClick={() => setAuditFilter(active ? null : cat)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${active ? "bg-[var(--foreground)] text-[var(--surface)] border-[var(--foreground)]" : "bg-[var(--surface-sunken)] text-[var(--foreground-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}>
                        {catInfo.emoji} {catInfo.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredAuditLogs.length === 0 ? (
                <div className="text-center py-8">
                  <ScrollText className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-3" />
                  <p className="text-sm text-[var(--foreground-subtle)]">{auditFilter ? "Aucune action dans cette catégorie" : "Aucune action enregistrée"}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedAuditLogs.map((g) => (
                    <div key={g.group}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] mb-1.5 px-1">{g.group}</p>
                      <div className="space-y-1.5">
                        {g.items.map((log) => {
                          const info = getAuditActionInfo(log.action);
                          const summary = buildAuditSummary(log, usersById);
                          const time = new Date(log.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                          return (
                            <div key={log.id} onClick={() => setSelectedLog(log)} className={`flex items-start gap-3 p-3 rounded-lg ${info.bg} border border-[var(--border)]/40 cursor-pointer hover:brightness-95 transition-all`}>
                              <span className="text-xl mt-0.5 flex-shrink-0">{info.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-[11px] font-semibold ${info.color}`}>{info.label}</span>
                                  <span className="text-[10px] text-[var(--foreground-muted)]">{time}</span>
                                </div>
                                <p className="text-[11px] text-[var(--foreground-subtle)] leading-relaxed line-clamp-2">{summary}</p>
                              </div>
                              <Eye className="w-3.5 h-3.5 text-[var(--foreground-muted)] mt-1 flex-shrink-0 opacity-40" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

{/* ============ CLIENTS (CRM) ============ */}
        {activeTab === "clients" && (
          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border-card)] overflow-hidden">
            <div className="p-3 border-b border-[var(--border)] flex flex-col sm:flex-row gap-2 sm:items-center bg-[var(--surface-sunken)]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                <input
                  type="text"
                  placeholder="Rechercher un client (nom, téléphone, email)"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--border-strong)]"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportClientsCSV} className="gap-2 !border-[var(--border)] !bg-[var(--surface-muted)] !text-[var(--foreground-muted)] hover:!bg-[var(--surface-muted)]" disabled={filteredClients.length === 0}>
                <Download className="w-4 h-4" /> Exporter CSV
              </Button>
            </div>
            {/* KPIs CRM */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 border-b border-[var(--border)] bg-[var(--surface-sunken)]">
              <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)] text-center">
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">Clients</p>
                <p className="text-lg font-bold text-[var(--foreground)]">{crmTotalClients}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)] text-center">
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">CA total</p>
                <p className="text-lg font-bold text-emerald-600">{fmt(crmTotalRevenue)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)] text-center">
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">Impay\u00e9s</p>
                <p className={`text-lg font-bold ${crmUnpaidClients > 0 ? "text-red-600" : "text-emerald-600"}`}>{crmUnpaidClients}</p>
                {crmUnpaidTotal > 0 && <p className="text-[10px] text-red-500">{fmt(crmUnpaidTotal)}</p>}
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)] text-center">
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">Fid\u00e8les</p>
                <p className="text-lg font-bold text-purple-600">{crmLoyalClients}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">\u2265 3 s\u00e9jours</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)] text-center">
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">Score moy.</p>
                <p className="text-lg font-bold text-amber-600">{crmAvgScore}</p>
              </div>
            </div>

            {/* Filtres + tri */}
            <div className="px-3 pb-3 flex flex-wrap gap-1.5">
              {([
                ["all", "Tous"],
                ["unpaid", "Impayés"],
                ["loyal", "Fidèles"],
                ["recent", "Récents 30j"],
                ["vip", "VIP ≥80"],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setClientFilter(key)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${clientFilter === key ? "bg-[var(--foreground)] text-[var(--surface)] border-[var(--foreground)]" : "bg-[var(--surface-sunken)] text-[var(--foreground-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}>
                  {label}
                </button>
              ))}
              <span className="text-[10px] text-[var(--foreground-muted)] self-center ml-1">{filteredClients.length} client{filteredClients.length > 1 ? "s" : ""}</span>
            </div>

            {filteredClients.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-[var(--foreground-muted)] mx-auto mb-4" />
                <p className="text-sm text-[var(--foreground-subtle)]">Aucun client enregistré</p>
                <p className="text-xs text-[var(--foreground-subtle)] mt-1">Les clients apparaissent dès la première réservation</p>
              </div>
            ) : (
              <>
              {/* Cartes mobiles */}
              <div className="md:hidden divide-y divide-[var(--border-subtle)]">
                {filteredClients.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedClient(c)}
                    className="p-3 cursor-pointer active:bg-[var(--surface-hover)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[var(--surface-muted)] flex items-center justify-center font-bold text-xs text-[var(--foreground-muted)] flex-shrink-0">
                          {c.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--foreground)] truncate">{c.full_name}</p>
                          <p className="text-[11px] text-[var(--foreground-subtle)] truncate">
                            {c.nationality || ""} {c.nationality && c.id_type ? "•" : ""} {c.id_type || ""}
                          </p>
                        </div>
                      </div>
                      <ClientScoreBadge score={c.score} tier={c.tier} clientId={c.id} showValue={false} />
                    </div>
                    {c.phone && (
                      <p className="text-[11px] text-[var(--foreground-subtle)] mt-2 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                      <div className="rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] py-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">Séjours</p>
                        <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5">
                          {c.stayCount} · {c.nights} nuit{c.nights > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] py-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">CA total</p>
                        <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 truncate">{fmt(c.totalSpent)}</p>
                      </div>
                      <div className="rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] py-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">Solde</p>
                        {c.balance > 0 ? (
                          <p className="text-xs font-bold text-red-400 mt-0.5 truncate">{fmt(c.balance)}</p>
                        ) : (
                          <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center justify-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> À jour
                          </p>
                        )}
                      </div>
                    </div>
                    {c.phone && (
                      <div className="flex items-center gap-2 mt-2.5">
                        <a
                          href={`https://wa.me/${c.phone.replace(/[^+\d]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Contacter sur WhatsApp"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClient(c);
                          }}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                        >
                          <Eye className="w-3.5 h-3.5" /> Dossier
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Tableau desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Client</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Score</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Contact</th>
                      <th className="text-left p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Séjours</th>
                      <th className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">CA total</th>
                      <th className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Encaissé</th>
                      <th className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Solde dû</th>
                      <th className="text-right p-2.5 text-[11px] font-medium text-[var(--foreground-subtle)] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredClients.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedClient(c)}
                        className="hover:bg-[var(--surface-hover)] cursor-pointer"
                      >
                        <td className="p-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[var(--surface-muted)] flex items-center justify-center font-bold text-xs text-[var(--foreground-muted)] flex-shrink-0">
                              {c.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-[var(--foreground)]">{c.full_name}</p>
                              <p className="text-[11px] text-[var(--foreground-subtle)]">
                                {c.nationality || ""} {c.nationality && c.id_type ? "•" : ""} {c.id_type || ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-2.5">
                          <ClientScoreBadge score={c.score} tier={c.tier} clientId={c.id} showValue={false} />
                        </td>
                        <td className="p-2.5">
                          <div className="text-xs text-[var(--foreground-muted)]">
                            {c.phone && (
                              <p className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {c.phone}
                              </p>
                            )}
                            {c.email && <p className="truncate max-w-[180px]">{c.email}</p>}
                          </div>
                        </td>
                        <td className="p-2.5 text-xs text-[var(--foreground-muted)]">
                          {c.stayCount} séjour{c.stayCount > 1 ? "s" : ""} · {c.nights} nuit{c.nights > 1 ? "s" : ""}
                        </td>
                        <td className="p-2.5 text-right text-xs font-semibold text-[var(--foreground)]">{fmt(c.totalSpent)}</td>
                        <td className="p-2.5 text-right text-xs text-emerald-400">{fmt(c.paid)}</td>
                        <td className="p-2.5 text-right">
                          {c.balance > 0 ? (
                            <span className="text-xs font-bold text-red-400">{fmt(c.balance)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" /> À jour
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {c.phone && (
                              <a
                                href={`https://wa.me/${c.phone.replace(/[^+\d]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Contacter sur WhatsApp"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedClient(c);
                              }}
                              title="Voir le dossier client"
                              className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}
          </div>
        </div>

      {/* ============ MODAL DÉPENSE ============ */}
      <Modal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title={editingExpense ? "Modifier la dépense" : "Nouvelle dépense"}
        description="Enregistrez une charge avec sa catégorie et sa date"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Catégorie <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {EXPENSE_CATEGORY_GROUPS.map((g) => (
                <div key={g.group}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{g.group}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {g.items.map((item) => {
                      const Icon = CATEGORY_ICONS[item.value] || Coins;
                      const active = expenseForm.category === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setExpenseForm({ ...expenseForm, category: item.value })}
                          className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            active
                              ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] text-[var(--primary-muted-foreground)]"
                              : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <Icon className="w-4 h-4" />
                            {getExpenseCategoryLabel(item.value)}
                          </span>
                          {item.hint && <span className="text-[10px] font-normal text-slate-400">{item.hint}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Input
            label="Description"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            placeholder="Ex : Achat de produits d'entretien"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Montant (FCFA)"
              type="number"
              min={0}
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              placeholder="5000"
            />
            <Input
              label="Date"
              type="date"
              value={expenseForm.expense_date}
              onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Établissement (optionnel)
            </label>
            <select
              value={expenseForm.accommodation_id}
              onChange={(e) => setExpenseForm({ ...expenseForm, accommodation_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
            >
              <option value="">Tous (charges générales)</option>
              {accommodations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setExpenseModalOpen(false)}>
              Annuler
            </Button>
            <Button className="flex-1" onClick={handleSaveExpense} loading={savingExpense}>
              {editingExpense ? "Enregistrer les modifications" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============ MODAL SUPPRESSION ============ */}
      <Modal
        open={!!deletingExpense}
        onClose={() => setDeletingExpense(null)}
        title="Supprimer cette dépense ?"
        description="Cette action est irréversible."
      >
        <div className="space-y-3">
          {deletingExpense && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">
                <span className="font-semibold">{deletingExpense.description}</span> — {fmt(deletingExpense.amount)} du {formatDate(deletingExpense.expense_date)}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setDeletingExpense(null)}>
              Annuler
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleDeleteExpense}>
              <Trash2 className="w-4 h-4" /> Supprimer
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============ MODAL CLIENT (CRM) ============ */}
      <Modal
        open={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        title={selectedClient?.full_name || "Client"}
        description="Dossier client — historique et situation comptable"
        size="lg"
      >
        {selectedClient && (
          <div className="space-y-4">
            {/* Coordonnées */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedClient.phone && (
                <a
                  href={`https://wa.me/${selectedClient.phone.replace(/[^+\d]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                </a>
              )}
              {selectedClient.phone && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5" /> {selectedClient.phone}
                </span>
              )}
              {selectedClient.email && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-300">
                  <FileText className="w-3.5 h-3.5" /> {selectedClient.email}
                </span>
              )}
              {selectedClient.nationality && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-300">
                  <User className="w-3.5 h-3.5" /> {selectedClient.nationality}
                </span>
              )}
              <ClientScoreBadge score={selectedClient.score} tier={selectedClient.tier} />
            </div>

            {/* Lien fiche intelligente */}
            <Link
              href={`/dashboard/clients/${selectedClient.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary-color,#0C1C33)] hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" /> Ouvrir la fiche intelligente
            </Link>

            {/* Chiffres clés */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                <p className="text-[11px] text-slate-400">Séjours</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedClient.stayCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                <p className="text-[11px] text-slate-400">Nuits</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedClient.nights}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
                <p className="text-[11px] text-slate-400">Encaissé</p>
                <p className="text-lg font-bold text-green-600">{fmt(selectedClient.paid)}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                <p className="text-[11px] text-slate-400">Solde dû</p>
                <p className={`text-lg font-bold ${selectedClient.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {selectedClient.balance > 0 ? fmt(selectedClient.balance) : "À jour"}
                </p>
              </div>
            </div>

            {/* Historique des réservations */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Réservations ({selectedClient.bookings.length})
              </h3>
              {selectedClient.bookings.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Aucune réservation</p>
              ) : (
                <div className="space-y-2 pr-1">
                  {selectedClient.bookings.map((b) => (
                    <div key={b.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {b.booking_code}
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400">
                            {fmt(b.total_amount)} · payé {fmt(b.amount_paid)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={b.payment_status === "paid" ? "success" : b.payment_status === "partial" ? "warning" : "error"}>
                            {b.payment_status === "paid" ? "Soldé" : b.payment_status === "partial" ? "Partiel" : b.payment_status === "refunded" ? "Remboursé" : "Impayé"}
                          </Badge>
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
                          <StayTimeline bookingId={b.id} tenantId={tenantId} clientId={selectedClient.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ============ MODAL CHANGEMENT DE STATUT FACTURE ============ */}
      <Modal
        open={!!invoiceStatusTarget}
        onClose={() => setInvoiceStatusTarget(null)}
        title={invoiceStatusTarget ? getTransitionLabel(invoiceStatusTarget.invoice.status, invoiceStatusTarget.newStatus) : ""}
        description="Confirmez le changement de statut de cette facture"
      >
        <div className="space-y-3">
          {invoiceStatusTarget && (
            <div className={`p-3 rounded-xl border ${
              invoiceStatusTarget.newStatus === "cancelled"
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                : invoiceStatusTarget.newStatus === "paid"
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            }`}>
              <div className="flex items-center gap-3">
                {invoiceStatusTarget.newStatus === "cancelled" && (
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                )}
                {invoiceStatusTarget.newStatus === "paid" && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                )}
                {invoiceStatusTarget.newStatus === "sent" && (
                  <Send className="w-5 h-5 text-blue-600 flex-shrink-0" />
                )}
                {invoiceStatusTarget.newStatus === "partial" && (
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-medium ${
                    invoiceStatusTarget.newStatus === "cancelled"
                      ? "text-red-700 dark:text-red-300"
                      : invoiceStatusTarget.newStatus === "paid"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-blue-700 dark:text-blue-300"
                  }`}>
                    {invoiceStatusTarget.invoice.invoice_number}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {fmt(invoiceStatusTarget.invoice.total_amount)} TTC
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setInvoiceStatusTarget(null)}>
              Annuler
            </Button>
            <Button
              className={`flex-1 ${
                invoiceStatusTarget?.newStatus === "cancelled"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : invoiceStatusTarget?.newStatus === "paid"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : ""
              }`}
              onClick={confirmInvoiceStatusChange}
              disabled={updatingInvoiceStatus}
            >
              {updatingInvoiceStatus ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Mise à jour...</>
              ) : (
                <>Confirmer</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

            {/* ============ MODAL DETAIL JOURNAL D'AUDIT ============ */}
      <Modal
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title=""
        size="lg"
      >
        {selectedLog && (() => {
          const info = getAuditActionInfo(selectedLog.action);
          const summary = buildAuditSummary(selectedLog, usersById);
          const time = new Date(selectedLog.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          return (
          <div className="space-y-4">
            <div className={`${info.bg} rounded-xl p-4 border border-[var(--border)]/30`}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{info.emoji}</span>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${info.color}`}>{info.label}</p>
                  <p className="text-[12px] text-[var(--foreground)] mt-1 leading-relaxed">{summary}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)] mt-2">{formatDate(selectedLog.created_at)} à {time}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border)]/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Entité</p>
                <p className="text-[var(--foreground)]">{selectedLog.entity_type}{selectedLog.entity_id ? ` #${selectedLog.entity_id.substring(0, 8)}` : ""}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border)]/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Utilisateur</p>
                <p className="text-[var(--foreground)]">{usersById[selectedLog.user_id || ""] || "Système"}</p>
              </div>
            </div>

            {selectedLog.ip_address && (
              <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border)]/50 text-[12px]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Adresse IP</p>
                <p className="text-[var(--foreground)] font-mono text-[11px]">{selectedLog.ip_address}</p>
              </div>
            )}

            {(selectedLog.old_values || selectedLog.new_values) && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Détails de la modification</p>
                {(() => {
                  const allKeys = [
                    ...new Set([
                      ...(selectedLog.old_values ? Object.keys(selectedLog.old_values) : []),
                      ...(selectedLog.new_values ? Object.keys(selectedLog.new_values) : []),
                    ]),
                  ];
                  if (allKeys.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-[var(--border)]/50 overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto] text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] bg-[var(--surface-sunken)]">
                        <span className="px-3 py-1.5">Champ</span>
                        <span className="px-3 py-1.5 flex gap-6">
                          <span className="w-28 text-right">Avant</span>
                          <span className="w-28 text-right">Après</span>
                        </span>
                      </div>
                      {allKeys.map((key) => {
                        const oldVal = selectedLog.old_values?.[key];
                        const newVal = selectedLog.new_values?.[key];
                        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
                        return (
                          <div key={key} className={`grid grid-cols-[1fr_auto] border-t border-[var(--border)]/30 text-[12px] ${changed ? "bg-[var(--surface-hover)]" : ""}`}>
                            <span className="px-3 py-2 text-[var(--foreground)] font-medium">{auditFieldLabel(key)}</span>
                            <span className="px-3 py-2 flex gap-6">
                              <span className={`w-28 text-right ${oldVal !== undefined ? "text-[var(--foreground-muted)] line-through" : "text-[var(--foreground-muted)]"}`}>
                                {auditFieldValue(key, oldVal)}
                              </span>
                              <span className="w-28 text-right text-[var(--foreground)] font-medium">
                                {auditFieldValue(key, newVal)}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>Fermer</Button>
            </div>
          </div>
          );
        })()}
      </Modal>
    </div>
  );
}
