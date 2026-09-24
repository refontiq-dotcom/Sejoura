"use client";

import { useCurrency } from "@/hooks/use-currency";

interface CurrencyLabelProps {
  /** Texte avant le symbole, ex. "Montant" ou "Tarif par nuit" */
  label: string;
  className?: string;
}

/**
 * Libellé monétaire centralisé.
 * Utilise toujours la devise active de l'établissement.
 *
 * Exemple: <CurrencyLabel label="Montant" /> -> "Montant (FCFA)"
 * puis automatiquement "Montant ($)" si l'établissement passe en USD.
 */
export function CurrencyLabel({ label, className }: CurrencyLabelProps) {
  const { currencyLabel } = useCurrency();
  return <span className={className}>{currencyLabel(label)}</span>;
}
