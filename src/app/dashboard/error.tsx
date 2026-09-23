"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("dashboard render error", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--card-border,var(--border))] bg-[var(--card-bg,var(--surface))] p-6 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Une erreur est survenue</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Le module n’a pas pu être affiché. Vos données ne sont pas supprimées.
        </p>
        <button type="button" onClick={() => reset()} className="mt-5 rounded-lg bg-[var(--primary-color,#0C1C33)] px-4 py-2 text-sm font-medium text-white">
          Réessayer
        </button>
      </div>
    </div>
  );
}
