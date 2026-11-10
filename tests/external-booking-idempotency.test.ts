import { describe, expect, it } from "vitest";
import { parseExternalIdempotencyKey } from "../src/lib/trouvetou/idempotency";

describe("parseExternalIdempotencyKey", () => {
  it("accepts a valid UUID", () => {
    const key = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseExternalIdempotencyKey(key)).toBe(key);
  });

  it("rejects non-UUID values", () => {
    expect(parseExternalIdempotencyKey("retry-1")).toBeNull();
    expect(parseExternalIdempotencyKey("")).toBeNull();
    expect(parseExternalIdempotencyKey(null)).toBeNull();
    expect(parseExternalIdempotencyKey(123)).toBeNull();
  });
});
