"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, Delete, Loader2, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { deriveUltraLightColor } from "@/lib/colors";
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
  hasBiometric?: boolean;
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
        hasBiometric: data.hasBiometric,
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

  // ── Connexion via les tokens de session retournés par le serveur ───────────
  const signInWithSession = useCallback(
    async (session: { access_token: string; refresh_token: string }) => {
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
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

        if (data.session) {
          const signedIn = await signInWithSession(data.session);
          if (!signedIn) {
            return { success: false, error: "Erreur d'authentification. Contactez votre responsable." };
          }
        }

        setLastRole(data.role || profile.role);
        toast.success(`Bienvenue, ${profile.fullName} !`);
        return { success: true };
      } catch {
        return { success: false, error: "Erreur serveur. Réessayez." };
      }
    },
    [profile, signInWithSession]
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

        if (data.session) {
          const signedIn = await signInWithSession(data.session);
          if (!signedIn) {
            return { success: false, error: "Erreur d'authentification. Contactez votre responsable." };
          }
        }

        setLastRole(data.role || profile.role);
        toast.success(`Bienvenue, ${profile.fullName} ! Code configuré avec succès.`);
        return { success: true };
      } catch {
        return { success: false, error: "Erreur serveur. Réessayez." };
      }
    },
    [profile, signInWithSession]
  );

  // ── Authentification biométrique (Face ID / Empreinte) ──────────────────────
  const handleBiometricComplete = useCallback(
    async (payload: BiometricAuthPayload): Promise<PinSubmitResult> => {
      if (payload.session) {
        const signedIn = await signInWithSession(payload.session);
        if (!signedIn) {
          return { success: false, error: "Erreur d'authentification. Contactez votre responsable." };
        }
      }
      setLastRole(payload.role);
      toast.success(`Bienvenue, ${payload.fullName} !`);
      return { success: true };
    },
    [signInWithSession]
  );

  // ── Redirection après authentification réussie ──────────────────────────────
  const handleFinish = useCallback(() => {
    // Marquer la session comme vérifiée pour le garde de reconnexion
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sejoura-emp-verified", "1");
    }
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
  const accentUltraLight = deriveUltraLightColor(currentAccent);

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
          hasBiometric: profile.hasBiometric,
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

  // ── Étape 1 : Saisie Téléphone (style Wave, plein écran) ──────────────────
  const isDark = theme === "dark";
  const accentOnDark = "#C2944E";

  return (
    <div
      className="min-h-screen w-full overflow-hidden relative flex flex-col font-sans select-none transition-colors duration-300"
      style={{
        background: isDark
          ? "linear-gradient(180deg, #0B1120 0%, #090D16 100%)"
          : `linear-gradient(180deg, ${accentUltraLight} 0%, #FFFFFF 100%)`,
      }}
    >
      {/* Halo lumineux Wave */}
      <div
        className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[560px] h-[360px] rounded-full blur-[130px] opacity-30 pointer-events-none"
        style={{ backgroundColor: isDark ? accentOnDark : currentAccent }}
      />

      {/* ── Barre supérieure ── */}
      <header className="relative z-10 w-full max-w-md mx-auto flex items-center justify-between h-14 px-4">
        <div className="w-9" />

        <Image
          src="/logo-sejoura.png"
          alt="Séjoura"
          width={140}
          height={40}
          className="object-contain h-8 w-auto dark:brightness-0 dark:invert"
          priority
        />

        <button
          onClick={toggleTheme}
          className="p-2 -mr-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
          aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
        >
          {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* ── Zone centrale ── */}
      <main className="relative z-10 flex flex-col items-center justify-start pt-1 px-4 w-full max-w-md mx-auto shrink-0">
        {/* Titre */}
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Portail Espace Employés
        </h2>
        <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mt-1">
          📱 Mobile
        </span>

        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
          Saisissez votre numéro mobile enregistré
        </p>

        {/* Sélecteur pays + numéro affiché */}
        <div className="mt-2 flex items-center gap-2">
          <select
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className="text-sm font-semibold px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
          >
            {countryCodes.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>

          <div className="flex items-center font-mono text-2xl font-bold tracking-widest text-slate-900 dark:text-white min-w-[180px]">
            <span>{phone || "\u00A0"}</span>
            <span
              className="w-0.5 h-6 ml-0.5 animate-pulse rounded-full"
              style={{ backgroundColor: isDark ? accentOnDark : currentAccent }}
            />
          </div>
        </div>

        {/* Erreur */}
        <div className="mt-1 h-4 flex items-center justify-center">
          {phoneError && (
            <p className="text-xs text-red-500 font-semibold animate-shake">{phoneError}</p>
          )}
        </div>
      </main>

      {/* ── Clavier numérique virtuel (identique à l'étape PIN) ── */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 pb-6 pt-2 shrink-0">
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              onClick={() => handlePhoneKey(digit)}
              disabled={loading}
              className="h-16 rounded-2xl text-2xl font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-slate-50 dark:hover:bg-slate-700/80 active:scale-95 disabled:opacity-50 transition-all"
              aria-label={`Chiffre ${digit}`}
            >
              {digit}
            </button>
          ))}

          {/* Ligne 4 — gauche : espace vide (identique hauteur au PIN) */}
          <div className="h-16" />

          <button
            onClick={() => handlePhoneKey("0")}
            disabled={loading}
            className="h-16 rounded-2xl text-2xl font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-slate-50 dark:hover:bg-slate-700/80 active:scale-95 disabled:opacity-50 transition-all"
            aria-label="Chiffre 0"
          >
            0
          </button>

          {/* Droite — effacer (identique style au PIN) */}
          <button
            onClick={() => handlePhoneKey("⌫")}
            disabled={loading}
            className="h-16 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 bg-transparent active:bg-slate-100 dark:active:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all"
            aria-label="Effacer"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* ── Bouton Suivant (fixé en bas, style Wave) ── */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 pb-4 pt-0 shrink-0">
        <button
          onClick={handlePhoneSubmit}
          disabled={loading || phone.length < 8}
          className="w-full h-12 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
          style={{ backgroundColor: isDark ? accentOnDark : currentAccent }}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            "Suivant"
          )}
        </button>
      </div>
    </div>
  );
}
