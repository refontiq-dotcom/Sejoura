import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { BookingExtension, BookingWithRelations, Invoice, Tenant } from "@/types/database";
import { formatDateLong } from "@/lib/utils";
import { convertXofTo, getCurrencyDecimals, getCurrencySymbol } from "@/lib/currencyConverter";
import { getInvoiceDownloadUrl } from "@/lib/invoice-share";

export interface InvoicePdfData {
  tenant: Tenant;
  booking: BookingWithRelations;
  invoice: Invoice;
  /** Historique des prolongations (extend_booking / dépassement), trié chronologiquement. */
  extensions?: BookingExtension[];
}

export interface TaxRate {
  label: string;
  rate: number;
}

export const DEFAULT_TAX_RATE: TaxRate = {
  // Les factures historiques peuvent contenir une TVA à 10 %. Les nouvelles
  // factures n'ajoutent plus de taxe implicite (tax_amount = 0).
  label: "TVA (10%)",
  rate: 0,
};

/**
 * Caractères que la police standard Helvetica (encodage WinAnsi) ne sait pas
 * restituer (ex : ₦ U+20A6, ₵ U+20B5). On retombe alors sur le code ISO de la
 * devise, qui reste sans ambiguïté sur une facture (ex : "12 000,00 NGN").
 * € (U+20AC) est toléré : il est encodé en 0x80 dans WinAnsi.
 */
const PDF_UNSUPPORTED_SYMBOL_RE = /[^\x00-\xFF\u20AC]/;

/**
 * Formate un montant avec des espaces de milliers normales (compatibles PDFKit).
 * Ex : 12000 -> "12 000 FCFA"
 * Intl.NumberFormat("fr-FR") émet des espaces insécables étroites (U+202F) mal
 * interprétées par la police Helvetica standard du PDF ; on les normalise ici.
 */
function formatMoney(amount: number, currencyCode: string): string {
  const converted = convertXofTo(amount, currencyCode);
  const decimals = getCurrencyDecimals(currencyCode);
  const rawSymbol = getCurrencySymbol(currencyCode);
  const symbol = PDF_UNSUPPORTED_SYMBOL_RE.test(rawSymbol) ? currencyCode : rawSymbol;
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(converted || 0)
    .replace(/[\u202F\u00A0]/g, " ");
  if (["$", "₦", "₵", "£", "€"].includes(symbol.trim())) {
    return `${symbol} ${formatted}`;
  }
  return `${formatted} ${symbol}`;
}

/**
 * Tronque un texte pour tenir sur UNE seule ligne de maxWidth pixels (ellipse
 * finale), en vérifiant avec heightOfString (le même algorithme de césure que
 * text()) : widthOfString seul est légèrement optimiste et provoque des
 * retours à la ligne inattendus.
 */
