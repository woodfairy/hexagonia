import type { MatchSnapshot, Resource } from "@hexagonia/shared";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { UltraTerrainTextureBundle } from "./boardUltraTerrain";
import { TILE_COLORS } from "./boardVisuals";

type TerrainTile = MatchSnapshot["board"]["tiles"][number];
type TerrainVertex = MatchSnapshot["board"]["vertices"][number];
type TerrainEdge = MatchSnapshot["board"]["edges"][number];
type TerrainResource = Resource | "desert";

interface TerrainPoint {
  x: number;
  z: number;
}

interface TerrainFeature {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  amplitude: number;
  rotation: number;
}

interface TerrainBiomeRecipe {
  baseColor: string;
  coverColor: string;
  accentColor: string;
  roughness: number;
  metalness: number;
  coverKind: "grassPatch" | "wheatPatch" | "tree" | "rockCluster" | "clay" | "dune";
  coverCount: number;
  coverMinScale: number;
  coverMaxScale: number;
  coverFootprint: number;
  coverSpacing: number;
  coverEdgePadding: number;
  featureCount: number;
  pathDepth: number;
}

interface TerrainBiomeState {
  recipe: TerrainBiomeRecipe;
  seed: number;
  primaryAngle: number;
  secondaryAngle: number;
  features: TerrainFeature[];
}

export interface TerrainStructureMask {
  roads: Array<{
    start: TerrainPoint;
    end: TerrainPoint;
    width: number;
    falloff: number;
  }>;
  buildings: Array<{
    x: number;
    z: number;
    radius: number;
    falloff: number;
  }>;
}

export interface TileTerrainSurfaceBundle {
  object: THREE.Group;
  sampleHeight: (offsetX: number, offsetZ: number) => number;
  centerHeight: number;
  maxHeight: number;
}

interface CreateTileTerrainSurfaceParams {
  tile: TerrainTile;
  verticesById: Map<string, TerrainVertex>;
  boardEdges: readonly TerrainEdge[];
  boardVertices: readonly TerrainVertex[];
  active: boolean;
  textured: boolean;
  terrainBundle?: UltraTerrainTextureBundle;
  tileScale: number;
  baseY: number;
}

