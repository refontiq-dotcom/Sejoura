"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOnboardingStatus,
  completeStep,
  dismissOnboarding,
  isOnboardingComplete,
  ONBOARDING_REQUIRED_STEPS,
  type OnboardingStatus,
} from "@/lib/onboarding";
import type { OnboardingStep } from "@/types/database";

// ============================================================================
// useOnboarding — Hook d'état de l'onboarding (séparation logique / UI)
// ============================================================================
//
// Responsabilités :
//   • Charger le statut persistant depuis l'API au montage.
//   • Exposer completeStep / dismiss / retry avec Optimistic UI (mise à jour
//     immédiate de l'état local avant la réponse réseau, puis resynchroni-
//     sation silencieuse avec le retour serveur).
//   • Déduire les drapeaux d'affichage (showModal, showChecklist, progress).
//
// Les composants (OnboardingModal, OnboardingChecklist) consomment ce hook
// sans jamais manipuler la logique d'état eux-mêmes.
// ============================================================================

export interface UseOnboardingResult {
  /** Statut persistant courant (null tant que le chargement n'est pas fini). */
  status: OnboardingStatus | null;
  loading: boolean;
  /** true quand la checklist est ouverte à la demande (flottante). */
  showChecklist: boolean;
  /** Ratio d'étapes complétées (0 → 1). */
  progress: number;
  /** Nombre d'étapes complétées / total. */
  completedCount: number;
  totalCount: number;
  /** Marque une étape comme complétée (optimistic UI, non bloquant). */
  complete: (step: OnboardingStep) => void;
  /** Masque la checklist et le modal de bienvenue (persistant). */
  dismiss: () => void;
  /** Ouvre la checklist uniquement à la demande de l'utilisateur. */
  openChecklist: () => void;
  /** Ferme la checklist sans désactiver définitivement l'onboarding. */
  closeChecklist: () => void;
  /** Recharge le statut depuis le serveur. */
  refresh: () => Promise<void>;
}

export function useOnboarding(enabled: boolean): UseOnboardingResult {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  // `loading` ne devient false que via un fetch résolu ; quand `enabled` est
  // false (employés, invités) les drapeaux d'affichage restent simplement
  // désactivés, donc aucun spinner inutile.
  const [loading, setLoading] = useState(true);
  // La checklist ne doit jamais suivre l'utilisateur automatiquement : elle
  // est accessible à la demande depuis le menu du profil.
  const [checklistOpen, setChecklistOpen] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getOnboardingStatus();
    setStatus(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Chargement asynchrone hors du corps d'effet : le setState n'intervient
    // qu'après résolution du fetch, jamais de façon synchrone au montage.
    (async () => {
      const next = await getOnboardingStatus();
      if (!cancelled) {
        setStatus(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const complete = useCallback(
    (step: OnboardingStep) => {
      if (!enabled) return;
      // Optimistic UI : on ajoute l'étape localement avant la réponse réseau.
      setStatus((prev) => {
        const base: OnboardingStatus =
          prev ?? { exists: false, isOnboarded: false, dismissed: false, completedSteps: [] };
        if (base.completedSteps.includes(step)) return base;
        const completedSteps = [...base.completedSteps, step];
        return {
          ...base,
          exists: true,
          completedSteps,
          isOnboarded: isOnboardingComplete(completedSteps),
        };
      });
      // Persistance serveur (non bloquante, resynchronise l'état réel).
      void completeStep(step).then((serverStatus) => {
        if (serverStatus) setStatus(serverStatus);
      });
    },
    [enabled]
  );

  const dismiss = useCallback(() => {
    if (!enabled) return;
    setChecklistOpen(false);
    // Optimistic UI : on masque immédiatement, la persistance suit.
    setStatus((prev) => ({
      exists: true,
      isOnboarded: prev?.isOnboarded ?? false,
      dismissed: true,
      completedSteps: prev?.completedSteps ?? [],
    }));
    void dismissOnboarding().then((serverStatus) => {
      if (serverStatus) setStatus(serverStatus);
    });
  }, [enabled]);


  const openChecklist = useCallback(() => {
    if (!enabled) return;
    setChecklistOpen(true);
  }, [enabled]);

  const closeChecklist = useCallback(() => {
    setChecklistOpen(false);
  }, []);

  const completedSteps = status?.completedSteps ?? [];
  const completedCount = ONBOARDING_REQUIRED_STEPS.filter((s) =>
    completedSteps.includes(s)
  ).length;
  const totalCount = ONBOARDING_REQUIRED_STEPS.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  // Absence de ligne en base = onboarding jamais démarré.
  const isOnboarded = status?.isOnboarded ?? false;
  const isDismissed = status?.dismissed ?? false;

  return {
    status,
    loading,
    // La checklist reste visible tant que l'onboarding n'est pas terminé
    // (même après fermeture du modal), sauf si l'utilisateur l'a masquée.
    showChecklist: enabled && !loading && !isOnboarded && checklistOpen,
    progress,
    completedCount,
    totalCount,
    complete,
    dismiss,
    openChecklist,
    closeChecklist,
    refresh,
  };
}
