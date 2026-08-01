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
import type { User } from "@/types/database";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { lang } = useLanguage();
  const t = translations[lang].dashboard;
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authUserId, setAuthUserId] = useState<string>("");
  const [companyName, setCompanyName] = useState("Mon Entreprise");
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

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        let { data: userData } = await supabase
          .from("users")
          .select("*")
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
            role: (metadataRole || (isEmployeeEmail ? "receptionniste" : "admin_residence")) as any,
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
          };
          setUser(provisionalUser as unknown as User);
          setAuthUserId(session.user.id);
          // L'onboarding ne doit s'afficher QUE pour les véritables administrateurs créateurs d'espace
          setNeedsOnboarding(!isEmployee);
          setLoading(false);
          return;
        }

        if (!userData.is_active) {
          router.push("/login");
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
            "/dashboard/residences",
            "/dashboard/accounting",
            "/dashboard/employees",
            "/dashboard/settings",
            "/dashboard/subscription",
          ];
          if (adminOnlyRoutes.some((route) => pathname.startsWith(route))) {
            toast.error("Accès réservé aux administrateurs de l'établissement.");
            router.push("/dashboard");
            return;
          }
        }

        setUser(userData as unknown as User);
        setAuthUserId(session.user.id);

        if (userData.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("company_name")
            .eq("id", userData.tenant_id)
            .single();

          if (tenantData) {
            setCompanyName(tenantData.company_name);
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

          setNeedsOnboarding(false);
        } else {
          // L'onboarding est strictement réservé au rôle admin_residence (propriétaires/gestionnaires)
          setNeedsOnboarding(!isEmployee && userData.role === "admin_residence");
        }

        setLoading(false);
      } catch {
        router.push("/login");
      }
    }

    checkAuth();
  }, [router]);

  function handleOnboardingComplete() {
    setNeedsOnboarding(false);
    toast.success("Bienvenue ! Votre espace est prêt.");
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen dashboard-bg">
      <Sidebar
        userRole={user.role}
        userName={user.full_name}
        companyName={companyName}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onCloseMobile={() => setSidebarCollapsed(true)}
      />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? "lg:ml-20" : "lg:ml-64"}`}>
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
        <main className={`p-6 relative ${needsOnboarding ? "blur-sm pointer-events-none select-none" : ""}`}>
          {children}
        </main>
      </div>

      {/* Decorative organic glow at the sidebar–content boundary */}
      <div
        className="sidebar-boundary-glow fixed inset-y-0 left-0 pointer-events-none"
        style={{ width: sidebarCollapsed ? 80 : 256 }}
      />

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
