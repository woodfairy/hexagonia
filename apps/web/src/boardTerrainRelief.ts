import type { MatchSnapshot, Resource } from "@hexagonia/shared";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { UltraTerrainTextureBundle } from "./boardUltraTerrain";
import { getTileBoundaryPoints, TILE_RELIEF_BOUNDARY_INSET } from "./boardTileGeometry";
import { TILE_COLORS } from "./boardVisuals";

type TerrainTile = MatchSnapshot["board"]["tiles"][number];
type TerrainVertex = MatchSnapshot["board"]["vertices"][number];
type TerrainEdge = MatchSnapshot["board"]["edges"][number];
type TerrainPort = MatchSnapshot["board"]["ports"][number];
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
  ports: Array<{
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
  boardPorts: readonly TerrainPort[];
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

interface TerrainCoverGeometryTemplate {
  geometry: THREE.BufferGeometry;
  localVertices: THREE.Vector3[];
  baseRadius: number;
}

interface CoverSpawnBounds {
  points: TerrainPoint[];
  radius: number;
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
    coverCount: 520,
    coverMinScale: 0.52,
    coverMaxScale: 0.92,
    coverFootprint: 0.078,
    coverSpacing: 0.34,
    coverEdgePadding: 0.035,
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
    coverCount: 248,
    coverMinScale: 0.72,
    coverMaxScale: 1.14,
    coverFootprint: 0.125,
    coverSpacing: 0.48,
    coverEdgePadding: 0.045,
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
  const structureMask = createStructureMask(
    params.tile,
    params.verticesById,
    params.boardEdges,
    params.boardVertices,
    params.boardPorts,
    polygon.scale
  );
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
  const coverTemplate = createCoverGeometry(biome.recipe.coverKind);
  const material = createCoverMaterial(biome.recipe, active);
  const spawns = createCoverSpawns(biome, polygon, structureMask, coverTemplate);
  if (spawns.length === 0) {
    coverTemplate.geometry.dispose();
    material.dispose();
    return null;
  }

  const cover = new THREE.InstancedMesh(coverTemplate.geometry, material, spawns.length);
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
  bounds: CoverSpawnBounds;
}

interface CoverGapCandidate {
  x: number;
  z: number;
  scale: number;
  score: number;
}

function createCoverSpawns(
  biome: TerrainBiomeState,
  polygon: TerrainPolygon,
  structureMask: TerrainStructureMask,
  coverTemplate: TerrainCoverGeometryTemplate
): CoverSpawn[] {
  const random = createSeededRandom(`${biome.seed}:${biome.recipe.coverKind}:cover`);
  const spawns: CoverSpawn[] = [];
  const attempts = biome.recipe.coverCount * COVER_ATTEMPT_MULTIPLIER;

  for (let attempt = 0; attempt < attempts && spawns.length < biome.recipe.coverCount; attempt += 1) {
    const x = THREE.MathUtils.lerp(polygon.minX, polygon.maxX, random());
    const z = THREE.MathUtils.lerp(polygon.minZ, polygon.maxZ, random());
    const scale = THREE.MathUtils.lerp(biome.recipe.coverMinScale, biome.recipe.coverMaxScale, random());
    const spawn = createCoverSpawn(biome, random, x, z, scale, coverTemplate);
    if (!canPlaceCoverSpawn(spawn, spawns, biome, polygon, structureMask, random)) {
      continue;
    }

    spawns.push(spawn);
  }

  fillCoverSpawnGaps(spawns, biome, polygon, structureMask, coverTemplate, random);
  return spawns;
}

function createCoverSpawn(
  biome: TerrainBiomeState,
  random: () => number,
  x: number,
  z: number,
  scale: number,
  coverTemplate: TerrainCoverGeometryTemplate
): CoverSpawn {
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
      scaleX = scale * THREE.MathUtils.lerp(0.86, 1.08, random());
      scaleY = scale * THREE.MathUtils.lerp(0.72, 0.94, random());
      scaleZ = scale * THREE.MathUtils.lerp(0.86, 1.08, random());
      offsetY = 0.002 * scale;
      break;
    case "wheatPatch":
      rotX = (random() - 0.5) * 0.04;
      rotZ = (random() - 0.5) * 0.08;
      scaleX = scale * THREE.MathUtils.lerp(0.96, 1.2, random());
      scaleY = scale * THREE.MathUtils.lerp(0.9, 1.06, random());
      scaleZ = scale * THREE.MathUtils.lerp(0.86, 1.04, random());
      offsetY = 0.004 * scale;
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

  return {
    x,
    z,
    rotX,
    rotY: alignedY,
    rotZ,
    scaleX,
    scaleY,
    scaleZ,
    offsetY,
    bounds: createCoverSpawnBounds(coverTemplate, x, z, rotX, alignedY, rotZ, scaleX, scaleY, scaleZ)
  };
}

function canPlaceCoverSpawn(
  spawn: CoverSpawn,
  existingSpawns: readonly CoverSpawn[],
  biome: TerrainBiomeState,
  polygon: TerrainPolygon,
  structureMask: TerrainStructureMask,
  random: () => number
): boolean {
  if (!isCoverBoundsInsidePolygon(spawn.bounds, polygon.points, biome.recipe.coverEdgePadding)) {
    return false;
  }

  const structureInfluence = sampleStructureInfluence(structureMask, spawn.x, spawn.z);
  if (shouldRejectCoverForStructure(biome.recipe.coverKind, structureInfluence, random)) {
    return false;
  }

  return !existingSpawns.some(
    (existing) =>
      Math.hypot(spawn.x - existing.x, spawn.z - existing.z) <
      (spawn.bounds.radius + existing.bounds.radius) * biome.recipe.coverSpacing
  );
}

function fillCoverSpawnGaps(
  spawns: CoverSpawn[],
  biome: TerrainBiomeState,
  polygon: TerrainPolygon,
  structureMask: TerrainStructureMask,
  coverTemplate: TerrainCoverGeometryTemplate,
  random: () => number
): void {
  const polygonArea = Math.max(Math.abs(getPolygonSignedArea(polygon.points)), 0.001);
  const averageScale = (biome.recipe.coverMinScale + biome.recipe.coverMaxScale) * 0.5;
  const baseSpacing = Math.sqrt(polygonArea / Math.max(biome.recipe.coverCount, 1));
  const nominalRadius = createCoverSpawn(biome, () => 0.5, 0, 0, averageScale, coverTemplate).bounds.radius;
  const columnSpacing = Math.max(baseSpacing * 0.88, nominalRadius * getCoverGapColumnFactor(biome.recipe.coverKind));
  const rowSpacing = columnSpacing * 0.88;
  const jitter = columnSpacing * getCoverGapJitterFactor(biome.recipe.coverKind);
  const maxExtraSpawns = Math.round(biome.recipe.coverCount * getCoverGapFillFactor(biome.recipe.coverKind));
  const maxSpawnCount = biome.recipe.coverCount + maxExtraSpawns;
  // Evaluate the whole fill grid first so the capped spawn count does not starve the same edge every time.
  const gapCandidates: CoverGapCandidate[] = [];
  const gapRadius = nominalRadius * getCoverGapRadiusFactor(biome.recipe.coverKind);

  let rowIndex = 0;
  for (let z = polygon.minZ + rowSpacing * 0.5; z <= polygon.maxZ; z += rowSpacing, rowIndex += 1) {
    const rowOffset = rowIndex % 2 === 0 ? 0 : columnSpacing * 0.5;
    for (let x = polygon.minX + columnSpacing * 0.5 + rowOffset; x <= polygon.maxX; x += columnSpacing) {
      const candidates = [
        {
          x: x + (random() - 0.5) * jitter,
          z: z + (random() - 0.5) * jitter
        },
        { x, z }
      ] as const;
      let bestCandidate: CoverGapCandidate | null = null;

      for (const candidate of candidates) {
        if (!isPointInsidePolygon(candidate.x, candidate.z, polygon.points)) {
          continue;
        }

        const nearestSpawnDistance = getNearestCoverSpawnDistance(spawns, candidate.x, candidate.z, nominalRadius);
        if (nearestSpawnDistance < gapRadius) {
          continue;
        }

        const fillScale = THREE.MathUtils.lerp(
          biome.recipe.coverMinScale,
          biome.recipe.coverMaxScale,
          0.28 + random() * 0.44
        );
        const edgeClearance = getPolygonEdgeClearance(candidate.x, candidate.z, polygon.points);
        const score = nearestSpawnDistance * 0.78 + edgeClearance * 0.18 + random() * 0.04;
        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            x: candidate.x,
            z: candidate.z,
            scale: fillScale,
            score
          };
        }
      }

      if (bestCandidate) {
        gapCandidates.push(bestCandidate);
      }
    }
  }

  gapCandidates.sort((left, right) => right.score - left.score);
  for (const candidate of gapCandidates) {
    if (spawns.length >= maxSpawnCount) {
      break;
    }

    const candidateRandom = createSeededRandom(
      `${biome.seed}:${biome.recipe.coverKind}:gap:${candidate.x.toFixed(4)}:${candidate.z.toFixed(4)}`
    );
    const spawn = createCoverSpawn(biome, candidateRandom, candidate.x, candidate.z, candidate.scale, coverTemplate);
    if (!canPlaceCoverSpawn(spawn, spawns, biome, polygon, structureMask, candidateRandom)) {
      continue;
    }

    spawns.push(spawn);
  }
}

