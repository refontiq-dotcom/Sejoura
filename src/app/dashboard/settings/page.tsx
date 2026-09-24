"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import { getThemePresetById } from "@/lib/colors";
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
  ExternalLink,
  Palette,
  Lightbulb,
  Info,
  Sparkles,
  Smartphone,
  Menu,
  X,
} from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/app-info";
import { SUPPORTED_CURRENCIES } from "@/lib/countries";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import type { Tenant, User as UserType, GuestInfo } from "@/types/database";
import { useCurrentUser } from "@/contexts/current-user-context";
import { IdeaBoxSection } from "@/components/dashboard/idea-box";
import { GuestInfoEditor } from "@/components/dashboard/guest-info-editor";
import { useAccommodation } from "@/hooks/use-accommodation";
import { PaymentGatewaysSection } from "@/components/dashboard/payment-gateways";

function themeHex(color: string) {
  return color.startsWith("#") ? color : getThemePresetById(color).sidebarBg;
}

export default function SettingsPage() {
  const { theme, toggleTheme, setPrimaryColor: setThemePrimaryColor, setThemeColor: setThemeContextColor } = useTheme();
  const { lang, setLang } = useLanguage();
  const { activeAccommodation } = useAccommodation();
  const t = (translations[lang] ?? translations["fr"]).settings;
  const common = (translations[lang] ?? translations["fr"]).common;
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
  const { user: contextUser } = useCurrentUser();
  const [user, setUser] = useState<UserType | null>(null);
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window !== "undefined") {
      const section = new URLSearchParams(window.location.search).get("section");
      if (section) return section;
    }
    return "company";
  });
  const [copiedPortalLink, setCopiedPortalLink] = useState(false);
  const skipColorAutoSave = useRef(true);
  const lastSavedColorsRef = useRef<{ primaryColor: string; themeColor: string } | null>(null);
  const pendingColorsRef = useRef<{ primaryColor: string; themeColor: string } | null>(null);
  const companySnapshotRef = useRef<string>("");
  const [formError, setFormError] = useState("");
  const [employeeLink, setEmployeeLink] = useState<string>("");
  // Espace client : le guest_info est configurable PAR RÉSIDENCE avec héritage
  // de l'entreprise si la résidence n'a rien configuré.
  const [portalGuestInfo, setPortalGuestInfo] = useState<GuestInfo | null>(null);
  const [portalInherited, setPortalInherited] = useState(false);
  const [portalSaving, setPortalSaving] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      // L'utilisateur et le tenant viennent désormais du contexte partagé
      // (déjà chargés par le layout) — plus besoin de revérifier la
      // session ni de rappeler la table users ici.
      if (!contextUser) return;
      const userData = contextUser;

        {
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
            const companyFormInitial = {
              company_name: tenantData.company_name || "",
              contact_name: tenantData.contact_name || "",
              contact_email: tenantData.contact_email || "",
              contact_phone: tenantData.contact_phone || "",
              city: tenantData.city || "",
              address: tenantData.address || "",
              default_currency: tenantData.default_currency || "XOF",
              default_currency_symbol: tenantData.default_currency_symbol || "FCFA",
              default_language: tenantData.default_language || "fr",
            };
            setCompanyForm(companyFormInitial);
            companySnapshotRef.current = JSON.stringify(companyFormInitial);
          }
        }

        // Préférences de notifications persistées par établissement + utilisateur
        if (userData.tenant_id && typeof window !== "undefined") {
          const notifKey = `sejoura-notif-prefs:${userData.tenant_id}:${userData.id}`;
          try {
            const stored = localStorage.getItem(notifKey);
            if (stored) {
              setNotifForm((prev) => ({ ...prev, ...JSON.parse(stored) }));
            }
          } catch {
            // JSON corrompu : on ignore et on garde les valeurs par défaut
          }
        }

        if (typeof window !== "undefined") {
          try {
            const storedWa = localStorage.getItem("sejoura-whatsapp-config");
            if (storedWa) {
              const parsed = JSON.parse(storedWa) as typeof whatsappForm;
              setWhatsappForm((prev) => ({ ...prev, ...parsed }));
            }
          } catch {
            // JSON corrompu : on ignore
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Oups, un petit souci technique ! Réessayez 🤕";
      toast.error(message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [contextUser]);

  // Set employee login link after mount to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmployeeLink(`${window.location.origin}${EMPLOYEE_LOGIN_ROUTE}`);
    }
  }, []);

  // Autosave silencieux et anti-redondance des couleurs.
  // - Ignore le premier déclenchement (synchro avec la BDD au chargement).
  // - N'envoie que les couleurs (jamais les champs du formulaire entreprise).
  // - Saut si les couleurs n'ont pas réellement changé depuis la dernière sauvegarde.
  useEffect(() => {
    if (!tenant) return;
    if (skipColorAutoSave.current) {
      skipColorAutoSave.current = false;
      lastSavedColorsRef.current = { primaryColor, themeColor: themeHex(themeColor) };
      return;
    }
    pendingColorsRef.current = { primaryColor, themeColor: themeHex(themeColor) };
    const timer = setTimeout(() => {
      if (pendingColorsRef.current) {
        persistColors(pendingColorsRef.current.primaryColor, pendingColorsRef.current.themeColor, { silent: true });
      }
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryColor, themeColor, tenant]);

  // Sauvegarde atomique vers la table tenants avec repli si la colonne theme_color n'existe pas.
  async function saveTenant(payload: Record<string, unknown>, opts: { silent?: boolean; successMessage?: string | null } = {}) {
    if (!tenant) return false;
    if (!opts.silent) setSaving(true);
    try {
      const supabase = createClient();
      let { error } = await supabase
        .from("tenants")
        .update(payload)
        .eq("id", tenant.id);

      if (error && (error.message?.includes("primary_color") || error.message?.includes("theme_color"))) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.primary_color;
        delete fallbackPayload.theme_color;
        error = (await supabase.from("tenants").update(fallbackPayload).eq("id", tenant.id)).error;
      }

      if (error) {
        if (!opts.silent) {
          toast.error(t.saveError);
        }
        return false;
      }
      if (!opts.silent && opts.successMessage) {
        toast.success(opts.successMessage);
      }
      return true;
    } catch (err) {
      if (!opts.silent) {
        toast.error(t.saveError);
      }
      return false;
    } finally {
      if (!opts.silent) setSaving(false);
    }
  }

  async function persistColors(primaryColor: string, themeColor: string, opts: { silent?: boolean; successMessage?: string | null } = {}) {
    if (!tenant) return false;
    const payload = { primary_color: primaryColor, theme_color: themeHex(themeColor) };
    const last = lastSavedColorsRef.current;
    if (last && last.primaryColor === payload.primary_color && last.themeColor === payload.theme_color) {
      return false;
    }
    const ok = await saveTenant(payload, opts);
    if (ok) {
      lastSavedColorsRef.current = { primaryColor: payload.primary_color, themeColor: payload.theme_color };
      pendingColorsRef.current = null;
    }
    return ok;
  }

  // Vidange des couleurs en attente quand on quitte la page avant la fin du debounce.
  useEffect(() => {
    return () => {
      const pending = pendingColorsRef.current;
      if (!pending || !tenant || skipColorAutoSave.current) return;
      const last = lastSavedColorsRef.current;
      if (last && last.primaryColor === pending.primaryColor && last.themeColor === pending.themeColor) return;
      const supabase = createClient();
      supabase
        .from("tenants")
        .update({ primary_color: pending.primaryColor, theme_color: pending.themeColor })
        .eq("id", tenant.id)
        .then(() => {});
    };
  }, [tenant]);

  async function handleSaveCompany() {
    if (!tenant) return;
    if (!companyForm.company_name?.trim()) {
      setFormError(t.companyNameRequired);
      return;
    }
    if (companyForm.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyForm.contact_email)) {
      setFormError(t.invalidEmail);
      return;
    }
    setFormError("");

    const current = { ...companyForm };
    const unchanged = (() => {
      try {
        const last = JSON.parse(companySnapshotRef.current || "null");
        if (!last) return false;
        return (
          last.company_name === current.company_name &&
          last.contact_name === current.contact_name &&
          last.contact_email === current.contact_email &&
          last.contact_phone === current.contact_phone &&
          last.city === current.city &&
          last.address === current.address &&
          last.default_currency === current.default_currency &&
          last.default_currency_symbol === current.default_currency_symbol &&
          last.default_language === current.default_language
        );
      } catch {
        return false;
      }
    })();
    if (unchanged) {
      toast.success(t.nothingToChange);
      return;
    }

    const updatePayload = {
      company_name: current.company_name,
      contact_name: current.contact_name,
      contact_email: current.contact_email,
      contact_phone: current.contact_phone,
      city: current.city,
      address: current.address,
      default_currency: current.default_currency,
      default_currency_symbol: current.default_currency_symbol,
      default_language: current.default_language,
      primary_color: primaryColor,
      theme_color: themeHex(themeColor),
    };

    const ok = await saveTenant(updatePayload, { successMessage: t.saveSuccess + " ✓" });
    if (ok) {
      companySnapshotRef.current = JSON.stringify(current);
      lastSavedColorsRef.current = { primaryColor, themeColor: themeHex(themeColor) };
    }
  }

  function applyPrimaryColor(color: string) {
    setPrimaryColor(color);
    setThemePrimaryColor(color);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("sejoura-primary-color-updated", { detail: { primaryColor: color } })
      );
    }
  }

  function applyThemeColor(color: string) {
    setThemeColor(color);
    setThemeContextColor(color);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("sejoura-theme-color-updated", { detail: { themeColor: color } })
      );
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
        toast.error(t.accountSaveError);
        return;
      }

      setUser({ ...user!, full_name: accountForm.full_name, phone: accountForm.phone, email: accountForm.email } as unknown as UserType);
      toast.success(t.accountSaved + " 👤");
    } catch {
      toast.error(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  function handleSaveWhatsApp() {
    if (!whatsappForm.apiToken || !whatsappForm.phoneId || !whatsappForm.webhookVerifyToken) {
      toast.error(t.requiredFields);
      return;
    }
    localStorage.setItem("sejoura-whatsapp-config", JSON.stringify(whatsappForm));
    if (tenant && user) {
      localStorage.setItem(
        `sejoura-whatsapp-config:${tenant.id}:${user.id}`,
        JSON.stringify(whatsappForm)
      );
    }
    toast.success(t.whatsappSaved + " 💾");
  }

  const [deletingAccount, setDeletingAccount] = useState(false);

  async function handleDeleteAccount() {
    if (deletingAccount) return;
    const confirmed = window.confirm(t.deleteAccountConfirm);
    if (!confirmed) return;
    setDeletingAccount(true);
    try {
      const supabase = createClient();
      if (user?.id) {
        await supabase.from("users").update({ is_active: false }).eq("id", user.id);
      }
      await supabase.auth.signOut();
      toast.success(t.accountDeactivated);
      const isEmployee = user?.role === "receptionniste" || user?.role === "menagere";
      window.location.href = isEmployee ? EMPLOYEE_LOGIN_ROUTE : LOGIN_ROUTE;
    } catch {
      toast.error(t.accountDeleteError);
      setDeletingAccount(false);
    }
  }

  async function handleSavePassword() {
    if (!passwordForm.currentPassword || passwordForm.currentPassword.length < 6) {
      toast.error(t.currentPasswordRequired);
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error(t.passwordLength);
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t.passwordMismatch);
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
        toast.error(t.currentPasswordIncorrect);
        return;
      }
      // Modification du mot de passe
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) {
        toast.error(t.passwordSaveError);
        return;
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success(t.passwordUpdated + " 🔐");
    } catch {
      toast.error(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  // Charge le guest_info de la résidence active (hérité de l'entreprise si la
  // résidence n'a rien configuré). Rechargé à chaque changement de résidence.
  useEffect(() => {
    let cancelled = false;
    async function loadPortalGuestInfo() {
      if (!activeAccommodation?.id) {
        setPortalGuestInfo(tenant?.guest_info ?? null);
        setPortalInherited(false);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("accommodations")
        .select("guest_info")
        .eq("id", activeAccommodation.id)
        .maybeSingle();
      if (cancelled) return;
      const accInfo = (data?.guest_info as GuestInfo | null) ?? null;
      const hasOwn =
        accInfo != null &&
        ((accInfo.practical_info?.length ?? 0) > 0 ||
          (accInfo.house_rules?.length ?? 0) > 0 ||
          (accInfo.checkin_note?.trim() ?? "") !== "" ||
          (accInfo.emergency_phone?.trim() ?? "") !== "");
      setPortalGuestInfo(hasOwn ? accInfo : (tenant?.guest_info ?? null));
      setPortalInherited(!hasOwn);
    }
    void loadPortalGuestInfo();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccommodation?.id, tenant?.guest_info]);

  async function handleSaveGuestInfo(info: GuestInfo) {
    setPortalSaving(true);
    try {
      // Résidence active : le guest_info est enregistré POUR CETTE résidence.
      if (activeAccommodation?.id) {
        const supabase = createClient();
        const { error } = await supabase
          .from("accommodations")
          .update({ guest_info: info as unknown as Record<string, unknown> })
          .eq("id", activeAccommodation.id);
        if (error) {
          toast.error(t.saveError);
          return false;
        }
        setPortalGuestInfo(info);
        setPortalInherited(false);
        toast.success(t.guestInfoSavedFor.replace("{name}", activeAccommodation.name));
        return true;
      }
      // Aucune résidence (onboarding en cours) : repli sur l'entreprise.
      const ok = await saveTenant(
        { guest_info: info as unknown as Record<string, unknown> },
        { successMessage: t.guestInfoSaved }
      );
      if (ok) {
        setTenant((prev) => (prev ? { ...prev, guest_info: info } : prev));
        setPortalGuestInfo(info);
        setPortalInherited(false);
      }
      return ok;
    } finally {
      setPortalSaving(false);
    }
  }

  async function handleResetGuestInfo() {
    if (!activeAccommodation?.id) return;
    setPortalSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("accommodations")
        .update({ guest_info: {} })
        .eq("id", activeAccommodation.id);
      if (error) {
        toast.error(t.guestInfoResetError);
        return;
      }
      setPortalGuestInfo(tenant?.guest_info ?? null);
      setPortalInherited(true);
      toast.success(t.guestInfoReset.replace("{name}", activeAccommodation.name));
    } finally {
      setPortalSaving(false);
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
      setLogoError(t.logoFormatError);
      setLogoFile(null);
      return;
    }

    if (file.size > maxSize) {
      setLogoError(t.logoSizeError);
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
      setLogoError(t.logoTenantMissing);
      return;
    }

    if (!logoFile) {
      setLogoError(t.logoSelectError);
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
        setLogoError(result.error || t.logoUploadError);
        return;
      }

      setTenant({ ...tenant, logo_url: result.logoUrl });
      setLogoFile(null);
      setLogoPreviewUrl(result.logoUrl);
      setLogoError("");
      toast.success(t.logoUploadSuccess);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sejoura-logo-updated", { detail: { logoUrl: result.logoUrl } }));
      }
    } catch (error: unknown) {
      setLogoError(t.logoUploadError);
    } finally {
      setLogoUploading(false);
    }
  }

  // Note: La couleur primaire est gérée par ThemeProvider (--color-primary / --primary).
  // L'état local primaryColor sert uniquement à l'input color et à la sauvegarde Supabase.

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const isEmployee = user?.role === "receptionniste" || user?.role === "menagere";

  const sectionLabelMap = Object.fromEntries(
    (t?.settingsSections ?? []).map((s: { key: string; label: string }) => [s.key, s.label])
  );
  const allSections = [
    { key: "company",       label: sectionLabelMap["company"]       || t.companyInfo,    icon: Building2 },
    { key: "account",       label: sectionLabelMap["account"]       || t.accountInfo,         icon: User },
    { key: "appearance",    label: sectionLabelMap["appearance"]    || t.appearance,      icon: theme === "dark" ? Moon : Sun },
    { key: "portal",        label: sectionLabelMap["portal"]        || t.guestPortal,  icon: Smartphone },
    { key: "notifications", label: sectionLabelMap["notifications"] || t.notificationsTitle, icon: Bell },
    { key: "billing",       label: sectionLabelMap["billing"]       || t.billingTitle,    icon: CreditCard },
    { key: "payments",      label: t.onlinePayments,                                icon: Smartphone },
    { key: "whatsapp",      label: sectionLabelMap["whatsapp"]      || t.whatsappTitle,       icon: MessageSquare },
    { key: "integrations",  label: sectionLabelMap["integrations"]  || t.integrationsTitle,  icon: Globe },
    { key: "security",      label: sectionLabelMap["security"]      || t.securityTitle,      icon: Shield },
    { key: "ideas",         label: sectionLabelMap["ideas"]         || t.ideasTitle, icon: Lightbulb },
    { key: "about",         label: sectionLabelMap["about"]         || t.aboutTitle,      icon: Info },
  ];

  // Sections accessibles aux réceptionnistes / ménagères (profil, apparence, notifications, sécurité, à propos)
  const employeeAllowedSections = new Set(["account", "appearance", "notifications", "security", "about"]);
  const sections = isEmployee
    ? allSections.filter((s) => employeeAllowedSections.has(s.key))
    : allSections;

  // Si la section active n'est pas accessible à l'employé, rediriger vers "account"
  const effectiveSection = (isEmployee && !employeeAllowedSections.has(activeSection))
    ? "account"
    : activeSection;

  const activeSectionMeta = sections.find((s) => s.key === effectiveSection) ?? sections[0];
  const ActiveSectionIcon = activeSectionMeta?.icon;

  const handleSelectSection = (key: string) => {
    setActiveSection(key);
    setMobileNavOpen(false);
  };

  const navContent = (
    <nav className="space-y-1">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <button
            key={section.key}
            onClick={() => handleSelectSection(section.key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              effectiveSection === section.key
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
  );

  return (
    <div className="space-y-3 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{t.pageTitle}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{t.pageSubtitle}</p>
      </div>

      {/* Mobile : bouton d'ouverture du drawer des paramètres */}
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="lg:hidden w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-left"
        aria-haspopup="dialog"
        aria-expanded={mobileNavOpen}
      >
        <span className="flex items-center gap-3 min-w-0">
          {ActiveSectionIcon && (
            <ActiveSectionIcon className="w-4 h-4 shrink-0 text-[var(--primary-color,#0C1C33)]" />
          )}
          <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
            {activeSectionMeta?.label}
          </span>
        </span>
        <Menu className="w-5 h-5 shrink-0 text-slate-500 dark:text-slate-400" />
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="hidden lg:block lg:col-span-3 p-4 h-fit">
          {navContent}
        </Card>

        {/* Mobile : drawer coulissant */}
        <div
          className={`lg:hidden fixed inset-0 z-50 ${mobileNavOpen ? "" : "pointer-events-none"}`}
          aria-hidden={!mobileNavOpen}
        >
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
              mobileNavOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white dark:bg-slate-900 shadow-xl transition-transform duration-300 ${
              mobileNavOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t.pageTitle}
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label={t.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {navContent}
            </div>
          </div>
        </div>

        <div className="lg:col-span-9 space-y-3">
          {effectiveSection === "company" && (
            <div className="space-y-3">
              <Card className="p-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.companyInfo}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">{t.companyHelp}</p>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label={t.companyName} value={companyForm.company_name} onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })} />
                    <Input label={t.contactName} value={companyForm.contact_name} onChange={(e) => setCompanyForm({ ...companyForm, contact_name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label={t.email} type="email" value={companyForm.contact_email} onChange={(e) => setCompanyForm({ ...companyForm, contact_email: e.target.value })} />
                    <Input label={t.phone} value={companyForm.contact_phone} onChange={(e) => setCompanyForm({ ...companyForm, contact_phone: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label={t.city} value={companyForm.city} onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })} />
                    <Input label={t.address} value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
                  </div>
                  {formError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                  )}
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveCompany} loading={saving} disabled={!companyForm.company_name.trim()}>
                      <Save className="w-4 h-4" /> {t.save}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.logoUpload}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{t.logoUploadHelp}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <span>{t.logoSelectFile}</span>
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
                         {t.noLogo}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between gap-4">
                    <div>
                      {logoFile && (
                         <p className="text-sm text-slate-600 dark:text-slate-300">{t.fileSelected} {logoFile.name}</p>
                      )}
                      {!logoFile && tenant?.logo_url && (
                        <p className="text-sm text-slate-600 dark:text-slate-300">{t.currentLogoLoaded}</p>
                      )}
                       <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{t.formatsSupported}</p>
                      {logoError && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{logoError}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                       <Button onClick={handleUploadLogo} loading={logoUploading} disabled={!logoFile || !!logoError}>
                         {t.logoUploadButton}
                       </Button>
                      {logoFile && (
                         <Button variant="secondary" onClick={() => {
                           setLogoFile(null);
                           setLogoPreviewUrl(tenant?.logo_url || null);
                           setLogoError("");
                         }}>
                            {common.cancel}
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
                       <p className="text-sm font-medium text-slate-900 dark:text-white">{t.employeeLoginLink}</p>
                       <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{t.employeeLoginLinkHelp}</p>
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
                        toast.success(t.linkCopied);
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


          {effectiveSection === "account" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.accountInfo}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">{t.accountHelp}</p>

              <div className="space-y-3">
                <Input label={t.fullName} value={accountForm.full_name} onChange={(e) => setAccountForm({ ...accountForm, full_name: e.target.value })} />
                <Input label={t.phone} value={accountForm.phone} onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })} />
                <Input label={t.email} type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} />
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveAccount} loading={saving}>{t.save}</Button>
                </div>
              </div>
            </Card>
          )}

          {effectiveSection === "appearance" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.appearance}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t.appearanceHelp}</p>

               <div className="space-y-3">
                 {/* ---- Couleurs du portail ---- */}
                 <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
                  <div>
                     <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                       <Palette className="w-5 h-5 text-indigo-500" />
                       {t.portalColorsTitle}
                     </h3>
                     <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                       {t.portalColorsHelp}
                     </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                       <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                         {t.pastelColor}
                       </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => applyPrimaryColor(e.target.value)}
                          className="h-10 w-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-1 cursor-pointer"
                        />
                        <Input
                          value={primaryColor}
                          onChange={(e) => applyPrimaryColor(e.target.value)}
                          placeholder="#9d174d"
                          className="font-mono text-sm uppercase"
                        />
                      </div>
                    </div>

                    <div>
                       <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                         {t.darkVersion}
                       </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={themeHex(themeColor)}
                          onChange={(e) => applyThemeColor(e.target.value)}
                          className="h-10 w-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-1 cursor-pointer"
                        />
                        <Input
                          value={themeHex(themeColor)}
                          onChange={(e) => applyThemeColor(e.target.value)}
                          placeholder="#701a43"
                          className="font-mono text-sm uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Presets rapides de couleurs */}
                  <div className="pt-2">
                     <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">{t.presetColorThemes}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                      {[
                        { id: "ocean", name: t.presetNames.ocean, main: "#0d9488", dark: "#134e4a" },
                        { id: "cacao", name: t.presetNames.cacao, main: "#78350f", dark: "#451a03" },
                        { id: "nuit", name: t.presetNames.nuit, main: "#2563eb", dark: "#0f172a" },
                        { id: "violet", name: t.presetNames.violet, main: "#9333ea", dark: "#3b0764" },
                        { id: "bordeaux", name: t.presetNames.bordeaux, main: "#9d174d", dark: "#701a43" },
                        { id: "soleil", name: t.presetNames.soleil, main: "#d97706", dark: "#78350f" },
                        { id: "slate", name: t.presetNames.slate, main: "#475569", dark: "#111827" },
                      ].map((preset) => {
                        const currentDark = themeHex(themeColor);
                        const isActive = currentDark.toLowerCase() === preset.dark.toLowerCase();

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={async () => {
                              applyPrimaryColor(preset.main);
                              applyThemeColor(preset.dark);
                              await persistColors(preset.main, preset.dark, { successMessage: `Thème ${preset.name} appliqué ✓` });
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
                       <p className="text-sm font-medium text-slate-900 dark:text-white">{t.displayMode}</p>
                       <p className="text-xs text-slate-500 dark:text-slate-400">{t.themeHelp}</p>
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
                       <p className="text-sm font-medium text-slate-900 dark:text-white">{t.appLanguage}</p>
                       <p className="text-xs text-slate-500 dark:text-slate-400">{t.chooseLanguage}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={lang}
                      onChange={async (e) => {
                        const newLang = e.target.value as "fr" | "en";
                        setLang(newLang);
                        const nextForm = { ...companyForm, default_language: newLang };
                        setCompanyForm(nextForm);
                        const ok = await saveTenant(
                          { default_language: newLang },
                          { successMessage: t.languageSaved.replace("{language}", newLang === "en" ? "English" : "Français") }
                        );
                        if (ok) companySnapshotRef.current = JSON.stringify(nextForm);
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
                       <p className="text-sm font-medium text-slate-900 dark:text-white">{t.referenceCurrency}</p>
                       <p className="text-xs text-slate-500 dark:text-slate-400">
                         {t.referenceCurrencyHelp}
                         {activeAccommodation && activeAccommodation.currency !== companyForm.default_currency && (
                           <> {t.currentDisplay} : <strong className="text-[var(--primary-color,#0C1C33)]">{activeAccommodation.currency_symbol}</strong> ({activeAccommodation.currency}) {t.forWord} « {activeAccommodation.name} ».</>
                         )}
                       </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
                    <select
                      value={companyForm.default_currency}
                      onChange={async (e) => {
                        const currCode = e.target.value;
                        const sel = SUPPORTED_CURRENCIES.find((c) => c.code === currCode);
                        const symbol = sel ? sel.symbol : currCode;
                        const nextForm = { ...companyForm, default_currency: currCode, default_currency_symbol: symbol };
                        setCompanyForm(nextForm);
                        const ok = await saveTenant(
                          { default_currency: currCode, default_currency_symbol: symbol },
                          { successMessage: `Devise de référence mise à jour : ${symbol} (${currCode}) ✓` }
                        );
                        if (ok) companySnapshotRef.current = JSON.stringify(nextForm);
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
                      onClick={() => {
                        const last = lastSavedColorsRef.current;
                        const unchanged =
                          last &&
                          last.primaryColor === primaryColor &&
                          last.themeColor === themeHex(themeColor);
                        if (unchanged) {
                          toast.success(t.appearanceAlreadySaved);
                          return;
                        }
                        persistColors(primaryColor, themeColor, { successMessage: t.appearanceSaved });
                      }}
                      loading={saving}
                      className="text-white hover:brightness-110"
                      style={{ backgroundColor: themeHex(themeColor) }}
                    >
                      <Save className="w-4 h-4 mr-2" /> {t.saveAppearance}
                    </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Espace client */}
          {effectiveSection === "portal" && (
            <div className="space-y-3">
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
                    <Smartphone className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                   <div>
                     <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.guestPortal}</h2>
                     <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
                       {t.guestPortalHelp}
                     </p>
                     <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                       {activeAccommodation
                         ? (lang === "en" ? `Applied to residence « {name} ». Each residence can have its own conditions.` : `Configuration appliquée à la résidence « {name} ». Chaque résidence peut avoir ses propres conditions.`).replace("{name}", activeAccommodation.name)
                         : (lang === "en" ? "Company configuration (applied as long as no residence has its own conditions)." : "Configuration de l'entreprise (appliquée tant qu'aucune résidence n'a ses propres conditions).")}
                     </p>
                   </div>
                </div>
                {activeAccommodation && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                     {portalInherited ? (
                       <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 px-3 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                         <Info className="w-3.5 h-3.5" />
                         {t.inheritedFromCompany}
                       </span>
                     ) : (
                       <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                         <Check className="w-3.5 h-3.5" />
                         {t.ownConditions}
                       </span>
                     )}
                    {!portalInherited && (
                       <Button
                         variant="secondary"
                         size="sm"
                         onClick={handleResetGuestInfo}
                         loading={portalSaving}
                         disabled={!activeAccommodation}
                       >
                         <X className="w-3.5 h-3.5" /> {t.resetInherit}
                       </Button>
                    )}
                  </div>
                )}
              </Card>

              <GuestInfoEditor
                key={activeAccommodation?.id ?? "tenant"}
                initial={portalGuestInfo}
                branding={{
                  company_name: tenant?.company_name ?? "",
                  logo_url: tenant?.logo_url ?? null,
                  primary_color: tenant?.primary_color ?? null,
                }}
                saving={saving || portalSaving}
                onSave={handleSaveGuestInfo}
              />
            </div>
          )}

          {/* Notifications */}
          {effectiveSection === "notifications" && (
              <Card className="p-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.notificationsTitle}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">{t.notificationsHelp}</p>

              <div className="space-y-3">
                {[
                  { key: "emailNotifs", label: t.notifications.emailLabel, desc: t.notifications.emailDesc },
                  { key: "pushNotifs", label: t.notifications.pushLabel, desc: t.notifications.pushDesc },
                  { key: "bookingAlerts", label: t.notifications.bookingAlertsLabel, desc: t.notifications.bookingAlertsDesc },
                  { key: "paymentAlerts", label: t.notifications.paymentAlertsLabel, desc: t.notifications.paymentAlertsDesc },
                  { key: "cleaningAlerts", label: t.notifications.cleaningAlertsLabel, desc: t.notifications.cleaningAlertsDesc },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => {
                        const key = item.key as keyof typeof notifForm;
                        const next = { ...notifForm, [key]: !notifForm[key] };
                        setNotifForm(next);
                        if (tenant && user) {
                          localStorage.setItem(
                            `sejoura-notif-prefs:${tenant.id}:${user.id}`,
                            JSON.stringify(next)
                          );
                        }
                      }}
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
          {effectiveSection === "billing" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.billingTitle}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">{t.billingHelp}</p>
              <Button onClick={() => window.location.href = "/dashboard/subscription"}>
                <CreditCard className="w-4 h-4" /> {t.billingButton}
              </Button>
            </Card>
          )}

          {/* WhatsApp */}
          {effectiveSection === "whatsapp" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.whatsappTitle}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">{t.whatsappHelp}</p>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                     <p className="text-sm text-yellow-800 dark:text-yellow-300">
                       ⚠ {lang === "en" ? "WhatsApp Business API requires a Meta Business account and a verified phone number." : "L'API WhatsApp Business nécessite un compte Meta Business et un numéro de téléphone vérifié."}
                     </p>
                  </div>
                  <Input label="Token API" placeholder="EAAxxxxxxxxxxxxx" value={whatsappForm.apiToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, apiToken: e.target.value })} />
                  <Input label="Numéro de téléphone ID" placeholder="1234567890" value={whatsappForm.phoneId} onChange={(e) => setWhatsappForm({ ...whatsappForm, phoneId: e.target.value })} />
                  <Input label="Token de vérification Webhook" placeholder="sejoura_verify_token" value={whatsappForm.webhookVerifyToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, webhookVerifyToken: e.target.value })} />
                   <div className="flex justify-end pt-2">
                     <Button onClick={handleSaveWhatsApp}>{t.save}</Button>
                 </div>
              </div>
            </Card>
          )}

          {/* Paiements en ligne */}
          {effectiveSection === "payments" && (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Paiements en ligne</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Configurez vos passerelles de paiement pour accepter les réservations payantes depuis Trouvetou.
                </p>
              </div>
              <PaymentGatewaysSection />
            </div>
          )}

          {/* Intégrations */}
          {effectiveSection === "integrations" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.integrationsTitle}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">{t.integrationsHelp}</p>

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
                       {integ.status === "partial" ? t.statusPartial : t.comingSoon}
                     </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Sécurité */}
          {effectiveSection === "security" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t.securityTitle}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">{t.securityHelp}</p>

                <div className="space-y-3">
                  <Input label={t.passwordCurrent} type="password" placeholder="••••••••" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                  <Input label={t.passwordNew} type="password" placeholder="••••••••" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                  <Input label={t.passwordConfirm} type="password" placeholder="••••••••" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSavePassword} loading={saving}>{t.passwordUpdate}</Button>
                  </div>
                  <div className="mt-6 pt-4 border-t border-red-200 dark:border-red-900/40">
                    <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
                      {t.dangerZone}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      {lang === "en"
                        ? "Deactivate your account and sign out. Contact support to restore access."
                        : "Désactivez votre compte et déconnectez-vous. Contactez le support pour restaurer l'accès."}
                    </p>
                    <Button variant="destructive" onClick={handleDeleteAccount} loading={deletingAccount}>
                      {t.deleteAccount}
                    </Button>
                  </div>
                </div>
            </Card>
          )}

          {/* Boîte à idées & Roadmap */}
          {effectiveSection === "ideas" && <IdeaBoxSection />}

          {/* À propos */}
          {effectiveSection === "about" && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                {t.aboutTitle}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">
                {t.aboutHelp}
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-color,#0C1C33)]">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{APP_NAME}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Séjoura by Refontiq</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between py-1.5">
                     <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                       {t.aboutVersionLabel}
                     </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">v{APP_VERSION}</span>
                  </div>
                </div>

                <a
                  href="/cgu"
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/40 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                   {t.aboutTermsLink}
                </a>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
