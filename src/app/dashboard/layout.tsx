"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OnboardingStatusResponse } from "@/app/api/auth/onboarding-status/route";
import { toast } from "sonner";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Skeleton, DashboardSkeletons } from "@/components/ui/skeletons";
import { OnboardingModal } from "@/components/dashboard/onboarding-modal";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import { LOGIN_ROUTE, ADMIN_HUB_ROUTE } from "@/lib/routes";
import { getSidebarThemeStyles, derivePastelColor } from "@/lib/colors";
import { useTheme } from "@/components/providers/theme-provider";
import { useAccommodation } from "@/hooks/use-accommodation";
import { useOnlineBookingBadge } from "@/hooks/use-online-booking-badge";
import { NotificationsProvider } from "@/contexts/notifications-context";
import { CurrentUserProvider } from "@/contexts/current-user-context";
import { getActiveAssignmentId } from "@/lib/assignments";
import ReauthModal, { isEmpVerified } from "@/components/auth/reauth-modal";
import type { User, Accommodation } from "@/types/database";

const ACTIVE_ACCOMMODATION_STORAGE_KEY = "sejoura-active-accommodation";
const MOBILE_BREAKPOINT = 1024;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const { setAccommodations, setActiveAccommodationId } = useAccommodation();
  const t = translations[lang].dashboard;
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authUserId, setAuthUserId] = useState<string>("");
  const [companyName, setCompanyName] = useState("Mon Entreprise");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string>("");
  const [plan, setPlan] = useState("standard");
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return true;
  });
  // Ref miroir : le handler de scroll (attaché une seule fois) lit l'état
  // courant via ce ref, sans avoir à se reabonner à chaque toggle sidebar.
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  useEffect(() => {
    sidebarCollapsedRef.current = sidebarCollapsed;
  }, [sidebarCollapsed]);

  const [headerHidden, setHeaderHidden] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // Heure locale du navigateur pour le greeting (évite le décalage UTC côté serveur)
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const { count: onlineBookingCount, markAsViewed } = useOnlineBookingBadge(user);

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

  // Mettre à jour l'heure locale toutes les 5 min pour le greeting
  useEffect(() => {
    const id = setInterval(() => setLocalHour(new Date().getHours()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // La vérification reauth (PIN) est gérée dans checkAuth() : seuls les
  // employés (réceptionnistes) y sont soumis. Les admins utilisent email+
  // mot de passe et n'ont pas de code secret.

  // Gérer la sidebar responsive : plier en mobile, déplier en desktop.
  useEffect(() => {
    function handleResize() {
      setSidebarCollapsed(window.innerWidth < MOBILE_BREAKPOINT);
    }
    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // En-tête "intelligent" : ombre + masquage sur scroll.
  // - Les setState sont coalescés dans une seule frame d'animation (rAF) pour
  //   éviter de re-render à chaque événement `scroll` (peut tirer > 60 Hz sur
  //   écrans 120/144 Hz).
  // - `window.innerWidth` est caché dans un ref pour éviter un layout-forced
  //   read à chaque scroll.
  // - Le listener est attaché une seule fois (deps vides) et lit
  //   `sidebarCollapsedRef.current` pour connaître l'état courant.
  useEffect(() => {
    let lastY = window.scrollY;
    const widthRef = { current: typeof window !== "undefined" ? window.innerWidth : 1280 };
    const syncWidth = () => {
      widthRef.current = window.innerWidth;
    };
    window.addEventListener("resize", syncWidth, { passive: true });

    let frame = 0;
    let nextScrolled: boolean | null = null;
    let nextHidden: boolean | null = null;
    const flush = () => {
      frame = 0;
      if (nextScrolled !== null) {
        setHeaderScrolled(nextScrolled);
        nextScrolled = null;
      }
      if (nextHidden !== null) {
        setHeaderHidden(nextHidden);
        nextHidden = null;
      }
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(flush);
    };

    const onScroll = () => {
      const y = window.scrollY;
      nextScrolled = y > 12;
      const isMobile = widthRef.current < MOBILE_BREAKPOINT;
      const drawerOpen = isMobile && !sidebarCollapsedRef.current;
      if (isMobile && y > 160 && y > lastY && !drawerOpen) {
        nextHidden = true;
      } else if (y < lastY || drawerOpen) {
        nextHidden = false;
      }
      lastY = y;
      schedule();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncWidth);
      if (frame) cancelAnimationFrame(frame);
    };
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
    function handlePrimaryColorUpdated(e: Event) {
      const color = (e as CustomEvent<{ primaryColor: string }>).detail?.primaryColor;
      if (color) setPrimaryColor(color);
    }
    window.addEventListener("sejoura-logo-updated", handleLogoUpdated);
    window.addEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
    window.addEventListener("sejoura-primary-color-updated", handlePrimaryColorUpdated);
    return () => {
      window.removeEventListener("sejoura-logo-updated", handleLogoUpdated);
      window.removeEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
      window.removeEventListener("sejoura-primary-color-updated", handlePrimaryColorUpdated);
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
            full_name: session.user.user_metadata?.full_name || "",
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
          const serverNeedsOnboarding = await fetchOnboardingStatus();
          // L'étape 2 est obligatoire — on ne respecte plus le refus précédent.
          setNeedsOnboarding(serverNeedsOnboarding);
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
        // le hub des produits Refontiq (/admin/dashboard)
        if (userData.role === "super_admin") {
          router.push(ADMIN_HUB_ROUTE);
          return;
        }

        // Protection des routes réservées aux Admins pour les Réceptionnistes
        if (userData.role === "receptionniste") {
          const adminOnlyRoutes = [
            "/dashboard/accounting",
            "/dashboard/employees",
            "/dashboard/hr",
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

        // Protection des routes Shift pour les Admins (masquées de leur menu)
        // NB : le suivi ménage (/dashboard/cleaning) est bien accessible à
        // l'admin résidence et au réceptionniste.
        if (userData.role === "admin_residence") {
          const staffOnlyRoutes = ["/dashboard/shift"];
          if (staffOnlyRoutes.some((route) => pathname.startsWith(route))) {
            router.push("/dashboard");
            return;
          }
        }

        setUser(userData as unknown as User);
        setAuthUserId(session.user.id);

        // La vérification reauth (PIN) ne concerne QUE les employés
        // (réceptionnistes). Les admins et super_admins utilisent email+
        // mot de passe — ils n'ont pas de code secret.
        const isEmployee = userData.role === "receptionniste" || userData.role === "menagere";
        if (isEmployee) {
          setNeedsReauth(!isEmpVerified());
        }

        if (userData.tenant_id) {
          // Fan-out parallèle : tenant, abonnement, résidences et statut
          // d'onboarding sont indépendants. Avant, ils étaient enchaînés
          // séquentiellement et bloquaient le premier paint (≈ 4 RTT).
          const [tenantRes, subRes, accsRes, serverNeedsOnboarding] = await Promise.all([
            supabase
              .from("tenants")
              .select("company_name, logo_url, theme_color, primary_color")
              .eq("id", userData.tenant_id)
              .maybeSingle(),
            supabase
              .from("subscriptions")
              .select("plan, monthly_price")
              .eq("tenant_id", userData.tenant_id)
              .maybeSingle(),
            supabase
              .from("accommodations")
              .select("id, name, address, city, logo_url, accommodation_type, created_at, tenant_id, is_active")
              .eq("tenant_id", userData.tenant_id)
              .order("name"),
            fetchOnboardingStatus(),
          ]);

          if (tenantRes.data) {
            setCompanyName(tenantRes.data.company_name);
            setCompanyLogo(tenantRes.data.logo_url ?? null);
            if (tenantRes.data.primary_color) setPrimaryColor(tenantRes.data.primary_color);
            if (tenantRes.data.theme_color) {
              setThemeColor(tenantRes.data.theme_color);
              if (typeof window !== "undefined") {
                localStorage.setItem("theme_color", tenantRes.data.theme_color);
              }
            } else {
              setThemeColor(null);
            }
          }

          if (subRes.data) {
            setPlan(subRes.data.plan);
            setMonthlyPrice(subRes.data.monthly_price || 0);
          }

          setNeedsOnboarding(serverNeedsOnboarding);

          if (accsRes.data) {
            let accessible = accsRes.data as unknown as Accommodation[];
            if (userData.role === "receptionniste" || userData.role === "menagere") {
              const assignedId = await getActiveAssignmentId(
                supabase,
                userData.id,
                userData.accommodation_id
              );
              if (assignedId) accessible = accessible.filter((a) => a.id === assignedId);
            }
            setAccommodations(accessible);

            // Déterminer la résidence active :
            // 1. Valeur persistée si toujours accessible
            // 2. Sinon l'affectation permanente de l'utilisateur
            // 3. Sinon la première résidence de la liste
            let activeId: string | null = null;
            const storedId =
              typeof window !== "undefined"
                ? window.localStorage.getItem(ACTIVE_ACCOMMODATION_STORAGE_KEY)
                : null;
            if (storedId && accessible.some((a) => a.id === storedId)) {
              activeId = storedId;
            } else if (
              userData.accommodation_id &&
              accessible.some((a) => a.id === userData.accommodation_id)
            ) {
              activeId = userData.accommodation_id;
            } else if (accessible.length > 0) {
              activeId = accessible[0].id;
            }
            setActiveAccommodationId(activeId);
          }
        } else {
          const serverNeedsOnboarding = await fetchOnboardingStatus();
          setNeedsOnboarding(serverNeedsOnboarding);
        }

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
  }, [router, retryCount, setAccommodations, setActiveAccommodationId]);

  // Marquer les réservations en ligne comme consultées quand on ouvre le module Réservations
  useEffect(() => {
    if (pathname === "/dashboard/bookings") {
      markAsViewed();
    }
  }, [pathname, markAsViewed]);

  // Titre / sous-titre intelligents selon la page courante.
  // Mémoïsé : sans useMemo, on reconstruit l'objet 30+ clés à chaque render
  // du layout, ce qui force le Header à re-render (mémoïsé en aval) car sa
  // prop `subtitle` change d'identité.
  const headerMeta = useMemo(() => {
    const d = translations[lang];
    const firstName = user?.full_name?.trim().split(/\s+/)[0] || "";
    const p = pathname || "/dashboard";

    if (p === "/dashboard") {
      const hour = localHour;
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
      "/dashboard/hr": {
        title: lang === "en" ? "HR Records" : "Dossiers RH",
        subtitle:
          lang === "en"
            ? "Employee files and contracts"
            : "Dossiers employés et contrats",
      },
      "/dashboard/subscription": d.subscription,
      "/dashboard/ads": {
        title: lang === "en" ? "Ads" : "Publicités",
        subtitle:
          lang === "en"
            ? "Create and manage Trouvetou advertisements"
            : "Créez et gérez vos publicités Trouvetou",
      },
      "/dashboard/settings": { title: d.settings.pageTitle, subtitle: d.settings.pageSubtitle },
      "/dashboard/suggestions": {
        title: lang === "en" ? "Community Suggestions" : "Suggestions",
        subtitle:
          lang === "en"
            ? "Propose and vote on community ideas"
            : "Proposez et votez pour les idées de la communauté",
      },
      "/dashboard/shift": {
        title: lang === "en" ? "My Shift / Cash" : "Mon Shift / Caisse",
        subtitle: lang === "en" ? "Shift overview" : "Vue d'ensemble du shift",
      },
    };
    return map[p] || { title: t.title, subtitle: t.subtitle };
  }, [lang, pathname, user?.full_name, localHour, t.subtitle, t.title]);

  // Styles dérivés mémoïsés (parse la couleur, non-trivial).
  const activeTheme = useMemo(
    () => getSidebarThemeStyles(themeColor, theme === "dark"),
    [themeColor, theme]
  );
  const dynamicPrimaryColor = theme === "dark" ? "#C2944E" : activeTheme.sidebarBg;
  const mainBg = useMemo(() => {
    if (theme === "dark") return activeTheme.mainBg;
    const isPrimaryHex = /^#[0-9a-fA-F]{6}$/.test(primaryColor);
    return isPrimaryHex ? derivePastelColor(primaryColor) : activeTheme.mainBg;
  }, [theme, activeTheme.mainBg, primaryColor]);

  // Callbacks stables pour Sidebar / Header (identité stable → React.memo
  // effectif côté enfant).
  const toggleSidebar = useCallback(
    () => setSidebarCollapsed((c) => !c),
    []
  );
  const closeMobileSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT) {
      setSidebarCollapsed(true);
    }
  }, []);

  function handleOnboardingComplete() {
    setNeedsOnboarding(false);
    toast.success("Bienvenue ! Votre espace est prêt 🏠");
    window.location.reload();
  }

  // Contexte utilisateur mémoïsé : sans useMemo, le CurrentUserProvider
  // reçoit un nouvel objet à chaque render et force la page entière à
  // re-render (consommateur principal du dashboard, ~2200 lignes).
  const currentUserValue = useMemo(
    () => ({
      user,
      tenantId: user?.tenant_id ?? "",
      plan,
      loading: false,
    }),
    [user, plan]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex bg-[var(--main-bg,var(--background))]">
        <div className="hidden lg:flex w-60 shrink-0 flex-col gap-4 p-4 border-r border-[var(--card-border,var(--border))]">
          <Skeleton className="h-10 w-36" />
          <div className="space-y-3 mt-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-3 md:p-4 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <DashboardSkeletons />
        </div>
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
        backgroundColor: mainBg,
        ["--sidebar-bg" as string]: activeTheme.sidebarBg,
        ["--main-bg" as string]: mainBg,
        ["--primary-color" as string]: dynamicPrimaryColor,
        ["--primary-light" as string]: mainBg,
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
        mainBg={mainBg}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        onCloseMobile={closeMobileSidebar}
        onlineBookingCount={onlineBookingCount}
      />

      <NotificationsProvider
        tenantId={user.tenant_id ?? ""}
        userId={user.id ?? ""}
        userRole={user.role ?? ""}
      >
        <div className={`${sidebarCollapsed ? "lg:ml-20" : "lg:ml-60"} transition-[margin] duration-300`}>
          <div
            className={`sticky top-0 z-30 transition-transform duration-300 will-change-transform ${
              headerHidden ? "-translate-y-full" : "translate-y-0"
            }`}
          >
            <Header
              title={headerMeta.title}
              subtitle={headerMeta.subtitle}
              onMenuClick={toggleSidebar}
              userName={user.full_name}
              userRole={user.role}
              userEmail={user.email}
              avatarUrl={user.avatar_url}
              lastLogin={user.last_login_at}
              companyName={companyName}
              plan={plan}
              monthlyPrice={monthlyPrice}
              scrolled={headerScrolled}
            />
          </div>
          <main
            style={{ backgroundColor: mainBg }}
            className={`p-3 md:p-4 relative transition-colors duration-200 ${needsOnboarding ? "blur-sm pointer-events-none select-none" : ""}`}
          >
            <div key={pathname} className="animate-page-enter">
              <CurrentUserProvider value={currentUserValue}>
                {children}
              </CurrentUserProvider>
            </div>
          </main>
        </div>
      </NotificationsProvider>

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
        />
      )}

      {needsReauth && (
        <ReauthModal onVerified={() => setNeedsReauth(false)} />
      )}
    </div>
  );
}
