"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Loader2 } from "lucide-react";
import { OnboardingModal } from "@/components/dashboard/onboarding-modal";
import type { User } from "@/types/database";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authUserId, setAuthUserId] = useState<string>("");
  const [companyName, setCompanyName] = useState("Mon Entreprise");
  const [plan, setPlan] = useState("standard");
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        const { data: userData } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (!userData) {
          const provisionalUser = {
            id: "",
            auth_user_id: session.user.id,
            role: "admin_residence" as const,
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
          setNeedsOnboarding(true);
          setLoading(false);
          return;
        }

        if (!userData.is_active) {
          router.push("/login");
          return;
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
          setNeedsOnboarding(true);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar
        userRole={user.role}
        userName={user.full_name}
        companyName={companyName}
        plan={plan}
        monthlyPrice={monthlyPrice}
      />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-20" : "ml-64"}`}>
        <Header
          title="Tableau de bord"
          subtitle="Vue d'ensemble de votre activité"
          onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className={`p-6 relative ${needsOnboarding ? "blur-sm pointer-events-none select-none" : ""}`}>
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
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
  );
}
