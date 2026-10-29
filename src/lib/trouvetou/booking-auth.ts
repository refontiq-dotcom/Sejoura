import { timingSafeEqual } from "node:crypto";

export function isTrouvetouBookingRequest(headers: Headers): boolean {
  const expected = process.env.TROUVETOU_BOOKING_SHARED_SECRET;
  const provided = headers.get("x-trouvetou-booking-secret") ?? "";
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}
