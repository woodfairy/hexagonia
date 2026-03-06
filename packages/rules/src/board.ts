import type { EdgeView, PortType, PortView, Resource, TileView, VertexView } from "@hexagonia/shared";
import { SeededRandom } from "./random.js";

export interface GeneratedBoard {
  tiles: TileView[];
  vertices: VertexView[];
  edges: EdgeView[];
  ports: PortView[];
}

const LAND_RESOURCES: Array<Resource | "desert"> = [
  "brick",
  "brick",
  "brick",
  "lumber",
  "lumber",
  "lumber",
  "lumber",
  "ore",
  "ore",
  "ore",
  "grain",
  "grain",
  "grain",
  "grain",
  "wool",
  "wool",
  "wool",
  "wool",
  "desert"
];

const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORT_DISTRIBUTION: PortType[] = [
  "generic",
  "generic",
  "generic",
  "generic",
  "brick",
  "lumber",
  "ore",
  "grain",
  "wool"
];

interface MutableVertex extends Omit<VertexView, "building" | "portType"> {
  portType: PortType | null;
}

interface MutableEdge extends Omit<EdgeView, "ownerId" | "color"> {}

const HEX_RADIUS = 1;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const HEX_HEIGHT = 2 * HEX_RADIUS;
const X_SCALE = 4.8;
const Y_SCALE = 4.2;
const CORNER_OFFSETS = [
  [Math.cos(-Math.PI / 6), Math.sin(-Math.PI / 6)],
  [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)],
  [Math.cos(Math.PI / 2), Math.sin(Math.PI / 2)],
  [Math.cos((5 * Math.PI) / 6), Math.sin((5 * Math.PI) / 6)],
  [Math.cos((7 * Math.PI) / 6), Math.sin((7 * Math.PI) / 6)],
  [Math.cos((3 * Math.PI) / 2), Math.sin((3 * Math.PI) / 2)]
] as const;

export function generateBaseBoard(seed: string): GeneratedBoard {
  const rng = new SeededRandom(seed);
  const tileCoords = createRadiusTwoCoords();
  const tileNeighbors = new Map<string, Set<string>>();
  const vertexByKey = new Map<string, MutableVertex>();
  const edgeByKey = new Map<string, MutableEdge>();
  const verticesById = new Map<string, MutableVertex>();
  const tiles: TileView[] = [];

  for (const [tileIndex, coord] of tileCoords.entries()) {
    const tileId = `tile-${tileIndex}`;
    const [cx, cy] = axialToWorld(coord.q, coord.r);
    const vertexIds: string[] = [];
    const edgeIds: string[] = [];

    for (let cornerIndex = 0; cornerIndex < CORNER_OFFSETS.length; cornerIndex += 1) {
      const offset = CORNER_OFFSETS[cornerIndex]!;
      const vx = round4(cx + offset[0] * HEX_RADIUS);
      const vy = round4(cy + offset[1] * HEX_RADIUS);
      const vertexKey = `${vx}:${vy}`;
      const vertexId = `vertex-${vertexByKey.size}`;

      if (!vertexByKey.has(vertexKey)) {
        const vertex: MutableVertex = {
          id: vertexId,
          x: vx * X_SCALE,
          y: vy * Y_SCALE,
          tileIds: [],
          edgeIds: [],
          adjacentVertexIds: [],
          portType: null
        };
        vertexByKey.set(vertexKey, vertex);
        verticesById.set(vertex.id, vertex);
      }

      const vertex = vertexByKey.get(vertexKey)!;
      vertex.tileIds.push(tileId);
      vertexIds.push(vertex.id);
    }

    for (let cornerIndex = 0; cornerIndex < vertexIds.length; cornerIndex += 1) {
      const a = vertexIds[cornerIndex]!;
      const b = vertexIds[(cornerIndex + 1) % vertexIds.length]!;
      const edgeKey = [a, b].sort().join("|");
      const edgeId = `edge-${edgeByKey.size}`;

      if (!edgeByKey.has(edgeKey)) {
        edgeByKey.set(edgeKey, {
          id: edgeId,
          vertexIds: [a, b],
          tileIds: []
        });
      }

      const edge = edgeByKey.get(edgeKey)!;
      edge.tileIds.push(tileId);
      edgeIds.push(edge.id);
    }

    tiles.push({
      id: tileId,
      q: coord.q,
      r: coord.r,
      x: round4(cx * X_SCALE),
      y: round4(cy * Y_SCALE),
      resource: "desert",
      token: null,
      robber: false,
      vertexIds,
      edgeIds
    });
  }

  const edges = [...edgeByKey.values()];
  for (const edge of edges) {
    const [a, b] = edge.vertexIds;
    const vertexA = verticesById.get(a)!;
    const vertexB = verticesById.get(b)!;
    vertexA.edgeIds.push(edge.id);
    vertexB.edgeIds.push(edge.id);

    if (!vertexA.adjacentVertexIds.includes(vertexB.id)) {
      vertexA.adjacentVertexIds.push(vertexB.id);
    }
    if (!vertexB.adjacentVertexIds.includes(vertexA.id)) {
      vertexB.adjacentVertexIds.push(vertexA.id);
    }

    if (edge.tileIds.length === 2) {
      const [left, right] = edge.tileIds as [string, string];
      if (!tileNeighbors.has(left)) {
        tileNeighbors.set(left, new Set());
      }
      if (!tileNeighbors.has(right)) {
        tileNeighbors.set(right, new Set());
      }
      tileNeighbors.get(left)!.add(right);
      tileNeighbors.get(right)!.add(left);
    }
  }

  const assignedResources = rng.shuffle(LAND_RESOURCES);
  tiles.forEach((tile, index) => {
    const resource = assignedResources[index]!;
    tile.resource = resource;
    tile.robber = resource === "desert";
  });

  const tokenMap = assignTokens(rng, tiles, tileNeighbors);
  for (const tile of tiles) {
    tile.token = tile.resource === "desert" ? null : tokenMap.get(tile.id)!;
  }

  const ports = assignPorts(rng, edges, verticesById);
  const portByVertexId = new Map<string, PortType>();
  for (const port of ports) {
    for (const vertexId of port.vertexIds) {
      portByVertexId.set(vertexId, port.type);
    }
  }

  const vertices = [...verticesById.values()]
    .map((vertex) => ({
      ...vertex,
      tileIds: vertex.tileIds.sort(sortId),
      edgeIds: vertex.edgeIds.sort(sortId),
      adjacentVertexIds: vertex.adjacentVertexIds.sort(sortId),
      building: null,
      portType: portByVertexId.get(vertex.id) ?? null
    }))
    .sort((left, right) => sortId(left.id, right.id));

  return {
    tiles,
    vertices,
    edges: edges
      .map((edge) => ({
        ...edge,
        tileIds: edge.tileIds.sort(sortId),
        ownerId: null,
        color: null
      }))
      .sort((left, right) => sortId(left.id, right.id)),
    ports
  };
}

