/**
 * Level registry — build any THRESHOLD liminal map by id.
 */

import type { LevelBuildResult, LevelId } from "../types";
import type { LevelMaterialPack } from "../rendering";
import { buildBackroomsLevel } from "./backrooms";
import {
  createFallbackLighting,
  createFallbackMaterials,
  materialLibFromPack,
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
  materialLibFromPack,
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

/**
 * Build a complete level scene graph, colliders, lights, and meta.
 *
 * `materials` may be a full MaterialLib or a rendering LevelMaterialPack
 * (adapted via materialLibFromPack). Lighting defaults to PointLight helpers.
 */
export function buildLevel(
  id: LevelId,
  materials?: MaterialLib | LevelMaterialPack,
  lighting?: LightLib,
): LevelBuildResult {
  const mats = resolveMaterials(id, materials);
  const lights = lighting ?? createFallbackLighting();

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

function isMaterialLib(
  value: MaterialLib | LevelMaterialPack,
): value is MaterialLib {
  return (
    "exit" in value &&
    "metal" in value &&
    "lightPanel" in value &&
    "prop" in value
  );
}

function resolveMaterials(
  id: LevelId,
  materials?: MaterialLib | LevelMaterialPack,
): MaterialLib {
  if (!materials) return createFallbackMaterials(id);
  if (isMaterialLib(materials)) return materials;
  return materialLibFromPack(id, materials);
}
