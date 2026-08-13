import { describe, it, expect } from "vitest";
import zlib from "zlib";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

function extractPdfText(buffer: Buffer): string {
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
  const text = streams.join("\n");
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
  booking_code: "BK-0001",
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
  invoice_number: "F-2026-08-0001",
  amount: 12000,
  tax_amount: 1200,
  total_amount: 13200,
  status: "draft" as const,
  pdf_url: null,
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
});
