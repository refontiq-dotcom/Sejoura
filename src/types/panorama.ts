export type PanoramaSceneKind = "room" | "corridor" | "lobby" | "other";

export interface PanoramaScene {
  id: string;
  name: string;
  kind: PanoramaSceneKind;
  src: string;
  previewSrc?: string | null;
  roomTypeId?: string | null;
  isStart?: boolean;
}

export interface PanoramaLink {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  yaw: number;
  pitch: number;
  label: string;
}

export interface PanoramaTour {
  version: 1;
  startSceneId: string | null;
  scenes: PanoramaScene[];
  links: PanoramaLink[];
}

export const EMPTY_PANORAMA_TOUR: PanoramaTour = {
  version: 1,
  startSceneId: null,
  scenes: [],
  links: [],
};

export function normalizePanoramaTour(value: unknown): PanoramaTour {
  if (!value || typeof value !== "object") return EMPTY_PANORAMA_TOUR;
  const raw = value as Record<string, unknown>;
  const scenes = Array.isArray(raw.scenes) ? raw.scenes.filter(isScene) : [];
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const links = Array.isArray(raw.links)
    ? raw.links.filter(isLink).filter((link) => sceneIds.has(link.fromSceneId) && sceneIds.has(link.toSceneId))
    : [];
  const startSceneId =
    typeof raw.startSceneId === "string" && sceneIds.has(raw.startSceneId)
      ? raw.startSceneId
      : scenes.find((scene) => scene.isStart)?.id ?? scenes[0]?.id ?? null;
  return { version: 1, startSceneId, scenes, links };
}

function isScene(value: unknown): value is PanoramaScene {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.src === "string" &&
    (v.kind === "room" || v.kind === "corridor" || v.kind === "lobby" || v.kind === "other");
}

function isLink(value: unknown): value is PanoramaLink {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.fromSceneId === "string" && typeof v.toSceneId === "string" &&
    typeof v.yaw === "number" && typeof v.pitch === "number" && typeof v.label === "string";
}
