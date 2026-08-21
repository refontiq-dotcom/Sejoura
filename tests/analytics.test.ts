import { describe, it, expect } from "vitest";
import {
  movingAverage,
  detectTrend,
  predictNextDay,
  calculateOccupancyRate,
  buildAnalyticsSummary,
  aggregateDailyData,
} from "../src/lib/analytics";
import type { DailySnapshot } from "../src/lib/analytics";

describe("analytics — moving averages", () => {
  it("calcule une moyenne simple", () => {
    expect(movingAverage([10, 20, 30], 3)).toBe(20);
  });

  it("utilise les N dernières valeurs", () => {
    expect(movingAverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toBe(9);
  });

  it("gère un tableau plus petit que la fenêtre", () => {
    expect(movingAverage([10, 20], 7)).toBe(15);
  });

  it("retourne 0 pour un tableau vide", () => {
    expect(movingAverage([], 7)).toBe(0);
  });
});

describe("analytics — detectTrend", () => {
  it("détecte une tendance haussière", () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 20, 22, 24, 26, 28, 30, 32];
    expect(detectTrend(values)).toBe("rising");
  });

  it("détecte une tendance baissière", () => {
    const values = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4];
    expect(detectTrend(values)).toBe("falling");
  });

  it("retourne 'stable' pour des données insuffisantes", () => {
    expect(detectTrend([10, 11, 12])).toBe("stable");
  });

  it("retourne 'stable' pour des valeurs constantes", () => {
    const values = Array(20).fill(50);
    expect(detectTrend(values)).toBe("stable");
  });
});

describe("analytics — predictNextDay", () => {
  it("prédit une valeur proche de la tendance", () => {
    const dailyRates = Array(30).fill(0).map((_, i) => 0.5 + Math.sin(i * 0.2) * 0.1);
    const { predicted, confidence } = predictNextDay(dailyRates, 3);
    expect(predicted).toBeGreaterThanOrEqual(0);
    expect(predicted).toBeLessThanOrEqual(1);
    expect(confidence).toBeGreaterThan(0.3);
  });

  it("retourne une confiance faible avec peu de données", () => {
    const { confidence } = predictNextDay([0.5, 0.6, 0.7], 0);
    expect(confidence).toBeLessThanOrEqual(0.5);
  });
});

describe("analytics — calculateOccupancyRate", () => {
  it("calcule le taux correctement", () => {
    expect(calculateOccupancyRate(5, 10)).toBe(0.5);
  });

  it("retourne 0 si pas de chambres", () => {
    expect(calculateOccupancyRate(0, 0)).toBe(0);
  });

  it("clampe à 1.0 si plus de chambres occupées que disponibles", () => {
    expect(calculateOccupancyRate(15, 10)).toBe(1);
  });
});

describe("analytics — buildAnalyticsSummary", () => {
  it("construit un résumé à partir de snapshots", () => {
    const snapshots: DailySnapshot[] = Array(30)
      .fill(null)
      .map((_, i) => ({
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        occupancyRate: 0.5 + Math.sin(i * 0.3) * 0.2,
        revenue: 150000 + Math.round(Math.sin(i * 0.5) * 30000),
        bookingCount: 3 + (i % 3),
        roomsAvailable: 10,
        roomsOccupied: 5 + (i % 5),
      }));

    const summary = buildAnalyticsSummary(snapshots);

    expect(summary.occupancy.avgOccupancy30d).toBeGreaterThan(0);
    expect(summary.occupancy.avgOccupancy30d).toBeLessThanOrEqual(1);
    expect(summary.revenue.totalRevenue30d).toBeGreaterThan(0);
    expect(summary.bookingTrend.avgBookingsPerDay).toBeGreaterThan(0);
    expect(summary.dailySnapshots.length).toBe(30);
  });

  it("gère un tableau vide", () => {
    const summary = buildAnalyticsSummary([]);
    expect(summary.occupancy.avgOccupancy30d).toBe(0);
    expect(summary.revenue.totalRevenue30d).toBe(0);
    expect(summary.dailySnapshots.length).toBe(0);
  });
});

describe("analytics — aggregateDailyData", () => {
  it("agrège correctement les réservations par jour", () => {
    const rooms = [
      { id: "r1", accommodation_id: "a1" },
      { id: "r2", accommodation_id: "a1" },
    ];

    const bookings = [
      {
        room_id: "r1",
        check_in_date: "2026-08-10",
        check_out_date: "2026-08-13",
        status: "checked_in",
        total_amount: 60000,
      },
    ];

    const payments = [
      {
        booking_id: "b1",
        amount: 60000,
        payment_date: "2026-08-10",
      },
    ];

    const snapshots = aggregateDailyData(rooms, bookings, payments, "2026-08-10", 5);

    expect(snapshots.length).toBe(5);
    // Le 10 août : r1 occupée → 50%
    expect(snapshots[0].occupancyRate).toBe(0.5);
    expect(snapshots[0].revenue).toBe(60000);
    expect(snapshots[0].roomsOccupied).toBe(1);

    // Le 13 août : r1 libérée → 0%
    expect(snapshots[3].occupancyRate).toBe(0);
    expect(snapshots[3].roomsOccupied).toBe(0);
  });
});
