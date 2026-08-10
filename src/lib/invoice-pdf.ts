import PDFDocument from "pdfkit";
import type { BookingWithRelations, Invoice, Tenant } from "@/types/database";
import { formatDateLong } from "@/lib/utils";
import { formatPrice } from "@/lib/currencyConverter";

export interface InvoicePdfData {
  tenant: Tenant;
  booking: BookingWithRelations;
  invoice: Invoice;
}

export interface TaxRate {
  label: string;
  rate: number;
}

export const DEFAULT_TAX_RATE: TaxRate = {
  label: "TVA (10%)",
  rate: 0.10,
};



export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const { tenant, booking, invoice } = data;
  const client = booking.client;
  const room = booking.room;
  const roomType = booking.room_type;
  const accommodation = booking.accommodation;

  const targetCurrency = tenant.default_currency || "XOF";
  const fmt = (amountInXof: number) => formatPrice(amountInXof, targetCurrency);

  const doc = new PDFDocument({
    size: "A4",
    margin: 60,
    lang: "fr-FR",
    info: {
      Title: `Facture ${invoice.invoice_number}`,
      Author: "Séjoura",
      Subject: "Facture de séjour",
      Keywords: "facture, séjour, réservation",
    },
  });


  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const streamPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const primaryColor = "#0C1C33"; // Bleu profond (Charte Séjoura)
  const accentGold = "#C2944E";   // Or (Charte Séjoura)
  const textColor = "#0C1C33";
  const mutedColor = "#64748B";
  const borderColor = "#E2E8F0";

  function drawBorder(doc: PDFKit.PDFDocument) {
    doc
      .save()
      .rect(28, 28, 555, 746)
      .stroke(borderColor)
      .lineWidth(0.5);
    doc.restore();
  }

  drawBorder(doc);

  // --- HEADER ---
  const headerHeight = 100;
  doc.rect(0, 0, 612, headerHeight).fill("#0C1C33");

  // Integration du Logo dynamique (Logo Établissement ou Fallback Séjoura)
  const targetLogoUrl = accommodation?.logo_url || tenant?.logo_url;
  let logoBuffer: Buffer | null = null;

  if (targetLogoUrl && targetLogoUrl.startsWith("http")) {
    try {
      const res = await fetch(targetLogoUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        logoBuffer = Buffer.from(arrayBuf);
      }
    } catch {
      // Fallback en cas d'erreur réseau
    }
  }

  if (!logoBuffer) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const defaultPath = path.join(process.cwd(), "public/logo.png");
      if (fs.existsSync(defaultPath)) {
        logoBuffer = fs.readFileSync(defaultPath);
      }
    } catch {
      // Erreur silencieuse
    }
  }

  let textLeft = 60;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 50, 25, { fit: [50, 50] });
      textLeft = 115;
    } catch {
      textLeft = 60;
    }
  }

  // Company info (Header sur Fond Bleu Profond #0C1C33)
  doc
    .fontSize(18)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text(tenant.company_name || "Séjoura", textLeft, 30);

  doc
    .fontSize(9)
    .fillColor("#C2944E")
    .font("Helvetica-Bold")
    .text("Séjoura SaaS", textLeft, 52);

  doc
    .fontSize(8)
    .fillColor("#E2E8F0")
    .font("Helvetica")
    .text(tenant.address || "", textLeft, 64)
    .text(
      `${tenant.city || ""} • Tél: ${tenant.contact_phone || ""}`,
      textLeft,
      74
    );

  // Ligne dorée 2px d'accentuation en-tête (Section 5.2 de la charte)
  doc
    .stroke("#C2944E")
    .moveTo(0, headerHeight)
    .lineTo(612, headerHeight)
    .lineWidth(2);

  // Invoice title
  const invoiceTitle = "FACTURE";
  doc
    .fontSize(26)
    .fillColor("#C2944E")
    .font("Helvetica-Bold")
    .text(invoiceTitle, 420, 32, { align: "right" });

  doc
    .fontSize(10)
    .fillColor("#FFFFFF")
    .font("Helvetica")
    .text(`Facture n° ${invoice.invoice_number}`, 420, 64, {
      align: "right",
    });

  doc
    .fontSize(8)
    .fillColor("#E2E8F0")
    .font("Helvetica")
    .text(`Date: ${formatDateLong(invoice.created_at)}`, 420, 78, {
      align: "right",
    });

  // --- CLIENT INFO ---
  let y = 140;
  doc
    .fontSize(10)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text("Facturée à:", 60, y);

  doc
    .fontSize(13)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text(client?.full_name || "Client", 60, y + 16);

  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(client?.phone || "", 60, y + 32)
    .text(client?.email || "", 60, y + 44)
    .text(client?.nationality || "", 60, y + 56);

  // --- INVOICE DETAILS ---
  y = 230;
  doc
    .fontSize(10)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text("Détails de la réservation:", 60, y);

  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(`Code réservation: ${booking.booking_code || "—"}`, 60, y + 16)
    .text(
      `Chambre: ${room?.room_number || "—"} (${roomType?.name || ""})`,
      60,
      y + 28
    )
    .text(
      `Établissement: ${accommodation?.name || "—"}`,
      60,
      y + 40
    );

  const checkInLabel = "Arrivée:";
  const checkOutLabel = "Départ:";
  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(checkInLabel, 60, y + 52)
    .text(
      formatDateLong(booking.check_in_date),
      80,
      y + 52
    )
    .text(checkOutLabel, 180, y + 52)
    .text(
      formatDateLong(booking.check_out_date),
      205,
      y + 52
    )
    .text(
      `Nombre de nuits: ${booking.nights_count}`,
      320,
      y + 52
    );

  // --- LINE ITEMS TABLE ---
  y = 330;

  const tableTop = y;
  const tableLeft = 60;
  const tableWidth = 492;
  const col1Width = 260; // Description
  const col2Width = 70;  // Prix unitaire
  const col3Width = 50;  // Qté

  // Table header background
  doc.rect(tableLeft, tableTop, tableWidth, 20).fill("#F1F5F9");

  // Header text
  doc
    .fontSize(9)
    .fillColor("#334155")
    .font("Helvetica-Bold")
    .text("Description", tableLeft + 10, tableTop + 5)
    .text("Prix unitaire", tableLeft + col1Width + 10, tableTop + 5)
    .text("Qté", tableLeft + col1Width + col2Width + 10, tableTop + 5)
    .text("Total", tableLeft + col1Width + col2Width + col3Width + 10, tableTop + 5, {
      align: "right",
    });

  // Bottom border of header
  doc
    .stroke(borderColor)
    .moveTo(tableLeft, tableTop + 20)
    .lineTo(tableLeft + tableWidth, tableTop + 20)
    .lineWidth(0.5);

  // Row 1: Accommodation / Nuitée
  let rowY = tableTop + 26;
  const unitPrice =
    booking.negotiated_price ||
    (roomType ? roomType.base_price : booking.total_amount / (booking.nights_count || 1));
  const nights = booking.nights_count;
  const lineTotal = unitPrice * nights;

  doc
    .fontSize(9)
    .fillColor(textColor)
    .font("Helvetica")
    .text(`${roomType?.name || "Nuitée"} × ${nights} nuit(s)`, tableLeft + 10, rowY)
    .text(`${fmt(unitPrice)}`, tableLeft + col1Width + 10, rowY)
    .text(`${nights}`, tableLeft + col1Width + col2Width + 10, rowY)
    .text(fmt(lineTotal), tableLeft + col1Width + col2Width + col3Width + 10, rowY, {
      align: "right",
    });

  rowY += 18;

  // Subtotal row
  doc
    .stroke(borderColor)
    .moveTo(tableLeft, rowY)
    .lineTo(tableLeft + tableWidth, rowY)
    .lineWidth(0.5);

  rowY += 8;

  // Subtotal
  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text("Sous-total", tableLeft + col1Width + col2Width + 10, rowY)
    .text(fmt(lineTotal), tableLeft + tableWidth - 112 + 10, rowY, {
      align: "right",
    });

  rowY += 14;

  // Tax
  const taxAmount = invoice.tax_amount || 0;
  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(DEFAULT_TAX_RATE.label, tableLeft + col1Width + col2Width + 10, rowY)
    .text(fmt(taxAmount), tableLeft + tableWidth - 112 + 10, rowY, {
      align: "right",
    });

  rowY += 14;

  // Total
  doc
    .stroke(borderColor)
    .moveTo(tableLeft, rowY)
    .lineTo(tableLeft + tableWidth, rowY)
    .lineWidth(1);

  rowY += 8;

  doc
    .fontSize(11)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text("TOTAL", tableLeft + col1Width + col2Width + 10, rowY)
    .text(fmt(invoice.total_amount), tableLeft + tableWidth - 112 + 10, rowY, {
      align: "right",
    });

  // --- PAYMENT STATUS ---
  y = rowY + 30;
  const paymentStatusLabel =
    booking.payment_status === "paid"
      ? "Payé"
      : booking.payment_status === "partial"
      ? "Partiellement payé"
      : "Non payé";

  doc
    .fontSize(10)
    .fillColor(booking.payment_status === "paid" ? "#16A34A" : "#DC2626")
    .font("Helvetica-Bold")
    .text(`Statut du paiement: ${paymentStatusLabel}`, 60, y);

  // --- FOOTER ---
  const footerY = 740;
  doc
    .fontSize(8)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(
      "Merci de votre confiance. Cette facture a été générée automatiquement par Séjoura.",
      60,
      footerY,
      { align: "center" }
    );

  doc
    .fontSize(7)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(
      `Facture n° ${invoice.invoice_number} • Générée le ${formatDateLong(
        invoice.created_at
      )}`,
      60,
      footerY + 14,
      { align: "center" }
    );

  doc.end();

  return streamPromise;
}

export function generateInvoiceNumber(tenantId: string, seq: number): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const num = String(seq).padStart(4, "0");
  return `F-${year}-${month}-${num}`;
}
