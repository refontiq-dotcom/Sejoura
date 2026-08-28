"use client";

import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { TableSkeleton } from "@/components/ui/skeletons";
import { formatDate, canAccessPlanFeature } from "@/lib/utils";
import {
  IdCard,
  Plus,
  Search,
  Pencil,
  Trash2,
  Lock,
  Phone,
  Mail,
  Building2,
  Briefcase,
} from "lucide-react";
import type { Accommodation, HrEmployee, HrContractType, HrEmployeeStatus } from "@/types/database";

const CONTRACT_TYPE_LABELS: Record<HrContractType, string> = {
  cdi: "CDI",
  cdd: "CDD",
  stage: "Stage",
  journalier: "Journalier",
  prestataire: "Prestataire",
};

const STATUS_LABELS: Record<HrEmployeeStatus, string> = {
  active: "En poste",
  on_leave: "En congé",
  terminated: "Contrat terminé",
};

const STATUS_VARIANT: Record<HrEmployeeStatus, "success" | "warning" | "error"> = {
  active: "success",
  on_leave: "warning",
  terminated: "error",
};

const EMPTY_FORM = {
  full_name: "",
  phone: "",
  email: "",
  position: "",
  national_id_number: "",
  birth_date: "",
  hire_date: new Date().toISOString().split("T")[0],
  contract_type: "cdi" as HrContractType,
  contract_start_date: new Date().toISOString().split("T")[0],
  contract_end_date: "",
  base_salary: "",
  cnps_number: "",
  status: "active" as HrEmployeeStatus,
  accommodation_id: "",
  notes: "",
};

