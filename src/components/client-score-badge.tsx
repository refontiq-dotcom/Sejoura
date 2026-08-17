"use client";

import Link from "next/link";
import { type ClientScoreTier } from "@/types/database";

const TIER_META: Record<ClientScoreTier, { label: string; className: string }> = {
  excellent: { label: "Excellent", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
  bon: { label: "Bon", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200" },
  moyen: { label: "Moyen", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" },
  a_surveiller: { label: "À surveiller", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200" },
  mauvais: { label: "Mauvais", className: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200" },
};

interface ClientScoreBadgeProps {
  score?: number | null;
  tier?: ClientScoreTier | null;
  clientId?: string;
  showValue?: boolean;
  className?: string;
}

/**
 * Badge de score client (0-100 + libellé). Cliquable : mène à la fiche
 * intelligente du client si `clientId` est fourni.
 */
export function ClientScoreBadge({
  score,
  tier,
  clientId,
  showValue = true,
  className = "",
}: ClientScoreBadgeProps) {
  if (score == null || !tier) {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-px rounded-full text-[11px] font-semibold border border-[var(--border-strong)] text-[var(--foreground-muted)] ${className}`}
      >
        Pas de score
      </span>
    );
  }

  const meta = TIER_META[tier] ?? TIER_META.moyen;
  const inner = (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-semibold ${meta.className} ${className}`}
      title={`Score client : ${score}/100 (${meta.label})`}
    >
      <span className="tabular-nums">{score}</span>
      {showValue && <span>/100</span>}
      <span className="opacity-75">·</span>
      <span>{meta.label}</span>
    </span>
  );

  if (clientId) {
    return (
      <Link href={`/dashboard/clients/${clientId}`} onClick={(e) => e.stopPropagation()} className="hover:opacity-80 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}
