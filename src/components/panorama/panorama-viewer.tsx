"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw, X, Move3D, AlertTriangle, Loader2 } from "lucide-react";

export interface PanoramaViewerProps {
  src: string;
  previewSrc?: string;
  title?: string;
  className?: string;
}

export function PanoramaViewer({ src, previewSrc, title = "Visite 360°", className = "" }: PanoramaViewerProps) {
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

  const render = useCallback(() => {
    rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
  }, []);

  const setZoom = useCallback((value: number) => {
    const next = Math.min(95, Math.max(35, value));
    zoomRef.current = next;
    if (cameraRef.current) {
      cameraRef.current.fov = next;
      cameraRef.current.updateProjectionMatrix();
      render();
    }
  }, [render]);

  const openViewer = useCallback(() => setOpen(true), []);

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
        canvas.setAttribute("aria-label", title);
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

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x05070b, 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(zoomRef.current, 1, 0.01, 100);
        camera.position.set(0, 0, 0.01);

        const geometry = new THREE.SphereGeometry(10, 64, 32);
        geometry.scale(-1, 1, 1);

        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.FrontSide,
        });
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
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();

        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(
          src,
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
          }
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
  }, [open, src, title, render]);

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
  };

  const endDrag = () => {
    draggingRef.current = false;
  };

  const resetView = () => {
    rotationRef.current = { x: 0, y: 0 };
    zoomRef.current = 72;
    if (meshRef.current) meshRef.current.rotation.set(0, 0, 0);
    if (cameraRef.current) {
      cameraRef.current.fov = 72;
      cameraRef.current.updateProjectionMatrix();
    }
    render();
  };

  const enterFullscreen = async () => {
    const target = hostRef.current?.parentElement?.parentElement;
    if (!target) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch {
      // Le bouton reste fonctionnel même si le navigateur refuse le plein écran.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openViewer}
        className={`group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-indigo-200 bg-slate-950 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${className}`}
        aria-label={`Ouvrir la visite 360° de ${title}`}
      >
        {previewSrc && (
          <span className="absolute inset-0 bg-cover bg-center opacity-45 transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${previewSrc}")` }} />
        )}
        <span className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-indigo-950/50" />
        <span className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
            <Move3D className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-bold text-white">Explorer en 360°</span>
            <span className="mt-0.5 block text-[11px] text-white/70">Glissez pour regarder autour de vous</span>
          </span>
        </span>
        <Maximize2 className="relative h-4 w-4 text-white/80" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
          <div className="relative h-full w-full overflow-hidden bg-slate-950 sm:h-[92vh] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-white/10">
            <div ref={hostRef} className="absolute inset-0 overflow-hidden bg-slate-950" onMouseDown={(e) => beginDrag(e.clientX, e.clientY)} onMouseMove={(e) => moveDrag(e.clientX, e.clientY)} onMouseUp={endDrag} onMouseLeave={endDrag} onTouchStart={(e) => beginDrag(e.touches[0].clientX, e.touches[0].clientY)} onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)} onTouchEnd={endDrag} onWheel={(e) => { e.preventDefault(); setZoom(zoomRef.current + e.deltaY * 0.04); }}>
              {previewSrc && !ready && <div className="absolute inset-0 bg-cover bg-center opacity-55" style={{ backgroundImage: `url("${previewSrc}")` }} />}
              <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55 pointer-events-none" />
            </div>

            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 sm:p-5">
              <div className="rounded-2xl bg-black/45 px-4 py-2.5 text-white backdrop-blur-md">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-[10px] text-white/65">Tournez, zoomez et explorez la chambre</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-4 py-3 text-xs font-medium text-white backdrop-blur-md">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de la visite…</span>
              </div>
            )}

            {unsupported && (
              <div className="absolute left-1/2 top-1/2 w-[min(90%,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 text-center shadow-2xl">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                <p className="mt-2 text-sm font-bold text-slate-900">Visite 360° indisponible</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Votre appareil ne peut pas afficher cette visite interactive. Vous pouvez fermer cette fenêtre et consulter les photos classiques.</p>
              </div>
            )}

            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-black/55 p-1.5 text-white backdrop-blur-md">
              <button type="button" onClick={() => setZoom(zoomRef.current + 5)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Zoomer"><Plus className="h-4 w-4" /></button>
              <button type="button" onClick={() => setZoom(zoomRef.current - 5)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Dézoomer"><Minus className="h-4 w-4" /></button>
              <button type="button" onClick={resetView} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Réinitialiser la vue"><RotateCcw className="h-4 w-4" /></button>
              <button type="button" onClick={requestGyroscope} className={`flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 ${gyroscope ? "bg-white/15" : ""}`} aria-label="Activer le mouvement du téléphone"><Move3D className="h-4 w-4" /></button>
              <button type="button" onClick={enterFullscreen} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Plein écran"><Maximize2 className="h-4 w-4" /></button>
            </div>

            {!loading && ready && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1.5 text-[10px] text-white/75 backdrop-blur">
                Glissez avec le doigt ou la souris pour regarder autour de vous
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
