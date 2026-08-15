// ============================================================================
// SÉJOURA — Utilitaires globaux
// ============================================================================

import { canAccessFeature, getPlanLimits as getNormalizedPlanLimits, getPlanPrice as getNormalizedPlanPrice, normalizePlan } from "@/lib/subscription-plans";
import { formatPrice, getCurrencySymbol } from "@/lib/currencyConverter";

export { formatPrice };

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Formate un montant avec le symbole de devise d'un établissement
 * Ex: (15000, "FCFA") -> "15 000 FCFA"
 * Ex: (15000, "€") -> "converted €"
 * Ex: (15000, "₦") -> "converted ₦"
 *
 * Tous les montants en base de données sont en XOF (devise de référence).
 * Cette fonction convertit automatiquement depuis XOF vers la devise cible.
 */
export function formatAmount(amount: number, symbol: string = "FCFA"): string {
  const code = symbolToCode(symbol);
  return formatPrice(amount, code);
}

function symbolToCode(symbol: string): string {
  const trimmed = symbol.trim();
  const map: Record<string, string> = {
    "FCFA": "XOF",
    "$": "USD",
    "€": "EUR",
    "₦": "NGN",
    "₵": "GHS",
    "FG": "GNF",
    "FC": "CDF",
    "DH": "MAD",
    "DT": "TND",
    "DA": "DZD",
    "E£": "EGP",
    "KSh": "KES",
    "TSh": "TZS",
    "USh": "UGX",
    "FRw": "RWF",
    "Br": "ETB",
    "R": "ZAR",
    "Ar": "MGA",
    "Rs": "MUR",
    "£": "GBP",
  };
  return map[trimmed] || "XOF";
}

/**
 * Formate un montant en FCFA (XOF) par défaut
 * Ex: 15000 -> "15 000 FCFA"
 */
export function formatFCFA(amount: number): string {
  return formatPrice(amount, "XOF");
}

/**
 * Formate un montant sans le suffixe
 * Ex: 15000 -> "15 000"
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

/**
 * Formate une date ISO en format français
 * Ex: "2024-01-15" -> "15 janv. 2024"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Formate une date ISO en format français long
 * Ex: "2024-01-15" -> "15 janvier 2024"
 */
export function formatDateLong(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Formate une heure
 * Ex: "14:00:00" -> "14:00"
 */
export function formatTime(time: string): string {
  if (!time) return "";
  // Si c'est une heure complète (HH:MM:SS), on prend juste HH:MM
  return time.substring(0, 5);
}

/**
 * Formate une date et heure
 * Ex: "2024-01-15T14:30:00Z" -> "15 janv. 2024 à 14:30"
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Calcule le nombre de nuits entre deux dates
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Génère un token aléatoire pour les sessions client
 */
export function generateToken(length: number = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Valide un numéro de téléphone (format international ou local)
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  return /^(\+?\d{8,15})$/.test(cleaned);
}

/**
 * Normalise un numéro de téléphone (format international)
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("00")) {
    return "+" + cleaned.substring(2);
  }
  if (cleaned.startsWith("0")) {
    return "+225" + cleaned.substring(1); // Côte d'Ivoire par défaut
  }
  return "+225" + cleaned;
}

/**
 * Retourne les initiales d'un nom
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Tronque un texte
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.substring(0, length) + "...";
}

/**
 * Retourne le libellé d'un statut de réservation
 */
export function getBookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmed: "Confirmée",
    cancelled: "Annulée",
    no_show: "No-show",
    checked_in: "Arrivé",
    checked_out: "Parti",
  };
  return labels[status] || status;
}

/**
 * Retourne le libellé d'un statut de paiement
 */
export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    unpaid: "Non payé",
    partial: "Partiel",
    paid: "Payé",
    refunded: "Remboursé",
  };
  return labels[status] || status;
}

/**
 * Retourne le libellé d'un statut de chambre
 */
export function getRoomStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    available: "Disponible",
    occupied: "Occupée",
    alert: "Alerte",
    cleaning: "En nettoyage",
  };
  return labels[status] || status;
}

/**
 * Retourne le libellé d'un rôle
 */
export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    admin_residence: "Admin Établissement",
    receptionniste: "Réceptionniste",
    menagere: "Ménagère",
    client: "Client",
  };
  return labels[role] || role;
}

/**
 * Retourne le libellé d'un plan d'abonnement
 */
export function getPlanLabel(plan: string): string {
  const normalized = normalizePlan(plan);
  const labels: Record<string, string> = {
    free: "Gratuit",
    trial: "Essai gratuit",
    standard: "Essentiel",
    essentiel: "Essentiel",
    enterprise: "Entreprise",
    entreprise: "Entreprise",
  };
  return labels[normalized] || plan;
}

