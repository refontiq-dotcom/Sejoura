"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { getRoleLabel, getPlanLimits, formatDate } from "@/lib/utils";
import { Users, Loader2, Phone, Trash2, CheckCircle2, Clock, UserPlus, Search, Copy, Share2, Check, ExternalLink, MessageSquare } from "lucide-react";
import type { User } from "@/types/database";

export default function EmployeesPage() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<User[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [plan, setPlan] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [formData, setFormData] = useState({ full_name: "", phone: "", role: "receptionniste", email: "" });
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteData, setInviteData] = useState<{ full_name: string; phone: string; role: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setTenantId(userData.tenant_id);

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setPlan(subData.plan);

      const { data: empData } = await supabase
        .from("users")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("created_at", { ascending: false });
      if (empData) setEmployees(empData as unknown as User[]);
} catch (err) {
       toast.error("Impossible de charger les données. Veuillez réessayer.");
       console.error(err);
     } finally {
       setLoading(false);
     }
   }

    async function handleSave() {
    if (!formData.full_name || !formData.phone) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.from("users").insert({
        tenant_id: tenantId,
        role: formData.role,
        full_name: formData.full_name,
        phone: formData.phone,
        email: formData.email || null,
        is_active: false, // S'activera à la 1re connexion
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const generatedLink = `${origin}/employee-login?phone=${encodeURIComponent(formData.phone)}`;
      
      setInviteData({
        full_name: formData.full_name,
        phone: formData.phone,
        role: formData.role,
        link: generatedLink,
      });

      setModalOpen(false);
      setFormData({ full_name: "", phone: "", role: "receptionniste", email: "" });
      setInviteModalOpen(true);
      loadData();
    } catch (err) {
      toast.error("Impossible d'enregistrer les modifications.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function copyInviteLink(link: string) {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Lien d'invitation copié dans le presse-papier !");
    setTimeout(() => setCopied(false), 3000);
  }

  function openWhatsAppInvite(phone: string, name: string, role: string, link: string) {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const message = `Bonjour ${name}, votre compte Séjoura (${getRoleLabel(role)}) a été créé avec succès !\n\nPour finaliser votre inscription et définir votre mot de passe, cliquez sur ce lien :\n${link}`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
  }

   async function handleDelete(id: string) {
    if (!confirm("Supprimer cet employé ?")) return;
    try {
      const supabase = createClient();
await supabase.from("users").delete().eq("id", id);
       loadData();
     } catch (err) {
       toast.error("Impossible de supprimer.");
       console.error(err);
     }
   }

   const limits = getPlanLimits(plan);
  const adminCount = employees.filter((e) => e.role === "admin_residence").length;
  const recepCount = employees.filter((e) => e.role === "receptionniste").length;
  const menagereCount = employees.filter((e) => e.role === "menagere").length;

  const filteredEmployees = employees.filter((emp) => {
    if (filterRole !== "all" && emp.role !== filterRole) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        emp.full_name.toLowerCase().includes(q) ||
        emp.phone.toLowerCase().includes(q) ||
        (emp.email && emp.email.toLowerCase().includes(q))
      );
    }
    return true;
  });

  if (loading && employees.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Employés</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{employees.length} employé{employees.length > 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <UserPlus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {/* Limites du plan */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-t-4 border-t-indigo-500 dark:border-t-indigo-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Admins</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{adminCount} / {limits.maxAdmins === 999 ? "∞" : limits.maxAdmins}</p>
            </div>
            <Users className="w-5 h-5 text-indigo-500" />
          </div>
        </Card>
        <Card className="p-4 border-t-4 border-t-blue-500 dark:border-t-blue-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Réceptionnistes</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{recepCount} / {limits.maxReceptionnists === 999 ? "∞" : limits.maxReceptionnists}</p>
            </div>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
        </Card>
        <Card className="p-4 border-t-4 border-t-purple-500 dark:border-t-purple-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Ménagères</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{menagereCount} {limits.hasCleaningModule ? `/ ${limits.maxReceptionnists === 999 ? "∞" : limits.maxReceptionnists}` : "(Pro requis)"}</p>
            </div>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Barre de recherche & filtre */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Tous les rôles</option>
          <option value="admin_residence">Administrateur</option>
          <option value="receptionniste">Réceptionniste</option>
          <option value="menagere">Ménagère</option>
        </select>
      </div>

      {/* Liste */}
      {filteredEmployees.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucun employé</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Ajoutez votre premier employé</p>
          <Button onClick={() => setModalOpen(true)}>
            <UserPlus className="w-4 h-4" /> Ajouter
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden border-t-4 border-t-orange-500 dark:border-t-orange-400">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Nom</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Rôle</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Téléphone</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Statut</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase">Créé le</th>
                  <th className="text-right p-4 text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-sm font-semibold">
                          {emp.full_name.charAt(0)}
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{emp.full_name}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={emp.role === "admin_residence" ? "info" : emp.role === "menagere" ? "purple" : "default"}>
                        {getRoleLabel(emp.role)}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Phone className="w-4 h-4 text-slate-400" />
                        {emp.phone}
                      </div>
                    </td>
                    <td className="p-4">
                      {emp.is_active ? (
                        <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Actif</Badge>
                      ) : (
                        <Badge variant="warning"><Clock className="w-3 h-3" /> En attente</Badge>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-500">{formatDate(emp.created_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!emp.is_active && (
                          <button
                            onClick={() => {
                              const origin = typeof window !== "undefined" ? window.location.origin : "";
                              const generatedLink = `${origin}/employee-login?phone=${encodeURIComponent(emp.phone)}`;
                              setInviteData({
                                full_name: emp.full_name,
                                phone: emp.phone,
                                role: emp.role,
                                link: generatedLink,
                              });
                              setInviteModalOpen(true);
                            }}
                            className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                            title="Partager le lien d'invitation"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                        )}
                        {emp.role !== "admin_residence" && (
                          <button onClick={() => handleDelete(emp.id)} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Supprimer l'employé">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Info activation */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
        <Phone className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">Activation des employés</p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
            Les employés reçoivent leur numéro de téléphone comme identifiant. Ils doivent créer leur mot de passe lors de leur première connexion via la page "Première connexion".
          </p>
        </div>
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Ajouter un employé">
        <div className="space-y-4">
          <Input label="Nom complet" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="Aminata Traoré" />
          <Input label="Téléphone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+225 07 00 00 00 00" icon={<Phone className="w-5 h-5" />} />
          <Input label="Email (optionnel)" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="aminata@residence.com" />
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rôle</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="receptionniste">Réceptionniste</option>
              <option value="menagere" disabled={!limits.hasCleaningModule}>
                Ménagère {limits.hasCleaningModule ? "" : "(Plan Pro requis)"}
              </option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={loading}>Ajouter</Button>
          </div>
        </div>
      </Modal>

      {/* Modal d'invitation généré */}
      {inviteData && (
        <Modal
          open={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          title="🎉 Employé enregistré !"
          description="Transmettez ce lien à l'employé pour qu'il puisse finaliser son inscription."
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Employé :</span>
                <span className="font-semibold text-slate-900 dark:text-white">{inviteData.full_name}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Téléphone reconnu :</span>
                <span className="font-semibold text-slate-900 dark:text-white">{inviteData.phone}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Rôle :</span>
                <Badge variant="purple">{getRoleLabel(inviteData.role)}</Badge>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Lien d'activation généré</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteData.link}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono select-all focus:outline-none"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyInviteLink(inviteData.link)}
                  className="gap-1.5 shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copié !" : "Copier"}
                </Button>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                onClick={() => openWhatsAppInvite(inviteData.phone, inviteData.full_name, inviteData.role, inviteData.link)}
              >
                <MessageSquare className="w-4 h-4" /> Envoyer par WhatsApp
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setInviteModalOpen(false)}
              >
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}