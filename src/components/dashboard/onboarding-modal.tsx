"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, MapPin, Home, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";

interface OnboardingModalProps {
  userId: string;
  email: string;
  fullName: string;
  userRole?: string;
  onComplete: () => void;
}

export function OnboardingModal({ userId, email, fullName, userRole, onComplete }: OnboardingModalProps) {
  if (userRole && userRole !== "admin_residence") {
    return null;
  }
  const { lang } = useLanguage();
  const t = translations[lang].onboarding;
  const [residenceName, setResidenceName] = useState("");
  const [residenceType, setResidenceType] = useState("");
  const [residenceLocation, setResidenceLocation] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          email,
          fullName,
          residenceName,
          residenceType,
          residenceLocation,
          phone: "",
          plan: "free",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || t.error);
        setLoading(false);
        return;
      }

      toast.success(t.success);
      setLoading(false);
      onComplete();
    } catch {
      toast.error(t.error);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop blur & dark overlay */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in" />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden animate-modal-in z-10 border border-slate-200 dark:border-slate-700">
        {/* Beautiful organic gradient header */}
        <div className="relative bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-700 p-6 text-white text-center">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-[-50%] left-[-10%] w-48 h-48 rounded-full bg-white blur-2xl animate-pulse" />
          </div>
          <div className="inline-flex p-3 rounded-full bg-white/10 mb-3 backdrop-blur-md shadow-inner">
            <Home className="w-6 h-6 text-sky-100" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">{t.title}</h2>
          <p className="text-sky-100 text-xs mt-1.5 max-w-sm mx-auto">
            {t.subtitle}
          </p>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4" autoComplete="off">
          <input type="text" style={{ display: 'none' }} name="prevent_autofill_username" autoComplete="off" />
          <input type="password" style={{ display: 'none' }} name="prevent_autofill_password" autoComplete="off" />

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-blue-500" />
                {t.residenceName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={residenceName}
                onChange={(e) => setResidenceName(e.target.value)}
                placeholder="ex: Hôtel Les Acacias"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                {t.residenceType} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={residenceType}
                onChange={(e) => setResidenceType(e.target.value)}
                placeholder="ex: Appartements meublés, 5 unités"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                {t.residenceLocation} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={residenceLocation}
                onChange={(e) => setResidenceLocation(e.target.value)}
                placeholder="ex: Cocody, Abidjan"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
            </div>
          </div>

          {/* Bottom Information Card */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="flex-shrink-0 p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400"><path d="M12 2v3"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>
            </div>
            <div className="text-[11px] leading-normal text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t.freePlanNotice}</span>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.loading}
              </>
            ) : (
              t.continue
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
