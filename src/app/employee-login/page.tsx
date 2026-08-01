"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { toast } from "sonner";
import { Moon, Sun, Loader2, Eye, EyeOff, Phone, ShieldCheck, ArrowLeft } from "lucide-react";
import Image from "next/image";

export default function EmployeeLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      }
    >
      <EmployeeLoginFormContent />
    </Suspense>
  );
}

function EmployeeLoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPhone = searchParams.get("phone") || "";

  const { theme, toggleTheme } = useTheme();
  const [phone, setPhone] = useState(initialPhone);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({});

  useEffect(() => {
    if (initialPhone) {
      setPhone(initialPhone);
    }
  }, [initialPhone]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setErrors({ phone: "Numéro de téléphone requis." });
      return;
    }
    if (!password || password.length < 6) {
      setErrors({ password: "Le mot de passe doit comporter au moins 6 caractères." });
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // 1. Vérification stricte : le numéro de téléphone doit être pré-enregistré par l'employeur
      const { data: matchedUser, error: searchErr } = await supabase
        .from("users")
        .select("*")
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (searchErr || !matchedUser) {
        toast.error(
          "Ce numéro n'a été enregistré par aucun employeur. Seul le personnel pré-inscrit par la direction de l'établissement peut se connecter."
        );
        setLoading(false);
        return;
      }

      const loginEmail =
        matchedUser.email || `${cleanPhone.replace(/[^0-9]/g, "")}@employe.sejoura.com`;

      // 2. Tentative de connexion par mot de passe
      let sessionUserId = "";
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (authError) {
        // 3. Première connexion / Activation du compte employé
        if (!matchedUser.is_active || authError.message.includes("Invalid login credentials")) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: loginEmail,
            password: password,
            options: {
              data: { full_name: matchedUser.full_name, role: matchedUser.role },
            },
          });

          if (!signUpError && signUpData.user) {
            sessionUserId = signUpData.user.id;
          } else {
            toast.error("Mot de passe incorrect ou compte non activé.");
            setLoading(false);
            return;
          }
        } else {
          toast.error("Mot de passe incorrect ou compte non activé.");
          setLoading(false);
          return;
        }
      } else if (authData.session) {
        sessionUserId = authData.session.user.id;
      }

      if (sessionUserId) {
        // Appeler notre API serveur (Service Role Admin Client) pour lier et activer l'employé sans être bloqué par RLS
        await fetch("/api/employee-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: cleanPhone,
            authUserId: sessionUserId,
            email: loginEmail,
          }),
        });
      }

      toast.success(`Bienvenue ${matchedUser.full_name} !`);
      setTimeout(() => {
        if (matchedUser.role === "menagere") {
          router.push("/menage");
        } else {
          router.push("/dashboard");
        }
      }, 800);
    } catch (err) {
      toast.error("Une erreur est survenue lors de la connexion.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 relative overflow-hidden">
      {/* Background glow elements */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Theme toggle & Back button */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-2 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> Espace Gestionnaire
        </Link>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
          aria-label="Basculer le thème"
        >
          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
        </button>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-purple-900/10 dark:shadow-purple-900/30 p-6 sm:p-8 border border-purple-500/20 relative z-10 animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white mb-3 shadow-lg shadow-purple-500/20">
            <Phone className="w-7 h-7" />
          </div>

          <Image
            src="/logo-noir.svg"
            alt="Séjoura"
            width={120}
            height={30}
            className="mx-auto mb-2 dark:invert"
          />

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Portail Employés & Personnel
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Connexion réservée au personnel enregistré par leur établissement
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-xs text-purple-800 dark:text-purple-300 flex items-start gap-2.5 mb-6">
          <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
          <p>
            Saisissez le numéro de téléphone que votre employeur a enregistré dans la section Employés pour vous connecter.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Numéro de téléphone
            </label>
            <div className="relative">
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  clearErrors();
                }}
                placeholder="+225 07 00 00 00 00"
                required
                className={`w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-sm ${
                  errors.phone ? "border-red-500" : "border-slate-200 dark:border-slate-700"
                }`}
              />
            </div>
            {errors.phone && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.phone}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearErrors();
                }}
                placeholder="Entrer ou définir votre mot de passe"
                required
                minLength={6}
                className={`w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all pr-12 text-sm ${
                  errors.password ? "border-red-500" : "border-slate-200 dark:border-slate-700"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Connexion en cours...
              </>
            ) : (
              "Se connecter à mon espace"
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-400">
            Problème de connexion ? Contactez le responsable de votre établissement pour vérifier votre numéro.
          </p>
        </div>
      </div>
    </div>
  );
}
