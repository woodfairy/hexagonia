import type {
  BoardSize,
  EdgeView,
  GameConfig,
  PortType,
  PortView,
  Resource,
  TileView,
  VertexView
} from "@hexagonia/shared";
import { SeededRandom } from "./random.js";

export interface GeneratedBoard {
  tiles: TileView[];
  vertices: VertexView[];
  edges: EdgeView[];
  ports: PortView[];
}

export interface BoardGenerationInput {
  boardSize: GameConfig["boardSize"];
  setupMode: GameConfig["setupMode"];
  enabledExpansions: GameConfig["enabledExpansions"];
}

interface LayoutTile {
  q: number;
  r: number;
}

interface TileContent {
  resource: Resource | "desert";
  token: number | null;
}

interface BoardLayout {
  boardSize: BoardSize;
  tiles: LayoutTile[];
  resources: Array<Resource | "desert">;
  variableNumberTokens: number[];
  variablePlacementOrder: string[];
  portDistribution: PortType[];
  portSlotEdgeIndices: number[];
  beginnerLayout?: TileContent[];
  beginnerPortDistribution?: PortType[];
}

interface MutableVertex extends Omit<VertexView, "building" | "portType"> {
  portType: PortType | null;
}

interface MutableEdge extends Omit<EdgeView, "ownerId" | "color"> {}

const COUNTERCLOCKWISE_RING_DIRECTIONS = [
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 }
] as const;

const STANDARD_TILES: LayoutTile[] = createStandardCoords();
const EXTENDED_TILES: LayoutTile[] = createExtendedCoords();

const STANDARD_LAYOUT: BoardLayout = {
  boardSize: "standard",
  tiles: STANDARD_TILES,
  resources: [
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
  ],
  variableNumberTokens: [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11],
  variablePlacementOrder: createStandardVariablePlacementOrder(),
  portDistribution: [
    "generic",
    "generic",
    "generic",
    "generic",
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool"
  ],
  portSlotEdgeIndices: [0, 3, 6, 10, 13, 16, 20, 23, 26],
  beginnerLayout: [
    { resource: "desert", token: null },
    { resource: "wool", token: 11 },
    { resource: "ore", token: 9 },
    { resource: "brick", token: 6 },
    { resource: "wool", token: 3 },
    { resource: "lumber", token: 4 },
    { resource: "wool", token: 5 },
    { resource: "lumber", token: 10 },
    { resource: "grain", token: 5 },
    { resource: "brick", token: 12 },
    { resource: "lumber", token: 11 },
    { resource: "lumber", token: 8 },
    { resource: "grain", token: 2 },
    { resource: "brick", token: 9 },
    { resource: "ore", token: 4 },
    { resource: "wool", token: 10 },
    { resource: "ore", token: 6 },
    { resource: "grain", token: 3 },
    { resource: "grain", token: 8 }
  ],
  beginnerPortDistribution: [
    "generic",
    "generic",
    "generic",
    "generic",
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool"
  ]
};

const EXTENDED_LAYOUT: BoardLayout = {
  boardSize: "extended",
  tiles: EXTENDED_TILES,
  resources: [
    "brick",
    "brick",
    "brick",
    "brick",
    "brick",
    "lumber",
    "lumber",
    "lumber",
    "lumber",
    "lumber",
    "lumber",
    "ore",
    "ore",
    "ore",
    "ore",
    "ore",
    "grain",
    "grain",
    "grain",
    "grain",
    "grain",
    "grain",
    "wool",
    "wool",
    "wool",
    "wool",
    "wool",
    "wool",
    "desert",
    "desert"
  ],
  variableNumberTokens: [
    2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4,
    8, 10, 11, 12, 10, 5, 4, 9, 5, 9, 12, 3, 2, 6
  ],
  variablePlacementOrder: [
    toCoordKey(2, -3),
    toCoordKey(1, -3),
    toCoordKey(0, -3),
    toCoordKey(-1, -2),
    toCoordKey(-2, -1),
    toCoordKey(-3, 0),
    toCoordKey(-3, 1),
    toCoordKey(-3, 2),
    toCoordKey(-3, 3),
    toCoordKey(-2, 3),
    toCoordKey(-1, 3),
    toCoordKey(0, 2),
    toCoordKey(1, 1),
    toCoordKey(2, 0),
    toCoordKey(2, -1),
    toCoordKey(2, -2),
    toCoordKey(1, -2),
    toCoordKey(0, -2),
    toCoordKey(-1, -1),
    toCoordKey(-2, 0),
    toCoordKey(-2, 1),
    toCoordKey(-2, 2),
    toCoordKey(-1, 2),
    toCoordKey(0, 1),
    toCoordKey(1, 0),
    toCoordKey(1, -1),
    toCoordKey(0, -1),
    toCoordKey(-1, 0),
    toCoordKey(-1, 1),
    toCoordKey(0, 0)
  ],
  portDistribution: [
    "generic",
    "generic",
    "generic",
    "generic",
    "generic",
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool",
    "wool"
  ],
  portSlotEdgeIndices: [1, 4, 8, 11, 15, 18, 21, 25, 28, 32, 35]
};

const LAYOUTS: Record<BoardSize, BoardLayout> = {
  standard: STANDARD_LAYOUT,
  extended: EXTENDED_LAYOUT
};

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

