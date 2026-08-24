"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Loader2, Delete, Moon, Sun, Fingerprint } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { deriveUltraLightColor } from "@/lib/colors";
import { createClient } from "@/lib/supabase/client";
import { startAuthentication } from "@simplewebauthn/browser";
import { toast } from "sonner";

const STORAGE_KEY = "sejoura-emp-verified";

export function isEmpVerified(): boolean {
  if (typeof window === "undefined") return true; // SSR: skip guard
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

export function clearEmpVerification(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

interface ReauthModalProps {
  onVerified: () => void;
}

export default function ReauthModal({ onVerified }: ReauthModalProps) {
  const { theme, toggleTheme, setPrimaryColor } = useTheme();
  const isDark = theme === "dark";
  const accentOnDark = "#C2944E";

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [hasBiometric, setHasBiometric] = useState(false);

  // PIN state
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [brandColor, setBrandColor] = useState("#0C1C33");

  const accent = brandColor || "#0C1C33";
  const accentUltraLight = deriveUltraLightColor(accent);

  useEffect(() => {
    if (brandColor) setPrimaryColor(brandColor);
  }, [brandColor, setPrimaryColor]);

  // Fetch employee profile from current session
  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        const { data: userData } = await supabase
          .from("users")
          .select("id, full_name, phone, role, tenant_id")
          .eq("auth_user_id", session.user.id)
          .single();

        if (!userData || cancelled) return;

        setUserName(userData.full_name);
        setUserId(userData.id);

        // Fetch tenant for brand color
        if (userData.tenant_id) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("primary_color")
            .eq("id", userData.tenant_id)
            .single();
          if (tenant?.primary_color) setBrandColor(tenant.primary_color);
        }

        // Check biometric
        const { data: passkeys } = await supabase
          .from("user_passkeys")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userData.id);
        setHasBiometric((passkeys?.length ?? 0) > 0);

        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  // Keyboard support
  useEffect(() => {
    if (loading || submitting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key >= "0" && e.key <= "9" && pin.length < 4) {
        setPinError(null);
        setPin((prev) => prev + e.key);
      } else if (e.key === "Backspace") {
        setPinError(null);
        setPin((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, submitting, pin.length]);

  // Auto-submit on 4 digits
  useEffect(() => {
    if (pin.length !== 4 || submitting) return;
    void verifyPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const verifyPin = useCallback(async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
    setPinError(null);

    try {
      const res = await fetch("/api/employee-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", userId, pin }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setSubmitting(false);
        setPin("");
        setPinError(data.error || "Code incorrect.");
        setShaking(true);
        setTimeout(() => setShaking(false), 550);
        return;
      }

      // Refresh session if returned
      if (data.session) {
        const supabase = createClient();
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      sessionStorage.setItem(STORAGE_KEY, "1");
      toast.success("Vérifié !");
      onVerified();
    } catch {
      setSubmitting(false);
      setPinError("Erreur serveur.");
    }
  }, [userId, pin, submitting, onVerified]);

  const pressDigit = useCallback((digit: string) => {
    if (submitting || pin.length >= 4) return;
    setPinError(null);
    setPin((prev) => prev + digit);
  }, [submitting, pin.length]);

  const pressBackspace = useCallback(() => {
    if (submitting) return;
    setPinError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [submitting]);

  const tryBiometric = useCallback(async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
    setPinError(null);

    try {
      const optionsRes = await fetch("/api/employee-biometric/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "options", userId }),
      });

      if (!optionsRes.ok) {
        setSubmitting(false);
        setPinError("Biométrie non disponible.");
        return;
      }

      const { options } = await optionsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/employee-biometric/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", userId, response: assertion }),
      });
      const data = await verifyRes.json();

      if (!verifyRes.ok) {
        setSubmitting(false);
        setPinError(data.error || "Échec biométrique.");
        return;
      }

      if (data.session) {
        const supabase = createClient();
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      sessionStorage.setItem(STORAGE_KEY, "1");
      toast.success("Vérifié !");
      onVerified();
    } catch {
      setSubmitting(false);
      // User cancelled or error — silently return
    }
  }, [userId, submitting, onVerified]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[9999] h-screen flex flex-col font-sans select-none overflow-hidden transition-colors duration-300"
      style={{
        background: isDark
          ? "linear-gradient(180deg, #0B1120 0%, #090D16 100%)"
          : `linear-gradient(180deg, ${accentUltraLight} 0%, #FFFFFF 100%)`,
      }}
    >
      {/* Halo */}
      <div
        className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[560px] h-[360px] rounded-full blur-[130px] opacity-30 pointer-events-none"
        style={{ backgroundColor: isDark ? accentOnDark : accent }}
      />

      {/* Header */}
      <header className="relative z-10 w-full max-w-md mx-auto flex items-center justify-between h-11 px-4">
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

      {/* Central */}
      <main className="relative z-10 flex flex-col items-center justify-end px-4 pb-2 w-full max-w-md mx-auto shrink-0">
        {/* Avatar */}
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center text-white text-xl font-extrabold shadow-lg"
          style={{ backgroundColor: isDark ? accentOnDark : accent }}
        >
          {initials}
        </div>

        <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
          {userName}
        </h2>

        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 font-medium">
          Saisissez votre code secret pour continuer
        </p>

        {/* PIN dots */}
        <div className={`mt-5 flex items-center gap-3 ${shaking ? "animate-shake" : ""}`}>
          {Array.from({ length: 4 }).map((_, i) => {
            const filled = i < pin.length;
            return (
              <div
                key={`${i}-${filled}`}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${filled ? "scale-110" : ""}`}
                style={{
                  backgroundColor: filled ? (isDark ? accentOnDark : accent) : "transparent",
                  border: `2px solid ${filled ? (isDark ? accentOnDark : accent) : isDark ? "#334155" : "#CBD5E1"}`,
                }}
              />
            );
          })}
        </div>

        {/* Error */}
        <div className="mt-3 h-5 flex items-center justify-center">
          {pinError && (
            <p className="text-xs text-red-500 font-semibold animate-shake">{pinError}</p>
          )}
        </div>

        {/* Loading */}
        {submitting && (
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: isDark ? accentOnDark : accent }} />
            <span>Vérification…</span>
          </div>
        )}
      </main>

      {/* Keypad */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 pb-6 pt-2">
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              onClick={() => pressDigit(digit)}
              disabled={submitting}
              className="h-14 rounded-2xl text-xl font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-slate-50 dark:hover:bg-slate-700/80 active:scale-95 disabled:opacity-50 transition-all"
              aria-label={`Chiffre ${digit}`}
            >
              {digit}
            </button>
          ))}

          {/* Left: biometric or empty */}
          {hasBiometric ? (
            <button
              onClick={tryBiometric}
              disabled={submitting}
              className="h-14 rounded-2xl flex items-center justify-center text-white active:scale-95 disabled:opacity-60 transition-all shadow-md"
              style={{ backgroundColor: isDark ? accentOnDark : accent }}
              aria-label="Se connecter avec empreinte"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          ) : (
            <div className="h-14" />
          )}

          <button
            onClick={() => pressDigit("0")}
            disabled={submitting}
            className="h-14 rounded-2xl text-xl font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-slate-50 dark:hover:bg-slate-700/80 active:scale-95 disabled:opacity-50 transition-all"
            aria-label="Chiffre 0"
          >
            0
          </button>

          {/* Right: backspace */}
          <button
            onClick={pressBackspace}
            disabled={submitting}
            className="h-14 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 bg-transparent active:bg-slate-100 dark:active:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all"
            aria-label="Effacer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
