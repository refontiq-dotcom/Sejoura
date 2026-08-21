// ============================================================================
// SÉJOURA — DETECTEUR D'ANOMALIES DE PAIEMENT
// ============================================================================
//
// Détecte les paiements suspects ou inhabituels :
//   1. Paiement > N× le prix moyen de la chambre (ex: 3× trop élevé)
//   2. Montant inférieur au tarif de la chambre (sous-paiement suspect)
//   3. Multiples paiements pour la même réservation
//   4. Écart important entre negotiated_price et total_amount
//   5. Pattern de remboursements inhabituel
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type AnomalySeverity = "critical" | "warning" | "info";
export type AnomalyType =
  | "overpayment"
  | "underpayment"
  | "duplicate_payment"
  | "price_discrepancy"
  | "refund_pattern"
  | "method_mismatch";

export interface PaymentAnomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  /** Montant concerné (XOF) */
  amount: number;
  /** Référence attendue ou comparée */
  expectedAmount?: number;
  /** Ratio anomaly (ex: 3.2× le prix moyen) */
  ratio?: number;
  /** ID de la réservation concernée (null pour les anomalies globales) */
  bookingId: string | null;
  /** Code de réservation (SJ-XXXX-XXXX) */
  bookingCode?: string;
  /** ID du paiement */
  paymentId?: string;
  detectedAt: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string | null;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  operationType?: string;
  notes?: string | null;
}

export interface BookingRecord {
  id: string;
  bookingCode: string;
  basePrice: number;
  negotiatedPrice: number;
  totalAmount: number;
  nightsCount: number;
  status: string;
  roomId: string;
}

export interface RoomPriceContext {
  roomId: string;
  roomTypeName: string;
  basePrice: number;
  capacity: number;
  surfaceM2: number | null;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface AnomalyConfig {
  /** Multiplicateur max acceptable (défaut: 3.0 = 3× le prix moyen) */
  overpaymentThreshold: number;
  /** Taux min de paiement acceptable (défaut: 0.7 = 70% du total) */
  underpaymentThreshold: number;
  /** Écart max entre negotiated et total (défaut: 0.2 = 20%) */
  priceDiscrepancyThreshold: number;
  /** Nombre max de paiements par réservation avant alerte */
  maxPaymentsPerBooking: number;
  /** Fenêtre de détection des refunds (jours) */
  refundWindowDays: number;
  /** Seuil de refunds dans la fenêtre avant alerte */
  refundCountThreshold: number;
}

const DEFAULT_CONFIG: AnomalyConfig = {
  overpaymentThreshold: 3.0,
  underpaymentThreshold: 0.7,
  priceDiscrepancyThreshold: 0.2,
  maxPaymentsPerBooking: 3,
  refundWindowDays: 30,
  refundCountThreshold: 3,
};

// ─── Détection d'anomalies ─────────────────────────────────────────────────

/**
 * Analyse un ensemble de paiements et retourne les anomalies détectées.
 */
export function detectAnomalies(
  payments: PaymentRecord[],
  bookings: BookingRecord[],
  roomContext: RoomPriceContext[],
  config: AnomalyConfig = DEFAULT_CONFIG,
): PaymentAnomaly[] {
  const anomalies: PaymentAnomaly[] = [];
  const now = new Date().toISOString();

  // Index par booking
  const paymentsByBooking = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    if (!p.bookingId) continue;
    const list = paymentsByBooking.get(p.bookingId) || [];
    list.push(p);
    paymentsByBooking.set(p.bookingId, list);
  }

  // Index room context
  const roomContextMap = new Map<string, RoomPriceContext>();
  for (const rc of roomContext) {
    roomContextMap.set(rc.roomId, rc);
  }

  // Index booking
  const bookingMap = new Map<string, BookingRecord>();
  for (const b of bookings) {
    bookingMap.set(b.id, b);
  }

