"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ForgotPasswordLink } from "@/components/auth/forgot-password-link";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { toast } from "sonner";
import { Moon, Sun, Loader2, Eye, EyeOff, Calendar, Wallet, Building2, Phone, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { PasswordStrength } from "@/components/auth/password-strength";

type Lang = "fr" | "en";

const messages: Record<Lang, Record<string, string>> = {
  fr: {
    welcome: "Propulsez la gestion de vos établissements.",
    subtitle: "La plateforme intelligente qui centralise, automatise et simplifie l'exploitation de vos établissements.",
    tagline: "Centralisez. Automatisez. Simplifiez.",
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
    alreadyAccount: "Heureux de vous revoir !",
    noAccount: "Créez votre espace en quelques secondes",
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
    welcome: "Elevate your property management.",
    subtitle: "The intelligent platform that centralizes, automates and simplifies the operation of your furnished accommodations.",
    tagline: "Centralize. Automate. Simplify.",
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
    alreadyAccount: "Welcome back!",
    noAccount: "Create your space in seconds",
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  );
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPhone = searchParams.get("phone") || "";
  const initialModeParam = searchParams.get("mode");

  const { theme, toggleTheme } = useTheme();
  const { lang, toggle: toggleLang } = useLanguage();
  const [mode, setMode] = useState<"login" | "signup" | "employee">(
    initialPhone || initialModeParam === "employee" ? "employee" : "login"
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [employeePhone, setEmployeePhone] = useState(initialPhone);
  const [employeePassword, setEmployeePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; fullName?: string; phone?: string }>({});
  const t = messages[lang];

  useEffect(() => {
    if (initialPhone || initialModeParam === "employee") {
      const target = initialPhone
        ? `/employee-login?phone=${encodeURIComponent(initialPhone)}`
        : "/employee-login";
      router.push(target);
    }
  }, [initialPhone, initialModeParam, router]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);



  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();

    const newErrors: typeof errors = {};

    if (!fullName.trim()) {
      newErrors.fullName = t.fullName + " requis.";
    }

    if (!isValidEmail(email)) {
      newErrors.email = "Adresse e-mail invalide.";
    }

    if (!agreeTerms) {
      toast.error(t.termsError);
      return;
    }

    if (password.length < 6) {
      newErrors.password = t.passwordShort;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Veuillez corriger les erreurs du formulaire.");
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
        toast.error(t.generalError);
        setLoading(false);
        return;
      }

      if (authData.user) {
        toast.success("Compte créé avec succès !");
        setFullName("");
        setEmail("");
        setPassword("");
        setAgreeTerms(false);
        setErrors({});
        setMode("login");
        setLoading(false);
      }
    } catch {
      toast.error(t.generalError);
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();

    const newErrors: typeof errors = {};

    if (!isValidEmail(email)) {
      newErrors.email = "Adresse e-mail invalide.";
    }

    if (password.length < 6) {
      newErrors.password = t.passwordShort;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Veuillez corriger les erreurs du formulaire.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        toast.error("Adresse e-mail ou mot de passe incorrect.");
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      let targetRoute = "/dashboard";
      if (session) {
        const { data: userData } = await supabase
          .from("users")
          .select("role")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (userData?.role === "menagere") {
          targetRoute = "/menage";
        }
      }

      toast.success("Connexion réussie !");
      setEmail("");
      setPassword("");
      setTimeout(() => {
        router.push(targetRoute);
      }, 800);
    } catch {
      toast.error(t.generalError);
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
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
        toast.error(t.googleError);
        setLoading(false);
      }
    } catch {
      toast.error(t.generalError);
      setLoading(false);
    }
  }

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Language selector */}
      <div className="absolute top-3 right-16 flex items-center gap-2 z-10">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 mr-1">{t.langLabel}</span>
          <button
            onClick={toggleLang}
            className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label={t.langLabel}
          >
            {lang === "fr" ? "FR" : "EN"}
          </button>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-3 right-3 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shadow-sm hover:shadow-md transition-all z-10"
        aria-label="Basculer le thème"
      >
        {theme === "light" ? (
          <Moon className="w-4 h-4 text-slate-700" />
        ) : (
          <Sun className="w-4 h-4 text-yellow-400" />
        )}
      </button>

      {/* Left Panel — Blue with organic wave divider */}
      <div className="relative lg:w-[45%] w-full h-full bg-blue-600 flex items-center justify-center p-4 lg:p-8 z-10">
        {/* Organic wave divider overflowing into the right panel */}
        <div className="hidden lg:block absolute inset-y-0 left-full w-[120px] xl:w-[150px] h-full pointer-events-none z-0 -ml-[1px]">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full text-blue-600" fill="currentColor">
            <path d="M0,0 Q100,30 50,60 T0,100 Z" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center max-w-[380px]">
          <div className="mb-8 inline-flex items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-4 shadow-xl">
            <Image
              src="/logo-noir.svg"
              alt="Séjoura logo"
              width={200}
              height={200}
              className="w-full h-auto max-w-[200px]"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-3 leading-tight tracking-tight">
            {t.welcome}
          </h1>

          <p className="text-sky-100 text-sm sm:text-base leading-relaxed mb-6 max-w-xs">
            {t.subtitle}
          </p>

          <div className="flex flex-col gap-3 w-full mt-2 text-left">
             <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white/20 flex items-center gap-4 transition hover:bg-white/20">
               <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                 <Calendar className="w-5 h-5" />
               </div>
               <div>
                 <h3 className="font-semibold text-white text-sm">Réservations</h3>
                 <p className="text-xs text-sky-100/90 mt-0.5">Centralisez vos plannings en un clin d&apos;œil.</p>
               </div>
             </div>
             
             <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white/20 flex items-center gap-4 transition hover:bg-white/20">
               <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                 <Wallet className="w-5 h-5" />
               </div>
               <div>
                 <h3 className="font-semibold text-white text-sm">Finances</h3>
                 <p className="text-xs text-sky-100/90 mt-0.5">Suivi financier et rentabilité en temps réel.</p>
               </div>
             </div>

             <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white/20 flex items-center gap-4 transition hover:bg-white/20">
               <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                 <Building2 className="w-5 h-5" />
               </div>
               <div>
                 <h3 className="font-semibold text-white text-sm">Gestion</h3>
                 <p className="text-xs text-sky-100/90 mt-0.5">Pilotage intuitif via vos tableaux de bord.</p>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Right Panel — White Form */}
      <div className="lg:w-[55%] w-full h-full flex items-center justify-center p-3 lg:p-6 bg-slate-50 dark:bg-slate-950">
        <div className="relative w-full max-w-md bg-white dark:bg-slate-950 rounded-2xl shadow-2xl shadow-blue-900/5 dark:shadow-blue-900/20 p-5 lg:p-7 overflow-hidden border border-blue-500/20 dark:border-blue-500/30">
          <div className="relative z-10">
            {/* Tab switcher */}
            <div className="flex gap-1 mb-5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 py-2 px-3 rounded-lg transition-all ${
                  mode === "login"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {t.login}
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 py-2 px-3 rounded-lg transition-all ${
                  mode === "signup"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {t.signup}
              </button>
            </div>

            {/* Form header */}
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {mode === "login" ? t.signIn : t.signUp}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
                {mode === "login" ? t.alreadyAccount : t.noAccount}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={mode === "signup" ? handleSignUp : handleLogin} className="space-y-3">
              {mode === "signup" && (
                <div>
                  <label htmlFor="signup-fullname" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.fullName}
                  </label>
                  <input
                    id="signup-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); clearErrors(); }}
                    placeholder="Jean Kouassi"
                    required
                    autoComplete="name"
                    className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm ${
                      errors.fullName ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-600"
                    }`}
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.fullName}</p>
                  )}
                </div>
              )}

              <div>
                <label htmlFor={mode === "signup" ? "signup-email" : "login-email"} className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.email}
                </label>
                <input
                  id={mode === "signup" ? "signup-email" : "login-email"}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
                  placeholder={mode === "signup" ? "jean@entreprise.com" : "jean@entreprise.com"}
                  required
                  autoComplete="email"
                  className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm ${
                    errors.email ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-600"
                  }`}
                />
                {errors.email && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor={mode === "signup" ? "signup-password" : "login-password"} className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.password}
                </label>
                <div className="relative">
                  <input
                    id={mode === "signup" ? "signup-password" : "login-password"}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Minimum 6 caractères" : "••••••••"}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  {errors.password && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.password}</p>
                  )}
                  {mode === "signup" && <PasswordStrength password={password} />}
                </div>
              </div>

              {mode === "login" && <ForgotPasswordLink />}

              {mode === "signup" && (
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <div className="relative mt-0.5">
                    <input
                      id="terms"
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                    {t.terms}{" "}
                    <Link
                      href="/cgu"
                      className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
                    >
                      CGU
                    </Link>
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {mode === "signup" ? t.creating : t.signing}
                  </>
                ) : (
                  mode === "signup" ? t.signUp : t.signIn
                )}
              </button>
            </form>

            {/* Social Auth — Google only */}
            <div className="mt-5">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 bg-white dark:bg-slate-950 text-slate-400 dark:text-slate-500 text-xs font-medium">
                    {t.or}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading}
                className="mt-3 w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  mode === "signup" ? t.signUpWith : t.signInWith
                )}
              </button>
            </div>

            {/* Lien portail employé */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
              <Link
                href="/employee-login"
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium inline-flex items-center gap-1"
              >
                Vous êtes un employé ? Accédez au portail employé →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
