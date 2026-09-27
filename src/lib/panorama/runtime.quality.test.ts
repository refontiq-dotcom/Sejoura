import { describe, expect, it } from "vitest";
import { getPanoramaQualityCandidates, getPanoramaDeviceProfile } from "./runtime";

describe("panorama quality selection", () => {
  it("uses Preview, then Mobile, then HD on weak devices", () => {
    expect(getPanoramaQualityCandidates("weak", { preview: "p", mobile: "m", hd: "h" })).toEqual(["p", "m", "h"]);
  });

  it("uses Mobile, then HD, then Preview on medium devices", () => {
    expect(getPanoramaQualityCandidates("medium", { preview: "p", mobile: "m", hd: "h" })).toEqual(["m", "h", "p"]);
  });

  it("uses HD, then Mobile, then Preview on strong devices", () => {
    expect(getPanoramaQualityCandidates("strong", { preview: "p", mobile: "m", hd: "h" })).toEqual(["h", "m", "p"]);
  });

  it("removes unavailable variants without duplicates", () => {
    expect(getPanoramaQualityCandidates("strong", { preview: "p", mobile: null, hd: "p" })).toEqual(["p"]);
  });

  it("has deterministic server profile", () => {
    expect(getPanoramaDeviceProfile().tier).toBe("medium");
  });
});
