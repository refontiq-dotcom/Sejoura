import { describe, it, expect } from "vitest";
import { generateSuggestions } from "../src/lib/suggestions-engine";
import type { SuggestionInput } from "../src/lib/suggestions-engine";

describe("suggestions-engine", () => {
  const baseInput: SuggestionInput = {
    rooms: [],
    bookings: [],
    cleaningTasks: [],
    occupancy: {
      todayRate: 0.5,
      predictedTomorrow: 0.5,
      trend: "stable",
      avgOccupancy30d: 0.5,
    },
    tenantId: "t1",
  };

  it("retourne un tableau (même vide)", () => {
    const suggestions = generateSuggestions(baseInput);
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it("suggère de publier sur Trouvetou les chambres libres demain", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const input: SuggestionInput = {
      ...baseInput,
      rooms: [
        {
          id: "r1",
          roomNumber: "101",
          roomTypeName: "Standard",
          accommodationId: "a1",
          accommodationName: "Hôtel Test",
          status: "available",
          isListedOnTrouvetou: true,
          featuredImages: ["https://example.com/photo.jpg"],
          capacity: 2,
          surfaceM2: 25,
          basePrice: 20000,
        },
      ],
      bookings: [],
    };

    const suggestions = generateSuggestions(input);
    const trouvetouSuggestions = suggestions.filter((s) => s.category === "trouvetou");
    expect(trouvetouSuggestions.length).toBeGreaterThan(0);
    expect(trouvetouSuggestions[0].actionRoute).toBe("/dashboard/trouvetou");
  });

  it("suggère de mettre sur Trouvetou les chambres non publiées avec photos", () => {
    const input: SuggestionInput = {
      ...baseInput,
      rooms: [
        {
          id: "r1",
          roomNumber: "201",
          roomTypeName: "Suite",
          accommodationId: "a1",
          accommodationName: "Hôtel Test",
          status: "available",
          isListedOnTrouvetou: false,
          featuredImages: ["https://example.com/photo.jpg"],
          capacity: 4,
          surfaceM2: 45,
          basePrice: 40000,
        },
      ],
    };

    const suggestions = generateSuggestions(input);
    const notListed = suggestions.find((s) => s.id === "trouvetou-not-listed");
    expect(notListed).toBeDefined();
    expect(notListed!.category).toBe("trouvetou");
  });

  it("alerte sur les tâches de ménage en retard", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const input: SuggestionInput = {
      ...baseInput,
      cleaningTasks: [
        {
          id: "ct1",
          roomId: "r1",
          accommodationId: "a1",
          status: "in_progress",
          claimedBy: "user1",
          claimedAt: twoHoursAgo,
          completedAt: null,
          checkoutTime: "11:00",
        },
      ],
    };

    const suggestions = generateSuggestions(input);
    const cleaningSuggestions = suggestions.filter((s) => s.category === "cleaning");
    expect(cleaningSuggestions.length).toBeGreaterThan(0);
    expect(cleaningSuggestions.some((s) => s.priority === "urgent" || s.priority === "high")).toBe(true);
  });

  it("suggère un boost quand l'occupation chute", () => {
    const input: SuggestionInput = {
      ...baseInput,
      occupancy: {
        todayRate: 0.3,
        predictedTomorrow: 0.25,
        trend: "falling",
        avgOccupancy30d: 0.45,
      },
    };

    const suggestions = generateSuggestions(input);
    const occupancySuggestions = suggestions.filter((s) => s.category === "occupancy");
    expect(occupancySuggestions.length).toBeGreaterThan(0);
  });

  it("les suggestions sont triées par priorité", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const input: SuggestionInput = {
      ...baseInput,
      occupancy: {
        todayRate: 0.2,
        predictedTomorrow: 0.15,
        trend: "falling",
        avgOccupancy30d: 0.3,
      },
      cleaningTasks: [
        {
          id: "ct1",
          roomId: "r1",
          accommodationId: "a1",
          status: "in_progress",
          claimedBy: "user1",
          claimedAt: twoHoursAgo,
          completedAt: null,
          checkoutTime: null,
        },
      ],
    };

    const suggestions = generateSuggestions(input);
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < suggestions.length; i++) {
      const prev = priorityOrder[suggestions[i - 1].priority];
      const curr = priorityOrder[suggestions[i].priority];
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
