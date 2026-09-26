export type PanoramaSceneKind = "room" | "corridor" | "lobby" | "other";

export interface PanoramaInfoHotspot {
  id: string;
  sceneId: string;
  yaw: number;
  pitch: number;
  title: string;
  description?: string | null;
}

export interface PanoramaScene {
  id: string;
  name: string;
  kind: PanoramaSceneKind;
  src: string;
  previewSrc?: string | null;
  roomTypeId?: string | null;
  isStart?: boolean;
  isPublished?: boolean;
  infoHotspots?: PanoramaInfoHotspot[];
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

export interface PanoramaValidationIssue {
  code:
    | "empty_tour"
    | "duplicate_scene_id"
    | "invalid_scene"
    | "invalid_scene_name"
    | "invalid_scene_src"
    | "invalid_start_scene"
    | "unpublished_start_scene"
    | "duplicate_link_id"
    | "duplicate_link"
    | "orphan_link"
    | "invalid_angle"
    | "invalid_hotspot"
    | "duplicate_hotspot_id"
    | "duplicate_hotspot_position"
    | "orphan_hotspot"
    | "isolated_scene";
  message: string;
  sceneId?: string;
  linkId?: string;
  hotspotId?: string;
}

export const EMPTY_PANORAMA_TOUR: PanoramaTour = {
  version: 1,
  startSceneId: null,
  scenes: [],
  links: [],
};

const SCENE_NAME_MAX = 120;
const HOTSPOT_TITLE_MAX = 100;
const HOTSPOT_DESCRIPTION_MAX = 500;
const PITCH_MIN = -Math.PI / 2;
const PITCH_MAX = Math.PI / 2;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeYaw(value: number): number {
  const fullTurn = Math.PI * 2;
  let result = value % fullTurn;
  if (result > Math.PI) result -= fullTurn;
  if (result < -Math.PI) result += fullTurn;
  return result;
}

function validAngle(yaw: unknown, pitch: unknown): yaw is number {
  return finite(yaw) && finite(pitch) && pitch >= PITCH_MIN && pitch <= PITCH_MAX;
}

function isScene(value: unknown): value is PanoramaScene {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.trim().length > 0 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= SCENE_NAME_MAX &&
    typeof v.src === "string" &&
    v.src.trim().length > 0 &&
    (v.kind === "room" || v.kind === "corridor" || v.kind === "lobby" || v.kind === "other")
  );
}

function isInfoHotspot(value: unknown): value is PanoramaInfoHotspot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.trim().length > 0 &&
    typeof v.sceneId === "string" &&
    v.sceneId.trim().length > 0 &&
    validAngle(v.yaw, v.pitch) &&
    typeof v.title === "string" &&
    v.title.trim().length > 0 &&
    v.title.length <= HOTSPOT_TITLE_MAX &&
    (v.description == null || (typeof v.description === "string" && v.description.length <= HOTSPOT_DESCRIPTION_MAX))
  );
}

function isLink(value: unknown): value is PanoramaLink {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.trim().length > 0 &&
    typeof v.fromSceneId === "string" &&
    v.fromSceneId.trim().length > 0 &&
    typeof v.toSceneId === "string" &&
    v.toSceneId.trim().length > 0 &&
    v.fromSceneId !== v.toSceneId &&
    validAngle(v.yaw, v.pitch) &&
    typeof v.label === "string" &&
    v.label.length <= SCENE_NAME_MAX
  );
}

