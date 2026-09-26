// Génération de clés d'objets sûres pour le stockage média (R2 / Supabase).
//
// Règles de sécurité :
//   - le nom de fichier utilisateur n'apparaît JAMAIS dans la clé ;
//   - chaque objet porte un UUID v4 (aucune collision, aucun écrasement
//     inter-utilisateurs) ;
//   - l'isolation par tenant est imposée par le préfixe {tenantId}/… ;
//   - le tenantId provient toujours de la session/DB côté serveur, jamais
//     d'un champ de formulaire contrôlable par le client.

import { randomUUID } from "node:crypto";
import { MediaError } from "./errors";

/** Identifiant de tenant sûr pour une clé : UUID ou slug court alphanumérique. */
export function isSafeTenantSegment(tenantId: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(tenantId);
}

function assertSafeTenant(tenantId: string): string {
  if (!isSafeTenantSegment(tenantId)) {
    throw new MediaError(
      "invalid_image",
      "Identifiant d'établissement invalide pour le stockage média."
    );
  }
  return tenantId;
}

/**
 * Clé d'une photo de chambre : {tenantId}/room-types/{uuid}.webp
 * UUID généré côté serveur → deux utilisateurs envoyant "photo.jpg" au même
 * moment obtiennent deux objets distincts.
 */
export function buildRoomPhotoKey(tenantId: string, extension: string): string {
  return `${assertSafeTenant(tenantId)}/room-types/${randomUUID()}.${extension}`;
}

/** Clé d'une affiche : {tenantId}/ads/{uuid}.{ext} */
export function buildAdKey(tenantId: string, extension: string): string {
  return `${assertSafeTenant(tenantId)}/ads/${randomUUID()}.${extension}`;
}

/** Clé d'une capture de suggestion : uploads/{uuid}.{ext} (périmètre plateforme). */
export function buildScreenshotKey(extension: string): string {
  return `uploads/${randomUUID()}.${extension}`;
}

/**
 * Clé du logo : {tenantId}/logo.{ext}.
 * Contrairement aux photos, le chemin est fixe (upsert) : remplacer le logo
 * écrase l'ancien objet du MÊME tenant seulement. L'extension dérivée du
 * contenu réel empêche un écrasement inter-format non sollicité.
 */
export function buildLogoKey(tenantId: string, extension: string): string {
  return `${assertSafeTenant(tenantId)}/logo.${extension}`;
}
