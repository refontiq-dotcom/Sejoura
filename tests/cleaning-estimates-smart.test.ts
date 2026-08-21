import { describe, it, expect } from "vitest";
import {
  estimateSmartTaskMinutes,
  sumSmartEstimatedMinutes,
  getEstimationBreakdown,
} from "../src/lib/cleaning-estimates";
import type { RoomCleaningContext } from "../src/lib/cleaning-estimates";
import type { CleaningTask } from "../src/types/database";

function baseTask(overrides: Partial<CleaningTask> = {}): CleaningTask {
  return {
    id: "task-1",
    tenant_id: "t1",
    accommodation_id: "a1",
    room_id: "r1",
    booking_id: "b1",
    status: "pending",
    claimed_by: null,
    claimed_at: null,
    completed_by: null,
    completed_at: null,
    checkout_time: null,
    alert_time: null,
    force_release_time: null,
    is_alert_sent: false,
    is_force_released: false,
    priority: 0,
    notes: null,
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  } as CleaningTask;
}

describe("cleaning-estimates — estimateSmartTaskMinutes", () => {
  it("retombe sur l'estimation de base sans contexte", () => {
    const task = baseTask({ checkout_time: "11:00" });
    expect(estimateSmartTaskMinutes(task)).toBe(45);
  });

  it("estime une chambre standard de 25m² en check-out", () => {
    const task = baseTask({ checkout_time: "11:00" });
    const ctx: RoomCleaningContext = {
      surfaceM2: 25,
      capacity: 2,
      roomTypeName: "Standard",
    };
    const minutes = estimateSmartTaskMinutes(task, ctx);
    // 25m² × 1.5 = 37.5 → arrondi 38, × 1.5 (checkout) = 57
    expect(minutes).toBeGreaterThanOrEqual(50);
    expect(minutes).toBeLessThanOrEqual(65);
  });

  it("estime un studio plus rapidement", () => {
    const task = baseTask({ checkout_time: "11:00" });
    const ctxStudio: RoomCleaningContext = {
      surfaceM2: 20,
      capacity: 1,
      roomTypeName: "Studio",
    };
    const ctxStandard: RoomCleaningContext = {
      surfaceM2: 20,
      capacity: 1,
      roomTypeName: "Standard",
    };

    const studioTime = estimateSmartTaskMinutes(task, ctxStudio);
    const standardTime = estimateSmartTaskMinutes(task, ctxStandard);
    expect(studioTime).toBeLessThan(standardTime);
  });

  it("estime une suite plus longtemps", () => {
    const task = baseTask({ checkout_time: "11:00" });
    const ctxSuite: RoomCleaningContext = {
      surfaceM2: 40,
      capacity: 4,
      roomTypeName: "Suite Prestige",
    };
    const minutes = estimateSmartTaskMinutes(task, ctxSuite);
    // Suite = multiplicateur 1.4
    expect(minutes).toBeGreaterThan(60);
  });

  it("ajoute du temps si le nettoyage précédent est en retard", () => {
    const task = baseTask();
    const ctxNormal: RoomCleaningContext = {
      surfaceM2: 25,
      capacity: 2,
      roomTypeName: "Standard",
      lastCleaningStatus: null,
    };
    const ctxOverdue: RoomCleaningContext = {
      surfaceM2: 25,
      capacity: 2,
      roomTypeName: "Standard",
      lastCleaningStatus: "overdue",
    };

    const normalTime = estimateSmartTaskMinutes(task, ctxNormal);
    const overdueTime = estimateSmartTaskMinutes(task, ctxOverdue);
    expect(overdueTime).toBeGreaterThan(normalTime);
    expect(overdueTime - normalTime).toBe(15); // OVERDUE_EXTRA_MINUTES
  });

  it("estime un ménage en cours plus rapidement qu'un check-out", () => {
    const taskMidstay = baseTask({ checkout_time: null });
    const taskCheckout = baseTask({ checkout_time: "11:00" });
    const ctx: RoomCleaningContext = {
      surfaceM2: 30,
      capacity: 3,
      roomTypeName: "Duplex",
    };

    const midstayTime = estimateSmartTaskMinutes(taskMidstay, ctx);
    const checkoutTime = estimateSmartTaskMinutes(taskCheckout, ctx);
    expect(midstayTime).toBeLessThan(checkoutTime);
  });

  it("borne les estimations entre 15 et 120 minutes", () => {
    // Très grande villa
    const task = baseTask({ checkout_time: "11:00" });
    const ctx: RoomCleaningContext = {
      surfaceM2: 200,
      capacity: 10,
      roomTypeName: "Villa Palais",
    };
    const minutes = estimateSmartTaskMinutes(task, ctx);
    expect(minutes).toBeLessThanOrEqual(120);

    // Très petite chambre
    const ctxSmall: RoomCleaningContext = {
      surfaceM2: 5,
      capacity: 1,
      roomTypeName: "Economy",
    };
    const smallMinutes = estimateSmartTaskMinutes(task, ctxSmall);
    expect(smallMinutes).toBeGreaterThanOrEqual(15);
  });
});

describe("cleaning-estimates — getEstimationBreakdown", () => {
  it("retourne les facteurs pertinents", () => {
    const task = baseTask({ checkout_time: "11:00" });
    const ctx: RoomCleaningContext = {
      surfaceM2: 35,
      capacity: 4,
      roomTypeName: "Suite",
      lastCleaningStatus: "overdue",
    };

    const breakdown = getEstimationBreakdown(task, ctx);
    expect(breakdown.factors).toContain("Surface 35m²");
    expect(breakdown.factors).toContain("4 personnes");
    expect(breakdown.factors).toContain("Check-out complet");
    expect(breakdown.factors).toContain("Type Suite");
    expect(breakdown.factors).toContain("Nettoyage précédent en retard");
    expect(breakdown.smartMinutes).toBeGreaterThan(breakdown.baseMinutes);
  });
});

describe("cleaning-estimates — sumSmartEstimatedMinutes", () => {
  it("somme les estimations智能 avec contexte", () => {
    const tasks = [
      baseTask({ id: "t1", room_id: "r1", checkout_time: "11:00" }),
      baseTask({ id: "t2", room_id: "r2", checkout_time: null }),
    ];

    const contextMap = new Map<string, RoomCleaningContext>([
      ["r1", { surfaceM2: 30, capacity: 3, roomTypeName: "Standard" }],
      ["r2", { surfaceM2: 15, capacity: 1, roomTypeName: "Studio" }],
    ]);

    const total = sumSmartEstimatedMinutes(tasks, contextMap, (t) => t.room_id);
    expect(total).toBeGreaterThan(30);
    expect(typeof total).toBe("number");
  });
});
