import { describe, it, expect } from "vitest";
import zlib from "zlib";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

const PAGE_HEIGHT = 841.89;
const HEADER_HEIGHT = 116;

function decompressedStreams(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    try {
      streams.push(zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
    } catch {
      // ignore non-compressed streams
    }
  }
  return streams.join("\n");
}

function extractPdfText(buffer: Buffer): string {
  const text = decompressedStreams(buffer);
  const runs: string[] = [];
  const tj = /\[([^\]]+)\]\s*TJ/g;
  let t: RegExpExecArray | null;
  while ((t = tj.exec(text)) !== null) {
    const hexes = [...t[1].matchAll(/<([0-9a-fA-F]+)>/g)];
    runs.push(hexes.map((h) => Buffer.from(h[1], "hex").toString("latin1")).join(""));
  }
  const tjs = /<([0-9a-fA-F]+)>\s*Tj/g;
  let s: RegExpExecArray | null;
  while ((s = tjs.exec(text)) !== null) {
    runs.push(Buffer.from(s[1], "hex").toString("latin1"));
  }
  return runs.join("\n");
}

interface TextRun {
  x: number;
  y: number; // distance depuis le haut de la page
  text: string;
}

/**
 * Extrait les blocs de texte avec leur position. Le PDF place l'origine en bas
 * de page (y_bottom) : on convertit en distance depuis le haut (y_top).
 */
function extractRuns(buffer: Buffer): TextRun[] {
  const text = decompressedStreams(buffer);
  const runs: TextRun[] = [];
  const bt = /BT([\s\S]*?)ET/g;
  let b: RegExpExecArray | null;
  while ((b = bt.exec(text)) !== null) {
    const block = b[1];
    const tm = /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+Tm/g;
    let t: RegExpExecArray | null;
    while ((t = tm.exec(block)) !== null) {
      const x = parseFloat(t[1]);
      const yBottom = parseFloat(t[2]);
      const yTop = PAGE_HEIGHT - yBottom;
      const after = block.slice(t.index + t[0].length);
      const arrayEnd = /\]\s*TJ/.exec(after);
      const snippet = arrayEnd ? after.slice(0, arrayEnd.index + 1) : after;
      const hexes = [...snippet.matchAll(/<([0-9a-fA-F]+)>/g)];
      const str = hexes.map((h) => Buffer.from(h[1], "hex").toString("latin1")).join("");
      if (str.trim().length > 0) runs.push({ x, y: yTop, text: str });
    }
  }
  return runs;
}

