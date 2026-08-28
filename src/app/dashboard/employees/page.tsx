"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { EmployeesSkeleton } from "@/components/ui/skeletons";
import { getRoleLabel, getPlanLimits, canAccessPlanFeature, formatDate, isValidPhone, normalizePhone, getInitials } from "@/lib/utils";
import { Users, Loader2, Phone, Trash2, CheckCircle2, UserPlus, Search, Copy, Share2, Check, Ban, ShieldCheck, MessageSquare, Building2, ArrowLeftRight, CalendarDays, History, MoreHorizontal, IdCard } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { User, Accommodation, EmployeeAssignment } from "@/types/database";

// Map userId → affectation temporaire active (si elle existe)
type TempAssignmentMap = Record<string, { accommodation_id: string; end_date: string; is_different_site: boolean }>;

export default function EmployeesPage() {
  const [loading, setLoading] = useState(true);
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [employees, setEmployees] = useState<User[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [tempAssignments, setTempAssignments] = useState<TempAssignmentMap>({});
  const [hrLinkedUserIds, setHrLinkedUserIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [plan, setPlan] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterAcc, setFilterAcc] = useState("all");
  const [formData, setFormData] = useState({ full_name: "", phone: "", role: "receptionniste", email: "", accommodation_id: "" });
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteData, setInviteData] = useState<{ full_name: string; phone: string; role: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Réaffectation
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<User | null>(null);
  const [reassignForm, setReassignForm] = useState({ accommodation_id: "", start_date: new Date().toISOString().split("T")[0], end_date: "", notes: "" });
  const [reassignLoading, setReassignLoading] = useState(false);
  // Historique
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<User | null>(null);
  const [historyData, setHistoryData] = useState<(EmployeeAssignment & { accommodation?: Accommodation })[]>([]);
  // Suppression
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
      setCurrentAdminId(userData.id);

      // Whitelist de colonnes : password_hash / auth_user_id / pin_code ne doivent
      // jamais quitter le serveur. Les requêtes sont parallélisées.
      const [subData, accData, empData] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("plan")
          .eq("tenant_id", userData.tenant_id)
          .maybeSingle()
          .then((r) => r.data),
        supabase
          .from("accommodations")
          .select("id, name, city, tenant_id")
          .eq("tenant_id", userData.tenant_id)
          .order("name")
          .then((r) => r.data),
        supabase
          .from("users")
          .select("id, tenant_id, accommodation_id, role, full_name, phone, email, is_active, created_at")
          .eq("tenant_id", userData.tenant_id)
          .order("created_at", { ascending: false })
          .then((r) => r.data),
      ]);

      if (subData) setPlan(subData.plan);
      if (accData) setAccommodations(accData as unknown as Accommodation[]);

      // Dossiers RH déjà liés à un compte — pour afficher le badge et éviter
      // de proposer deux fois le même compte au moment de lier un dossier.
      if (canAccessPlanFeature(subData?.plan || "free", "hrModule")) {
        const { data: hrData } = await supabase
          .from("hr_employees")
          .select("user_id")
          .eq("tenant_id", userData.tenant_id)
          .not("user_id", "is", null);
        if (hrData) setHrLinkedUserIds(new Set(hrData.map((r: { user_id: string }) => r.user_id)));
      }

      if (empData) {
        const emps = empData as unknown as User[];
        setEmployees(emps);

        // Charger les affectations temporaires actives pour tous les employés
        const today = new Date().toISOString().split("T")[0];
        const empIds = emps.map((e) => e.id);
        if (empIds.length > 0) {
          const { data: assignData } = await supabase
            .from("employee_assignments")
            .select("user_id, accommodation_id, start_date, end_date")
            .in("user_id", empIds)
            .lte("start_date", today)
            .or(`end_date.is.null,end_date.gte.${today}`)
            .order("start_date", { ascending: false });

          if (assignData) {
            // Pour chaque employé, garder la plus récente affectation active
            const map: TempAssignmentMap = {};
            for (const a of assignData as { user_id: string; accommodation_id: string; start_date: string; end_date: string | null }[]) {
              if (!map[a.user_id]) {
                const emp = emps.find((e) => e.id === a.user_id);
                map[a.user_id] = {
                  accommodation_id: a.accommodation_id,
                  end_date: a.end_date || "",
                  // "Temporaire" si end_date est définie
                  // "Affecté" si l'établissement actif diffère de la base permanente
                  is_different_site: emp ? (emp.accommodation_id !== a.accommodation_id) : false,
                };
              }
            }
            setTempAssignments(map);
          }
        }
      }
    } catch (err) {
      toast.error("Les données sont introuvables 🤔 Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const name = formData.full_name.trim();
    const phone = normalizePhone(formData.phone.trim());
    if (!name || !phone) {
      toast.error("Ajoutez un nom et un numéro de téléphone 📞");
      return;
    }
    if (!isValidPhone(formData.phone.trim())) {
      toast.error("Numéro de téléphone invalide. Utilisez le format +225 07 00 00 00 00 📞");
      return;
    }
    if (formData.email && formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      toast.error("L'adresse email n'est pas valide ✉️");
      return;
    }
    if (!formData.accommodation_id) {
      toast.error("Sélectionnez l'établissement de rattachement de l'employé.");
      return;
    }
    // Détection de doublon de téléphone (même logique de correspondance que le login employé)
    const phoneDigits = phone.replace(/[^0-9]/g, "");
    const duplicate = employees.some((emp) => {
      if (!emp.phone) return false;
      const empDigits = emp.phone.replace(/[^0-9]/g, "");
      return empDigits === phoneDigits || empDigits.endsWith(phoneDigits) || phoneDigits.endsWith(empDigits);
    });
    if (duplicate) {
      toast.error("Ce numéro de téléphone est déjà utilisé 📞");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("users").insert({
        tenant_id: tenantId,
        accommodation_id: formData.accommodation_id,
        role: formData.role,
        full_name: name,
        phone,
        email: formData.email?.trim() || null,
        is_active: true, // Employé autorisé à se connecter et définir son code
        first_login: true,
      });
      if (error) throw error;

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const generatedLink = `${origin}/employee-login?phone=${encodeURIComponent(phone)}`;

      setInviteData({
        full_name: name,
        phone,
        role: formData.role,
        link: generatedLink,
      });

      setModalOpen(false);
      setFormData({ full_name: "", phone: "", role: "receptionniste", email: "", accommodation_id: "" });
      setInviteModalOpen(true);
      loadData();
    } catch (err) {
      toast.error("L'action a échoué : enregistrer les modifications.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function copyInviteLink(link: string) {
    try {
      navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Lien d'invitation copié dans le presse-papier !");
    } catch {
      toast.error("Le copier a échoué. Sélectionnez-le manuellement 📋");
    }
    setTimeout(() => setCopied(false), 3000);
  }

  function openWhatsAppInvite(phone: string, name: string, role: string, link: string) {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const message = `Bonjour ${name}, votre compte Séjoura (${getRoleLabel(role)}) a été créé avec succès !\n\nPour finaliser votre inscription et définir votre code secret, cliquez sur ce lien :\n${link}`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
  }

  async function handleToggleActive(emp: User) {
    try {
      const supabase = createClient();
      const newStatus = !emp.is_active;
      const { error } = await supabase
        .from("users")
        .update({ is_active: newStatus })
        .eq("id", emp.id);

      if (error) throw error;
      toast.success(newStatus ? `Accès réactivé pour ${emp.full_name}` : `Accès révoqué pour ${emp.full_name}`);
      loadData();
    } catch (err) {
      toast.error("Le statut n'a pas pu être modifié : employé.");
      console.error(err);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("users").delete().eq("id", deleteTarget.id);

      if (error) {
        // L'employé possède un historique (réservations, encaissements, dépenses…) :
        // la suppression est bloquée par les clés étrangères NOT NULL. On révoque
        // l'accès à la place (is_active=false), sans perdre la traçabilité.
        const { error: deactivateError } = await supabase
          .from("users")
          .update({ is_active: false })
          .eq("id", deleteTarget.id);

        if (deactivateError) throw deactivateError;

        toast.warning(
          `Impossible de supprimer ${deleteTarget.full_name} (activité enregistrée). Son accès a été révoqué à la place.`
        );
      } else {
        toast.success("Employé supprimé 🗑️");
      }

      setDeleteTarget(null);
      loadData();
    } catch (err) {
      toast.error("La suppression a échoué 🗑️");
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  function openReassign(emp: User) {
    setReassignTarget(emp);
    // Pré-remplit avec l'affectation ACTIVE (temporaire ou permanente)
    const active = tempAssignments[emp.id];
    const currentAccId = active?.accommodation_id || emp.accommodation_id || "";
    setReassignForm({
      accommodation_id: currentAccId,
      start_date: new Date().toISOString().split("T")[0],
      end_date: "",
      notes: "",
    });
    setReassignModalOpen(true);
  }

  async function handleReassign() {
    if (!reassignTarget || !reassignForm.accommodation_id) {
      toast.error("Choisissez un établissement de destination 🏨");
      return;
    }
    if (reassignForm.end_date && reassignForm.end_date < reassignForm.start_date) {
      toast.error("La date de fin doit être après le début 📅");
      return;
    }
    // Valide contre l'affectation ACTIVE (pas juste le permanent)
    const activeAssignment = tempAssignments[reassignTarget.id];
    const currentActiveAccId = activeAssignment?.accommodation_id || reassignTarget.accommodation_id;
    if (reassignForm.accommodation_id === currentActiveAccId) {
      toast.error(`${reassignTarget.full_name} est déjà affecté à cet établissement.`);
      return;
    }
    const activeTemp = tempAssignments[reassignTarget.id];
    if (activeTemp && activeTemp.end_date) {
      toast.warning(`${reassignTarget.full_name} est actuellement en affectation temporaire. La nouvelle affectation prendra le relais à partir du ${formatDate(reassignForm.start_date)}.`);
    }
    setReassignLoading(true);
    try {
      const supabase = createClient();
      const isTemporary = !!reassignForm.end_date;

      // Si c'est une réaffectation permanente (pas de end_date) → mettre à jour aussi accommodation_id sur users
      if (!isTemporary) {
        const { error: updateError } = await supabase
          .from("users")
          .update({ accommodation_id: reassignForm.accommodation_id })
          .eq("id", reassignTarget.id);
        if (updateError) throw updateError;
      }

      // Insérer dans employee_assignments pour l'historique
      const { error } = await supabase.from("employee_assignments").insert({
        user_id: reassignTarget.id,
        accommodation_id: reassignForm.accommodation_id,
        start_date: reassignForm.start_date,
        end_date: reassignForm.end_date || null,
        notes: reassignForm.notes || null,
        created_by: currentAdminId || null,
      });

      if (error) throw error;

      const destAcc = accommodations.find((a) => a.id === reassignForm.accommodation_id);
      const destName = destAcc?.name || "l'établissement sélectionné";

      if (isTemporary) {
        toast.success(`${reassignTarget.full_name} est affecté temporairement à « ${destName} » jusqu'au ${formatDate(reassignForm.end_date)}.`);
      } else {
        toast.success(`${reassignTarget.full_name} est maintenant rattaché à « ${destName} » de façon permanente.`);
      }

      setReassignModalOpen(false);
      setReassignTarget(null);
      loadData();
    } catch (err) {
      toast.error("L'action a échoué : effectuer la réaffectation.");
      console.error(err);
    } finally {
      setReassignLoading(false);
    }
  }

  async function openHistory(emp: User) {
    setHistoryTarget(emp);
    setHistoryData([]);
    setHistoryModalOpen(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("employee_assignments")
        .select("*")
        .eq("user_id", emp.id)
        .order("start_date", { ascending: false })
        .limit(20);
      if (error) {
        console.error("Erreur chargement historique affectations:", error);
        toast.error("Le chargement de l'historique a échoué.");
        return;
      }
      if (data) {
        // Joindre les accommodations déjà chargées en mémoire
        const enriched = data.map((row: EmployeeAssignment) => ({
          ...row,
          accommodation: accommodations.find((a) => a.id === row.accommodation_id) || null,
        }));
        setHistoryData(enriched as (EmployeeAssignment & { accommodation?: Accommodation })[]);
      }
    } catch (err) {
      console.error("Exception chargement historique:", err);
      toast.error("Le chargement a échoué : historique.");
    }
  }

  const limits = getPlanLimits(plan);
  const adminCount = employees.filter((e) => e.role === "admin_residence").length;
  const recepCount = employees.filter((e) => e.role === "receptionniste").length;
  const menagereCount = employees.filter((e) => e.role === "menagere").length;
  const formatLimit = (limit: number | null) => (limit === null ? "∞" : String(limit));

  const filteredEmployees = employees.filter((emp) => {
    if (filterRole !== "all" && emp.role !== filterRole) return false;
    if (filterAcc !== "all" && emp.accommodation_id !== filterAcc) return false;
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

  const hasActiveFilters = searchQuery !== "" || filterRole !== "all" || filterAcc !== "all";

  function resetFilters() {
    setSearchQuery("");
    setFilterRole("all");
    setFilterAcc("all");
  }

  if (loading && employees.length === 0) {
    return <EmployeesSkeleton />;
  }

  return (
    <div
      style={{
        backgroundColor: "var(--main-bg, transparent)",
      }}
      className="space-y-3 animate-fade-in p-1 rounded-xl transition-colors duration-200"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Employés</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{employees.length} employé{employees.length > 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <UserPlus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {/* Limites du plan */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">Admins</p>
              <p className="text-base sm:text-xl font-bold text-slate-900 dark:text-white">{adminCount} / {formatLimit(limits.maxAdmins)}</p>
            </div>
            <Users className="w-5 h-5 text-[var(--primary-color,#0C1C33)]" />
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">Réceptionnistes</p>
              <p className="text-base sm:text-xl font-bold text-slate-900 dark:text-white">{recepCount} / {formatLimit(limits.maxReceptionnists)}</p>
            </div>
            <Users className="w-5 h-5 text-[var(--primary-color,#0C1C33)]" />
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">Ménagères</p>
              <p className="text-base sm:text-xl font-bold text-slate-900 dark:text-white">
                {menagereCount}
                {limits.hasCleaningModule ? ` / ${formatLimit(limits.maxReceptionnists)}` : ""}
              </p>
            </div>
            <Users className="w-5 h-5 text-[var(--primary-color,#0C1C33)]" />
          </div>
        </Card>
      </div>

      {/* Barre de recherche & filtres */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 w-full sm:w-auto sm:min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
          />
        </div>
        <select
          value={filterAcc}
          onChange={(e) => setFilterAcc(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
        >
          <option value="all">Tous les établissements</option>
          {accommodations.map((acc) => (
            <option key={acc.id} value={acc.id}>{acc.name} {acc.city ? `(${acc.city})` : ""}</option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
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
          {hasActiveFilters ? (
            <>
              <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucun employé trouvé</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Aucun employé ne correspond à vos critères de recherche.</p>
              <Button variant="outline" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            </>
          ) : (
            <>
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucun employé</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ajoutez votre premier employé</p>
              <Button onClick={() => setModalOpen(true)}>
                <UserPlus className="w-4 h-4" /> Ajouter
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Cartes mobiles */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
            {filteredEmployees.map((emp) => {
              const assignedAcc = accommodations.find((a) => a.id === emp.accommodation_id);
              const tempAss = tempAssignments[emp.id];
              const currentActiveAcc = tempAss ? accommodations.find((a) => a.id === tempAss.accommodation_id) : assignedAcc;
              return (
                <div key={emp.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[var(--primary-color,#0C1C33)] flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                        {getInitials(emp.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate cursor-pointer hover:text-[var(--primary-color,#0C1C33)] transition-colors" onClick={() => openHistory(emp)}>{emp.full_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge variant={emp.role === "admin_residence" ? "info" : emp.role === "menagere" ? "theme" : "default"}>
                            {getRoleLabel(emp.role)}
                          </Badge>
                          {emp.is_active ? (
                            <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Actif</Badge>
                          ) : (
                            <Badge variant="error"><Ban className="w-3 h-3" /> Révoqué</Badge>
                          )}
                          {canAccessPlanFeature(plan, "hrModule") && (
                            hrLinkedUserIds.has(emp.id) ? (
                              <Badge variant="theme"><IdCard className="w-3 h-3" /> Dossier RH</Badge>
                            ) : (
                              <a href={`/dashboard/hr?linkUserId=${emp.id}`} className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--primary-color,#0C1C33)] hover:underline">
                                <IdCard className="w-3 h-3" /> Créer le dossier RH
                              </a>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={`Actions pour ${emp.full_name}`} className="h-10 w-10">
                        <MoreHorizontal className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Affectation</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => openReassign(emp)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                          <ArrowLeftRight className="w-4 h-4" /> Changer d&apos;établissement
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openHistory(emp)}>
                          <History className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Historique des affectations
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Accès</DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={() => {
                            const origin = typeof window !== "undefined" ? window.location.origin : "";
                            const generatedLink = `${origin}/employee-login?phone=${encodeURIComponent(emp.phone)}`;
                            setInviteData({ full_name: emp.full_name, phone: emp.phone, role: emp.role, link: generatedLink });
                            setInviteModalOpen(true);
                          }}
                          className="text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                        >
                          <Share2 className="w-4 h-4" /> Partager le lien d&apos;accès
                        </DropdownMenuItem>
                        {emp.role !== "admin_residence" && (
                          <>
                            <DropdownMenuItem onSelect={() => handleToggleActive(emp)} className={emp.is_active ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}>
                              {emp.is_active ? <Ban className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                              {emp.is_active ? "Révoquer l&apos;accès" : "Réactiver l&apos;accès"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Zone sensible</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setDeleteTarget(emp)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                              <Trash2 className="w-4 h-4" /> Supprimer l&apos;employé
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-2 ml-13 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{currentActiveAcc ? currentActiveAcc.name : "Tous les établissements"}</span>
                    </div>
                    {tempAss && tempAss.end_date && (
                      <Badge variant="warning" className="text-[10px] gap-1 px-1.5 py-0.5">
                        <CalendarDays className="w-3 h-3" />
                        Temporaire jusqu&apos;au {formatDate(tempAss.end_date)}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{emp.phone}</span>
                    </div>
                    {emp.email && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{emp.email}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tableau desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Nom</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Rôle</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Établissement</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Téléphone</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Statut</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Créé le</th>
                  <th className="text-right p-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredEmployees.map((emp) => {
                  const assignedAcc = accommodations.find((a) => a.id === emp.accommodation_id);
                  const tempAss = tempAssignments[emp.id];
                  const currentActiveAcc = tempAss ? accommodations.find((a) => a.id === tempAss.accommodation_id) : assignedAcc;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[var(--primary-color,#0C1C33)] flex items-center justify-center text-white text-sm font-semibold">
                            {getInitials(emp.full_name)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white cursor-pointer hover:text-[var(--primary-color,#0C1C33)] transition-colors" onClick={() => openHistory(emp)}>{emp.full_name}</p>
                            {emp.email && <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{emp.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={emp.role === "admin_residence" ? "info" : emp.role === "menagere" ? "theme" : "default"}>
                          {getRoleLabel(emp.role)}
                        </Badge>
                        {canAccessPlanFeature(plan, "hrModule") && (
                          <div className="mt-1">
                            {hrLinkedUserIds.has(emp.id) ? (
                              <Badge variant="theme" className="text-[10px] gap-1 px-1.5 py-0.5"><IdCard className="w-3 h-3" /> Dossier RH</Badge>
                            ) : (
                              <a href={`/dashboard/hr?linkUserId=${emp.id}`} className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--primary-color,#0C1C33)] hover:underline">
                                <IdCard className="w-3 h-3" /> Créer le dossier RH
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 font-medium">
                            <Building2 className="w-4 h-4 text-[var(--primary-color,#0C1C33)] flex-shrink-0" />
                            <span>{currentActiveAcc ? currentActiveAcc.name : "Tous les établissements"}</span>
                          </div>
                          {tempAss && tempAss.end_date && (
                            <Badge variant="warning" className="text-[10px] gap-1 px-1.5 py-0.5">
                              <CalendarDays className="w-3 h-3" />
                              Temporaire jusqu'au {formatDate(tempAss.end_date)}
                            </Badge>
                          )}
                          {tempAss && !tempAss.end_date && tempAss.is_different_site && (
                            <Badge variant="info" className="text-[10px] gap-1 px-1.5 py-0.5">
                              <ArrowLeftRight className="w-3 h-3" />
                              Affecté (Nouveau site)
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                          {emp.phone}
                        </div>
                      </td>
                      <td className="p-3">
                        {emp.is_active ? (
                          <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Actif</Badge>
                        ) : (
                          <Badge variant="error"><Ban className="w-3 h-3" /> Accès révoqué</Badge>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{formatDate(emp.created_at)}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger aria-label={`Actions pour ${emp.full_name}`} className="h-10 w-10 md:h-8 md:w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Affectation</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => openReassign(emp)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                <ArrowLeftRight className="w-4 h-4" /> Changer d&apos;établissement
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openHistory(emp)}>
                                <History className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" /> Historique des affectations
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>Accès</DropdownMenuLabel>
                              <DropdownMenuItem
                                onSelect={() => {
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
                                className="text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                              >
                                <Share2 className="w-4 h-4" /> Partager le lien d&apos;accès
                              </DropdownMenuItem>
                              {emp.role !== "admin_residence" && (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => handleToggleActive(emp)}
                                    className={
                                      emp.is_active
                                        ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                        : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                    }
                                  >
                                    {emp.is_active ? <Ban className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                    {emp.is_active ? "Révoquer l&apos;accès" : "Réactiver l&apos;accès"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel>Zone sensible</DropdownMenuLabel>
                                  <DropdownMenuItem onSelect={() => setDeleteTarget(emp)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                                    <Trash2 className="w-4 h-4" /> Supprimer l&apos;employé
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Info activation */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--primary-muted)] border border-[var(--primary-color)]/20">
        <Phone className="w-5 h-5 text-[var(--primary-color,#0C1C33)] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[var(--primary-color,#0C1C33)]">Activation & Mobilité des employés</p>
          <p className="text-xs text-[var(--primary-color,#0C1C33)]/80 mt-1">
            Chaque employé accède au dashboard de sa résidence d'affectation active. Vous pouvez réaffecter un employé de façon permanente ou fixer des dates de début/fin pour un remplacement temporaire.
          </p>
        </div>
      </div>

      {/* Modal d'ajout d'employé */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Ajouter un employé">
        <div className="space-y-3">
          <Input label="Nom complet *" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="Aminata Traoré" required />
          <Input label="Téléphone *" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+225 07 00 00 00 00" icon={<Phone className="w-5 h-5" />} required />
          <Input label="Email (optionnel)" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="aminata@residence.com" />
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Établissement (Résidence) *</label>
            <select
              value={formData.accommodation_id}
              onChange={(e) => setFormData({ ...formData, accommodation_id: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              <option value="">Sélectionner une résidence</option>
              {accommodations.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name} {acc.city ? `(${acc.city})` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rôle *</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="receptionniste">Réceptionniste</option>
              <option value="menagere" disabled={!limits.hasCleaningModule}>
                Ménagère
              </option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={loading}>Ajouter</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Réaffecter un employé */}
      {reassignTarget && (
        <Modal
          open={reassignModalOpen}
          onClose={() => setReassignModalOpen(false)}
          title={`Réaffecter ${reassignTarget.full_name}`}
          description="Changer l'établissement de travail ou programmer un déplacement temporaire."
        >
          <div className="space-y-3">
            {reassignTarget && (() => {
              const active = tempAssignments[reassignTarget.id];
              const currentAccId = active?.accommodation_id || reassignTarget.accommodation_id;
              const currentAcc = accommodations.find((a) => a.id === currentAccId);
              const isTemp = !!active?.end_date;
              return currentAcc ? (
                <div className={`p-3 rounded-xl border text-sm ${
                  isTemp
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200"
                }`}>
                  <span className="font-semibold">📍 Affectation actuelle :</span> {currentAcc.name}{currentAcc.city ? `, ${currentAcc.city}` : ""}
                  {isTemp && (
                    <span className="ml-2 text-xs opacity-75">(temporaire jusqu'au {formatDate(active.end_date)})</span>
                  )}
                </div>
              ) : null;
            })()}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nouvel établissement de destination *</label>
              <select
                value={reassignForm.accommodation_id}
                onChange={(e) => setReassignForm({ ...reassignForm, accommodation_id: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sélectionner un établissement</option>
                {accommodations.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.city ? `(${acc.city})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Date de début *</label>
                <input
                  type="date"
                  value={reassignForm.start_date}
                  onChange={(e) => setReassignForm({ ...reassignForm, start_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">
                  Date de fin <span className="font-normal text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">(Optionnelle)</span>
                </label>
                <input
                  type="date"
                  value={reassignForm.end_date}
                  onChange={(e) => setReassignForm({ ...reassignForm, end_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              💡 <span className="font-semibold">Remarque :</span> Si la date de fin est laissée vide, l'affectation sera permanente. Si elle est renseignée, l'employé retournera automatiquement à son site de base à l'expiration.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Raison / Notes (Optionnel)</label>
              <Input
                placeholder="Remplacement vacances, renfort weekend..."
                value={reassignForm.notes}
                onChange={(e) => setReassignForm({ ...reassignForm, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setReassignModalOpen(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={handleReassign} loading={reassignLoading}>
                Valider la réaffectation
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Historique des affectations */}
      {historyTarget && (
        <Modal
          open={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          title={`Historique des affectations - ${historyTarget.full_name}`}
        >
          <div className="space-y-3">
            {historyData.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center py-6">Aucun historique d'affectation enregistré.</p>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {historyData.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {item.accommodation?.name || "Établissement inconnu"}
                      </span>
                      {item.end_date ? (
                        <Badge variant="warning" className="text-[10px]">Temporaire</Badge>
                      ) : (
                        <Badge variant="info" className="text-[10px]">Permanente</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>Du {formatDate(item.start_date)}</span>
                      {item.end_date ? <span>au {formatDate(item.end_date)}</span> : <span>(En cours / Définitif)</span>}
                    </div>
                    {item.notes && <p className="text-xs text-slate-600 dark:text-slate-300 italic pt-1">« {item.notes} »</p>}
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="w-full mt-2" onClick={() => setHistoryModalOpen(false)}>
              Fermer
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal de confirmation de suppression */}
      {deleteTarget && (
        <Modal
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          title="Supprimer l'employé"
          description={`L'accès de ${deleteTarget.full_name} sera immédiatement révoqué.`}
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <Ban className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Si cet employé possède un historique (réservations, encaissements, dépenses…), une suppression définitive est impossible : son accès sera révoqué à la place. L’historique des affectations n’est supprimé qu’en cas de suppression définitive.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Annuler
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} loading={deleteLoading}>
                Supprimer
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal d'invitation généré */}
      {inviteData && (
        <Modal
          open={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          title="🎉 Employé enregistré !"
          description="Transmettez ce lien à l'employé pour qu'il puisse finaliser son inscription."
        >
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Employé :</span>
                <span className="font-semibold text-slate-900 dark:text-white">{inviteData.full_name}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Téléphone reconnu :</span>
                <span className="font-semibold text-slate-900 dark:text-white">{inviteData.phone}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Rôle :</span>
                <Badge variant="purple">{getRoleLabel(inviteData.role)}</Badge>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase mb-2">Lien d'activation généré</label>
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