/**
 * Retourne le libellé d'un statut d'abonnement (paiement semi-automatisé)
 */
export function getSubscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "En attente de validation",
    active: "Actif",
    expired: "Expiré",
    trial: "Essai gratuit",
    overdue: "En retard",
    suspended: "Suspendu",
    cancelled: "Annulé",
  };
  return labels[status] || status;
}

/**
 * Modes de paiement considérés comme « Mobile Money ».
 * Depuis la migration, tous les paiements Mobile Money utilisent la méthode
 * générique « mobile_money » ; l'opérateur réel (Wave, Orange Money, …) est
 * stocké dans payments.mobile_money_operator pour le rapprochement.
 */
export const MOBILE_MONEY_METHODS = ["mobile_money"] as const;

/**
 * Opérateurs Mobile Money supportés pour le rapprochement de trésorerie.
 * Champ TEXT en base : ajoutez ici les futurs opérateurs sans migration.
 */
export const MOBILE_MONEY_OPERATORS = [
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_money", label: "MTN Money" },
  { value: "moov_money", label: "Moov Money" },
  { value: "pi_spi", label: "Pi-SPI" },
] as const;

/**
 * Retourne true si la méthode de paiement appartient au regroupement Mobile Money.
 */
export function isMobileMoney(method: string): boolean {
  return (MOBILE_MONEY_METHODS as readonly string[]).includes(method);
}

/**
 * Retourne le libellé d'un opérateur Mobile Money
 * (retombe sur « Mobile Money » si aucun opérateur n'est renseigné).
 */
export function getMobileMoneyOperatorLabel(operator: string | null | undefined): string {
  if (!operator) return "Mobile Money";
  if (operator === "mobile_money") return "Opérateur non précisé";
  return MOBILE_MONEY_OPERATORS.find((o) => o.value === operator)?.label || operator;
}

/**
 * Retourne le libellé d'une méthode de paiement
 */
export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Espèces",
    wave: "Wave",
    pi_spi: "Pi-SPI",
    mobile_money: "Mobile Money",
    bank: "Virement",
    other: "Autre",
  };
  return labels[method] || method;
}

/**
 * Retourne le libellé d'une catégorie de dépense
 */
export function getExpenseCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    salaries: "Salaires",
    utilities: "Charges",
    maintenance: "Maintenance",
    supplies: "Fournitures",
    marketing: "Marketing",
    rent: "Loyer",
    taxes: "Taxes",
    other: "Autre",
  };
  return labels[category] || category;
}

/**
 * Retourne les couleurs Tailwind pour un statut de réservation
 */
export function getBookingStatusColor(status: string): string {
  const colors: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    no_show: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    checked_in: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    checked_out: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return colors[status] || "bg-slate-100 text-slate-700";
}

/**
 * Retourne les couleurs Tailwind pour un statut de paiement
 */
export function getPaymentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    unpaid: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    partial: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  };
  return colors[status] || "bg-slate-100 text-slate-700";
}

/**
 * Retourne les couleurs Tailwind pour un statut de chambre
 */
export function getRoomStatusColor(status: string): string {
  const colors: Record<string, string> = {
    available: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    occupied: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    alert: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    cleaning: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  };
  return colors[status] || "bg-slate-100 text-slate-700";
}

/**
 * Retourne les couleurs pour le donut chart
 */
export function getRoomStatusChartColor(status: string): string {
  const colors: Record<string, string> = {
    available: "#10b981", // green-500
    occupied: "#3b82f6",  // blue-500
    alert: "#ef4444",     // red-500
    cleaning: "#f59e0b",  // amber-500
  };
  return colors[status] || "#64748b";
}

/**
 * Retourne le prix mensuel d'un plan en FCFA
 */
export function getPlanPrice(plan: string): number {
  return getNormalizedPlanPrice(plan);
}

/**
 * Retourne les limites d'un plan
 */
export function getPlanLimits(plan: string): {
  maxAccommodations: number | null;
  maxAdmins: number | null;
  maxReceptionnists: number | null;
  hasCleaningModule: boolean;
  hasAdvancedStats: boolean;
  hasMultiResidences: boolean;
} {
  const limits = getNormalizedPlanLimits(plan);
  // maxUsers = null signifie « illimité » (plan Entreprise) : on le préserve.
  return {
    maxAccommodations: limits.maxAccommodations,
    maxAdmins: limits.maxUsers,
    maxReceptionnists: limits.maxUsers,
    hasCleaningModule: limits.hasAdvancedAccounting || limits.hasExternalApi,
    hasAdvancedStats: limits.hasAdvancedAccounting,
    hasMultiResidences: limits.maxAccommodations === null,
  };
}

export function canAccessPlanFeature(plan: string, feature: string): boolean {
  return canAccessFeature(feature, plan);
}
