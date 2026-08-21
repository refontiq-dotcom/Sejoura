import { describe, it, expect } from "vitest";
import {
  detectAnomalies,
  summarizeAnomalies,
} from "../src/lib/anomaly-detection";
import type {
  PaymentRecord,
  BookingRecord,
  RoomPriceContext,
} from "../src/lib/anomaly-detection";

describe("anomaly-detection", () => {
  const baseRoomContext: RoomPriceContext[] = [
    {
      roomId: "room-1",
      roomTypeName: "Studio",
      basePrice: 20000,
      capacity: 2,
      surfaceM2: 25,
    },
  ];

  const baseBookings: BookingRecord[] = [
    {
      id: "b1",
      bookingCode: "SJ-2026-0001",
      basePrice: 20000,
      negotiatedPrice: 20000,
      totalAmount: 60000,
      nightsCount: 3,
      status: "checked_in",
      roomId: "room-1",
    },
  ];

  describe("surpaiement (> 3× le prix moyen)", () => {
    it("détecte un paiement anormalement élevé", () => {
      const payments: PaymentRecord[] = [
        {
          id: "p1",
          bookingId: "b1",
          amount: 200000, // 200 000 pour 3 nuits à 20 000 = 3.3×
          paymentMethod: "wave",
          paymentDate: "2026-08-10",
        },
      ];

      const anomalies = detectAnomalies(payments, baseBookings, baseRoomContext);
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].type).toBe("overpayment");
      expect(anomalies[0].severity).toBe("critical");
      expect(anomalies[0].ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("n'alarme pas pour un paiement normal", () => {
      const payments: PaymentRecord[] = [
        {
          id: "p1",
          bookingId: "b1",
          amount: 60000, // 60 000 pour 3 nuits à 20 000 = 1.0×
          paymentMethod: "wave",
          paymentDate: "2026-08-10",
        },
      ];

      const anomalies = detectAnomalies(payments, baseBookings, baseRoomContext);
      const overpayments = anomalies.filter((a) => a.type === "overpayment");
      expect(overpayments.length).toBe(0);
    });
  });

  describe("sous-paiement (< 70% du total)", () => {
    it("détecte un sous-paiement", () => {
      const payments: PaymentRecord[] = [
        {
          id: "p1",
          bookingId: "b1",
          amount: 30000, // 50% de 60 000
          paymentMethod: "cash",
          paymentDate: "2026-08-10",
        },
      ];

      const anomalies = detectAnomalies(payments, baseBookings, baseRoomContext);
      const underpayments = anomalies.filter((a) => a.type === "underpayment");
      expect(underpayments.length).toBe(1);
      expect(underpayments[0].severity).toBe("warning");
    });

    it("n'alarme pas pour un paiement complet", () => {
      const payments: PaymentRecord[] = [
        {
          id: "p1",
          bookingId: "b1",
          amount: 60000,
          paymentMethod: "wave",
          paymentDate: "2026-08-10",
        },
      ];

      const anomalies = detectAnomalies(payments, baseBookings, baseRoomContext);
      const underpayments = anomalies.filter((a) => a.type === "underpayment");
      expect(underpayments.length).toBe(0);
    });
  });

  describe("paiements multiples", () => {
    it("détecte plus de 3 paiements pour une même réservation", () => {
      const payments: PaymentRecord[] = [
        { id: "p1", bookingId: "b1", amount: 10000, paymentMethod: "cash", paymentDate: "2026-08-08" },
        { id: "p2", bookingId: "b1", amount: 10000, paymentMethod: "cash", paymentDate: "2026-08-09" },
        { id: "p3", bookingId: "b1", amount: 10000, paymentMethod: "wave", paymentDate: "2026-08-10" },
        { id: "p4", bookingId: "b1", amount: 10000, paymentMethod: "wave", paymentDate: "2026-08-11" },
      ];

      const anomalies = detectAnomalies(payments, baseBookings, baseRoomContext);
      const multiples = anomalies.filter((a) => a.type === "duplicate_payment");
      expect(multiples.length).toBe(1);
      expect(multiples[0].severity).toBe("warning");
    });
  });

  describe("écart de prix", () => {
    it("détecte un écart important entre negotiated et total", () => {
      const bookings: BookingRecord[] = [
        {
          ...baseBookings[0],
          negotiatedPrice: 20000,
          totalAmount: 100000, // 100 000 au lieu de 60 000 (20 000 × 3)
        },
      ];

      const payments: PaymentRecord[] = [
        { id: "p1", bookingId: "b1", amount: 100000, paymentMethod: "wave", paymentDate: "2026-08-10" },
      ];

      const anomalies = detectAnomalies(payments, bookings, baseRoomContext);
      const discrepancies = anomalies.filter((a) => a.type === "price_discrepancy");
      expect(discrepancies.length).toBe(1);
    });
  });

  describe("summarizeAnomalies", () => {
    it("compte correctement les sévérités", () => {
      const summary = summarizeAnomalies([
        { id: "1", type: "overpayment", severity: "critical", title: "a", description: "b", amount: 100, bookingId: "x", detectedAt: "" },
        { id: "2", type: "underpayment", severity: "warning", title: "c", description: "d", amount: 200, bookingId: "x", detectedAt: "" },
        { id: "3", type: "overpayment", severity: "critical", title: "e", description: "f", amount: 300, bookingId: "x", detectedAt: "" },
      ]);

      expect(summary.total).toBe(3);
      expect(summary.critical).toBe(2);
      expect(summary.warning).toBe(1);
      expect(summary.info).toBe(0);
    });
  });
});