function createRadiusTwoCoords(): Array<{ q: number; r: number }> {
  const coords: Array<{ q: number; r: number }> = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 2) {
        coords.push({ q, r });
      }
    }
  }

  return coords.sort((left, right) => {
    if (left.r !== right.r) {
      return left.r - right.r;
    }
    return left.q - right.q;
  });
}

function axialToWorld(q: number, r: number): [number, number] {
  const x = HEX_WIDTH * (q + r / 2);
  const y = HEX_HEIGHT * 0.75 * r;
  return [x, y];
}

function assignTokens(
  rng: SeededRandom,
  tiles: TileView[],
  tileNeighbors: Map<string, Set<string>>
): Map<string, number> {
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const candidate = rng.shuffle(NUMBER_TOKENS);
    const mapping = new Map<string, number>();
    let numberIndex = 0;

    for (const tile of tiles) {
      if (tile.resource === "desert") {
        continue;
      }
      mapping.set(tile.id, candidate[numberIndex]!);
      numberIndex += 1;
    }

    let valid = true;
    for (const tile of tiles) {
      const token = mapping.get(tile.id);
      if (token !== 6 && token !== 8) {
        continue;
      }

      for (const neighborId of tileNeighbors.get(tile.id) ?? []) {
        const neighborToken = mapping.get(neighborId);
        if (neighborToken === 6 || neighborToken === 8) {
          valid = false;
          break;
        }
      }

      if (!valid) {
        break;
      }
    }

    if (valid) {
      return mapping;
    }
  }

  const fallback = new Map<string, number>();
  let tokenIndex = 0;
  for (const tile of tiles) {
    if (tile.resource === "desert") {
      continue;
    }
    fallback.set(tile.id, NUMBER_TOKENS[tokenIndex]!);
    tokenIndex += 1;
  }
  return fallback;
}

function assignPorts(
  rng: SeededRandom,
  edges: MutableEdge[],
  verticesById: Map<string, MutableVertex>
): PortView[] {
  const boundaryEdges = edges
    .filter((edge) => edge.tileIds.length === 1)
    .sort((left, right) => {
      const [leftX, leftY] = edgeCenter(left, verticesById);
      const [rightX, rightY] = edgeCenter(right, verticesById);
      const leftAngle = Math.atan2(leftY, leftX);
      const rightAngle = Math.atan2(rightY, rightX);
      return leftAngle - rightAngle;
    });

  const portTypes = rng.shuffle(PORT_DISTRIBUTION);
  const chosenIndices: number[] = [];
  const taken = new Set<number>();

  for (let index = 0; index < portTypes.length; index += 1) {
    let candidate = Math.floor((index * boundaryEdges.length) / portTypes.length);
    while (
      taken.has(candidate) ||
      taken.has((candidate + boundaryEdges.length - 1) % boundaryEdges.length) ||
      taken.has((candidate + 1) % boundaryEdges.length)
    ) {
      candidate = (candidate + 1) % boundaryEdges.length;
    }
    taken.add(candidate);
    chosenIndices.push(candidate);
  }

  return chosenIndices
    .map((edgeIndex, portIndex) => {
      const edge = boundaryEdges[edgeIndex]!;
      return {
        id: `port-${portIndex}`,
        edgeId: edge.id,
        vertexIds: [edge.vertexIds[0], edge.vertexIds[1]] as [string, string],
        type: portTypes[portIndex]!
      };
    })
    .sort((left, right) => sortId(left.id, right.id));
}

function edgeCenter(edge: MutableEdge, verticesById: Map<string, MutableVertex>): [number, number] {
  const [a, b] = edge.vertexIds;
  const left = verticesById.get(a)!;
  const right = verticesById.get(b)!;
  return [(left.x + right.x) / 2, (left.y + right.y) / 2];
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function sortId(left: string, right: string): number {
  const leftValue = Number(left.split("-").at(-1));
  const rightValue = Number(right.split("-").at(-1));
  return leftValue - rightValue;
}
