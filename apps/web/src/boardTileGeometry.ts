import * as THREE from "three";

export interface TileGeometryTileLike {
  x: number;
  y: number;
  vertexIds: string[];
}

export interface TileGeometryVertexLike {
  x: number;
  y: number;
}

export type TileGeometryVerticesById<TVertex extends TileGeometryVertexLike = TileGeometryVertexLike> = Map<string, TVertex>;

export const TILE_RELIEF_BOUNDARY_INSET = 0.985;

interface TileBoundaryPointOptions {
  tileScale?: number;
  insetScale?: number;
  worldSpace?: boolean;
}

export function getTileBoundaryPoints<TTile extends TileGeometryTileLike, TVertex extends TileGeometryVertexLike>(
  tile: TTile,
  verticesById: TileGeometryVerticesById<TVertex>,
  options: TileBoundaryPointOptions = {}
): THREE.Vector2[] {
  const tileScale = options.tileScale ?? 1;
  const insetScale = options.insetScale ?? 1;
  const scale = tileScale * insetScale;

  return tile.vertexIds.map((vertexId) => {
    const vertex = verticesById.get(vertexId);
    if (!vertex) {
      throw new Error(`Missing tile vertex: ${vertexId}`);
    }

    const localX = (vertex.x - tile.x) * scale;
    const localY = (vertex.y - tile.y) * scale;
    return options.worldSpace
      ? new THREE.Vector2(tile.x + localX, tile.y + localY)
      : new THREE.Vector2(localX, localY);
  });
}

export function createTileShapeKey<TTile extends TileGeometryTileLike, TVertex extends TileGeometryVertexLike>(
  tile: TTile,
  verticesById: TileGeometryVerticesById<TVertex>
): string {
  return getTileBoundaryPoints(tile, verticesById)
    .map((point) => `${point.x.toFixed(3)}:${point.y.toFixed(3)}`)
    .join("|");
}

export function createTileShape<TTile extends TileGeometryTileLike, TVertex extends TileGeometryVertexLike>(
  tile: TTile,
  verticesById: TileGeometryVerticesById<TVertex>,
  scale = 1
): THREE.Shape {
  const shape = new THREE.Shape();
  const points = getTileBoundaryPoints(tile, verticesById, { tileScale: scale });
  points.forEach((point, index) => {
    if (index === 0) {
      shape.moveTo(point.x, point.y);
      return;
    }
    shape.lineTo(point.x, point.y);
  });
  shape.closePath();
  return shape;
}

export function createTileClipPlanes<TTile extends TileGeometryTileLike, TVertex extends TileGeometryVertexLike>(
  tile: TTile,
  verticesById: TileGeometryVerticesById<TVertex>,
  tileScale = 1,
  insetScale = TILE_RELIEF_BOUNDARY_INSET
): THREE.Plane[] {
  const points = getTileBoundaryPoints(tile, verticesById, {
    tileScale,
    insetScale,
    worldSpace: true
  });
  const orientation = Math.sign(getTilePolygonSignedArea(points)) || 1;

  return points.map((current, index) => {
    const next = points[(index + 1) % points.length]!;
    const edgeX = next.x - current.x;
    const edgeZ = next.y - current.y;
    const inwardNormal =
      orientation >= 0 ? new THREE.Vector3(-edgeZ, 0, edgeX) : new THREE.Vector3(edgeZ, 0, -edgeX);
    inwardNormal.normalize();
    return new THREE.Plane().setFromNormalAndCoplanarPoint(inwardNormal, new THREE.Vector3(current.x, 0, current.y));
  });
}

export function applyTileObjectClipPlanes<TTile extends TileGeometryTileLike, TVertex extends TileGeometryVertexLike>(
  root: THREE.Object3D,
  tile: TTile,
  verticesById: TileGeometryVerticesById<TVertex>,
  tileScale = 1,
  insetScale = TILE_RELIEF_BOUNDARY_INSET
): void {
  const clipPlanes = createTileClipPlanes(tile, verticesById, tileScale, insetScale);
  const clippedMaterialCache = new Map<THREE.Material, THREE.Material>();

  const getClippedMaterial = (material: THREE.Material): THREE.Material => {
    const existing = clippedMaterialCache.get(material);
    if (existing) {
      return existing;
    }

    const clippedMaterial = material.clone();
    clippedMaterial.clippingPlanes = clipPlanes;
    clippedMaterial.clipShadows = true;
    clippedMaterial.needsUpdate = true;
    clippedMaterialCache.set(material, clippedMaterial);
    return clippedMaterial;
  };

  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh || entry instanceof THREE.InstancedMesh)) {
      return;
    }

    entry.material = Array.isArray(entry.material)
      ? entry.material.map((material) => getClippedMaterial(material))
      : getClippedMaterial(entry.material);
  });
}

function getTilePolygonSignedArea(points: readonly THREE.Vector2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}
