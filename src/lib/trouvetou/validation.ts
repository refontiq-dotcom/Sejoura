/** Validate a real calendar date in the YYYY-MM-DD format. */
export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Parse and bound the number of guests accepted by the external booking API. */
export function parseGuestCount(value: unknown): number | null {
  const count = value === undefined || value === null || value === "" ? 1 : Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 50 ? count : null;
}

/** Enforce the maximum occupancy configured for a room type. */
export function canAccommodateGuests(guestCount: number, capacity: number): boolean {
  return Number.isInteger(capacity) && capacity >= guestCount && guestCount >= 1;
}
