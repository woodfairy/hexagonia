import type { MatchSnapshot, Resource } from "@hexagonia/shared";
import * as THREE from "three";
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
  coverKind: "grass" | "stalk" | "tree" | "rock" | "clay" | "pebble";
  coverCount: number;
  coverMinScale: number;
  coverMaxScale: number;
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
const SURFACE_GRID_RESOLUTION = 28;
const COVER_ATTEMPT_MULTIPLIER = 7;

const BIOME_RECIPES: Record<TerrainResource, TerrainBiomeRecipe> = {
  wool: {
    baseColor: tintColor(TILE_COLORS.wool, -0.08),
    coverColor: "#5b993a",
    accentColor: "#97cb68",
    roughness: 0.82,
    metalness: 0.01,
    coverKind: "grass",
    coverCount: 220,
    coverMinScale: 0.62,
    coverMaxScale: 1.5,
    coverEdgePadding: 0.07,
    featureCount: 11,
    pathDepth: 0.022
  },
  grain: {
    baseColor: tintColor(TILE_COLORS.grain, -0.04),
    coverColor: "#d6b256",
    accentColor: "#f1d886",
    roughness: 0.78,
    metalness: 0.01,
    coverKind: "stalk",
    coverCount: 170,
    coverMinScale: 0.7,
    coverMaxScale: 1.34,
    coverEdgePadding: 0.08,
    featureCount: 8,
    pathDepth: 0.016
  },
  lumber: {
    baseColor: tintColor(TILE_COLORS.lumber, -0.12),
    coverColor: "#2e6c2f",
    accentColor: "#4d8a3d",
    roughness: 0.9,
    metalness: 0.01,
    coverKind: "tree",
    coverCount: 58,
    coverMinScale: 0.8,
    coverMaxScale: 1.3,
    coverEdgePadding: 0.13,
    featureCount: 12,
    pathDepth: 0.02
  },
  ore: {
    baseColor: tintColor(TILE_COLORS.ore, -0.12),
    coverColor: "#6a7380",
    accentColor: "#bfdcff",
    roughness: 0.88,
    metalness: 0.04,
    coverKind: "rock",
    coverCount: 64,
    coverMinScale: 0.72,
    coverMaxScale: 1.45,
    coverEdgePadding: 0.08,
    featureCount: 10,
    pathDepth: 0.014
  },
  brick: {
    baseColor: tintColor(TILE_COLORS.brick, -0.1),
    coverColor: "#8f553f",
    accentColor: "#bc7b61",
    roughness: 0.92,
    metalness: 0.01,
    coverKind: "clay",
    coverCount: 86,
    coverMinScale: 0.68,
    coverMaxScale: 1.38,
    coverEdgePadding: 0.08,
    featureCount: 9,
    pathDepth: 0.02
  },
  desert: {
    baseColor: tintColor(TILE_COLORS.desert, -0.02),
    coverColor: "#caa26a",
    accentColor: "#edd29d",
    roughness: 0.94,
    metalness: 0,
    coverKind: "pebble",
    coverCount: 46,
    coverMinScale: 0.62,
    coverMaxScale: 1.26,
    coverEdgePadding: 0.08,
    featureCount: 7,
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
    const material = new THREE.MeshStandardMaterial({
      color: terrainBundle.appearance.topTint,
      map: terrainBundle.colorMap,
      ...(terrainBundle.roughnessMap ? { roughnessMap: terrainBundle.roughnessMap } : {}),
      ...(terrainBundle.bumpMap ? { bumpMap: terrainBundle.bumpMap } : {}),
      roughness: Math.max(terrainBundle.appearance.roughness - 0.03, recipe.roughness),
      metalness: terrainBundle.appearance.metalness,
      bumpScale: terrainBundle.appearance.bumpScale * 0.58,
      emissive: new THREE.Color(active ? tintColor(terrainBundle.appearance.topTint, 0.1) : terrainBundle.appearance.emissive),
      emissiveIntensity: active ? 0.09 : 0.02
    });
    markMaterialTexturesShared(material);
    return material;
  }

  return new THREE.MeshStandardMaterial({
    color: recipe.baseColor,
    roughness: recipe.roughness,
    metalness: recipe.metalness,
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

    const edgeClearance = getPolygonEdgeClearance(x, z, polygon.points);
    if (edgeClearance < biome.recipe.coverEdgePadding) {
      continue;
    }

    const structureInfluence = sampleStructureInfluence(structureMask, x, z);
    if (structureInfluence > 0.22 && random() < structureInfluence * 0.9) {
      continue;
    }

    const scale = THREE.MathUtils.lerp(biome.recipe.coverMinScale, biome.recipe.coverMaxScale, random());
    const alignedY =
      biome.recipe.coverKind === "stalk" || biome.recipe.coverKind === "grass"
        ? biome.primaryAngle + (random() - 0.5) * 0.6
        : biome.recipe.coverKind === "tree"
          ? biome.secondaryAngle + (random() - 0.5) * 0.4
          : random() * Math.PI * 2;

    spawns.push({
      x,
      z,
      rotX: biome.recipe.coverKind === "rock" || biome.recipe.coverKind === "clay" || biome.recipe.coverKind === "pebble" ? (random() - 0.5) * 0.34 : 0,
      rotY: alignedY,
      rotZ: biome.recipe.coverKind === "grass" || biome.recipe.coverKind === "stalk" ? (random() - 0.5) * 0.22 : (random() - 0.5) * 0.14,
      scaleX: biome.recipe.coverKind === "tree" ? scale * 0.9 : scale * THREE.MathUtils.lerp(0.8, 1.1, random()),
      scaleY: scale * (biome.recipe.coverKind === "pebble" ? 0.5 : biome.recipe.coverKind === "rock" || biome.recipe.coverKind === "clay" ? 0.72 : 1.18),
      scaleZ: biome.recipe.coverKind === "tree" ? scale * 0.92 : scale * THREE.MathUtils.lerp(0.8, 1.1, random()),
      offsetY:
        biome.recipe.coverKind === "tree"
          ? 0.14 * scale
          : biome.recipe.coverKind === "grass"
            ? 0.06 * scale
            : biome.recipe.coverKind === "stalk"
              ? 0.08 * scale
              : 0.03 * scale
    });
  }

  return spawns;
}

function createCoverGeometry(kind: TerrainBiomeRecipe["coverKind"]): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  switch (kind) {
    case "grass":
      geometry = new THREE.ConeGeometry(0.07, 0.32, 4);
      geometry.translate(0, 0.16, 0);
      return geometry;
    case "stalk":
      geometry = new THREE.CylinderGeometry(0.016, 0.04, 0.34, 5);
      geometry.translate(0, 0.17, 0);
      return geometry;
    case "tree":
      geometry = new THREE.ConeGeometry(0.2, 0.52, 5);
      geometry.translate(0, 0.26, 0);
      return geometry;
    case "rock":
      geometry = new THREE.DodecahedronGeometry(0.11, 0);
      geometry.translate(0, 0.11, 0);
      return geometry;
    case "clay":
      geometry = new THREE.CylinderGeometry(0.1, 0.14, 0.08, 6);
      geometry.translate(0, 0.04, 0);
      return geometry;
    case "pebble":
      geometry = new THREE.SphereGeometry(0.09, 7, 6);
      geometry.translate(0, 0.06, 0);
      return geometry;
  }
}

