"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, getPlanLimits, getPlanLabel } from "@/lib/utils";
import { Building2, Plus, MapPin, Phone, BedDouble, Loader2, Lock, Trash2 } from "lucide-react";
import type { Accommodation, RoomType } from "@/types/database";

export default function ResidencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [residences, setResidences] = useState<Accommodation[]>([]);
  const [roomTypes, setRoomTypes] = useState<Record<string, RoomType[]>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingResidence, setEditingResidence] = useState<Accommodation | null>(null);
  const [plan, setPlan] = useState("");
  const [formData, setFormData] = useState({ name: "", address: "", city: "", contact_phone: "", image_url: "" });

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

      if (!userData?.tenant_id) return;

      // Récupérer le plan
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setPlan(subData.plan);

      // Récupérer les établissements
      const { data: accData } = await supabase
        .from("accommodations")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("created_at", { ascending: false });

      if (accData) {
        setResidences(accData as unknown as Accommodation[]);

        const accommodationIds = accData.map((a) => a.id);
        const { data: allTypes } = await supabase
          .from("room_types")
          .select("*")
          .in("accommodation_id", accommodationIds);

        const typesMap: Record<string, RoomType[]> = {};
        (allTypes || []).forEach((rt: RoomType) => {
          if (!typesMap[rt.accommodation_id]) typesMap[rt.accommodation_id] = [];
          typesMap[rt.accommodation_id].push(rt);
        });
        setRoomTypes(typesMap);
      }
    } catch (err) {
      toast.error("Impossible de charger les établissements.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    if (!plan) return;
    const limits = getPlanLimits(plan);
    if (limits.maxAccommodations !== null && residences.length >= limits.maxAccommodations) {
      toast.error(`Votre plan ${getPlanLabel(plan)} est limité à ${limits.maxAccommodations} établissement${limits.maxAccommodations > 1 ? "s" : ""}. Passez au plan Pro pour des établissements illimités.`);
      return;
    }
    setEditingResidence(null);
    setFormData({ name: "", address: "", city: "", contact_phone: "", image_url: "" });
    setModalOpen(true);
  }

  function openEditModal(acc: Accommodation) {
    setEditingResidence(acc);
    setFormData({ name: acc.name, address: acc.address || "", city: acc.city || "", contact_phone: acc.contact_phone || "", image_url: (acc as any).image_url || "" });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formData.name) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData?.tenant_id) return;

      if (editingResidence) {
        await supabase
          .from("accommodations")
          .update({
            name: formData.name,
            address: formData.address,
            city: formData.city,
            contact_phone: formData.contact_phone,
            image_url: formData.image_url || null,
          } as any)
          .eq("id", editingResidence.id);
      } else {
        await supabase
          .from("accommodations")
          .insert({
            tenant_id: userData.tenant_id,
            name: formData.name,
            address: formData.address,
            city: formData.city,
            contact_phone: formData.contact_phone,
            image_url: formData.image_url || null,
          } as any);
      }

      setModalOpen(false);
      loadData();
    } catch (err) {
      toast.error("Impossible d'enregistrer l'établissement.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const supabase = createClient();
      await supabase.from("accommodations").delete().eq("id", id);
      toast.success("Établissement supprimé avec succès.");
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      loadData();
    } catch (err) {
      toast.error("Impossible de supprimer l'établissement.");
      console.error(err);
    }
  }

  if (loading && residences.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const limits = getPlanLimits(plan);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Établissements</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {residences.length} établissement{residences.length > 1 ? "s" : ""}
            {limits.maxAccommodations !== null && ` / ${limits.maxAccommodations} max`}
          </p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="w-4 h-4" /> Ajouter un établissement
        </Button>
      </div>

      {/* Limite plan */}
      {plan && limits.maxAccommodations !== null && residences.length >= limits.maxAccommodations && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <Lock className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Limite du plan {getPlanLabel(plan)} atteinte</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">Passez au plan Pro pour des établissements illimités.</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => router.push("/dashboard/subscription")}>Mettre à niveau</Button>
        </div>
      )}

      {/* Grille des établissements */}
      {residences.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucun établissement</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Commencez par ajouter votre premier établissement</p>
          <Button onClick={openAddModal}>
            <Plus className="w-4 h-4" /> Ajouter un établissement
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {residences.map((acc) => (
            <Card 
              key={acc.id} 
              className="p-5 cursor-pointer border-t-4 border-t-indigo-500 dark:border-t-indigo-400 hover:border-indigo-400 overflow-hidden flex flex-col justify-between"
              onClick={() => router.push(`/dashboard/residences/${acc.id}`)}
            >
              <div>
                {(acc as any).image_url ? (
                  <div className="h-32 -mx-5 -mt-5 mb-4 overflow-hidden relative">
                    <img src={(acc as any).image_url} alt={acc.name} className="w-full h-full object-cover" />
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 text-white bg-slate-900/50 hover:bg-red-600 absolute top-2 right-2 z-10" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setDeletingId(acc.id); 
                        setDeleteConfirmOpen(true); 
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 z-10" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setDeletingId(acc.id); 
                        setDeleteConfirmOpen(true); 
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{acc.name}</h3>

              <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                {(acc.address || acc.city) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {acc.address}{acc.address && acc.city ? ", " : ""}{acc.city}
                    </span>
                  </div>
                )}
                {acc.contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 flex-shrink-0" />
                    <span>{acc.contact_phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <BedDouble className="w-4 h-4 flex-shrink-0" />
                  <span>{acc.total_rooms} chambre{acc.total_rooms > 1 ? "s" : ""}</span>
                </div>
              </div>

                  {/* Types de chambre */}
              {roomTypes[acc.id] && roomTypes[acc.id].length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-400 uppercase mb-2">Types de chambre</p>
                  <div className="flex flex-wrap gap-2">
                    {roomTypes[acc.id].map((rt) => (
                        <Badge key={rt.id} variant="purple">
                          {rt.name} — {formatFCFA(rt.base_price)}
                        </Badge>
                    ))}
                  </div>
                </div>
              )}

              </Card>
          ))}
        </div>
      )}

      {/* Modal Add/Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingResidence ? "Modifier l'établissement" : "Ajouter un établissement"}
        description="Renseignez les informations de votre établissement"
        onConfirm={handleSave}
      >
        <div className="space-y-4">
          <Input label="Nom de l'établissement" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Hôtel Palm Beach, Villa Ivoire" />
          <Input label="Adresse" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Cocody Riviera 2" />
          <Input label="Ville" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Abidjan" />
          <Input label="Téléphone de contact" value={formData.contact_phone} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} placeholder="+225 07 00 00 00 00" />
          <Input label="URL de l'image (optionnelle)" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://images.unsplash.com/..." />

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={loading}>
              {editingResidence ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal 
        open={deleteConfirmOpen} 
        onClose={() => setDeleteConfirmOpen(false)} 
        title="Confirmation" 
        description="Êtes-vous sûr de vouloir supprimer cet établissement ? Toutes les chambres et réservations associées seront supprimées."
        onConfirm={async () => {
          if (deletingId) await handleDelete(deletingId);
        }}
      >
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>Annuler</Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={async () => {
              if (deletingId) await handleDelete(deletingId);
            }}
            loading={loading}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}