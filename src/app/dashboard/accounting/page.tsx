"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, formatDate, getExpenseCategoryLabel } from "@/lib/utils";
import { Wallet, Plus, Loader2, TrendingUp, TrendingDown, ScrollText, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { Expense, AuditLog, Payment } from "@/types/database";

export default function AccountingPage() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "expenses" | "revenue" | "audit">("overview");
  const [userId, setUserId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expenseSort, setExpenseSort] = useState<{ key: "date" | "amount"; direction: "asc" | "desc" } | null>(null);
  const [revenueSort, setRevenueSort] = useState<{ key: "date" | "amount"; direction: "asc" | "desc" } | null>(null);
  
  const [formData, setFormData] = useState({
    category: "utilities",
    description: "",
    amount: "",
    expense_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setUserId(userData.id);
      setTenantId(userData.tenant_id);

      const { data: expData } = await supabase
        .from("expenses")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("expense_date", { ascending: false })
        .limit(50);
      if (expData) setExpenses(expData as unknown as Expense[]);

      const { data: payData } = await supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("payment_date", { ascending: false })
        .limit(50);
      if (payData) setPayments(payData as unknown as Payment[]);

      const { data: logData } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (logData) setAuditLogs(logData as unknown as AuditLog[]);
} catch (err) {
       toast.error("Impossible de charger les données. Veuillez réessayer.");
       console.error(err);
     } finally {
       setLoading(false);
     }
   }

   async function handleSave() {
    if (!formData.description || !formData.amount) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.from("expenses").insert({
        tenant_id: tenantId,
        category: formData.category,
        description: formData.description,
        amount: parseInt(formData.amount),
        expense_date: formData.expense_date,
        created_by: userId,
      });
      setModalOpen(false);
       setFormData({ category: "utilities", description: "", amount: "", expense_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0] });
      loadData();
    } catch (err) {
      toast.error("Impossible d'enregistrer les modifications.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredExpenses = expenses.filter((e) => {
    if (startDate && e.expense_date < startDate) return false;
    if (endDate && e.expense_date > endDate) return false;
    return true;
  }).sort((a, b) => {
    if (!expenseSort) return 0;
    const aVal = expenseSort.key === "date" ? a.expense_date : a.amount;
    const bVal = expenseSort.key === "date" ? b.expense_date : b.amount;
    if (aVal < bVal) return expenseSort.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return expenseSort.direction === "asc" ? 1 : -1;
    return 0;
  });

  const filteredPayments = payments.filter((p) => {
    if (startDate && p.payment_date < startDate) return false;
    if (endDate && p.payment_date > endDate) return false;
    return true;
  }).sort((a, b) => {
    if (!revenueSort) return 0;
    const aVal = revenueSort.key === "date" ? a.payment_date : a.amount;
    const bVal = revenueSort.key === "date" ? b.payment_date : b.amount;
    if (aVal < bVal) return revenueSort.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return revenueSort.direction === "asc" ? 1 : -1;
    return 0;
  });

  const totalRevenue = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  function exportExpensesCSV() {
    if (filteredExpenses.length === 0) return;
    const headers = ["Date", "Catégorie", "Description", "Montant"];
    const rows = filteredExpenses.map(e => [
      e.expense_date,
      getExpenseCategoryLabel(e.category),
      e.description,
      e.amount
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `depenses_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export CSV réussi");
  }

  function exportRevenueCSV() {
    if (filteredPayments.length === 0) return;
    const headers = ["Date", "Référence", "Méthode", "Montant"];
    const rows = filteredPayments.map(p => [
      p.payment_date,
      p.reference || "",
      p.payment_method,
      p.amount
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `recettes_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export CSV réussi");
  }

  if (loading && expenses.length === 0 && payments.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Comptabilité</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Dépenses, recettes et traçabilité</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2">
            <span className="text-xs text-slate-500">Du</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white outline-none w-28"
            />
            <span className="text-xs text-slate-500">au</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white outline-none w-28"
            />
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" /> Nouvelle dépense
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total recettes</p>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatFCFA(totalRevenue)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total dépenses</p>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatFCFA(totalExpenses)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Bénéfice net</p>
          </div>
          <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatFCFA(netProfit)}
          </p>
        </Card>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl w-fit">
        {[
          { key: "overview", label: "Vue d'ensemble", icon: Wallet },
          { key: "expenses", label: "Dépenses", icon: TrendingDown },
          { key: "revenue", label: "Recettes", icon: TrendingUp },
          { key: "audit", label: "Journal d'audit", icon: ScrollText },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Vue d'ensemble */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Dernières dépenses</h2>
            {filteredExpenses.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Aucune dépense enregistrée</p>
            ) : (
              <div className="space-y-3">
                {filteredExpenses.slice(0, 5).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{exp.description}</p>
                      <p className="text-xs text-slate-400">{getExpenseCategoryLabel(exp.category)} • {formatDate(exp.expense_date)}</p>
                    </div>
                    <p className="text-sm font-bold text-red-600">{formatFCFA(exp.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Dernières recettes</h2>
            {filteredPayments.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Aucune recette enregistrée</p>
            ) : (
              <div className="space-y-3">
                {filteredPayments.slice(0, 5).map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Paiement</p>
                      <p className="text-xs text-slate-400">{formatDate(pay.payment_date)} • {pay.reference || "—"}</p>
                    </div>
                    <p className="text-sm font-bold text-green-600">{formatFCFA(pay.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Dépenses */}
      {activeTab === "expenses" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-end bg-white dark:bg-slate-800">
            <Button variant="outline" size="sm" onClick={exportExpensesCSV} className="gap-2" disabled={filteredExpenses.length === 0}>
              <Download className="w-4 h-4" /> Exporter CSV
            </Button>
          </div>
          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingDown className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Aucune dépense</p>
              <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Ajouter</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Description</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Catégorie</th>
                    <th 
                      className="text-left p-4 text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      onClick={() => setExpenseSort({ key: "date", direction: expenseSort?.key === "date" && expenseSort.direction === "asc" ? "desc" : "asc" })}
                    >
                      Date
                      {expenseSort?.key === "date" ? (expenseSort.direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline-block text-indigo-600" /> : <ArrowDown className="w-3 h-3 ml-1 inline-block text-indigo-600" />) : <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-30" />}
                    </th>
                    <th 
                      className="text-right p-4 text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      onClick={() => setExpenseSort({ key: "amount", direction: expenseSort?.key === "amount" && expenseSort.direction === "asc" ? "desc" : "asc" })}
                    >
                      Montant
                      {expenseSort?.key === "amount" ? (expenseSort.direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline-block text-indigo-600" /> : <ArrowDown className="w-3 h-3 ml-1 inline-block text-indigo-600" />) : <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-30" />}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-4 text-sm font-medium text-slate-900 dark:text-white">{exp.description}</td>
                      <td className="p-4"><Badge variant="default">{getExpenseCategoryLabel(exp.category)}</Badge></td>
                      <td className="p-4 text-sm text-slate-500">{formatDate(exp.expense_date)}</td>
                      <td className="p-4 text-right text-sm font-bold text-red-600">{formatFCFA(exp.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Recettes */}
      {activeTab === "revenue" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-end bg-white dark:bg-slate-800">
            <Button variant="outline" size="sm" onClick={exportRevenueCSV} className="gap-2" disabled={filteredPayments.length === 0}>
              <Download className="w-4 h-4" /> Exporter CSV
            </Button>
          </div>
          {filteredPayments.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingUp className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Aucune recette enregistrée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th 
                      className="text-left p-4 text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      onClick={() => setRevenueSort({ key: "date", direction: revenueSort?.key === "date" && revenueSort.direction === "asc" ? "desc" : "asc" })}
                    >
                      Date
                      {revenueSort?.key === "date" ? (revenueSort.direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline-block text-indigo-600" /> : <ArrowDown className="w-3 h-3 ml-1 inline-block text-indigo-600" />) : <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-30" />}
                    </th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Référence</th>
                    <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Méthode</th>
                    <th 
                      className="text-right p-4 text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      onClick={() => setRevenueSort({ key: "amount", direction: revenueSort?.key === "amount" && revenueSort.direction === "asc" ? "desc" : "asc" })}
                    >
                      Montant
                      {revenueSort?.key === "amount" ? (revenueSort.direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline-block text-indigo-600" /> : <ArrowDown className="w-3 h-3 ml-1 inline-block text-indigo-600" />) : <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-30" />}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filteredPayments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-4 text-sm text-slate-700 dark:text-slate-300">{formatDate(pay.payment_date)}</td>
                      <td className="p-4 text-sm text-slate-500">{pay.reference || "—"}</td>
                      <td className="p-4 text-sm text-slate-500 capitalize">{pay.payment_method}</td>
                      <td className="p-4 text-right text-sm font-bold text-green-600">{formatFCFA(pay.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Journal d'audit */}
      {activeTab === "audit" && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Journal d'audit</h2>
          {auditLogs.length === 0 ? (
            <div className="text-center py-8">
              <ScrollText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Aucune action enregistrée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                    <ScrollText className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{log.action}</p>
                    <p className="text-xs text-slate-400">
                      {log.entity_type} #{log.entity_id?.substring(0, 8)} • {formatDate(log.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modal dépense */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle dépense">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Catégorie</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {["salaries", "utilities", "maintenance", "supplies", "marketing", "rent", "taxes", "other"].map((cat) => (
                <option key={cat} value={cat}>{getExpenseCategoryLabel(cat)}</option>
              ))}
            </select>
          </div>
          <Input label="Description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Achat de produits d'entretien" />
          <Input label="Montant (FCFA)" type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="5000" />
          <Input label="Date" type="date" value={formData.expense_date} onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={loading}>Enregistrer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}