"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, Check, Loader2, RotateCcw, Trash2, Upload, View } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Gestion de la visite 360° d'un type de chambre.
//
// CHOIX D'AFFICHAGE — PERFORMANCE
//   Un panorama 6000 × 3000 pèse plusieurs mégaoctets. L'interdiction de charger
//   automatiquement des panoramas haute résolution s'applique donc littéralement
//   ici : AUCUNE balise <img> n'est rendue. Le composant n'affiche que des
//   métadonnées (dimensions, poids, statut) et des actions. La visite n'est
//   consultable qu'au travers de la visionneuse de Trouvetou.
//
//   Conséquence : les photos classiques de la page ne sont jamais ralenties par
//   le système 360°.
//
// PRÉCONTRÔLES NAVIGATEUR — NON AUTORITÉ
//   Le ratio et la taille sont vérifiés ici pour une réponse immédiate à
//   l'utilisateur, mais c'est le SERVEUR qui fait autorité : ce composant
//   n'accepte jamais une décision, il affiche celle du serveur.
// ─────────────────────────────────────────────────────────────────────────────

type Panorama = {
  id: string;
  status: "uploaded" | "validated" | "published" | "rejected" | "superseded";
  public_url: string;
  width: number;
  height: number;
  content_type: string;
  byte_size: number;
  seam_delta: number | null;
  validation_error: string | null;
  created_at: string;
  published_at: string | null;
};

const MAX_BYTES = 40 * 1024 * 1024;

type Props = {
  roomTypeId: string;
  /** Lecture seule pour un compte réceptionniste. */
  isReadOnly?: boolean;
};

function humanizeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  }
  return `${Math.round(bytes / 1024)} Ko`;
}

/** Précontrôle local : message immédiat, jamais une autorisation. */
function precheck(file: File): string | null {
  if (file.size > MAX_BYTES) {
    return "Fichier trop volumineux. La taille maximale acceptée est 40 Mo.";
  }
  return null;
}

