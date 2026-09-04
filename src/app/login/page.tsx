import { redirect } from "next/navigation";

// Alias de compatibilité : pendant un déploiement buggé, la racine renvoyait
// vers /login (route inexistante) et des navigateurs/PWA ont mémorisé cette
// URL. On redirige vers la page de connexion officielle, qui EST la racine.
export default function LoginPage() {
  redirect("/");
}