  for (const payment of payments) {
    if (!payment.bookingId) continue;
    const booking = bookingMap.get(payment.bookingId);
    if (!booking) continue;

    // ── 1. Surpaiement (> N× le prix par nuit de la chambre) ──
    const roomCtx = roomContextMap.get(booking.roomId);
    if (roomCtx && booking.nightsCount > 0) {
      const expectedPerNight = roomCtx.basePrice;
      const paymentPerNight = payment.amount / booking.nightsCount;
      const ratio = expectedPerNight > 0 ? paymentPerNight / expectedPerNight : 0;

      if (ratio > config.overpaymentThreshold && payment.amount > 0) {
        anomalies.push({
          id: `overpay-${payment.id}`,
          type: "overpayment",
          severity: "critical",
          title: "Paiement anormalement élevé",
          description:
            `Paiement de ${formatFCFA(payment.amount)} pour ${booking.nightsCount} nuit(s) ` +
            `(${formatFCFA(Math.round(paymentPerNight))}/nuit) — le tarif de base est ` +
            `${formatFCFA(expectedPerNight)}/nuit (${roomCtx.roomTypeName}). ` +
            `Ratio : ${ratio.toFixed(1)}×.`,
          amount: payment.amount,
          expectedAmount: expectedPerNight * booking.nightsCount,
          ratio: Math.round(ratio * 10) / 10,
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          paymentId: payment.id,
          detectedAt: now,
        });
      }
    }

    // ── 2. Sous-paiement (< 70% du total) ──
    if (booking.totalAmount > 0) {
      const paymentRatio = payment.amount / booking.totalAmount;
      if (
        paymentRatio > 0 &&
        paymentRatio < config.underpaymentThreshold &&
        payment.amount > 0 &&
        booking.status !== "cancelled"
      ) {
        anomalies.push({
          id: `underpay-${payment.id}`,
          type: "underpayment",
          severity: "warning",
          title: "Sous-paiement détecté",
          description:
            `Paiement de ${formatFCFA(payment.amount)} pour une réservation de ` +
            `${formatFCFA(booking.totalAmount)} (${Math.round(paymentRatio * 100)}% du total). ` +
            `Solde restant : ${formatFCFA(booking.totalAmount - payment.amount)}.`,
          amount: payment.amount,
          expectedAmount: booking.totalAmount,
          ratio: Math.round(paymentRatio * 100) / 100,
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          paymentId: payment.id,
          detectedAt: now,
        });
      }
    }

    // ── 3. Écart negotiated vs total ──
    if (booking.negotiatedPrice > 0 && booking.basePrice > 0) {
      const expectedTotal = booking.negotiatedPrice * booking.nightsCount;
      if (expectedTotal > 0) {
        const discrepancy = Math.abs(booking.totalAmount - expectedTotal) / expectedTotal;
        if (discrepancy > config.priceDiscrepancyThreshold) {
          anomalies.push({
            id: `discrepancy-${booking.id}`,
            type: "price_discrepancy",
            severity: "warning",
            title: "Écart de prix inhabituel",
            description:
              `Le total (${formatFCFA(booking.totalAmount)}) ne correspond pas au ` +
              `prix négocié × nuits (${formatFCFA(expectedTotal)}). ` +
              `Écart : ${Math.round(discrepancy * 100)}%.`,
            amount: booking.totalAmount,
            expectedAmount: expectedTotal,
            ratio: Math.round(discrepancy * 100) / 100,
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            detectedAt: now,
          });
        }
      }
    }
  }

  // ── 4. Paiements multiples ──
  for (const [bookingId, bookingPayments] of paymentsByBooking) {
    if (bookingPayments.length > config.maxPaymentsPerBooking) {
      const booking = bookingMap.get(bookingId);
      const totalPaid = bookingPayments.reduce((s, p) => s + p.amount, 0);
      anomalies.push({
        id: `multi-${bookingId}`,
        type: "duplicate_payment",
        severity: "warning",
        title: `${bookingPayments.length} paiements pour une réservation`,
        description:
          `Cette réservation a reçu ${bookingPayments.length} paiements pour un total de ` +
          `${formatFCFA(totalPaid)}. Vérifiez qu'il n'y a pas de doublon.`,
        amount: totalPaid,
        bookingId,
        bookingCode: booking?.bookingCode,
        detectedAt: now,
      });
    }
  }

  // ── 5. Pattern de remboursements ──
  const refunds = payments.filter(
    (p) =>
      p.operationType === "refund" &&
      new Date(p.paymentDate) >=
        new Date(Date.now() - config.refundWindowDays * 86_400_000),
  );

  if (refunds.length >= config.refundCountThreshold) {
    const totalRefunds = refunds.reduce((s, p) => s + p.amount, 0);      anomalies.push({
      id: "refund-pattern",
      type: "refund_pattern",
      severity: "critical",
      title: `${refunds.length} remboursements récents`,
      description:
        `${refunds.length} remboursements (${formatFCFA(totalRefunds)}) sur les ` +
        `${config.refundWindowDays} derniers jours. Pattern inhabituel détecté.`,
      amount: totalRefunds,
      bookingId: null,
      detectedAt: now,
    });
  }

  // Trier par sévérité
  const severityOrder: Record<AnomalySeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return anomalies;
}

// ─── Résumé ─────────────────────────────────────────────────────────────────

export interface AnomalySummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  anomalies: PaymentAnomaly[];
}

export function summarizeAnomalies(anomalies: PaymentAnomaly[]): AnomalySummary {
  return {
    total: anomalies.length,
    critical: anomalies.filter((a) => a.severity === "critical").length,
    warning: anomalies.filter((a) => a.severity === "warning").length,
    info: anomalies.filter((a) => a.severity === "info").length,
    anomalies,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + " FCFA";
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export const ANOMALY_TYPE_LABELS: Record<AnomalyType, { fr: string; en: string }> = {
  overpayment: { fr: "Surpaiement", en: "Overpayment" },
  underpayment: { fr: "Sous-paiement", en: "Underpayment" },
  duplicate_payment: { fr: "Paiements multiples", en: "Duplicate payments" },
  price_discrepancy: { fr: "Écart de prix", en: "Price discrepancy" },
  refund_pattern: { fr: "Pattern de remboursement", en: "Refund pattern" },
  method_mismatch: { fr: "Incohérence de méthode", en: "Method mismatch" },
};

export const SEVERITY_COLORS: Record<AnomalySeverity, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  warning: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};
