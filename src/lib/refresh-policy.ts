export const REALTIME_DEBOUNCE_MS = 400;

export function shouldRunBackgroundRefresh(
  visibility: DocumentVisibilityState | string = "visible"
): boolean {
  return visibility !== "hidden";
}
