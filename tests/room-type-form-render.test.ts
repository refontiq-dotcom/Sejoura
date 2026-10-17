import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomTypeForm } from "../src/components/dashboard/room-type-form";
import { EMPTY_ROOM_TYPE_FORM } from "../src/lib/validations/rooms";

const noop = () => {};

describe("RoomTypeForm — rendu", () => {
  it("variante complète : tous les champs, interrupteur accessible, erreurs affichées", () => {
    const html = renderToStaticMarkup(
      createElement(RoomTypeForm, {
        value: { ...EMPTY_ROOM_TYPE_FORM, name: "Studio" },
        onChange: noop,
        errors: { base_price: "Prix requis", featured_images: "Ajoutez une photo" },
        onUploadPhoto: noop,
      })
    );
    expect(html).toContain("Heure de sortie");
    expect(html).toContain("Commodités");
    expect(html).toContain('role="switch"');
    expect(html).toContain("Prix requis");
    expect(html).toContain("Ajoutez une photo");
    // l'heure de sortie est reliée à son libellé (for = id)
    const forId = /<label for="([^"]+)"[^>]*>Heure de sortie/.exec(html)?.[1];
    expect(forId).toBeTruthy();
    expect(html).toContain(`id="${forId}"`);
  });

  it("variante compacte : uniquement nom, tarif et capacité", () => {
    const html = renderToStaticMarkup(
      createElement(RoomTypeForm, { variant: "compact", value: EMPTY_ROOM_TYPE_FORM, onChange: noop })
    );
    expect(html).toContain("Nom du type de chambre *");
    expect(html).toContain("Tarif par nuit *");
    expect(html).toContain("Capacité *");
    expect(html).not.toContain("Commodités");
    expect(html).not.toContain("Trouvetou");
  });
});
