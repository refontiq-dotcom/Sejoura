import { describe, it, expect, vi, afterEach } from "vitest";
import { isBookingOverdue, getOverstayLabel, getOverstayColor } from "../src/lib/utils";

describe("overstay (dépassement de séjour)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("libelle et couleur du badge", () => {
    expect(getOverstayLabel()).toBe("Dépassement");
    expect(getOverstayColor()).toContain("bg-red-600");
  });

  it("détecte un séjour encore occupé après le départ prévu", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00"));
    expect(
      isBookingOverdue({
        status: "checked_in",
        check_out_date: "2026-08-15",
        check_out_time: "11:00",
      })
    ).toBe(true);
  });

  it("ignore les réservations confirmées ou non échues", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00"));
    expect(
      isBookingOverdue({
        status: "checked_in",
        check_out_date: "2026-08-17",
        check_out_time: "11:00",
      })
    ).toBe(false);
    expect(
      isBookingOverdue({
        status: "confirmed",
        check_out_date: "2026-08-15",
        check_out_time: "11:00",
      })
    ).toBe(false);
  });
});