export function normalizePanoramaTour(value: unknown): PanoramaTour {
  if (!value || typeof value !== "object") return { ...EMPTY_PANORAMA_TOUR };

  const raw = value as Record<string, unknown>;
  const sourceScenes = Array.isArray(raw.scenes) ? raw.scenes.filter(isScene) : [];
  const seenSceneIds = new Set<string>();
  const scenes: PanoramaScene[] = [];

  for (const scene of sourceScenes) {
    if (seenSceneIds.has(scene.id)) continue;
    seenSceneIds.add(scene.id);
    const rawHotspots = Array.isArray(scene.infoHotspots) ? scene.infoHotspots : [];
    const hotspots = rawHotspots
      .filter(isInfoHotspot)
      .filter((hotspot) => hotspot.sceneId === scene.id)
      .filter((hotspot, index, all) => all.findIndex((candidate) => candidate.id === hotspot.id) === index)
      .map((hotspot) => ({
        ...hotspot,
        yaw: normalizeYaw(hotspot.yaw),
        pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, hotspot.pitch)),
      }));

    scenes.push({
      ...scene,
      id: scene.id.trim(),
      name: scene.name.trim(),
      src: scene.src.trim(),
      previewSrc: typeof scene.previewSrc === "string" ? scene.previewSrc.trim() || null : null,
      roomTypeId: typeof scene.roomTypeId === "string" ? scene.roomTypeId : null,
      isStart: Boolean(scene.isStart),
      isPublished: scene.isPublished !== false,
      infoHotspots: hotspots,
    });
  }

  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const linkIds = new Set<string>();
  const linkPairs = new Set<string>();
  const links = (Array.isArray(raw.links) ? raw.links : [])
    .filter(isLink)
    .filter((link) => sceneIds.has(link.fromSceneId) && sceneIds.has(link.toSceneId))
    .filter((link) => {
      if (linkIds.has(link.id)) return false;
      const pair = link.fromSceneId + "::" + link.toSceneId;
      if (linkPairs.has(pair)) return false;
      linkIds.add(link.id);
      linkPairs.add(pair);
      return true;
    })
    .map((link) => ({
      ...link,
      yaw: normalizeYaw(link.yaw),
      pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, link.pitch)),
      label: link.label.trim(),
    }));

  const requestedStart = typeof raw.startSceneId === "string" ? raw.startSceneId : null;
  const startSceneId =
    requestedStart && sceneIds.has(requestedStart)
      ? requestedStart
      : scenes.find((scene) => scene.isStart)?.id ?? scenes[0]?.id ?? null;

  return {
    version: 1,
    startSceneId,
    scenes: scenes.map((scene) => ({ ...scene, isStart: scene.id === startSceneId })),
    links,
  };
}

