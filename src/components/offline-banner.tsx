"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import {
  subscribeOffline,
  initOfflineSync,
  triggerSync,
} from "@/lib/offline/status";

const LABELS: Record<"fr" | "en", Record<string, string>> = {
  fr: {
    offline:
      "Hors ligne — les données affichées sont celles déjà chargées. Les modifications seront synchronisées au retour de la connexion.",
    pending:
      "modification(s) en attente de synchronisation.",
    syncing: "Synchronisation en cours…",
    syncNow: "Synchroniser",
    synced: "modification(s) synchronisée(s).",
    syncFailed:
      "modification(s) non synchronisée(s). Vérifiez la connexion.",
    reload: "Recharger les données",
  },
  en: {
    offline:
      "Offline — showing previously loaded data. Changes will be synced once you're back online.",
    pending: "change(s) waiting to be synced.",
    syncing: "Syncing…",
    syncNow: "Sync now",
    synced: "change(s) synced.",
    syncFailed: "change(s) could not be synced. Check your connection.",
    reload: "Reload data",
  },
};

export function OfflineBanner() {
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Auto-dismiss: quand l'utilisateur est en ligne avec des modifications en attente,
  // la bannière disparaît après 5 secondes (les données sont déjà en BDD via Supabase).
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (online && pending > 0 && !dismissed) {
      const timer = window.setTimeout(() => setDismissed(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [online, pending, dismissed]);

  useEffect(() => {
    initOfflineSync();
    const storedLang = window.localStorage.getItem("sejoura-lang");
    if (storedLang === "en") {
      queueMicrotask(() => setLang("en"));
    }
  }, []);

  useEffect(() => {
    return subscribeOffline((s) => {
      setOnline(s.online);
      setPending(s.pending);
      setSyncing(s.syncing);
      // Réinitialiser le masquage si on passe hors ligne
      if (!s.online) setDismissed(false);
    });
  }, []);

  useEffect(() => {
    const handleSynced = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        synced?: number;
        failed?: number;
      };
      const l = LABELS[lang];
      if (detail?.failed) {
        toast.warning(`${detail.failed} ${l.syncFailed}`);
      } else if (detail?.synced) {
        toast.success(`${detail.synced} ${l.synced}`);
      }
    };
    window.addEventListener("sejoura-offline-synced", handleSynced);
    return () =>
      window.removeEventListener("sejoura-offline-synced", handleSynced);
  }, [lang]);

  if (dismissed || (online && pending === 0)) return null;

  const l = LABELS[lang];
  const showPending = !online && pending > 0;
  const showOnlinePending = online && pending > 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[999] animate-slide-up">
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg backdrop-blur border ${
            online
              ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100"
              : "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100"
          }`}
        >
          {online ? (
            <CloudUpload className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0 text-sm">
            {!online && (
              <p className="font-medium">{l.offline}</p>
            )}
            {(showPending || showOnlinePending) && (
              <p className={!online ? "text-xs opacity-80 mt-0.5" : ""}>
                {pending} {l.pending}
                {syncing ? ` ${l.syncing}` : ""}
              </p>
            )}
          </div>
          {!online && (
            <button
              type="button"
              onClick={triggerSync}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-60"
              disabled={syncing}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? l.syncing : l.syncNow}
            </button>
          )}
          {showOnlinePending && !syncing && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {l.reload}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