function getNearestCoverSpawnDistance(spawns: readonly CoverSpawn[], x: number, z: number, candidateRadius: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const spawn of spawns) {
    nearest = Math.min(nearest, Math.hypot(x - spawn.x, z - spawn.z) - spawn.bounds.radius - candidateRadius);
  }
  return nearest;
}

function shouldRejectCoverForStructure(
  kind: TerrainBiomeRecipe["coverKind"],
  structureInfluence: number,
  random: () => number
): boolean {
  if (structureInfluence <= 0) {
    return false;
  }

  switch (kind) {
    case "grassPatch":
    case "wheatPatch":
      return structureInfluence > 0.82 && random() < structureInfluence * 0.48;
    case "rockCluster":
    case "clay":
    case "dune":
      return structureInfluence > 0.72 && random() < structureInfluence * 0.62;
    case "tree":
      return structureInfluence > 0.42 && random() < structureInfluence * 0.84;
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported terrain cover structure mask: ${unsupportedKind}`);
}

function getCoverGapColumnFactor(kind: TerrainBiomeRecipe["coverKind"]): number {
  switch (kind) {
    case "grassPatch":
      return 2.4;
    case "wheatPatch":
      return 2.2;
    case "rockCluster":
      return 1.84;
    case "clay":
      return 1.76;
    case "dune":
      return 1.94;
    case "tree":
      return 2.6;
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported terrain cover gap column factor: ${unsupportedKind}`);
}

