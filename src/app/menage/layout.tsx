"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Sparkles, LogOut, Moon, Sun, UserCircle2 } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { LOGIN_ROUTE } from "@/lib/routes";

export default function MenageLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { theme, toggleTheme, setPrimaryColor, setThemeColor } = useTheme();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantLogo, setTenantLogo] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push(LOGIN_ROUTE); return; }

        const { data: userData } = await supabase
          .from("users")
          .select("id, tenant_id, full_name, role, avatar_url")
          .eq("auth_user_id", session.user.id)
          .single();

        if (!userData || userData.role !== "menagere") {
          router.push(LOGIN_ROUTE);
          return;
        }

        setUserName(userData.full_name);
        setAvatarUrl(userData.avatar_url || "");

        // Charger le nom de la résidence de l'employeur (tenant)
        if (userData.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("company_name, logo_url, primary_color, theme_color")
            .eq("id", userData.tenant_id)
            .single();

          if (tenantData?.company_name) {
            setTenantName(tenantData.company_name);
          }
          if (tenantData?.logo_url) {
            setTenantLogo(tenantData.logo_url);
          }
          if (tenantData?.primary_color) setPrimaryColor(tenantData.primary_color);
          setThemeColor(tenantData?.theme_color || null);
        }

        setLoading(false);
      } catch {
        router.push(LOGIN_ROUTE);
      }
    }
    checkAuth();
  }, [router]);

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push(LOGIN_ROUTE);
    } catch {
      router.push(LOGIN_ROUTE);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dashboard-bg">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen dashboard-bg transition-colors duration-300">
      {/* Header mobile-first */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary-color,#0C1C33)] flex items-center justify-center overflow-hidden">
              {tenantLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenantLogo} alt={tenantName || "Logo résidence"} className="h-full w-full object-contain" />
              ) : (
                <Sparkles className="w-4 h-4 text-white" />
              )}
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">{tenantName || "Séjoura Ménage"}</h1>
              <p className="text-xs text-slate-400">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
            </button>
            <div className="relative">
              <button onClick={() => setShowProfile(!showProfile)} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" title="Profil">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <UserCircle2 className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                )}
              </button>
              {showProfile && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{userName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tenantName || "Résidence"}</p>
                  <button
                    onClick={handleLogout}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/30"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Se déconnecter
                  </button>
                </div>
              )}
            </div>
            <button onClick={handleLogout} className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 md:hidden">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 pb-28">{children}</main>

      {/* Bottom nav mobile — barre flottante ergonomique */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4">
        <div className="max-w-md mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg flex items-center justify-around p-1.5">
          <button className="flex flex-col items-center gap-0.5 px-6 py-2 rounded-xl text-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] font-semibold min-w-[64px] active:scale-95 transition-transform">
            <Sparkles className="w-5 h-5" />
            <span className="text-[11px] font-medium">Tâches</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-0.5 px-6 py-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 min-w-[64px] active:scale-95 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[11px] font-medium">Quitter</span>
          </button>
        </div>
      </nav>
    </div>
  );

}
