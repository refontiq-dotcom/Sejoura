"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { getRoleLabel, getPlanLimits, formatDate } from "@/lib/utils";
import { Users, Loader2, Phone, Trash2, CheckCircle2, Clock, UserPlus } from "lucide-react";
import type { User } from "@/types/database";

export default function EmployeesPage() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<User[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [plan, setPlan] = useState("standard");
  const [formData, setFormData] = useState({ full_name: "", phone: "", role: "receptionniste", email: "" });

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
    } catch {
      // Erreur silencieuse
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
      setModalOpen(false);
      setFormData({ full_name: "", phone: "", role: "receptionniste", email: "" });
      loadData();
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet employé ?")) return;
    try {
      const supabase = createClient();
      await supabase.from("users").delete().eq("id", id);
      loadData();
    } catch {
      // Erreur silencieuse
    }
  }

  const limits = getPlanLimits(plan);
  const adminCount = employees.filter((e) => e.role === "admin_residence").length;
  const recepCount = employees.filter((e) => e.role === "receptionniste").length;
  const menagereCount = employees.filter((e) => e.role === "menagere").length;

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
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Admins</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{adminCount} / {limits.maxAdmins === 999 ? "∞" : limits.maxAdmins}</p>
            </div>
            <Users className="w-5 h-5 text-indigo-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Réceptionnistes</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{recepCount} / {limits.maxReceptionnists === 999 ? "∞" : limits.maxReceptionnists}</p>
            </div>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Ménagères</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{menagereCount} {limits.hasCleaningModule ? `/ ${limits.maxReceptionnists === 999 ? "∞" : limits.maxReceptionnists}` : "(Pro requis)"}</p>
            </div>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Liste */}
      {employees.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucun employé</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Ajoutez votre premier employé</p>
          <Button onClick={() => setModalOpen(true)}>
            <UserPlus className="w-4 h-4" /> Ajouter
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
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
                {employees.map((emp) => (
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
                      {emp.role !== "admin_residence" && (
                        <button onClick={() => handleDelete(emp.id)} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
    </div>
  );
}