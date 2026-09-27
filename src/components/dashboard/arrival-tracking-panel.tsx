"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CarFront, Map, Navigation, Clock3, Radio, X } from "lucide-react";

type Arrival = {
  id: string; booking_id: string; booking_code: string | null; client_name: string;
  accommodation_name: string; latitude: number | null; longitude: number | null;
  destination_latitude: number | null; destination_longitude: number | null;
  distance_km: number | null; eta_minutes: number | null; accuracy: number | null;
  speed_kmh: number | null; last_updated_at: string | null;
};

function formatDistance(km: number | null) {
  if (km == null) return "Distance indisponible";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function formatUpdated(value: string | null) {
  if (!value) return "en attente";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "à l’instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  return `il y a ${Math.round(seconds / 60)} min`;
}

export function ArrivalTrackingPanel({ accommodationId }: { accommodationId?: string | null }) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [mapArrival, setMapArrival] = useState<Arrival | null>(null);

  async function load() {
    try {
      const query = accommodationId ? `?accommodationId=${encodeURIComponent(accommodationId)}` : "";
      const res = await fetch(`/api/arrival-tracking${query}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setArrivals(Array.isArray(json.arrivals) ? json.arrivals : []);
    } catch {
      // Le suivi est secondaire : une erreur réseau ne doit pas bloquer les réservations.
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, 10000);
    return () => window.clearInterval(id);
  }, [accommodationId]);

  const mapUrl = useMemo(() => {
    if (!mapArrival?.latitude || !mapArrival?.longitude || !mapArrival.destination_latitude || !mapArrival.destination_longitude) return null;
    const minLat = Math.min(mapArrival.latitude, mapArrival.destination_latitude);
    const maxLat = Math.max(mapArrival.latitude, mapArrival.destination_latitude);
    const minLon = Math.min(mapArrival.longitude, mapArrival.destination_longitude);
    const maxLon = Math.max(mapArrival.longitude, mapArrival.destination_longitude);
    const padLat = Math.max((maxLat - minLat) * 0.35, 0.004);
    const padLon = Math.max((maxLon - minLon) * 0.35, 0.004);
    const bbox = `${minLon - padLon},${minLat - padLat},${maxLon + padLon},${maxLat + padLat}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${mapArrival.latitude},${mapArrival.longitude}`;
  }, [mapArrival]);

  if (arrivals.length === 0) return null;

  return (
    <>
      <Card className="border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-3 md:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white"><Radio className="h-4 w-4" /></span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Clients en route</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{arrivals.length} arrivée{arrivals.length > 1 ? "s" : ""} suivie{arrivals.length > 1 ? "s" : ""}</p>
            </div>
          </div>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300">mise à jour automatique</span>
        </div>

        <div className="grid gap-2">
          {arrivals.map((arrival) => (
            <div key={arrival.id} className="rounded-xl border border-emerald-200/70 bg-white/80 dark:border-emerald-900/40 dark:bg-slate-950/40 p-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--primary-color,#0C1C33)] text-white flex items-center justify-center"><CarFront className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{arrival.client_name}</p>
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{arrival.booking_code ?? "Réservation"} · {arrival.accommodation_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{arrival.eta_minutes != null ? `≈ ${arrival.eta_minutes} min` : "—"}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDistance(arrival.distance_km)}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatUpdated(arrival.last_updated_at)}</span>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setMapArrival(arrival)}>
                  <Map className="h-3.5 w-3.5" /> Voir la carte
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={Boolean(mapArrival)} onClose={() => setMapArrival(null)} title={mapArrival ? `Arrivée de ${mapArrival.client_name}` : "Carte"} size="lg">
        {mapArrival && mapUrl ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Distance</p><p className="font-semibold">{formatDistance(mapArrival.distance_km)}</p></div>
              <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Arrivée estimée</p><p className="font-semibold">{mapArrival.eta_minutes != null ? `≈ ${mapArrival.eta_minutes} min` : "—"}</p></div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-muted">
              <iframe title="Position du client" src={mapUrl} className="h-[55vh] min-h-[320px] w-full border-0" loading="lazy" />
            </div>
            <p className="text-[11px] text-muted-foreground">Carte fournie par OpenStreetMap. Elle n’est chargée que lorsque vous demandez à voir la position.</p>
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">Coordonnées de carte indisponibles pour cette arrivée.</div>
        )}
        <div className="mt-3 flex justify-end"><Button variant="outline" onClick={() => setMapArrival(null)}><X className="h-4 w-4" /> Fermer</Button></div>
      </Modal>
    </>
  );
}