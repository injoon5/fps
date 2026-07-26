/**
 * Level registry — build any THRESHOLD liminal map by id.
 */

import type { LevelBuildResult, LevelId } from "../types";
import { buildBackroomsLevel } from "./backrooms";
import {
  createFallbackLighting,
  createFallbackMaterials,
  type LightLib,
  type MaterialLib,
  type ThemeId,
} from "./geometry";
import { buildHotelLevel } from "./hotel";
import { buildMartLevel } from "./mart";

export type { MaterialLib, LightLib, ThemeId };
export {
  createFallbackMaterials,
  createFallbackLighting,
  GeometryBatcher,
  addRoom,
  addBoxWall,
  addDoorFrame,
  addCeilingLights,
  addPillar,
  mergeAABBs,
} from "./geometry";

export { buildBackroomsLevel } from "./backrooms";
export { buildMartLevel } from "./mart";
export { buildHotelLevel } from "./hotel";

function materialsFor(
  id: LevelId,
  materials?: MaterialLib,
): MaterialLib {
  if (materials) return materials;
  return createFallbackMaterials(id);
}

function lightingFor(lighting?: LightLib): LightLib {
  return lighting ?? createFallbackLighting();
}

/**
 * Build a complete level scene graph, colliders, lights, and meta.
 * Pass `materials` / `lighting` from `../rendering` when available;
 * otherwise Kane Pixel fallback libs are used.
 */
export function buildLevel(
  id: LevelId,
  materials?: MaterialLib,
  lighting?: LightLib,
): LevelBuildResult {
  const mats = materialsFor(id, materials);
  const lights = lightingFor(lighting);

  switch (id) {
    case "backrooms":
      return buildBackroomsLevel(mats, lights);
    case "mart":
      return buildMartLevel(mats, lights);
    case "hotel":
      return buildHotelLevel(mats, lights);
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown level id: ${String(_exhaustive)}`);
    }
  }
}