export default function HrPage() {
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [plan, setPlan] = useState("");
  const [records, setRecords] = useState<HrEmployee[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HrEmployeeStatus>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrEmployee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrEmployee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasAccess = canAccessPlanFeature(plan, "hrModule");

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
        .select("id, tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();
      if (!userData) return;

      setTenantId(userData.tenant_id);
      setCurrentUserId(userData.id);

      const [subRes, accRes, hrRes] = await Promise.all([
        supabase.from("subscriptions").select("plan").eq("tenant_id", userData.tenant_id).maybeSingle(),
        supabase.from("accommodations").select("id, name, city, tenant_id").eq("tenant_id", userData.tenant_id).order("name"),
        supabase.from("hr_employees").select("*").eq("tenant_id", userData.tenant_id).order("created_at", { ascending: false }),
      ]);

      if (subRes.data) setPlan(subRes.data.plan);
      if (accRes.data) setAccommodations(accRes.data as unknown as Accommodation[]);
      if (hrRes.data) setRecords(hrRes.data as unknown as HrEmployee[]);
    } catch {
      toast.error("Les dossiers RH ne se chargent pas 📋");
    } finally {
      setLoading(false);
    }
  }

  // Garde-fou : bloque toute action RH pour les plans non autorisés (Essentiel)
  // et propose la formule qui la débloque, au lieu de laisser le bouton agir.
  function requireHrAccess(): boolean {
    if (hasAccess) return true;
    toast.error(
      "Le module RH (dossiers employés, contrats) est réservé aux formules Croissance et Entreprise. Passez à une formule supérieure pour le débloquer."
    );
    return false;
  }

  function openNew() {
    if (!requireHrAccess()) return;
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(rec: HrEmployee) {
    if (!requireHrAccess()) return;
    setEditing(rec);
    setForm({
      full_name: rec.full_name,
      phone: rec.phone,
      email: rec.email || "",
      position: rec.position,
      national_id_number: rec.national_id_number || "",
      birth_date: rec.birth_date || "",
      hire_date: rec.hire_date,
      contract_type: rec.contract_type,
      contract_start_date: rec.contract_start_date,
      contract_end_date: rec.contract_end_date || "",
      base_salary: rec.base_salary != null ? String(rec.base_salary) : "",
      cnps_number: rec.cnps_number || "",
      status: rec.status,
      accommodation_id: rec.accommodation_id || "",
      notes: rec.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!requireHrAccess()) return;
    if (!form.full_name.trim()) {
      toast.error("Le nom complet est requis 📋");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Le téléphone est requis 📞");
      return;
    }
    if (!form.position.trim()) {
      toast.error("Le poste est requis 💼");
      return;
    }
    if (form.contract_type !== "cdi" && !form.contract_end_date) {
      toast.error("La date de fin de contrat est requise pour ce type de contrat 📅");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        tenant_id: tenantId,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        position: form.position.trim(),
        national_id_number: form.national_id_number.trim() || null,
        birth_date: form.birth_date || null,
        hire_date: form.hire_date,
        contract_type: form.contract_type,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date || null,
        base_salary: form.base_salary ? Number(form.base_salary) : null,
        cnps_number: form.cnps_number.trim() || null,
        status: form.status,
        accommodation_id: form.accommodation_id || null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        const { error } = await supabase.from("hr_employees").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Dossier employé mis à jour 💼");
      } else {
        const { error } = await supabase.from("hr_employees").insert({ ...payload, created_by: currentUserId });
        if (error) throw error;
        toast.success("Dossier employé créé 💼");
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      toast.error("L'action a échoué : enregistrer le dossier : " + ((err as Error)?.message || "erreur"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!requireHrAccess()) return;
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("hr_employees").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Dossier supprimé 🗑️");
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      toast.error("L'action a échoué : supprimer le dossier : " + ((err as Error)?.message || "erreur"));
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    let list = records;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          r.position.toLowerCase().includes(q) ||
          r.phone.includes(q)
      );
    }
    return list;
  }, [records, statusFilter, searchQuery]);

  if (loading) return <TableSkeleton rows={6} cols={5} />;

  return (
    <div className="space-y-3 animate-fade-in">
      {!hasAccess && (
        <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Module RH</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Dossiers employés et contrats — disponible dès la formule Croissance.
                </p>
              </div>
            </div>
            <a href="/dashboard/subscription" className="sm:ml-auto">
              <Button size="sm">Voir les formules</Button>
            </a>
          </div>
        </Card>
      )}

      <div className={!hasAccess ? "opacity-70 space-y-3" : "space-y-3"}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center">
              <IdCard className="w-4.5 h-4.5 text-[var(--primary-color)]" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-[var(--foreground)]">Dossiers RH</h1>
              <p className="text-xs text-[var(--foreground-muted)]">{filtered.length} employé{filtered.length > 1 ? "s" : ""}</p>
            </div>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Nouveau dossier
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            icon={<Search className="w-4 h-4" />}
            placeholder="Rechercher un nom, un poste, un téléphone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | HrEmployeeStatus)}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--foreground)] px-2.5 py-1.5 focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
          >
            <option value="all">Tous les statuts</option>
            <option value="active">En poste</option>
            <option value="on_leave">En congé</option>
            <option value="terminated">Contrat terminé</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <IdCard className="w-8 h-8 mx-auto text-[var(--foreground-subtle)] mb-2" />
            <p className="text-sm text-[var(--foreground-muted)]">Aucun dossier employé pour le moment.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((rec) => {
              const acc = accommodations.find((a) => a.id === rec.accommodation_id);
              return (
                <Card key={rec.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--foreground)] truncate">{rec.full_name}</p>
                      <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
                        <Briefcase className="w-3 h-3" /> {rec.position}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[rec.status]}>{STATUS_LABELS[rec.status]}</Badge>
                  </div>

                  <div className="text-xs text-[var(--foreground-muted)] space-y-1">
                    <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {rec.phone}</p>
                    {rec.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {rec.email}</p>}
                    {acc && <p className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> {acc.name}</p>}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline">{CONTRACT_TYPE_LABELS[rec.contract_type]}</Badge>
                    <Badge variant="outline">Embauché le {formatDate(rec.hire_date)}</Badge>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                    <button
                      onClick={() => openEdit(rec)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Modifier
                    </button>
                    <button
                      onClick={() => { if (requireHrAccess()) setDeleteTarget(rec); }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md text-[var(--foreground-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Supprimer
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal création / édition */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Modifier le dossier" : "Nouveau dossier employé"} size="lg">
        <div className="space-y-3 pt-1 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nom complet *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input label="Poste *" placeholder="Ex: Réceptionniste, Agent d'entretien..." value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            <Input label="Téléphone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="N° CNI" value={form.national_id_number} onChange={(e) => setForm({ ...form, national_id_number: e.target.value })} />
            <Input label="Date de naissance" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
            <div className="w-full">
              <label className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-0.5">Établissement</label>
              <select
                value={form.accommodation_id}
                onChange={(e) => setForm({ ...form, accommodation_id: e.target.value })}
                className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-sm text-[var(--foreground)] px-2.5 py-2 focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                <option value="">Aucun / tous</option>
                {accommodations.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full">
              <label className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-0.5">Statut</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as HrEmployeeStatus })}
                className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-sm text-[var(--foreground)] px-2.5 py-2 focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                <option value="active">En poste</option>
                <option value="on_leave">En congé</option>
                <option value="terminated">Contrat terminé</option>
              </select>
            </div>
            <Input label="Date d'embauche *" type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
            <div className="w-full">
              <label className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-0.5">Type de contrat</label>
              <select
                value={form.contract_type}
                onChange={(e) => setForm({ ...form, contract_type: e.target.value as HrContractType })}
                className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-sm text-[var(--foreground)] px-2.5 py-2 focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
              >
                {Object.entries(CONTRACT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <Input label="Début de contrat *" type="date" value={form.contract_start_date} onChange={(e) => setForm({ ...form, contract_start_date: e.target.value })} />
            <Input
              label={form.contract_type === "cdi" ? "Fin de contrat (n/a pour CDI)" : "Fin de contrat *"}
              type="date"
              value={form.contract_end_date}
              onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })}
              disabled={form.contract_type === "cdi"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
            <Input label="Salaire de base (FCFA)" type="number" placeholder="Informatif — pas de calcul de paie" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
            <Input label="N° CNPS" value={form.cnps_number} onChange={(e) => setForm({ ...form, cnps_number: e.target.value })} />
          </div>

          <div className="w-full">
            <label className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-0.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-sm text-[var(--foreground)] px-2.5 py-2 focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)] resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button className="flex-1" onClick={handleSave} loading={saving}>{editing ? "Enregistrer" : "Créer le dossier"}</Button>
        </div>
      </Modal>

      {/* Modal suppression */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer le dossier ?" size="sm">
        <p className="text-sm text-[var(--foreground-muted)] pt-1">
          Le dossier de <strong>{deleteTarget?.full_name}</strong> sera définitivement supprimé. Cette action est irréversible.
        </p>
        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Annuler</Button>
          <Button variant="destructive" className="flex-1" onClick={handleDelete} loading={deleting}>Supprimer</Button>
        </div>
      </Modal>
    </div>
  );
}
