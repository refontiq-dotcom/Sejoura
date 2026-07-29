"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { Moon, Sun, Loader2, Eye, EyeOff } from "lucide-react";
import Image from "next/image";

type Lang = "fr" | "en";

const messages: Record<Lang, Record<string, string>> = {
  fr: {
    welcome: "Bienvenue sur Séjoura by Refontiq",
    subtitle: "Gestion centralisée, automatisation intelligente et suivi en temps réel de vos résidences.",
    tagline: "Simplifiez la gestion de vos hébergements.",
    login: "Se connecter",
    signup: "Créer un compte",
    fullName: "Nom complet",
    email: "Adresse e-mail",
    password: "Mot de passe",
    terms: "J'accepte les conditions d'utilisation",
    signUp: "S'inscrire",
    signIn: "Se connecter",
    signUpWith: "Continuer avec Google",
    signInWith: "Se connecter avec Google",
    or: "ou",
    alreadyAccount: "Déjà un compte ?",
    noAccount: "Pas encore de compte ?",
    creating: "Création du compte...",
    signing: "Connexion en cours...",
    googleError: "Erreur lors de la connexion Google.",
    generalError: "Une erreur est survenue. Veuillez réessayer.",
    passwordShort: "Le mot de passe doit comporter au moins 6 caractères.",
    termsError: "Vous devez accepter les conditions d'utilisation.",
    theme: "Changer le thème",
    langLabel: "Langue",
  },
  en: {
    welcome: "Welcome to Séjoura by Refontiq",
    subtitle: "Centralized management, smart automation, and real-time tracking for your residences.",
    tagline: "Simplify your property management.",
    login: "Sign in",
    signup: "Create account",
    fullName: "Full name",
    email: "Email address",
    password: "Password",
    terms: "I agree to the terms and conditions",
    signUp: "Sign Up",
    signIn: "Sign in",
    signUpWith: "Continue with Google",
    signInWith: "Sign in with Google",
    or: "or",
    alreadyAccount: "Already have an account?",
    noAccount: "Don't have an account yet?",
    creating: "Creating account...",
    signing: "Signing in...",
    googleError: "Google sign-in error.",
    generalError: "An error occurred. Please try again.",
    passwordShort: "Password must be at least 6 characters.",
    termsError: "You must accept the terms and conditions.",
    theme: "Toggle theme",
    langLabel: "Language",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [lang, setLang] = useState<Lang>("fr");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = messages[lang];

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!agreeTerms) {
      setError(t.termsError);
      return;
    }

    if (password.length < 6) {
      setError(t.passwordShort);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (authData.user) {
        await supabase.from("users").insert({
          auth_user_id: authData.user.id,
          full_name: fullName,
          email,
          phone: "",
          role: "client",
          is_active: true,
          tenant_id: null,
        });
      }

      setLoading(false);
      router.push("/dashboard");
    } catch {
      setError(t.generalError);
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError(t.passwordShort);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const fakeEmail = `${email}@sejoura.app`;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password,
      });

      if (authError) {
        setError("Numéro de téléphone ou mot de passe incorrect.");
        setLoading(false);
        return;
      }

      setLoading(false);
      router.push("/dashboard");
    } catch {
      setError(t.generalError);
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        setError(t.googleError);
        setLoading(false);
      }
    } catch {
      setError(t.generalError);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-slate-950">
      {/* Language selector */}
      <div className="absolute top-4 right-20 flex items-center gap-2 z-10">
        <span className="text-xs text-slate-400 dark:text-slate-500 mr-1">{t.langLabel}</span>
        <button
          onClick={() => setLang(lang === "fr" ? "en" : "fr")}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          {lang === "fr" ? "FR" : "EN"}
        </button>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 shadow-md hover:shadow-lg transition-all z-10"
        aria-label={t.theme}
      >
        {theme === "light" ? (
          <Moon className="w-5 h-5 text-slate-700" />
        ) : (
          <Sun className="w-5 h-5 text-yellow-400" />
        )}
      </button>

      {/* Left Panel — Blue with wave divider */}
      <div className="relative lg:w-[45%] w-full min-h-[40vh] lg:min-h-screen bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 flex flex-col items-center justify-center p-8 lg:p-12 overflow-hidden">
        {/* Wave divider — smooth curved boundary */}
        <div className="absolute top-0 right-0 h-full w-[15%] lg:w-[12%]">
          <svg
            viewBox="0 0 200 800"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            <path
              d="M200,0 C185,80 170,200 175,320 C180,440 160,560 165,680 C168,740 172,770 175,800 L200,800 L200,0 Z"
              fill="white"
            />
          </svg>
        </div>

        {/* Decorative ambient circles */}
        <div className="absolute top-10 right-12 w-80 h-80 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="absolute bottom-10 left-8 w-64 h-64 rounded-full bg-blue-300/10 blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-blue-400/8 blur-3xl" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          {/* Logo — integrated naturally into the blue background, no box */}
          <div className="mb-8 opacity-90 hover:opacity-100 transition-opacity">
            <Image
              src="/logo.png"
              alt="Séjoura by Refontiq"
              width={120}
              height={120}
            />
          </div>

          {/* Welcome text */}
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-5 leading-tight">
            {t.welcome}
          </h1>
          <p className="text-blue-100 text-base leading-relaxed mb-3">
            {t.subtitle}
          </p>
          <p className="text-blue-200/80 text-sm italic mb-8">
            {t.tagline}
          </p>

          {/* Stats */}
          <div className="flex gap-10 text-white/70">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">100+</p>
              <p className="text-[10px] uppercase tracking-widest mt-1.5">
                {lang === "fr" ? "Résidences" : "Residences"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">500+</p>
              <p className="text-[10px] uppercase tracking-widest mt-1.5">
                {lang === "fr" ? "Chambres" : "Rooms"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">24/7</p>
              <p className="text-[10px] uppercase tracking-widest mt-1.5">
                {lang === "fr" ? "Support" : "Support"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — White Form */}
      <div className="lg:w-[55%] w-full flex items-center justify-center p-6 lg:p-12 bg-white dark:bg-slate-950">
        <div className="w-full max-w-md">
          {/* Tab switcher */}
          <div className="flex gap-1 mb-8 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t.login}
            </button>
            <button
              onClick={() => { setMode("signup"); setError(""); }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                mode === "signup"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t.signup}
            </button>
          </div>

          {/* Form header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {mode === "login" ? t.signIn : t.signUp}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">
              {mode === "login" ? t.alreadyAccount : t.noAccount}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={mode === "signup" ? handleSignUp : handleLogin} className="space-y-5">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t.fullName}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jean Kouassi"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "signup" ? "jean@entreprise.com" : "jean@entreprise.com"}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t.password}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Minimum 6 caractères" : "••••••••"}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-white dark:bg-slate-800"
                  />
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                  {t.terms}
                </span>
              </label>
            )}

            {error && (
              <div className="p-3 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {mode === "signup" ? t.creating : t.signing}
                </>
              ) : (
                mode === "signup" ? t.signUp : t.signIn
              )}
            </button>
          </form>

          {/* Social Auth — Google only */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-white dark:bg-slate-950 text-slate-400 dark:text-slate-500 text-sm font-medium">
                  {t.or}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="mt-4 w-full py-3.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                mode === "signup" ? t.signUpWith : t.signInWith
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}