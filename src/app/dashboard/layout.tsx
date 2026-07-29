"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Loader2 } from "lucide-react";
import type { User } from "@/types/database";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [companyName, setCompanyName] = useState("Mon Entreprise");
  const [plan, setPlan] = useState("standard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        // Récupérer les infos utilisateur
        const { data: userData } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", session.user.id)
          .single();

        if (!userData) {
          router.push("/login");
          return;
        }

        if (!userData.is_active) {
          router.push("/login");
          return;
        }

        setUser(userData as unknown as User);

        // Récupérer le nom de l'entreprise
        if (userData.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("company_name")
            .eq("id", userData.tenant_id)
            .single();

          if (tenantData) {
            setCompanyName(tenantData.company_name);
          }

          // Récupérer le plan d'abonnement
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("plan")
            .eq("tenant_id", userData.tenant_id)
            .single();

          if (subData) {
            setPlan(subData.plan);
          }
        }

        setLoading(false);
      } catch {
        router.push("/login");
      }
    }

    checkAuth();
  }, [router]);

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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <Sidebar
        userRole={user.role}
        userName={user.full_name}
        companyName={companyName}
        plan={plan}
      />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-20" : "ml-64"}`}>
        <Header
          title="Tableau de bord"
          subtitle="Vue d'ensemble de votre activité"
          onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}