import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_AUDIT_SELECT,
  ACCOUNTING_CLIENT_SELECT,
  ACCOUNTING_EXPENSE_SELECT,
  ACCOUNTING_INVOICE_SELECT,
  ACCOUNTING_PAYMENT_SELECT,
} from "../src/lib/accounting-query";

function rejectsStar(select: string) {
  expect(select).not.toMatch(/(^|[,\s])\*([,\s]|$)/);
}

describe("accounting-query", () => {
  it("n'utilise pas select * sur les listes chaudes", () => {
    rejectsStar(ACCOUNTING_EXPENSE_SELECT);
    rejectsStar(ACCOUNTING_PAYMENT_SELECT);
    rejectsStar(ACCOUNTING_AUDIT_SELECT);
    rejectsStar(ACCOUNTING_INVOICE_SELECT);
    rejectsStar(ACCOUNTING_CLIENT_SELECT);
  });

  it("garde les colonnes necessaires aux filtres et graphiques", () => {
    expect(ACCOUNTING_EXPENSE_SELECT).toContain("expense_date");
    expect(ACCOUNTING_EXPENSE_SELECT).toContain("accommodation_id");
    expect(ACCOUNTING_PAYMENT_SELECT).toContain("payment_date");
    expect(ACCOUNTING_PAYMENT_SELECT).toContain("operation_type");
    expect(ACCOUNTING_PAYMENT_SELECT).toContain("mobile_money_operator");
    expect(ACCOUNTING_INVOICE_SELECT).toContain("invoice_number");
    expect(ACCOUNTING_AUDIT_SELECT).toContain("old_values");
    expect(ACCOUNTING_CLIENT_SELECT).toContain("bookings(");
  });
});
