import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/redis-test/route";

describe("GET /api/redis-test", () => {
  it("n'est pas exposé publiquement", async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).not.toHaveProperty("url");
    expect(JSON.stringify(body)).not.toMatch(/upstash|redis/i);
  });
});
