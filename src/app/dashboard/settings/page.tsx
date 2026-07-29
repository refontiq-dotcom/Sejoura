"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
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
} from "lucide-react";
import type { Tenant, User as UserType } from "@/types/database";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [user, setUser] = useState<UserType | null>(null);
  const [activeSection, setActiveSection] = useState("company");
  const [savedMsg, setSavedMsg] = useState("");

  const [companyForm, setCompanyForm] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    city: "",
    address: "",
  });

  const [notifForm, setNotifForm] = useState({
    emailNotifs: true,
    pushNotifs: true,
    bookingAlerts: true,
    paymentAlerts: true,
    cleaningAlerts: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .single();

      if (userData) {
        setUser(userData as unknown as UserType);

        if (userData.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", userData.tenant_id)
            .single();

          if (tenantData) {
            setTenant(tenantData as unknown as Tenant);
            setCompanyForm({
              company_name: tenantData.company_name || "",
              contact_name: tenantData.contact_name || "",
              contact_email: tenantData.contact_email || "",
              contact_phone: tenantData.contact_phone || "",
              city: tenantData.city || "",
              address: tenantData.address || "",
            });
          }
        }
      }
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCompany() {
    if (!tenant) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase
        .from("tenants")
        .update({
          company_name: companyForm.company_name,
          contact_name: companyForm.contact_name,
          contact_email: companyForm.contact_email,
          contact_phone: companyForm.contact_phone,
          city: companyForm.city,
          address: companyForm.address,
        })
        .eq("id", tenant.id);

      setSavedMsg("Paramètres enregistrés avec succès");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch {
      // Erreur silencieuse
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      // Erreur silencieuse
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const sections = [
    { key: "company", label: "Entreprise", icon: Building2 },
    { key: "account", label: "Compte", icon: User },
    { key: "appearance", label: "Apparence", icon: theme === "light" ? Moon : Sun },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "billing", label: "Facturation", icon: CreditCard },
    { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
    { key: "security", label: "Sécurité", icon: Shield },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Paramètres</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gérez votre compte et votre entreprise</p>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm animate-fade-in">
          <Check className="w-4 h-4" /> {savedMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar settings — style Claude */}
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
                      ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
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
                Se déconnecter
              </button>
            </div>
          </nav>
        </Card>

        {/* Contenu */}
        <div className="lg:col-span-9 space-y-6">
          {/* Entreprise */}
          {activeSection === "company" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Informations de l'entreprise</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Modifiez les détails de votre entreprise</p>

              <div className="space-y-4">
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
                  <Button onClick={handleSaveCompany} loading={saving}>
                    <Save className="w-4 h-4" /> Enregistrer
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Compte */}
          {activeSection === "account" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Informations du compte</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Vos informations personnelles</p>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-xl font-bold">
                  {user?.full_name?.charAt(0) || "?"}
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{user?.full_name}</p>
                  <p className="text-sm text-slate-500">{user?.phone}</p>
                  <Badge variant="info" className="mt-1">{user?.role.replace("_", " ")}</Badge>
                </div>
              </div>

              <div className="space-y-4">
                <Input label="Nom complet" defaultValue={user?.full_name || ""} />
                <Input label="Téléphone" defaultValue={user?.phone || ""} />
                <Input label="Email" type="email" defaultValue={user?.email || ""} />
                <div className="flex justify-end pt-2">
                  <Button>Enregistrer</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Apparence */}
          {activeSection === "appearance" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Apparence</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Personnalisez l'apparence de l'interface</p>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    {theme === "light" ? <Moon className="w-5 h-5 text-slate-600" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Thème</p>
                      <p className="text-xs text-slate-500">Basculer entre le mode clair et sombre</p>
                    </div>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className={`relative w-12 h-6 rounded-full transition-colors ${theme === "dark" ? "bg-indigo-600" : "bg-slate-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : ""}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Langue</p>
                      <p className="text-xs text-slate-500">Français (Côte d'Ivoire)</p>
                    </div>
                  </div>
                  <Badge variant="default">FR</Badge>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Devise</p>
                      <p className="text-xs text-slate-500">Tous les montants sont en FCFA (XOF)</p>
                    </div>
                  </div>
                  <Badge variant="success">FCFA</Badge>
                </div>
              </div>
            </Card>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Notifications</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Gérez vos préférences de notifications</p>

              <div className="space-y-4">
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
                      <p className="text-xs text-slate-500">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifForm({ ...notifForm, [item.key]: !notifForm[item.key as keyof typeof notifForm] })}
                      className={`relative w-12 h-6 rounded-full transition-colors ${notifForm[item.key as keyof typeof notifForm] ? "bg-indigo-600" : "bg-slate-300"}`}
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
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Facturation</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Gérez votre abonnement et vos paiements</p>
              <Button onClick={() => window.location.href = "/dashboard/subscription"}>
                <CreditCard className="w-4 h-4" /> Gérer l'abonnement
              </Button>
            </Card>
          )}

          {/* WhatsApp */}
          {activeSection === "whatsapp" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">WhatsApp Business</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Configuration de l'API WhatsApp Business de Meta</p>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    ⚠ L'API WhatsApp Business nécessite un compte Meta Business et un numéro de téléphone vérifié.
                  </p>
                </div>
                <Input label="Token API" placeholder="EAAxxxxxxxxxxxxx" />
                <Input label="Numéro de téléphone ID" placeholder="1234567890" />
                <Input label="Token de vérification Webhook" placeholder="sejoura_verify_token" />
                <div className="flex justify-end pt-2">
                  <Button>Enregistrer</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Sécurité */}
          {activeSection === "security" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Sécurité</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Gérez votre mot de passe et la sécurité</p>

              <div className="space-y-4">
                <Input label="Mot de passe actuel" type="password" placeholder="••••••••" />
                <Input label="Nouveau mot de passe" type="password" placeholder="••••••••" />
                <Input label="Confirmer le mot de passe" type="password" placeholder="••••••••" />
                <div className="flex justify-end pt-2">
                  <Button>Modifier le mot de passe</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}