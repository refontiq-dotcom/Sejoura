// Erreurs média : codes stables + messages utilisateur en français.
// Aucune erreur technique brute n'est jamais renvoyée à l'utilisateur.

export type MediaErrorCode =
  | "unsupported_format"
  | "invalid_image"
  | "too_large"
  | "too_small"
  | "processing_failed"
  | "storage_error";

const USER_MESSAGES: Record<MediaErrorCode, string> = {
  unsupported_format: "Format d'image non supporté. Utilisez JPEG, PNG, WebP ou AVIF.",
  invalid_image: "Fichier image invalide ou corrompu.",
  too_large: "Fichier trop volumineux.",
  too_small: "Image trop petite pour être traitée.",
  processing_failed: "Impossible de traiter cette image. Essayez une autre photo.",
  storage_error: "Problème temporaire lors de l'enregistrement. Réessayez dans un instant.",
};

export class MediaError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, detail?: string) {
    super(detail ? `${USER_MESSAGES[code]} (${detail})` : USER_MESSAGES[code]);
    this.name = "MediaError";
    this.code = code;
  }

  /** Message affichable à l'utilisateur, sans aucun détail technique. */
  get userMessage(): string {
    return USER_MESSAGES[this.code];
  }
}
