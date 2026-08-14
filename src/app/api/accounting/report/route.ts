import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateFinancialReportPdf } from "@/lib/accounting-report-pdf";
import type { Expense, Payment, Tenant } from "@/types/database";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const start = typeof body.start === "string" ? body.start : "";
    const end = typeof body.end === "string" ? body.end : "";

    if (!start || !end) {
      return NextResponse.json(
        { error: "La période (start/end) est requise." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Vous devez être connecté pour générer le rapport." },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, tenant_id")
      .eq("auth_user_id", session.user.id)
      .single();

    if (userError || !userData?.tenant_id) {
      return NextResponse.json(
        { error: "Impossible de retrouver votre compte." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const tid = userData.tenant_id;

    const [paymentsRes, expensesRes, tenantRes] = await Promise.all([
      admin
        .from("payments")
        .select("payment_date, amount, payment_method, mobile_money_operator, operation_type")
        .eq("tenant_id", tid)
        .gte("payment_date", `${start}T00:00:00`)
        .lte("payment_date", `${end}T23:59:59.999Z`),
      admin
        .from("expenses")
        .select("expense_date, amount, category")
        .eq("tenant_id", tid)
        .gte("expense_date", start)
        .lte("expense_date", end),
      admin
        .from("tenants")
        .select("company_name, address, city, contact_phone, logo_url, default_currency, default_currency_symbol")
        .eq("id", tid)
        .single(),
    ]);

    if (tenantRes.error || !tenantRes.data) {
      return NextResponse.json(
        { error: "Impossible de récupérer les informations de l'entreprise." },
        { status: 400 }
      );
    }

    const payments = (paymentsRes.data as Payment[] | null) || [];
    const expenses = (expensesRes.data as Expense[] | null) || [];

    const revenueByMethodMap: Record<string, number> = {};
    const mobileMoneyByOperatorMap: Record<string, number> = {};
    let totalRevenue = 0;
    let cashOut = 0;

    payments.forEach((p) => {
      if (p.amount > 0) {
        totalRevenue += p.amount;
        revenueByMethodMap[p.payment_method] = (revenueByMethodMap[p.payment_method] || 0) + p.amount;
        if (p.payment_method === "mobile_money") {
          const op = p.mobile_money_operator || "mobile_money";
          mobileMoneyByOperatorMap[op] = (mobileMoneyByOperatorMap[op] || 0) + p.amount;
        }
      } else {
        cashOut += Math.abs(p.amount);
      }
    });

    const expensesByCategoryMap: Record<string, number> = {};
    let totalExpenses = 0;
    expenses.forEach((e) => {
      totalExpenses += e.amount;
      expensesByCategoryMap[e.category] = (expensesByCategoryMap[e.category] || 0) + e.amount;
    });

    const netProfit = totalRevenue - totalExpenses - cashOut;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const currencyCode = (tenantRes.data.default_currency || "XOF") as string;

    const pdfBuffer = await generateFinancialReportPdf({
      tenant: tenantRes.data as unknown as Tenant,
      start,
      end,
      currencyCode,
      revenueByMethod: Object.entries(revenueByMethodMap).map(([method, amount]) => ({ method, amount })),
      mobileMoneyByOperator: Object.entries(mobileMoneyByOperatorMap).map(([operator, amount]) => ({ operator, amount })),
      totalRevenue,
      cashOut,
      expensesByCategory: Object.entries(expensesByCategoryMap).map(([category, amount]) => ({ category, amount })),
      totalExpenses,
      netProfit,
      margin,
      paymentCount: payments.length,
      expenseCount: expenses.length,
    });

    const fileName = `rapport-financier_${start}_${end}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("accounting report error:", err);
    const detail = (err as Error)?.message ? `: ${(err as Error).message}` : ".";
    return NextResponse.json(
      { error: `Une erreur est survenue lors de la génération du rapport${detail}` },
      { status: 500 }
    );
  }
}
