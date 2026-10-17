import { describe, expect, it } from "vitest";
import {
  buildTrouvetouPanoramas,
  splitTrouvetouMedia,
  type PanoramaRecord,
} from "../src/lib/media/panorama";

/**
 * Contrat Séjoura → Trouvetou, figé.
 *
 * Trouvetou (`parsePanoramas`, src/lib/supabase/panorama.ts) exige exactement
 * ces champs. Ce test casse si l'un d'eux est renommé ou retiré ici ; il a son
 * pendant dans Trouvetou (`panorama.sejoura-contract.test.ts`). Si l'un des deux
 * doit changer, les deux dépôts changent ensemble.
 */
const record = (over: Partial<PanoramaRecord> = {}): PanoramaRecord =>
  ({
    id: "5a0f2c1e-8c53-4b3a-9d55-0d6f4f1b2a10",
    room_type_id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
    public_url: "https://pub.example.com/room-panoramas/p1.jpg",
    content_type: "image/jpeg",
    width: 6000,
    height: 3000,
    validated_at: "2026-10-01T10:00:00.000Z",
    ...over,
  }) as PanoramaRecord;

describe("contrat Trouvetou : attributes.panoramas", () => {
  it("émet exactement les champs que Trouvetou lit", () => {
    const [panorama] = buildTrouvetouPanoramas([record()]);
    expect(Object.keys(panorama).sort()).toEqual(
      ["content_type", "height", "id", "media_type", "projection", "room_id", "url", "validated_at", "width"].sort()
    );
    expect(panorama.media_type).toBe("photo_360");
    expect(panorama.projection).toBe("equirectangular_2_1");
  });

  it("n'envoie jamais un fichier que Trouvetou refuserait (4:3, URL dangereuse)", () => {
    expect(buildTrouvetouPanoramas([record({ width: 4000, height: 3000 })])).toEqual([]);
    expect(buildTrouvetouPanoramas([record({ public_url: "javascript:alert(1)" })])).toEqual([]);
  });

  it("ne mélange jamais un panorama et les photos classiques", () => {
    const pano = record();
    const { images, panoramas } = splitTrouvetouMedia({
      featuredImages: ["https://cdn.example.com/a.webp", pano.public_url],
      panoramaRecords: [pano],
    });
    expect(panoramas).toHaveLength(1);
    expect(images).toEqual(["https://cdn.example.com/a.webp"]);
  });
});