function getCoverGapJitterFactor(kind: TerrainBiomeRecipe["coverKind"]): number {
  switch (kind) {
    case "grassPatch":
      return 0.38;
    case "wheatPatch":
      return 0.28;
    case "rockCluster":
      return 0.24;
    case "clay":
      return 0.24;
    case "dune":
      return 0.18;
    case "tree":
      return 0.2;
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported terrain cover gap jitter factor: ${unsupportedKind}`);
}

function getCoverGapRadiusFactor(kind: TerrainBiomeRecipe["coverKind"]): number {
  switch (kind) {
    case "grassPatch":
      return 1.8;
    case "wheatPatch":
      return 1.9;
    case "rockCluster":
      return 1.54;
    case "clay":
      return 1.48;
    case "dune":
      return 1.6;
    case "tree":
      return 1.72;
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported terrain cover gap radius factor: ${unsupportedKind}`);
}

function getCoverGapFillFactor(kind: TerrainBiomeRecipe["coverKind"]): number {
  switch (kind) {
    case "grassPatch":
      return 0.6;
    case "wheatPatch":
      return 0.58;
    case "rockCluster":
      return 0.46;
    case "clay":
      return 0.44;
    case "dune":
      return 0.42;
    case "tree":
      return 0.18;
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported terrain cover gap fill factor: ${unsupportedKind}`);
}

function getCoverEdgeInsetFactor(kind: TerrainBiomeRecipe["coverKind"]): number {
  switch (kind) {
    case "grassPatch":
      return 0.12;
    case "wheatPatch":
      return 0.16;
    case "rockCluster":
      return 0.22;
    case "clay":
      return 0.2;
    case "dune":
      return 0.24;
    case "tree":
      return 0.42;
  }
}

function createCoverGeometry(kind: TerrainBiomeRecipe["coverKind"]): TerrainCoverGeometryTemplate {
  let geometry: THREE.BufferGeometry | null = null;
  switch (kind) {
    case "grassPatch":
      geometry = createGrassPatchGeometry();
      break;
    case "wheatPatch":
      geometry = createWheatPatchGeometry();
      break;
    case "tree":
      geometry = transformCoverGeometry(new THREE.ConeGeometry(0.18, 0.48, 5), 0, 0.24, 0);
      break;
    case "rockCluster":
      geometry = createRockClusterGeometry();
      break;
    case "clay":
      geometry = createClayPatchGeometry();
      break;
    case "dune":
      geometry = createDuneGeometry();
      break;
    default: {
      const unsupportedKind: never = kind;
      throw new Error(`Unsupported terrain cover geometry: ${unsupportedKind}`);
    }
  }

  if (!geometry) {
    throw new Error("Failed to create terrain cover geometry.");
  }

  return createCoverGeometryTemplate(geometry);
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
  const bladeLayout = [
    { x: -0.1, z: -0.04, width: 0.008, depth: 0.004, height: 0.13, rotX: -0.08, rotY: 0.18, rotZ: -0.28 },
    { x: -0.08, z: 0.03, width: 0.008, depth: 0.004, height: 0.11, rotX: -0.04, rotY: -0.2, rotZ: -0.16 },
    { x: -0.05, z: -0.09, width: 0.007, depth: 0.003, height: 0.1, rotX: -0.06, rotY: 0.38, rotZ: -0.22 },
    { x: -0.03, z: 0.08, width: 0.009, depth: 0.004, height: 0.12, rotX: -0.05, rotY: -0.34, rotZ: -0.1 },
    { x: -0.01, z: -0.01, width: 0.007, depth: 0.003, height: 0.145, rotX: -0.02, rotY: 0.02, rotZ: 0.06 },
    { x: 0.02, z: -0.07, width: 0.008, depth: 0.004, height: 0.118, rotX: -0.04, rotY: 0.14, rotZ: 0.14 },
    { x: 0.04, z: 0.05, width: 0.008, depth: 0.004, height: 0.122, rotX: -0.06, rotY: -0.18, rotZ: 0.18 },
    { x: 0.06, z: -0.01, width: 0.007, depth: 0.003, height: 0.096, rotX: -0.04, rotY: 0.3, rotZ: 0.24 },
    { x: 0.08, z: 0.09, width: 0.008, depth: 0.004, height: 0.112, rotX: -0.06, rotY: -0.3, rotZ: 0.18 },
    { x: 0.1, z: -0.05, width: 0.009, depth: 0.004, height: 0.124, rotX: -0.08, rotY: 0.22, rotZ: 0.26 },
    { x: 0, z: 0.09, width: 0.007, depth: 0.003, height: 0.102, rotX: -0.03, rotY: 0.44, rotZ: -0.08 },
    { x: -0.11, z: 0.08, width: 0.008, depth: 0.004, height: 0.108, rotX: -0.06, rotY: -0.4, rotZ: -0.2 },
    { x: 0.11, z: 0.01, width: 0.007, depth: 0.003, height: 0.104, rotX: -0.05, rotY: 0.48, rotZ: 0.12 },
    { x: 0.01, z: 0.01, width: 0.007, depth: 0.003, height: 0.138, rotX: -0.02, rotY: -0.12, rotZ: -0.04 }
  ] as const;

  for (const blade of bladeLayout) {
    parts.push(
      transformCoverGeometry(
        new THREE.BoxGeometry(blade.width, blade.height, blade.depth),
        blade.x,
        blade.height * 0.52,
        blade.z,
        blade.rotX,
        blade.rotY,
        blade.rotZ
      )
    );
  }

  return mergeCoverGeometryParts(parts);
}

function createWheatPatchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stalks = [
    { x: -0.16, z: -0.05, height: 0.18, lean: -0.18, yaw: -0.08, headScale: 1.04 },
    { x: -0.11, z: 0.03, height: 0.166, lean: -0.12, yaw: 0.04, headScale: 0.96 },
    { x: -0.07, z: -0.01, height: 0.194, lean: -0.08, yaw: 0.08, headScale: 1.08 },
    { x: -0.02, z: 0.06, height: 0.176, lean: -0.04, yaw: -0.1, headScale: 0.94 },
    { x: 0.03, z: -0.06, height: 0.202, lean: 0.06, yaw: 0.02, headScale: 1.1 },
    { x: 0.08, z: 0.02, height: 0.186, lean: 0.1, yaw: -0.04, headScale: 1.02 },
    { x: 0.12, z: -0.01, height: 0.172, lean: 0.16, yaw: 0.12, headScale: 0.98 },
    { x: 0.16, z: 0.05, height: 0.182, lean: 0.22, yaw: -0.06, headScale: 1.06 }
  ] as const;

  for (const [index, stalk] of stalks.entries()) {
    const headOffsetX = Math.sin(stalk.lean) * stalk.height * 0.34;
    const headOffsetY = stalk.height + 0.02;
    const leafDirection = index % 2 === 0 ? -1 : 1;

    parts.push(
      transformCoverGeometry(
        new THREE.CylinderGeometry(0.0055, 0.0075, stalk.height, 4),
        stalk.x,
        stalk.height * 0.48,
        stalk.z,
        0,
        stalk.yaw,
        stalk.lean
      )
    );
    parts.push(
      transformCoverGeometry(
        new THREE.CylinderGeometry(0.012, 0.017, 0.1, 5),
        stalk.x + headOffsetX,
        headOffsetY,
        stalk.z,
        0,
        stalk.yaw + Math.PI / 7,
        stalk.lean * 1.08,
        0.7,
        1.16 * stalk.headScale,
        0.7
      )
    );
    parts.push(
      transformCoverGeometry(
        new THREE.BoxGeometry(0.004, 0.074, 0.018),
        stalk.x + 0.016 * leafDirection,
        stalk.height * 0.36,
        stalk.z + 0.01 * leafDirection,
        0,
        stalk.yaw + leafDirection * 0.16,
        stalk.lean - leafDirection * 0.54
      )
    );
    parts.push(
      transformCoverGeometry(
        new THREE.BoxGeometry(0.003, 0.056, 0.016),
        stalk.x - 0.012 * leafDirection,
        stalk.height * 0.54,
        stalk.z - 0.008,
        0,
        stalk.yaw - leafDirection * 0.12,
        stalk.lean + leafDirection * 0.32
      )
    );
  }
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
  const normalizedParts = parts.map((part) => {
    const normalized = part.index ? part.toNonIndexed() : part.clone();
    normalized.deleteAttribute("uv");
    if (!normalized.getAttribute("normal")) {
      normalized.computeVertexNormals();
    }
    return normalized;
  });

  const merged = mergeGeometries(normalizedParts, false);
  for (const normalizedPart of normalizedParts) {
    normalizedPart.dispose();
  }
  for (const part of parts) {
    part.dispose();
  }
  if (!merged) {
    throw new Error("Failed to merge terrain cover geometries.");
  }
  merged.computeVertexNormals();
  return merged;
}

function createCoverGeometryTemplate(geometry: THREE.BufferGeometry): TerrainCoverGeometryTemplate {
  const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
  if (normalized !== geometry) {
    geometry.dispose();
  }

  normalized.computeBoundingBox();
  const bounds = normalized.boundingBox;
  if (!bounds) {
    throw new Error("Failed to compute terrain cover geometry bounds.");
  }

  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
  normalized.translate(-centerX, 0, -centerZ);
  normalized.computeBoundingBox();
  normalized.computeBoundingSphere();

  const position = normalized.getAttribute("position");
  if (!(position instanceof THREE.BufferAttribute) || position.itemSize < 3) {
    throw new Error("Terrain cover geometry is missing positions.");
  }

  const localVertices: THREE.Vector3[] = [];
  const seen = new Set<string>();
  let baseRadius = 0;

  for (let index = 0; index < position.count; index += 1) {
    const vertex = new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index));
    const key = `${vertex.x.toFixed(4)}:${vertex.y.toFixed(4)}:${vertex.z.toFixed(4)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    localVertices.push(vertex);
    baseRadius = Math.max(baseRadius, Math.hypot(vertex.x, vertex.z));
  }

  return {
    geometry: normalized,
    localVertices,
    baseRadius
  };
}

function createCoverSpawnBounds(
  coverTemplate: TerrainCoverGeometryTemplate,
  x: number,
  z: number,
  rotX: number,
  rotY: number,
  rotZ: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
): CoverSpawnBounds {
  const transform = new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ)),
    new THREE.Vector3(scaleX, scaleY, scaleZ)
  );
  const temp = new THREE.Vector3();
  const points: TerrainPoint[] = [];
  let radius = 0;

  for (const localVertex of coverTemplate.localVertices) {
    temp.copy(localVertex).applyMatrix4(transform);
    points.push({ x: temp.x, z: temp.z });
    radius = Math.max(radius, Math.hypot(temp.x - x, temp.z - z));
  }

  return { points, radius: Math.max(radius, coverTemplate.baseRadius * Math.max(scaleX, scaleZ)) };
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
  const scale = tileScale * TILE_RELIEF_BOUNDARY_INSET;
  const points = getTileBoundaryPoints(tile, verticesById, {
    tileScale,
    insetScale: TILE_RELIEF_BOUNDARY_INSET
  }).map((point) => ({
    x: point.x,
    z: point.y
  }));

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
  boardPorts: readonly TerrainPort[],
  scale: number
): TerrainStructureMask {
  const edgesById = new Map(boardEdges.map((edge) => [edge.id, edge]));
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
  const ports = boardPorts
    .filter((port) => edgesById.get(port.edgeId)?.tileIds.includes(tile.id))
    .flatMap((port) => {
      const [leftId, rightId] = port.vertexIds;
      const left = verticesById.get(leftId);
      const right = verticesById.get(rightId);
      if (!left || !right) {
        return [];
      }

      const leftLocal = {
        x: (left.x - tile.x) * scale,
        z: (left.y - tile.y) * scale
      };
      const rightLocal = {
        x: (right.x - tile.x) * scale,
        z: (right.y - tile.y) * scale
      };
      const edgeCenter = {
        x: (leftLocal.x + rightLocal.x) * 0.5,
        z: (leftLocal.z + rightLocal.z) * 0.5
      };
      const normalizePoint = (point: TerrainPoint): TerrainPoint => {
        const length = Math.hypot(point.x, point.z);
        if (length < 0.0001) {
          return { x: 0, z: 1 };
        }
        return {
          x: point.x / length,
          z: point.z / length
        };
      };
      const outwardLeft = normalizePoint(leftLocal);
      const outwardRight = normalizePoint(rightLocal);
      const outward = normalizePoint({
        x: outwardLeft.x + outwardRight.x,
        z: outwardLeft.z + outwardRight.z
      });

      return [
        {
          x: edgeCenter.x + outward.x * 0.38,
          z: edgeCenter.z + outward.z * 0.38,
          radius: 0.58,
          falloff: 0.24
        },
        {
          x: edgeCenter.x + outward.x * 0.08,
          z: edgeCenter.z + outward.z * 0.08,
          radius: 0.24,
          falloff: 0.12
        }
      ];
    });

  return {
    roads,
    buildings,
    ports
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

  for (const port of mask.ports) {
    const distance = Math.hypot(localX - port.x, localZ - port.z);
    const portInfluence = 1 - smoothstep(port.radius, port.radius + port.falloff, distance);
    influence = Math.max(influence, portInfluence);
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
  return isPointInsidePolygon(x, z, polygon) && getPolygonEdgeClearance(x, z, polygon) >= edgePadding - 0.00001;
}

function isCoverBoundsInsidePolygon(
  bounds: CoverSpawnBounds,
  polygon: readonly TerrainPoint[],
  edgePadding: number
): boolean {
  return bounds.points.every((point) => isTerrainPointInside(point.x, point.z, polygon, edgePadding));
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
