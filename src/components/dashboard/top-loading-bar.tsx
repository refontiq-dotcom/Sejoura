"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Fine barre de progression affichée en haut du viewport lors d'un changement
 * de route. Le routeur App Router n'expose pas d'événement de navigation
 * global simple : on observe donc le `pathname` et on anime la barre à chaque
 * changement, ce qui fournit un retour visuel immédiat à l'utilisateur.
 */
export function TopLoadingBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [runId, setRunId] = useState(0);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setVisible(true);
    setRunId((id) => id + 1);
    const timer = window.setTimeout(() => setVisible(false), 650);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[80] h-0.5 pointer-events-none"
      role="progressbar"
      aria-label="Chargement de la page"
    >
      <div
        key={runId}
        className="top-loading-bar h-full w-full origin-left bg-[var(--primary-color,#0C1C33)]"
      />
    </div>
  );
}
