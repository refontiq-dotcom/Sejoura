import { redirect } from "next/navigation";

/**
 * Cette route est dépréciée.
 * La connexion se fait désormais directement sur la page d'accueil (/).
 * Toute visite de /login est redirigée vers le portail Séjoura.
 */
export default function LoginPage() {
  redirect("/");
}