const baseTenant = {
  id: "t-1",
  company_name: "Résidence Palmier",
  contact_name: "Jean Koffi",
  contact_email: "contact@palmier.ci",
  contact_phone: "+2250102030405",
  country: "CI",
  city: "Abidjan",
  address: "Cocody, Angré",
  logo_url: null,
  default_currency: "XOF",
  is_suspended: false,
  suspended_reason: null,
  suspended_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseBooking = {
  id: "b-1",
  tenant_id: "t-1",
  accommodation_id: "a-1",
  room_id: "r-1",
  client_id: "c-1",
  booking_code: "RES-26-0001",
  check_in_date: "2026-08-01",
  check_out_date: "2026-08-03",
  check_in_time: "14:00",
  check_out_time: "11:00",
  actual_check_in: null,
  actual_check_out: null,
  base_price: 6000,
  negotiated_price: 6000,
  nights_count: 2,
  total_amount: 12000,
  amount_paid: 5000,
  payment_status: "partial" as const,
  payment_method: "cash" as const,
  status: "checked_in" as const,
  number_of_guests: 2,
  special_requests: null,
  created_by: "u-1",
  created_at: "2026-07-20T10:00:00Z",
  updated_at: "2026-07-20T10:00:00Z",
};

const relations = {
  client: {
    id: "c-1",
    tenant_id: "t-1",
    full_name: "Awa Diabaté",
    phone: "+2250708090910",
    email: "awa.d@mail.com",
    id_type: null,
    id_number: null,
    id_photo_url: null,
    nationality: "Côte d'Ivoire",
    address: null,
    emergency_contact: null,
    notes: null,
    created_at: "2026-07-20T10:00:00Z",
    updated_at: "2026-07-20T10:00:00Z",
  },
  room: {
    id: "r-1",
    accommodation_id: "a-1",
    room_type_id: "rt-1",
    room_number: "101",
    floor: 1,
    status: "occupied" as const,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  room_type: {
    id: "rt-1",
    accommodation_id: "a-1",
    name: "Chambre Standard",
    description: null,
    base_price: 6000,
    capacity: 2,
    amenities: [],
    surface_m2: 20,
    is_listed_on_trouvetou: false,
    featured_images: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  accommodation: {
    id: "a-1",
    tenant_id: "t-1",
    name: "Résidence Palmier",
    description: null,
    address: "Cocody",
    city: "Abidjan",
    country: "CI",
    currency: "XOF",
    currency_symbol: "FCFA",
    phone_code: "+225",
    language: "fr",
    latitude: null,
    longitude: null,
    contact_phone: "+2250102030405",
    total_rooms: 10,
    is_active: true,
    is_boosted: false,
    boost_expires_at: null,
    logo_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
};

const baseInvoice = {
  id: "inv-1",
  tenant_id: "t-1",
  booking_id: "b-1",
  invoice_number: "FAC/202608/0001",
  amount: 12000,
  tax_amount: 1200,
  total_amount: 13200,
  status: "draft" as const,
  pdf_url: null,
  access_token: "0123456789abcdef0123456789abcdef01234567",
  sent_at: null,
  sent_to: null,
  created_by: "u-1",
  created_at: "2026-08-13T09:00:00Z",
  updated_at: "2026-08-13T09:00:00Z",
};

describe("generateInvoicePdf", () => {
  it("produit un buffer PDF valide", async () => {
    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...baseBooking, ...relations } as never,
      invoice: baseInvoice as never,
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(buffer.length - 6).toString("latin1")).toContain("%%EOF");
  });

  it("formate les montants en FCFA avec séparateurs de milliers", async () => {
    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...baseBooking, ...relations } as never,
      invoice: baseInvoice as never,
    });

    const text = extractPdfText(buffer);
    expect(text).toContain("12 000");
    expect(text).toContain("1 200");
    expect(text).toContain("13 200");
    expect(text).toContain("Sous-total");
    expect(text).toContain("TVA (10%)");
  });

  it("retombe sur le code ISO pour les symboles non encodables en PDF (₦)", async () => {
    const buffer = await generateInvoicePdf({
      tenant: { ...baseTenant, default_currency: "NGN" } as never,
      booking: { ...baseBooking, ...relations } as never,
      invoice: baseInvoice as never,
    });

    const text = extractPdfText(buffer);
    expect(text).toContain("NGN");
    expect(text).not.toContain("\u20A6");
  });

  it("affiche la synthèse de paiement (payé / reste à payer)", async () => {
    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...baseBooking, ...relations } as never,
      invoice: baseInvoice as never,
    });

    const text = extractPdfText(buffer);
    expect(text).toContain("Statut du paiement : Partiellement payé");
    expect(text).toContain("Montant payé");
    expect(text).toContain("5 000");
    expect(text).toContain("Reste à payer");
    expect(text).toContain("8 200");
  });

  it("l'en-tête ne superpose jamais les textes, même avec des données longues", async () => {
    const longTenant = {
      ...baseTenant,
      company_name:
        "Hôtel Résidence Palmier Royal Beach Resort & Spa International de la Corniche Ouest",
      address: "Avenue de la Corniche Ouest, quartier des ambassades, Cocody Riviera",
      city: "Abidjan, District Autonome d'Abidjan",
    };
    const buffer = await generateInvoicePdf({
      tenant: longTenant as never,
      booking: { ...baseBooking, ...relations } as never,
      invoice: baseInvoice as never,
    });

    const text = extractPdfText(buffer);
    // Le nom très long est réduit (ellipse) ou reste sur 2 lignes : pas de troncature muette
    expect(text).toMatch(/Hôtel Résidence Palmier/);

    const runs = extractRuns(buffer).filter((r) => r.x < 330);
    const headerRuns = runs.filter((r) => r.y < HEADER_HEIGHT);
    const contentRuns = runs.filter((r) => r.y >= HEADER_HEIGHT);

    // Aucun texte de l'en-tête ne déborde dans le bloc destinataire
    expect(Math.max(...headerRuns.map((r) => r.y))).toBeLessThan(HEADER_HEIGHT);

    // Le bloc destinataire commence après l'en-tête (marge de 12 px)
    const firstContentTop = Math.min(...contentRuns.map((r) => r.y));
    expect(firstContentTop).toBeGreaterThanOrEqual(HEADER_HEIGHT + 12);

    // Aucun chevauchement vertical entre deux textes de l'en-tête
    const sorted = [...headerRuns].sort((a, b) => a.y - b.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const lineHeight = 9 * 1.16; // hauteur de ligne maximale estimée dans l'en-tête
      expect(sorted[i + 1].y - sorted[i].y).toBeGreaterThanOrEqual(2);
      expect(sorted[i + 1].y).toBeGreaterThan(sorted[i].y + lineHeight - 4);
    }
  });

  it("retrace les prolongations multiples sur la facture (facture intelligente)", async () => {
    // Séjour initial du 01/08 au 03/08 (2 nuits), puis 2 prolongations :
    // 03/08 → 05/08 (+2 nuits), puis 05/08 → 10/08 (+5 nuits) = 9 nuits au total.
    const extendedBooking = {
      ...baseBooking,
      check_out_date: "2026-08-10",
      nights_count: 9,
      total_amount: 54000,
    };
    const extendedInvoice = {
      ...baseInvoice,
      amount: 54000,
      tax_amount: 0,
      total_amount: 54000,
    };
    const extensions = [
      {
        id: "ext-1",
        tenant_id: "t-1",
        booking_id: "b-1",
        previous_check_out_date: "2026-08-03",
        new_check_out_date: "2026-08-05",
        extra_nights: 2,
        source: "manual" as const,
        created_by: "u-1",
        created_at: "2026-08-02T10:00:00Z",
      },
      {
        id: "ext-2",
        tenant_id: "t-1",
        booking_id: "b-1",
        previous_check_out_date: "2026-08-05",
        new_check_out_date: "2026-08-10",
        extra_nights: 5,
        source: "manual" as const,
        created_by: "u-1",
        created_at: "2026-08-04T10:00:00Z",
      },
    ];

    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...extendedBooking, ...relations } as never,
      invoice: extendedInvoice as never,
      extensions: extensions as never,
    });

    const text = extractPdfText(buffer);
    // Chaque segment est retracé
    expect(text).toContain("Nuitée initiale · du 01/08 au 03/08");
    expect(text).toContain("Prolongation 1 · du 03/08 au 05/08");
    expect(text).toContain("Prolongation 2 · du 05/08 au 10/08");
    // Montants : 2 × 6 000 = 12 000 ; 2 × 6 000 = 12 000 ; 5 × 6 000 = 30 000
    expect(text).toContain("12 000");
    expect(text).toContain("30 000");
    // Total inchangé
    expect(text).toContain("54 000");
  });

  it("étiquette le dépassement de séjour sur la facture", async () => {
    // Séjour prévu 2 nuits (01/08 → 03/08), dépassement de 2 nuits (auto check-out).
    const overstayBooking = {
      ...baseBooking,
      check_out_date: "2026-08-03",
      nights_count: 4,
      total_amount: 24000,
    };
    const overstayInvoice = {
      ...baseInvoice,
      amount: 24000,
      tax_amount: 0,
      total_amount: 24000,
    };
    const extensions = [
      {
        id: "ext-ov",
        tenant_id: "t-1",
        booking_id: "b-1",
        previous_check_out_date: "2026-08-03",
        new_check_out_date: "2026-08-05",
        extra_nights: 2,
        source: "overstay" as const,
        created_by: null,
        created_at: "2026-08-04T10:00:00Z",
      },
    ];

    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...overstayBooking, ...relations } as never,
      invoice: overstayInvoice as never,
      extensions: extensions as never,
    });

    const text = extractPdfText(buffer);
    expect(text).toContain("Nuitée initiale · du 01/08 au 03/08");
    expect(text).toContain("Dépassement de séjour · du 03/08 au 05/08");
  });

  it("tient sur une seule page pour une facture simple", async () => {
    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...baseBooking, ...relations } as never,
      invoice: baseInvoice as never,
    });
    const raw = buffer.toString("latin1");
    // Le PDF doit comporter exactement un objet /Page (et donc une seule page)
    const pageMatches = raw.match(/\/Type\s*\/Page[^s]/g) || [];
    expect(pageMatches.length).toBe(1);
  });

  it("tient sur une seule page même avec beaucoup de prolongations", async () => {
    // 1 nuit initiale + 5 prolongations (6 lignes) — cas le plus long possible
    // avant agrégation (MAX_DETAIL_LINES=7 → 6 < 7).
    const longBooking = {
      ...baseBooking,
      check_in_date: "2026-08-01",
      check_out_date: "2026-08-10",
      nights_count: 9,
      total_amount: 54000,
    };
    const longInvoice = { ...baseInvoice, amount: 54000, tax_amount: 0, total_amount: 54000 };
    const extensions = [2, 2, 1, 1, 3].map((nights, i) => ({
      id: `ext-${i}`,
      tenant_id: "t-1",
      booking_id: "b-1",
      previous_check_out_date: `2026-08-0${1 + i * 2}`,
      new_check_out_date: `2026-08-0${3 + i * 2}`,
      extra_nights: nights,
      source: "manual" as const,
      created_by: "u-1",
      created_at: `2026-08-0${1 + i * 2}T10:00:00Z`,
    }));

    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...longBooking, ...relations } as never,
      invoice: longInvoice as never,
      extensions: extensions as never,
    });
    const raw = buffer.toString("latin1");
    const pageMatches = raw.match(/\/Type\s*\/Page[^s]/g) || [];
    expect(pageMatches.length).toBe(1);
  });

  it("tient sur une seule page avec taxe de séjour + nom client long + taxe activée", async () => {
    // Cas réel : un client au nom long, une facture avec sous-total, TVA et
    // taxe de nuitée (3 lignes sous le tableau), et un nom d'établissement long.
    const longClient = {
      ...relations.client,
      full_name: "Mamadou Lamine Diouf Ndiaye Diop",
      email: "mamadou.lamine.diop@tres-long-email-professionnel.com",
      phone: "+221 77 123 45 67",
    };
    const longTenant = {
      ...baseTenant,
      company_name: "Hôtel Résidence Les Cocotiers du Bord de Mer",
      address: "Avenue Cheikh Anta Diop, Dakar Plateau",
    };
    const invoiceWithTax = {
      ...baseInvoice,
      amount: 12000,
      tax_amount: 1800,
      total_amount: 13800,
    };
    const bookingWithTouristTax = {
      ...baseBooking,
      tourist_tax_amount: 1500,
    };
    const buffer = await generateInvoicePdf({
      tenant: longTenant as never,
      booking: { ...bookingWithTouristTax, ...relations, client: longClient } as never,
      invoice: invoiceWithTax as never,
    });
    const raw = buffer.toString("latin1");
    const pageMatches = raw.match(/\/Type\s*\/Page[^s]/g) || [];
    expect(pageMatches.length).toBe(1);
  });

  it("intègre un QR Code de téléchargement dans le pied de page", async () => {
    // Le pied de page doit contenir :
    //   1. une image (signature /XObject /Image dans le flux PDF),
    //   2. la mention « Scannez ce QR Code… »,
    //   3. un lien /URI vers l'URL de téléchargement public.
    process.env.NEXT_PUBLIC_APP_URL = "https://app.sejoura.com";
    const buffer = await generateInvoicePdf({
      tenant: baseTenant as never,
      booking: { ...baseBooking, ...relations } as never,
      invoice: { ...baseInvoice, access_token: "abcdef0123456789abcdef0123456789abcdef01" } as never,
    });

    const raw = buffer.toString("latin1");
    // Le PDF embarque bien une image XObject (QR Code PNG) — la signature
    // /Subtype /Image est conservée même après compression FlateDecode.
    expect(raw).toMatch(/\/Subtype\s*\/Image/);
    // Mention textuelle visible (pdfkit peut casser la ligne en raison de
    // la largeur limitée du pied de page, on normalise les espaces).
    const text = extractPdfText(buffer).replace(/\s+/g, " ");
    expect(text).toContain("Scannez ce QR Code pour télécharger l'exemplaire original");
  });
});
