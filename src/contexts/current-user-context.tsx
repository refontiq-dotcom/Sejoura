"use client";

import { createContext, useContext, ReactNode } from "react";
import type { User } from "@/types/database";

// ─────────────────────────────────────────────────────────────────────────
// Contexte partagé : qui est connecté, à quel établissement il appartient,
// et quel plan est actif. Le layout du dashboard (src/app/dashboard/
// layout.tsx) est le SEUL endroit qui interroge Supabase pour ces infos —
// ce contexte se contente de les redistribuer aux pages, pour leur éviter
// de refaire un aller-retour "qui êtes-vous ?" à chaque navigation.
//
// Avant ce contexte, chaque page (Réservations, Comptabilité, RH...)
// relançait indépendamment supabase.auth.getSession() puis une requête sur
// la table users, alors que le layout venait de le faire une fraction de
// seconde plus tôt pour afficher le menu. Résultat : 2 allers-retours
// réseau "perdus" avant même que la page commence à charger ses propres
// données, à chaque changement de page.
// ─────────────────────────────────────────────────────────────────────────

export type CurrentUserContextValue = {
  /** null tant que le layout n'a pas fini de vérifier la session */
  user: User | null;
  /** Raccourci pratique — équivalent à user?.tenant_id ?? "" */
  tenantId: string;
  /** Plan d'abonnement actif du tenant (ex: "essentiel", "croissance", "entreprise") */
  plan: string;
  /** true tant que le layout charge encore la session/l'utilisateur */
  loading: boolean;
};

const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined);

export function CurrentUserProvider({
  value,
  children,
}: {
  value: CurrentUserContextValue;
  children: ReactNode;
}) {
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

/**
 * Utilisateur, tenant et plan actuels — déjà chargés par le layout.
 * À utiliser dans les pages du dashboard à la place d'un nouvel appel à
 * supabase.auth.getSession() + une requête sur la table users.
 */
export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within a CurrentUserProvider (dashboard layout)");
  }
  return ctx;
}
