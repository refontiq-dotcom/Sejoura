"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DoorOpen, Loader2, Plus, Save, Star, Trash2, Upload, Waypoints } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RoomType } from "@/types/database";
import type { PanoramaScene, PanoramaSceneKind, PanoramaTour } from "@/types/panorama";
import { EMPTY_PANORAMA_TOUR, normalizePanoramaTour } from "@/types/panorama";
import { PanoramaViewer } from "@/components/panorama/panorama-viewer";

interface PanoramaTourManagerProps {
  accommodationId: string;
  roomTypes: RoomType[];
  initialTour?: PanoramaTour | null;
  readOnly?: boolean;
}

const KIND_LABELS: Record<PanoramaSceneKind, string> = {
  room: "Chambre",
  corridor: "Couloir",
  lobby: "Hall / réception",
  other: "Autre espace",
};

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function PanoramaTourManager({ accommodationId, roomTypes, initialTour, readOnly = false }: PanoramaTourManagerProps) {
  const [tour, setTour] = useState<PanoramaTour>(() => normalizePanoramaTour(initialTour ?? EMPTY_PANORAMA_TOUR));
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(() => normalizePanoramaTour(initialTour ?? EMPTY_PANORAMA_TOUR).startSceneId);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PanoramaSceneKind>("room");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedScene = tour.scenes.find((scene) => scene.id === selectedSceneId) ?? null;
  const targets = useMemo(() => tour.scenes.filter((scene) => scene.id !== selectedSceneId), [tour.scenes, selectedSceneId]);

  async function uploadScene(file: File) {
    if (file.size > 30 * 1024 * 1024) {
      toast.error("Le panorama dépasse 30 Mo.");
      return;
    }
    if (!name.trim()) {
      toast.error("Donnez un nom à cet espace avant l'upload.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("kind", "panorama_360");
      const res = await fetch("/api/v1/trouvetou/upload-photo", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== "string") throw new Error(data.error || "Upload impossible.");

      const scene: PanoramaScene = {
        id: uid(),
        name: name.trim(),
        kind,
        src: data.url,
        previewSrc: data.url,
        roomTypeId: roomTypeId || null,
        isStart: tour.scenes.length === 0,
        isPublished: true,
      };

      const next = {
        ...tour,
        startSceneId: tour.startSceneId ?? scene.id,
        scenes: [...tour.scenes, scene],
      };
      setTour(next);
      setSelectedSceneId(scene.id);
      setName("");
      toast.success("Espace 360° ajouté.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ajouter le panorama.");
    } finally {
      setUploading(false);
    }
  }

  function removeScene(sceneId: string) {
    const scenes = tour.scenes.filter((scene) => scene.id !== sceneId);
    const links = tour.links.filter((link) => link.fromSceneId !== sceneId && link.toSceneId !== sceneId);
    const startSceneId = tour.startSceneId === sceneId ? scenes[0]?.id ?? null : tour.startSceneId;
    setTour({ ...tour, scenes, links, startSceneId });
    setSelectedSceneId(startSceneId);
  }

  function addLink(targetSceneId: string, yaw: number, pitch: number) {
    if (!selectedSceneId || selectedSceneId === targetSceneId) return;
    const exists = tour.links.some((link) => link.fromSceneId === selectedSceneId && link.toSceneId === targetSceneId);
    if (exists) {
      toast.info("Ce passage existe déjà.");
      return;
    }
    const target = tour.scenes.find((scene) => scene.id === targetSceneId);
    if (!target) return;
    setTour({
      ...tour,
      links: [
        ...tour.links,
        {
          id: uid(),
          fromSceneId: selectedSceneId,
          toSceneId: targetSceneId,
          yaw,
          pitch,
          label: `Aller vers ${target.name}`,
        },
      ],
    });
    toast.success("Passage ajouté.");
  }

  function removeLink(linkId: string) {
    setTour({ ...tour, links: tour.links.filter((link) => link.id !== linkId) });
  }

  function setStart(sceneId: string) {
    setTour({
      ...tour,
      startSceneId: sceneId,
      scenes: tour.scenes.map((scene) => ({ ...scene, isStart: scene.id === sceneId })),
    });
  }

  function togglePublished(sceneId: string) {
    setTour({
      ...tour,
      scenes: tour.scenes.map((scene) => scene.id === sceneId ? { ...scene, isPublished: scene.isPublished === false } : scene),
    });
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const cleaned: PanoramaTour = {
        version: 1,
        startSceneId: tour.startSceneId,
        scenes: tour.scenes,
        links: tour.links.filter((link) => tour.scenes.some((scene) => scene.id === link.fromSceneId) && tour.scenes.some((scene) => scene.id === link.toSceneId)),
      };
      const { error } = await supabase.from("accommodations").update({ panorama_tour: cleaned }).eq("id", accommodationId);
      if (error) throw error;
      setTour(cleaned);
      const listedType = roomTypes.find((room) => room.is_listed_on_trouvetou);
      if (listedType) {
        const syncResponse = await fetch("/api/v1/trouvetou/sync-type", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomTypeId: listedType.id }),
        });
        if (!syncResponse.ok) console.warn("Visite 360 enregistrée, mais la synchronisation Trouvetou a échoué.");
      }
      toast.success("Visite 360° enregistrée.");
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'enregistrer la visite 360°.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Waypoints className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Visite 360° multi-pièces</h3>
          </div>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-600 dark:text-slate-400">
            Ajoutez les chambres, couloirs et espaces communs. Ensuite, ouvrez une scène, regardez vers une porte et créez un passage vers une autre scène.
          </p>
        </div>
        {!readOnly && <button type="button" onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Enregistrement…" : "Enregistrer la visite"}</button>}
      </div>

      {!readOnly && (
        <div className="mt-4 grid gap-3 rounded-xl border border-white/80 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom : Chambre 101, Couloir…" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400 lg:col-span-2" />
          <select value={kind} onChange={(e) => setKind(e.target.value as PanoramaSceneKind)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
            {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
            <option value="">Aucun type de chambre</option>
            {roomTypes.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Traitement…" : "Ajouter un panorama"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadScene(file); e.target.value = ""; }} />
          </label>
        </div>
      )}

      {tour.scenes.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-indigo-300 bg-white/70 p-6 text-center text-xs text-slate-500 dark:bg-slate-900/40">Aucun espace 360° configuré pour le moment.</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            {tour.scenes.map((scene) => (
              <button key={scene.id} type="button" onClick={() => setSelectedSceneId(scene.id)} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${scene.id === selectedSceneId ? "border-indigo-400 bg-white shadow-sm dark:bg-slate-900" : "border-slate-200 bg-white/60 hover:bg-white dark:border-slate-700 dark:bg-slate-900/50"}`}>
                {scene.previewSrc ? <span aria-hidden="true" className="h-14 w-20 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url("${scene.previewSrc}")` }} /> : <span className="h-14 w-20 rounded-lg bg-slate-200" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{scene.name}</span><span className="block text-[10px] text-slate-500">{KIND_LABELS[scene.kind]}{scene.isStart ? " · Départ" : ""}</span></span>
              </button>
            ))}
          </div>

          {selectedScene && (
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><p className="text-sm font-bold text-slate-900 dark:text-white">{selectedScene.name}</p><p className="text-[10px] text-slate-500">{KIND_LABELS[selectedScene.kind]}{selectedScene.isPublished === false ? " · Non publiée" : " · Publiée"}</p></div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setStart(selectedScene.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"><Star className="h-3.5 w-3.5" />Départ</button>
                  {!readOnly && <button type="button" onClick={() => togglePublished(selectedScene.id)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">{selectedScene.isPublished === false ? "Publier" : "Masquer"}</button>}
                  {!readOnly && <button type="button" onClick={() => removeScene(selectedScene.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Supprimer</button>}
                </div>
              </div>

              <PanoramaViewer
                src={selectedScene.src}
                previewSrc={selectedScene.previewSrc ?? undefined}
                title={selectedScene.name + " — édition 360°"}
                tour={tour}
                initialSceneId={selectedScene.id}
                editorMode={!readOnly}
                editorTargets={targets}
                onCreateLink={({ targetSceneId, yaw, pitch }) => addLink(targetSceneId, yaw, pitch)}
              />

              <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-bold text-slate-800 dark:text-white">Passages depuis cet espace</p><span className="text-[10px] text-slate-400">{tour.links.filter((link) => link.fromSceneId === selectedScene.id).length}</span></div>
                <div className="space-y-1.5">
                  {tour.links.filter((link) => link.fromSceneId === selectedScene.id).map((link) => {
                    const target = tour.scenes.find((scene) => scene.id === link.toSceneId);
                    return <div key={link.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[10px] dark:bg-slate-900"><span className="flex min-w-0 items-center gap-2 truncate"><DoorOpen className="h-3.5 w-3.5 shrink-0 text-indigo-500" />{target?.name ?? "Espace supprimé"}</span>{!readOnly && <button type="button" onClick={() => removeLink(link.id)} className="text-red-500 hover:text-red-700">Retirer</button>}</div>;
                  })}
                  {tour.links.filter((link) => link.fromSceneId === selectedScene.id).length === 0 && <p className="text-[10px] text-slate-500">Aucun passage. Ouvrez le mode édition, regardez vers une porte puis appuyez sur « Passage ».</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tour.scenes.length > 0 && !readOnly && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-[10px] text-slate-500 dark:bg-slate-900/40">
          <Plus className="h-3.5 w-3.5" />
          <span>Conseil : créez d'abord le couloir, puis ajoutez chaque chambre et reliez-les depuis les portes visibles dans les panoramas.</span>
        </div>
      )}
    </section>
  );
}
