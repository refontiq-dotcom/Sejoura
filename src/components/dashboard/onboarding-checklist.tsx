"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BedDouble,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  UserPlus,
  X,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import type { OnboardingStep } from "@/types/database";

// ============================================================================
// OnboardingChecklist — Checklist de démarrage flottante et rétractable
// ============================================================================
//
// Position : coin bas-droite du dashboard (fixed), au-dessus du contenu.
// Comportement :
//   • Barre de progression + ratio "X / 4 étapes complétées".
//   • Chaque étape : cliquable → navigation vers la page cible + trackStep.
//   • Étape complétée : coche verte.
//   • Réduire / agrandir, et masquer définitivement (dismiss persistant).
// ============================================================================

interface ChecklistItem {
  step: OnboardingStep;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    step: "workspace_configured",
    icon: BedDouble,
    route: "/dashboard/settings",
  },
  {
    step: "first_booking_created",
    icon: CalendarCheck,
    route: "/dashboard/bookings",
  },
  {
    step: "employee_invited",
    icon: UserPlus,
    route: "/dashboard/employees",
  },
  {
    step: "advanced_explored",
    icon: Eye,
    route: "/dashboard/trouvetou",
  },
];

interface OnboardingChecklistProps {
  open: boolean;
  completedSteps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  progress: number; // 0 → 1
  onStepClick: (step: OnboardingStep) => void;
  onDismiss: () => void;
}

export function OnboardingChecklist({
  open,
  completedSteps,
  completedCount,
  totalCount,
  progress,
  onStepClick,
  onDismiss,
}: OnboardingChecklistProps) {
  const { lang } = useLanguage();
  const t = translations[lang].onboardingChecklist;
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);

  if (!open) return null;

  const percent = Math.round(progress * 100);
  const isAllDone = completedCount >= totalCount;

  function handleStepClick(item: ChecklistItem) {
    const alreadyDone = completedSteps.includes(item.step);
    if (!alreadyDone) {
      // Optimistic UI : la coche verte apparaît immédiatement.
      onStepClick(item.step);
    }
    router.push(item.route);
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-xs print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="rounded-2xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.15))] overflow-hidden">
        {/* En-tête cliquable (réduire / agrandir) */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2.5 p-3 bg-[var(--primary-color,#0C1C33)] text-white text-left"
          aria-expanded={expanded}
        >
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold tracking-tight">{t.title}</span>
            <span className="block text-[10px] text-white/70 mt-0.5">
              {t.progress.replace("{done}", String(completedCount)).replace("{total}", String(totalCount))}
            </span>
          </span>
          <span className="text-[11px] font-bold tabular-nums bg-white/15 rounded-full px-2 py-0.5">
            {percent}%
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-white/80" />
          ) : (
            <ChevronUp className="w-4 h-4 text-white/80" />
          )}
        </button>

        {/* Barre de progression */}
        <div className="h-1 w-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full transition-all duration-500 ${isAllDone ? "bg-emerald-500" : "bg-emerald-400"}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Corps */}
        {expanded && (
          <div className="p-2">
            <ul className="space-y-1">
              {CHECKLIST_ITEMS.map((item) => {
                const done = completedSteps.includes(item.step);
                const Icon = item.icon;
                return (
                  <li key={item.step}>
                    <button
                      type="button"
                      onClick={() => handleStepClick(item)}
                      disabled={done}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors ${
                        done
                          ? "cursor-default"
                          : "hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]"
                      }`}
                    >
                      {/* Coche / cercle */}
                      <span
                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                          done
                            ? "bg-emerald-500 text-white"
                            : "border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-400"
                        }`}
                      >
                        {done ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Circle className="w-2 h-2" />
                        )}
                      </span>

                      {/* Libellé */}
                      <span className="flex-1 min-w-0">
                        <span
                          className={`block text-xs font-medium leading-snug ${
                            done
                              ? "text-emerald-600 dark:text-emerald-400 line-through decoration-emerald-300/60"
                              : "text-[var(--foreground)]"
                          }`}
                        >
                          {t.steps[item.step]}
                        </span>
                        {!done && (
                          <span className="block text-[10px] text-[var(--foreground-subtle)] leading-snug mt-0.5">
                            {t.steps[`${item.step}_desc` as keyof typeof t.steps] as string}
                          </span>
                        )}
                      </span>

                      {/* Icône métier */}
                      {!done && (
                        <Icon className="w-3.5 h-3.5 text-[var(--foreground-subtle)] flex-shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-[var(--border)]">
              {isAllDone ? (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 pl-1">
                  {t.complete}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] transition-colors px-1 py-0.5"
              >
                <X className="w-3 h-3" />
                {t.hide}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