export function validatePanoramaTour(value: unknown, options?: { requirePublishedStart?: boolean }): PanoramaValidationIssue[] {
  const issues: PanoramaValidationIssue[] = [];
  const requirePublishedStart = options?.requirePublishedStart ?? false;

  if (!value || typeof value !== "object") {
    return [{ code: "empty_tour", message: "La visite 360° doit être un objet valide." }];
  }

  const raw = value as Record<string, unknown>;
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const scenes = rawScenes.filter(isScene);
  const sceneIds = new Set<string>();

  if (rawScenes.length === 0) {
    issues.push({ code: "empty_tour", message: "La visite ne contient aucune scène." });
  }

  for (const rawScene of rawScenes) {
    if (!isScene(rawScene)) {
      issues.push({ code: "invalid_scene", message: "Une scène est invalide." });
      continue;
    }
    if (sceneIds.has(rawScene.id)) {
      issues.push({ code: "duplicate_scene_id", sceneId: rawScene.id, message: "L'identifiant de scène est dupliqué." });
    }
    sceneIds.add(rawScene.id);

    if (rawScene.name.trim().length === 0 || rawScene.name.length > SCENE_NAME_MAX) {
      issues.push({ code: "invalid_scene_name", sceneId: rawScene.id, message: "Le nom de scène doit contenir 1 à 120 caractères." });
    }
    if (rawScene.src.trim().length === 0) {
      issues.push({ code: "invalid_scene_src", sceneId: rawScene.id, message: "La scène doit avoir une URL de panorama." });
    }

    const hotspots = Array.isArray(rawScene.infoHotspots) ? rawScene.infoHotspots : [];
    const hotspotIds = new Set<string>();
    const hotspotPositions = new Set<string>();
    for (const rawHotspot of hotspots) {
      if (!isInfoHotspot(rawHotspot) || rawHotspot.sceneId !== rawScene.id) {
        issues.push({ code: "invalid_hotspot", sceneId: rawScene.id, message: "Un hotspot d'information est invalide." });
        continue;
      }
      if (hotspotIds.has(rawHotspot.id)) {
        issues.push({ code: "duplicate_hotspot_id", sceneId: rawScene.id, hotspotId: rawHotspot.id, message: "L'identifiant du hotspot est dupliqué." });
      }
      hotspotIds.add(rawHotspot.id);
      const position = rawHotspot.yaw.toFixed(5) + ":" + rawHotspot.pitch.toFixed(5);
      if (hotspotPositions.has(position)) {
        issues.push({ code: "duplicate_hotspot_position", sceneId: rawScene.id, hotspotId: rawHotspot.id, message: "Deux hotspots occupent la même position." });
      }
      hotspotPositions.add(position);
    }
  }

  const startSceneId = typeof raw.startSceneId === "string" ? raw.startSceneId : null;
  if (!startSceneId || !sceneIds.has(startSceneId)) {
    issues.push({ code: "invalid_start_scene", message: "La scène de départ doit correspondre à une scène existante." });
  } else if (requirePublishedStart) {
    const start = scenes.find((scene) => scene.id === startSceneId);
    if (start && start.isPublished === false) {
      issues.push({ code: "unpublished_start_scene", sceneId: startSceneId, message: "La scène de départ doit être publiée." });
    }
  }

  const linkIds = new Set<string>();
  const linkPairs = new Set<string>();
  for (const rawLink of Array.isArray(raw.links) ? raw.links : []) {
    if (!isLink(rawLink)) {
      issues.push({ code: "invalid_angle", message: "Un passage contient des coordonnées invalides." });
      continue;
    }
    if (linkIds.has(rawLink.id)) {
      issues.push({ code: "duplicate_link_id", linkId: rawLink.id, message: "L'identifiant du passage est dupliqué." });
    }
    linkIds.add(rawLink.id);

    if (!sceneIds.has(rawLink.fromSceneId) || !sceneIds.has(rawLink.toSceneId)) {
      issues.push({ code: "orphan_link", linkId: rawLink.id, message: "Le passage pointe vers une scène inexistante." });
    }
    if (!validAngle(rawLink.yaw, rawLink.pitch)) {
      issues.push({ code: "invalid_angle", linkId: rawLink.id, message: "La position du passage est invalide." });
    }
    const pair = rawLink.fromSceneId + "::" + rawLink.toSceneId;
    if (linkPairs.has(pair)) {
      issues.push({ code: "duplicate_link", linkId: rawLink.id, message: "Deux passages identiques existent entre les mêmes scènes." });
    }
    linkPairs.add(pair);
  }

  if (scenes.length > 1 && startSceneId && sceneIds.has(startSceneId)) {
    const adjacency = new Map<string, string[]>();
    for (const scene of scenes) adjacency.set(scene.id, []);
    for (const link of Array.isArray(raw.links) ? raw.links.filter(isLink) : []) {
      if (sceneIds.has(link.fromSceneId) && sceneIds.has(link.toSceneId)) {
        adjacency.get(link.fromSceneId)?.push(link.toSceneId);
        adjacency.get(link.toSceneId)?.push(link.fromSceneId);
      }
    }
    const visited = new Set<string>([startSceneId]);
    const queue = [startSceneId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    for (const scene of scenes) {
      if (!visited.has(scene.id)) {
        issues.push({ code: "isolated_scene", sceneId: scene.id, message: "Cette scène n'est pas accessible depuis la scène de départ." });
      }
    }
  }

  return issues;
}
