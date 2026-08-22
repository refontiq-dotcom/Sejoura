"use client";

export interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
  offline: boolean;
}

export interface OfflineState {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastSync: SyncResult | null;
}

type Listener = (state: OfflineState) => void;

const listeners = new Set<Listener>();

let state: OfflineState = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  pending: 0,
  syncing: false,
  lastSync: null,
};

function setState(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function getOfflineState(): OfflineState {
  return state;
}

export function subscribeOffline(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function triggerSync() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage({
      type: "SEJOURA_SYNC_NOW",
    });
  }
}

export function requestQueueCount() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({
    type: "SEJOURA_GET_STATUS",
  });
}

export function initOfflineSync() {
  if (typeof window === "undefined") return;

  const updateOnline = () => {
    setState({ online: navigator.onLine });
    if (navigator.onLine) {
      window.setTimeout(triggerSync, 1500);
    }
  };
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const msg = event.data as
        | { type: string; count?: number; synced?: number; failed?: number; pending?: number; offline?: boolean }
        | undefined;
      if (!msg || typeof msg.type !== "string") return;

      switch (msg.type) {
        case "SEJOURA_QUEUE_CHANGED":
        case "SEJOURA_STATUS":
          setState({ pending: Number(msg.count ?? 0) });
          break;
        case "SEJOURA_SYNC_START":
          setState({ syncing: true });
          break;
        case "SEJOURA_SYNC_RESULT":
          setState({
            syncing: false,
            pending: Number(msg.pending ?? 0),
            lastSync: {
              synced: Number(msg.synced ?? 0),
              failed: Number(msg.failed ?? 0),
              pending: Number(msg.pending ?? 0),
              offline: Boolean(msg.offline),
            },
          });
          window.dispatchEvent(
            new CustomEvent("sejoura-offline-synced", {
              detail: {
                synced: msg.synced,
                failed: msg.failed,
                pending: msg.pending,
                offline: msg.offline,
              },
            })
          );
          break;
      }
    });

    const controller = navigator.serviceWorker.controller;
    if (controller) {
      requestQueueCount();
    } else {
      navigator.serviceWorker.addEventListener("controllerchange", requestQueueCount);
    }
  }
}
