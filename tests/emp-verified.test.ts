import { describe, expect, it } from "vitest";
import {
  EMP_VERIFIED_KEY,
  clearEmpVerification,
  isEmpVerified,
  markEmpVerified,
} from "../src/lib/emp-verified";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
}

describe("emp-verified", () => {
  it("traite l'absence de storage comme verifie (SSR)", () => {
    expect(isEmpVerified(null)).toBe(true);
    expect(isEmpVerified(undefined)).toBe(true);
  });

  it("n'est verifie que si la cle session vaut 1", () => {
    expect(isEmpVerified(memoryStorage())).toBe(false);
    expect(isEmpVerified(memoryStorage({ [EMP_VERIFIED_KEY]: "0" }))).toBe(false);
    expect(isEmpVerified(memoryStorage({ [EMP_VERIFIED_KEY]: "1" }))).toBe(true);
  });

  it("marque et efface la verification", () => {
    const storage = memoryStorage();
    markEmpVerified(storage);
    expect(isEmpVerified(storage)).toBe(true);
    clearEmpVerification(storage);
    expect(isEmpVerified(storage)).toBe(false);
  });
});
