/**
 * ============================================================================
 * SEJOURA — AUDIT LOGGING
 * ============================================================================
 *
 * Enregistre les actions importantes pour la securite et la traabilit.
 * Compatible avec la table audit_logs existante dans Supabase.
 *
 * Schema existant:
 *   id, tenant_id, user_id, action, entity_type, entity_id,
 *   old_values, new_values, ip_address, user_agent, created_at
 *
 * Usage:
 *   await auditLog({
 *     tenantId: session.tenantId,
 *     userId: session.user.id,
 *     action: "booking.created",
 *     entityType: "booking",
 *     entityId: bookingId,
 *     newValues: { guest_name: "...", room: "101" },
 *     request,
 *   });
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditLogEntry {
  /** UUID du tenant (etablissement) */
  tenantId?: string;
  /** UUID de l'utilisateur authentifie */
  userId?: string;
  /** Action effectuee (ex: "booking.created", "employee.deleted") */
  action: string;
  /** Type d'entite concernee (ex: "booking", "employee", "subscription") */
  entityType: string;
  /** ID de l'entite concernee */
  entityId?: string;
  /** Valeurs avant modification (pour les updates) */
  oldValues?: Record<string, unknown>;
  /** Valeurs apres modification (pour les creates/updates) */
  newValues?: Record<string, unknown>;
  /** Objet Request Next.js (pour extraire IP et User-Agent) */
  request?: Request;
}

/**
 * Actions courantes predefinies pour maintenir la coherence.
 */
export const AuditActions = {
  // Auth
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_PASSWORD_CHANGE: "auth.password_change",
  AUTH_PIN_SET: "auth.pin_set",
  AUTH_PIN_VERIFY: "auth.pin_verify",
  AUTH_BIOMETRIC_REGISTER: "auth.biometric_register",
  AUTH_BIOMETRIC_LOGIN: "auth.biometric_login",

  // Bookings
  BOOKING_CREATED: "booking.created",
  BOOKING_CHECKED_IN: "booking.checked_in",
  BOOKING_CHECKED_OUT: "booking.checked_out",
  BOOKING_CANCELLED: "booking.cancelled",
  BOOKING_PAYMENT_RECORDED: "booking.payment_recorded",

  // Employees
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_DELETED: "employee.deleted",
  EMPLOYEE_DEACTIVATED: "employee.deactivated",
  EMPLOYEE_ROLE_CHANGED: "employee.role_changed",

  // Rooms
  ROOM_CREATED: "room.created",
  ROOM_UPDATED: "room.updated",
  ROOM_STATUS_CHANGED: "room.status_changed",

  // Subscription
  SUBSCRIPTION_ACTIVATED: "subscription.activated",
  SUBSCRIPTION_EXPIRED: "subscription.expired",
  SUBSCRIPTION_PLAN_CHANGED: "subscription.plan_changed",

  // Settings
  SETTINGS_UPDATED: "settings.updated",
  LOGO_UPLOADED: "settings.logo_uploaded",
  THEME_CHANGED: "settings.theme_changed",
} as const;

/**
 * Extrait l'adresse IP depuis les headers de la requete.
 */
function getClientIp(request?: Request): string | undefined {
  if (!request) return undefined;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

/**
 * Extrait le User-Agent depuis les headers de la requete.
 */
function getUserAgent(request?: Request): string | undefined {
  if (!request) return undefined;
  return request.headers.get("user-agent") || undefined;
}

/**
 * Enregistre un log d'audit dans la base de donnees.
 * Ne lance jamais d'erreur — les logs d'audit ne doivent pas casser l'app.
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const admin = createAdminClient();

    const { error } = await admin.from("audit_logs").insert({
      tenant_id: entry.tenantId || null,
      user_id: entry.userId || null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId || null,
      old_values: entry.oldValues || null,
      new_values: entry.newValues || null,
      ip_address: getClientIp(entry.request),
      user_agent: getUserAgent(entry.request),
    });

    if (error) {
      console.error("[AuditLog] Failed to write:", error.message);
    }
  } catch {
    // Silencieux — l'audit logging ne doit jamais bloquer
  }
}

/**
 * Recupere les logs d'audit pour un tenant donne.
 */
export async function getTenantAuditLogs(
  tenantId: string,
  limit = 50
): Promise<
  Array<{
    id: string;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string;
  }>
> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("audit_logs")
    .select("id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

/**
 * Recupere les logs d'audit recents pour le tableau de bord admin.
 */
export async function getRecentAuditLogs(limit = 100): Promise<
  Array<{
    id: string;
    tenant_id: string | null;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    ip_address: string | null;
    created_at: string;
    user_name?: string;
  }>
> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("audit_logs")
    .select("id, tenant_id, user_id, action, entity_type, entity_id, ip_address, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Enrichir avec les noms des utilisateurs
  const userIds = [...new Set(data.map((log) => log.user_id).filter(Boolean))] as string[];
  if (userIds.length === 0) return data;

  const { data: users } = await admin
    .from("users")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));

  return data.map((log) => ({
    ...log,
    user_name: log.user_id ? nameMap.get(log.user_id) ?? "Inconnu" : "Systeme",
  }));
}