function createCoverMaterial(recipe: TerrainBiomeRecipe, active: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: recipe.coverColor,
    roughness: recipe.coverKind === "stalk" ? 0.7 : recipe.coverKind === "rock" ? 0.92 : 0.86,
    metalness: recipe.coverKind === "rock" ? 0.04 : 0.01,
    flatShading: recipe.coverKind === "tree" || recipe.coverKind === "rock" || recipe.coverKind === "clay" || recipe.coverKind === "pebble",
    emissive: new THREE.Color(active ? recipe.accentColor : tintColor(recipe.coverColor, -0.24)),
    emissiveIntensity: active ? 0.08 : 0.02
  });
}

function createSurfaceGeometry(
  polygon: TerrainPolygon,
  sampleHeightLocal: (localX: number, localZ: number) => number
): { geometry: THREE.BufferGeometry; maxHeight: number } {
  const width = Math.max(polygon.maxX - polygon.minX, 0.001);
  const depth = Math.max(polygon.maxZ - polygon.minZ, 0.001);
  const xSegments = Math.max(Math.round((width / Math.max(width, depth)) * SURFACE_GRID_RESOLUTION), 18);
  const zSegments = Math.max(Math.round((depth / Math.max(width, depth)) * SURFACE_GRID_RESOLUTION), 18);
  const xStep = width / xSegments;
  const zStep = depth / zSegments;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const grid = new Map<string, number>();
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const z = THREE.MathUtils.lerp(polygon.minZ, polygon.maxZ, zIndex / zSegments);
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const x = THREE.MathUtils.lerp(polygon.minX, polygon.maxX, xIndex / xSegments);
      if (!isTerrainPointInside(x, z, polygon.points, Math.max(xStep, zStep) * 0.72)) {
        continue;
      }

      const y = sampleHeightLocal(x, z);
      const vertexIndex = positions.length / 3;
      positions.push(x, y, z);
      uvs.push((x - polygon.minX) / width, (z - polygon.minZ) / depth);
      grid.set(`${xIndex}:${zIndex}`, vertexIndex);
      maxHeight = Math.max(maxHeight, y);
    }
  }

  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = grid.get(`${xIndex}:${zIndex}`);
      const b = grid.get(`${xIndex + 1}:${zIndex}`);
      const c = grid.get(`${xIndex}:${zIndex + 1}`);
      const d = grid.get(`${xIndex + 1}:${zIndex + 1}`);

      const x0 = THREE.MathUtils.lerp(polygon.minX, polygon.maxX, xIndex / xSegments);
      const x1 = THREE.MathUtils.lerp(polygon.minX, polygon.maxX, (xIndex + 1) / xSegments);
      const z0 = THREE.MathUtils.lerp(polygon.minZ, polygon.maxZ, zIndex / zSegments);
      const z1 = THREE.MathUtils.lerp(polygon.minZ, polygon.maxZ, (zIndex + 1) / zSegments);

      if (a !== undefined && b !== undefined && c !== undefined && isPointInsidePolygon((x0 + x1 + x0) / 3, (z0 + z0 + z1) / 3, polygon.points)) {
        indices.push(a, c, b);
      }
      if (b !== undefined && c !== undefined && d !== undefined && isPointInsidePolygon((x1 + x0 + x1) / 3, (z0 + z1 + z1) / 3, polygon.points)) {
        indices.push(b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

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
      macro = 0.052 + broadNoise * 0.028 + featureField * 0.86;
      micro = Math.abs(Math.sin(rotatedPrimary.x * 6.8 + biome.seed * 0.002)) * 0.024 + fineNoise * 0.012;
      break;
    case "grain":
      macro = 0.048 + broadNoise * 0.018 + featureField * 0.4;
      micro =
        Math.sin(rotatedPrimary.x * 8.6 + biome.seed * 0.0017) * 0.022 +
        Math.sin(rotatedPrimary.x * 17.4 + biome.seed * 0.0031) * 0.008 +
        fineNoise * 0.008;
      break;
    case "lumber":
      macro = 0.072 + broadNoise * 0.024 + featureField * 1.18;
      micro = ridgeNoise * 0.024 + Math.abs(fineNoise) * 0.012;
      break;
    case "ore":
      macro = 0.054 + Math.abs(Math.sin(rotatedPrimary.x * 3.3 + biome.seed * 0.0018)) * 0.07 + featureField * 1.2;
      micro = ridgeNoise * 0.034 + Math.abs(Math.sin((rotatedPrimary.x + rotatedPrimary.z) * 6.2)) * 0.014;
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
        0.05 +
        (Math.sin(rotatedPrimary.x * 1.8 + biome.seed * 0.0008) * 0.5 + 0.5) * 0.078 +
        Math.sin(rotatedPrimary.x * 3.9 + biome.seed * 0.0016) * 0.02 +
        featureField * 0.36;
      micro = Math.abs(Math.sin(rotatedSecondary.z * 11.4 + biome.seed * 0.0023)) * 0.01 + fineNoise * 0.006;
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
  return isPointInsidePolygon(x, z, polygon) || getPolygonEdgeClearance(x, z, polygon) <= edgePadding;
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
