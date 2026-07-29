// ============================================================================
// SÉJOURA — Utilitaires globaux
// ============================================================================

/**
 * Formate un montant en FCFA (XOF)
 * Ex: 15000 -> "15 000 FCFA"
 */
export function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(amount) + " FCFA";
}

/**
 * Formate un montant en FCFA sans le suffixe "FCFA"
 * Ex: 15000 -> "15 000"
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(amount);
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
    admin_residence: "Admin Résidence",
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
  const labels: Record<string, string> = {
    standard: "Standard",
    pro: "Pro",
    enterprise: "Enterprise",
  };
  return labels[plan] || plan;
}

/**
 * Retourne le libellé d'une méthode de paiement
 */
export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Espèces",
    wave: "Wave",
    pi_spi: "PI-SPI",
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
  const prices: Record<string, number> = {
    standard: 15000,
    pro: 35000,
    enterprise: 55000,
  };
  return prices[plan] || 0;
}

/**
 * Retourne les limites d'un plan
 */
export function getPlanLimits(plan: string): {
  maxAccommodations: number | null;
  maxAdmins: number;
  maxReceptionnists: number;
  hasCleaningModule: boolean;
  hasAdvancedStats: boolean;
  hasMultiResidences: boolean;
} {
  const limits: Record<string, {
    maxAccommodations: number | null;
    maxAdmins: number;
    maxReceptionnists: number;
    hasCleaningModule: boolean;
    hasAdvancedStats: boolean;
    hasMultiResidences: boolean;
  }> = {
    standard: {
      maxAccommodations: 5,
      maxAdmins: 1,
      maxReceptionnists: 1,
      hasCleaningModule: false,
      hasAdvancedStats: false,
      hasMultiResidences: false,
    },
    pro: {
      maxAccommodations: null, // Illimité
      maxAdmins: 5,
      maxReceptionnists: 10,
      hasCleaningModule: true,
      hasAdvancedStats: true,
      hasMultiResidences: false,
    },
    enterprise: {
      maxAccommodations: null, // Illimité
      maxAdmins: 999,
      maxReceptionnists: 999,
      hasCleaningModule: true,
      hasAdvancedStats: true,
      hasMultiResidences: true,
    },
  };
  return limits[plan] || limits.standard;
}