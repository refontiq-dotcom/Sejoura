// ============================================================================
// SÉJOURA — MOTEUR DE SUGGESTIONS PROACTIVES
// ============================================================================
//
// Génère des recommandations actionnables pour le gérant, basées sur
// l'état actuel de son établissement et les tendances analytics.
//
// Types de suggestions :
//   - "Chambre 104 libre demain → publier sur Trouvetou ?"
//   - "Taux d'occupation en baisse depuis 2 semaines → reviser les prix"
//   - "3 tâches de ménage en retard → réassigner ?"
//   - "Client arrive ce soir, chambre pas encore nettoyée → prioriser"
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type SuggestionPriority = "urgent" | "high" | "medium" | "low";
export type SuggestionCategory =
  | "availability"
  | "trouvetou"
  | "cleaning"
  | "occupancy"
  | "revenue"
  | "maintenance";

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  priority: SuggestionPriority;
  title: string;
  description: string;
  /** Action suggérée (texte du bouton) */
  actionLabel: string;
  /** Route vers laquelle naviguer au clic */
  actionRoute: string;
  /** Données contextuelles pour l'affichage */
  meta?: Record<string, string | number>;
  /** Timestamp de génération */
  generatedAt: string;
}

// ─── Données d'entrée ──────────────────────────────────────────────────────

export interface RoomInfo {
  id: string;
  roomNumber: string;
  roomTypeName: string;
  accommodationId: string;
  accommodationName: string;
  status: "available" | "occupied" | "cleaning" | "alert";
  isListedOnTrouvetou: boolean;
  featuredImages: string[];
  capacity: number;
  surfaceM2: number | null;
  basePrice: number;
}

export interface BookingInfo {
  id: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  clientName: string;
}

export interface CleaningTaskInfo {
  id: string;
  roomId: string;
  accommodationId: string;
  status: string;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  checkoutTime: string | null;
}

export interface OccupancyContext {
  todayRate: number;
  predictedTomorrow: number;
  trend: "rising" | "falling" | "stable";
  avgOccupancy30d: number;
}

export interface SuggestionInput {
  rooms: RoomInfo[];
  bookings: BookingInfo[];
  cleaningTasks: CleaningTaskInfo[];
  occupancy: OccupancyContext;
  tenantId: string;
}

// ─── Génération de suggestions ──────────────────────────────────────────────

/**
 * Génère toutes les suggestions proactives à partir des données actuelles.
 */
