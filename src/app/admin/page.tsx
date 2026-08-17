"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Moon, Sun, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { ADMIN_HUB_ROUTE } from "@/lib/routes";

// ─── Composant principal ──────────────────────────────────────────────────────
export default function SuperAdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
        </div>
      }
    >
      <SuperAdminLoginContent />
    </Suspense>
  );
}

// ─── Contenu (nécessite useSearchParams → Suspense) ───────────────────────────
function SuperAdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme, primaryColor } = useTheme();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  const accent = primaryColor || "#0C1C33";

  // Déjà connecté en tant que Super Admin → redirection directe vers le hub.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || !session) return;

        const { data: userData } = await supabase
          .from("users")
          .select("role")
          .eq("auth_user_id", session.user.id)
          .single();
        if (userData?.role === "super_admin") {
          const next = searchParams.get("next");
          const target =
            next && next.startsWith("/admin/") ? next : ADMIN_HUB_ROUTE;
          router.replace(target);
        }
      } catch {
        // Session illisible : on laisse afficher le formulaire.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  // Focus automatique sur le champ mot de passe.
  useEffect(() => {
    if (!checking) {
      const t = setTimeout(() => passwordRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [checking]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;
      setError("");

      if (!password.trim() || password.length < 6) {
        setError("Veuillez saisir votre mot de passe.");
        return;
      }

      setLoading(true);
      try {
        const next = searchParams.get("next");
        const res = await fetch(
          `/api/admin-login${next ? `?next=${encodeURIComponent(next)}` : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          }
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Connexion impossible.");
          return;
        }

        toast.success("Bienvenue, Super Admin !");
        const target =
          typeof data.redirectTo === "string" && data.redirectTo.startsWith("/admin/")
            ? data.redirectTo
            : ADMIN_HUB_ROUTE;
        window.setTimeout(() => router.push(target), 350);
      } catch {
        setError("Erreur de connexion. Réessayez.");
      } finally {
        setLoading(false);
      }
    },
    [password, loading, router, searchParams]
  );

  if (checking) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-hidden bg-[var(--background)] flex items-center justify-center p-3 relative font-sans select-none">
      {/* Halo lumineux dynamique basé sur la couleur de marque */}
      <div
        className="absolute w-[520px] h-[520px] rounded-full blur-[140px] opacity-25 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: accent }}
      />

      <div className="relative z-10 w-full max-w-[400px] bg-white dark:bg-slate-900/90 dark:backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 flex flex-col items-center text-slate-900 dark:text-white transition-all duration-300">
        {/* Top bar avec toggle thème */}
        <div className="w-full flex items-center justify-between h-9 mb-3">
          <div className="w-8" />
          <div className="flex items-center justify-center">
            <Image
              src="/logo-sejoura.png"
              alt="Séjoura by Refontiq"
              width={140}
              height={40}
              className="object-contain h-9 w-auto dark:brightness-0 dark:invert"
              priority
            />
          </div>
          <div className="w-8 flex justify-end">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={theme === "light" ? "Activer le mode sombre" : "Activer le mode clair"}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
            </button>
          </div>
        </div>

        {/* Icône de sécurité */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <ShieldCheck className="w-7 h-7" />
        </div>

        <h1 className="text-lg font-extrabold tracking-tight">Console Super Admin</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-6">
          Accès réservé à l&apos;administration Refontiq
        </p>

        <form onSubmit={handleSubmit} className="w-full space-y-3" noValidate>
          <div>
            <label
              htmlFor="admin-password"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
            >
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={passwordRef}
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="Votre mot de passe"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 transition-all"
                style={{ ["--tw-ring-color" as string]: accent }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 font-medium animate-shake">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            style={{ backgroundColor: accent }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              "Accéder à la console"
            )}
          </button>
        </form>

        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-5 text-center leading-relaxed">
          Ce portail centralise l&apos;administration de tous les produits Refontiq :
          Séjoura, Docly, Schooly et les projets à venir.
        </p>
      </div>
    </div>
  );
}
