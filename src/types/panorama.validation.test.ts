import { describe, expect, it } from "vitest";
import { normalizePanoramaTour, validatePanoramaTour } from "./panorama";

describe("panorama tour validation", () => {
  it("normalizes the start scene and removes duplicate/orphan links", () => {
    const tour = normalizePanoramaTour({
      version: 1,
      startSceneId: "room-a",
      scenes: [
        { id: "room-a", name: "A", kind: "room", src: "a.webp" },
        { id: "room-b", name: "B", kind: "room", src: "b.webp" }
      ],
      links: [
        { id: "a-b", fromSceneId: "room-a", toSceneId: "room-b", yaw: 7, pitch: 0, label: "B" },
        { id: "a-b-duplicate", fromSceneId: "room-a", toSceneId: "room-b", yaw: 0, pitch: 0, label: "B" },
        { id: "orphan", fromSceneId: "room-a", toSceneId: "missing", yaw: 0, pitch: 0, label: "Missing" }
      ]
    });

    expect(tour.startSceneId).toBe("room-a");
    expect(tour.links).toHaveLength(1);
    expect(tour.links[0].yaw).toBeCloseTo(7 - Math.PI * 2);
  });

  it("accepts an empty editable tour", () => {
    expect(validatePanoramaTour({ version: 1, startSceneId: null, scenes: [], links: [] })).toEqual([]);
  });

  it("rejects an invalid start scene and duplicate passage", () => {
    const issues = validatePanoramaTour({
      version: 1,
      startSceneId: "missing",
      scenes: [{ id: "a", name: "A", kind: "room", src: "a.webp" }],
      links: [
        { id: "1", fromSceneId: "a", toSceneId: "a", yaw: 0, pitch: 0, label: "A" },
        { id: "2", fromSceneId: "a", toSceneId: "missing", yaw: 0, pitch: 0, label: "Missing" }
      ]
    });
    expect(issues.some((issue) => issue.code === "invalid_start_scene")).toBe(true);
    expect(issues.some((issue) => issue.code === "orphan_link")).toBe(true);
  });

  it("detects an unreachable scene", () => {
    const issues = validatePanoramaTour({
      version: 1,
      startSceneId: "a",
      scenes: [
        { id: "a", name: "A", kind: "room", src: "a.webp" },
        { id: "b", name: "B", kind: "room", src: "b.webp" }
      ],
      links: []
    });
    expect(issues.some((issue) => issue.code === "isolated_scene" && issue.sceneId === "b")).toBe(true);
  });
});