interface TerrainPolygon {
  points: TerrainPoint[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  scale: number;
}

const SHARED_RESOURCE_FLAG = "__sharedResource";
const SURFACE_GRID_RESOLUTION = 34;
const COVER_ATTEMPT_MULTIPLIER = 9;

const BIOME_RECIPES: Record<TerrainResource, TerrainBiomeRecipe> = {
  wool: {
    baseColor: tintColor(TILE_COLORS.wool, -0.03),
    coverColor: "#5b993a",
    accentColor: "#97cb68",
    roughness: 0.82,
    metalness: 0.01,
    coverKind: "grassPatch",
    coverCount: 420,
    coverMinScale: 0.72,
    coverMaxScale: 1.48,
    coverFootprint: 0.11,
    coverSpacing: 0.42,
    coverEdgePadding: 0.05,
    featureCount: 14,
    pathDepth: 0.022
  },
  grain: {
    baseColor: tintColor(TILE_COLORS.grain, -0.04),
    coverColor: "#d6b256",
    accentColor: "#f1d886",
    roughness: 0.78,
    metalness: 0.01,
    coverKind: "wheatPatch",
    coverCount: 180,
    coverMinScale: 0.82,
    coverMaxScale: 1.46,
    coverFootprint: 0.16,
    coverSpacing: 0.66,
    coverEdgePadding: 0.06,
    featureCount: 10,
    pathDepth: 0.016
  },
  lumber: {
    baseColor: tintColor(TILE_COLORS.lumber, -0.02),
    coverColor: "#2e6c2f",
    accentColor: "#4d8a3d",
    roughness: 0.9,
    metalness: 0.01,
    coverKind: "tree",
    coverCount: 68,
    coverMinScale: 0.8,
    coverMaxScale: 1.3,
    coverFootprint: 0.22,
    coverSpacing: 0.84,
    coverEdgePadding: 0.15,
    featureCount: 12,
    pathDepth: 0.02
  },
  ore: {
    baseColor: tintColor(TILE_COLORS.ore, -0.12),
    coverColor: "#6a7380",
    accentColor: "#bfdcff",
    roughness: 0.88,
    metalness: 0.04,
    coverKind: "rockCluster",
    coverCount: 92,
    coverMinScale: 0.9,
    coverMaxScale: 1.9,
    coverFootprint: 0.17,
    coverSpacing: 0.74,
    coverEdgePadding: 0.07,
    featureCount: 13,
    pathDepth: 0.014
  },
  brick: {
    baseColor: tintColor(TILE_COLORS.brick, -0.1),
    coverColor: "#8f553f",
    accentColor: "#bc7b61",
    roughness: 0.92,
    metalness: 0.01,
    coverKind: "clay",
    coverCount: 96,
    coverMinScale: 0.76,
    coverMaxScale: 1.46,
    coverFootprint: 0.14,
    coverSpacing: 0.62,
    coverEdgePadding: 0.07,
    featureCount: 9,
    pathDepth: 0.02
  },
  desert: {
    baseColor: tintColor(TILE_COLORS.desert, -0.02),
    coverColor: "#caa26a",
    accentColor: "#edd29d",
    roughness: 0.94,
    metalness: 0,
    coverKind: "dune",
    coverCount: 54,
    coverMinScale: 0.9,
    coverMaxScale: 1.72,
    coverFootprint: 0.2,
    coverSpacing: 0.72,
    coverEdgePadding: 0.06,
    featureCount: 10,
    pathDepth: 0.012
  }
};

export function createTileTerrainSurface(params: CreateTileTerrainSurfaceParams): TileTerrainSurfaceBundle {
  const biome = createBiomeState(params.tile);
  const polygon = createTerrainPolygon(params.tile, params.verticesById, params.tileScale);
  const structureMask = createStructureMask(params.tile, params.verticesById, params.boardEdges, params.boardVertices, polygon.scale);
  const sampleHeightLocal = (localX: number, localZ: number) =>
    sampleBiomeHeight(params.tile.resource, biome, structureMask, localX, localZ, params.baseY);
  const sampleHeight = (offsetX: number, offsetZ: number) => sampleHeightLocal(offsetX * polygon.scale, offsetZ * polygon.scale);
  const { geometry, maxHeight } = createSurfaceGeometry(polygon, sampleHeightLocal);
  const material = createSurfaceMaterial(params.tile.resource, params.textured, params.terrainBundle, params.active, biome.recipe);
  const surfaceMesh = new THREE.Mesh(geometry, material);
  surfaceMesh.castShadow = true;
  surfaceMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(surfaceMesh);

  const coverLayer = createCoverLayer(biome, polygon, structureMask, sampleHeightLocal, params.baseY, params.active);
  if (coverLayer) {
    group.add(coverLayer);
  }

  return {
    object: group,
    sampleHeight,
    centerHeight: sampleHeight(0, 0),
    maxHeight
  };
}

function createSurfaceMaterial(
  resource: TerrainResource,
  textured: boolean,
  terrainBundle: UltraTerrainTextureBundle | undefined,
  active: boolean,
  recipe: TerrainBiomeRecipe
): THREE.MeshStandardMaterial {
  if (textured && terrainBundle) {
    const surfaceTint = resource === "lumber" ? tintColor(terrainBundle.appearance.topTint, 0.08) : terrainBundle.appearance.topTint;
    const material = new THREE.MeshStandardMaterial({
      color: surfaceTint,
      map: terrainBundle.colorMap,
      ...(terrainBundle.roughnessMap ? { roughnessMap: terrainBundle.roughnessMap } : {}),
      ...(terrainBundle.bumpMap ? { bumpMap: terrainBundle.bumpMap } : {}),
      roughness: Math.max(terrainBundle.appearance.roughness - 0.03, recipe.roughness),
      metalness: terrainBundle.appearance.metalness,
      bumpScale: terrainBundle.appearance.bumpScale * 0.58,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(active ? tintColor(surfaceTint, 0.1) : tintColor(surfaceTint, -0.18)),
      emissiveIntensity: active ? 0.09 : resource === "lumber" ? 0.035 : 0.02
    });
    markMaterialTexturesShared(material);
    return material;
  }

  return new THREE.MeshStandardMaterial({
    color: recipe.baseColor,
    roughness: recipe.roughness,
    metalness: recipe.metalness,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(active ? tintColor(recipe.baseColor, 0.08) : tintColor(recipe.baseColor, -0.22)),
    emissiveIntensity: active ? 0.08 : 0.02
  });
}

function createCoverLayer(
  biome: TerrainBiomeState,
  polygon: TerrainPolygon,
  structureMask: TerrainStructureMask,
  sampleHeightLocal: (localX: number, localZ: number) => number,
  baseY: number,
  active: boolean
): THREE.Object3D | null {
  const geometry = createCoverGeometry(biome.recipe.coverKind);
  const material = createCoverMaterial(biome.recipe, active);
  const spawns = createCoverSpawns(biome, polygon, structureMask);
  if (spawns.length === 0) {
    geometry.dispose();
    material.dispose();
    return null;
  }

  const cover = new THREE.InstancedMesh(geometry, material, spawns.length);
  const dummy = new THREE.Object3D();
  cover.castShadow = true;
  cover.receiveShadow = true;

  for (const [index, spawn] of spawns.entries()) {
    const height = sampleHeightLocal(spawn.x, spawn.z);
    dummy.position.set(spawn.x, height + spawn.offsetY, spawn.z);
    dummy.rotation.set(spawn.rotX, spawn.rotY, spawn.rotZ);
    dummy.scale.set(spawn.scaleX, spawn.scaleY, spawn.scaleZ);
    dummy.updateMatrix();
    cover.setMatrixAt(index, dummy.matrix);
  }

  cover.instanceMatrix.needsUpdate = true;
  cover.userData.baseY = baseY;
  return cover;
}

interface CoverSpawn {
  x: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  offsetY: number;
  footprint: number;
}

function createCoverSpawns(
  biome: TerrainBiomeState,
  polygon: TerrainPolygon,
  structureMask: TerrainStructureMask
): CoverSpawn[] {
  const random = createSeededRandom(`${biome.seed}:${biome.recipe.coverKind}:cover`);
  const spawns: CoverSpawn[] = [];
  const attempts = biome.recipe.coverCount * COVER_ATTEMPT_MULTIPLIER;

  for (let attempt = 0; attempt < attempts && spawns.length < biome.recipe.coverCount; attempt += 1) {
    const x = THREE.MathUtils.lerp(polygon.minX, polygon.maxX, random());
    const z = THREE.MathUtils.lerp(polygon.minZ, polygon.maxZ, random());
    if (!isPointInsidePolygon(x, z, polygon.points)) {
      continue;
    }

    const scale = THREE.MathUtils.lerp(biome.recipe.coverMinScale, biome.recipe.coverMaxScale, random());
    const footprint = biome.recipe.coverFootprint * scale;
    const edgeClearance = getPolygonEdgeClearance(x, z, polygon.points);
    if (edgeClearance < footprint + biome.recipe.coverEdgePadding) {
      continue;
    }

    const structureInfluence = sampleStructureInfluence(structureMask, x, z);
    if (structureInfluence > 0.22 && random() < structureInfluence * 0.9) {
      continue;
    }

    const tooCloseToOtherSpawn = spawns.some(
      (spawn) => Math.hypot(x - spawn.x, z - spawn.z) < (footprint + spawn.footprint) * biome.recipe.coverSpacing
    );
    if (tooCloseToOtherSpawn) {
      continue;
    }

    const alignedY =
      biome.recipe.coverKind === "grassPatch" || biome.recipe.coverKind === "wheatPatch" || biome.recipe.coverKind === "dune"
        ? biome.primaryAngle + (random() - 0.5) * 0.6
        : biome.recipe.coverKind === "tree"
          ? biome.secondaryAngle + (random() - 0.5) * 0.4
          : random() * Math.PI * 2;

    let rotX = 0;
    let rotZ = 0;
    let scaleX = scale;
    let scaleY = scale;
    let scaleZ = scale;
    let offsetY = 0.03 * scale;

    switch (biome.recipe.coverKind) {
      case "grassPatch":
        rotX = (random() - 0.5) * 0.06;
        rotZ = (random() - 0.5) * 0.08;
        scaleX = scale * THREE.MathUtils.lerp(0.92, 1.24, random());
        scaleY = scale * THREE.MathUtils.lerp(0.92, 1.18, random());
        scaleZ = scale * THREE.MathUtils.lerp(0.92, 1.24, random());
        offsetY = 0.01 * scale;
        break;
      case "wheatPatch":
        rotX = (random() - 0.5) * 0.04;
        rotZ = (random() - 0.5) * 0.08;
        scaleX = scale * THREE.MathUtils.lerp(1.08, 1.42, random());
        scaleY = scale * THREE.MathUtils.lerp(0.94, 1.12, random());
        scaleZ = scale * THREE.MathUtils.lerp(0.74, 0.96, random());
        offsetY = 0.012 * scale;
        break;
      case "tree":
        scaleX = scale * 0.9;
        scaleY = scale * THREE.MathUtils.lerp(1.02, 1.18, random());
        scaleZ = scale * 0.92;
        offsetY = 0.14 * scale;
        break;
      case "rockCluster":
        rotX = (random() - 0.5) * 0.3;
        rotZ = (random() - 0.5) * 0.24;
        scaleX = scale * THREE.MathUtils.lerp(0.94, 1.22, random());
        scaleY = scale * THREE.MathUtils.lerp(0.92, 1.3, random());
        scaleZ = scale * THREE.MathUtils.lerp(0.92, 1.2, random());
        offsetY = 0.014 * scale;
        break;
      case "clay":
        rotX = (random() - 0.5) * 0.24;
        rotZ = (random() - 0.5) * 0.14;
        scaleX = scale * THREE.MathUtils.lerp(0.96, 1.24, random());
        scaleY = scale * THREE.MathUtils.lerp(0.84, 1.06, random());
        scaleZ = scale * THREE.MathUtils.lerp(0.84, 1.14, random());
        offsetY = 0.012 * scale;
        break;
      case "dune":
        rotX = (random() - 0.5) * 0.04;
        rotZ = (random() - 0.5) * 0.04;
        scaleX = scale * THREE.MathUtils.lerp(1.2, 1.54, random());
        scaleY = scale * THREE.MathUtils.lerp(0.8, 1.06, random());
        scaleZ = scale * THREE.MathUtils.lerp(0.78, 1.02, random());
        offsetY = 0.008 * scale;
        break;
    }

    spawns.push({
      x,
      z,
      rotX,
      rotY: alignedY,
      rotZ,
      scaleX,
      scaleY,
      scaleZ,
      offsetY,
      footprint
    });
  }

  return spawns;
}

function createCoverGeometry(kind: TerrainBiomeRecipe["coverKind"]): THREE.BufferGeometry {
  switch (kind) {
    case "grassPatch":
      return createGrassPatchGeometry();
    case "wheatPatch":
      return createWheatPatchGeometry();
    case "tree":
      return transformCoverGeometry(new THREE.ConeGeometry(0.18, 0.48, 5), 0, 0.24, 0);
    case "rockCluster":
      return createRockClusterGeometry();
    case "clay":
      return createClayPatchGeometry();
    case "dune":
      return createDuneGeometry();
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported terrain cover geometry: ${unsupportedKind}`);
}

function createCoverMaterial(recipe: TerrainBiomeRecipe, active: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: recipe.coverColor,
    roughness:
      recipe.coverKind === "wheatPatch"
        ? 0.72
        : recipe.coverKind === "rockCluster"
          ? 0.92
          : recipe.coverKind === "dune"
            ? 0.9
            : 0.86,
    metalness: recipe.coverKind === "rockCluster" ? 0.04 : 0.01,
    flatShading: recipe.coverKind === "tree" || recipe.coverKind === "rockCluster" || recipe.coverKind === "clay",
    emissive: new THREE.Color(active ? recipe.accentColor : tintColor(recipe.coverColor, -0.24)),
    emissiveIntensity: active ? 0.08 : 0.02
  });
}

function createGrassPatchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(transformCoverGeometry(new THREE.CylinderGeometry(0.14, 0.2, 0.04, 7), 0, 0.02, 0));

  const bladeLayout = [
    { x: -0.08, y: 0.13, z: -0.03, rotX: -0.12, rotY: 0.18, rotZ: -0.42, sx: 1, sy: 1.18, sz: 1 },
    { x: -0.02, y: 0.15, z: 0.05, rotX: -0.08, rotY: -0.24, rotZ: -0.18, sx: 0.92, sy: 1.06, sz: 1 },
    { x: 0.04, y: 0.16, z: -0.06, rotX: -0.08, rotY: 0.06, rotZ: 0.16, sx: 0.98, sy: 1.14, sz: 1 },
    { x: 0.1, y: 0.12, z: 0.02, rotX: -0.08, rotY: 0.28, rotZ: 0.36, sx: 0.94, sy: 0.98, sz: 1 },
    { x: 0.01, y: 0.17, z: 0, rotX: -0.06, rotY: -0.1, rotZ: 0.04, sx: 0.9, sy: 1.24, sz: 1 },
    { x: -0.11, y: 0.11, z: 0.07, rotX: -0.1, rotY: -0.34, rotZ: -0.3, sx: 0.82, sy: 0.9, sz: 1 }
  ] as const;

  for (const blade of bladeLayout) {
    parts.push(
      transformCoverGeometry(
        new THREE.BoxGeometry(0.026, 0.22, 0.012),
        blade.x,
        blade.y,
        blade.z,
        blade.rotX,
        blade.rotY,
        blade.rotZ,
        blade.sx,
        blade.sy,
        blade.sz
      )
    );
  }

  return mergeCoverGeometryParts(parts);
}

function createWheatPatchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(transformCoverGeometry(new THREE.BoxGeometry(0.34, 0.038, 0.14), 0, 0.019, 0));

  const stems = [
    { x: -0.12, z: -0.04, h: 0.16, lean: -0.14 },
    { x: -0.04, z: 0.03, h: 0.18, lean: -0.08 },
    { x: 0.04, z: -0.02, h: 0.19, lean: 0.08 },
    { x: 0.13, z: 0.04, h: 0.17, lean: 0.16 }
  ] as const;

  for (const stem of stems) {
    parts.push(
      transformCoverGeometry(
        new THREE.CylinderGeometry(0.01, 0.014, stem.h, 5),
        stem.x,
        stem.h * 0.5,
        stem.z,
        0,
        0,
        stem.lean
      )
    );
    parts.push(
      transformCoverGeometry(
        new THREE.ConeGeometry(0.028, 0.1, 5),
        stem.x + stem.lean * 0.06,
        stem.h + 0.04,
        stem.z,
        0,
        Math.PI / 5,
        stem.lean * 1.2,
        1,
        1.08,
        0.92
      )
    );
  }

  parts.push(transformCoverGeometry(new THREE.BoxGeometry(0.18, 0.028, 0.06), -0.02, 0.032, 0.05, 0, 0.18, 0.04));
  return mergeCoverGeometryParts(parts);
}

function createRockClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(transformCoverGeometry(new THREE.BoxGeometry(0.2, 0.08, 0.18), 0, 0.04, 0.02, 0.14, 0.22, -0.1));
  parts.push(transformCoverGeometry(new THREE.DodecahedronGeometry(0.11, 0), -0.08, 0.12, -0.02, 0.24, 0.18, -0.12));
  parts.push(transformCoverGeometry(new THREE.DodecahedronGeometry(0.1, 0), 0.09, 0.1, 0.04, -0.1, 0.38, 0.16));
  parts.push(transformCoverGeometry(new THREE.DodecahedronGeometry(0.08, 0), 0.01, 0.14, -0.08, 0.18, -0.22, 0.08));
  return mergeCoverGeometryParts(parts);
}

function createClayPatchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(transformCoverGeometry(new THREE.CylinderGeometry(0.14, 0.2, 0.06, 6), 0, 0.03, 0));
  parts.push(transformCoverGeometry(new THREE.BoxGeometry(0.12, 0.05, 0.28), -0.04, 0.05, 0.02, 0.18, 0.34, -0.16));
  parts.push(transformCoverGeometry(new THREE.BoxGeometry(0.1, 0.04, 0.18), 0.08, 0.05, -0.03, -0.1, -0.26, 0.12));
  return mergeCoverGeometryParts(parts);
}

function createDuneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(transformCoverGeometry(new THREE.SphereGeometry(0.18, 10, 8), -0.05, 0.035, 0, 0, 0, 0, 1.5, 0.34, 1));
  parts.push(transformCoverGeometry(new THREE.SphereGeometry(0.14, 10, 8), 0.11, 0.03, 0.02, 0, 0, 0, 1.18, 0.28, 0.92));
  parts.push(transformCoverGeometry(new THREE.BoxGeometry(0.28, 0.018, 0.1), -0.02, 0.012, -0.04, 0.04, 0.12, -0.04));
  return mergeCoverGeometryParts(parts);
}

function transformCoverGeometry(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1
): THREE.BufferGeometry {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ));
  geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      quaternion,
      new THREE.Vector3(scaleX, scaleY, scaleZ)
    )
  );
  return geometry;
}

function mergeCoverGeometryParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  if (!merged) {
    throw new Error("Failed to merge terrain cover geometries.");
  }
  merged.computeVertexNormals();
  return merged;
}

function createSurfaceGeometry(
  polygon: TerrainPolygon,
  sampleHeightLocal: (localX: number, localZ: number) => number
): { geometry: THREE.BufferGeometry; maxHeight: number } {
  const width = Math.max(polygon.maxX - polygon.minX, 0.001);
  const depth = Math.max(polygon.maxZ - polygon.minZ, 0.001);
  const xSegments = Math.max(Math.round((width / Math.max(width, depth)) * SURFACE_GRID_RESOLUTION), 18);
  const zSegments = Math.max(Math.round((depth / Math.max(width, depth)) * SURFACE_GRID_RESOLUTION), 18);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertexCache = new Map<string, number>();
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    const z0 = THREE.MathUtils.lerp(polygon.minZ, polygon.maxZ, zIndex / zSegments);
    const z1 = THREE.MathUtils.lerp(polygon.minZ, polygon.maxZ, (zIndex + 1) / zSegments);
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const x0 = THREE.MathUtils.lerp(polygon.minX, polygon.maxX, xIndex / xSegments);
      const x1 = THREE.MathUtils.lerp(polygon.minX, polygon.maxX, (xIndex + 1) / xSegments);

      const clippedCell = clipPolygonAgainstConvexPolygon(
        [
          { x: x0, z: z0 },
          { x: x1, z: z0 },
          { x: x1, z: z1 },
          { x: x0, z: z1 }
        ],
        polygon.points
      );

      if (clippedCell.length < 3) {
        continue;
      }

      const getVertexIndex = (point: TerrainPoint): number => {
        const key = `${point.x.toFixed(5)}:${point.z.toFixed(5)}`;
        const existing = vertexCache.get(key);
        if (existing !== undefined) {
          return existing;
        }

        const y = sampleHeightLocal(point.x, point.z);
        const nextIndex = positions.length / 3;
        positions.push(point.x, y, point.z);
        uvs.push((point.x - polygon.minX) / width, (point.z - polygon.minZ) / depth);
        vertexCache.set(key, nextIndex);
        maxHeight = Math.max(maxHeight, y);
        return nextIndex;
      };

      const anchor = getVertexIndex(clippedCell[0]!);
      for (let pointIndex = 1; pointIndex < clippedCell.length - 1; pointIndex += 1) {
        const left = getVertexIndex(clippedCell[pointIndex]!);
        const right = getVertexIndex(clippedCell[pointIndex + 1]!);
        indices.push(anchor, left, right);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return {
    geometry,
    maxHeight: maxHeight === Number.NEGATIVE_INFINITY ? 0 : maxHeight
  };
}

function createBiomeState(tile: TerrainTile): TerrainBiomeState {
  const recipe = BIOME_RECIPES[tile.resource];
  const random = createSeededRandom(`${tile.id}:${tile.q}:${tile.r}:${tile.resource}:terrain`);
  const features: TerrainFeature[] = [];
  const primaryAngle = random() * Math.PI;
  const secondaryAngle = primaryAngle + Math.PI / 2 + (random() - 0.5) * 0.56;

  for (let index = 0; index < recipe.featureCount; index += 1) {
    const radial = THREE.MathUtils.lerp(0.15, 0.92, Math.sqrt(random()));
    const angle = random() * Math.PI * 2;
    const amplitude =
      tile.resource === "brick"
        ? THREE.MathUtils.lerp(-0.032, 0.026, random())
        : tile.resource === "ore"
          ? THREE.MathUtils.lerp(0.02, 0.078, random())
          : tile.resource === "desert"
            ? THREE.MathUtils.lerp(0.014, 0.062, random())
            : THREE.MathUtils.lerp(0.016, 0.054, random());
    features.push({
      x: Math.cos(angle) * radial * 2.36,
      z: Math.sin(angle) * radial * 2.18,
      radiusX: THREE.MathUtils.lerp(0.34, 0.96, random()),
      radiusZ: THREE.MathUtils.lerp(0.28, 0.86, random()),
      amplitude,
      rotation: random() * Math.PI
    });
  }

  return {
    recipe,
    seed: hashString(`${tile.id}:${tile.q}:${tile.r}:${tile.resource}`),
    primaryAngle,
    secondaryAngle,
    features
  };
}

function createTerrainPolygon(tile: TerrainTile, verticesById: Map<string, TerrainVertex>, tileScale: number): TerrainPolygon {
  const scale = tileScale * 0.985;
  const points = tile.vertexIds.map((vertexId) => {
    const vertex = verticesById.get(vertexId)!;
    return {
      x: (vertex.x - tile.x) * scale,
      z: (vertex.y - tile.y) * scale
    };
  });

  const bounds = points.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minZ: Math.min(current.minZ, point.z),
      maxZ: Math.max(current.maxZ, point.z)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY
    }
  );

  return {
    points,
    scale,
    ...bounds
  };
}

function createStructureMask(
  tile: TerrainTile,
  verticesById: Map<string, TerrainVertex>,
  boardEdges: readonly TerrainEdge[],
  boardVertices: readonly TerrainVertex[],
  scale: number
): TerrainStructureMask {
  const buildingsById = new Map(boardVertices.filter((vertex) => vertex.building).map((vertex) => [vertex.id, vertex]));
  const roads = boardEdges
    .filter((edge) => !!edge.ownerId && edge.tileIds.includes(tile.id))
    .map((edge) => {
      const [leftId, rightId] = edge.vertexIds;
      const left = verticesById.get(leftId)!;
      const right = verticesById.get(rightId)!;
      return {
        start: {
          x: (left.x - tile.x) * scale,
          z: (left.y - tile.y) * scale
        },
        end: {
          x: (right.x - tile.x) * scale,
          z: (right.y - tile.y) * scale
        },
        width: 0.28,
        falloff: 0.3
      };
    });
  const buildings = tile.vertexIds
    .map((vertexId) => buildingsById.get(vertexId))
    .filter((vertex): vertex is TerrainVertex => !!vertex)
    .map((vertex) => ({
      x: (vertex.x - tile.x) * scale,
      z: (vertex.y - tile.y) * scale,
      radius: 0.42,
      falloff: 0.36
    }));

  return {
    roads,
    buildings
  };
}

function sampleBiomeHeight(
  resource: TerrainResource,
  biome: TerrainBiomeState,
  structureMask: TerrainStructureMask,
  localX: number,
  localZ: number,
  baseY: number
): number {
  const rotatedPrimary = rotatePoint(localX, localZ, biome.primaryAngle);
  const rotatedSecondary = rotatePoint(localX, localZ, biome.secondaryAngle);
  const featureField = sampleFeatureField(localX, localZ, biome.features);
  const broadNoise = sampleFbm(rotatedPrimary.x * 0.42, rotatedPrimary.z * 0.42, biome.seed);
  const fineNoise = sampleFbm(rotatedSecondary.x * 1.3, rotatedSecondary.z * 1.3, biome.seed + 17);
  const ridgeNoise = sampleRidgedNoise(rotatedPrimary.x * 0.92, rotatedPrimary.z * 0.92, biome.seed + 31);

  let macro = 0;
  let micro = 0;

  switch (resource) {
    case "wool":
      macro = 0.044 + broadNoise * 0.024 + featureField * 0.58;
      micro =
        Math.abs(Math.sin(rotatedPrimary.x * 5.2 + biome.seed * 0.0017)) * 0.016 +
        Math.abs(Math.sin(rotatedSecondary.z * 4.4 + biome.seed * 0.0012)) * 0.01 +
        fineNoise * 0.008;
      break;
    case "grain":
      macro = 0.04 + broadNoise * 0.014 + featureField * 0.24;
      micro =
        Math.sin(rotatedPrimary.x * 7.1 + biome.seed * 0.0017) * 0.03 +
        Math.sin(rotatedPrimary.x * 14.2 + biome.seed * 0.0031) * 0.012 +
        fineNoise * 0.005;
      break;
    case "lumber":
      macro = 0.064 + broadNoise * 0.022 + featureField * 0.94;
      micro = ridgeNoise * 0.02 + Math.abs(fineNoise) * 0.01;
      break;
    case "ore":
      macro = 0.058 + Math.abs(Math.sin(rotatedPrimary.x * 3.1 + biome.seed * 0.0018)) * 0.084 + featureField * 1.38;
      micro = ridgeNoise * 0.04 + Math.abs(Math.sin((rotatedPrimary.x + rotatedPrimary.z) * 6.2)) * 0.018;
      break;
    case "brick":
      macro = 0.044 + broadNoise * 0.016 + featureField * 0.96;
      micro =
        Math.abs(Math.sin(rotatedSecondary.z * 5.8 + biome.seed * 0.0021)) * 0.018 +
        Math.sin(rotatedPrimary.x * 2.8 + biome.seed * 0.0014) * 0.014 +
        fineNoise * 0.01;
      break;
    case "desert":
      macro =
        0.048 +
        (Math.sin(rotatedPrimary.x * 1.46 + biome.seed * 0.0008) * 0.5 + 0.5) * 0.094 +
        Math.sin(rotatedPrimary.x * 3.3 + biome.seed * 0.0016) * 0.028 +
        featureField * 0.42;
      micro =
        Math.abs(Math.sin(rotatedSecondary.z * 10.8 + biome.seed * 0.0023)) * 0.014 +
        Math.sin(rotatedPrimary.x * 7.4 + biome.seed * 0.0011) * 0.008 +
        fineNoise * 0.004;
      break;
  }

  const rawHeight = baseY + macro + micro;
  const structureInfluence = sampleStructureInfluence(structureMask, localX, localZ);
  const flattenedHeight = baseY + macro * 0.42 + micro * 0.12 - structureInfluence * biome.recipe.pathDepth;
  return THREE.MathUtils.lerp(rawHeight, flattenedHeight, structureInfluence * 0.92);
}

function sampleStructureInfluence(mask: TerrainStructureMask, localX: number, localZ: number): number {
  let influence = 0;

  for (const road of mask.roads) {
    const distance = getDistanceToSegment(localX, localZ, road.start, road.end);
    const roadInfluence = 1 - smoothstep(road.width, road.width + road.falloff, distance);
    influence = Math.max(influence, roadInfluence);
  }

  for (const building of mask.buildings) {
    const distance = Math.hypot(localX - building.x, localZ - building.z);
    const buildingInfluence = 1 - smoothstep(building.radius, building.radius + building.falloff, distance);
    influence = Math.max(influence, buildingInfluence);
  }

  return THREE.MathUtils.clamp(influence, 0, 1);
}

function sampleFeatureField(localX: number, localZ: number, features: readonly TerrainFeature[]): number {
  let total = 0;
  for (const feature of features) {
    const rotated = rotatePoint(localX - feature.x, localZ - feature.z, feature.rotation);
    const nx = rotated.x / Math.max(feature.radiusX, 0.001);
    const nz = rotated.z / Math.max(feature.radiusZ, 0.001);
    total += Math.exp(-(nx * nx + nz * nz) * 1.6) * feature.amplitude;
  }
  return total;
}

function sampleRidgedNoise(x: number, z: number, seed: number): number {
  return 1 - Math.abs(sampleWaveNoise(x, z, seed, 1.1, 0.74));
}

function sampleFbm(x: number, z: number, seed: number): number {
  return (
    sampleWaveNoise(x, z, seed, 0.9, 0.18) * 0.52 +
    sampleWaveNoise(x * 1.9, z * 1.9, seed + 13, 1.24, 0.61) * 0.31 +
    sampleWaveNoise(x * 3.4, z * 3.4, seed + 37, 1.78, 0.92) * 0.17
  );
}

function sampleWaveNoise(x: number, z: number, seed: number, scale: number, rotation: number): number {
  const rotated = rotatePoint(x, z, rotation + (seed % 97) * 0.0008);
  return Math.sin(rotated.x * scale + seed * 0.0009) * Math.cos(rotated.z * scale * 0.82 - seed * 0.0006);
}

function rotatePoint(x: number, z: number, rotation: number): TerrainPoint {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: x * cosine - z * sine,
    z: x * sine + z * cosine
  };
}

function isTerrainPointInside(x: number, z: number, polygon: readonly TerrainPoint[], edgePadding: number): boolean {
  void edgePadding;
  return isPointInsidePolygon(x, z, polygon);
}

function isPointInsidePolygon(x: number, z: number, polygon: readonly TerrainPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index]!;
    const prior = polygon[previous]!;
    const intersects =
      (current.z > z) !== (prior.z > z) &&
      x < ((prior.x - current.x) * (z - current.z)) / Math.max(prior.z - current.z, 0.00001) + current.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function getPolygonEdgeClearance(x: number, z: number, polygon: readonly TerrainPoint[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    nearest = Math.min(nearest, getDistanceToSegment(x, z, current, next));
  }
  return nearest;
}

function getDistanceToSegment(x: number, z: number, start: TerrainPoint, end: TerrainPoint): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.000001) {
    return Math.hypot(x - start.x, z - start.z);
  }

  const projection = THREE.MathUtils.clamp(((x - start.x) * dx + (z - start.z) * dz) / lengthSquared, 0, 1);
  const closestX = start.x + dx * projection;
  const closestZ = start.z + dz * projection;
  return Math.hypot(x - closestX, z - closestZ);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(edge1 - edge0, 0.00001), 0, 1);
  return t * t * (3 - 2 * t);
}

function clipPolygonAgainstConvexPolygon(subject: TerrainPoint[], clipPolygon: readonly TerrainPoint[]): TerrainPoint[] {
  let output = subject.slice();
  const clipOrientation = Math.sign(getPolygonSignedArea(clipPolygon)) || 1;

  for (let index = 0; index < clipPolygon.length; index += 1) {
    const clipStart = clipPolygon[index]!;
    const clipEnd = clipPolygon[(index + 1) % clipPolygon.length]!;
    const input = output.slice();
    output = [];

    if (input.length === 0) {
      break;
    }

    let startPoint = input[input.length - 1]!;
    for (const endPoint of input) {
      const endInside = isPointInsideClipEdge(endPoint, clipStart, clipEnd, clipOrientation);
      const startInside = isPointInsideClipEdge(startPoint, clipStart, clipEnd, clipOrientation);

      if (endInside) {
        if (!startInside) {
          output.push(getSegmentLineIntersection(startPoint, endPoint, clipStart, clipEnd));
        }
        output.push(endPoint);
      } else if (startInside) {
        output.push(getSegmentLineIntersection(startPoint, endPoint, clipStart, clipEnd));
      }

      startPoint = endPoint;
    }

    output = dedupePolygonPoints(output);
  }

  return output;
}

function isPointInsideClipEdge(
  point: TerrainPoint,
  edgeStart: TerrainPoint,
  edgeEnd: TerrainPoint,
  orientation: number
): boolean {
  const cross = (edgeEnd.x - edgeStart.x) * (point.z - edgeStart.z) - (edgeEnd.z - edgeStart.z) * (point.x - edgeStart.x);
  return orientation >= 0 ? cross >= -0.00001 : cross <= 0.00001;
}

function getSegmentLineIntersection(
  segmentStart: TerrainPoint,
  segmentEnd: TerrainPoint,
  clipStart: TerrainPoint,
  clipEnd: TerrainPoint
): TerrainPoint {
  const segmentDx = segmentEnd.x - segmentStart.x;
  const segmentDz = segmentEnd.z - segmentStart.z;
  const clipDx = clipEnd.x - clipStart.x;
  const clipDz = clipEnd.z - clipStart.z;
  const denominator = segmentDx * clipDz - segmentDz * clipDx;

  if (Math.abs(denominator) < 0.000001) {
    return {
      x: (segmentStart.x + segmentEnd.x) * 0.5,
      z: (segmentStart.z + segmentEnd.z) * 0.5
    };
  }

  const startOffsetX = clipStart.x - segmentStart.x;
  const startOffsetZ = clipStart.z - segmentStart.z;
  const ratio = (startOffsetX * clipDz - startOffsetZ * clipDx) / denominator;
  return {
    x: segmentStart.x + segmentDx * ratio,
    z: segmentStart.z + segmentDz * ratio
  };
}

function dedupePolygonPoints(points: TerrainPoint[]): TerrainPoint[] {
  const deduped: TerrainPoint[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.z - point.z) < 0.00001) {
      continue;
    }
    deduped.push(point);
  }

  if (deduped.length > 1) {
    const first = deduped[0]!;
    const last = deduped[deduped.length - 1]!;
    if (Math.hypot(first.x - last.x, first.z - last.z) < 0.00001) {
      deduped.pop();
    }
  }

  return deduped;
}

function getPolygonSignedArea(polygon: readonly TerrainPoint[]): number {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    area += current.x * next.z - next.x * current.z;
  }
  return area * 0.5;
}

function createSeededRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tintColor(color: string, lightnessOffset: number): string {
  const shaded = new THREE.Color(color);
  shaded.offsetHSL(0, 0, lightnessOffset);
  return `#${shaded.getHexString()}`;
}

function markSharedResource<T extends { userData: Record<string, unknown> }>(resource: T): T {
  resource.userData[SHARED_RESOURCE_FLAG] = true;
  return resource;
}

function markMaterialTexturesShared(material: THREE.Material): void {
  const materialRecord = material as unknown as Partial<Record<string, unknown>>;
  for (const value of Object.values(materialRecord)) {
    if (value instanceof THREE.Texture) {
      markSharedResource(value);
    }
  }
}
