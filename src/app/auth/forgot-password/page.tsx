"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (resetError) {
        setError("Adresse e-mail invalide ou envoi impossible. Vérifiez l'adresse et réessayez.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Une erreur est survenue. Réessayez dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-[#C2944E] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au portail
          </Link>
          <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Séjoura
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-[0_16px_60px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-slate-800 p-8">
            <div className="flex justify-center mb-6">
              <Image
                src="/logo-sejoura.png"
                alt="Séjoura"
                width={140}
                height={40}
                className="object-contain h-9 w-auto"
                priority
              />
            </div>

            {sent ? (
              <div className="text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-[#C2944E] mx-auto" />
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  E-mail envoyé
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Si un compte existe pour <strong>{email}</strong>, un lien de réinitialisation a
                  été envoyé. Vérifiez votre boîte de réception.
                </p>
                <Link
                  href="/"
                  className="inline-block mt-2 px-5 py-2.5 bg-[#0C1C33] text-white font-bold rounded-xl text-sm hover:bg-[#C2944E] transition-colors shadow-md"
                >
                  Retour à la connexion
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
                  Mot de passe oublié
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                  Indiquez l&apos;adresse e-mail de votre compte : nous vous enverrons un lien pour
                  réinitialiser votre mot de passe.
                </p>
                <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
                    >
                      Email professionnel
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contact@sejoura.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white text-sm outline-none focus:border-[#C2944E] transition-all"
                    />
                  </div>
                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 bg-[#0C1C33] hover:bg-[#C2944E] text-white font-bold rounded-xl shadow-md transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      "Envoyer le lien"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
