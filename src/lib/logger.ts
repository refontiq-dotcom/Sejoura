/**
 * Lightweight structured server logger for Séjoura.
 *
 * - Emits JSON so Vercel/host logs remain searchable.
 * - Never receives secrets or request bodies by design.
 * - Keeps production responses free of internal error details.
 */

type LogContext = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", event: string, context: LogContext = {}) {
  const entry = JSON.stringify({
    service: "sejoura",
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

export function getRequestId(req: Request): string {
  return (
    req.headers.get("x-request-id") ??
    req.headers.get("x-vercel-id") ??
    crypto.randomUUID()
  );
}

export const logger = {
  info(event: string, context?: LogContext) {
    write("info", event, context);
  },
  warn(event: string, context?: LogContext) {
    write("warn", event, context);
  },
  error(event: string, error?: unknown, context: LogContext = {}) {
    const normalized =
      error instanceof Error
        ? { error_name: error.name, error_message: error.message }
        : { error_message: String(error ?? "Unknown error") };

    write("error", event, { ...context, ...normalized });
  },
};
