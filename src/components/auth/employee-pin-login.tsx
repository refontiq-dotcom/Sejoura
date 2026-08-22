"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  CornerDownLeft,
  Delete,
  FingerprintPattern,
  Loader2,
  Moon,
  ScanFace,
  ShieldCheck,
  Sun,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import {
  startAuthentication,
  startRegistration,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { useTheme } from "@/components/providers/theme-provider";
import { deriveUltraLightColor } from "@/lib/colors";

// ─── Constantes ───────────────────────────────────────────────────────────────
const PIN_LENGTH = 4;
const MOBILE_QUERY = "(max-width: 767px)";

// ─── Types publics ────────────────────────────────────────────────────────────
export type EmployeePinMode = "verify" | "set";

export interface EmployeePinLoginEmployee {
  userId: string;
  fullName: string;
  role: string;
  companyName?: string | null;
  primaryColor?: string;
}

export interface PinSubmitResult {
  success: boolean;
  error?: string;
}

export interface BiometricAuthPayload {
  success: boolean;
  session?: { access_token: string; refresh_token: string };
  role: string;
  fullName: string;
  userId: string;
}

export interface EmployeePinLoginProps {
  employee: EmployeePinLoginEmployee;
  mode: EmployeePinMode;
  accentColor: string;
  /** Appelé quand un PIN complet est validé (verify) ou confirmé (set). */
  onPinComplete: (pin: string) => Promise<PinSubmitResult>;
  /** Appelé après vérification biométrique côté serveur (page = sign-in). */
  onBiometricComplete?: (payload: BiometricAuthPayload) => Promise<PinSubmitResult>;
  /** Appelé une fois l'authentification réussie (et l'enrôlement tranché). */
  onFinish?: () => void;
  onBack?: () => void;
  onSwitchUser?: () => void;
  onForgotPin?: () => void;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
async function detectBiometricSupport(): Promise<boolean> {
  if (typeof window === "undefined" || !window.isSecureContext) return false;
  if (typeof window.PublicKeyCredential === "undefined") return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function isWebAuthnCancel(error: unknown): boolean {
  const name = (error as Error)?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function EmployeePinLogin({
  employee,
  mode,
  accentColor,
  onPinComplete,
  onBiometricComplete,
  onFinish,
  onBack,
  onSwitchUser,
  onForgotPin,
}: EmployeePinLoginProps) {
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();

  // ── État PIN ────────────────────────────────────────────────────────────────
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinError, setPinError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // ── État biométrie ──────────────────────────────────────────────────────────
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [biometricRegistered, setBiometricRegistered] = useState(false);
  const [biometricPromptVisible, setBiometricPromptVisible] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isEnrollingBiometrics, setIsEnrollingBiometrics] = useState(false);
  const [showEnrollPrompt, setShowEnrollPrompt] = useState(false);
  const shakeTimerRef = useRef<number | null>(null);

  // ── Couleurs dynamiques (style Wave) ────────────────────────────────────────
  const accent = accentColor || "#0C1C33";
  const accentUltraLight = deriveUltraLightColor(accent);
  const accentOnDark = "#C2944E";
  const isDark = theme === "dark";

  const activePin = mode === "set" && pinStep === "confirm" ? pinConfirm : pin;

  // ── Saisie PIN ──────────────────────────────────────────────────────────────
  const pressDigit = useCallback(
    (digit: string) => {
      if (submitting || isAuthenticating) return;
      setPinError(null);
      if (mode === "set" && pinStep === "confirm") {
        setPinConfirm((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev));
      } else {
        setPin((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev));
      }
    },
    [mode, pinStep, submitting, isAuthenticating]
  );

  const pressBackspace = useCallback(() => {
    if (submitting || isAuthenticating) return;
    setPinError(null);
    if (mode === "set" && pinStep === "confirm") {
      setPinConfirm((prev) => prev.slice(0, -1));
    } else {
      setPin((prev) => prev.slice(0, -1));
    }
  }, [mode, pinStep, submitting, isAuthenticating]);

  const triggerShake = useCallback((error?: string) => {
    if (error) setPinError(error);
    setShaking(true);
    if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => setShaking(false), 550);
  }, []);

  // ── Soumission finale (after-auth) ──────────────────────────────────────────
  const handleAuthSuccess = useCallback(
    (source: "pin" | "biometric") => {
      if (source === "pin" && isBiometricSupported && !biometricRegistered) {
        setShowEnrollPrompt(true);
        return;
      }
      onFinish?.();
    },
    [isBiometricSupported, biometricRegistered, onFinish]
  );

  // ── Vérification du PIN (verify) ────────────────────────────────────────────
  const verifyPinNow = useCallback(async () => {
    submittedRef.current = true;
    setSubmitting(true);
    setPinError(null);

    const result = await onPinComplete(pin);

    if (!result.success) {
      submittedRef.current = false;
      setSubmitting(false);
      setPin("");
      triggerShake(result.error || "Code PIN incorrect.");
      return;
    }
    handleAuthSuccess("pin");
  }, [onPinComplete, pin, triggerShake, handleAuthSuccess]);

  // ── Validation du PIN (set — confirmation) ──────────────────────────────────
  const confirmPinNow = useCallback(async () => {
    if (pin !== pinConfirm) {
      setPinConfirm("");
      setPin("");
      setPinStep("enter");
      setPinError("Les codes ne correspondent pas.");
      triggerShake();
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);
    setPinError(null);

    const result = await onPinComplete(pin);

    if (!result.success) {
      submittedRef.current = false;
      setSubmitting(false);
      setPin("");
      setPinConfirm("");
      setPinStep("enter");
      triggerShake(result.error || "Erreur lors de la configuration du code.");
      return;
    }
    handleAuthSuccess("pin");
  }, [pin, pinConfirm, onPinComplete, triggerShake, handleAuthSuccess]);

  // Auto-soumission quand le 4e chiffre est saisi (verify)
  useEffect(() => {
    if (mode !== "verify" || submitting || isAuthenticating || submittedRef.current) return;
    if (pin.length !== PIN_LENGTH) return;
    // La soumission est déclenchée par la saisie complète du PIN.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void verifyPinNow();
  }, [pin, mode, submitting, isAuthenticating, verifyPinNow]);

  // Machine à états du mode "set" (saisie → confirmation → soumission)
  useEffect(() => {
    if (mode !== "set" || submitting || isAuthenticating || submittedRef.current) return;
    if (pinStep === "enter" && pin.length === PIN_LENGTH) {
      const timer = window.setTimeout(() => {
        setPinStep("confirm");
        setPinConfirm("");
        setPinError(null);
      }, 280);
      return () => window.clearTimeout(timer);
    }
    if (pinStep === "confirm" && pinConfirm.length === PIN_LENGTH) {
      // La soumission est déclenchée par la saisie complète du PIN de confirmation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void confirmPinNow();
    }
  }, [mode, pinStep, pin, pinConfirm, submitting, isAuthenticating, confirmPinNow]);

  // ── Connexion biométrique (WebAuthn assertion) ──────────────────────────────
  const attemptBiometricLogin = useCallback(async () => {
    if (isAuthenticating || submitting) return;
    setIsAuthenticating(true);
    setPinError(null);
    setBiometricPromptVisible(true);

    try {
      const optionsRes = await fetch("/api/employee-biometric/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "options", userId: employee.userId }),
      });

      if (optionsRes.status === 409) {
        setBiometricRegistered(false);
        setBiometricPromptVisible(false);
        return;
      }
      if (!optionsRes.ok) {
        setBiometricPromptVisible(false);
        return;
      }

      const { options } = (await optionsRes.json()) as { options: Parameters<typeof startAuthentication>[0]["optionsJSON"] };
      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/employee-biometric/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", userId: employee.userId, response: assertion }),
      });
      const data = (await verifyRes.json()) as BiometricAuthPayload & { error?: string };

      if (!verifyRes.ok) {
        triggerShake(data.error || "Authentification biométrique échouée.");
        setBiometricPromptVisible(false);
        return;
      }

      if (onBiometricComplete) {
        const result = await onBiometricComplete(data);
        if (!result.success) {
          triggerShake(result.error || "Erreur lors de la connexion.");
          setBiometricPromptVisible(false);
          return;
        }
      }

      setBiometricRegistered(true);
      submittedRef.current = true;
      onFinish?.();
    } catch (err) {
      if (!isWebAuthnCancel(err)) {
        console.error("Erreur biométrie:", err);
      }
      // Échec ou annulation → retour en douceur au clavier PIN
      setBiometricPromptVisible(false);
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, submitting, employee.userId, onBiometricComplete, onFinish, triggerShake]);

  const attemptBiometricLoginRef = useRef(attemptBiometricLogin);
  useEffect(() => {
    attemptBiometricLoginRef.current = attemptBiometricLogin;
  }, [attemptBiometricLogin]);

  // ── Détection des capacités au chargement ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const supported = await detectBiometricSupport();
      if (cancelled) return;
      setIsBiometricSupported(supported);
      if (supported && mode === "verify") {
        try {
          const res = await fetch(`/api/employee-biometric?userId=${employee.userId}`);
          const data = (await res.json()) as { registered?: boolean };
          if (cancelled) return;
          setBiometricRegistered(Boolean(data.registered));
        } catch {
          // Mode PIN par défaut
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [employee.userId, mode]);

  // ── Auto-prompt biométrique (mobile uniquement) ─────────────────────────────
  // Annulé dès que l'employé commence à saisir son code PIN.
  useEffect(() => {
    if (!isMobile || mode !== "verify" || !isBiometricSupported || !biometricRegistered) return;
    if (submittedRef.current || isAuthenticating) return;
    if (pin.length > 0) return;
    const timer = window.setTimeout(() => {
      setBiometricPromptVisible(true);
      attemptBiometricLoginRef.current();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [isMobile, mode, isBiometricSupported, biometricRegistered, pin, isAuthenticating]);

  // ── Clavier physique (desktop >= 768px) ─────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onBack?.();
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        pressDigit(e.key);
      } else if (e.key === "Backspace") {
        pressBackspace();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, pressDigit, pressBackspace]);

  // ── Nettoyage du timer de shake au démontage ────────────────────────────────
  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    };
  }, []);

  // ── Focus automatique (desktop) ─────────────────────────────────────────────
  const focusTargetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMobile) {
      const timer = window.setTimeout(() => focusTargetRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [isMobile]);

  // ── Enrôlement biométrique (WebAuthn attestation) ───────────────────────────
  const enrollBiometrics = useCallback(async () => {
    setShowEnrollPrompt(false);
    setIsEnrollingBiometrics(true);
    try {
      const optionsRes = await fetch("/api/employee-biometric/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "options", userId: employee.userId, pin }),
      });
      const optionsData = (await optionsRes.json()) as { options?: Parameters<typeof startRegistration>[0]["optionsJSON"]; error?: string };
      if (!optionsRes.ok || !optionsData.options) {
        toast.error(optionsData.error || "Impossible de configurer la biométrie.");
        return;
      }

      const registration = await startRegistration({ optionsJSON: optionsData.options });
      const verifyRes = await fetch("/api/employee-biometric/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          userId: employee.userId,
          pin,
          response: registration as RegistrationResponseJSON,
        }),
      });
      const verifyData = (await verifyRes.json()) as { success?: boolean; error?: string };

      if (!verifyRes.ok || !verifyData.success) {
        toast.error(verifyData.error || "Configuration biométrique échouée.");
        return;
      }

      setBiometricRegistered(true);
      toast.success("Face ID / Empreinte activé pour cet appareil.");
    } catch (err) {
      if (!isWebAuthnCancel(err)) {
        console.error("Erreur enrôlement biométrie:", err);
      }
      toast.info("Configuration biométrique annulée.");
    } finally {
      setIsEnrollingBiometrics(false);
      onFinish?.();
    }
  }, [employee.userId, pin, onFinish]);

  const declineEnrollment = useCallback(() => {
    setShowEnrollPrompt(false);
    onFinish?.();
  }, [onFinish]);

  const handleBack = useCallback(() => {
    if (mode === "set" && pinStep === "confirm") {
      setPinStep("enter");
      setPin("");
      setPinConfirm("");
      setPinError(null);
      return;
    }
    onBack?.();
  }, [mode, pinStep, onBack]);

  // ── Rendu ───────────────────────────────────────────────────────────────────
  const initials = employee.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const canUseBiometrics = isBiometricSupported && biometricRegistered;
  const leftAction = onSwitchUser ?? onForgotPin;

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
        style={{ backgroundColor: isDark ? accentOnDark : accent }}
      />

      {/* Focus caché (desktop) */}
      <div
        ref={focusTargetRef}
        tabIndex={-1}
        className="absolute w-px h-px opacity-0 pointer-events-none"
      />

      {/* ── Barre supérieure ── */}
      <header className="relative z-10 w-full max-w-md mx-auto flex items-center justify-between h-14 px-4">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
          aria-label="Retour"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

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
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start pt-2 px-4 w-full max-w-md mx-auto">
        {/* Avatar */}
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center text-white text-xl font-extrabold shadow-lg"
          style={{ backgroundColor: isDark ? accentOnDark : accent }}
        >
          {initials}
        </div>

        <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
          {employee.fullName}
        </h2>
        {employee.companyName && (
          <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mt-1.5">
            {employee.companyName}
          </span>
        )}

        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 font-medium">
          {mode === "set"
            ? pinStep === "enter"
              ? "Créez votre code secret à 4 chiffres"
              : "Confirmez votre code secret"
            : "Saisissez votre code secret"}
        </p>

        {/* Puces de confirmation */}
        <div className={`mt-5 flex items-center gap-3 ${shaking ? "animate-shake" : ""}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < activePin.length;
            return (
              <div
                key={`${i}-${filled}`}
                className={`w-4 h-4 rounded-full transition-all duration-200 animate-pin-pop ${
                  filled ? "scale-110" : ""
                }`}
                style={{
                  backgroundColor: filled ? (isDark ? accentOnDark : accent) : "transparent",
                  border: `2px solid ${filled ? (isDark ? accentOnDark : accent) : isDark ? "#334155" : "#CBD5E1"}`,
                }}
              />
            );
          })}
        </div>

        {/* Erreur PIN */}
        <div className="mt-3 h-5 flex items-center justify-center">
          {pinError && (
            <p className="text-xs text-red-500 font-semibold animate-shake">{pinError}</p>
          )}
        </div>

        {/* Panneau biométrique (mobile) */}
        {isMobile && biometricPromptVisible && canUseBiometrics && (
          <div className="mt-2 w-full flex flex-col items-center animate-fade-in">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white animate-biometric-pulse"
              style={{ backgroundColor: isDark ? accentOnDark : accent }}
            >
              {isAuthenticating ? (
                <Loader2 className="w-9 h-9 animate-spin" />
              ) : (
                <FingerprintPattern className="w-10 h-10" />
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
              {isAuthenticating ? "Reconnaissance en cours…" : "Face ID / Empreinte disponible"}
            </p>
            <button
              onClick={() => {
                setBiometricPromptVisible(false);
                setPinError(null);
              }}
              className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400 underline underline-offset-2 active:opacity-60 transition-opacity"
            >
              Utiliser le code PIN
            </button>
          </div>
        )}

        {/* Indice clavier physique (desktop) */}
        {!isMobile && (
          <div className="mt-4 flex flex-col items-center gap-3">
            {canUseBiometrics && (
              <button
                onClick={() => attemptBiometricLoginRef.current()}
                disabled={isAuthenticating || submitting}
                className="h-11 px-5 rounded-2xl flex items-center gap-2 text-sm font-bold text-white active:scale-95 disabled:opacity-60 transition-all shadow-lg"
                style={{ backgroundColor: isDark ? accentOnDark : accent }}
                aria-label="Se connecter avec Face ID ou empreinte"
              >
                {isAuthenticating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <FingerprintPattern className="w-5 h-5" />
                )}
                {isAuthenticating ? "Reconnaissance en cours…" : "Face ID / Empreinte"}
              </button>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <CornerDownLeft className="w-3.5 h-3.5" />
              <span>Tapez votre code directement sur le clavier</span>
            </div>
          </div>
        )}

        {/* Chargement de la soumission */}
        {submitting && (
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: isDark ? accentOnDark : accent }} />
            <span>Vérification en cours…</span>
          </div>
        )}
      </main>

      {/* ── Clavier numérique virtuel (mobile < 768px, style Wave) ── */}
      {isMobile && (
        <div className="relative z-10 w-full max-w-md mx-auto px-4 pb-6 pt-2">
          <div className="grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <button
                key={digit}
                onClick={() => pressDigit(digit)}
                disabled={submitting || isAuthenticating}
                className="h-16 rounded-2xl text-2xl font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-slate-50 dark:hover:bg-slate-700/80 active:scale-95 disabled:opacity-50 transition-all"
                aria-label={`Chiffre ${digit}`}
              >
                {digit}
              </button>
            ))}

            {/* Ligne 4 — gauche */}
            {leftAction ? (
              <button
                onClick={onSwitchUser ? onSwitchUser : onForgotPin}
                disabled={submitting || isAuthenticating}
                className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-transparent active:bg-slate-100 dark:active:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all"
              >
                {onSwitchUser ? <UserX className="w-5 h-5" /> : null}
                {onSwitchUser ? "Changer" : "Oublié ?"}
              </button>
            ) : (
              <div className="h-16" />
            )}

            <button
              onClick={() => pressDigit("0")}
              disabled={submitting || isAuthenticating}
              className="h-16 rounded-2xl text-2xl font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-slate-50 dark:hover:bg-slate-700/80 active:scale-95 disabled:opacity-50 transition-all"
              aria-label="Chiffre 0"
            >
              0
            </button>

            {/* Droite — biométrie si disponible, sinon effacer */}
            {canUseBiometrics ? (
              <button
                onClick={() => attemptBiometricLoginRef.current()}
                disabled={isAuthenticating || submitting}
                className="h-16 rounded-2xl flex items-center justify-center text-white active:scale-95 disabled:opacity-60 transition-all shadow-md"
                style={{ backgroundColor: isDark ? accentOnDark : accent }}
                aria-label="Se connecter avec Face ID ou empreinte"
              >
                {isAuthenticating ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <FingerprintPattern className="w-7 h-7" />
                )}
              </button>
            ) : (
              <button
                onClick={pressBackspace}
                disabled={submitting || isAuthenticating}
                className="h-16 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 bg-transparent active:bg-slate-100 dark:active:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all"
                aria-label="Effacer"
              >
                <Delete className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Modal d'enrôlement biométrique ── */}
      {showEnrollPrompt && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
            onClick={declineEnrollment}
          />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 animate-modal-in">
            <div className="flex flex-col items-center text-center">
              <div
                className="w-16 h-16 rounded-3xl flex items-center justify-center text-white shadow-md"
                style={{ backgroundColor: isDark ? accentOnDark : accent }}
              >
                {isEnrollingBiometrics ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : canUseBiometrics ? (
                  <ShieldCheck className="w-8 h-8" />
                ) : (
                  <ScanFace className="w-8 h-8" />
                )}
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                Gagnez du temps
              </h3>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Activez Face ID / Empreinte pour cet appareil et connectez-vous en un geste, sans
                saisir votre code.
              </p>
              <div className="w-full flex flex-col gap-2 mt-6">
                <button
                  onClick={() => void enrollBiometrics()}
                  disabled={isEnrollingBiometrics}
                  className="w-full h-12 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-[0.98] transition-all"
                  style={{ backgroundColor: isDark ? accentOnDark : accent }}
                >
                  {isEnrollingBiometrics ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Configuration…
                    </>
                  ) : (
                    <>
                      <FingerprintPattern className="w-4 h-4" />
                      Activer maintenant
                    </>
                  )}
                </button>
                <button
                  onClick={declineEnrollment}
                  disabled={isEnrollingBiometrics}
                  className="w-full h-12 rounded-2xl font-semibold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-[0.98] transition-all"
                >
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
