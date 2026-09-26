import type { PanoramaScene, PanoramaTour } from "@/types/panorama";

export type PanoramaDeviceTier = "weak" | "medium" | "strong";

export interface PanoramaDeviceProfile {
  tier: PanoramaDeviceTier;
  pixelRatio: number;
  sphereWidthSegments: number;
  sphereHeightSegments: number;
  neighborPreviewLimit: number;
  neighborHdLimit: number;
}

export function getPanoramaDeviceProfile(): PanoramaDeviceProfile {
  if (typeof window === "undefined") {
    return { tier: "medium", pixelRatio: 1.25, sphereWidthSegments: 48, sphereHeightSegments: 24, neighborPreviewLimit: 1, neighborHdLimit: 1 };
  }

  const memory = typeof navigator !== "undefined" && "deviceMemory" in navigator
    ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4)
    : 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = window.devicePixelRatio || 1;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 480;

  if (memory <= 2 || cores <= 2 || (smallViewport && memory <= 4)) {
    return { tier: "weak", pixelRatio: Math.min(dpr, 1.15), sphereWidthSegments: 32, sphereHeightSegments: 16, neighborPreviewLimit: 1, neighborHdLimit: 0 };
  }

  if (memory <= 4 || cores <= 4 || dpr > 2.5) {
    return { tier: "medium", pixelRatio: Math.min(dpr, 1.5), sphereWidthSegments: 48, sphereHeightSegments: 24, neighborPreviewLimit: 2, neighborHdLimit: 1 };
  }

  return { tier: "strong", pixelRatio: Math.min(dpr, 2), sphereWidthSegments: 64, sphereHeightSegments: 32, neighborPreviewLimit: 2, neighborHdLimit: 2 };
}

export function getNeighborScenes(tour: PanoramaTour | null | undefined, sceneId: string): PanoramaScene[] {
  if (!tour) return [];
  const directIds = new Set<string>();
  for (const link of tour.links) {
    if (link.fromSceneId === sceneId) directIds.add(link.toSceneId);
    if (link.toSceneId === sceneId) directIds.add(link.fromSceneId);
  }
  return tour.scenes.filter((scene) => directIds.has(scene.id) && scene.id !== sceneId && scene.isPublished !== false);
}

const previewCache = new Map<string, HTMLImageElement>();
const MAX_PREVIEW_CACHE = 3;

function rememberPreview(url: string, image: HTMLImageElement) {
  previewCache.delete(url);
  previewCache.set(url, image);
  while (previewCache.size > MAX_PREVIEW_CACHE) {
    const oldest = previewCache.keys().next().value;
    if (oldest) previewCache.delete(oldest);
  }
}

export function preloadPanoramaPreviews(scenes: PanoramaScene[], limit: number): void {
  if (typeof window === "undefined" || limit <= 0) return;
  scenes.slice(0, limit).forEach((scene) => {
    const url = scene.previewSrc || scene.src;
    if (!url || previewCache.has(url)) return;
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.onload = () => rememberPreview(url, image);
    image.src = url;
  });
}
