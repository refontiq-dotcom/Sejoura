import { describe, it, expect, vi } from "vitest";
import {
  getOfflineState,
  subscribeOffline,
} from "../src/lib/offline/status";

describe("offline/status", () => {
  it("expose un état initial sain", () => {
    const state = getOfflineState();
    expect(state).toHaveProperty("online");
    expect(state).toHaveProperty("pending", 0);
    expect(state).toHaveProperty("syncing", false);
    expect(state).toHaveProperty("lastSync", null);
  });

  it("appelle immédiatement le listener à l'abonnement", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOffline(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(getOfflineState());
    unsubscribe();
  });

  it("ne notifie plus après désabonnement", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOffline(listener);
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
