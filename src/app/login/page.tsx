"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { Moon, Sun, Phone, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import Image from "next/image";

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

        await supabase
          .from("users")
          .update({
            auth_user_id: authData.user?.id,
            is_active: true,
            activated_at: new Date().toISOString(),
          })
          .eq("id", userData.id);
      } else {
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
      setError("Compte activé avec succès ! Vous pouvez maintenant vous connecter.");
    } catch {
      setError("Une erreur est survenue lors de l'activation.");
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        setError("Erreur lors de la connexion Google: " + error.message);
        setLoading(false);
      }
    } catch {
      setError("Une erreur est survenue lors de la connexion Google.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-indigo-950 dark:to-purple-950 p-4">
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
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-800 shadow-xl mb-4 flex items-center justify-center overflow-hidden">
            <Image src="/logo.png" alt="Séjoura by Refontiq" width={96} height={96} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Séjoura by Refontiq</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gestion de Résidences
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 animate-fade-in">
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

          {mode === "login" && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-600" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                    ou continuer avec
                  </span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="mt-4 w-full py-3.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Se connecter avec Google"
                )}
              </button>
            </div>
          )}

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

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vous souhaitez utiliser Séjoura by Refontiq pour votre résidence ?{" "}
            <button
              onClick={() => router.push("/register")}
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              Créer un compte entreprise
            </button>
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            © 2024 Séjoura by Refontiq. Tous droits réservés.
          </p>
        </div>
      </div>
    </div>
  );
}