"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OnboardingStatusResponse } from "@/app/api/auth/onboarding-status/route";
import { toast } from "sonner";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Breadcrumbs } from "@/components/dashboard/breadcrumbs";
import { Loader2 } from "lucide-react";
import { OnboardingModal } from "@/components/dashboard/onboarding-modal";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import { LOGIN_ROUTE } from "@/lib/routes";
import { getSidebarThemeStyles } from "@/lib/colors";
import { useTheme } from "@/components/providers/theme-provider";
import type { User } from "@/types/database";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const t = translations[lang].dashboard;
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authUserId, setAuthUserId] = useState<string>("");
  const [companyName, setCompanyName] = useState("Mon Entreprise");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [plan, setPlan] = useState("standard");
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // L'étape 2 (onboarding) est décidée côté serveur via le client admin
  // (service_role) pour être insensible aux politiques RLS du navigateur.
  // En cas d'échec, on ne force JAMAIS l'onboarding : le tableau de bord
  // gère lui-même l'état "aucun établissement".
  async function fetchOnboardingStatus(): Promise<boolean> {
    try {
      const res = await fetch("/api/auth/onboarding-status");
      if (!res.ok) return false;
      const data = (await res.json()) as OnboardingStatusResponse;
      return Boolean(data.needsOnboarding);
    } catch {
      return false;
    }
  }

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Écouter la mise à jour du logo et de la couleur de thème depuis les Paramètres en temps réel
  useEffect(() => {
    function handleLogoUpdated(e: Event) {
      const url = (e as CustomEvent<{ logoUrl: string }>).detail?.logoUrl;
      if (url) setCompanyLogo(url);
    }
    function handleThemeColorUpdated(e: Event) {
      const color = (e as CustomEvent<{ themeColor: string }>).detail?.themeColor;
      if (color) setThemeColor(color);
    }
    window.addEventListener("sejoura-logo-updated", handleLogoUpdated);
    window.addEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
    return () => {
      window.removeEventListener("sejoura-logo-updated", handleLogoUpdated);
      window.removeEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
    };
  }, []);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push(LOGIN_ROUTE);
          return;
        }

        let { data: userData } = await supabase
          .from("users")
          .select("id, auth_user_id, role, full_name, phone, email, is_active, activated_at, last_login_at, avatar_url, tenant_id, accommodation_id")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        const isEmployeeEmail = session.user.email?.includes("@employe.sejoura.com");
        const metadataRole = session.user.user_metadata?.role;
        const isEmployeeIdentity = isEmployeeEmail || metadataRole === "menagere" || metadataRole === "receptionniste";

        // Cette route sert uniquement à rattacher un compte employé déjà créé
        // par son employeur. Un nouveau gérant n'a volontairement pas encore de
        // profil à l'étape 2 : l'appeler ici produisait un faux 404.
        if (!userData && isEmployeeIdentity) {
          try {
            const res = await fetch("/api/employee-auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone: session.user.email ? session.user.email.split("@")[0] : "",
                authUserId: session.user.id,
                email: session.user.email || "",
              }),
            });
            const apiData = await res.json();
            if (res.ok && apiData.user) {
              userData = apiData.user;
            }
          } catch {
            // Ignorer si échec
          }
        }

        if (!userData) {
          const provisionalUser = {
            id: "",
            auth_user_id: session.user.id,
            role: (metadataRole || (isEmployeeEmail ? "receptionniste" : "admin_residence")) as User["role"],
            full_name: session.user.user_metadata?.full_name || session.user.email || "Utilisateur",
            phone: "",
            email: session.user.email || "",
            password_hash: null,
            is_active: true,
            activated_at: new Date().toISOString(),
            last_login_at: null,
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tenant_id: null,
            accommodation_id: null,
          };
          setUser(provisionalUser as unknown as User);
          setAuthUserId(session.user.id);
          // L'onboarding ne doit s'afficher QUE pour les véritables administrateurs
          // créateurs d'espace : la décision fiable vient du serveur (service_role).
          setNeedsOnboarding(await fetchOnboardingStatus());
          setLoading(false);
          return;
        }

        if (!userData.is_active) {
          router.push(LOGIN_ROUTE);
          return;
        }

        // Redirection spécifique au rôle Ménagère (silencieuse, pas d'alerte)
        if (userData.role === "menagere") {
          router.push("/menage");
          return;
        }

        // Le Super Admin n'utilise pas l'espace résidence : on l'envoie sur
        // la console d'administration (/admin)
        if (userData.role === "super_admin") {
          router.push("/admin");
          return;
        }

        // Protection des routes réservées aux Admins pour les Réceptionnistes
        if (userData.role === "receptionniste") {
          const adminOnlyRoutes = [
            "/dashboard/accounting",
            "/dashboard/employees",
            "/dashboard/settings",
            "/dashboard/subscription",
            // /dashboard/residences (liste), /dashboard/residences/[id] (détail avec chambres),
            // /dashboard/shift, /dashboard/cleaning, /dashboard/bookings sont autorisés
          ];
          // Bloquer uniquement la liste des résidences, pas les détails
          if (pathname === "/dashboard/residences" || adminOnlyRoutes.some((route) => pathname.startsWith(route))) {
            router.push("/dashboard");
            return;
          }
        }

        // Protection des routes Ménage/Shift pour les Admins (masquées de leur menu)
        if (userData.role === "admin_residence") {
          const staffOnlyRoutes = ["/dashboard/cleaning", "/dashboard/shift"];
          if (staffOnlyRoutes.some((route) => pathname.startsWith(route))) {
            router.push("/dashboard");
            return;
          }
        }

        setUser(userData as unknown as User);
        setAuthUserId(session.user.id);

        if (userData.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("company_name, logo_url, theme_color")
            .eq("id", userData.tenant_id)
            .maybeSingle();

          if (tenantData) {
            setCompanyName(tenantData.company_name);
            setCompanyLogo(tenantData.logo_url ?? null);
            if (tenantData.theme_color) {
              setThemeColor(tenantData.theme_color);
              if (typeof window !== "undefined") {
                localStorage.setItem("theme_color", tenantData.theme_color);
                localStorage.setItem("sejoura-theme-color", tenantData.theme_color);
              }
            } else {
              setThemeColor(null);
            }
          }

          const { data: subData } = await supabase
            .from("subscriptions")
            .select("plan, monthly_price")
            .eq("tenant_id", userData.tenant_id)
            .maybeSingle();

          if (subData) {
            setPlan(subData.plan);
            setMonthlyPrice(subData.monthly_price || 0);
          }
        }

        // Le tenant seul ne suffit pas pour décider si l'étape 2 est terminée :
        // la présence d'un établissement est vérifiée côté serveur (service_role)
        // pour ne jamais renvoyer un compte déjà configuré vers l'onboarding.
        setNeedsOnboarding(await fetchOnboardingStatus());

        setLoading(false);
      } catch (err) {
        // Échec de chargement : on n'expulse jamais l'utilisateur vers la page
        // de connexion (cela créerait une fausse déconnexion / boucle). On
        // affiche un écran d'erreur avec bouton "Réessayer".
        console.error("dashboard: auth check failed", err);
        setLoadError(true);
        setLoading(false);
      }
    }

    checkAuth();
  }, [router, retryCount]);

  // Titre / sous-titre intelligents selon la page courante.
  // Sur /dashboard : accueil personnalisé (bonjour + prénom + date du jour).
  // Sur les autres pages : titre et description propres à chaque module.
  const headerMeta = (() => {
    const d = translations[lang];
    const firstName = user?.full_name?.trim().split(/\s+/)[0] || "";
    const p = pathname || "/dashboard";

    if (p === "/dashboard") {
      const hour = new Date().getHours();
      const isDay = hour >= 6 && hour < 18;
      const greeting = lang === "en" ? (isDay ? "Good morning" : "Good evening") : isDay ? "Bonjour" : "Bonsoir";
      const todayLabel = new Date().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      return {
        title: `${greeting}${firstName ? `, ${firstName}` : ""}`,
        subtitle: `${t.subtitle} · ${todayLabel}`,
      };
    }

    const map: Record<string, { title: string; subtitle?: string }> = {
      "/dashboard/residences": d.residences,
      "/dashboard/rooms": d.rooms,
      "/dashboard/bookings": d.bookings,
      "/dashboard/cleaning": d.cleaning,
      "/dashboard/accounting": d.accounting,
      "/dashboard/employees": d.employees,
      "/dashboard/subscription": d.subscription,
      "/dashboard/settings": { title: d.settings.pageTitle, subtitle: d.settings.pageSubtitle },
      "/dashboard/shift": {
        title: lang === "en" ? "My Shift / Cash" : "Mon Shift / Caisse",
        subtitle: lang === "en" ? "Shift overview" : "Vue d'ensemble du shift",
      },
    };
    return map[p] || { title: t.title, subtitle: t.subtitle };
  })();

  const activeTheme = getSidebarThemeStyles(themeColor, theme === "dark");
  // En mode sombre, la couleur primaire dynamique devient la couleur dorée Séjoura
  // pour garantir un contraste suffisant sur fond sombre
  const dynamicPrimaryColor = theme === "dark" ? "#C2944E" : activeTheme.sidebarBg;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--sidebar-bg", activeTheme.sidebarBg);
      document.documentElement.style.setProperty("--main-bg", activeTheme.mainBg);
      document.documentElement.style.setProperty("--primary-color", dynamicPrimaryColor);
      document.documentElement.style.setProperty("--primary-light", activeTheme.mainBg);
      document.documentElement.style.setProperty("--primary-hover", activeTheme.hoverBg);
      document.documentElement.style.setProperty("--card-bg", activeTheme.cardBg);
      document.documentElement.style.setProperty("--card-border", activeTheme.cardBorder);
    }
  }, [activeTheme.sidebarBg, activeTheme.mainBg, activeTheme.hoverBg, activeTheme.cardBg, activeTheme.cardBorder, dynamicPrimaryColor]);

  function handleOnboardingComplete() {
    setNeedsOnboarding(false);
    toast.success("Bienvenue ! Votre espace est prêt.");
    window.location.reload();
  }

  // L'utilisateur peut fermer l'étape 2 et continuer plus tard : on lève le
  // blocage. Le tableau de bord gère lui-même l'état "aucun établissement".
  function handleOnboardingDismiss() {
    setNeedsOnboarding(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--main-bg,var(--background))]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--main-bg,var(--background))]">
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Impossible de charger votre espace. Vérifiez votre connexion puis réessayez.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadError(false);
            setLoading(true);
            setRetryCount((c) => c + 1);
          }}
          className="px-4 py-2 rounded-lg bg-[var(--primary-color,#0C1C33)] text-white text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div 
      className="min-h-screen dashboard-bg transition-colors duration-300"
      style={{
        backgroundColor: activeTheme.mainBg,
        ["--sidebar-bg" as string]: activeTheme.sidebarBg,
        ["--main-bg" as string]: activeTheme.mainBg,
        ["--primary-color" as string]: dynamicPrimaryColor,
        ["--primary-light" as string]: activeTheme.mainBg,
        ["--primary-hover" as string]: activeTheme.hoverBg,
        ["--card-bg" as string]: activeTheme.cardBg,
        ["--card-border" as string]: activeTheme.cardBorder,
      } as React.CSSProperties}
    >
      <Sidebar
        userRole={user.role}
        userName={user.full_name}
        companyName={companyName}
        companyLogo={companyLogo}
        themeColor={themeColor}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onCloseMobile={() => setSidebarCollapsed(true)}
      />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? "lg:ml-20" : "lg:ml-60"}`}>
        <Header
          title={headerMeta.title}
          subtitle={headerMeta.subtitle}
          onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          userName={user.full_name}
          userRole={user.role}
          userEmail={user.email}
          avatarUrl={user.avatar_url}
          lastLogin={user.last_login_at}
          companyName={companyName}
          plan={plan}
          monthlyPrice={monthlyPrice}
        />
        <Breadcrumbs />
        <main 
          style={{ backgroundColor: activeTheme.mainBg }} 
          className={`p-3 md:p-4 relative transition-colors duration-200 ${needsOnboarding ? "blur-sm pointer-events-none select-none" : ""}`}
        >
          {children}
        </main>
      </div>

      {needsOnboarding && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-md" />
      )}

      {needsOnboarding && (
        <OnboardingModal
          userId={authUserId}
          email={user?.email || ""}
          fullName={user?.full_name || ""}
          userRole={user?.role}
          onComplete={handleOnboardingComplete}
          onClose={handleOnboardingDismiss}
        />
      )}
    </div>
  );
}
