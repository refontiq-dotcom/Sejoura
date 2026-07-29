"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { Moon, Sun, Phone, Lock, Loader2, Building2, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "activate">("login");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();

      // Étape 1: Vérifier si l'utilisateur existe par téléphone
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, auth_user_id, role, is_active, full_name, tenant_id")
        .eq("phone", phone)
        .single();

      if (userError || !userData) {
        setError("Aucun compte trouvé avec ce numéro de téléphone.");
        setLoading(false);
        return;
      }

      if (!userData.is_active && mode === "login") {
        setError("Votre compte n'est pas encore activé. Utilisez l'activation.");
        setMode("activate");
        setLoading(false);
        return;
      }

      // Étape 2: Connexion avec Supabase Auth
      // Pour l'auth par téléphone, on utilise email comme workaround
      // (Supabase ne supporte pas directement l'auth par téléphone + mot de passe)
      const fakeEmail = `${phone}@sejoura.app`;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password: password,
      });

      if (authError) {
        setError("Numéro de téléphone ou mot de passe incorrect.");
        setLoading(false);
        return;
      }

      // Redirection selon le rôle
      if (userData.role === "super_admin") {
        router.push("/admin");
      } else if (userData.role === "menagere") {
        router.push("/menage");
      } else if (userData.role === "client") {
        router.push("/client");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
      setLoading(false);
    }
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();

      // Vérifier si l'utilisateur existe
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, auth_user_id, role, is_active, full_name, phone")
        .eq("phone", phone)
        .single();

      if (userError || !userData) {
        setError("Aucun compte trouvé avec ce numéro de téléphone.");
        setLoading(false);
        return;
      }

      if (userData.is_active) {
        setError("Ce compte est déjà activé. Utilisez la connexion normale.");
        setLoading(false);
        return;
      }

      if (!userData.auth_user_id) {
        // Créer l'utilisateur dans Supabase Auth
        const fakeEmail = `${phone}@sejoura.app`;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: fakeEmail,
          password: password,
        });

        if (authError) {
          setError("Erreur lors de la création du compte: " + authError.message);
          setLoading(false);
          return;
        }

        // Mettre à jour l'utilisateur avec l'auth_user_id et l'activer
        await supabase
          .from("users")
          .update({
            auth_user_id: authData.user?.id,
            is_active: true,
            activated_at: new Date().toISOString(),
          })
          .eq("id", userData.id);
      } else {
        // L'utilisateur Auth existe déjà, juste activer
        await supabase
          .from("users")
          .update({
            is_active: true,
            activated_at: new Date().toISOString(),
          })
          .eq("id", userData.id);
      }

      setError("");
      setMode("login");
      setPassword("");
      setLoading(false);
      // Afficher un message de succès
      setError("Compte activé avec succès ! Vous pouvez maintenant vous connecter.");
    } catch {
      setError("Une erreur est survenue lors de l'activation.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-indigo-950 dark:to-purple-950 p-4">
      {/* Bouton thème */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-md hover:shadow-lg transition-all"
        aria-label="Changer le thème"
      >
        {theme === "light" ? (
          <Moon className="w-5 h-5 text-slate-700" />
        ) : (
          <Sun className="w-5 h-5 text-yellow-400" />
        )}
      </button>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-xl mb-4">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Séjoura</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gestion de Résidences
          </p>
        </div>

        {/* Carte de connexion */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 animate-fade-in">
          {/* Onglets */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl">
            <button
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => {
                setMode("activate");
                setError("");
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                mode === "activate"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Première connexion
            </button>
          </div>

          <form onSubmit={mode === "login" ? handleLogin : handleActivate} className="space-y-5">
            {/* Téléphone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Numéro de téléphone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+225 07 00 00 00 00"
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {mode === "login" ? "Mot de passe" : "Créer un mot de passe"}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "login" ? "••••••••" : "Minimum 6 caractères"}
                  required
                  minLength={6}
                  className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div
                className={`p-3 rounded-xl text-sm ${
                  error.includes("succès")
                    ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                    : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                }`}
              >
                {error}
              </div>
            )}

            {/* Bouton */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {mode === "login" ? "Connexion..." : "Activation..."}
                </>
              ) : (
                <>{mode === "login" ? "Se connecter" : "Activer mon compte"}</>
              )}
            </button>
          </form>

          {/* Mot de passe oublié */}
          {mode === "login" && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setError("Contactez votre administrateur pour réinitialiser votre mot de passe (OTP SMS).")}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>
          )}
        </div>

        {/* Inscription entreprise */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vous souhaitez utiliser Séjoura pour votre résidence ?{" "}
            <button
              onClick={() => router.push("/register")}
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              Créer un compte entreprise
            </button>
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            © 2024 Séjoura. Tous droits réservés.
          </p>
        </div>
      </div>
    </div>
  );
}