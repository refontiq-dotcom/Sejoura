import PDFDocument from "pdfkit";
import { formatPrice } from "@/lib/currencyConverter";
import { getExpenseCategoryLabel, getPaymentMethodLabel, getMobileMoneyOperatorLabel, formatDate } from "@/lib/utils";

export interface FinancialReportData {
  tenant: {
    company_name: string;
    address?: string | null;
    city?: string | null;
    contact_phone?: string | null;
    logo_url?: string | null;
  };
  start: string;
  end: string;
  currencyCode: string;
  revenueByMethod: { method: string; amount: number }[];
  mobileMoneyByOperator?: { operator: string; amount: number }[];
  totalRevenue: number;
  cashOut: number;
  expensesByCategory: { category: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
  margin: number;
  paymentCount: number;
  expenseCount: number;
}

const PAGE_WIDTH = 612;
const MARGIN = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export async function generateFinancialReportPdf(data: FinancialReportData): Promise<Buffer> {
  const { tenant, start, end, currencyCode } = data;
  const fmt = (amountInXof: number) => formatPrice(amountInXof, currencyCode);

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    lang: "fr-FR",
    info: {
      Title: "Rapport financier",
      Author: "Séjoura",
      Subject: "Rapport financier comptabilité",
      Keywords: "rapport, financier, comptabilité, recettes, dépenses",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const streamPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const primaryColor = "#0C1C33";
  const accentGold = "#C2944E";
  const textColor = "#0C1C33";
  const mutedColor = "#64748B";
  const borderColor = "#E2E8F0";
  const greenColor = "#16A34A";
  const redColor = "#DC2626";

  // Cadre de la page
  doc.save().rect(28, 28, 555, 746).stroke(borderColor).lineWidth(0.5);
  doc.restore();

  // --- EN-TÊTE ---
  const headerHeight = 110;
  doc.rect(0, 0, PAGE_WIDTH, headerHeight).fill(primaryColor);

  let textLeft = MARGIN;
  if (tenant.logo_url && tenant.logo_url.startsWith("http")) {
    try {
      const res = await fetch(tenant.logo_url);
      if (res.ok) {
        const logoBuffer = Buffer.from(await res.arrayBuffer());
        doc.image(logoBuffer, 40, 25, { fit: [55, 55] });
        textLeft = 110;
      }
    } catch {
      // Fallback silencieux
    }
  }

  doc
    .fontSize(18)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text(tenant.company_name || "Séjoura", textLeft, 28);

  doc
    .fontSize(9)
    .fillColor(accentGold)
    .font("Helvetica-Bold")
    .text("Séjoura SaaS", textLeft, 50);

  doc
    .fontSize(8)
    .fillColor("#E2E8F0")
    .font("Helvetica")
    .text(tenant.address || "", textLeft, 62)
    .text(`${tenant.city || ""} • Tél: ${tenant.contact_phone || ""}`, textLeft, 72);

  doc.stroke(accentGold).moveTo(0, headerHeight).lineTo(PAGE_WIDTH, headerHeight).lineWidth(2);

  doc
    .fontSize(24)
    .fillColor(accentGold)
    .font("Helvetica-Bold")
    .text("RAPPORT FINANCIER", 370, 26, { align: "right" });

  doc
    .fontSize(10)
    .fillColor("#FFFFFF")
    .font("Helvetica")
    .text(`Période: ${formatDate(start)} au ${formatDate(end)}`, 370, 56, { align: "right" });

  doc
    .fontSize(8)
    .fillColor("#E2E8F0")
    .font("Helvetica")
    .text(`Généré le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`, 370, 74, { align: "right" });

  // --- SYNTHÈSE ---
  let y = 145;
  doc
    .fontSize(11)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text("SYNTHÈSE DE LA PÉRIODE", MARGIN, y);

  y += 14;

  const boxW = (CONTENT_WIDTH - 20) / 3;
  const boxH = 64;
  const boxes = [
    { label: "RECETTES", value: fmt(data.totalRevenue), color: greenColor },
    { label: "DÉPENSES TOTALES", value: fmt(data.totalExpenses + data.cashOut), color: redColor },
    { label: "BÉNÉFICE NET", value: fmt(data.netProfit), color: primaryColor },
  ];

  boxes.forEach((box, i) => {
    const bx = MARGIN + i * (boxW + 10);
    doc.rect(bx, y, boxW, boxH).fill("#F8FAFC");
    doc.stroke(borderColor).moveTo(bx, y).lineTo(bx + boxW, y).lineWidth(0.5);
    doc
      .fontSize(7.5)
      .fillColor(mutedColor)
      .font("Helvetica-Bold")
      .text(box.label, bx + 12, y + 10);
    doc
      .fontSize(14)
      .fillColor(box.color)
      .font("Helvetica-Bold")
      .text(box.value, bx + 12, y + 28, { width: boxW - 24 });
  });

  y += boxH + 10;

  // Ligne d'info
  doc
    .fontSize(8.5)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(
      `${data.paymentCount} paiement(s) • ${data.expenseCount} dépense(s) • Marge nette: ${data.margin.toFixed(1)}%`,
      MARGIN,
      y
    );

  y += 24;

  // --- RECETTES PAR MODE DE PAIEMENT ---
  doc
    .fontSize(11)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text("RECETTES PAR MODE DE PAIEMENT", MARGIN, y);

  y += 14;

  const tableLeft = MARGIN;
  const tableWidth = CONTENT_WIDTH;
  const labelCol = tableWidth - 140;
  const amountCol = 140;
  const rowH = 18;

  // Header
  doc.rect(tableLeft, y, tableWidth, 20).fill("#0C1C33");
  doc
    .fontSize(9)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text("Mode de paiement", tableLeft + 10, y + 5)
    .text("Montant", tableLeft + labelCol + 10, y + 5, { align: "right", width: amountCol - 20 });

  y += 20;

  const methodRows = data.revenueByMethod.length > 0 ? data.revenueByMethod : [];

  methodRows.forEach((r, i) => {
    if (i % 2 === 0) {
      doc.rect(tableLeft, y, tableWidth, rowH).fill("#F8FAFC");
    }
    doc
      .fontSize(9)
      .fillColor(textColor)
      .font("Helvetica")
      .text(getPaymentMethodLabel(r.method), tableLeft + 10, y + 4)
      .text(fmt(r.amount), tableLeft + labelCol + 10, y + 4, { align: "right", width: amountCol - 20 });
    y += rowH;
  });

  // Total recettes
  doc.stroke(borderColor).moveTo(tableLeft, y).lineTo(tableLeft + tableWidth, y).lineWidth(0.5);
  y += 6;
  doc
    .fontSize(9.5)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text("Total recettes", tableLeft + 10, y)
    .text(fmt(data.totalRevenue), tableLeft + labelCol + 10, y, { align: "right", width: amountCol - 20 });
  y += 14;

  // Détail Mobile Money par opérateur (rapprochement de trésorerie)
  const operatorRows = data.mobileMoneyByOperator ?? [];
  if (operatorRows.length > 0) {
    doc
      .fontSize(8)
      .fillColor(textColor)
      .font("Helvetica-Bold")
      .text("Dont Mobile Money par opérateur", tableLeft + 10, y);
    y += 12;
    operatorRows.forEach((r) => {
      doc
        .fontSize(8.5)
        .fillColor(textColor)
        .font("Helvetica")
        .text(`· ${getMobileMoneyOperatorLabel(r.operator)}`, tableLeft + 16, y)
        .text(fmt(r.amount), tableLeft + labelCol + 10, y, { align: "right", width: amountCol - 20 });
      y += 12;
    });
  }
  y += 8;

  // --- DÉPENSES PAR CATÉGORIE ---
  doc
    .fontSize(11)
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .text("DÉPENSES PAR CATÉGORIE", MARGIN, y);

  y += 14;

  doc.rect(tableLeft, y, tableWidth, 20).fill("#0C1C33");
  doc
    .fontSize(9)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text("Catégorie", tableLeft + 10, y + 5)
    .text("Part", tableLeft + labelCol - 90, y + 5)
    .text("Montant", tableLeft + labelCol + 10, y + 5, { align: "right", width: amountCol - 20 });

  y += 20;

  const sortedCategories = [...data.expensesByCategory].sort((a, b) => b.amount - a.amount);
  const expenseTotal = data.totalExpenses || 1;

  sortedCategories.forEach((c, i) => {
    if (i % 2 === 0) {
      doc.rect(tableLeft, y, tableWidth, rowH).fill("#F8FAFC");
    }
    doc
      .fontSize(9)
      .fillColor(textColor)
      .font("Helvetica")
      .text(getExpenseCategoryLabel(c.category), tableLeft + 10, y + 4)
      .text(`${((c.amount / expenseTotal) * 100).toFixed(0)}%`, tableLeft + labelCol - 90, y + 4)
      .text(fmt(c.amount), tableLeft + labelCol + 10, y + 4, { align: "right", width: amountCol - 20 });
    y += rowH;
  });

  // Sorties de caisse manuelles (si présentes)
  if (data.cashOut > 0) {
    doc
      .fontSize(9)
      .fillColor(mutedColor)
      .font("Helvetica")
      .text("Sorties de caisse manuelles", tableLeft + 10, y + 4)
      .text(fmt(data.cashOut), tableLeft + labelCol + 10, y + 4, { align: "right", width: amountCol - 20 });
    y += rowH;
  }

  doc.stroke(borderColor).moveTo(tableLeft, y).lineTo(tableLeft + tableWidth, y).lineWidth(0.5);
  y += 6;
  doc
    .fontSize(9.5)
    .fillColor(redColor)
    .font("Helvetica-Bold")
    .text("Total dépenses", tableLeft + 10, y)
    .text(fmt(data.totalExpenses + data.cashOut), tableLeft + labelCol + 10, y, { align: "right", width: amountCol - 20 });
  y += 26;

  // --- RÉSULTAT NET ---
  doc.rect(MARGIN, y, tableWidth, 40).fill("#0C1C33");
  doc
    .fontSize(11)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text("BÉNÉFICE NET", MARGIN + 14, y + 12)
    .text(fmt(data.netProfit), MARGIN + 14 + 150, y + 12, { align: "right", width: tableWidth - 178 });

  y += 60;

  // --- PIED DE PAGE ---
  doc
    .fontSize(8)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(
      "Ce rapport a été généré automatiquement par Séjoura. Il reflète les recettes, les dépenses et les sorties de caisse enregistrées sur la période.",
      MARGIN,
      700,
      { align: "center" }
    );
  doc
    .fontSize(7)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(
      `Séjoura SaaS • Rapport financier ${formatDate(start)} au ${formatDate(end)}`,
      MARGIN,
      716,
      { align: "center" }
    );

  doc.end();

  return streamPromise;
}
