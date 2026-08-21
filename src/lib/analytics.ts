// ============================================================================
// SÉJOURA — SERVICE D'ANALYTICS 30 JOURS / MOVING AVERAGES
// ============================================================================
//
// Fournit des métriques glissantes sur 30 jours pour :
//   - Taux d'occupation moyen et tendance
//   - Revenue moyen par nuit / par chambre
//   - Nombre moyen de réservations / jour
//   - Détection de tendance (hausse/baisse/stable)
//
// Conçu pour être appelé côté client (résultats pré-calculés depuis la DB)
// ou alimenté par une API route qui requête Supabase.
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DailySnapshot {
  date: string;          // YYYY-MM-DD
  occupancyRate: number; // 0-1
  revenue: number;       // XOF
  bookingCount: number;
  roomsAvailable: number;
  roomsOccupied: number;
}

export interface OccupancyStats {
  /** Moyenne glissante sur 30 jours */
  avgOccupancy30d: number;
  /** Moyenne glissante sur 7 jours */
  avgOccupancy7d: number;
  /** Tendance : "rising" | "falling" | "stable" */
  trend: "rising" | "falling" | "stable";
  /** Taux d'occupation aujourd'hui */
  todayRate: number;
  /** Prédiction pour demain (basée sur moving average + jour de la semaine) */
  predictedTomorrow: number;
  /** Confiance de la prédiction (0-1) */
  confidence: number;
}

export interface RevenueStats {
  /** Revenue total 30 jours */
  totalRevenue30d: number;
  /** Revenue moyen par jour (30j) */
  avgDailyRevenue: number;
  /** Revenue moyen par nuit réservée */
  avgRevenuePerNight: number;
  /** Revenue moyen par chambre disponible */
  avgRevenuePerRoom: number;
  /** Tendance revenue */
  trend: "rising" | "falling" | "stable";
}

export interface BookingTrend {
  /** Réservations moyennes par jour (30j) */
  avgBookingsPerDay: number;
  /** Tendance */
  trend: "rising" | "falling" | "stable";
  /** Durée moyenne de séjour (nuits) */
  avgStayDuration: number;
  /** Taux d'annulation moyen */
  cancellationRate: number;
}

export interface AnalyticsSummary {
  occupancy: OccupancyStats;
  revenue: RevenueStats;
  bookingTrend: BookingTrend;
  /** Données jour par jour pour graphiques */
  dailySnapshots: DailySnapshot[];
}

// ─── Moving Average (pure, testable) ────────────────────────────────────────

/**
 * Calcule une moyenne glissante sur une fenêtre donnée.
 * @param values  Tableau de valeurs (du plus ancien au plus récent)
 * @param window  Taille de la fenêtre (7, 14, 30…)
 * @returns       Moyenne des `window` dernières valeurs, ou moins si pas assez de données
 */
export function movingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

/**
 * Calcule la tendance d'une série de valeurs (7 derniers jours vs 7 jours d'avant).
 * "rising" si la moyenne récente est >5% supérieure, "falling" si >5% inférieure.
 */
export function detectTrend(
  values: number[],
  threshold: number = 0.05,
): "rising" | "falling" | "stable" {
  if (values.length < 14) return "stable";

  const recent7 = values.slice(-7);
  const previous7 = values.slice(-14, -7);

  const avgRecent = recent7.reduce((s, v) => s + v, 0) / recent7.length;
  const avgPrevious = previous7.reduce((s, v) => s + v, 0) / previous7.length;

  if (avgPrevious === 0) return avgRecent > 0 ? "rising" : "stable";

  const change = (avgRecent - avgPrevious) / avgPrevious;

  if (change > threshold) return "rising";
  if (change < -threshold) return "falling";
  return "stable";
}

/**
 * Prédit la valeur du jour suivant en utilisant une moyenne pondérée
 * (jours récents plus lourds) + ajustement jour de la semaine.
 *
 * @param dailyRates   Taux d'occupation jour par jour (30+ jours)
 * @param dayOfWeek    Jour de la semaine cible (0=dimanche, 6=samedi)
 */
