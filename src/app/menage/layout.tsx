"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Sparkles, LogOut, Building2 } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { Moon, Sun } from "lucide-react";

export default function MenageLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push("/login"); return; }

        const { data: userData } = await supabase
          .from("users")
          .select("full_name, role")
          .eq("auth_user_id", session.user.id)
          .single();

        if (!userData || userData.role !== "menagere") {
          router.push("/login");
          return;
        }

        setUserName(userData.full_name);
        setLoading(false);
      } catch {
        router.push("/login");
      }
    }
    checkAuth();
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header mobile-first */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">Séjoura Ménage</h1>
              <p className="text-xs text-slate-400">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
            </button>
            <button onClick={handleLogout} className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 pb-20">{children}</main>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-around py-2">
          <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-indigo-600">
            <Sparkles className="w-5 h-5" />
            <span className="text-[10px] font-medium">Tâches</span>
          </button>
          <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-400">
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">Quitter</span>
          </button>
        </div>
      </nav>
    </div>
  );
}