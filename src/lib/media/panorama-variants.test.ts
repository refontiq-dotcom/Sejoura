import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { optimizePanorama360Variants } from "./optimize";
import { PANORAMA_360_POLICY, PANORAMA_360_VARIANTS } from "./policy";

describe("panorama 360 responsive variants", () => {
  it("defines preview, mobile and HD targets", () => {
    expect(PANORAMA_360_POLICY.maxInputBytes).toBe(10 * 1024 * 1024);
    expect(PANORAMA_360_VARIANTS.map((variant) => variant.label)).toEqual(["preview", "mobile", "hd"]);
    expect(PANORAMA_360_VARIANTS.map((variant) => [variant.width, variant.height])).toEqual([
      [1280, 640],
      [2048, 1024],
      [4096, 2048],
    ]);
  });

  it("generates the three WebP variants without enlarging a smaller source", async () => {
    const input = await sharp({
      create: { width: 1600, height: 800, channels: 3, background: { r: 120, g: 120, b: 120 } },
    }).jpeg().toBuffer();

    const variants = await optimizePanorama360Variants(input, PANORAMA_360_POLICY);

    expect(variants.map((variant) => variant.variant)).toEqual(["preview", "mobile", "hd"]);
    expect(variants.map((variant) => [variant.width, variant.height])).toEqual([
      [1280, 640],
      [1600, 800],
      [1600, 800],
    ]);
    expect(variants.every((variant) => variant.extension === "webp" && variant.bytesOut < 4 * 1024 * 1024)).toBe(true);
  });
});