export function predictNextDay(
  dailyRates: number[],
  dayOfWeek: number,
): { predicted: number; confidence: number } {
  if (dailyRates.length < 7) {
    return { predicted: movingAverage(dailyRates, 7), confidence: 0.3 };
  }

  // Moyenne pondérée exponentiellement (EMA) : poids croissant pour les jours récents
  const alpha = 0.3; // facteur de lissage
  let ema = dailyRates[0];
  for (let i = 1; i < dailyRates.length; i++) {
    ema = alpha * dailyRates[i] + (1 - alpha) * ema;
  }

  // Ajustement jour de la semaine : historique des mêmes jours
  const sameDayValues: number[] = [];
  for (let i = dayOfWeek; i < dailyRates.length; i += 7) {
    sameDayValues.push(dailyRates[i]);
  }
  const sameDayAvg = sameDayValues.length > 0
    ? sameDayValues.reduce((s, v) => s + v, 0) / sameDayValues.length
    : ema;

  // Combine EMA (70%) + même jour (30%)
  const predicted = ema * 0.7 + sameDayAvg * 0.3;

  // Confiance : plus on a de données, plus on est confiant
  const dataConfidence = Math.min(1, dailyRates.length / 30);
  const stabilityConfidence = 1 - Math.min(1, movingAverage(
    dailyRates.slice(-7).map((v, i, arr) =>
      i > 0 ? Math.abs(v - arr[i - 1]) : 0,
    ), 7,
  ));
  const confidence = dataConfidence * 0.6 + stabilityConfidence * 0.4;

  return {
    predicted: Math.max(0, Math.min(1, predicted)),
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ─── Assemblage du résumé analytics ─────────────────────────────────────────

/**
 * Construit un résumé analytics complet à partir de snapshots journaliers.
 *
 * @param snapshots  Données des 30 derniers jours (du plus ancien au plus récent)
 */
export function buildAnalyticsSummary(snapshots: DailySnapshot[]): AnalyticsSummary {
  const occupancyRates = snapshots.map((s) => s.occupancyRate);
  const revenues = snapshots.map((s) => s.revenue);
  const bookingCounts = snapshots.map((s) => s.bookingCount);
  const totalRooms = snapshots.map((s) => s.roomsAvailable);

  // ── Occupation ──
  const avgOccupancy30d = movingAverage(occupancyRates, 30);
  const avgOccupancy7d = movingAverage(occupancyRates, 7);
  const occTrend = detectTrend(occupancyRates);
  const todayRate = occupancyRates.length > 0 ? occupancyRates[occupancyRates.length - 1] : 0;
  const { predicted: predictedTomorrow, confidence } = predictNextDay(
    occupancyRates,
    (new Date().getDay() + 1) % 7,
  );

  // ── Revenue ──
  const totalRevenue30d = revenues.reduce((s, v) => s + v, 0);
  const avgDailyRevenue = snapshots.length > 0 ? totalRevenue30d / snapshots.length : 0;
  const totalNights = snapshots.reduce((s, snap) => {
    // Estimation nuits = roomsOccupied (chaque chambre occupée = 1 nuit)
    return s + snap.roomsOccupied;
  }, 0);
  const avgRevenuePerNight = totalNights > 0 ? totalRevenue30d / totalNights : 0;
  const avgRooms = totalRooms.length > 0
    ? totalRooms.reduce((s, v) => s + v, 0) / totalRooms.length
    : 1;
  const avgRevenuePerRoom = avgRooms > 0 ? avgDailyRevenue / avgRooms : 0;
  const revenueTrend = detectTrend(revenues);

  // ── Tendances réservation ──
  const avgBookingsPerDay = snapshots.length > 0
    ? bookingCounts.reduce((s, v) => s + v, 0) / snapshots.length
    : 0;
  const bookingTrend = detectTrend(bookingCounts);

  return {
    occupancy: {
      avgOccupancy30d: Math.round(avgOccupancy30d * 1000) / 1000,
      avgOccupancy7d: Math.round(avgOccupancy7d * 1000) / 1000,
      trend: occTrend,
      todayRate: Math.round(todayRate * 1000) / 1000,
      predictedTomorrow: Math.round(predictedTomorrow * 1000) / 1000,
      confidence,
    },
    revenue: {
      totalRevenue30d,
      avgDailyRevenue: Math.round(avgDailyRevenue),
      avgRevenuePerNight: Math.round(avgRevenuePerNight),
      avgRevenuePerRoom: Math.round(avgRevenuePerRoom),
      trend: revenueTrend,
    },
    bookingTrend: {
      avgBookingsPerDay: Math.round(avgBookingsPerDay * 10) / 10,
      trend: bookingTrend,
      avgStayDuration: 0,  // à enrichir avec les données de booking
      cancellationRate: 0, // à enrichir
    },
    dailySnapshots: snapshots,
  };
}

// ─── Helpers pour calculer les snapshots depuis les données brutes ──────────

/**
 * Calcule le taux d'occupation pour un jour donné.
 * @param occupiedRooms  Nombre de chambres occupées ce jour
 * @param totalRooms     Nombre total de chambres
 */
export function calculateOccupancyRate(occupiedRooms: number, totalRooms: number): number {
  if (totalRooms <= 0) return 0;
  return Math.min(1, occupiedRooms / totalRooms);
}

/**
 * Regroupe des réservations en snapshots journaliers.
 * Utile pour transformer les données Supabase en DailySnapshot[].
 */
export function aggregateDailyData(
  rooms: { id: string; accommodation_id: string }[],
  bookings: {
    room_id: string;
    check_in_date: string;
    check_out_date: string;
    status: string;
    total_amount: number;
  }[],
  payments: {
    booking_id: string;
    amount: number;
    payment_date: string;
  }[],
  startDate: string,
  days: number = 30,
): DailySnapshot[] {
  const snapshots: DailySnapshot[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    // Chambres occupées ce jour = réservations actives ce jour
    const activeBookings = bookings.filter(
      (b) =>
        b.check_in_date <= dateStr &&
        b.check_out_date > dateStr &&
        b.status !== "cancelled" &&
        b.status !== "no_show",
    );

    const occupiedRoomIds = new Set(activeBookings.map((b) => b.room_id));
    const roomsAvailable = rooms.length;
    const roomsOccupied = occupiedRoomIds.size;
    const occupancyRate = calculateOccupancyRate(roomsOccupied, roomsAvailable);

    // Revenue du jour (paiements reçus ce jour)
    const dayPayments = payments.filter((p) => p.payment_date === dateStr);
    const revenue = dayPayments.reduce((s, p) => s + p.amount, 0);

    // Nombre de check-ins ce jour
    const bookingCount = bookings.filter(
      (b) => b.check_in_date === dateStr && b.status !== "cancelled",
    ).length;

    snapshots.push({
      date: dateStr,
      occupancyRate,
      revenue,
      bookingCount,
      roomsAvailable,
      roomsOccupied,
    });
  }

  return snapshots;
}
