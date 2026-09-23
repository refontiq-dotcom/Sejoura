"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("application render error", error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <main className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Séjoura a rencontré un problème</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Rechargez cette page pour reprendre votre session.
          </p>
          <button type="button" onClick={() => reset()} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
