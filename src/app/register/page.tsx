"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { Moon, Sun, Building2, User, Mail, Phone, Lock, Loader2, Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { getPlanPrice, formatFCFA } from "@/lib/utils";

type Lang = "fr" | "en";

const messages: Record<Lang, Record<string, string>> = {
  fr: {
    title: "Séjoura by Refontiq",
    subtitle: "Créer votre compte entreprise",
    step1Title: "Informations entreprise",
    step2Title: "Vos informations",
    companyName: "Nom de l'entreprise",
    city: "Ville",
    fullName: "Nom complet",
    email: "Email",
    phone: "Téléphone",
    password: "Mot de passe",
    continue: "Continuer",
    createAccount: "Créer mon compte",
    creating: "Création...",
    back: "Retour",
    alreadyAccount: "Déjà un compte ? Se connecter",
    successTitle: "Compte créé !",
    successDesc: "Votre essai gratuit de 30 jours a commencé. Vous pouvez maintenant vous connecter avec votre numéro de téléphone.",
    planLabel: "Plan Standard",
    planDesc: "5 hébergements max, 1 admin + 1 réceptionniste",
    signIn: "Se connecter",
    langLabel: "Lang",
  },
  en: {
    title: "Séjoura by Refontiq",
    subtitle: "Create your company account",
    step1Title: "Company information",
    step2Title: "Your information",
    companyName: "Company name",
    city: "City",
    fullName: "Full name",
    email: "Email",
    phone: "Phone",
    password: "Password",
    continue: "Continue",
    createAccount: "Create account",
    creating: "Creating...",
    back: "Back",
    alreadyAccount: "Already have an account? Sign in",
    successTitle: "Account created!",
    successDesc: "Your 30-day free trial has started. You can now sign in with your phone number.",
    planLabel: "Standard Plan",
    planDesc: "5 max residences, 1 admin + 1 receptionist",
    signIn: "Sign in",
    langLabel: "Lang",
  },
};

export default function RegisterPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sejoura-lang");
      if (stored === "en" || stored === "fr") return stored;
    }
    return "fr";
  });
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    city: "",
    password: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();

      const fakeEmail = `${formData.contactPhone}@sejoura.app`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: fakeEmail,
        password: formData.password,
      });

      if (authError) {
        setError("Erreur lors de la création du compte: " + authError.message);
        setLoading(false);
        return;
      }

      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          company_name: formData.companyName,
          contact_name: formData.contactName,
          contact_email: formData.contactEmail,
          contact_phone: formData.contactPhone,
          city: formData.city,
          country: "Côte d'Ivoire",
        })
        .select()
        .single();

      if (tenantError) {
        setError("Erreur lors de la création de l'entreprise: " + tenantError.message);
        setLoading(false);
        return;
      }

      await supabase.from("subscriptions").insert({
        tenant_id: tenantData.id,
        plan: "standard",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        monthly_price: 15000,
        is_soft_locked: false,
      });

      await supabase.from("users").insert({
        tenant_id: tenantData.id,
        auth_user_id: authData.user?.id,
        role: "admin_residence",
        full_name: formData.contactName,
        phone: formData.contactPhone,
        email: formData.contactEmail,
        is_active: true,
        activated_at: new Date().toISOString(),
      });

      setStep(3);
      setLoading(false);
    } catch {
      setError("Une erreur est survenue lors de l'inscription.");
      setLoading(false);
    }
  }

  const t = messages[lang];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-indigo-950 dark:to-purple-950 p-4">
      {/* Language selector */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <span className="text-xs text-slate-400 dark:text-slate-500 mr-1">{t.langLabel}</span>
        <button
          onClick={() => {
            const next = lang === "fr" ? "en" : "fr";
            setLang(next);
            localStorage.setItem("sejoura-lang", next);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors backdrop-blur-sm"
        >
          {lang === "fr" ? "FR" : "EN"}
        </button>
      </div>

      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-md hover:shadow-lg transition-all"
        aria-label="Changer le thème"
      >
        {theme === "light" ? <Moon className="w-5 h-5 text-slate-700" /> : <Sun className="w-5 h-5 text-yellow-400" />}
      </button>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-800 shadow-xl mb-4 flex items-center justify-center overflow-hidden">
            <Image src="/logo.png" alt="Séjoura by Refontiq" width={96} height={96} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t.subtitle}</p>
        </div>

        {step === 3 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 animate-fade-in text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t.successTitle}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {t.successDesc}
            </p>
            <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 mb-6">
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                {t.planLabel} — {formatFCFA(getPlanPrice("standard"))}/mois
              </p>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                {t.planDesc}
              </p>
            </div>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
            >
              {t.signIn}
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 animate-fade-in">
            <div className="flex items-center gap-2 mb-6">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= 1 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"}`}>1</div>
              <div className={`flex-1 h-1 rounded ${step >= 2 ? "bg-indigo-600" : "bg-slate-200"}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= 2 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"}`}>2</div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {step === 1 && (
                <>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t.step1Title}</h2>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.companyName}</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input name="companyName" value={formData.companyName} onChange={handleChange} required placeholder="Résidence Palm Beach"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.city}</label>
                    <input name="city" value={formData.city} onChange={handleChange} required placeholder="Abidjan"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>

                  <button type="button" onClick={() => { if (formData.companyName && formData.city) setStep(2); }}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl transition-all">
                    {t.continue}
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t.step2Title}</h2>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.fullName}</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input name="contactName" value={formData.contactName} onChange={handleChange} required placeholder="Jean Kouassi"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.email}</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input name="contactEmail" type="email" value={formData.contactEmail} onChange={handleChange} required placeholder="contact@entreprise.com"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.phone}</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input name="contactPhone" type="tel" value={formData.contactPhone} onChange={handleChange} required placeholder="+225 07 00 00 00 00"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.password}</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input name="password" type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} required minLength={6} placeholder="Minimum 6 caractères"
                        className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {error && <div className="p-3 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">{error}</div>}

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(1)} className="px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                      <ArrowLeft className="w-4 h-4" /> {t.back}
                    </button>
                    <button type="submit" disabled={loading} className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                      {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> {t.creating}</> : t.createAccount}
                    </button>
                  </div>
                </>
              )}
            </form>

            <div className="mt-6 text-center">
              <button onClick={() => router.push("/login")} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                {t.alreadyAccount}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}