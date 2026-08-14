"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { THEME_PRESETS, getThemePresetById } from "@/lib/colors";
import { LOGIN_ROUTE, EMPLOYEE_LOGIN_ROUTE } from "@/lib/routes";
import { toast } from "sonner";
import {
  Settings,
  Building2,
  User,
  Bell,
  Moon,
  Sun,
  Globe,
  Shield,
  CreditCard,
  MessageSquare,
  Loader2,
  Check,
  Save,
  LogOut,
  Copy,
  Share2,
  Users,
  ExternalLink,
  Palette,
} from "lucide-react";
import { SUPPORTED_CURRENCIES, SUPPORTED_COUNTRIES } from "@/lib/countries";
import { useLanguage } from "@/hooks/use-language";
import { useCurrency } from "@/hooks/use-currency";
import { translations } from "@/lib/translations";
import type { Tenant, User as UserType } from "@/types/database";

export default function SettingsPage() {
  const { theme, toggleTheme, setPrimaryColor: setThemePrimaryColor, setThemeColor: setThemeContextColor } = useTheme();
  const { lang, setLang } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const t = (translations[lang] ?? translations["fr"]).settings;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [primaryColor, setPrimaryColor] = useState<string>("#0C1C33");
  const [themeColor, setThemeColor] = useState<string>("#0C1C33");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [user, setUser] = useState<UserType | null>(null);
  const [activeSection, setActiveSection] = useState("company");
  const [savedMsg, setSavedMsg] = useState("");
  const [copiedPortalLink, setCopiedPortalLink] = useState(false);
  const [employeeLink, setEmployeeLink] = useState<string>("");

  const [companyForm, setCompanyForm] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    city: "",
    address: "",
    default_currency: "XOF",
    default_currency_symbol: "FCFA",
    default_language: "fr",
  });

  const [accountForm, setAccountForm] = useState({
    full_name: "",
    phone: "",
    email: "",
  });

  const [notifForm, setNotifForm] = useState({
    emailNotifs: true,
    pushNotifs: true,
    bookingAlerts: true,
    paymentAlerts: true,
    cleaningAlerts: true,
  });

  const [whatsappForm, setWhatsappForm] = useState({
    apiToken: "",
    phoneId: "",
    webhookVerifyToken: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, auth_user_id, full_name, phone, email, role, tenant_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

        if (userData) {
         setUser(userData as unknown as UserType);
         setAccountForm({
           full_name: userData.full_name || "",
           phone: userData.phone || "",
           email: userData.email || "",
         });

        if (userData?.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", userData.tenant_id)
            .single();

          if (tenantData) {
            setTenant(tenantData as unknown as Tenant);
            setLogoPreviewUrl(tenantData.logo_url || null);
            const dbColor = tenantData.primary_color || "#0C1C33";
            setPrimaryColor(dbColor);
            setThemePrimaryColor(dbColor); // Sync ThemeProvider (--color-primary / --primary)
            // Charger la couleur du Sidebar depuis la DB
            const dbThemeColor = (tenantData as unknown as Record<string, unknown>).theme_color as string || "#0C1C33";
            setThemeColor(dbThemeColor);
            setCompanyForm({
              company_name: tenantData.company_name || "",
              contact_name: tenantData.contact_name || "",
              contact_email: tenantData.contact_email || "",
              contact_phone: tenantData.contact_phone || "",
              city: tenantData.city || "",
              address: tenantData.address || "",
              default_currency: tenantData.default_currency || "XOF",
              default_currency_symbol: tenantData.default_currency_symbol || "FCFA",
              default_language: tenantData.default_language || "fr",
            });
            // Sync devise globale depuis la BDD (multi-appareil)
            const dbCurrency = tenantData.default_currency || "XOF";
            const dbSymbol = tenantData.default_currency_symbol || "FCFA";
            setCurrency({ code: dbCurrency, symbol: dbSymbol });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue.";
      toast.error(message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set employee login link after mount to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmployeeLink(`${window.location.origin}${EMPLOYEE_LOGIN_ROUTE}`);
    }
  }, []);

  useEffect(() => {
    if (!tenant) return;
    const timer = setTimeout(() => {
      handleSaveCompany({
        primary_color: primaryColor,
        theme_color: themeColor.startsWith("#") ? themeColor : getThemePresetById(themeColor).sidebarBg,
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [primaryColor, themeColor, tenant]);

  async function handleSaveCompany(overrides?: Partial<typeof companyForm> & { primary_color?: string; theme_color?: string }) {
    if (!tenant) return;
    const form = overrides ? { ...companyForm, ...overrides } : companyForm;
    setSaving(true);
    try {
      const supabase = createClient();
      const updatePayload: Record<string, unknown> = {
        company_name: form.company_name,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        city: form.city,
        address: form.address,
        default_currency: form.default_currency,
        default_currency_symbol: form.default_currency_symbol,
        default_language: form.default_language,
        primary_color: overrides?.primary_color || primaryColor,
        theme_color: overrides?.theme_color || themeColor,
      };

      let { error } = await supabase
        .from("tenants")
        .update(updatePayload)
        .eq("id", tenant.id);

      if (error && (error.message?.includes("primary_color") || error.message?.includes("theme_color"))) {
        delete updatePayload.primary_color;
        delete updatePayload.theme_color;
        const fallback = await supabase
          .from("tenants")
          .update(updatePayload)
          .eq("id", tenant.id);
        error = fallback.error;
      }

      if (error) {
        const errorMsg = error.message || error.details || "Impossible d'enregistrer l'entreprise.";
        toast.error(errorMsg);
        console.error("Erreur lors de la sauvegarde Supabase:", errorMsg);
        return;
      }

      if (overrides) {
        setCompanyForm((prev) => ({ ...prev, ...overrides }));
      }
      setSavedMsg("Paramètres enregistrés ✓");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAccount() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("users")
        .update({
          full_name: accountForm.full_name,
          phone: accountForm.phone,
          email: accountForm.email,
        })
        .eq("auth_user_id", user?.auth_user_id || "");

      if (error) {
        toast.error("Impossible de mettre à jour le compte.");
        return;
      }

      setUser({ ...user!, full_name: accountForm.full_name, phone: accountForm.phone, email: accountForm.email } as unknown as UserType);
      setSavedMsg("Informations du compte mises à jour");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch {
      toast.error("Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  function handleSaveWhatsApp() {
    if (!whatsappForm.apiToken || !whatsappForm.phoneId || !whatsappForm.webhookVerifyToken) {
      toast.error("Tous les champs sont requis.");
      return;
    }
    localStorage.setItem("sejoura-whatsapp-config", JSON.stringify(whatsappForm));
    setSavedMsg("Configuration WhatsApp sauvegardée localement");
    setTimeout(() => setSavedMsg(""), 3000);
  }

  async function handleSavePassword() {
    if (!passwordForm.currentPassword || passwordForm.currentPassword.length < 6) {
      toast.error("Le mot de passe actuel est requis.");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      // Vérification du mot de passe actuel via re-auth
      const email = user?.email || accountForm.email;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: passwordForm.currentPassword,
      });
      if (signInError) {
        toast.error("Mot de passe actuel incorrect.");
        return;
      }
      // Modification du mot de passe
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) {
        toast.error("Impossible de modifier le mot de passe : " + error.message);
        return;
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Mot de passe modifié avec succès ✓");
    } catch {
      toast.error("Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      // Redirection intelligente selon le rôle :
      // Employés (Réceptionniste/Ménagère) → Page Spéciale Employés
      // Administrateur → Portail Général
      const isEmployee = user?.role === "receptionniste" || user?.role === "menagere";
      window.location.href = isEmployee ? EMPLOYEE_LOGIN_ROUTE : LOGIN_ROUTE;
    } catch {
      // Erreur silencieuse
    }
  }

  function handleLogoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    const maxSize = 2 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setLogoError("Le logo doit être une image PNG, JPG, SVG ou WEBP.");
      setLogoFile(null);
      return;
    }

    if (file.size > maxSize) {
      setLogoError("Le logo doit faire au maximum 2 Mo.");
      setLogoFile(null);
      return;
    }

    if (logoPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreviewUrl);
    }

    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setLogoError("");
  }

  useEffect(() => {
    return () => {
      if (logoPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  async function handleUploadLogo() {
    if (!tenant) {
      setLogoError("Impossible de téléverser le logo : entreprise introuvable.");
      return;
    }

    if (!logoFile) {
      setLogoError("Veuillez sélectionner un fichier avant de téléverser.");
      return;
    }

    setLogoUploading(true);
    setLogoError("");
    try {
      const formData = new FormData();
      formData.append("logo", logoFile);
      formData.append("tenantId", tenant.id);

      const response = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        setLogoError(result.error || "Impossible de téléverser le logo.");
        return;
      }

      setTenant({ ...tenant, logo_url: result.logoUrl });
      setLogoFile(null);
      setLogoPreviewUrl(result.logoUrl);
      setLogoError("");
      setSavedMsg("Logo de l'entreprise mis à jour avec succès");
      setTimeout(() => setSavedMsg(""), 3000);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sejoura-logo-updated", { detail: { logoUrl: result.logoUrl } }));
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Impossible de téléverser le logo.";
      setLogoError(message);
    } finally {
      setLogoUploading(false);
    }
  }

  // Note: La couleur primaire est gérée par ThemeProvider (--color-primary / --primary).
  // L'état local primaryColor sert uniquement à l'input color et à la sauvegarde Supabase.

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const sectionLabelMap = Object.fromEntries(
    (t?.settingsSections ?? []).map((s: { key: string; label: string }) => [s.key, s.label])
  );
  const sections = [
    { key: "company",       label: sectionLabelMap["company"]       || "Entreprise",    icon: Building2 },
    { key: "account",       label: sectionLabelMap["account"]       || "Compte",         icon: User },
    { key: "appearance",    label: sectionLabelMap["appearance"]    || "Apparence",      icon: theme === "dark" ? Moon : Sun },
    { key: "notifications", label: sectionLabelMap["notifications"] || "Notifications", icon: Bell },
    { key: "billing",       label: sectionLabelMap["billing"]       || "Facturation",    icon: CreditCard },
    { key: "whatsapp",      label: sectionLabelMap["whatsapp"]      || "WhatsApp",       icon: MessageSquare },
    { key: "integrations",  label: sectionLabelMap["integrations"]  || "Intégrations",  icon: Globe },
    { key: "security",      label: sectionLabelMap["security"]      || "Sécurité",      icon: Shield },
  ];

  return (
    <div className="space-y-3 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Paramètres</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">Gérez votre compte et votre entreprise</p>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm animate-fade-in">
          <Check className="w-4 h-4" /> {savedMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-3 p-4 h-fit">
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.key}
                  onClick={() => setActiveSection(section.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeSection === section.key
                      ? "bg-[var(--primary-color,#0C1C33)] text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {section.label}
                </button>
              );
            })}
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              >
                <LogOut className="w-4 h-4" />
                {(translations[lang] ?? translations["fr"]).sidebar?.logoutTooltip || "Se déconnecter"}
              </button>
            </div>
          </nav>
        </Card>

        <div className="lg:col-span-9 space-y-3">
          {activeSection === "company" && (
            <div className="space-y-3">
              <Card className="p-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Informations de l'entreprise</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Modifiez les détails de votre entreprise</p>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Nom de l'entreprise" value={companyForm.company_name} onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })} />
                    <Input label="Nom du contact" value={companyForm.contact_name} onChange={(e) => setCompanyForm({ ...companyForm, contact_name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Email" type="email" value={companyForm.contact_email} onChange={(e) => setCompanyForm({ ...companyForm, contact_email: e.target.value })} />
                    <Input label="Téléphone" value={companyForm.contact_phone} onChange={(e) => setCompanyForm({ ...companyForm, contact_phone: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Ville" value={companyForm.city} onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })} />
                    <Input label="Adresse" value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => handleSaveCompany()} loading={saving}>
                      <Save className="w-4 h-4" /> Enregistrer
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Logo de l'entreprise</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Téléversez un logo pour personnaliser l’interface.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <span>Choisir un fichier</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoSelect}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr]">
                  <div className="h-28 w-28 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                    {logoPreviewUrl ? (
                      <img
                        src={logoPreviewUrl}
                        alt="Aperçu du logo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                        Aucun logo
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between gap-4">
                    <div>
                      {logoFile && (
                        <p className="text-sm text-slate-600 dark:text-slate-300">Fichier sélectionné : {logoFile.name}</p>
                      )}
                      {!logoFile && tenant?.logo_url && (
                        <p className="text-sm text-slate-600 dark:text-slate-300">Logo actuel chargé depuis votre espace.</p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Formats supportés : PNG, JPG, SVG, WEBP — taille max 2 Mo.</p>
                      {logoError && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{logoError}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleUploadLogo} loading={logoUploading} disabled={!logoFile || !!logoError}>
                        Téléverser le logo
                      </Button>
                      {logoFile && (
                        <Button variant="secondary" onClick={() => {
                          setLogoFile(null);
                          setLogoPreviewUrl(tenant?.logo_url || null);
                          setLogoError("");
                        }}>
                          Annuler
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Lien de connexion employés */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="w-5 h-5 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Lien de connexion employés</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">URL que les employés utilisent pour se connecter au portail</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={employeeLink}
                      className="w-64 rounded-md border border-slate-300 bg-slate-50 dark:bg-slate-800 dark:border-slate-600 px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                    />
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        await navigator.clipboard.writeText(employeeLink);
                        setCopiedPortalLink(true);
                        toast.success("Lien copié ✓");
                        setTimeout(() => setCopiedPortalLink(false), 2000);
                      }}
                      disabled={copiedPortalLink}
                    >
                      {copiedPortalLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                 </div>
                </div>
              </Card>
            </div>
          )}


          {activeSection === "account" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Informations du compte</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Vos informations personnelles</p>

              <div className="space-y-3">
                <Input label="Nom complet" value={accountForm.full_name} onChange={(e) => setAccountForm({ ...accountForm, full_name: e.target.value })} />
                <Input label="Téléphone" value={accountForm.phone} onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })} />
                <Input label="Email" type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} />
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveAccount} loading={saving}>Enregistrer</Button>
                </div>
              </div>
            </Card>
          )}

          {activeSection === "appearance" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Apparence</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Personnalisez l'apparence de l'interface et les couples de couleurs</p>

               <div className="space-y-3">
                 {/* ---- Couleurs du portail ---- */}
                 <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Palette className="w-5 h-5 text-indigo-500" />
                      Couleurs du portail
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Le fond de la page Dashboard est appliqué via une nuance pastel dérivée de la couleur choisie. La version foncée règle le menu latéral et le haut de page.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Fond de la page Dashboard
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setPrimaryColor(newColor);
                            setThemePrimaryColor(newColor);
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent("sejoura-primary-color-updated", {
                                  detail: { primaryColor: newColor },
                                })
                              );
                            }
                          }}
                          className="h-10 w-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-1 cursor-pointer"
                        />
                        <Input
                          value={primaryColor}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setPrimaryColor(newColor);
                            setThemePrimaryColor(newColor);
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent("sejoura-primary-color-updated", {
                                  detail: { primaryColor: newColor },
                                })
                              );
                            }
                          }}
                          placeholder="#9d174d"
                          className="font-mono text-sm uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Version foncée (Sidebar & En-tête)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={themeColor.startsWith("#") ? themeColor : getThemePresetById(themeColor).sidebarBg}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setThemeColor(newColor);
                            setThemeContextColor(newColor);
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent("sejoura-theme-color-updated", {
                                  detail: { themeColor: newColor },
                                })
                              );
                            }
                          }}
                          className="h-10 w-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-1 cursor-pointer"
                        />
                        <Input
                          value={themeColor.startsWith("#") ? themeColor : getThemePresetById(themeColor).sidebarBg}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setThemeColor(newColor);
                            setThemeContextColor(newColor);
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent("sejoura-theme-color-updated", {
                                  detail: { themeColor: newColor },
                                })
                              );
                            }
                          }}
                          placeholder="#701a43"
                          className="font-mono text-sm uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Presets rapides de couleurs */}
                  <div className="pt-2">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Thèmes de couleurs prédéfinis :</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                      {[
                        { id: "ocean", name: "Océan", main: "#0d9488", dark: "#134e4a" },
                        { id: "cacao", name: "Cacao", main: "#78350f", dark: "#451a03" },
                        { id: "nuit", name: "Nuit", main: "#2563eb", dark: "#0f172a" },
                        { id: "violet", name: "Violet", main: "#9333ea", dark: "#3b0764" },
                        { id: "bordeaux", name: "Bordeaux", main: "#9d174d", dark: "#701a43" },
                        { id: "soleil", name: "Soleil", main: "#d97706", dark: "#78350f" },
                        { id: "slate", name: "Ardoise", main: "#475569", dark: "#111827" },
                      ].map((preset) => {
                        const currentDark = themeColor.startsWith("#") ? themeColor : getThemePresetById(themeColor).sidebarBg;
                        const isActive = currentDark.toLowerCase() === preset.dark.toLowerCase();

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={async () => {
                              setPrimaryColor(preset.main);
                              setThemePrimaryColor(preset.main);
                              setThemeColor(preset.dark);
                              setThemeContextColor(preset.dark);
                              if (typeof window !== "undefined") {
                                window.dispatchEvent(
                                  new CustomEvent("sejoura-theme-color-updated", {
                                    detail: { themeColor: preset.dark },
                                  })
                                );
                                window.dispatchEvent(
                                  new CustomEvent("sejoura-primary-color-updated", {
                                    detail: { primaryColor: preset.main },
                                  })
                                );
                              }
                              await handleSaveCompany({ primary_color: preset.main, theme_color: preset.dark });
                              setSavedMsg(`Thème ${preset.name} appliqué ✓`);
                              setTimeout(() => setSavedMsg(""), 3000);
                            }}
                            className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-xs font-medium ${
                              isActive
                                ? "border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-700 shadow-sm ring-1 ring-slate-900/20"
                                : "border-slate-200 dark:border-slate-700 hover:border-slate-400 bg-white dark:bg-slate-800"
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                              style={{ backgroundColor: preset.dark }}
                            />
                            <span className="truncate">{preset.name}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
                  </div>

                {/* Mode Clair / Sombre */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    {theme === "dark" ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-yellow-500" />}
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Mode d'affichage</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Basculer entre le mode clair et sombre</p>
                    </div>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className={`relative w-12 h-6 rounded-full transition-colors ${theme === "dark" ? "bg-[var(--primary-color,#0C1C33)]" : "bg-slate-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : ""}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Langue de l'application</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Choisir la langue d'affichage — appliquée instantanément</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={lang}
                      onChange={async (e) => {
                        const newLang = e.target.value as "fr" | "en";
                        setLang(newLang);
                        await handleSaveCompany({ default_language: newLang });
                        toast.success(newLang === "en" ? "Language set to English ✓" : "Langue définie sur Français ✓");
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
                    >
                      <option value="fr">🇫🇷 Français</option>
                      <option value="en">🇬🇧 English</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Devise principale</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Affichage actuel : <strong className="text-[var(--primary-color,#0C1C33)]">{currency.symbol}</strong> ({currency.code}) — appliquée instantanément
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
                    <select
                      value={currency.code}
                      onChange={async (e) => {
                        const currCode = e.target.value;
                        const sel = SUPPORTED_CURRENCIES.find((c) => c.code === currCode);
                        const symbol = sel ? sel.symbol : currCode;
                        setCurrency({ code: currCode, symbol });
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("sejoura-currency-updated", { detail: { code: currCode, symbol } }));
                        }
                        await handleSaveCompany({ default_currency: currCode, default_currency_symbol: symbol });
                        toast.success(`Devise mise à jour : ${symbol} (${currCode}) ✓`);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
                    >
                      {SUPPORTED_CURRENCIES.map((curr) => (
                        <option key={curr.code} value={curr.code}>{curr.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
                  <Button
                    onClick={() => handleSaveCompany({ primary_color: primaryColor, theme_color: themeColor.startsWith("#") ? themeColor : getThemePresetById(themeColor).sidebarBg })}
                    loading={saving}
                    className="text-white hover:brightness-110"
                    style={{ backgroundColor: themeColor.startsWith("#") ? themeColor : getThemePresetById(themeColor).sidebarBg }}
                  >
                    <Save className="w-4 h-4 mr-2" /> Enregistrer l'apparence
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Notifications</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Gérez vos préférences de notifications</p>

              <div className="space-y-3">
                {[
                  { key: "emailNotifs", label: "Notifications par email", desc: "Recevoir les notifications par email" },
                  { key: "pushNotifs", label: "Notifications push", desc: "Notifications dans le navigateur" },
                  { key: "bookingAlerts", label: "Alertes de réservation", desc: "Nouvelles réservations et modifications" },
                  { key: "paymentAlerts", label: "Alertes de paiement", desc: "Encaissements et impayés" },
                  { key: "cleaningAlerts", label: "Alertes de ménage", desc: "Tâches en retard et alertes +1h30" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifForm({ ...notifForm, [item.key]: !notifForm[item.key as keyof typeof notifForm] })}
                      className={`relative w-12 h-6 rounded-full transition-colors ${notifForm[item.key as keyof typeof notifForm] ? "bg-[var(--primary-color,#0C1C33)]" : "bg-slate-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${notifForm[item.key as keyof typeof notifForm] ? "translate-x-6" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Facturation */}
          {activeSection === "billing" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Facturation</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Gérez votre abonnement et vos paiements</p>
              <Button onClick={() => window.location.href = "/dashboard/subscription"}>
                <CreditCard className="w-4 h-4" /> Gérer l'abonnement
              </Button>
            </Card>
          )}

          {/* WhatsApp */}
          {activeSection === "whatsapp" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">WhatsApp Business</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Configuration de l'API WhatsApp Business de Meta</p>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      ⚠ L'API WhatsApp Business nécessite un compte Meta Business et un numéro de téléphone vérifié.
                    </p>
                  </div>
                  <Input label="Token API" placeholder="EAAxxxxxxxxxxxxx" value={whatsappForm.apiToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, apiToken: e.target.value })} />
                  <Input label="Numéro de téléphone ID" placeholder="1234567890" value={whatsappForm.phoneId} onChange={(e) => setWhatsappForm({ ...whatsappForm, phoneId: e.target.value })} />
                  <Input label="Token de vérification Webhook" placeholder="sejoura_verify_token" value={whatsappForm.webhookVerifyToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, webhookVerifyToken: e.target.value })} />
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveWhatsApp}>Enregistrer</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Intégrations */}
          {activeSection === "integrations" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Intégrations</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Connectez Séjoura à vos outils tiers</p>

              <div className="space-y-3">
                {[
                  { name: "Wave", desc: "Passerelle de paiement mobile Wave", status: "coming", icon: "💳" },
                  { name: "PI-SPI", desc: "Paiement par carte bancaire PI-SPI", status: "coming", icon: "🏦" },
                  { name: "Stripe", desc: "Paiements en ligne internationaux", status: "coming", icon: "⚡" },
                  { name: "WhatsApp Business API", desc: "Notifications et confirmations automatiques", status: "partial", icon: "💬" },
                  { name: "Google Analytics", desc: "Suivi des performances de la plateforme", status: "coming", icon: "📊" },
                ].map((integ) => (
                  <div key={integ.name} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{integ.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{integ.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{integ.desc}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      integ.status === "partial"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 dark:text-slate-500"
                    }`}>
                      {integ.status === "partial" ? "Partiel" : "Bientôt disponible"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Sécurité */}
          {activeSection === "security" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Sécurité</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Gérez votre mot de passe et la sécurité</p>

              <div className="space-y-3">
                <Input label="Mot de passe actuel" type="password" placeholder="••••••••" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                <Input label="Nouveau mot de passe" type="password" placeholder="••••••••" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                <Input label="Confirmer le mot de passe" type="password" placeholder="••••••••" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSavePassword} loading={saving}>Modifier le mot de passe</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