/** Jeton de session courant, ou null. */
async function accessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function PanoramaManager({ roomTypeId, isReadOnly }: Props) {
  const [panoramas, setPanoramas] = useState<Panorama[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadPanoramas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomTypeId]);

  /**
   * Charge l'état des visites 360° du type de chambre.
   *
   * Fonction simple, non mémoïsée : elle n'est appelée que depuis un effet et
   * depuis des gestionnaires d'événement, où une identité stable n'apporte rien.
   * Même pattern que le chargement de `residences/[id]/page.tsx`.
   */
  async function loadPanoramas() {
    try {
      const token = await accessToken();
      if (!token) return;
      const res = await fetch(
        `/api/v1/trouvetou/room-panoramas?roomTypeId=${encodeURIComponent(roomTypeId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const body = await res.json();
      setPanoramas(Array.isArray(body.panoramas) ? body.panoramas : []);
    } catch {
      // Échec de lecture : l'écran reste utilisable, il n'affichera simplement
      // aucune visite. L'upload signale de son côté ses propres erreurs.
    } finally {
      setLoading(false);
    }
  }

  /**
   * Upload avec progression réelle.
   *
   * `fetch` n'expose pas la progression d'envoi : on utilise XHR. La
   * progression n'est qu'un retour visuel — c'est la réponse du serveur qui
   * décide du résultat.
   */
  async function upload(file: File) {
    const localError = precheck(file);
    if (localError) {
      toast.error(localError);
      return;
    }

    const token = await accessToken();
    if (!token) {
      toast.error("Session expirée. Reconnectez-vous.");
      return;
    }

    const formData = new FormData();
    formData.append("panorama", file);
    formData.append("roomTypeId", roomTypeId);

    setProgress(0);
    try {
      const result = await new Promise<{ ok: boolean; body: unknown }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/v1/trouvetou/room-panoramas");
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded / event.total) * 100));
            }
          };
          xhr.onload = () => {
            let parsed: unknown = {};
            try {
              parsed = JSON.parse(xhr.responseText);
            } catch {
              parsed = {};
            }
            resolve({
              ok: xhr.status >= 200 && xhr.status < 300,
              body: parsed,
            });
          };
          xhr.onerror = () => reject(new Error("network"));
          xhr.send(formData);
        }
      );

      if (!result.ok) {
        const message =
          (result.body as { error?: string })?.error ??
          "L'envoi de la visite 360° a échoué.";
        toast.error(message);
        return;
      }

      toast.success("Visite 360° validée. Publiez-la pour la diffuser sur Trouvetou.");
      await loadPanoramas();
    } catch {
      toast.error("Erreur réseau lors de l'envoi. Réessayez.");
    } finally {
      setProgress(null);
    }
  }

  async function publish(id: string) {
    setPublishingId(id);
    try {
      const token = await accessToken();
      if (!token) return;
      const res = await fetch("/api/v1/trouvetou/room-panoramas/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ panoramaId: id, roomTypeId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Publication impossible.");
        return;
      }
      toast.success("Visite 360° publiée sur Trouvetou.");
      await loadPanoramas();
    } catch {
      toast.error("Erreur réseau lors de la publication.");
    } finally {
      setPublishingId(null);
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const token = await accessToken();
      if (!token) return;
      const res = await fetch(
        `/api/v1/trouvetou/room-panoramas?id=${encodeURIComponent(
          id
        )}&roomTypeId=${encodeURIComponent(roomTypeId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Suppression impossible.");
        return;
      }
      toast.success("Visite 360° supprimée.");
      await loadPanoramas();
    } catch {
      toast.error("Erreur réseau lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  }



  const published = panoramas.find((p) => p.status === "published") ?? null;
  const pending = panoramas.filter(
    (p) => p.status !== "published" && p.status !== "superseded"
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
          <View className="w-3.5 h-3.5" /> Visite 360°
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          Votre panorama doit être une image équirectangulaire 2:1. Elle est
          publiée telle quelle, sans retouche.
        </p>
      </div>

      {/* Format attendu */}
      <dl className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
          <dt className="text-slate-500 dark:text-slate-400">Format</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-100">JPG / PNG / WebP</dd>
        </div>
        <div className="rounded bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
          <dt className="text-slate-500 dark:text-slate-400">Ratio</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-100">2:1 (ex. 6000 × 3000)</dd>
        </div>
        <div className="rounded bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
          <dt className="text-slate-500 dark:text-slate-400">Résolution</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-100">≥ 3000 × 1500</dd>
        </div>
      </dl>

      {/* Visite publiée */}
      {published && (
        <div className="rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/20 p-2.5 space-y-1.5">
          <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Publiée sur Trouvetou
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            {published.width} × {published.height} px ·{" "}
            {humanizeBytes(published.byte_size)} ·{" "}
            {published.content_type.replace("image/", "").toUpperCase()}
          </p>
          {!isReadOnly && (
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Remplacer
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-600"
                onClick={() => remove(published.id)}
                disabled={deletingId === published.id}
              >
                {deletingId === published.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Supprimer
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Visites validées en attente de publication */}
      {pending.map((panorama) => (
        <div
          key={panorama.id}
          className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 p-2.5 space-y-1.5"
        >
          <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
            Validée, non publiée
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            {panorama.width} × {panorama.height} px · {humanizeBytes(panorama.byte_size)}
          </p>
          {!isReadOnly && (
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={() => publish(panorama.id)}
                disabled={publishingId === panorama.id}
              >
                {publishingId === panorama.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                Publier
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-600"
                onClick={() => remove(panorama.id)}
                disabled={deletingId === panorama.id}
              >
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </Button>
            </div>
          )}
        </div>
      ))}

      {/* Zone de dépôt */}
      {!isReadOnly && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) upload(file);
          }}
          className={`rounded-md border border-dashed p-4 text-center transition-colors ${
            dragging
              ? "border-[var(--primary-color,#0C1C33)] bg-slate-50 dark:bg-slate-800"
              : "border-slate-300 dark:border-slate-600"
          }`}
        >
          {progress === null ? (
            <>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Déposez une photo 360° ici, ou
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" /> Choisir un fichier
              </Button>
            </>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Envoi et validation en cours… {progress} %
              </p>
              <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-[var(--primary-color,#0C1C33)] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Le fichier est décodé et vérifié côté serveur avant d&apos;être
                enregistré.
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {!loading && !published && pending.length === 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          Aucune visite 360°. La diffusion reste possible avec vos photos
          classiques.
        </p>
      )}

      <p className="text-[10px] text-slate-400 dark:text-slate-500">
        Séjoura vérifie le format, le ratio 2:1 et la résolution. Il ne peut pas
        prouver que l&apos;image provient d&apos;une caméra 360° : une photo plate
        recadrée en 2:1 passerait ces contrôles. Aucune retouche automatique
        n&apos;est appliquée.
      </p>
    </div>
  );
}