export function generateSuggestions(input: SuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

  // ── 1. Chambres disponibles demain non publiées sur Trouvetou ──
  suggestions.push(...suggestTrouvetouPublish(input, tomorrowStr));

  // ── 2. Chambres disponibles aujourd'hui ──
  suggestions.push(...suggestAvailableRooms(input));

  // ── 3. Tâches de ménage en retard ──
  suggestions.push(...suggestLateCleaning(input, now));

  // ── 4. Chambres à nettoyer avant une arrivée imminente ──
  suggestions.push(...suggestPreArrivalCleaning(input, bookingsToday(input, todayStr)));

  // ── 5. Tendance occupation en baisse ──
  suggestions.push(...suggestOccupancyDecline(input.occupancy));

  // ── 6. Faible occupation prédite ──
  suggestions.push(...suggestLowPredictedOccupancy(input.occupancy));

  // Trier par priorité
  const priorityOrder: Record<SuggestionPriority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

// ─── Helpers par catégorie ──────────────────────────────────────────────────

function suggestTrouvetouPublish(
  input: SuggestionInput,
  tomorrowStr: string,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Chambres disponibles demain
  const bookedRoomIds = new Set(
    input.bookings
      .filter(
        (b) =>
          b.checkInDate <= tomorrowStr &&
          b.checkOutDate > tomorrowStr &&
          b.status !== "cancelled",
      )
      .map((b) => b.roomId),
  );

  const freeTomorrow = input.rooms.filter(
    (r) =>
      !bookedRoomIds.has(r.id) &&
      r.status === "available" &&
      r.isListedOnTrouvetou &&
      r.featuredImages.length > 0,
  );

  if (freeTomorrow.length > 0) {
    // Regrouper par établissement
    const byAccommodation = new Map<string, RoomInfo[]>();
    for (const room of freeTomorrow) {
      const list = byAccommodation.get(room.accommodationId) || [];
      list.push(room);
      byAccommodation.set(room.accommodationId, list);
    }

    for (const [accommodationId, rooms] of byAccommodation) {
      const roomNames = rooms.map((r) => r.roomNumber).join(", ");
      suggestions.push({
        id: `trouvetou-${accommodationId}-${tomorrowStr}`,
        category: "trouvetou",
        priority: "medium",
        title: `${rooms.length} chambre(s) libre(s) demain`,
        description:
          rooms.length === 1
            ? `Chambre ${roomNames} est libre demain. Publiez-la sur Trouvetou pour maximiser vos chances.`
            : `Chambres ${roomNames} libres demain. Vérifiez leur visibilité sur Trouvetou.`,
        actionLabel: "Voir Trouvetou",
        actionRoute: "/dashboard/trouvetou",
        meta: {
          accommodationId,
          roomCount: rooms.length,
          date: tomorrowStr,
        },
        generatedAt: new Date().toISOString(),
      });
    }
  }

  // Chambres disponibles mais pas sur Trouvetou (manque une opportunité)
  const notListed = input.rooms.filter(
    (r) =>
      r.status === "available" &&
      !r.isListedOnTrouvetou &&
      r.featuredImages.length > 0,
  );

  if (notListed.length > 0) {
    suggestions.push({
      id: "trouvetou-not-listed",
      category: "trouvetou",
      priority: "low",
      title: `${notListed.length} chambre(s) non publiée(s) sur Trouvetou`,
      description:
        "Ces chambres ont des photos mais ne sont pas visibles sur la vitrine Trouvetou. Activez leur publication pour recevoir plus de réservations.",
      actionLabel: "Configurer Trouvetou",
      actionRoute: "/dashboard/trouvetou",
      meta: { roomCount: notListed.length },
      generatedAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

function suggestAvailableRooms(input: SuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const available = input.rooms.filter((r) => r.status === "available");

  if (available.length > 0 && available.length <= 2) {
    // Peu de chambres disponibles = suggestion de suivi
    suggestions.push({
      id: "availability-low",
      category: "availability",
      priority: "medium",
      title: `${available.length} chambre(s) disponible(s) aujourd'hui`,
      description:
        available.length === 1
          ? `Il ne reste qu'une chambre libre (${available[0].roomNumber}). Vérifiez les prochaines arrivées.`
          : `Seulement ${available.length} chambres libres. Bonne journée d'occupation !`,
      actionLabel: "Voir les chambres",
      actionRoute: "/dashboard/rooms",
      meta: { roomCount: available.length },
      generatedAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

function suggestLateCleaning(
  input: SuggestionInput,
  now: Date,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const lateTasks = input.cleaningTasks.filter((task) => {
    if (task.status === "done" || task.status === "expired") return false;
    if (!task.claimedAt) return false;
    // En retard si > 90 minutes depuis l'assignation
    const claimed = new Date(task.claimedAt);
    const elapsedMs = now.getTime() - claimed.getTime();
    return elapsedMs > 90 * 60 * 1000;
  });

  if (lateTasks.length > 0) {
    suggestions.push({
      id: "cleaning-late",
      category: "cleaning",
      priority: lateTasks.length >= 3 ? "urgent" : "high",
      title: `${lateTasks.length} tâche(s) de ménage en retard`,
      description:
        "Certaines tâches de nettoyage dépassent le délai habituel. Vérifiez l'avancement ou réassignez-les.",
      actionLabel: "Voir le ménage",
      actionRoute: "/dashboard/cleaning",
      meta: { taskCount: lateTasks.length },
      generatedAt: new Date().toISOString(),
    });
  }

  // Tâches non réclamées depuis > 30 min
  const unclaimedTasks = input.cleaningTasks.filter((task) => {
    if (task.status !== "pending") return false;
    const created = new Date(task.claimedAt || new Date().toISOString());
    return Date.now() - created.getTime() > 30 * 60 * 1000;
  });

  if (unclaimedTasks.length > 0) {
    suggestions.push({
      id: "cleaning-unclaimed",
      category: "cleaning",
      priority: "medium",
      title: `${unclaimedTasks.length} tâche(s) en attente de réclamation`,
      description:
        "Des tâches de nettoyage attendent d'être prises en charge par une ménagère.",
      actionLabel: "Assigner",
      actionRoute: "/dashboard/cleaning",
      meta: { taskCount: unclaimedTasks.length },
      generatedAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

function suggestPreArrivalCleaning(
  input: SuggestionInput,
  todayBookings: BookingInfo[],
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const booking of todayBookings) {
    const room = input.rooms.find((r) => r.id === booking.roomId);
    const task = input.cleaningTasks.find(
      (t) => t.roomId === booking.roomId && t.status !== "done",
    );

    if (room && task) {
      suggestions.push({
        id: `pre-arrival-${booking.id}`,
        category: "cleaning",
        priority: "urgent",
        title: `Arrivée prévue — chambre ${room.roomNumber} pas encore nettoyée`,
        description: `${booking.clientName} arrive aujourd'hui. La chambre ${room.roomNumber} (${room.roomTypeName}) nécessite un nettoyage prioritaire.`,
        actionLabel: "Prioriser le ménage",
        actionRoute: "/dashboard/cleaning",
        meta: {
          roomNumber: room.roomNumber,
          guestName: booking.clientName,
          bookingId: booking.id,
        },
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return suggestions;
}

function suggestOccupancyDecline(occupancy: OccupancyContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (occupancy.trend === "falling" && occupancy.avgOccupancy30d < 0.6) {
    suggestions.push({
      id: "occupancy-decline",
      category: "occupancy",
      priority: "high",
      title: "Taux d'occupation en baisse",
      description:
        `Votre taux d'occupation moyen de 30 jours est ${Math.round(occupancy.avgOccupancy30d * 100)}% ` +
        `et la tendance est à la baisse. Considérez une promotion ou un boost Trouvetou.`,
      actionLabel: "Boost Trouvetou",
      actionRoute: "/dashboard/trouvetou",
      meta: {
        avgOccupancy: Math.round(occupancy.avgOccupancy30d * 100),
        trend: occupancy.trend,
      },
      generatedAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

function suggestLowPredictedOccupancy(occupancy: OccupancyContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (occupancy.predictedTomorrow < 0.3) {
    suggestions.push(
      {
        id: "low-predicted",
        category: "occupancy",
        priority: "medium",
        title: "Faible occupation prévue demain",
        description:
          `Le taux d'occupation prédit pour demain est ${Math.round(occupancy.predictedTomorrow * 100)}%. ` +
          `Envisagez une promotion flash ou publiez les chambres disponibles sur Trouvetou.`,
        actionLabel: "Voir Trouvetou",
        actionRoute: "/dashboard/trouvetou",
        meta: { predicted: Math.round(occupancy.predictedTomorrow * 100) },
        generatedAt: new Date().toISOString(),
      },
    );
  }

  return suggestions;
}

// ─── Utilitaire ─────────────────────────────────────────────────────────────

function bookingsToday(
  input: SuggestionInput,
  todayStr: string,
): BookingInfo[] {
  return input.bookings.filter(
    (b) => b.checkInDate === todayStr && b.status === "confirmed",
  );
}

// ─── Labels d'affichage ─────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<SuggestionCategory, { fr: string; en: string }> = {
  availability: { fr: "Disponibilité", en: "Availability" },
  trouvetou: { fr: "Trouvetou", en: "Trouvetou" },
  cleaning: { fr: "Ménage", en: "Cleaning" },
  occupancy: { fr: "Occupation", en: "Occupancy" },
  revenue: { fr: "Revenus", en: "Revenue" },
  maintenance: { fr: "Maintenance", en: "Maintenance" },
};

export const PRIORITY_LABELS: Record<SuggestionPriority, { fr: string; en: string; color: string }> = {
  urgent: { fr: "Urgent", en: "Urgent", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  high: { fr: "Important", en: "High", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  medium: { fr: "Moyen", en: "Medium", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  low: { fr: "Info", en: "Low", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};