export function createBoardGenerationInput(gameConfig: GameConfig): BoardGenerationInput {
  return {
    boardSize: gameConfig.boardSize,
    setupMode: gameConfig.setupMode,
    enabledExpansions: [...gameConfig.enabledExpansions]
  };
}

export function generateBaseBoard(seed: string, gameConfig: GameConfig): GeneratedBoard {
  return generateBoard(seed, createBoardGenerationInput(gameConfig));
}

function generateBoard(seed: string, boardInput: BoardGenerationInput): GeneratedBoard {
  const layout = getBoardLayout(boardInput.boardSize);
  const rng = new SeededRandom(seed);
  const vertexByKey = new Map<string, MutableVertex>();
  const edgeByKey = new Map<string, MutableEdge>();
  const verticesById = new Map<string, MutableVertex>();
  const tiles: TileView[] = [];

  for (const [tileIndex, coord] of layout.tiles.entries()) {
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
  }

  applyTileContents(layout, boardInput, rng, tiles);

  const ports = assignPorts(layout, rng, edges, verticesById, boardInput.setupMode);
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

function getBoardLayout(boardSize: BoardSize): BoardLayout {
  return LAYOUTS[boardSize];
}

function applyTileContents(
  layout: BoardLayout,
  boardInput: BoardGenerationInput,
  rng: SeededRandom,
  tiles: TileView[]
): void {
  if (boardInput.setupMode === "beginner") {
    if (!layout.beginnerLayout) {
      throw new Error(`Beginner setup is not available for ${layout.boardSize}.`);
    }

    tiles.forEach((tile, index) => {
      const content = layout.beginnerLayout![index]!;
      tile.resource = content.resource;
      tile.token = content.token;
      tile.robber = content.resource === "desert";
    });
    return;
  }

  const assignedResources = rng.shuffle(layout.resources);
  const tileByCoord = new Map<string, TileView>();
  tiles.forEach((tile, index) => {
    const resource = assignedResources[index]!;
    tile.resource = resource;
    tile.token = null;
    tile.robber = resource === "desert";
    tileByCoord.set(toCoordKey(tile.q, tile.r), tile);
  });

  const tokenMap = new Map<string, number>();
  let tokenIndex = 0;
  for (const coordKey of layout.variablePlacementOrder) {
    const tile = tileByCoord.get(coordKey);
    if (!tile) {
      throw new Error(`Missing tile for placement order ${coordKey}.`);
    }
    if (tile.resource === "desert") {
      continue;
    }
    tokenMap.set(tile.id, layout.variableNumberTokens[tokenIndex]!);
    tokenIndex += 1;
  }

  for (const tile of tiles) {
    tile.token = tile.resource === "desert" ? null : tokenMap.get(tile.id)!;
  }
}

function assignPorts(
  layout: BoardLayout,
  rng: SeededRandom,
  edges: MutableEdge[],
  verticesById: Map<string, MutableVertex>,
  setupMode: GameConfig["setupMode"]
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
  const portTypes =
    setupMode === "beginner" && layout.beginnerPortDistribution
      ? layout.beginnerPortDistribution
      : rng.shuffle(layout.portDistribution);

  return layout.portSlotEdgeIndices
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

function createStandardCoords(): LayoutTile[] {
  const coords: LayoutTile[] = [];
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

function createExtendedCoords(): LayoutTile[] {
  const rows = [
    { r: -3, qStart: 0, qEnd: 2 },
    { r: -2, qStart: -1, qEnd: 2 },
    { r: -1, qStart: -2, qEnd: 2 },
    { r: 0, qStart: -3, qEnd: 2 },
    { r: 1, qStart: -3, qEnd: 1 },
    { r: 2, qStart: -3, qEnd: 0 },
    { r: 3, qStart: -3, qEnd: -1 }
  ] as const;

  return rows.flatMap(({ r, qStart, qEnd }) => {
    const row: LayoutTile[] = [];
    for (let q = qStart; q <= qEnd; q += 1) {
      row.push({ q, r });
    }
    return row;
  });
}

function createStandardVariablePlacementOrder(): string[] {
  const outerRing = createCounterclockwiseRing(2).map((coord) => toCoordKey(coord.q, coord.r));
  const innerRing = createCounterclockwiseRing(1).map((coord) => toCoordKey(coord.q, coord.r));
  return [...outerRing, ...innerRing, toCoordKey(0, 0)];
}

function createCounterclockwiseRing(radius: number): LayoutTile[] {
  const coords: LayoutTile[] = [];
  let q = radius;
  let r = -radius;

  for (const direction of COUNTERCLOCKWISE_RING_DIRECTIONS) {
    for (let step = 0; step < radius; step += 1) {
      coords.push({ q, r });
      q += direction.q;
      r += direction.r;
    }
  }

  return coords;
}

function axialToWorld(q: number, r: number): [number, number] {
  const x = HEX_WIDTH * (q + r / 2);
  const y = HEX_HEIGHT * 0.75 * r;
  return [x, y];
}

function edgeCenter(edge: MutableEdge, verticesById: Map<string, MutableVertex>): [number, number] {
  const [a, b] = edge.vertexIds;
  const left = verticesById.get(a)!;
  const right = verticesById.get(b)!;
  return [(left.x + right.x) / 2, (left.y + right.y) / 2];
}

function toCoordKey(q: number, r: number): string {
  return `${q}:${r}`;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function sortId(left: string, right: string): number {
  const leftValue = Number(left.split("-").at(-1));
  const rightValue = Number(right.split("-").at(-1));
  return leftValue - rightValue;
}
