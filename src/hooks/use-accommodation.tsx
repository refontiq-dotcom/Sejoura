"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import type { Accommodation } from "@/types/database";

const STORAGE_KEY = "sejoura-active-accommodation";

interface AccommodationContextType {
  accommodations: Accommodation[];
  activeAccommodationId: string | null;
  activeAccommodation: Accommodation | null;
  setAccommodations: (accs: Accommodation[]) => void;
  setActiveAccommodationId: (id: string | null) => void;
}

const AccommodationContext = createContext<AccommodationContextType | undefined>(undefined);

/**
 * Résidences accessibles à l'utilisateur + résidence active (state global).
 * L'ID de la résidence active est utilisé pour filtrer les données du
 * tableau de bord et est persisté en localStorage.
 *
 * La restauration de la valeur persistée est effectuée par le layout du
 * dashboard (qui connaît l'utilisateur authentifié) : voir `checkAuth`.
 */
export function AccommodationProvider({ children }: { children: ReactNode }) {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [activeAccommodationId, setActiveAccommodationIdState] = useState<string | null>(null);

  const setActiveAccommodationId = useCallback((id: string | null) => {
    setActiveAccommodationIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage indisponible : on ignore
    }
  }, []);

  const activeAccommodation = useMemo(
    () => accommodations.find((a) => a.id === activeAccommodationId) ?? null,
    [accommodations, activeAccommodationId]
  );

  return (
    <AccommodationContext.Provider
      value={{
        accommodations,
        activeAccommodationId,
        activeAccommodation,
        setAccommodations,
        setActiveAccommodationId,
      }}
    >
      {children}
    </AccommodationContext.Provider>
  );
}

export function useAccommodation() {
  const context = useContext(AccommodationContext);
  if (!context) {
    throw new Error("useAccommodation must be used within an AccommodationProvider");
  }
  return context;
}
