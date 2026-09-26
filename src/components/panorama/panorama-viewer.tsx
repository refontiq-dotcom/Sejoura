"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  Compass,
  DoorOpen,
  Loader2,
  Map,
  Maximize2,
  Minus,
  Move3D,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import type { PanoramaInfoHotspot, PanoramaLink, PanoramaScene, PanoramaTour } from "@/types/panorama";
import { normalizePanoramaTour } from "@/types/panorama";
import { getPanoramaDeviceProfile, getNeighborScenes, preloadPanoramaPreviews } from "@/lib/panorama/runtime";

export interface PanoramaViewerProps {
  src: string;
  previewSrc?: string;
  title?: string;
  className?: string;
  tour?: PanoramaTour | null;
  initialSceneId?: string | null;
  editorMode?: boolean;
  editorTargets?: PanoramaScene[];
  onCreateLink?: (link: { targetSceneId: string; yaw: number; pitch: number }) => void;
  onCreateInfoHotspot?: (hotspot: { yaw: number; pitch: number }) => void;
}

function normalizeAngle(value: number) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function PanoramaViewer({
  src,
  previewSrc,
  title = "Visite 360°",
  className = "",
  tour,
  initialSceneId,
  editorMode = false,
  editorTargets = [],
  onCreateLink,
  onCreateInfoHotspot,
}: PanoramaViewerProps) {
  const normalizedTour = useMemo(() => normalizePanoramaTour(tour), [tour]);
  const hasTour = normalizedTour.scenes.length > 0;
  const fallbackScene: PanoramaScene = {
    id: "legacy",
    name: title,
    kind: "room",
    src,
    previewSrc: previewSrc ?? null,
  };
  const scenes = hasTour ? normalizedTour.scenes : [fallbackScene];
  const startId = initialSceneId && scenes.some((scene) => scene.id === initialSceneId)
    ? initialSceneId
    : normalizedTour.startSceneId && scenes.some((scene) => scene.id === normalizedTour.startSceneId)
      ? normalizedTour.startSceneId
      : scenes[0]?.id ?? "legacy";

  const [activeSceneId, setActiveSceneId] = useState(startId);
  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
  const activeSrc = activeScene?.src ?? src;
  const activePreview = activeScene?.previewSrc ?? previewSrc;
  const activeTitle = activeScene?.name ?? title;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<import("three").WebGLRenderer | null>(null);
  const sceneRef = useRef<import("three").Scene | null>(null);
  const cameraRef = useRef<import("three").PerspectiveCamera | null>(null);
  const meshRef = useRef<import("three").Mesh | null>(null);
  const geometryRef = useRef<import("three").SphereGeometry | null>(null);
  const materialRef = useRef<import("three").MeshBasicMaterial | null>(null);
  const textureRef = useRef<import("three").Texture | null>(null);
  const draggingRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(72);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [gyroscope, setGyroscope] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [selectedInfoHotspot, setSelectedInfoHotspot] = useState<PanoramaInfoHotspot | null>(null);
  const [, setViewTick] = useState(0);

  const render = useCallback(() => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  const setZoom = useCallback((value: number) => {
    const next = Math.min(95, Math.max(35, value));
    zoomRef.current = next;
    if (cameraRef.current) {
      cameraRef.current.fov = next;
      cameraRef.current.updateProjectionMatrix();
      render();
      setViewTick((tick) => tick + 1);
    }
  }, [render]);

  const resetView = useCallback(() => {
    rotationRef.current = { x: 0, y: 0 };
    zoomRef.current = 72;
    if (meshRef.current) meshRef.current.rotation.set(0, 0, 0);
    if (cameraRef.current) {
      cameraRef.current.fov = 72;
      cameraRef.current.updateProjectionMatrix();
    }
    render();
    setViewTick((tick) => tick + 1);
  }, [render]);

  const selectScene = useCallback((sceneId: string) => {
    if (!scenes.some((scene) => scene.id === sceneId)) return;
    setActiveSceneId(sceneId);
    rotationRef.current = { x: 0, y: 0 };
    zoomRef.current = 72;
    setShowScenes(false);
  }, [scenes]);

  useEffect(() => {
    if (!open || !hostRef.current) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    async function boot() {
      setLoading(true);
      setReady(false);
      setUnsupported(false);

      try {
        const THREE = await import("three");
        if (disposed || !hostRef.current) return;

        const host = hostRef.current;
        const canvas = document.createElement("canvas");
        canvas.className = "absolute inset-0 h-full w-full touch-none";
        canvas.setAttribute("aria-label", activeTitle);
        host.replaceChildren(canvas);

        let renderer: import("three").WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          });
        } catch {
          setUnsupported(true);
          setLoading(false);
          return;
        }

        const deviceProfile = getPanoramaDeviceProfile();
        renderer.setPixelRatio(deviceProfile.pixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x05070b, 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(zoomRef.current, 1, 0.01, 100);
        camera.position.set(0, 0, 0.01);

        const geometry = new THREE.SphereGeometry(10, deviceProfile.sphereWidthSegments, deviceProfile.sphereHeightSegments);
        geometry.scale(-1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;
        meshRef.current = mesh;
        geometryRef.current = geometry;
        materialRef.current = material;

        const resize = () => {
          if (!hostRef.current || !cameraRef.current || !rendererRef.current) return;
          const width = Math.max(1, hostRef.current.clientWidth);
          const height = Math.max(1, hostRef.current.clientHeight);
          rendererRef.current.setSize(width, height, false);
          cameraRef.current.aspect = width / height;
          cameraRef.current.updateProjectionMatrix();
          render();
          setViewTick((tick) => tick + 1);
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();

        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(
          activeSrc,
          (texture) => {
            if (disposed) {
              texture.dispose();
              return;
            }
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
            renderer.initTexture(texture);
            material.map = texture;
            material.needsUpdate = true;
            textureRef.current = texture;
            setLoading(false);
            setReady(true);
            render();
          },
          undefined,
          () => {
            if (!disposed) {
              setLoading(false);
              setUnsupported(true);
            }
          },
        );

        const onContextLost = (event: Event) => {
          event.preventDefault();
          setUnsupported(true);
        };
        canvas.addEventListener("webglcontextlost", onContextLost);

        return () => canvas.removeEventListener("webglcontextlost", onContextLost);
      } catch {
        if (!disposed) {
          setLoading(false);
          setUnsupported(true);
        }
      }
    }

    void boot();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      textureRef.current?.dispose();
      materialRef.current?.dispose();
      geometryRef.current?.dispose();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      meshRef.current = null;
      geometryRef.current = null;
      materialRef.current = null;
      textureRef.current = null;
    };
  }, [open, activeSrc, activeTitle, render]);

  useEffect(() => {
    if (!open || !hasTour || !activeSceneId) return;
    const profile = getPanoramaDeviceProfile();
    const neighbors = getNeighborScenes(normalizedTour, activeSceneId);
    preloadPanoramaPreviews(neighbors, profile.neighborPreviewLimit);
  }, [open, hasTour, activeSceneId, normalizedTour]);

  useEffect(() => {
    if (!open || !gyroscope) return;
    let active = true;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (!active) return;
      const alpha = event.alpha ?? 0;
      const beta = event.beta ?? 0;
      const gamma = event.gamma ?? 0;
      rotationRef.current.y = -THREE_DEG_TO_RAD(alpha);
      rotationRef.current.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, THREE_DEG_TO_RAD(beta - gamma)));
      if (meshRef.current) {
        meshRef.current.rotation.y = rotationRef.current.y;
        meshRef.current.rotation.x = rotationRef.current.x;
        render();
        setViewTick((tick) => tick + 1);
      }
    };
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => {
      active = false;
      window.removeEventListener("deviceorientation", onOrientation, true);
    };
  }, [open, gyroscope, render]);

  const requestGyroscope = async () => {
    try {
      const DeviceOrientationEventCtor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof DeviceOrientationEventCtor.requestPermission === "function") {
        const permission = await DeviceOrientationEventCtor.requestPermission();
        if (permission !== "granted") return;
      }
      setGyroscope(true);
    } catch {
      setGyroscope(false);
    }
  };

  const beginDrag = (clientX: number, clientY: number) => {
    draggingRef.current = true;
    pointerRef.current = { x: clientX, y: clientY };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!draggingRef.current || !meshRef.current) return;
    const dx = clientX - pointerRef.current.x;
    const dy = clientY - pointerRef.current.y;
    pointerRef.current = { x: clientX, y: clientY };
    rotationRef.current.y += dx * 0.005;
    rotationRef.current.x = Math.max(-1.45, Math.min(1.45, rotationRef.current.x + dy * 0.0035));
    meshRef.current.rotation.y = rotationRef.current.y;
    meshRef.current.rotation.x = rotationRef.current.x;
    render();
    setViewTick((tick) => tick + 1);
  };

  const endDrag = () => {
    draggingRef.current = false;
  };

  const enterFullscreen = async () => {
    const target = hostRef.current?.parentElement?.parentElement;
    if (!target) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch {
      // Certains navigateurs mobiles refusent le plein écran.
    }
  };

  const links = normalizedTour.links.filter((link) => link.fromSceneId === activeSceneId);
  const infoHotspots = activeScene?.infoHotspots ?? [];
  const visibleHotspots = links
    .map((link) => {
      const target = scenes.find((scene) => scene.id === link.toSceneId);
      if (!target || !cameraRef.current || !hostRef.current) return null;
      const aspect = Math.max(0.5, hostRef.current.clientWidth / Math.max(1, hostRef.current.clientHeight));
      const verticalFov = THREE_DEG_TO_RAD(zoomRef.current);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
      const relativeYaw = normalizeAngle(link.yaw - rotationRef.current.y);
      const relativePitch = link.pitch - rotationRef.current.x;
      const x = 50 + (Math.tan(relativeYaw) / Math.tan(horizontalFov / 2)) * 50;
      const y = 50 - (Math.tan(relativePitch) / Math.tan(verticalFov / 2)) * 50;
      const visible =
        Math.abs(relativeYaw) <= horizontalFov / 2 &&
        Math.abs(relativePitch) <= verticalFov / 2 &&
        x > 3 && x < 97 && y > 5 && y < 92;
      return visible ? { link, target, x, y } : null;
    })
    .filter((item): item is { link: PanoramaLink; target: PanoramaScene; x: number; y: number } => Boolean(item));

  const visibleInfoHotspots = infoHotspots
    .map((hotspot) => {
      if (!hostRef.current) return null;
      const aspect = Math.max(0.5, hostRef.current.clientWidth / Math.max(1, hostRef.current.clientHeight));
      const verticalFov = THREE_DEG_TO_RAD(zoomRef.current);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
      const relativeYaw = normalizeAngle(hotspot.yaw - rotationRef.current.y);
      const relativePitch = hotspot.pitch - rotationRef.current.x;
      const x = 50 + (Math.tan(relativeYaw) / Math.tan(horizontalFov / 2)) * 50;
      const y = 50 - (Math.tan(relativePitch) / Math.tan(verticalFov / 2)) * 50;
      const visible = Math.abs(relativeYaw) <= horizontalFov / 2 && Math.abs(relativePitch) <= verticalFov / 2 && x > 3 && x < 97 && y > 5 && y < 92;
      return visible ? { hotspot, x, y } : null;
    })
    .filter((item): item is { hotspot: PanoramaInfoHotspot; x: number; y: number } => Boolean(item));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-indigo-200 bg-slate-950 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${className}`}
        aria-label={`Ouvrir la visite 360° de ${title}`}
      >
        {activePreview && <span className="absolute inset-0 bg-cover bg-center opacity-45 transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${activePreview}")` }} />}
        <span className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-indigo-950/50" />
        <span className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"><Move3D className="h-5 w-5" /></span>
          <span>
            <span className="block text-sm font-bold text-white">Explorer en 360°</span>
            <span className="mt-0.5 block text-[11px] text-white/70">
              {hasTour ? "Déplacez-vous d'une pièce à l'autre" : "Glissez pour regarder autour de vous"}
            </span>
          </span>
        </span>
        <Maximize2 className="relative h-4 w-4 text-white/80" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
          <div className="relative h-full w-full overflow-hidden bg-slate-950 sm:h-[92vh] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-white/10">
            <div
              ref={hostRef}
              className="absolute inset-0 overflow-hidden bg-slate-950"
              onMouseDown={(e) => beginDrag(e.clientX, e.clientY)}
              onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
              onTouchStart={(e) => beginDrag(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={endDrag}
              onWheel={(e) => { e.preventDefault(); setZoom(zoomRef.current + e.deltaY * 0.04); }}
            >
              {activePreview && !ready && <div className="absolute inset-0 bg-cover bg-center opacity-55" style={{ backgroundImage: `url("${activePreview}")` }} />}
              <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55 pointer-events-none" />

              {ready && visibleInfoHotspots.map(({ hotspot, x, y }) => (
                <button
                  key={hotspot.id}
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setSelectedInfoHotspot(hotspot); }}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-amber-400/90 text-slate-950 shadow-xl backdrop-blur transition hover:scale-110"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  aria-label={hotspot.title}
                >
                  <span className="text-sm font-black">i</span>
                </button>
              ))}

              {ready && visibleHotspots.map(({ link, target, x, y }) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={(event) => { event.stopPropagation(); selectScene(target.id); }}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-indigo-600/90 px-3 py-2 text-[11px] font-semibold text-white shadow-xl backdrop-blur transition hover:scale-105 hover:bg-indigo-500"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  aria-label={`Aller vers ${target.name}`}
                >
                  <span className="flex items-center gap-1.5"><DoorOpen className="h-3.5 w-3.5" />{link.label || target.name}</span>
                </button>
              ))}
            </div>

            {selectedInfoHotspot && (
              <div className="absolute left-4 right-4 top-20 z-50 mx-auto max-w-md rounded-2xl border border-white/10 bg-black/75 p-4 text-white shadow-2xl backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{selectedInfoHotspot.title}</p>
                    {selectedInfoHotspot.description && <p className="mt-1 text-xs leading-5 text-white/75">{selectedInfoHotspot.description}</p>}
                  </div>
                  <button type="button" onClick={() => setSelectedInfoHotspot(null)} className="rounded-lg p-1 text-white/70 hover:bg-white/10" aria-label="Fermer"><X className="h-4 w-4" /></button>
                </div>
              </div>
            )}

            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 sm:p-5">
              <div className="rounded-2xl bg-black/50 px-4 py-2.5 text-white backdrop-blur-md">
                <p className="text-sm font-semibold">{activeTitle}</p>
                <p className="text-[10px] text-white/65">{hasTour ? "Visite interactive de l'établissement" : "Tournez, zoomez et explorez la chambre"}</p>
              </div>
              <div className="flex items-center gap-2">
                {hasTour && (
                  <button type="button" onClick={() => setShowScenes((value) => !value)} className="flex h-11 items-center gap-2 rounded-xl bg-black/50 px-3 text-white backdrop-blur-md" aria-label="Choisir une pièce">
                    <Map className="h-4 w-4" /><span className="hidden sm:inline">Pièces</span>
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20" aria-label="Fermer"><X className="h-5 w-5" /></button>
              </div>
            </div>

            {showScenes && hasTour && (
              <aside className="absolute right-4 top-20 z-40 w-[min(86vw,320px)] rounded-2xl border border-white/10 bg-black/70 p-3 text-white shadow-2xl backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold">Explorer les espaces</p><button type="button" onClick={() => setShowScenes(false)} aria-label="Fermer la liste"><X className="h-4 w-4" /></button></div>
                <div className="max-h-[55vh] space-y-1 overflow-y-auto">
                  {scenes.map((scene) => (
                    <button key={scene.id} type="button" onClick={() => selectScene(scene.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${scene.id === activeSceneId ? "bg-white/15" : "hover:bg-white/10"}`}>
                      {scene.previewSrc ? <img src={scene.previewSrc} alt="" className="h-11 w-14 rounded-lg object-cover" /> : <span className="flex h-11 w-14 items-center justify-center rounded-lg bg-white/10"><Compass className="h-4 w-4" /></span>}
                      <span className="min-w-0"><span className="block truncate text-xs font-semibold">{scene.name}</span><span className="block text-[10px] text-white/55">{scene.kind === "room" ? "Chambre" : scene.kind === "corridor" ? "Couloir" : scene.kind === "lobby" ? "Hall" : "Espace"}</span></span>
                    </button>
                  ))}
                </div>
              </aside>
            )}

            {loading && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-4 py-3 text-xs font-medium text-white backdrop-blur-md"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de la visite…</span></div>}

            {unsupported && (
              <div className="absolute left-1/2 top-1/2 w-[min(90%,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 text-center shadow-2xl">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                <p className="mt-2 text-sm font-bold text-slate-900">Visite 360° indisponible</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Votre appareil ne peut pas afficher cette visite interactive. Vous pouvez fermer cette fenêtre et consulter les photos classiques.</p>
              </div>
            )}

            <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-black/55 p-1.5 text-white backdrop-blur-md">
              {editorMode && onCreateLink && editorTargets.length > 0 && (
                <button type="button" onClick={() => setPlacementOpen((value) => !value)} className="flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-[10px] font-semibold hover:bg-indigo-500" aria-label="Ajouter un passage ici"><DoorOpen className="h-4 w-4" />Passage</button>
              )}
              <button type="button" onClick={() => setZoom(zoomRef.current + 5)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Zoomer"><Plus className="h-4 w-4" /></button>
              <button type="button" onClick={() => setZoom(zoomRef.current - 5)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Dézoomer"><Minus className="h-4 w-4" /></button>
              <button type="button" onClick={resetView} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Réinitialiser la vue"><RotateCcw className="h-4 w-4" /></button>
              <button type="button" onClick={requestGyroscope} className={`flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 ${gyroscope ? "bg-white/15" : ""}`} aria-label="Activer le mouvement du téléphone"><Move3D className="h-4 w-4" /></button>
              <button type="button" onClick={enterFullscreen} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Plein écran"><Maximize2 className="h-4 w-4" /></button>
            </div>

            {editorMode && placementOpen && onCreateLink && editorTargets.length > 0 && (
              <div className="absolute bottom-20 left-1/2 z-40 w-[min(90vw,360px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/80 p-3 text-white shadow-2xl backdrop-blur-xl">
                <p className="mb-2 text-xs font-bold">Vers quelle pièce voulez-vous créer le passage ?</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {editorTargets.filter((scene) => scene.id !== activeSceneId).map((scene) => (
                    <button key={scene.id} type="button" onClick={() => { onCreateLink({ targetSceneId: scene.id, yaw: rotationRef.current.y, pitch: rotationRef.current.x }); setPlacementOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10">
                      <DoorOpen className="h-4 w-4 shrink-0" />{scene.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasTour && links.length > 0 && ready && (
              <div className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-[10px] text-white/80 backdrop-blur">
                Touchez les passages pour avancer vers une autre pièce
              </div>
            )}

            {!loading && ready && !hasTour && (
              <div className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1.5 text-[10px] text-white/75 backdrop-blur">
                Glissez avec le doigt ou la souris pour regarder autour de vous
              </div>
            )}

            {hasTour && (
              <div className="absolute left-4 top-20 z-20 rounded-xl bg-black/45 px-3 py-2 text-white backdrop-blur-md">
                <div className="flex items-center gap-2 text-[10px] font-medium"><ChevronLeft className="h-3.5 w-3.5" />{activeScene?.name}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function THREE_DEG_TO_RAD(value: number) {
  return (value * Math.PI) / 180;
}
