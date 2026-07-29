"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatFCFA, getPlanLimits } from "@/lib/utils";
import { Building2, Plus, MapPin, Phone, BedDouble, Edit2, Trash2, Loader2, Lock } from "lucide-react";
import type { Accommodation, RoomType } from "@/types/database";

export default function ResidencesPage() {
  const [loading, setLoading] = useState(true);
  const [residences, setResidences] = useState<Accommodation[]>([]);
  const [roomTypes, setRoomTypes] = useState<Record<string, RoomType[]>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingResidence, setEditingResidence] = useState<Accommodation | null>(null);
  const [plan, setPlan] = useState("standard");
  const [formData, setFormData] = useState({ name: "", address: "", city: "", contact_phone: "" });

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

      // Récupérer les résidences
      const { data: accData } = await supabase
        .from("accommodations")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("created_at", { ascending: false });

      if (accData) {
        setResidences(accData as unknown as Accommodation[]);

        // Récupérer les types de chambres pour chaque résidence
        const typesMap: Record<string, RoomType[]> = {};
        for (const acc of accData) {
          const { data: types } = await supabase
            .from("room_types")
            .select("*")
            .eq("accommodation_id", acc.id);
          typesMap[acc.id] = (types || []) as unknown as RoomType[];
        }
        setRoomTypes(typesMap);
      }
    } catch {
      // Erreur silencieuse — données simulées
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    const limits = getPlanLimits(plan);
    if (limits.maxAccommodations !== null && residences.length >= limits.maxAccommodations) {
      alert(`Votre plan ${plan} est limité à ${limits.maxAccommodations} hébergements. Passez au plan Pro pour des hébergements illimités.`);
      return;
    }
    setEditingResidence(null);
    setFormData({ name: "", address: "", city: "", contact_phone: "" });
    setModalOpen(true);
  }

  function openEditModal(acc: Accommodation) {
    setEditingResidence(acc);
    setFormData({ name: acc.name, address: acc.address || "", city: acc.city || "", contact_phone: acc.contact_phone || "" });
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
          })
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
          });
      }

      setModalOpen(false);
      loadData();
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Voulez-vous vraiment supprimer cette résidence ? Toutes les chambres et réservations associées seront supprimées.")) return;
    try {
      const supabase = createClient();
      await supabase.from("accommodations").delete().eq("id", id);
      loadData();
    } catch {
      // Erreur silencieuse
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Résidences</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {residences.length} hébergement{residences.length > 1 ? "s" : ""}
            {limits.maxAccommodations !== null && ` / ${limits.maxAccommodations} max`}
          </p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {/* Limite plan */}
      {limits.maxAccommodations !== null && residences.length >= limits.maxAccommodations && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <Lock className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Limite du plan Standard atteinte</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">Passez au plan Pro pour des hébergements illimités.</p>
          </div>
          <Button size="sm" variant="primary">Mettre à niveau</Button>
        </div>
      )}

      {/* Grille des résidences */}
      {residences.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune résidence</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Commencez par ajouter votre premier hébergement</p>
          <Button onClick={openAddModal}>
            <Plus className="w-4 h-4" /> Ajouter une résidence
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {residences.map((acc) => (
            <Card key={acc.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEditModal(acc)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(acc.id)} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{acc.name}</h3>

              <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                {acc.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span>{acc.address}, {acc.city}</span>
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

              {/* Types de chambres */}
              {roomTypes[acc.id] && roomTypes[acc.id].length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-400 uppercase mb-2">Types de chambres</p>
                  <div className="flex flex-wrap gap-2">
                    {roomTypes[acc.id].map((rt) => (
                      <Badge key={rt.id} variant="purple">
                        {rt.name} — {formatFCFA(rt.base_price)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => window.location.href = `/dashboard/rooms?residence=${acc.id}`}>
                  <BedDouble className="w-4 h-4" /> Chambres
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEditModal(acc)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Add/Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingResidence ? "Modifier la résidence" : "Ajouter une résidence"}
        description="Renseignez les informations de votre hébergement"
      >
        <div className="space-y-4">
          <Input label="Nom de la résidence" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Résidence Palm Beach" />
          <Input label="Adresse" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Cocody Riviera 2" />
          <Input label="Ville" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Abidjan" />
          <Input label="Téléphone de contact" value={formData.contact_phone} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} placeholder="+225 07 00 00 00 00" />

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleSave} loading={loading}>
              {editingResidence ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}