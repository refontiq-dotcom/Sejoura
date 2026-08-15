"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Delete, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import EmployeePinLogin, {
  type BiometricAuthPayload,
  type PinSubmitResult,
} from "@/components/auth/employee-pin-login";

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = "phone" | "set-pin" | "verify-pin";

interface EmployeeProfile {
  userId: string;
  fullName: string;
  role: string;
  firstLogin: boolean;
  primaryColor?: string;
  companyName?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

// Indicatifs disponibles
const COUNTRY_CODES = [
  { code: "+225", label: "🇨🇮 +225" },
  { code: "+221", label: "🇸🇳 +221" },
  { code: "+223", label: "🇲🇱 +223" },
  { code: "+226", label: "🇧🇫 +226" },
  { code: "+228", label: "🇹🇬 +228" },
  { code: "+229", label: "🇧🇯 +229" },
  { code: "+237", label: "🇨🇲 +237" },
  { code: "+224", label: "🇬🇳 +224" },
];

// ─── Export default ───────────────────────────────────────────────────────────
export default function EmployeeLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
        </div>
      }
    >
      <EmployeeLoginContent />
    </Suspense>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
function EmployeeLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme, setPrimaryColor, primaryColor: themePrimaryColor } = useTheme();

  // État machine
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);

  // Étape 1 — Téléphone
  const [dialCode, setDialCode] = useState("+225");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Profil employé récupéré
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);

  // Rôle issu de la dernière authentification réussie (pour la redirection)
  const [lastRole, setLastRole] = useState<string | null>(null);

  // Couleur dynamique de la marque de l'établissement
  const [brandColor, setBrandColor] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sejoura-primary-color") || "#0C1C33";
    }
    return "#0C1C33";
  });

  // Animation de transition
  const [transitioning, setTransitioning] = useState(false);

  const countryCodes = COUNTRY_CODES;

  // Synchroniser la couleur du thème quand la couleur de marque change
  useEffect(() => {
    if (brandColor) {
      setPrimaryColor(brandColor);
    }
  }, [brandColor, setPrimaryColor]);

  // ── Clavier numérique pour le téléphone ─────────────────────────────────────
  const handlePhoneKey = useCallback((key: string) => {
    setPhoneError("");
    if (key === "⌫") {
      setPhone((prev) => prev.slice(0, -1));
    } else if (key !== "" && /^\d$/.test(key)) {
      setPhone((prev) => (prev.length < 10 ? prev + key : prev));
    }
  }, []);

  // ── Paramètres d'URL (Pré-remplissage et messages d'erreur) ────────────────
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "revoked") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhoneError("Votre accès a été révoqué par votre employeur.");
      toast.error("Votre accès a été révoqué par votre employeur.");
    }

    const phoneParam = searchParams.get("phone");
    if (phoneParam) {
      let clean = phoneParam.trim();
      if (clean.startsWith("+")) {
        const codeMatch = COUNTRY_CODES.find((c) => clean.startsWith(c.code));
        if (codeMatch) {
          setDialCode(codeMatch.code);
          clean = clean.slice(codeMatch.code.length);
        }
      }
      const digits = clean.replace(/[^0-9]/g, "");
      if (digits) {
        setPhone(digits);
      }
    }
  }, [searchParams]);

  // ── Transition animée entre étapes ──────────────────────────────────────────
  const goToStep = useCallback((nextStep: Step) => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setTransitioning(false);
    }, 200);
  }, []);

  // ── Étape 1 : Vérification du numéro ────────────────────────────────────────
  const handlePhoneSubmit = useCallback(async () => {
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      setPhoneError("Veuillez saisir un numéro valide.");
      return;
    }

    setLoading(true);
    setPhoneError("");

    try {
      const fullPhone = `${dialCode}${cleanPhone}`;
      const res = await fetch(`/api/employee-verify?phone=${encodeURIComponent(fullPhone)}`);
      const data = await res.json();

      if (!data.found) {
        setPhoneError(
          data.error ||
          "Ce numéro n'est pas enregistré. Contactez le responsable de votre établissement."
        );
        return;
      }

      if (data.primaryColor) {
        setBrandColor(data.primaryColor);
        setPrimaryColor(data.primaryColor);
      }

      setProfile({
        userId: data.userId,
        fullName: data.fullName,
        role: data.role,
        firstLogin: data.firstLogin,
        primaryColor: data.primaryColor,
        companyName: data.companyName,
      });

      if (data.firstLogin || !data.hasPinCode) {
        goToStep("set-pin");
      } else {
        goToStep("verify-pin");
      }
    } catch {
      setPhoneError("Erreur de connexion. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, [phone, dialCode, goToStep, setPrimaryColor]);

  // ── Écouteur de clavier physique (étape téléphone uniquement) ───────────────
  // NB : l'étape PIN gère elle-même son clavier dans <EmployeePinLogin />.
  useEffect(() => {
    if (step !== "phone") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        if (e.key === "Enter") {
          e.preventDefault();
          handlePhoneSubmit();
        }
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        handlePhoneKey(e.key);
      } else if (e.key === "Backspace") {
        handlePhoneKey("⌫");
      } else if (e.key === "Enter") {
        handlePhoneSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, handlePhoneKey, handlePhoneSubmit]);

  // ── Connexion via les identifiants internes (PIN ou biométrie) ──────────────
  const signInWithPayload = useCallback(
    async (data: { loginEmail: string; internalPassword: string }) => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: data.loginEmail,
        password: data.internalPassword,
      });
      return !error;
    },
    []
  );

  // ── Vérification du PIN (reconnexion) ───────────────────────────────────────
  const handlePinVerify = useCallback(
    async (pin: string): Promise<PinSubmitResult> => {
      if (!profile) return { success: false, error: "Profil introuvable." };
      try {
        const res = await fetch("/api/employee-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", userId: profile.userId, pin }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          return { success: false, error: data.error || "Code secret incorrect." };
        }

        const signedIn = await signInWithPayload(data);
        if (!signedIn) {
          return { success: false, error: "Erreur d'authentification. Contactez votre responsable." };
        }

        setLastRole(data.role || profile.role);
        toast.success(`Bienvenue, ${profile.fullName} !`);
        return { success: true };
      } catch {
        return { success: false, error: "Erreur serveur. Réessayez." };
      }
    },
    [profile, signInWithPayload]
  );

  // ── Définition du PIN (première connexion) ──────────────────────────────────
  const handlePinSet = useCallback(
    async (pin: string): Promise<PinSubmitResult> => {
      if (!profile) return { success: false, error: "Profil introuvable." };
      try {
        const res = await fetch("/api/employee-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set", userId: profile.userId, pin }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          return { success: false, error: data.error || "Erreur lors de la définition du code." };
        }

        const signedIn = await signInWithPayload(data);
        if (!signedIn) {
          return { success: false, error: "Erreur d'authentification. Contactez votre responsable." };
        }

        setLastRole(data.role || profile.role);
        toast.success(`Bienvenue, ${profile.fullName} ! Code configuré avec succès.`);
        return { success: true };
      } catch {
        return { success: false, error: "Erreur serveur. Réessayez." };
      }
    },
    [profile, signInWithPayload]
  );

  // ── Authentification biométrique (Face ID / Empreinte) ──────────────────────
  const handleBiometricComplete = useCallback(
    async (payload: BiometricAuthPayload): Promise<PinSubmitResult> => {
      const signedIn = await signInWithPayload(payload);
      if (!signedIn) {
        return { success: false, error: "Erreur d'authentification. Contactez votre responsable." };
      }
      setLastRole(payload.role);
      toast.success(`Bienvenue, ${payload.fullName} !`);
      return { success: true };
    },
    [signInWithPayload]
  );

  // ── Redirection après authentification réussie ──────────────────────────────
  const handleFinish = useCallback(() => {
    window.setTimeout(() => {
      router.push(lastRole === "menagere" ? "/menage" : "/dashboard");
    }, 400);
  }, [router, lastRole]);

  // ── Retour à l'étape téléphone ──────────────────────────────────────────────
  const handleBackToPhone = useCallback(() => {
    setLastRole(null);
    setProfile(null);
    goToStep("phone");
  }, [goToStep]);

  // ── Mot de passe oublié ─────────────────────────────────────────────────────
  const handleForgotPin = useCallback(() => {
    toast.info("Contactez le responsable de votre établissement pour réinitialiser votre code.");
  }, []);

  const currentAccent = brandColor || themePrimaryColor || "#0C1C33";

  // ── Étape 2 : PIN (composant dédié, plein écran) ────────────────────────────
  if ((step === "set-pin" || step === "verify-pin") && profile) {
    return (
      <EmployeePinLogin
        employee={{
          userId: profile.userId,
          fullName: profile.fullName,
          role: profile.role,
          companyName: profile.companyName,
          primaryColor: profile.primaryColor,
        }}
        mode={step === "set-pin" ? "set" : "verify"}
        accentColor={currentAccent}
        onPinComplete={step === "set-pin" ? handlePinSet : handlePinVerify}
        onBiometricComplete={handleBiometricComplete}
        onFinish={handleFinish}
        onBack={handleBackToPhone}
        onSwitchUser={handleBackToPhone}
        onForgotPin={handleForgotPin}
      />
    );
  }

  // ── Étape 1 : Saisie Téléphone ──────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full overflow-hidden bg-[var(--background)] flex items-center justify-center p-3 relative font-sans select-none">
      {/* Halo lumineux dynamique basé sur la couleur de marque */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[140px] opacity-25 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: currentAccent }}
      />

      {/* Card principale ultra-compacte sans scroll */}
      <div className="relative z-10 w-full max-w-[380px] bg-white dark:bg-slate-900/90 dark:backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-5 flex flex-col items-center justify-between text-slate-900 dark:text-white transition-all duration-300 max-h-[95vh]">

        {/* Top bar avec logo et toggle thème */}
        <div className="w-full flex items-center justify-between h-9 mb-2">
          <div className="w-8" />

          <div className="flex items-center justify-center">
            <Image
              src="/logo-sejoura.png"
              alt="Séjoura"
              width={140}
              height={40}
              className="object-contain h-9 w-auto dark:brightness-0 dark:invert"
              priority
            />
          </div>

          <div className="w-8 flex justify-end">
            <button onClick={toggleTheme} className="p-1.5 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={theme === "light" ? "Activer le mode sombre" : "Activer le mode clair"}>
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
            </button>
          </div>
        </div>

        {/* Étape 1 : Saisie Téléphone */}
        <div className={`w-full flex flex-col items-center my-auto transition-all duration-200 ${transitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}>
          <div className="w-full text-center space-y-3">
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                Portail Espace Employés
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Saisissez votre numéro mobile enregistré
              </p>
            </div>

            {/* Saisie numéro compacte */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-inner">
              <select
                value={dialCode}
                onChange={(e) => setDialCode(e.target.value)}
                className="bg-white dark:bg-slate-700 text-xs font-bold px-2 py-1.5 rounded-xl text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-600 cursor-pointer"
              >
                {countryCodes.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>

              <div className="flex-1 flex items-center justify-start px-2 font-mono text-base font-bold text-slate-900 dark:text-white tracking-wider overflow-hidden">
                {phone ? (
                  <span>{phone}</span>
                ) : (
                  <span className="text-slate-400 font-normal text-xs">07 00 00 00 00</span>
                )}
                <span className="w-0.5 h-4 ml-0.5 animate-pulse rounded-full" style={{ backgroundColor: currentAccent }} />
              </div>
            </div>

            {phoneError && (
              <p className="text-xs text-red-500 font-medium animate-shake">
                {phoneError}
              </p>
            )}
          </div>
        </div>

        {/* Pavé Numérique Ultra-Compact et Proportionné */}
        <div className="w-full space-y-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="grid grid-cols-3 gap-1.5 w-full">
            {DIAL_KEYS.map((key, idx) => {
              if (key === "") return <div key={idx} className="h-10" />;

              const isDelete = key === "⌫";

              return (
                <button
                  key={idx}
                  onClick={() => handlePhoneKey(key)}
                  disabled={loading}
                  className="h-10 rounded-xl font-bold text-sm bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 active:scale-95 transition-all flex items-center justify-center border border-slate-200/50 dark:border-slate-700/50"
                  aria-label={isDelete ? "Effacer" : key}
                >
                  {isDelete ? <Delete className="w-4 h-4 text-slate-500" /> : key}
                </button>
              );
            })}
          </div>

          {/* Bouton Suivant */}
          <button
            onClick={handlePhoneSubmit}
            disabled={loading || phone.length < 8}
            className="w-full h-10 mt-1 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            style={{ backgroundColor: currentAccent }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              "Suivant"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
