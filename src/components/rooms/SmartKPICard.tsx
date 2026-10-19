"use client";

import { ArrowUpRight, ArrowDownRight, MinusCircle, AlertTriangle } from "lucide-react";

interface SmartKPICardProps {
  title: string;
  value: number;
  total: number;
  icon: React.ElementType;
  color: "blue" | "emerald" | "red" | "amber";
  trend: { arrow: "up" | "down" | "stable"; delta: number; label: string };
  alert: { level: "warning" | "critical"; message: string } | null;
  insight: string;
  lang: "fr" | "en";
}

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-600 dark:text-blue-400", border: "border-blue-100 dark:border-blue-900/30" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-900/30" },
  red: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400", border: "border-red-100 dark:border-red-900/30" },
  amber: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", border: "border-amber-100 dark:border-amber-900/30" },
};

const TREND_CLASSES: Record<string, { icon: React.ElementType; color: string }> = {
  up: { icon: ArrowUpRight, color: "text-emerald-600 dark:text-emerald-400" },
  down: { icon: ArrowDownRight, color: "text-red-600 dark:text-red-400" },
  stable: { icon: MinusCircle, color: "text-slate-400 dark:text-slate-500" },
};

const ALERT_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  warning: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-100 dark:border-amber-900/30" },
  critical: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400", border: "border-red-100 dark:border-red-900/30" },
};

export function SmartKPICard({
  title,
  value,
  total,
  icon: Icon,
  color,
  trend,
  alert,
  insight,
  lang,
}: SmartKPICardProps) {
  const colorCls = COLOR_CLASSES[color];
  const trendCls = TREND_CLASSES[trend.arrow];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="p-5 rounded-2xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] shadow-sm hover:shadow-md transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorCls.bg} ${colorCls.border}`}>
          <Icon className="w-5 h-5" style={{ color: "currentColor" }} />
        </div>
        {alert && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{
            backgroundColor: alert.level === "critical" ? "#ef4444" : "#f59e0b",
          }}>
            <AlertTriangle className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Title */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        <span
          className={`text-xs font-semibold ${trendCls.color} flex items-center gap-1`}
        >
          <trendCls.icon className="w-3 h-3" />
          {trend.label}
        </span>
      </div>

      {/* Value + % */}
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">{value}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">/{total}</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5 mb-3 overflow-hidden">
        <div
          className={`h-full ${colorCls.text} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Alert badge */}
      {alert && (
        <div
          className={`px-2 py-1 rounded-md text-xs font-bold border ${ALERT_CLASSES[alert.level].bg} ${ALERT_CLASSES[alert.level].text} ${ALERT_CLASSES[alert.level].border} mb-3`}
        >
          {alert.message}
        </div>
      )}

      {/* Insight */}
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic">
        {insight}
      </p>
    </div>
  );
}