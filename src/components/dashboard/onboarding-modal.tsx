"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Home, Loader2, User, Phone, Globe2, Check, X, LogOut } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import { createClient } from "@/lib/supabase/client";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { getCitiesForCountry } from "@/lib/cities";
import { LOGIN_ROUTE } from "@/lib/routes";

interface OnboardingModalProps {
  userId: string;
  email: string;
  fullName: string;
  userRole?: string;
  onComplete: () => void;
  onClose?: () => void;
}

export function OnboardingModal({ userId, email, fullName, userRole, onComplete, onClose }: OnboardingModalProps) {
  const { lang } = useLanguage();
  const t = translations[lang].onboarding;
  const router = useRouter();
  const [formFullName, setFormFullName] = useState(fullName || "");
  const [residenceName, setResidenceName] = useState("");
  const [residenceType, setResidenceType] = useState("bnb");
  const [residenceLocation, setResidenceLocation] = useState("");
  const [country, setCountry] = useState("Côte d'Ivoire");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const cityRef = useRef<HTMLDivElement>(null);

  // Fermer l'autocomplétion ville lors d'un clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setCityOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (userRole && userRole !== "admin_residence") {
    return null;
  }

  function handleCountryChange(countryName: string) {
    setCountry(countryName);
    setResidenceLocation("");
    setCityOpen(false);
    const matched = SUPPORTED_COUNTRIES.find((c) => c.name === countryName);
    if (matched) {
      // Pré-remplir l'indicatif téléphonique si le champ est vide
      // ou s'il ne commence pas déjà par le bon indicatif.
      setPhone((prev) =>
        prev && prev.trim() !== "" && !prev.startsWith(matched.phoneCode)
          ? `${matched.phoneCode} `
          : prev && prev.trim() !== ""
            ? prev
            : `${matched.phoneCode} `
      );
    }
  }

  const cities = getCitiesForCountry(country);
  const cityQuery = residenceLocation.trim().toLowerCase();
  const hasExactCityMatch = cities.some((c) => c.toLowerCase() === cityQuery);
  const filteredCities = cities.filter(
    (c) => c.toLowerCase().includes(cityQuery) && c.toLowerCase() !== cityQuery
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
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
          fullName: formFullName,
          residenceName,
          residenceType,
          residenceLocation,
          country,
          phone,
          plan: "free",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || t.error);
        setLoading(false);
        return;
      }

      // Synchroniser les métadonnées du compte avec les informations saisies
      try {
        const supabase = createClient();
        await supabase.auth.updateUser({
          data: {
            role: "admin_residence",
            full_name: formFullName,
            residence_name: residenceName,
            residence_type: residenceType,
            residence_location: residenceLocation,
            country,
            phone,
          },
        });
      } catch {
        // Non bloquant : les métadonnées ne sont qu'un cache des infos de profil
      }

      toast.success(t.success);
      setLoading(false);
      onComplete();
    } catch {
      toast.error(t.error);
      setLoading(false);
    }
  }

  // Permet de quitter l'étape 2 sans être bloqué : déconnexion propre
  // et retour à la page de connexion.
  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Non bloquant : on redirige quoi qu'il arrive
    }
    router.push(LOGIN_ROUTE);
  }

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)] focus:border-transparent transition-all text-sm";
  const labelClass =
    "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop blur & dark overlay */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in" />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden animate-modal-in z-10 border border-slate-200 dark:border-slate-700 max-h-[92vh] overflow-y-auto">
        {/* Beautiful organic header */}
        <div className="relative bg-[var(--primary-color,#0C1C33)] p-6 text-white text-center">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-[-50%] left-[-10%] w-48 h-48 rounded-full bg-white blur-2xl animate-pulse" />
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="inline-flex p-3 rounded-full bg-white/10 mb-3 backdrop-blur-md shadow-inner">
            <Home className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">{t.title}</h2>
          <p className="text-white/80 text-xs mt-1.5 max-w-sm mx-auto">
            {t.subtitle}
          </p>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-3" autoComplete="off">
          <input type="text" style={{ display: 'none' }} name="prevent_autofill_username" autoComplete="off" />
          <input type="password" style={{ display: 'none' }} name="prevent_autofill_password" autoComplete="off" />

          <div className="space-y-3">
            <div>
              <label className={labelClass}>
                <User className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />
                {t.fullName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
                placeholder="ex: Jean Kouassi"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Home className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />
                {t.residenceName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={residenceName}
                onChange={(e) => setResidenceName(e.target.value)}
                placeholder="ex: Résidence Riviera Luxe"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Building2 className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />
                {t.residenceType} <span className="text-red-500">*</span>
              </label>
              <select
                required
                autoComplete="off"
                value={residenceType}
                onChange={(e) => setResidenceType(e.target.value)}
                className={inputClass}
              >
                <option value="bnb">{t.typeBnb}</option>
                <option value="hotel">{t.typeHotel}</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>
                <MapPin className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />
                {t.residenceLocation} <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={cityRef}>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={residenceLocation}
                  onChange={(e) => {
                    setResidenceLocation(e.target.value);
                    setCityOpen(true);
                  }}
                  onFocus={() => setCityOpen(true)}
                  placeholder="ex: Cocody, Abidjan"
                  className={inputClass}
                />
                {cityOpen && (residenceLocation.trim() !== "" || filteredCities.length > 0) && (
                  <ul className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
                    {filteredCities.slice(0, 8).map((city) => (
                      <li key={city}>
                        <button
                          type="button"
                          className="w-full text-left px-3.5 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between gap-2"
                          onClick={() => {
                            setResidenceLocation(city);
                            setCityOpen(false);
                          }}
                        >
                          <span>{city}</span>
                          <Check className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)] shrink-0" />
                        </button>
                      </li>
                    ))}
                    {residenceLocation.trim() !== "" && !hasExactCityMatch && (
                      <li className="border-t border-slate-100 dark:border-slate-700">
                        <button
                          type="button"
                          className="w-full text-left px-3.5 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          onClick={() => setCityOpen(false)}
                        >
                          {t.useCity.replace("{city}", residenceLocation)}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <label className={labelClass}>
                <Globe2 className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />
                {t.country} <span className="text-red-500">*</span>
              </label>
              <select
                required
                autoComplete="off"
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                className={inputClass}
              >
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.flag} {c.name} ({c.phoneCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                <Phone className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)]" />
                {t.phone}
              </label>
              <input
                type="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+225 00 00 00 00 00"
                className={inputClass}
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
            className="w-full mt-2 py-3 rounded-xl bg-[var(--primary-color,#0C1C33)] hover:opacity-90 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
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

          {/* Sortie de l'étape 2 : on ne doit jamais être bloqué ici */}
          <div className="pt-2 pb-1 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
              >
                {t.skip}
              </button>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-50"
            >
              <LogOut className="w-3 h-3" />
              {t.signOut}
            </button>
          </div>
          <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 -mt-1">
            {t.signOutHint}
          </p>
        </form>
      </div>
    </div>
  );
}
