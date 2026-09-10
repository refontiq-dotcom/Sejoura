"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getExpenseCategoryLabel } from "@/lib/utils";

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  salaries: "#0C1C33",
  utilities: "#3b82f6",
  maintenance: "#f59e0b",
  supplies: "#10b981",
  marketing: "#8b5cf6",
  rent: "#c2944e",
  taxes: "#ef4444",
  other: "#64748b",
};

function compactAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1000) return (n / 1000).toFixed(0).replace(/\.0$/, "") + "k";
  return String(n);
}

export function DailyCashFlowChart({
  data,
  fmt,
}: {
  data: { date: string; label: string; entrées: number; sorties: number }[];
  fmt: (amount: number) => string;
}) {
  const hasData = data.some((d) => d.entrées > 0 || d.sorties > 0);
  if (!hasData) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-[var(--foreground-subtle)]">
        Aucune donnée sur la période
      </div>
    );
  }
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={compactAmount}
          />
          <Tooltip
            formatter={(value, name) => [fmt(Number(value)), String(name)]}
            labelFormatter={(label) => `Jour du ${String(label)}`}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #3f3f46",
              backgroundColor: "#18181b",
              fontSize: 12,
              color: "#f4f4f5",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
          />
          <Line
            type="monotone"
            dataKey="entrées"
            name="Entrées (Recettes)"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={{ r: 2.5, strokeWidth: 0, fill: "#22c55e" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="sorties"
            name="Sorties (Dépenses)"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={{ r: 2.5, strokeWidth: 0, fill: "#ef4444" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryPie({
  items,
  fmt,
}: {
  items: { category: string; amount: number }[];
  fmt: (amount: number) => string;
}) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const sorted = [...items].sort((a, b) => b.amount - a.amount).filter((i) => i.amount > 0);

  if (sorted.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--foreground-subtle)]">
        Aucune dépense sur la période
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-44 h-44 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sorted}
              dataKey="amount"
              nameKey="category"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={3}
              stroke="none"
            >
              {sorted.map((entry) => (
                <Cell key={entry.category} fill={EXPENSE_CATEGORY_COLORS[entry.category] || "#64748b"} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [fmt(Number(value)), getExpenseCategoryLabel(String(name))]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #3f3f46",
                backgroundColor: "#18181b",
                fontSize: 12,
                color: "#f4f4f5",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg font-bold text-white">{fmt(total)}</p>
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)]">Total</p>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {sorted.map((it) => {
          const pct = total > 0 ? (it.amount / total) * 100 : 0;
          const color = EXPENSE_CATEGORY_COLORS[it.category] || "#64748b";
          return (
            <div key={it.category} className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-[var(--foreground-muted)] flex-1 truncate">
                {getExpenseCategoryLabel(it.category)}
              </span>
              <span className="text-xs font-semibold text-white">{fmt(it.amount)}</span>
              <span className="text-[10px] text-[var(--foreground-subtle)] w-9 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
