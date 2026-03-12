import type {
  BoardSiteView,
  BoardSize,
  EdgeView,
  GameConfig,
  LayoutMode,
  PortType,
  PortView,
  RulesFamily,
  ScenarioId,
  ScenarioMarkerView,
  Resource,
  TileView,
  VertexView
} from "@hexagonia/shared";
import { SeededRandom } from "./random.js";
import {
  applySeafarersTileContents,
  createSeafarersScenarioFeatures,
  finalizeSeafarersBoard,
  getSeafarersBoardLayout
} from "./seafarersBoard.js";

export interface GeneratedBoard {
  tiles: TileView[];
  vertices: VertexView[];
  edges: EdgeView[];
  ports: PortView[];
  sites?: BoardSiteView[];
  scenarioMarkers?: ScenarioMarkerView[];
}

export interface BoardGenerationInput {
  rulesFamily: RulesFamily;
  scenarioId: ScenarioId;
  layoutMode: LayoutMode;
  playerCount: number;
  boardSize: GameConfig["boardSize"];
  setupMode: GameConfig["setupMode"];
  enabledExpansions: GameConfig["enabledExpansions"];
}

export interface BoardLayoutTile {
  q: number;
  r: number;
}

export interface PortPlacementRef {
  tileCoord: string;
  side: number;
  type?: PortType;
}

interface TileContent {
  resource: Resource | "desert";
  token: number | null;
}

export interface BoardGeometryLayout {
  boardSize: BoardSize;
  tiles: BoardLayoutTile[];
  portDistribution: PortType[];
  portSlotEdgeIndices?: number[];
  explicitPortPlacements?: PortPlacementRef[];
  beginnerPortDistribution?: PortType[];
}

interface BaseBoardLayout extends BoardGeometryLayout {
  contentMode: "base";
  resources: Array<Resource | "desert">;
  variableNumberTokens: number[];
  variablePlacementOrder: string[];
  beginnerLayout?: TileContent[];
}

export interface ScenarioBoardLayout extends BoardGeometryLayout {
  contentMode: "scenario";
}

type BoardLayout = BaseBoardLayout | ScenarioBoardLayout;

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

const STANDARD_TILES: BoardLayoutTile[] = createStandardCoords();
const EXTENDED_TILES: BoardLayoutTile[] = createExtendedCoords();

