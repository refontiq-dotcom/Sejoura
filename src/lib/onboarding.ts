// ============================================================================
// SÉJOURA — Onboarding utilisateur : helpers client & serveur
// ============================================================================
//
// API métier :
//   • getOnboardingStatus()  — statut de l'utilisateur connecté
//   • completeStep(step)     — marque une étape comme complétée
//   • dismissOnboarding()    — masque définitivement la checklist
//   • trackStep(step)        — helper "fire & forget" à appeler partout où
//                              une action clé est réalisée dans l'app.
//
// Côté client, les fonctions parlent à l'API /api/onboarding (server-side,
// qui résout l'utilisateur via Supabase Auth côté serveur — jamais depuis le
// client). Côté serveur (route handlers / server actions), on utilise les
// mêmes noms via les RPC Supabase.
//
// L'appel `trackStep` est totalement non bloquant : une erreur réseau ne
// doit JAMAIS faire échouer l'action métier de l'utilisateur.
// ============================================================================

import type { OnboardingStep, UserOnboarding } from "@/types/database";

// ----------------------------------------------------------------------------
// Types partagés
// ----------------------------------------------------------------------------

export interface OnboardingStatus {
  exists: boolean;
  isOnboarded: boolean;
  dismissed: boolean;
  completedSteps: OnboardingStep[];
}

/** Étapes requises pour considérer l'onboarding comme terminé. */
export const ONBOARDING_REQUIRED_STEPS: OnboardingStep[] = [
  "workspace_configured",
  "first_booking_created",
  "employee_invited",
  "advanced_explored",
];

export function isOnboardingComplete(steps: OnboardingStep[]): boolean {
  return ONBOARDING_REQUIRED_STEPS.every((s) => steps.includes(s));
}

// ----------------------------------------------------------------------------
// Client (navigateur) — passe par l'API serveur
// ----------------------------------------------------------------------------

/** Statut d'onboarding de l'utilisateur connecté (ou null si invité). */
export async function getOnboardingStatus(): Promise<OnboardingStatus | null> {
  try {
    const res = await fetch("/api/onboarding", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: OnboardingStatus | null };
    return data.status ?? null;
  } catch {
    return null;
  }
}

/**
 * Marque une étape comme complétée (fire & forget côté appelant).
 * Retourne le statut serveur si disponible, sinon null (non bloquant).
 */
export async function completeStep(step: OnboardingStep): Promise<OnboardingStatus | null> {
  try {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", step }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: OnboardingStatus | null };
    return data.status ?? null;
  } catch {
    return null;
  }
}

/** Masque définitivement la checklist (persistant). */
export async function dismissOnboarding(): Promise<OnboardingStatus | null> {
  try {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: OnboardingStatus | null };
    return data.status ?? null;
  } catch {
    return null;
  }
}

/**
 * trackStep — helper universel à appeler immédiatement après une action clé
 * de l'application. Fire & forget : ne jette jamais, ne bloque jamais l'UI.
 *
 * Exemple :
 *   await createBooking(...);      // action métier
 *   trackStep("first_booking_created"); // onboarding (non bloquant)
 */
export function trackStep(step: OnboardingStep): void {
  void completeStep(step).catch(() => {
    // Silencieux : l'onboarding ne doit jamais perturber l'action métier.
  });
}

// ----------------------------------------------------------------------------
// Serveur (route handlers / server actions) — RPC Supabase directes
// ----------------------------------------------------------------------------

type SupabaseRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => {
    single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  };
};

/** Convertit une ligne Supabase (user_onboarding) en statut applicatif. */
export function toOnboardingStatus(row: UserOnboarding | null): OnboardingStatus | null {
  if (!row) return null;
  return {
    exists: true,
    isOnboarded: Boolean(row.is_onboarded),
    dismissed: Boolean(row.dismissed),
    completedSteps: (row.completed_steps ?? []) as OnboardingStep[],
  };
}

/** RPC : get_my_onboarding() — statut persistant de l'utilisateur connecté. */
export async function serverGetOnboarding(
  supabase: SupabaseRpcClient
): Promise<OnboardingStatus | null> {
  const { data, error } = await supabase.rpc("get_my_onboarding").single();
  if (error || !data) return null;
  return toOnboardingStatus(data as UserOnboarding);
}

/** RPC : complete_onboarding_step(p_step) — côté serveur. */
export async function serverCompleteStep(
  supabase: SupabaseRpcClient,
  step: OnboardingStep
): Promise<OnboardingStatus | null> {
  const { data, error } = await supabase
    .rpc("complete_onboarding_step", { p_step: step })
    .single();
  if (error || !data) return null;
  return toOnboardingStatus(data as UserOnboarding);
}

/** RPC : dismiss_onboarding() — côté serveur. */
export async function serverDismissOnboarding(
  supabase: SupabaseRpcClient
): Promise<OnboardingStatus | null> {
  const { data, error } = await supabase.rpc("dismiss_onboarding").single();
  if (error || !data) return null;
  return toOnboardingStatus(data as UserOnboarding);
}
