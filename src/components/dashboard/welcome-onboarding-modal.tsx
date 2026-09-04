"use client";

import { useState } from "react";
import {
  Building2,
  Check,
  ChevronRight,
  Home,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import type { OnboardingStep } from "@/types/database";

// ============================================================================
// WelcomeOnboardingModal — Modal de bienvenue / mini-questionnaire
// ============================================================================
//
// S'affiche automatiquement à la première connexion (showWelcomeModal du hook
// useOnboarding). 2 étapes :
//   1. Accueil + choix de l'objectif principal (qualification).
//   2. Nom du projet / workspace (configuration initiale légère).
//
// NB : ne pas confondre avec OnboardingModal (étape 2 obligatoire de
// l'inscription, qui crée tenant + établissement). Ce modal est purement
// qualitatif et toujours skippable ("Passer l'introduction").
// ============================================================================

type WelcomeGoal = "manage" | "team" | "grow";

const GOAL_OPTIONS: Array<{
  goal: WelcomeGoal;
  icon: React.ComponentType<{ className?: string }>;
  stepKey: OnboardingStep;
}> = [
  { goal: "manage", icon: Home, stepKey: "workspace_configured" },
  { goal: "team", icon: Users, stepKey: "workspace_configured" },
  { goal: "grow", icon: TrendingUp, stepKey: "workspace_configured" },
];

interface WelcomeOnboardingModalProps {
  open: boolean;
  userName?: string;
  onComplete: () => void;
  onSkip: () => void;
  /** Marque une étape d'onboarding (hook useOnboarding). */
  completeStep: (step: OnboardingStep) => void;
}

export function WelcomeOnboardingModal({
  open,
  userName,
  onComplete,
  onSkip,
  completeStep,
}: WelcomeOnboardingModalProps) {
  const { lang } = useLanguage();
  const t = translations[lang].onboardingChecklist.welcome;

  const [stepIndex, setStepIndex] = useState(0);
  const [goal, setGoal] = useState<WelcomeGoal | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const totalSteps = 2;
  const isLastStep = stepIndex === totalSteps - 1;

  function handleNext() {
    if (stepIndex === 0) {
      // Étape 1 : l'objectif choisi qualifie le compte et valide la
      // configuration initiale (le vrai tenant/établissement est déjà créé
      // par le flux d'inscription).
      completeStep("workspace_configured");
      setStepIndex(1);
      return;
    }

    // Étape 2 : fin du questionnaire.
    setSaving(true);
    completeStep("workspace_configured");
    setSaving(false);
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto overscroll-contain">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="relative w-full max-w-md bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[92vh] overflow-y-auto animate-modal-in z-10 pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* Header */}
        <div className="relative bg-[var(--primary-color,#0C1C33)] p-5 text-white overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-[-60%] left-[-10%] w-48 h-48 rounded-full bg-white blur-2xl animate-pulse" />
          </div>
          <div className="relative">
            <div className="inline-flex p-2.5 rounded-full bg-white/10 mb-2.5 backdrop-blur-md shadow-inner">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
              {t.badge}
            </p>
            <h2 className="text-lg font-bold tracking-tight mt-0.5">
              {userName ? `${userName} — ${t.title}` : t.title}
            </h2>
            <p className="text-white/80 text-xs mt-1">{t.subtitle}</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Indicateur de progression */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIndex
                    ? "bg-[var(--primary-color,#0C1C33)]"
                    : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            ))}
            <span className="text-[10px] text-slate-400 ml-1.5 whitespace-nowrap">
              {t.step.replace("{current}", String(stepIndex + 1)).replace("{total}", String(totalSteps))}
            </span>
          </div>

          {stepIndex === 0 ? (
            /* ── ÉTAPE 1 : objectif principal ── */
            <div className="space-y-2.5">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t.goalQuestion}
              </p>
              {GOAL_OPTIONS.map(({ goal: g, icon: Icon }) => {
                const label = g === "manage" ? t.goalManage : g === "team" ? t.goalTeam : t.goalGrow;
                const desc = g === "manage" ? t.goalManageDesc : g === "team" ? t.goalTeamDesc : t.goalGrowDesc;
                const selected = goal === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(g)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-color,#0C1C33)]/5 ring-2 ring-[var(--primary-color,#0C1C33)]"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 p-2 rounded-lg ${
                        selected
                          ? "bg-[var(--primary-color,#0C1C33)] text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                        {label}
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {desc}
                      </span>
                    </span>
                    {selected && (
                      <Check className="w-4 h-4 text-[var(--primary-color,#0C1C33)] flex-shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* ── ÉTAPE 2 : nom du workspace ── */
            <div className="space-y-2.5">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t.workspaceQuestion}
              </p>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder={t.workspacePlaceholder}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)] focus:border-transparent transition-all text-sm"
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {t.workspaceHint}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 pt-0 space-y-2.5">
          <button
            type="button"
            onClick={handleNext}
            disabled={stepIndex === 0 ? !goal : saving}
            className="w-full py-3 rounded-xl bg-[var(--primary-color,#0C1C33)] hover:opacity-90 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
          >
            {isLastStep ? t.finish : t.next}
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full text-center text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {t.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