function truncateToWidth(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  const oneLineHeight = doc.heightOfString("X", { width: maxWidth });
  const fitsOneLine = (t: string) =>
    doc.widthOfString(t) <= maxWidth && doc.heightOfString(t, { width: maxWidth }) <= oneLineHeight;
  if (fitsOneLine(text)) return text;
  let fitted = text;
  while (fitted.length > 1 && !fitsOneLine(`${fitted}…`)) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

/** Formate une date ISO (YYYY-MM-DD) en « JJ/MM ». */
function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Réduit un texte pour tenir dans une hauteur max (ex : 2 lignes) : baisse la
 * taille de police, puis tronque avec une ellipse si nécessaire.
 */
function fitText(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startSize = 16,
  minSize = 10
): { text: string; size: number } {
  let size = startSize;
  const measure = (t: string) => doc.fontSize(size).heightOfString(t, { width: maxWidth });

  while (size > minSize && measure(text) > maxHeight) {
    size -= 1;
  }

  let fitted = text;
  if (measure(fitted) > maxHeight) {
    while (fitted.length > 1 && measure(`${fitted}…`) > maxHeight) {
      fitted = fitted.slice(0, -1);
    }
    fitted = `${fitted}…`;
  }
  return { text: fitted, size };
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const { tenant, booking, invoice, extensions = [] } = data;
  const client = booking.client;
  const room = booking.room;
  const roomType = booking.room_type;
  const accommodation = booking.accommodation;

  const targetCurrency = tenant.default_currency || "XOF";
  const fmt = (amountInXof: number) => formatMoney(amountInXof, targetCurrency);

  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    lang: "fr-FR",
    info: {
      Title: `Facture N° ${invoice.invoice_number}`,
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
  const headerFill = "#F1F5F9";

  // Bordure fine de page (réduite pour gagner de l'espace vertical utile).
  doc.save().rect(20, 20, 571, 802).lineWidth(0.5).stroke(borderColor).restore();

  // ==========================================================================
  // EN-TÊTE NAVY — bloc ÉMETTEUR (gauche) + bloc TITRE (droite), sans superposition
  // ==========================================================================
  const headerHeight = 116;
  doc.rect(0, 0, 612, headerHeight).fill(primaryColor);

  // Logo dynamique (Établissement ou Fallback Séjoura)
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

  // Largeur du bloc émetteur bornée à 330 px : jamais en collision avec le bloc
  // titre de droite (qui commence à x=340).
  const textLeft = logoBuffer ? 116 : 60;
  const emitterWidth = 330 - textLeft;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 50, 33, { fit: [50, 50] });
    } catch {
      // Ignorer un logo corrompu
    }
  }

  // --- Nom de l'établissement : max 2 lignes (taille réduite puis troncature) ---
  // IMPORTANT : la mesure doit utiliser la MÊME police que le rendu
  // (Helvetica-Bold est plus large que Helvetica, sinon le texte déborde et
  // chevauche le bloc suivant).
  const companyName = tenant.company_name || "Séjoura";
  doc.font("Helvetica-Bold");
  const { text: nameText, size: nameSize } = fitText(doc, companyName, emitterWidth, 44, 16, 10);
  const nameHeight = doc.fontSize(nameSize).heightOfString(nameText, { width: emitterWidth });

  doc
    .fontSize(nameSize)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text(nameText, textLeft, 24, { width: emitterWidth });

  // --- Sous-titre (sous le nom, jamais au-dessus) ---
  const taglineTop = Math.min(24 + nameHeight + 4, 74);
  doc
    .fontSize(9)
    .fillColor(accentGold)
    .font("Helvetica-Bold")
    .text("Séjoura SaaS", textLeft, taglineTop, { width: emitterWidth });

  // --- Coordonnées ancrées en bas de l'en-tête (aucun chevauchement possible) ---
  doc.fontSize(8).font("Helvetica");
  const contactTop = headerHeight - 30;
  const addressLine = truncateToWidth(doc, tenant.address || "", emitterWidth);
  const cityPhoneLine = truncateToWidth(
    doc,
    [tenant.city, tenant.contact_phone ? `Tél : ${tenant.contact_phone}` : ""]
      .filter(Boolean)
      .join(" • "),
    emitterWidth
  );

  doc
    .fillColor("#E2E8F0")
    .text(addressLine, textLeft, contactTop, { width: emitterWidth })
    .text(cityPhoneLine, textLeft, contactTop + 11, { width: emitterWidth });

  // ==========================================================================
  // BLOC TITRE (à droite) — FACTURE + N° + date
  // ==========================================================================
  const titleX = 340;
  const titleWidth = 212; // 552 - 340 (borné pour éviter la troncature)

  doc
    .fontSize(26)
    .fillColor(accentGold)
    .font("Helvetica-Bold")
    .text("FACTURE", titleX, 24, { align: "right", width: titleWidth });

  doc
    .fontSize(10)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text(`Facture N° ${invoice.invoice_number}`, titleX, 58, { align: "right", width: titleWidth });

  doc
    .fontSize(8)
    .fillColor("#E2E8F0")
    .font("Helvetica")
    .text(`Date : ${formatDateLong(invoice.created_at)}`, titleX, 74, { align: "right", width: titleWidth });

  // Ligne dorée 2px d'accentuation en-tête (Section 5.2 de la charte)
  doc
    .moveTo(0, headerHeight)
    .lineTo(612, headerHeight)
    .lineWidth(2)
    .stroke(accentGold);

  // ==========================================================================
  // BLOC DESTINATAIRE + DÉTAILS RÉSERVATION
  // ==========================================================================
  // Compacté pour tenir la facture sur une seule page A4 même dans les cas
  // chargés (plusieurs prolongations, taxe de nuitée activée, longs libellés).
  let y = 128;

  // --- Facturé à (destinataire, à gauche) ---
  doc.fontSize(8).fillColor(mutedColor).font("Helvetica-Bold").text("FACTURÉ À", 60, y);
  doc
    .fontSize(12)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text(client?.full_name || "Client", 60, y + 12, { width: 220 });
  doc.fontSize(8.5).font("Helvetica").fillColor(mutedColor);
  doc
    .text(truncateToWidth(doc, client?.phone || "", 220), 60, y + 28, { width: 220 })
    .text(truncateToWidth(doc, client?.email || "", 220), 60, y + 39, { width: 220 })
    .text(truncateToWidth(doc, client?.nationality || "", 220), 60, y + 50, { width: 220 });

  // --- Réservation (à droite) ---
  const rx = 320;
  const rw = 232;
  doc.fontSize(8).fillColor(mutedColor).font("Helvetica-Bold").text("RÉSERVATION", rx, y);
  doc.fontSize(8.5).font("Helvetica").fillColor(mutedColor);
  const roomLabel = `Chambre : ${room?.room_number || "—"}${roomType?.name ? ` (${roomType.name})` : ""}`;
  doc
    .text(truncateToWidth(doc, `Code : ${booking.booking_code || "—"}`, rw), rx, y + 14, { width: rw })
    .text(truncateToWidth(doc, roomLabel, rw), rx, y + 25, { width: rw })
    .text(truncateToWidth(doc, `Établissement : ${accommodation?.name || "—"}`, rw), rx, y + 36, { width: rw })
    .text(`Arrivée : ${formatDateLong(booking.check_in_date)}`, rx, y + 47, { width: rw })
    .text(`Départ : ${formatDateLong(booking.check_out_date)}`, rx, y + 58, { width: rw })
    .text(`Nombre de nuits : ${booking.nights_count}`, rx, y + 69, { width: rw });

  // ==========================================================================
  // TABLEAU DES LIGNES
  // ==========================================================================
  const tableLeft = 60;
  const tableWidth = 492;
  const descW = 240;  // Description (gauche)
  const priceW = 100; // Prix unitaire (droite)
  const qtyW = 52;    // Qté (centre)
  const totalW = 100; // Total (droite)
  const col1Right = tableLeft + descW;
  const col2Right = col1Right + priceW;
  const col3Right = col2Right + qtyW;

  const padX = 10;
  const headerH = 22;
  const rowH = 22;
  // Position de départ du tableau : recalculée pour rester compacte après le
  // bloc destinataire (dont le dernier texte est à y+69 ≈ 197 pt).
  const tableTop = 218;

  // Fond de l'en-tête du tableau
  doc.rect(tableLeft, tableTop, tableWidth, headerH).fill(headerFill);

  // En-têtes de colonnes
  doc
    .fontSize(9)
    .fillColor("#334155")
    .font("Helvetica-Bold")
    .text("Description", tableLeft + padX, tableTop + (headerH - 9) / 2, { width: descW - padX * 2 })
    .text("Prix unitaire", col1Right + padX, tableTop + (headerH - 9) / 2, { width: priceW - padX * 2, align: "right" })
    .text("Qté", col2Right, tableTop + (headerH - 9) / 2, { width: qtyW, align: "center" })
    .text("Total", col3Right + padX, tableTop + (headerH - 9) / 2, { width: totalW - padX * 2, align: "right" });

  // Lignes verticales de colonnes
  doc.lineWidth(0.5).strokeColor(borderColor);
  [col1Right, col2Right, col3Right].forEach((cx) => {
    doc.moveTo(cx, tableTop).lineTo(cx, tableTop + headerH).stroke();
  });

  // Ligne basse de l'en-tête
  doc.moveTo(tableLeft, tableTop + headerH).lineTo(tableLeft + tableWidth, tableTop + headerH).stroke();

  // Lignes de détail : nuitée initiale + prolongations (facture intelligente)
  // Le montant facturé (invoice.amount = booking.total_amount) fait foi : on en
  // déduit le prix unitaire pour garantir la cohérence tableau / sous-total /
  // taxe / total (total_amount = negotiated_price * nights_count).
  const nights = booking.nights_count || 1;
  const baseAmount = invoice.amount || booking.total_amount || 0;
  const unitPrice =
    baseAmount > 0
      ? baseAmount / nights
      : booking.negotiated_price || roomType?.base_price || 0;

  // Construit les lignes du tableau à partir de l'historique des prolongations.
  // segments = [ { label, qty } ] ; le nombre de nuits de la ligne initiale est
  // déduit (nights_count - nuits prolongées) pour que la somme des lignes soit
  // toujours exactement égale au nombre de nuits de la réservation.
  interface InvoiceLine {
    label: string;
    qty: number;
  }
  const lines: InvoiceLine[] = [];

  const sortedExtensions = [...extensions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const extendedNights = sortedExtensions.reduce((sum, ext) => sum + ext.extra_nights, 0);
  const initialNights = nights - extendedNights;

  if (sortedExtensions.length > 0 && initialNights > 0) {
    const firstExt = sortedExtensions[0];
    lines.push({
      label: `Nuitée initiale · du ${shortDate(booking.check_in_date)} au ${shortDate(firstExt.previous_check_out_date)}`,
      qty: initialNights,
    });

    let extIndex = 1;
    for (const ext of sortedExtensions) {
      const isOverstay = ext.source === "overstay";
      const name = isOverstay ? "Dépassement de séjour" : `Prolongation ${extIndex}`;
      if (!isOverstay) extIndex += 1;
      lines.push({
        label: `${name} · du ${shortDate(ext.previous_check_out_date)} au ${shortDate(ext.new_check_out_date)}`,
        qty: ext.extra_nights,
      });
    }
  } else {
    // Aucune prolongation enregistrée (séjour initial, ou données antérieures à
    // la migration booking_extensions) : ligne unique, comportement historique.
    lines.push({
      label: `${roomType?.name || "Nuitée"} · du ${shortDate(booking.check_in_date)} au ${shortDate(booking.check_out_date)}`,
      qty: nights,
    });
  }

  // Plafond de lignes détaillées : au-delà, le reste est agrégé sur une ligne.
  const MAX_DETAIL_LINES = 7;
  let displayLines = lines;
  if (lines.length > MAX_DETAIL_LINES) {
    displayLines = lines.slice(0, MAX_DETAIL_LINES - 1);
    const restQty = lines.slice(MAX_DETAIL_LINES - 1).reduce((sum, l) => sum + l.qty, 0);
    displayLines.push({ label: `Prolongations suivantes · ${restQty} nuit(s)`, qty: restQty });
  }

  // Montants par ligne : la dernière absorbe l'arrondi pour que la somme soit
  // exactement égale au sous-total facturé (baseAmount).
  const lineAmounts = displayLines.map((l) => Math.round(l.qty * unitPrice));
  const sumOthers = lineAmounts.slice(0, -1).reduce((a, b) => a + b, 0);
  lineAmounts[lineAmounts.length - 1] = baseAmount > 0 ? baseAmount - sumOthers : lineAmounts[lineAmounts.length - 1];

  let rowTop = tableTop + headerH;

  displayLines.forEach((line, i) => {
    const textY = rowTop + (rowH - 9) / 2;
    doc
      .fontSize(9)
      .fillColor(textColor)
      .font("Helvetica")
      .text(line.label, tableLeft + padX, textY, { width: descW - padX * 2 })
      .text(fmt(unitPrice), col1Right + padX, textY, { width: priceW - padX * 2, align: "right" })
      .text(`${line.qty}`, col2Right, textY, { width: qtyW, align: "center" })
      .text(fmt(lineAmounts[i]), col3Right + padX, textY, { width: totalW - padX * 2, align: "right" });
    rowTop += rowH;
  });

  // Bordures du tableau (horizontale basse + verticales sur toute la hauteur)
  doc.lineWidth(0.5).strokeColor(borderColor);
  doc.moveTo(tableLeft, rowTop).lineTo(tableLeft + tableWidth, rowTop).stroke();
  [col1Right, col2Right, col3Right].forEach((cx) => {
    doc.moveTo(cx, tableTop).lineTo(cx, rowTop).stroke();
  });

  // --- Sous-total ---
  rowTop += 4;
  const subY = rowTop + (12 - 9) / 2;
  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text("Sous-total :", 352, subY, { width: 100, align: "right" })
    .text(fmt(invoice.amount), col3Right + padX, subY, { width: totalW - padX * 2, align: "right" });

  const taxAmount = invoice.tax_amount || 0;
  if (taxAmount > 0) {
    rowTop += 13;
    const taxY = rowTop + (12 - 9) / 2;
    doc
      .text(DEFAULT_TAX_RATE.label, 352, taxY, { width: 100, align: "right" })
      .text(fmt(taxAmount), col3Right + padX, taxY, { width: totalW - padX * 2, align: "right" });
  }

  // Taxe de nuitée (annexe fiscale 2026) : collectée pour le compte de la
  // mairie, distincte de la TVA — affichée uniquement si l'établissement l'a
  // activée. Ligne informative : n'affecte pas invoice.total_amount stocké
  // (utilisé ailleurs pour le suivi des soldes de paiement).
  const touristTaxAmount = booking.tourist_tax_amount || 0;
  if (touristTaxAmount > 0) {
    rowTop += 13;
    const touristTaxY = rowTop + (12 - 9) / 2;
    doc
      .text("Taxe de nuitée", 352, touristTaxY, { width: 100, align: "right" })
      .text(fmt(touristTaxAmount), col3Right + padX, touristTaxY, { width: totalW - padX * 2, align: "right" });
  }

  // --- Total ---
  rowTop += 13;
  doc
    .lineWidth(1)
    .strokeColor(borderColor)
    .moveTo(tableLeft, rowTop)
    .lineTo(tableLeft + tableWidth, rowTop)
    .stroke();

  rowTop += 5;
  const totalY = rowTop + (13 - 11) / 2;
  doc
    .fontSize(11)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text("TOTAL :", 352, totalY, { width: 100, align: "right" })
    .text(fmt((invoice.total_amount || 0) + touristTaxAmount), col3Right + padX, totalY, { width: totalW - padX * 2, align: "right" });

  // ==========================================================================
  // STATUT DU PAIEMENT
  // ==========================================================================
  y = rowTop + 20;
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
    .text(`Statut du paiement : ${paymentStatusLabel}`, 60, y);

  // Synthèse du règlement : montant payé et reste à payer (inclut la taxe
  // de nuitée, puisqu'elle est réglée par le client en même temps).
  const paidAmount = Math.max(0, booking.amount_paid || 0);
  const balance = Math.max(0, (invoice.total_amount || 0) + touristTaxAmount - paidAmount);

  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(`Montant payé : ${fmt(paidAmount)}`, 60, y + 16);

  doc
    .fontSize(9)
    .fillColor(balance > 0 ? textColor : mutedColor)
    .font(balance > 0 ? "Helvetica-Bold" : "Helvetica")
    .text(`Reste à payer : ${fmt(balance)}`, 60, y + 29);

  // ==========================================================================
  // PIED DE PAGE — QR Code de téléchargement + mentions légales
  // ==========================================================================
  // Le pied de page est positionné dynamiquement juste sous le bloc paiement
  // (avec un minimum pour ne pas chevaucher le contenu) et reste borné par
  // la bordure interne (28..774) afin de garantir une facture mono-page.
  const MIN_FOOTER_Y = 660;
  const MAX_FOOTER_Y = 700;
  const footerY = Math.min(MAX_FOOTER_Y, Math.max(MIN_FOOTER_Y, y + 48));
  const footerHeight = 56; // y=footerY..footerY+56 : reste sous 774
  const downloadUrl = getInvoiceDownloadUrl(invoice);

  // Séparateur fin au-dessus du pied de page
  doc
    .lineWidth(0.5)
    .strokeColor(borderColor)
    .moveTo(60, footerY)
    .lineTo(552, footerY)
    .stroke();

  // --- Bloc gauche (texte) : limité à 380 px pour ne pas chevaucher le QR ---
  const footerTextWidth = 380;
  doc
    .fontSize(8)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(
      "Merci de votre confiance. Cette facture a été générée automatiquement par Séjoura.",
      60,
      footerY + 8,
      { width: footerTextWidth, align: "left" }
    );

  doc
    .fontSize(7)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(
      `Facture N° ${invoice.invoice_number} • Générée le ${formatDateLong(invoice.created_at)}`,
      60,
      footerY + 22,
      { width: footerTextWidth, align: "left" }
    );

  // --- Bloc droit : QR Code de téléchargement (si token dispo) ---
  if (downloadUrl) {
    try {
      const qrPng = await QRCode.toBuffer(downloadUrl, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 160, // pixels ; pdfkit scale au fit ci-dessous
        color: { dark: "#0C1C33", light: "#FFFFFF" },
      });
      const qrSize = 48;
      const qrX = 612 - 60 - qrSize; // bord droit intérieur (marge 60)
      const qrY = footerY + (footerHeight - qrSize) / 2;
      doc.image(qrPng, qrX, qrY, { fit: [qrSize, qrSize] });

      // Mention sous le QR Code
      doc
        .fontSize(6.5)
        .fillColor(mutedColor)
        .font("Helvetica")
        .text(
          "Scannez ce QR Code pour télécharger l'exemplaire original",
          qrX - 4,
          qrY + qrSize + 2,
          { width: qrSize + 8, align: "center", lineBreak: false }
        );
    } catch (err) {
      // Échec silencieux : la facture reste valide sans QR Code plutôt que
      // d'empêcher la génération (compatibilité ascendante).
      console.error("QR code generation failed:", err);
    }
  }

  doc.end();

  return streamPromise;
}

export function generateInvoiceNumber(tenantId: string, seq: number): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const num = String(seq).padStart(4, "0");
  return `FAC/${year}${month}/${num}`;
}
