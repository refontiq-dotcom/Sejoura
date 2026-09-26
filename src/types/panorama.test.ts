import { describe, expect, it } from "vitest";
import { normalizePanoramaTour } from "./panorama";

describe("normalizePanoramaTour", () => {
  it("keeps valid scenes and removes links to missing scenes", () => {
    const tour = normalizePanoramaTour({
      version: 1,
      startSceneId: "room-a",
      scenes: [
        { id: "room-a", name: "Chambre A", kind: "room", src: "https://cdn.test/a.webp" },
        { id: "corridor", name: "Couloir", kind: "corridor", src: "https://cdn.test/c.webp" },
      ],
      links: [
        { id: "l1", fromSceneId: "room-a", toSceneId: "corridor", yaw: 0, pitch: 0, label: "Couloir" },
        { id: "l2", fromSceneId: "room-a", toSceneId: "missing", yaw: 0, pitch: 0, label: "Invalide" },
      ],
    });

    expect(tour.scenes).toHaveLength(2);
    expect(tour.links).toHaveLength(1);
    expect(tour.startSceneId).toBe("room-a");
  });

  it("falls back to the first scene when the configured start is invalid", () => {
    const tour = normalizePanoramaTour({
      version: 1,
      startSceneId: "missing",
      scenes: [
        { id: "first", name: "Couloir", kind: "corridor", src: "https://cdn.test/c.webp" },
      ],
      links: [],
    });
    expect(tour.startSceneId).toBe("first");
  });
});
