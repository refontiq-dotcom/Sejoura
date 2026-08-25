"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { convertXofTo, getCurrencySymbol, getCurrencyDecimals, BASE_CURRENCY } from "@/lib/currencyConverter";
import { useAccommodation } from "@/hooks/use-accommodation";

export interface CurrencyInfo {
  code: string;
  symbol: string;
}

const STORAGE_KEY = "sejoura-currency";

const DEFAULT_CURRENCY: CurrencyInfo = { code: "XOF", symbol: "FCFA" };

interface CurrencyContextType {
  currency: CurrencyInfo;
  setCurrency: (c: CurrencyInfo) => void;
  baseCurrency: string;
  /** Formate un montant exprimé en monnaie de base (XOF) vers la devise cible */
  fmt: (amountInBase: number) => string;
  /** Formate un montant brut sans conversion */
  fmtRaw: (amount: number, symbol?: string) => string;
  /** Convertit un montant de la devise de base vers la devise cible */
  convertFromBase: (amountInBase: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyInfo>(() => {
    if (typeof window === "undefined") return DEFAULT_CURRENCY;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored) as CurrencyInfo;
    } catch { /* ignore */ }
    return DEFAULT_CURRENCY;
  });

  // La devise d'affichage suit la RÉSIDENCE ACTIVE (multi-résidences) :
  // chaque résidence a sa propre devise (accommodations.currency).
  // Sans résidence active (onboarding), on reste sur la devise par défaut.
  const { activeAccommodation } = useAccommodation();
  const activeCurrency = activeAccommodation
    ? { code: activeAccommodation.currency, symbol: activeAccommodation.currency_symbol || getCurrencySymbol(activeAccommodation.currency) }
    : null;

  useEffect(() => {
    if (activeCurrency && (activeCurrency.code !== currency.code || activeCurrency.symbol !== currency.symbol)) {
      setCurrencyState(activeCurrency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCurrency?.code, activeCurrency?.symbol]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currency));
  }, [currency]);

  useEffect(() => {
    function handleUpdate(e: Event) {
      const info = (e as CustomEvent<CurrencyInfo>).detail;
      if (info?.code && info?.symbol) setCurrencyState(info);
    }
    window.addEventListener("sejoura-currency-updated", handleUpdate);
    return () => window.removeEventListener("sejoura-currency-updated", handleUpdate);
  }, []);

  const setCurrency = (c: CurrencyInfo) => setCurrencyState(c);

  function fmt(amountInBase: number): string {
    const converted = convertFromBase(amountInBase);
    const decimals = getCurrencyDecimals(currency.code);
    const symbol = currency.symbol;
    const formatted = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
      .format(converted || 0)
      .replace(/[\u202F\u00A0]/g, " ");

    if (["$", "₦", "₵", "£", "€"].includes(symbol.trim())) {
      return `${symbol} ${formatted}`;
    }
    return `${formatted} ${symbol}`;
  }

  function fmtRaw(amount: number, symbol: string = currency.symbol): string {
    const decimals = getCurrencyDecimals(currency.code);
    const formatted = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
      .format(amount || 0)
      .replace(/[\u202F\u00A0]/g, " ");

    if (["$", "₦", "₵", "£", "€"].includes(symbol.trim())) {
      return `${symbol} ${formatted}`;
    }
    return `${formatted} ${symbol}`;
  }

  function convertFromBase(amountInBase: number): number {
    if (currency.code === BASE_CURRENCY) return amountInBase;
    return convertXofTo(amountInBase, currency.code);
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, baseCurrency: BASE_CURRENCY, fmt, fmtRaw, convertFromBase }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within a CurrencyProvider");
  return ctx;
}
