import { describe, expect, it } from "vitest";
import {
  BOOKING_LIST_SELECT,
  bookingListDateWindow,
  bookingListOverlapFilter,
} from "../src/lib/bookings-query";

describe("bookings-query", () => {
  it("n'utilise pas select *", () => {
    expect(BOOKING_LIST_SELECT).not.toMatch(/(^|[,\s])\*([,\s]|$)/);
    expect(BOOKING_LIST_SELECT).toContain("booking_code");
    expect(BOOKING_LIST_SELECT).toContain("client:clients(");
    expect(BOOKING_LIST_SELECT).toContain("room:rooms(");
  });

  it("ouvre une fenêtre de 6 mois passés / 3 mois futurs", () => {
    const { from, to } = bookingListDateWindow(new Date("2026-09-15T12:00:00Z"));
    expect(from).toBe("2026-03-15");
    expect(to).toBe("2026-12-15");
  });

  it("garde les checked_in hors fenêtre", () => {
    const filter = bookingListOverlapFilter("2026-03-15", "2026-12-15");
    expect(filter).toContain("status.eq.checked_in");
    expect(filter).toContain("check_out_date.gte.2026-03-15");
    expect(filter).toContain("check_in_date.lte.2026-12-15");
  });
});
