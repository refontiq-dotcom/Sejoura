// ──────────────────────────────────────────────────────────────────────────────
// Traduit une erreur Supabase / PostgreSQL liée à room_types en message lisible.
// Remplace l'ancien message générique « L'action a échoué ».
// ──────────────────────────────────────────────────────────────────────────────

type DbError = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

export function describeRoomTypeError(error: DbError, action: "save" | "delete"): string {
  const code = error?.code ?? "";
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;

  if (code === "23505" || text.includes("uq_room_types_accommodation_name")) {
    return "Ce nom de type de chambre existe déjà dans cet établissement.";
  }
  if (code === "23503") {
    return action === "delete"
      ? "Ce type contient encore des chambres. Supprimez ou déplacez-les d'abord."
      : "Établissement introuvable. Rechargez la page.";
  }
  if (code === "23514") {
    if (text.includes("chk_trouvetou_requires_photo")) {
      return "Ajoutez au moins une photo pour activer la diffusion Trouvetou.";
    }
    if (text.includes("featured_images_max_4")) {
      return "4 photos maximum par type de chambre.";
    }
    return "Une valeur du formulaire n'est pas acceptée (prix, capacité ou surface).";
  }
  if (code === "42501" || /row-level security/i.test(text)) {
    return "Vous n'avez pas les droits pour modifier les types de chambre.";
  }
  const fallback = action === "delete" ? "Suppression impossible" : "Enregistrement impossible";
  return error?.message ? `${fallback} : ${error.message}` : `${fallback}.`;
}