const STANDARD_LAYOUT: BaseBoardLayout = {
  contentMode: "base",
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

const EXTENDED_LAYOUT: BaseBoardLayout = {
  contentMode: "base",
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

const LAYOUTS: Record<BoardSize, BaseBoardLayout> = {
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

export function createBoardGenerationInput(
  gameConfig: GameConfig,
  playerCount = 4
): BoardGenerationInput {
  return {
    rulesFamily: gameConfig.rulesFamily,
    scenarioId: gameConfig.scenarioId,
    layoutMode: gameConfig.layoutMode,
    playerCount,
    boardSize: gameConfig.boardSize,
    setupMode: gameConfig.setupMode,
    enabledExpansions: [...gameConfig.enabledExpansions]
  };
}

export function generateBaseBoard(
  seed: string,
  gameConfig: GameConfig,
  playerCount = 4
): GeneratedBoard {
  return generateBoard(seed, createBoardGenerationInput(gameConfig, playerCount));
}

function generateBoard(seed: string, boardInput: BoardGenerationInput): GeneratedBoard {
  const layout = resolveBoardLayout(boardInput);
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
      kind: "land",
      terrain: "desert",
      token: null,
      robber: false,
      occupant: null,
      hidden: false,
      discovered: true,
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

  if (layout.contentMode === "scenario") {
    applySeafarersTileContents(
      {
        boardSize: boardInput.boardSize,
        scenarioId: boardInput.scenarioId,
        layoutMode: boardInput.layoutMode,
        playerCount: boardInput.playerCount
      },
      rng,
      tiles
    );
  } else {
    applyTileContents(layout, boardInput, rng, tiles);
  }

  const ports = assignPorts(layout, rng, edges, verticesById, boardInput.setupMode, boardInput.layoutMode);
  const portByVertexId = new Map<string, PortType>();
  for (const port of ports) {
    for (const vertexId of port.vertexIds) {
      portByVertexId.set(vertexId, port.type);
    }
  }

  const vertices: VertexView[] = [...verticesById.values()]
    .map((vertex) => ({
      ...vertex,
      tileIds: vertex.tileIds.sort(sortId),
      edgeIds: vertex.edgeIds.sort(sortId),
      adjacentVertexIds: vertex.adjacentVertexIds.sort(sortId),
      building: null,
      portType: portByVertexId.get(vertex.id) ?? null,
      site: null,
      islandId: "island-1",
      coastal: (portByVertexId.get(vertex.id) ?? null) !== null
    }))
    .sort((left, right) => sortId(left.id, right.id));

  const finalizedEdges: EdgeView[] = edges
    .map((edge) => ({
      ...edge,
      tileIds: edge.tileIds.sort(sortId),
      ownerId: null,
      color: null,
      routeType: null,
      routeZone: "land",
      roadAllowed: true,
      shipAllowed: false,
      movable: false,
      blockedByPirate: false,
      placedOnTurn: null
    }))
    .sort((left, right) => sortId(left.id, right.id));

  let sites: BoardSiteView[] = [];
  let scenarioMarkers: ScenarioMarkerView[] = [];
  if (boardInput.rulesFamily === "seafarers") {
    finalizeSeafarersBoard(tiles, vertices, finalizedEdges);
    const features = createSeafarersScenarioFeatures(
      {
        scenarioId: boardInput.scenarioId,
        boardSize: boardInput.boardSize,
        layoutMode: boardInput.layoutMode,
        playerCount: boardInput.playerCount
      },
      tiles,
      vertices,
      finalizedEdges
    );
    sites = features.sites;
    scenarioMarkers = features.scenarioMarkers;
  }

  return {
    tiles,
    vertices,
    edges: finalizedEdges,
    ports,
    sites,
    scenarioMarkers
  };
}

export function getBaseBoardLayout(boardSize: BoardSize): BaseBoardLayout {
  return LAYOUTS[boardSize]!;
}

function resolveBoardLayout(boardInput: BoardGenerationInput): BoardLayout {
  if (boardInput.rulesFamily === "seafarers") {
    return getSeafarersBoardLayout({
      boardSize: boardInput.boardSize,
      scenarioId: boardInput.scenarioId,
      layoutMode: boardInput.layoutMode,
      playerCount: boardInput.playerCount
    });
  }

  return getBaseBoardLayout(boardInput.boardSize);
}

function applyTileContents(
  layout: BaseBoardLayout,
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
      tile.terrain = content.resource;
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
    tile.terrain = resource;
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
  setupMode: GameConfig["setupMode"],
  layoutMode: LayoutMode
): PortView[] {
  if (layout.explicitPortPlacements && layout.explicitPortPlacements.length > 0) {
    return assignExplicitPorts(layout, rng, edges, verticesById, setupMode, layoutMode);
  }

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
    layout.contentMode === "base"
      ? setupMode === "beginner" && layout.beginnerPortDistribution
        ? layout.beginnerPortDistribution
        : rng.shuffle(layout.portDistribution)
      : layoutMode === "official_variable"
        ? rng.shuffle(layout.portDistribution)
        : [...layout.portDistribution];
  const portSlotEdgeIndices =
    layout.portSlotEdgeIndices ??
    createDistributedPortSlotEdgeIndices(boundaryEdges.length, portTypes.length);

  return portSlotEdgeIndices
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

function assignExplicitPorts(
  layout: BoardLayout,
  rng: SeededRandom,
  edges: MutableEdge[],
  verticesById: Map<string, MutableVertex>,
  setupMode: GameConfig["setupMode"],
  layoutMode: LayoutMode
): PortView[] {
  const portPlacements = layout.explicitPortPlacements;
  if (!portPlacements || portPlacements.length === 0) {
    return [];
  }

  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const tilesByCoord = new Map(
    layout.tiles.map((tile, index) => [toCoordKey(tile.q, tile.r), { id: `tile-${index}`, tile }] as const)
  );

  const portTypes =
    layout.contentMode === "base"
      ? setupMode === "beginner" && layout.beginnerPortDistribution
        ? layout.beginnerPortDistribution
        : rng.shuffle(layout.portDistribution)
      : layoutMode === "official_variable"
        ? rng.shuffle(layout.portDistribution)
        : portPlacements.map((placement, index) => placement.type ?? layout.portDistribution[index]!);

  return portPlacements
    .map((placement, portIndex) => {
      const tileEntry = tilesByCoord.get(placement.tileCoord);
      if (!tileEntry) {
        throw new Error(`Missing tile ${placement.tileCoord} for explicit port placement.`);
      }
      const edgeId = resolveTileEdgeId(edgesById, verticesById, tileEntry.id, tileEntry.tile, placement.side);
      const edge = edgesById.get(edgeId);
      if (!edge) {
        throw new Error(`Missing edge ${edgeId} for explicit port placement.`);
      }
      return {
        id: `port-${portIndex}`,
        edgeId: edge.id,
        vertexIds: [edge.vertexIds[0], edge.vertexIds[1]] as [string, string],
        type: portTypes[portIndex]!
      };
    })
    .sort((left, right) => sortId(left.id, right.id));
}

function resolveTileEdgeId(
  edgesById: Map<string, MutableEdge>,
  verticesById: Map<string, MutableVertex>,
  tileId: string,
  tile: BoardLayoutTile,
  side: number
): string {
  const matchingEdges = [...edgesById.values()].filter((edge) => edge.tileIds.includes(tileId));
  const [centerX, centerY] = axialToWorld(tile.q, tile.r);
  const leftCorner = CORNER_OFFSETS[side];
  const rightCorner = CORNER_OFFSETS[(side + 1) % CORNER_OFFSETS.length];
  if (!leftCorner || !rightCorner) {
    throw new Error(`Invalid tile side ${side}.`);
  }
  const expectedX = round4((centerX + ((leftCorner[0] + rightCorner[0]) / 2) * HEX_RADIUS) * X_SCALE);
  const expectedY = round4((centerY + ((leftCorner[1] + rightCorner[1]) / 2) * HEX_RADIUS) * Y_SCALE);
  const edgeId =
    matchingEdges
      .map((edge) => ({
        edge,
        distance:
          Math.abs(edgeCenter(edge, verticesById)[0] - expectedX) +
          Math.abs(edgeCenter(edge, verticesById)[1] - expectedY)
      }))
      .sort((left, right) => left.distance - right.distance || sortId(left.edge.id, right.edge.id))[0]?.edge.id ??
    null;
  if (!edgeId) {
    throw new Error(`Missing side ${side} for tile ${tileId}.`);
  }
  return edgeId;
}

function createDistributedPortSlotEdgeIndices(
  boundaryEdgeCount: number,
  portCount: number
): number[] {
  if (portCount === 0) {
    return [];
  }
  if (portCount > boundaryEdgeCount) {
    throw new Error("Port count exceeds available boundary edges.");
  }

  const step = boundaryEdgeCount / portCount;
  const offset = Math.floor(step / 2);
  const usedIndices = new Set<number>();
  const indices: number[] = [];

  for (let portIndex = 0; portIndex < portCount; portIndex += 1) {
    let edgeIndex = Math.floor(portIndex * step + offset) % boundaryEdgeCount;
    while (usedIndices.has(edgeIndex)) {
      edgeIndex = (edgeIndex + 1) % boundaryEdgeCount;
    }
    usedIndices.add(edgeIndex);
    indices.push(edgeIndex);
  }

  return indices;
}

function createStandardCoords(): BoardLayoutTile[] {
  const coords: BoardLayoutTile[] = [];
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

function createExtendedCoords(): BoardLayoutTile[] {
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
    const row: BoardLayoutTile[] = [];
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

function createCounterclockwiseRing(radius: number): BoardLayoutTile[] {
  const coords: BoardLayoutTile[] = [];
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
