"use client";

import { useState, useCallback, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Delete, ChevronLeft, ShieldCheck, PhoneCall } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

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
const PIN_LENGTH = 4;
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
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
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
  const { setPrimaryColor, primaryColor: themePrimaryColor } = useTheme();

  // État machine
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);

  // Étape 1 — Téléphone
  const [dialCode, setDialCode] = useState("+225");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Profil employé récupéré
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);

  // Couleur dynamique de la marque de l'établissement
  const [brandColor, setBrandColor] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sejoura-primary-color") || "#2563eb";
    }
    return "#2563eb";
  });

  // Étape 2 — PIN
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinError, setPinError] = useState("");

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

  // ── Clavier numérique pour le PIN ───────────────────────────────────────────
  const handlePinKey = useCallback((key: string) => {
    setPinError("");
    const current = step === "set-pin" && pinStep === "confirm" ? pinConfirm : pin;
    const setter = step === "set-pin" && pinStep === "confirm" ? setPinConfirm : setPin;

    if (key === "⌫") {
      setter((prev) => prev.slice(0, -1));
    } else if (key !== "" && /^\d$/.test(key)) {
      if (current.length < PIN_LENGTH) {
        setter((prev) => prev + key);
      }
    }
  }, [step, pinStep, pin, pinConfirm]);

  // Auto-avancer quand PIN complet (verify)
  useEffect(() => {
    if (step === "verify-pin" && pin.length === PIN_LENGTH) {
      handlePinSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, step]);

  // Auto-avancer quand PIN complet (set — étape confirmation)
  useEffect(() => {
    if (step === "set-pin") {
      if (pinStep === "enter" && pin.length === PIN_LENGTH) {
        setTimeout(() => setPinStep("confirm"), 300);
      }
      if (pinStep === "confirm" && pinConfirm.length === PIN_LENGTH) {
        handleSetPinSubmit();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, pinConfirm, pinStep, step]);

  // ── Paramètres d'URL (Pré-remplissage et messages d'erreur) ────────────────
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "revoked") {
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

  // ── Écouteur de clavier physique ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        if (e.key === "Enter" && step === "phone") {
          e.preventDefault();
          handlePhoneSubmit();
        }
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        if (step === "phone") handlePhoneKey(e.key);
        else handlePinKey(e.key);
      } else if (e.key === "Backspace") {
        if (step === "phone") handlePhoneKey("⌫");
        else handlePinKey("⌫");
      } else if (e.key === "Enter" && step === "phone") {
        handlePhoneSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, handlePhoneKey, handlePinKey, handlePhoneSubmit]);

  // ── Étape 2a : Définition du PIN ─────────────────────────────────────────────
  const handleSetPinSubmit = useCallback(async () => {
    if (!profile) return;
    if (pin !== pinConfirm) {
      setPinError("Les codes ne correspondent pas.");
      setPin("");
      setPinConfirm("");
      setPinStep("enter");
      return;
    }

    setLoading(true);
    setPinError("");

    try {
      const res = await fetch("/api/employee-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", userId: profile.userId, pin }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setPinError(data.error || "Erreur lors de la définition du code.");
        setPin("");
        setPinConfirm("");
        setPinStep("enter");
        return;
      }

      const supabase = createClient();
      await supabase.auth.signInWithPassword({
        email: data.loginEmail,
        password: data.internalPassword,
      });

      toast.success(`Bienvenue, ${profile.fullName} ! Code configuré avec succès.`);
      redirectByRole(profile.role);
    } catch {
      setPinError("Erreur serveur. Réessayez.");
      setPin("");
      setPinConfirm("");
      setPinStep("enter");
    } finally {
      setLoading(false);
    }
  }, [profile, pin, pinConfirm]);

  // ── Étape 2b : Vérification du PIN ───────────────────────────────────────────
  const handlePinSubmit = useCallback(async () => {
    if (!profile || pin.length !== PIN_LENGTH) return;

    setLoading(true);
    setPinError("");

    try {
      const res = await fetch("/api/employee-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", userId: profile.userId, pin }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setPinError(data.error || "Code PIN incorrect.");
        setPin("");
        return;
      }

      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.loginEmail,
        password: data.internalPassword,
      });

      if (authError) {
        setPinError("Erreur d'authentification. Contactez votre responsable.");
        setPin("");
        return;
      }

      toast.success(`Bienvenue, ${profile.fullName} !`);
      redirectByRole(data.role || profile.role);
    } catch {
      setPinError("Erreur serveur. Réessayez.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [profile, pin]);

  // ── Redirection par rôle ──────────────────────────────────────────────────────
  function redirectByRole(role: string) {
    setTimeout(() => {
      if (role === "menagere") {
        router.push("/menage");
      } else {
        router.push("/dashboard");
      }
    }, 500);
  }

  // ── Retour étape précédente ───────────────────────────────────────────────────
  function handleBack() {
    if (step === "verify-pin" || step === "set-pin") {
      if (step === "set-pin" && pinStep === "confirm") {
        setPinStep("enter");
        setPin("");
        setPinConfirm("");
        setPinError("");
        return;
      }
      setPin("");
      setPinConfirm("");
      setPinError("");
      setPinStep("enter");
      setProfile(null);
      goToStep("phone");
    }
  }

  const activePin = step === "set-pin" && pinStep === "confirm" ? pinConfirm : pin;
  const currentAccent = brandColor || themePrimaryColor || "#2563eb";

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-900 flex items-center justify-center p-3 relative font-sans select-none">
      {/* Halo lumineux dynamique basé sur la couleur de marque */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[140px] opacity-25 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: currentAccent }}
      />

      {/* Card principale ultra-compacte sans scroll */}
      <div className="relative z-10 w-full max-w-[380px] bg-white dark:bg-slate-900/90 dark:backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-5 flex flex-col items-center justify-between text-slate-900 dark:text-white transition-all duration-300 max-h-[95vh]">

        {/* Top bar avec bouton retour et logo */}
        <div className="w-full flex items-center justify-between h-9 mb-2">
          {step !== "phone" ? (
            <button
              onClick={handleBack}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              aria-label="Retour"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-8" />
          )}

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
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        {/* Dynamic step content */}
        <div className={`w-full flex flex-col items-center my-auto transition-all duration-200 ${transitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}>
          
          {/* Étape 1 : Saisie Téléphone */}
          {step === "phone" && (
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
          )}

          {/* Étape 2 : Verification / Définition PIN */}
          {(step === "set-pin" || step === "verify-pin") && profile && (
            <div className="w-full flex flex-col items-center text-center space-y-3">
              {/* Avatar compact */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-base font-extrabold shadow-md transform hover:scale-105 transition-transform"
                style={{ backgroundColor: currentAccent }}
              >
                {profile.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </div>

              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Bienvenue, {profile.fullName.split(" ")[0]} !
                </h2>
                {profile.companyName && (
                  <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mt-0.5">
                    {profile.companyName}
                  </span>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {step === "set-pin"
                    ? pinStep === "enter"
                      ? "Créez votre code secret à 4 chiffres"
                      : "Confirmez votre code secret"
                    : "Entrez votre code PIN secret"}
                </p>
              </div>

              {/* Ronds indicateurs PIN compacts */}
              <div className="flex items-center gap-3 py-1">
                {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                  const filled = i < activePin.length;
                  return (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-200 border-2 ${
                        filled
                          ? "scale-110 shadow-sm"
                          : "border-slate-300 dark:border-slate-700 bg-transparent"
                      }`}
                      style={{
                        backgroundColor: filled ? currentAccent : "transparent",
                        borderColor: filled ? currentAccent : undefined,
                      }}
                    />
                  );
                })}
              </div>

              {pinError && (
                <p className="text-xs text-red-500 font-medium animate-shake">
                  {pinError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Pavé Numérique Ultra-Compact et Proportionné */}
        <div className="w-full space-y-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="grid grid-cols-3 gap-1.5 w-full">
            {DIAL_KEYS.map((key, idx) => {
              if (key === "") return <div key={idx} className="h-10" />;

              const isDelete = key === "⌫";
              const onPress = step === "phone" ? () => handlePhoneKey(key) : () => handlePinKey(key);

              return (
                <button
                  key={idx}
                  onClick={onPress}
                  disabled={loading}
                  className="h-10 rounded-xl font-bold text-sm bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 active:scale-95 transition-all flex items-center justify-center border border-slate-200/50 dark:border-slate-700/50"
                  aria-label={isDelete ? "Effacer" : key}
                >
                  {isDelete ? <Delete className="w-4 h-4 text-slate-500" /> : key}
                </button>
              );
            })}
          </div>

          {/* Bouton Suivant pour l'Étape 1 */}
          {step === "phone" && (
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
          )}

          {loading && step !== "phone" && (
            <div className="w-full h-10 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: currentAccent }} />
              <span>Vérification en cours...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
