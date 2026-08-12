import { describe, it, expect } from "vitest";
import { generateFinancialReportPdf } from "@/lib/accounting-report-pdf";

const mockData = {
  tenant: {
    company_name: "Résidence Test",
    address: "Cocody",
    city: "Abidjan",
    contact_phone: "+2250102030405",
    logo_url: null,
  },
  start: "2026-08-01",
  end: "2026-08-12",
  currencyCode: "XOF",
  revenueByMethod: [
    { method: "wave", amount: 50000 },
    { method: "pi_spi", amount: 20000 },
    { method: "cash", amount: 9000 },
  ],
  totalRevenue: 79000,
  cashOut: 2000,
  expensesByCategory: [
    { category: "utilities", amount: 15000 },
    { category: "salaries", amount: 10000 },
    { category: "maintenance", amount: 5000 },
  ],
  totalExpenses: 30000,
  netProfit: 47000,
  margin: 59.5,
  paymentCount: 4,
  expenseCount: 3,
};

describe("generateFinancialReportPdf", () => {
  it("produit un buffer PDF valide avec les données fournies", async () => {
    const buffer = await generateFinancialReportPdf(mockData as never);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);

    const header = buffer.subarray(0, 5).toString("latin1");
    expect(header).toBe("%PDF-");

    const footer = buffer.subarray(buffer.length - 6).toString("latin1");
    expect(footer).toContain("%%EOF");
  });

  it("gère un rapport sans dépenses", async () => {
    const empty = {
      ...mockData,
      revenueByMethod: [{ method: "cash", amount: 5000 }],
      totalRevenue: 5000,
      cashOut: 0,
      expensesByCategory: [],
      totalExpenses: 0,
      netProfit: 5000,
      margin: 100,
      paymentCount: 1,
      expenseCount: 0,
    };
    const buffer = await generateFinancialReportPdf(empty as never);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
