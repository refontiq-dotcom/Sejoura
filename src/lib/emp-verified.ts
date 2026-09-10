export const EMP_VERIFIED_KEY = "sejoura-emp-verified";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} | null | undefined;

export function isEmpVerified(storage?: StorageLike): boolean {
  const store =
    storage === undefined && typeof window !== "undefined" ? window.sessionStorage : storage;
  if (!store) return true;
  return store.getItem(EMP_VERIFIED_KEY) === "1";
}

export function markEmpVerified(storage?: StorageLike): void {
  const store =
    storage === undefined && typeof window !== "undefined" ? window.sessionStorage : storage;
  store?.setItem(EMP_VERIFIED_KEY, "1");
}

export function clearEmpVerification(storage?: StorageLike): void {
  const store =
    storage === undefined && typeof window !== "undefined" ? window.sessionStorage : storage;
  store?.removeItem(EMP_VERIFIED_KEY);
}
