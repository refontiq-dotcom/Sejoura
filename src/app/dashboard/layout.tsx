"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
          .select("id, auth_user_id, role, full_name, phone, email, is_active, activated_at, tenant_id, accommodation_id")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        // Si l'utilisateur n'est toujours pas trouvé, on appelle l'API d'authentification serveur
        if (!userData) {
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

        const isEmployeeEmail = session.user.email?.includes("@employe.sejoura.com");
        const metadataRole = session.user.user_metadata?.role;
        const isEmployee = isEmployeeEmail || metadataRole === "menagere" || metadataRole === "receptionniste" || userData?.role === "menagere" || userData?.role === "receptionniste";

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
          // L'onboarding ne doit s'afficher QUE pour les véritables administrateurs créateurs d'espace
          setNeedsOnboarding(!isEmployee);
          setLoading(false);
          return;
        }

        if (!userData.is_active) {
          router.push(LOGIN_ROUTE);
          return;
        }

        // Redirection spécifique au rôle Ménagère
        if (userData.role === "menagere") {
          router.push("/menage");
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
            toast.error("Accès réservé aux administrateurs de l'établissement.");
            router.push("/dashboard");
            return;
          }
        }

        // Protection des routes Ménage/Shift pour les Admins (masquées de leur menu)
        if (userData.role === "admin_residence") {
          const staffOnlyRoutes = ["/dashboard/cleaning", "/dashboard/shift"];
          if (staffOnlyRoutes.some((route) => pathname.startsWith(route))) {
            toast.error("Cette section est réservée au personnel de l'établissement.");
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
            .single();

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
            .single();

          if (subData) {
            setPlan(subData.plan);
            setMonthlyPrice(subData.monthly_price || 0);
          }

          // Le tenant seul ne suffit pas : une inscription interrompue pouvait
          // laisser un gérant sans établissement, ce qui doit relancer l'étape 2.
          const { data: accommodation } = await supabase
            .from("accommodations")
            .select("id")
            .eq("tenant_id", userData.tenant_id)
            .limit(1)
            .maybeSingle();
          setNeedsOnboarding(userData.role === "admin_residence" && !accommodation);
        } else {
          // L'onboarding est strictement réservé au rôle admin_residence (propriétaires/gestionnaires)
          setNeedsOnboarding(!isEmployee && userData.role === "admin_residence");
        }

        setLoading(false);
      } catch {
        router.push(LOGIN_ROUTE);
      }
    }

    checkAuth();
  }, [router]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--main-bg,var(--background))]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
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
          title={t.title}
          subtitle={t.subtitle}
          onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          userName={user.full_name}
          userRole={user.role}
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
        />
      )}
    </div>
  );
}
