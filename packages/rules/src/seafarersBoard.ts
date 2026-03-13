import type {
  BoardSiteView,
  BoardSize,
  EdgeView,
  LayoutMode,
  PortType,
  PlayerColor,
  Resource,
  ResourceMap,
  ScenarioId,
  ScenarioMarkerView,
  TileKind,
  TileOccupant,
  TileTerrain,
  TileView,
  VertexView,
  WonderId,
  WonderRequirementId
} from "@hexagonia/shared";
import seafarersOfficialScenarioDataJson from "./seafarersOfficialScenarioData.json" with { type: "json" };
import seafarersOfficialFixedScenarioSpecsJson from "./seafarersOfficialFixedScenarioSpecs.json" with { type: "json" };
import type { BoardLayoutTile, PortPlacementRef, ScenarioBoardLayout } from "./board.js";
import { SeededRandom } from "./random.js";

interface ScenarioProfile {
  layoutCoords: string[];
  landCoords: string[];
  fogLandCoords: string[];
  fogSeaCoords: string[];
  goldCoords: string[];
  desertCoords: string[];
  initialRobberCoord: string | null;
  initialPirateCoord: string | null;
  portDistribution: PortType[];
  explicitPortPlacements?: readonly PortPlacementRef[];
  logicalIslandGroups: string[][];
  homeIslandCount: number;
  variableRobberPlacement: "fallback" | "token_12" | "first_desert";
  fixedTokenRules: ScenarioTokenRules;
  variableTokenRules: ScenarioTokenRules;
}

interface ScenarioTokenRules {
  forbidAdjacentRedNumbers: boolean;
  forbidRedNumbersOnGold: boolean;
  forbidLowNumbersOnForestOrPasture: boolean;
  forbiddenNumbersByCoord: Partial<Record<string, readonly number[]>>;
}

interface ScenarioFeatures {
  sites: BoardSiteView[];
  scenarioMarkers: ScenarioMarkerView[];
}

interface IslandInfo {
  id: string;
  tileIds: string[];
  vertexIds: string[];
  coastalVertexIds: string[];
  coastalEdgeIds: string[];
  size: number;
  centroidX: number;
  centroidY: number;
}

interface WonderConfig {
  wonderId: WonderId;
  requirementId: WonderRequirementId;
  buildCost: ResourceMap;
}

type TileCornerIndex = 0 | 1 | 2 | 3 | 4 | 5;
type TileSideIndex = 0 | 1 | 2 | 3 | 4 | 5;

interface TileVertexRefSpec {
  tileCoord: string;
  corner: TileCornerIndex;
}

interface TileEdgeRefSpec extends PortPlacementRef {
  side: TileSideIndex;
}

interface OfficialTileContentSpec {
  terrain: TileTerrain;
  token?: number | null;
  kind?: TileKind;
  hidden?: boolean;
  robber?: boolean;
  occupant?: TileOccupant | null;
}

type OfficialVillageSiteSpec = {
  type: "village";
  ref?: TileVertexRefSpec;
  edgeRef?: TileEdgeRefSpec;
  numberToken?: number;
  clothSupply?: number;
  initialClothSupply?: number;
};

type OfficialSiteSpec =
  | OfficialVillageSiteSpec
  | {
      type: "landing";
      ref: TileVertexRefSpec;
    }
  | {
      type: "fortress";
      ref: TileVertexRefSpec;
      pirateLairCount?: number;
    }
  | {
      type: "wonder";
      ref: TileVertexRefSpec;
      wonderId: WonderId;
    };

type OfficialMarkerSpec =
  | {
      type: "forgotten_tribe_vp";
      ref: TileEdgeRefSpec;
    }
  | {
      type: "forgotten_tribe_development";
      ref: TileEdgeRefSpec;
    }
  | {
      type: "forgotten_tribe_port";
      ref: TileEdgeRefSpec;
      portType: PortType;
    }
  | {
      type: "wonder_block";
      ref: TileVertexRefSpec;
      marker: "x" | "!";
    };

interface OfficialFixedScenarioSpec {
  layoutCoords?: readonly string[];
  logicalIslandGroups?: readonly (readonly string[])[];
  tiles: Partial<Record<string, OfficialTileContentSpec>>;
  ports: readonly (PortPlacementRef & { type?: PortType; side: TileSideIndex })[];
  portDistribution?: readonly PortType[];
  sites?: readonly OfficialSiteSpec[];
  markers?: readonly OfficialMarkerSpec[];
  pirateFleetPath?: readonly string[];
}

interface FogOriginalSetup {
  layoutCoords: readonly string[];
  fixedSeaCoords: readonly string[];
  hiddenCoords: readonly string[];
  visibleTiles?: Readonly<Record<string, OfficialTileContentSpec>>;
  visibleLandCoords?: readonly string[];
  faceupTerrainPool?: readonly TileTerrain[];
  faceupTokenPool?: readonly number[];
  hiddenTerrainPool: readonly TileTerrain[];
  hiddenTokenPool: readonly number[];
  ports: readonly (PortPlacementRef & { type?: PortType; side: TileSideIndex })[];
  preserveExplicitPortTypes: boolean;
  pirateCoord: string;
}

type FogRowCellSpec = "sea" | "hidden" | OfficialTileContentSpec;

interface FogRowSpec {
  r: number;
  qStart: number;
  cells: readonly FogRowCellSpec[];
}

type ResolvedScenarioPlayerCount = 3 | 4 | 5 | 6;
type OfficialFixedScenarioSpecKey = `${ScenarioId}:${BoardSize}:${ResolvedScenarioPlayerCount}`;
type ScenarioBoardVariantKey =
  | `${ScenarioId}:${BoardSize}`
  | `${ScenarioId}:${BoardSize}:${ResolvedScenarioPlayerCount}`;

interface ScenarioProfileOverride {
  layoutCoords?: readonly string[];
  landCoords?: readonly string[];
  landOmittedCoords?: readonly string[];
  fogLandCoords?: readonly string[];
  fogSeaCoords?: readonly string[];
  goldCoords?: readonly string[];
  desertCoords?: readonly string[];
  initialRobberCoord?: string | null;
  initialPirateCoord?: string | null;
  portDistribution?: readonly PortType[];
  explicitPortPlacements?: readonly PortPlacementRef[];
  logicalIslandGroups?: readonly (readonly string[])[];
  sites?: readonly OfficialSiteSpec[];
  markers?: readonly OfficialMarkerSpec[];
  pirateFleetPath?: readonly string[];
  variableRobberPlacement?: ScenarioProfile["variableRobberPlacement"];
  fixedTokenRules?: ScenarioTokenRules;
  variableTokenRules?: ScenarioTokenRules;
}

interface SeafarersOfficialScenarioData {
  homeIslandCounts: Record<ScenarioId, number>;
  islandRewardPoints: Record<ScenarioId, 0 | 1 | 2>;
  fixedScenarioSpecs: Partial<Record<OfficialFixedScenarioSpecKey, OfficialFixedScenarioSpec>>;
  profileOverrides: Partial<Record<ScenarioBoardVariantKey, ScenarioProfileOverride>>;
}

const seafarersOfficialScenarioData =
  seafarersOfficialScenarioDataJson as SeafarersOfficialScenarioData;
const generatedOfficialFixedScenarioSpecs =
  seafarersOfficialFixedScenarioSpecsJson as Partial<Record<OfficialFixedScenarioSpecKey, OfficialFixedScenarioSpec>>;

const STANDARD_RESOURCE_POOL = [
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
  "wool"
] as const;

const EXTENDED_RESOURCE_POOL = [
  "brick",
  "brick",
  "brick",
  "brick",
  "lumber",
  "lumber",
  "lumber",
  "lumber",
  "lumber",
  "ore",
  "ore",
  "ore",
  "ore",
  "grain",
  "grain",
  "grain",
  "grain",
  "grain",
  "wool",
  "wool",
  "wool",
  "wool",
  "wool"
] as const;

const STANDARD_TOKEN_POOL = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11] as const;
const EXTENDED_TOKEN_POOL = [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 10, 5, 4, 9, 5] as const;

const STANDARD_ACTIVE_COORDS = [
  "-3:0",
  "-3:1",
  "-2:0",
  "-2:1",
  "-2:2",
  "-1:0",
  "-1:1",
  "-1:2",
  "-1:3",
  "0:-1",
  "0:1",
  "0:2",
  "1:-3",
  "1:-2",
  "1:-1",
  "1:0",
  "1:1",
  "2:-3",
  "2:-2"
] as const;

const EXTENDED_ACTIVE_COORDS = [
  ...STANDARD_ACTIVE_COORDS,
  "-3:2",
  "-2:3",
  "0:-2",
  "0:0",
  "2:-1"
] as const;

const STANDARD_WONDER_CONFIGS: readonly WonderConfig[] = [
  {
    wonderId: "great_wall",
    requirementId: "great_wall_marker",
    buildCost: createResourceMap({ brick: 3, lumber: 1, grain: 1 })
  },
  {
    wonderId: "great_bridge",
    requirementId: "great_bridge_marker",
    buildCost: createResourceMap({ lumber: 3, wool: 1, grain: 1 })
  },
  {
    wonderId: "grand_monument",
    requirementId: "city_at_port_with_long_route",
    buildCost: createResourceMap({ grain: 3, ore: 2 })
  },
  {
    wonderId: "grand_theater",
    requirementId: "two_cities",
    buildCost: createResourceMap({ brick: 1, lumber: 1, wool: 3 })
  },
  {
    wonderId: "grand_castle",
    requirementId: "city_and_six_vp",
    buildCost: createResourceMap({ brick: 1, grain: 1, ore: 3 })
  }
] as const;

const EXTENDED_WONDER_CONFIGS: readonly WonderConfig[] = [
  ...STANDARD_WONDER_CONFIGS,
  {
    wonderId: "lighthouse",
    requirementId: "lighthouse_marker",
    buildCost: createResourceMap({ lumber: 3, wool: 1, grain: 1 })
  },
  {
    wonderId: "great_library",
    requirementId: "two_cities",
    buildCost: createResourceMap({ brick: 1, lumber: 1, wool: 3 })
  }
] as const;

const STANDARD_FORGOTTEN_TRIBE_PORTS: readonly PortType[] = [
  "generic",
  "brick",
  "lumber",
  "ore",
  "grain",
  "wool"
] as const;

const EXTENDED_FORGOTTEN_TRIBE_PORTS: readonly PortType[] = [
  "generic",
  "generic",
  "generic",
  "brick",
  "lumber",
  "ore",
  "grain",
  "wool"
] as const;

const SCENARIO_COLOR_ORDER: readonly PlayerColor[] = [
  "red",
  "blue",
  "white",
  "orange",
  "green",
  "purple"
] as const;

const STANDARD_COMMON_LOGICAL_ISLAND_GROUPS = [
  ["-3:0", "-3:1", "-2:0", "-2:1", "-2:2", "-1:1", "-1:2", "0:-1", "1:-3", "1:-2", "1:-1"],
  ["2:-3", "2:-2", "1:0", "1:1"],
  ["0:2", "-1:3"]
] as const satisfies readonly (readonly string[])[];

const STANDARD_CLOTH_LOGICAL_ISLAND_GROUPS = [
  ["-3:0", "-3:1", "-2:0", "-2:1", "-2:2", "-1:1"],
  ["0:-1", "1:-3", "1:-2", "1:-1", "1:0", "1:1"],
  ["-1:2"],
  ["0:2"],
  ["-1:3"],
  ["2:-3", "2:-2"]
] as const satisfies readonly (readonly string[])[];

const STANDARD_WONDERS_LOGICAL_ISLAND_GROUPS = [
  ["-3:0", "-3:1", "-2:0", "-2:1", "-2:2", "-1:1", "-1:2", "0:-1", "1:-2", "1:-1"],
  ["1:-3"],
  ["2:-3", "2:-2"],
  ["1:0", "1:1"],
  ["0:2"],
  ["-1:3"]
] as const satisfies readonly (readonly string[])[];

const STANDARD_PIRATE_LOGICAL_ISLAND_GROUPS = [
  ["1:-3", "1:-2", "1:-1", "1:0", "1:1", "2:-3", "2:-2"],
  ["-3:0", "-2:0"],
  ["-3:1", "-2:1"],
  ["-2:2", "-1:1", "-1:2"],
  ["0:2", "-1:3"]
] as const satisfies readonly (readonly string[])[];

const EXTENDED_COMMON_LOGICAL_ISLAND_GROUPS = [
  ["-3:0", "-3:1", "-3:2", "-2:0", "-2:1", "-2:2", "-2:3", "-1:1", "-1:2", "0:-2", "0:-1", "1:-3", "1:-2", "1:-1"],
  ["2:-3", "2:-2", "2:-1", "1:0", "1:1"],
  ["0:0", "0:1", "0:2", "-1:3"]
] as const satisfies readonly (readonly string[])[];

const EXTENDED_CLOTH_LOGICAL_ISLAND_GROUPS = [
  ["-3:0", "-3:1", "-3:2", "-2:0", "-2:1", "-2:2", "-2:3", "-1:1", "-1:2"],
  ["0:-2", "0:-1", "1:-3", "1:-2", "1:-1", "2:-3", "2:-2", "2:-1", "1:0"],
  ["1:1", "0:1"],
  ["0:2", "-1:3"],
  ["0:0"]
] as const satisfies readonly (readonly string[])[];

const EXTENDED_WONDERS_LOGICAL_ISLAND_GROUPS = [
  ["-3:0", "-3:1", "-3:2", "-2:0", "-2:1", "-2:2", "-2:3", "-1:1", "-1:2", "0:-2", "0:-1", "1:-2", "1:-1"],
  ["1:-3"],
  ["2:-3", "2:-2"],
  ["2:-1", "1:0"],
  ["1:1", "0:1"],
  ["0:0"],
  ["0:2"],
  ["-1:3"]
] as const satisfies readonly (readonly string[])[];

const EXTENDED_PIRATE_LOGICAL_ISLAND_GROUPS = [
  ["1:-3", "1:-2", "1:-1", "1:0", "1:1", "2:-3", "2:-2", "2:-1", "0:2"],
  ["-3:0", "-2:0"],
  ["-3:1", "-2:1"],
  ["-3:2", "-2:2", "-1:1"],
  ["-2:3", "-1:2"],
  ["0:0", "-1:3"]
] as const satisfies readonly (readonly string[])[];

const SCENARIO_HOME_ISLAND_COUNTS = seafarersOfficialScenarioData.homeIslandCounts;

const SCENARIO_ISLAND_REWARD_POINTS = seafarersOfficialScenarioData.islandRewardPoints;

const OFFICIAL_FIXED_SCENARIO_SPECS: Partial<Record<OfficialFixedScenarioSpecKey, OfficialFixedScenarioSpec>> = {
  ...seafarersOfficialScenarioData.fixedScenarioSpecs,
  ...generatedOfficialFixedScenarioSpecs
};

const FOG_ISLANDS_STANDARD_3_VISIBLE_TILES = {
  "3:-5": { terrain: "lumber", token: 6 },
  "2:-4": { terrain: "brick", token: 11 },
  "1:-3": { terrain: "ore", token: 8 },
  "2:-3": { terrain: "wool", token: 5 },
  "0:-2": { terrain: "wool", token: 12 },
  "1:-2": { terrain: "lumber", token: 9 },
  "0:-1": { terrain: "grain", token: 10 },
  "1:2": { terrain: "brick", token: 6 },
  "0:3": { terrain: "lumber", token: 5 },
  "-1:4": { terrain: "wool", token: 8 },
  "0:4": { terrain: "lumber", token: 11 },
  "-2:5": { terrain: "ore", token: 4 },
  "-1:5": { terrain: "grain", token: 3 },
  "-2:6": { terrain: "wool", token: 9 }
} as const satisfies Readonly<Record<string, OfficialTileContentSpec>>;

const FOG_ISLANDS_STANDARD_3_SETUP: FogOriginalSetup = {
  layoutCoords: buildFogLayoutCoords(
    [
      "4:-7",
      "3:-6",
      "4:-6",
      "2:-5",
      "1:-4",
      "3:-4",
      "2:-2",
      "1:-1",
      "-1:0",
      "0:0",
      "2:0",
      "-1:1",
      "1:1",
      "0:2",
      "-1:3",
      "-2:4",
      "-3:6",
      "-3:7"
    ],
    [
      "4:-5",
      "4:-4",
      "3:-3",
      "3:-2",
      "2:-1",
      "1:0",
      "0:1",
      "-2:2",
      "-1:2",
      "-2:3",
      "-3:4",
      "-3:5"
    ],
    Object.keys(FOG_ISLANDS_STANDARD_3_VISIBLE_TILES)
  ),
  fixedSeaCoords: [
    "4:-7",
    "3:-6",
    "4:-6",
    "2:-5",
    "1:-4",
    "3:-4",
    "2:-2",
    "1:-1",
    "-1:0",
    "0:0",
    "2:0",
    "-1:1",
    "1:1",
    "0:2",
    "-1:3",
    "-2:4",
    "-3:6",
    "-3:7"
  ],
  hiddenCoords: [
    "4:-5",
    "4:-4",
    "3:-3",
    "3:-2",
    "2:-1",
    "1:0",
    "0:1",
    "-2:2",
    "-1:2",
    "-2:3",
    "-3:4",
    "-3:5"
  ],
  visibleTiles: FOG_ISLANDS_STANDARD_3_VISIBLE_TILES,
  hiddenTerrainPool: createFogTerrainPool({
    sea: 2,
    gold: 2,
    brick: 2,
    lumber: 1,
    wool: 1,
    grain: 2,
    ore: 2
  }),
  hiddenTokenPool: createFogTokenPool({
    3: 2,
    4: 1,
    5: 1,
    6: 1,
    8: 1,
    9: 1,
    10: 1,
    11: 1,
    12: 1
  }),
  ports: [
    { tileCoord: "3:-5", side: 5, type: "ore" },
    { tileCoord: "2:-4", side: 5, type: "lumber" },
    { tileCoord: "0:-2", side: 0, type: "generic" },
    { tileCoord: "0:-1", side: 4, type: "brick" },
    { tileCoord: "1:2", side: 2, type: "wool" },
    { tileCoord: "0:4", side: 2, type: "generic" },
    { tileCoord: "-2:5", side: 3, type: "generic" },
    { tileCoord: "-2:6", side: 2, type: "grain" }
  ],
  preserveExplicitPortTypes: true,
  pirateCoord: "4:-7"
};

const FOG_ISLANDS_STANDARD_4_VISIBLE_LAND_COORDS = [
  "3:-6",
  "2:-5",
  "3:-5",
  "1:-4",
  "2:-4",
  "1:-3",
  "0:-2",
  "2:0",
  "1:1",
  "1:2",
  "0:3",
  "-1:4",
  "0:4",
  "-2:5",
  "-1:5",
  "-3:6",
  "-2:6"
] as const;

const FOG_ISLANDS_STANDARD_4_SETUP: FogOriginalSetup = {
  layoutCoords: buildFogLayoutCoords(
    [
      "4:-7",
      "4:-6",
      "3:-4",
      "2:-3",
      "1:-2",
      "3:-2",
      "0:-1",
      "2:-1",
      "-1:0",
      "1:0",
      "0:2",
      "-1:3",
      "-2:4",
      "-3:5",
      "-3:7"
    ],
    [
      "4:-5",
      "4:-4",
      "3:-3",
      "2:-2",
      "1:-1",
      "0:0",
      "-1:1",
      "0:1",
      "-2:2",
      "-1:2",
      "-2:3",
      "-3:4"
    ],
    FOG_ISLANDS_STANDARD_4_VISIBLE_LAND_COORDS
  ),
  fixedSeaCoords: [
    "4:-7",
    "4:-6",
    "3:-4",
    "2:-3",
    "1:-2",
    "3:-2",
    "0:-1",
    "2:-1",
    "-1:0",
    "1:0",
    "0:2",
    "-1:3",
    "-2:4",
    "-3:5",
    "-3:7"
  ],
  hiddenCoords: [
    "4:-5",
    "4:-4",
    "3:-3",
    "2:-2",
    "1:-1",
    "0:0",
    "-1:1",
    "0:1",
    "-2:2",
    "-1:2",
    "-2:3",
    "-3:4"
  ],
  visibleLandCoords: FOG_ISLANDS_STANDARD_4_VISIBLE_LAND_COORDS,
  faceupTerrainPool: createFogTerrainPool({
    brick: 3,
    lumber: 4,
    wool: 4,
    grain: 3,
    ore: 3
  }),
  faceupTokenPool: createFogTokenPool({
    2: 1,
    3: 2,
    4: 2,
    5: 2,
    6: 2,
    8: 2,
    9: 2,
    10: 2,
    11: 1,
    12: 1
  }),
  hiddenTerrainPool: createFogTerrainPool({
    sea: 2,
    gold: 2,
    brick: 2,
    lumber: 1,
    wool: 1,
    grain: 2,
    ore: 2
  }),
  hiddenTokenPool: createFogTokenPool({
    3: 1,
    4: 1,
    5: 1,
    6: 1,
    8: 1,
    9: 1,
    10: 1,
    11: 2,
    12: 1
  }),
  ports: [
    { tileCoord: "3:-6", side: 5 },
    { tileCoord: "3:-5", side: 0 },
    { tileCoord: "1:-4", side: 0 },
    { tileCoord: "1:-4", side: 4 },
    { tileCoord: "2:0", side: 2 },
    { tileCoord: "0:4", side: 1 },
    { tileCoord: "0:4", side: 3 },
    { tileCoord: "-3:6", side: 2 },
    { tileCoord: "-2:6", side: 2 }
  ],
  preserveExplicitPortTypes: false,
  pirateCoord: "4:-7"
};

const FOG_ISLANDS_EXTENDED_56_ROWS = [
  {
    r: -6,
    qStart: 1,
    cells: [
      { terrain: "lumber", token: 10 },
      "sea",
      "hidden",
      "hidden",
      "sea",
      { terrain: "lumber", token: 9 },
      { terrain: "grain", token: 2 }
    ]
  },
  {
    r: -5,
    qStart: 0,
    cells: [
      { terrain: "wool", token: 6 },
      "sea",
      "hidden",
      "hidden",
      "hidden",
      { terrain: "brick", token: 5 },
      { terrain: "ore", token: 12 },
      "sea"
    ]
  },
  {
    r: -4,
    qStart: -1,
    cells: [
      { terrain: "grain", token: 12, robber: true },
      { terrain: "brick", token: 4 },
      "sea",
      "hidden",
      "hidden",
      "hidden",
      { terrain: "wool", token: 4 },
      { terrain: "brick", token: 8 },
      "sea"
    ]
  },
  {
    r: -3,
    qStart: -1,
    cells: [
      { terrain: "ore", token: 11 },
      { terrain: "wool", token: 5 },
      "sea",
      "hidden",
      "hidden",
      "sea",
      { terrain: "lumber", token: 6 },
      { terrain: "wool", token: 3 }
    ]
  },
  {
    r: -2,
    qStart: -2,
    cells: [
      { terrain: "grain", token: 6 },
      { terrain: "lumber", token: 3 },
      "sea",
      "hidden",
      "hidden",
      "hidden",
      { terrain: "ore", token: 9 },
      { terrain: "grain", token: 4 },
      "sea"
    ]
  },
  {
    r: -1,
    qStart: -2,
    cells: [
      { terrain: "brick", token: 9 },
      { terrain: "wool", token: 8 },
      "sea",
      "hidden",
      "hidden",
      "hidden",
      { terrain: "brick", token: 10 },
      "sea"
    ]
  },
  {
    r: 0,
    qStart: -2,
    cells: [
      { terrain: "grain", token: 11 },
      { terrain: "ore", token: 10 },
      "sea",
      "hidden",
      "hidden",
      "sea",
      { terrain: "lumber", token: 8 }
    ]
  }
] as const satisfies readonly FogRowSpec[];

const FOG_ISLANDS_EXTENDED_56_SETUP: FogOriginalSetup = buildFogOriginalSetupFromRows(
  FOG_ISLANDS_EXTENDED_56_ROWS,
  {
    hiddenTerrainPool: createFogTerrainPool({
      sea: 3,
      gold: 3,
      brick: 2,
      lumber: 2,
      wool: 2,
      grain: 2,
      ore: 3,
      desert: 1
    }),
    hiddenTokenPool: createFogTokenPool({
      2: 2,
      3: 2,
      4: 1,
      5: 2,
      6: 1,
      8: 1,
      9: 1,
      10: 1,
      11: 2,
      12: 1
    }),
    ports: [
      { tileCoord: "1:-6", side: 3, type: "generic" },
      { tileCoord: "6:-6", side: 1, type: "lumber" },
      { tileCoord: "0:-4", side: 0, type: "wool" },
      { tileCoord: "6:-5", side: 0, type: "generic" },
      { tileCoord: "-1:-3", side: 3, type: "ore" },
      { tileCoord: "5:-4", side: 4, type: "wool" },
      { tileCoord: "6:-3", side: 0, type: "brick" },
      { tileCoord: "-2:-1", side: 3, type: "generic" },
      { tileCoord: "-1:-1", side: 0, type: "generic" },
      { tileCoord: "4:-1", side: 4, type: "generic" },
      { tileCoord: "5:-2", side: 5, type: "grain" }
    ],
    preserveExplicitPortTypes: true,
    pirateCoord: "0:0"
  }
);

function coordKey(q: number, r: number): string {
  return `${q}:${r}`;
}

function coordSortKey(coord: string): [number, number] {
  const [qPart, rPart] = coord.split(":");
  return [Number(rPart), Number(qPart)];
}

function buildFogLayoutCoords(
  fixedSeaCoords: readonly string[],
  hiddenCoords: readonly string[],
  visibleCoords: readonly string[]
): string[] {
  return [...new Set([...fixedSeaCoords, ...hiddenCoords, ...visibleCoords])].sort((left, right) => {
    const [leftR, leftQ] = coordSortKey(left);
    const [rightR, rightQ] = coordSortKey(right);
    return leftR - rightR || leftQ - rightQ;
  });
}

function buildFogOriginalSetupFromRows(
  rows: readonly FogRowSpec[],
  config: Omit<FogOriginalSetup, "layoutCoords" | "fixedSeaCoords" | "hiddenCoords" | "visibleTiles">
): FogOriginalSetup {
  const layoutCoords: string[] = [];
  const fixedSeaCoords: string[] = [];
  const hiddenCoords: string[] = [];
  const visibleTiles: Record<string, OfficialTileContentSpec> = {};

  for (const row of rows) {
    for (const [index, cell] of row.cells.entries()) {
      const coord = coordKey(row.qStart + index, row.r);
      layoutCoords.push(coord);
      if (cell === "sea") {
        fixedSeaCoords.push(coord);
        continue;
      }
      if (cell === "hidden") {
        hiddenCoords.push(coord);
        continue;
      }
      visibleTiles[coord] = { ...cell };
    }
  }

  return {
    layoutCoords,
    fixedSeaCoords,
    hiddenCoords,
    visibleTiles,
    ...config
  };
}

function createFogTerrainPool(counts: Partial<Record<TileTerrain, number>>): TileTerrain[] {
  const orderedTerrains: readonly TileTerrain[] = [
    "sea",
    "gold",
    "brick",
    "lumber",
    "wool",
    "grain",
    "ore",
    "desert"
  ];
  const pool: TileTerrain[] = [];
  for (const terrain of orderedTerrains) {
    pool.push(...Array.from({ length: counts[terrain] ?? 0 }, () => terrain));
  }
  return pool;
}

function createFogTokenPool(counts: Partial<Record<number, number>>): number[] {
  const pool: number[] = [];
  for (const token of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const) {
    pool.push(...Array.from({ length: counts[token] ?? 0 }, () => token));
  }
  return pool;
}

function createResourceMap(cost: Partial<Record<Resource, number>>): ResourceMap {
  return {
    brick: cost.brick ?? 0,
    lumber: cost.lumber ?? 0,
    ore: cost.ore ?? 0,
    grain: cost.grain ?? 0,
    wool: cost.wool ?? 0
  };
}

function getScenarioHomeIslandCount(scenarioId: ScenarioId): number {
  return SCENARIO_HOME_ISLAND_COUNTS[scenarioId];
}

export function getSeafarersIslandRewardPoints(scenarioId: ScenarioId): 0 | 1 | 2 {
  return SCENARIO_ISLAND_REWARD_POINTS[scenarioId];
}

export function getSeafarersHomeIslandCount(scenarioId: ScenarioId): number {
  return getScenarioHomeIslandCount(scenarioId);
}

export function getSeafarersPirateFleetPathCoords(input: {
  scenarioId: ScenarioId;
  boardSize: BoardSize;
  playerCount: number;
  layoutMode?: LayoutMode;
}): string[] | null {
  const resolvedPlayerCount = resolveScenarioPlayerCount(input.playerCount, input.boardSize);
  const profileOverride = getScenarioProfileOverride(input.scenarioId, input.boardSize, resolvedPlayerCount);
  const spec = getOfficialFixedScenarioSpec(input.scenarioId, input.boardSize, input.playerCount);
  const pirateFleetPath = spec?.pirateFleetPath
    ? [...spec.pirateFleetPath]
    : profileOverride?.pirateFleetPath
      ? [...profileOverride.pirateFleetPath]
      : null;
  if (
    input.layoutMode === "official_fixed" &&
    input.scenarioId === "seafarers.pirate_islands" &&
    (!pirateFleetPath || pirateFleetPath.length === 0)
  ) {
    throw new Error(
      `Missing explicit pirate fleet path for official fixed Seafarers scenario ${input.scenarioId}:${input.boardSize}:${resolvedPlayerCount}.`
    );
  }
  return pirateFleetPath;
}

function getOfficialFixedScenarioSpec(
  scenarioId: ScenarioId,
  boardSize: BoardSize,
  playerCount: number
): OfficialFixedScenarioSpec | null {
  const resolvedPlayerCount = resolveScenarioPlayerCount(playerCount, boardSize);
  return OFFICIAL_FIXED_SCENARIO_SPECS[`${scenarioId}:${boardSize}:${resolvedPlayerCount}`] ?? null;
}

function getWonderConfig(boardSize: BoardSize, wonderId: WonderId): WonderConfig {
  const config =
    (boardSize === "extended" ? EXTENDED_WONDER_CONFIGS : STANDARD_WONDER_CONFIGS).find(
      (entry) => entry.wonderId === wonderId
    ) ?? null;
  if (!config) {
    throw new Error(`Missing wonder config for ${wonderId} on ${boardSize}.`);
  }
  return config;
}

function vertexRef(tileCoord: string, corner: TileCornerIndex): TileVertexRefSpec {
  return { tileCoord, corner };
}

function edgeRef(tileCoord: string, side: TileSideIndex): TileEdgeRefSpec {
  return { tileCoord, side };
}

function withoutCoords(coords: readonly string[], omittedCoords: readonly string[]): string[] {
  const omitted = new Set(omittedCoords);
  return coords.filter((coord) => !omitted.has(coord));
}

function createPortDistribution(
  genericCount: number,
  resourcePortCount: number
): PortType[] {
  const resources: readonly PortType[] = ["brick", "lumber", "ore", "grain", "wool"];
  const distribution: PortType[] = Array.from({ length: genericCount }, () => "generic");
  for (let index = 0; index < resourcePortCount; index += 1) {
    distribution.push(resources[index % resources.length]!);
  }
  return distribution;
}

function createTokenRules(
  overrides?: Partial<ScenarioTokenRules>
): ScenarioTokenRules {
  return {
    forbidAdjacentRedNumbers: overrides?.forbidAdjacentRedNumbers ?? true,
    forbidRedNumbersOnGold: overrides?.forbidRedNumbersOnGold ?? false,
    forbidLowNumbersOnForestOrPasture: overrides?.forbidLowNumbersOnForestOrPasture ?? false,
    forbiddenNumbersByCoord: overrides?.forbiddenNumbersByCoord ?? {}
  };
}

function resolveScenarioPlayerCount(playerCount: number, boardSize: BoardSize): ResolvedScenarioPlayerCount {
  if (playerCount <= 3) {
    return 3;
  }
  if (playerCount === 4) {
    return 4;
  }
  if (playerCount === 5) {
    return 5;
  }
  if (playerCount >= 6) {
    return 6;
  }
  return boardSize === "extended" ? 5 : 4;
}

export function getFogIslandsOriginalSetup(input: {
  scenarioId: ScenarioId;
  boardSize: BoardSize;
  playerCount: number;
}): FogOriginalSetup | null {
  if (input.scenarioId !== "seafarers.fog_islands") {
    return null;
  }

  const resolvedPlayerCount = resolveScenarioPlayerCount(input.playerCount, input.boardSize);
  if (input.boardSize === "extended") {
    return resolvedPlayerCount >= 5 ? FOG_ISLANDS_EXTENDED_56_SETUP : null;
  }

  switch (resolvedPlayerCount) {
    case 3:
      return FOG_ISLANDS_STANDARD_3_SETUP;
    case 4:
      return FOG_ISLANDS_STANDARD_4_SETUP;
    default:
      return null;
  }
}

function getScenarioLogicalIslandGroups(
  boardSize: BoardSize,
  scenarioId: ScenarioId
): string[][] {
  if (boardSize === "extended") {
    switch (scenarioId) {
      case "seafarers.cloth_for_catan":
        return EXTENDED_CLOTH_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
      case "seafarers.wonders_of_catan":
        return EXTENDED_WONDERS_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
      case "seafarers.pirate_islands":
        return EXTENDED_PIRATE_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
      case "seafarers.four_islands":
      case "seafarers.six_islands":
      case "seafarers.through_the_desert":
        return [];
      default:
        return EXTENDED_COMMON_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
    }
  }

  switch (scenarioId) {
    case "seafarers.cloth_for_catan":
      return STANDARD_CLOTH_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
    case "seafarers.wonders_of_catan":
      return STANDARD_WONDERS_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
    case "seafarers.pirate_islands":
      return STANDARD_PIRATE_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
    case "seafarers.four_islands":
    case "seafarers.six_islands":
    case "seafarers.through_the_desert":
      return [];
    default:
      return STANDARD_COMMON_LOGICAL_ISLAND_GROUPS.map((group) => [...group]);
  }
}

function getScenarioPortDistribution(
  scenarioId: ScenarioId,
  playerCount: ResolvedScenarioPlayerCount
): PortType[] {
  switch (scenarioId) {
    case "seafarers.heading_for_new_shores":
      return playerCount === 3
        ? createPortDistribution(3, 5)
        : playerCount === 4
          ? createPortDistribution(4, 5)
          : createPortDistribution(5, 6);
    case "seafarers.four_islands":
      return createPortDistribution(4, 5);
    case "seafarers.six_islands":
      return createPortDistribution(5, 6);
    case "seafarers.fog_islands":
      return playerCount === 3
        ? createPortDistribution(3, 5)
        : playerCount === 4
          ? createPortDistribution(4, 5)
          : createPortDistribution(5, 6);
    case "seafarers.through_the_desert":
      return playerCount <= 3
        ? createPortDistribution(3, 5)
        : playerCount === 4
          ? createPortDistribution(4, 5)
          : createPortDistribution(5, 6);
    case "seafarers.forgotten_tribe":
      return playerCount <= 4
        ? createPortDistribution(1, 5)
        : createPortDistribution(3, 5);
    case "seafarers.cloth_for_catan":
      return playerCount <= 4
        ? createPortDistribution(4, 5)
        : createPortDistribution(5, 6);
    case "seafarers.pirate_islands":
      return playerCount <= 4
        ? createPortDistribution(3, 5)
        : createPortDistribution(4, 5);
    case "seafarers.wonders_of_catan":
      return playerCount <= 4
        ? createPortDistribution(4, 5)
        : createPortDistribution(5, 6);
    case "seafarers.new_world":
      return playerCount <= 4
        ? createPortDistribution(5, 5)
        : createPortDistribution(5, 6);
    default:
      return playerCount >= 5
        ? createPortDistribution(5, 6)
        : createPortDistribution(4, 5);
  }
}

const SCENARIO_PROFILE_OVERRIDES = seafarersOfficialScenarioData.profileOverrides;

function cloneLogicalIslandGroups(
  groups: readonly (readonly string[])[]
): string[][] {
  return groups.map((group) => [...group]);
}

function getScenarioProfileOverride(
  scenarioId: ScenarioId,
  boardSize: BoardSize,
  playerCount: ResolvedScenarioPlayerCount
): ScenarioProfileOverride | null {
  const baseOverride = SCENARIO_PROFILE_OVERRIDES[`${scenarioId}:${boardSize}`] ?? null;
  const countOverride = SCENARIO_PROFILE_OVERRIDES[`${scenarioId}:${boardSize}:${playerCount}`] ?? null;
  if (!baseOverride) {
    return countOverride;
  }
  if (!countOverride) {
    return baseOverride;
  }
  return {
    ...baseOverride,
    ...countOverride,
    ...(baseOverride.fixedTokenRules || countOverride.fixedTokenRules
      ? {
          fixedTokenRules: {
            ...(baseOverride.fixedTokenRules ?? createTokenRules()),
            ...(countOverride.fixedTokenRules ?? {})
          }
        }
      : {}),
    ...(baseOverride.variableTokenRules || countOverride.variableTokenRules
      ? {
          variableTokenRules: {
            ...(baseOverride.variableTokenRules ?? createTokenRules()),
            ...(countOverride.variableTokenRules ?? {})
          }
        }
      : {})
  };
}

function createProfile(
  boardSize: BoardSize,
  scenarioId: ScenarioId,
  playerCount: number
): ScenarioProfile {
  const activeCoords = boardSize === "extended" ? [...EXTENDED_ACTIVE_COORDS] : [...STANDARD_ACTIVE_COORDS];
  const resolvedPlayerCount = resolveScenarioPlayerCount(playerCount, boardSize);
  const fogSetup = getFogIslandsOriginalSetup({ scenarioId, boardSize, playerCount });
  const override = getScenarioProfileOverride(scenarioId, boardSize, resolvedPlayerCount);
  if (fogSetup) {
    const portDistribution = fogSetup.ports.every((placement) => placement.type !== undefined)
      ? fogSetup.ports.map((placement) => placement.type!)
      : getScenarioPortDistribution(scenarioId, resolvedPlayerCount);
    return {
      layoutCoords: [...fogSetup.layoutCoords],
      landCoords: [],
      fogLandCoords: [],
      fogSeaCoords: [],
      goldCoords: [],
      desertCoords: [],
      initialRobberCoord: null,
      initialPirateCoord: fogSetup.pirateCoord,
      portDistribution,
      explicitPortPlacements: fogSetup.ports.map((placement) => ({
        tileCoord: placement.tileCoord,
        side: placement.side,
        ...(placement.type ? { type: placement.type } : {})
      })),
      logicalIslandGroups: [],
      homeIslandCount: getScenarioHomeIslandCount(scenarioId),
      variableRobberPlacement: "token_12",
      fixedTokenRules: createTokenRules({
        forbidAdjacentRedNumbers: false
      }),
      variableTokenRules: createTokenRules({
        forbidAdjacentRedNumbers: false
      })
    };
  }
  const layoutCoords = override?.layoutCoords ? [...override.layoutCoords] : activeCoords;
  const base: ScenarioProfile = {
    layoutCoords,
    landCoords:
      override?.landCoords
        ? [...override.landCoords]
        : withoutCoords(
            layoutCoords,
            override?.landOmittedCoords ? [...override.landOmittedCoords] : []
          ),
    fogLandCoords: override?.fogLandCoords ? [...override.fogLandCoords] : [],
    fogSeaCoords: override?.fogSeaCoords ? [...override.fogSeaCoords] : [],
    goldCoords: override?.goldCoords ? [...override.goldCoords] : [],
    desertCoords:
      override?.desertCoords
        ? [...override.desertCoords]
        : boardSize === "extended"
          ? ["0:0"]
          : ["-1:1"],
    initialRobberCoord:
      override?.initialRobberCoord !== undefined
        ? override.initialRobberCoord
        : boardSize === "extended"
          ? "0:0"
          : "-1:1",
    initialPirateCoord: override?.initialPirateCoord ?? null,
    portDistribution:
      override?.portDistribution !== undefined
        ? [...override.portDistribution]
        : getScenarioPortDistribution(scenarioId, resolvedPlayerCount),
    logicalIslandGroups: override?.logicalIslandGroups
      ? cloneLogicalIslandGroups(override.logicalIslandGroups)
      : getScenarioLogicalIslandGroups(boardSize, scenarioId),
    homeIslandCount: getScenarioHomeIslandCount(scenarioId),
    variableRobberPlacement: override?.variableRobberPlacement ?? "fallback",
    fixedTokenRules: override?.fixedTokenRules ?? createTokenRules(),
    variableTokenRules: override?.variableTokenRules ?? createTokenRules()
  };
  if (override?.explicitPortPlacements !== undefined) {
    base.explicitPortPlacements = [...override.explicitPortPlacements];
  }
  return base;
}

function assertCoordsWithinLayout(
  variantKey: string,
  layoutCoords: readonly string[],
  coords: readonly string[],
  label: string
): void {
  const layoutCoordSet = new Set(layoutCoords);
  for (const coord of coords) {
    if (!layoutCoordSet.has(coord)) {
      throw new Error(`Invalid ${label} coord ${coord} in Seafarers variant ${variantKey}.`);
    }
  }
}

function validateScenarioProfileOverrides(): void {
  for (const [variantKey, override] of Object.entries(SCENARIO_PROFILE_OVERRIDES)) {
    if (!override) {
      continue;
    }
    const variantParts = variantKey.split(":");
    const boardSize = variantParts[1] as BoardSize;
    const layoutCoords = override.layoutCoords ?? (boardSize === "extended" ? EXTENDED_ACTIVE_COORDS : STANDARD_ACTIVE_COORDS);
    if (new Set(layoutCoords).size !== layoutCoords.length) {
      throw new Error(`Duplicate layout coord in Seafarers variant ${variantKey}.`);
    }
    if (override.landCoords && override.landOmittedCoords) {
      throw new Error(`Variant ${variantKey} may not define both landCoords and landOmittedCoords.`);
    }

    if (override.landCoords) {
      assertCoordsWithinLayout(variantKey, layoutCoords, override.landCoords, "land");
    }
    if (override.landOmittedCoords) {
      assertCoordsWithinLayout(variantKey, layoutCoords, override.landOmittedCoords, "omitted-land");
    }
    if (override.fogLandCoords) {
      assertCoordsWithinLayout(variantKey, layoutCoords, override.fogLandCoords, "fog-land");
    }
    if (override.fogSeaCoords) {
      assertCoordsWithinLayout(variantKey, layoutCoords, override.fogSeaCoords, "fog-sea");
    }
    if (override.goldCoords) {
      assertCoordsWithinLayout(variantKey, layoutCoords, override.goldCoords, "gold");
    }
    if (override.desertCoords) {
      assertCoordsWithinLayout(variantKey, layoutCoords, override.desertCoords, "desert");
    }
    if (override.initialRobberCoord) {
      assertCoordsWithinLayout(variantKey, layoutCoords, [override.initialRobberCoord], "initial-robber");
    }
    if (override.initialPirateCoord) {
      assertCoordsWithinLayout(variantKey, layoutCoords, [override.initialPirateCoord], "initial-pirate");
    }
    for (const placement of override.explicitPortPlacements ?? []) {
      assertCoordsWithinLayout(variantKey, layoutCoords, [placement.tileCoord], "explicit-port");
    }
    for (const group of override.logicalIslandGroups ?? []) {
      assertCoordsWithinLayout(variantKey, layoutCoords, group, "logical-island-group");
    }
    assertCoordsWithinLayout(
      variantKey,
      layoutCoords,
      override.sites?.map((site) => getOfficialSiteCoord(site)) ?? [],
      "variant-site"
    );
    assertCoordsWithinLayout(
      variantKey,
      layoutCoords,
      override.markers?.map((marker) => marker.ref.tileCoord) ?? [],
      "variant-marker"
    );
    assertCoordsWithinLayout(
      variantKey,
      layoutCoords,
      override.pirateFleetPath ?? [],
      "variant-pirate-fleet-path"
    );
  }
}

function validateOfficialFixedScenarioSpecs(): void {
  for (const [variantKey, spec] of Object.entries(OFFICIAL_FIXED_SCENARIO_SPECS)) {
    if (!spec) {
      continue;
    }
    const [scenarioId, boardSize, playerCountText] = variantKey.split(":") as [
      ScenarioId,
      BoardSize,
      `${3 | 4 | 5 | 6}`
    ];
    const profile = createProfile(boardSize, scenarioId, Number(playerCountText));
    const layoutCoords = spec.layoutCoords ?? profile.layoutCoords;
    if (new Set(layoutCoords).size !== layoutCoords.length) {
      throw new Error(`Duplicate fixed layout coord in Seafarers variant ${variantKey}.`);
    }
    assertCoordsWithinLayout(variantKey, layoutCoords, Object.keys(spec.tiles), "fixed-tile");
    assertCoordsWithinLayout(
      variantKey,
      layoutCoords,
      spec.ports.map((placement) => placement.tileCoord),
      "fixed-port"
    );
    if (spec.portDistribution && spec.portDistribution.length !== spec.ports.length) {
      throw new Error(`Fixed port distribution mismatch for Seafarers variant ${variantKey}.`);
    }
    if (
      spec.ports.some((placement) => placement.type === undefined) &&
      (!spec.portDistribution || spec.portDistribution.length !== spec.ports.length)
    ) {
      throw new Error(`Missing fixed port types/distribution for Seafarers variant ${variantKey}.`);
    }
    assertCoordsWithinLayout(
      variantKey,
      layoutCoords,
      spec.sites?.map((site) => getOfficialSiteCoord(site)) ?? [],
      "fixed-site"
    );
    assertCoordsWithinLayout(
      variantKey,
      layoutCoords,
      spec.markers?.map((marker) => marker.ref.tileCoord) ?? [],
      "fixed-marker"
    );
    assertCoordsWithinLayout(
      variantKey,
      layoutCoords,
      spec.pirateFleetPath ?? [],
      "pirate-fleet-path"
    );
    for (const group of spec.logicalIslandGroups ?? []) {
      assertCoordsWithinLayout(variantKey, layoutCoords, group, "fixed-logical-island-group");
    }
  }
}

validateScenarioProfileOverrides();
validateOfficialFixedScenarioSpecs();

function parseCoordKey(coord: string): BoardLayoutTile {
  const [qPart, rPart] = coord.split(":");
  return {
    q: Number(qPart),
    r: Number(rPart)
  };
}

export function getSeafarersBoardLayout(input: {
  boardSize: BoardSize;
  scenarioId: ScenarioId;
  layoutMode: LayoutMode;
  playerCount: number;
}): ScenarioBoardLayout {
  const profile = createProfile(input.boardSize, input.scenarioId, input.playerCount);
  const fogSetup = getFogIslandsOriginalSetup(input);
  const fixedSpec =
    input.layoutMode === "official_fixed"
      ? getOfficialFixedScenarioSpec(input.scenarioId, input.boardSize, input.playerCount)
      : null;
  const layoutCoords = fixedSpec?.layoutCoords ?? profile.layoutCoords;
  const fixedPortDistribution =
    fixedSpec?.portDistribution && fixedSpec.portDistribution.length > 0
      ? [...fixedSpec.portDistribution]
      : fixedSpec && fixedSpec.ports.every((placement) => placement.type !== undefined)
        ? fixedSpec.ports.map((placement) => placement.type!)
        : [...profile.portDistribution];
  return {
    contentMode: "scenario",
    boardSize: input.boardSize,
    tiles: layoutCoords.map(parseCoordKey),
    portDistribution: fixedSpec && fixedSpec.ports.length > 0 ? fixedPortDistribution : [...profile.portDistribution],
    ...(fixedSpec && fixedSpec.ports.length > 0
      ? {
          explicitPortPlacements: fixedSpec.ports.map((placement) => ({
            tileCoord: placement.tileCoord,
            side: placement.side,
            ...(placement.type ? { type: placement.type } : {})
          }))
        }
      : profile.explicitPortPlacements && profile.explicitPortPlacements.length > 0
        ? {
            explicitPortPlacements: profile.explicitPortPlacements.map((placement) => ({
              tileCoord: placement.tileCoord,
              side: placement.side,
              ...(placement.type ? { type: placement.type } : {})
            }))
          }
      : {}),
    ...(fogSetup
      ? {
          preserveExplicitPortTypes: fogSetup.preserveExplicitPortTypes
        }
      : {})
  };
}

function takeShuffledValues<T>(values: readonly T[], count: number, rng: SeededRandom): T[] {
  const shuffled = rng.shuffle(values);
  if (count <= shuffled.length) {
    return shuffled.slice(0, count);
  }

  const repeated: T[] = [];
  while (repeated.length < count) {
    repeated.push(...rng.shuffle(values));
  }
  return repeated.slice(0, count);
}

function isRedNumberToken(token: number): boolean {
  return token === 6 || token === 8;
}

function isLowNumberToken(token: number): boolean {
  return token === 2 || token === 3 || token === 11 || token === 12;
}

function buildTileAdjacencyByCoord(tiles: TileView[]): Map<string, Set<string>> {
  const tileCoordKeys = new Set(tiles.map((tile) => coordKey(tile.q, tile.r)));
  const adjacency = new Map<string, Set<string>>();
  for (const tile of tiles) {
    const key = coordKey(tile.q, tile.r);
    const neighbors = adjacency.get(key) ?? new Set<string>();
    for (const [dq, dr] of [
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1]
    ] as const) {
      const neighborKey = coordKey(tile.q + dq, tile.r + dr);
      if (tileCoordKeys.has(neighborKey)) {
        neighbors.add(neighborKey);
      }
    }
    adjacency.set(key, neighbors);
  }
  return adjacency;
}

function assignScenarioTokens(
  profile: ScenarioProfile,
  layoutMode: LayoutMode,
  rng: SeededRandom,
  tiles: TileView[]
): Map<string, number> {
  const tilesByCoord = new Map(tiles.map((tile) => [coordKey(tile.q, tile.r), tile]));
  const tokenCandidates = tiles
    .filter((tile) => tile.terrain !== "sea" && tile.terrain !== "desert")
    .map((tile) => ({
      coord: coordKey(tile.q, tile.r),
      terrain: tile.terrain ?? "desert",
      neighborCount: 0
    }));
  const adjacency = buildTileAdjacencyByCoord(tiles);
  tokenCandidates.forEach((candidate) => {
    candidate.neighborCount = adjacency.get(candidate.coord)?.size ?? 0;
  });

  const tokenPool = takeShuffledValues(
    tiles.some((tile) => tile.q === 0 && tile.r === 0) && tiles.length > 20
      ? EXTENDED_TOKEN_POOL
      : STANDARD_TOKEN_POOL,
    tokenCandidates.length,
    rng
  );
  const rules =
    layoutMode === "official_variable" ? profile.variableTokenRules : profile.fixedTokenRules;
  const orderedCandidates = [...tokenCandidates].sort((left, right) => {
    const leftScore =
      left.neighborCount * 10 +
      (left.terrain === "gold" ? 4 : 0) +
      ((left.terrain === "lumber" || left.terrain === "wool") ? 2 : 0) +
      ((rules.forbiddenNumbersByCoord[left.coord]?.length ?? 0) > 0 ? 3 : 0);
    const rightScore =
      right.neighborCount * 10 +
      (right.terrain === "gold" ? 4 : 0) +
      ((right.terrain === "lumber" || right.terrain === "wool") ? 2 : 0) +
      ((rules.forbiddenNumbersByCoord[right.coord]?.length ?? 0) > 0 ? 3 : 0);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    const leftTile = tilesByCoord.get(left.coord)!;
    const rightTile = tilesByCoord.get(right.coord)!;
    if (leftTile.r !== rightTile.r) {
      return leftTile.r - rightTile.r;
    }
    return leftTile.q - rightTile.q;
  });

  for (let attempt = 0; attempt < 128; attempt += 1) {
    const remainingTokens = rng.shuffle([...tokenPool]);
    const assigned = new Map<string, number>();
    let valid = true;

    for (const candidate of orderedCandidates) {
      let selectedIndex = -1;
      for (let tokenIndex = 0; tokenIndex < remainingTokens.length; tokenIndex += 1) {
        const token = remainingTokens[tokenIndex]!;
        if (!isScenarioTokenAllowed(candidate, token, assigned, adjacency, rules)) {
          continue;
        }
        selectedIndex = tokenIndex;
        break;
      }
      if (selectedIndex < 0) {
        valid = false;
        break;
      }
      assigned.set(candidate.coord, remainingTokens[selectedIndex]!);
      remainingTokens.splice(selectedIndex, 1);
    }

    if (valid) {
      return assigned;
    }
  }

  throw new Error("Unable to assign Seafarers tokens for scenario layout.");
}

function isScenarioTokenAllowed(
  candidate: {
    coord: string;
    terrain: string;
  },
  token: number,
  assignedTokens: Map<string, number>,
  adjacency: Map<string, Set<string>>,
  rules: ScenarioTokenRules
): boolean {
  if (rules.forbiddenNumbersByCoord[candidate.coord]?.includes(token)) {
    return false;
  }
  if (rules.forbidRedNumbersOnGold && candidate.terrain === "gold" && isRedNumberToken(token)) {
    return false;
  }
  if (
    rules.forbidLowNumbersOnForestOrPasture &&
    (candidate.terrain === "lumber" || candidate.terrain === "wool") &&
    isLowNumberToken(token)
  ) {
    return false;
  }
  if (rules.forbidAdjacentRedNumbers && isRedNumberToken(token)) {
    for (const neighborCoord of adjacency.get(candidate.coord) ?? []) {
      const neighborToken = assignedTokens.get(neighborCoord);
      if (neighborToken !== undefined && isRedNumberToken(neighborToken)) {
        return false;
      }
    }
  }
  return true;
}

function getResourceForTerrain(terrain: TileTerrain): Resource | "desert" {
  if (
    terrain === "brick" ||
    terrain === "lumber" ||
    terrain === "ore" ||
    terrain === "grain" ||
    terrain === "wool"
  ) {
    return terrain;
  }
  return "desert";
}

function applyOfficialFixedScenarioTileContents(
  spec: OfficialFixedScenarioSpec,
  tiles: TileView[]
): {
  defaultRobberTileId: string | null;
  firstDesertTileId: string | null;
  pirateTileId: string | null;
} {
  const tilesByCoord = new Map(Object.entries(spec.tiles));
  let defaultRobberTileId: string | null = null;
  let firstDesertTileId: string | null = null;
  let pirateTileId: string | null = null;

  for (const tile of tiles) {
    const fixedTile = tilesByCoord.get(coordKey(tile.q, tile.r)) ?? null;
    const terrain = fixedTile?.terrain ?? "sea";
    const hidden = fixedTile?.hidden ?? false;
    const kind = fixedTile?.kind ?? (hidden ? "fog" : terrain === "sea" ? "sea" : "land");

    tile.kind = kind;
    tile.terrain = terrain;
    tile.resource = getResourceForTerrain(terrain);
    tile.token = fixedTile?.token ?? null;
    tile.robber = fixedTile?.robber ?? false;
    tile.occupant = fixedTile?.occupant ?? null;
    tile.hidden = hidden;
    tile.discovered = !hidden;

    if (terrain === "desert" && firstDesertTileId === null) {
      firstDesertTileId = tile.id;
    }
    if (tile.robber && defaultRobberTileId === null) {
      defaultRobberTileId = tile.id;
    }
    if (tile.occupant === "pirate" && pirateTileId === null) {
      pirateTileId = tile.id;
    }
  }

  return {
    defaultRobberTileId,
    firstDesertTileId,
    pirateTileId
  };
}

function applyFogIslandsOriginalTileContents(
  setup: FogOriginalSetup,
  rng: SeededRandom,
  tiles: TileView[]
): void {
  const fixedSeaCoords = new Set(setup.fixedSeaCoords);
  const hiddenCoords = new Set(setup.hiddenCoords);
  const fixedVisibleTiles = new Map(Object.entries(setup.visibleTiles ?? {}));
  const hasExplicitRobber = [...fixedVisibleTiles.values()].some((tile) => tile.robber === true);
  const variableVisibleTerrains = setup.faceupTerrainPool ? rng.shuffle([...setup.faceupTerrainPool]) : [];
  const variableVisibleTokens = setup.faceupTokenPool ? rng.shuffle([...setup.faceupTokenPool]) : [];
  const variableVisibleTerrainByCoord = new Map<string, TileTerrain>();
  const variableVisibleTokenByCoord = new Map<string, number>();

  if (setup.visibleLandCoords) {
    if (variableVisibleTerrains.length !== setup.visibleLandCoords.length) {
      throw new Error("Fog Islands faceup terrain pool does not match the visible coord count.");
    }
    let tokenIndex = 0;
    for (const [index, coord] of setup.visibleLandCoords.entries()) {
      const terrain = variableVisibleTerrains[index]!;
      variableVisibleTerrainByCoord.set(coord, terrain);
      if (terrain !== "sea" && terrain !== "desert") {
        const token = variableVisibleTokens[tokenIndex] ?? null;
        if (token === null) {
          throw new Error("Fog Islands faceup token pool exhausted.");
        }
        variableVisibleTokenByCoord.set(coord, token);
        tokenIndex += 1;
      }
    }
    if (tokenIndex !== variableVisibleTokens.length) {
      throw new Error("Fog Islands faceup token pool has unused entries.");
    }
  }

  for (const tile of tiles) {
    const key = coordKey(tile.q, tile.r);
    const fixedVisibleTile = fixedVisibleTiles.get(key) ?? null;
    const variableVisibleTerrain = variableVisibleTerrainByCoord.get(key) ?? null;
    const terrain = fixedSeaCoords.has(key)
      ? "sea"
      : fixedVisibleTile?.terrain ?? variableVisibleTerrain;

    tile.robber = false;
    tile.occupant = null;

    if (hiddenCoords.has(key)) {
      tile.kind = "fog";
      tile.terrain = null;
      tile.resource = "desert";
      tile.token = null;
      tile.hidden = true;
      tile.discovered = false;
      continue;
    }

    const resolvedTerrain = terrain ?? "sea";
    tile.kind = resolvedTerrain === "sea" ? "sea" : "land";
    tile.terrain = resolvedTerrain;
    tile.resource = getResourceForTerrain(resolvedTerrain);
    tile.token = fixedVisibleTile?.token ?? variableVisibleTokenByCoord.get(key) ?? null;
    tile.robber = fixedVisibleTile?.robber ?? false;
    tile.hidden = false;
    tile.discovered = true;
  }

  const pirateTile = tiles.find((tile) => coordKey(tile.q, tile.r) === setup.pirateCoord);
  if (pirateTile) {
    pirateTile.occupant = "pirate";
  }

  if (!hasExplicitRobber) {
    const robberTile = tiles.find((tile) => tile.token === 12 && tile.terrain !== "sea" && tile.kind !== "sea");
    if (robberTile) {
      robberTile.robber = true;
    }
  }
}

export function applySeafarersTileContents(
  input: {
    boardSize: BoardSize;
    scenarioId: ScenarioId;
    layoutMode: LayoutMode;
    playerCount: number;
  },
  rng: SeededRandom,
  tiles: TileView[]
): void {
  const fixedSpec =
    input.layoutMode === "official_fixed"
      ? getOfficialFixedScenarioSpec(input.scenarioId, input.boardSize, input.playerCount)
      : null;
  if (fixedSpec && Object.keys(fixedSpec.tiles).length > 0) {
    const { defaultRobberTileId, firstDesertTileId, pirateTileId } = applyOfficialFixedScenarioTileContents(
      fixedSpec,
      tiles
    );
    if (!defaultRobberTileId) {
      const robberTileId = resolveScenarioRobberTileId(input, tiles, defaultRobberTileId, firstDesertTileId);
      if (robberTileId) {
        const robberTile = tiles.find((tile) => tile.id === robberTileId);
        if (robberTile) {
          robberTile.robber = true;
        }
      }
    }
    if (!pirateTileId) {
      const fallbackPirateTile = tiles.find((tile) => tile.terrain === "sea");
      if (fallbackPirateTile && input.scenarioId === "seafarers.pirate_islands") {
        fallbackPirateTile.occupant = "pirate";
      }
    }
    return;
  }

  const placementRng =
    input.layoutMode === "official_fixed"
      ? new SeededRandom(`seafarers:fixed:${input.scenarioId}:${input.boardSize}:${input.playerCount}`)
      : rng;
  const fogSetup = getFogIslandsOriginalSetup(input);
  if (fogSetup) {
    applyFogIslandsOriginalTileContents(fogSetup, placementRng, tiles);
    return;
  }

  const profile = createProfile(input.boardSize, input.scenarioId, input.playerCount);
  const specByCoord = new Map<string, "sea" | "land" | "fog_land" | "fog_sea" | "gold" | "desert">();
  let defaultRobberTileId: string | null = null;
  let firstDesertTileId: string | null = null;

  for (const key of profile.landCoords) {
    specByCoord.set(key, "land");
  }
  for (const key of profile.fogLandCoords) {
    specByCoord.set(key, "fog_land");
  }
  for (const key of profile.fogSeaCoords) {
    specByCoord.set(key, "fog_sea");
  }
  for (const key of profile.goldCoords) {
    specByCoord.set(key, "gold");
  }
  for (const key of profile.desertCoords) {
    specByCoord.set(key, "desert");
  }

  const baseResourcePool =
    input.boardSize === "extended" ? EXTENDED_RESOURCE_POOL : STANDARD_RESOURCE_POOL;
  const landLikeCount =
    profile.landCoords.length + profile.fogLandCoords.length;
  const resources = takeShuffledValues(baseResourcePool, landLikeCount, placementRng);
  let resourceIndex = 0;
  let pirateTileId: string | null = null;

  for (const tile of tiles) {
    const spec = specByCoord.get(coordKey(tile.q, tile.r)) ?? "sea";
    tile.robber = false;
    tile.occupant = null;
    tile.hidden = false;
    tile.discovered = true;

    switch (spec) {
      case "sea":
        tile.kind = "sea";
        tile.terrain = "sea";
        tile.resource = "desert";
        tile.token = null;
        break;
      case "land": {
        const resource = resources[resourceIndex++] ?? "grain";
        tile.kind = "land";
        tile.terrain = resource;
        tile.resource = resource;
        tile.token = null;
        if (coordKey(tile.q, tile.r) === profile.initialRobberCoord && defaultRobberTileId === null) {
          defaultRobberTileId = tile.id;
        }
        break;
      }
      case "fog_land": {
        const resource = resources[resourceIndex++] ?? "grain";
        tile.kind = "fog";
        tile.terrain = resource;
        tile.resource = resource;
        tile.token = null;
        tile.hidden = true;
        tile.discovered = false;
        if (coordKey(tile.q, tile.r) === profile.initialRobberCoord && defaultRobberTileId === null) {
          defaultRobberTileId = tile.id;
        }
        break;
      }
      case "fog_sea":
        tile.kind = "fog";
        tile.terrain = "sea";
        tile.resource = "desert";
        tile.token = null;
        tile.hidden = true;
        tile.discovered = false;
        if (coordKey(tile.q, tile.r) === profile.initialPirateCoord) {
          pirateTileId = tile.id;
        }
        break;
      case "gold":
        tile.kind = "land";
        tile.terrain = "gold";
        tile.resource = "desert";
        tile.token = null;
        if (coordKey(tile.q, tile.r) === profile.initialRobberCoord && defaultRobberTileId === null) {
          defaultRobberTileId = tile.id;
        }
        break;
      case "desert":
        tile.kind = "land";
        tile.terrain = "desert";
        tile.resource = "desert";
        tile.token = null;
        if (firstDesertTileId === null) {
          firstDesertTileId = tile.id;
        }
        if (coordKey(tile.q, tile.r) === profile.initialRobberCoord && defaultRobberTileId === null) {
          defaultRobberTileId = tile.id;
        }
        break;
    }

    if (coordKey(tile.q, tile.r) === profile.initialPirateCoord && tile.terrain === "sea") {
      pirateTileId = tile.id;
    }
  }

  const tokenAssignments = assignScenarioTokens(profile, input.layoutMode, placementRng, tiles);
  for (const tile of tiles) {
    const key = coordKey(tile.q, tile.r);
    tile.token = tokenAssignments.get(key) ?? tile.token;
  }

  const robberTileId = resolveScenarioRobberTileId(
    input,
    tiles,
    defaultRobberTileId,
    firstDesertTileId
  );
  if (robberTileId) {
    const robberTile = tiles.find((tile) => tile.id === robberTileId);
    if (robberTile) {
      robberTile.robber = true;
    }
  }

  if (!pirateTileId && profile.initialPirateCoord) {
    pirateTileId = tiles.find((tile) => tile.terrain === "sea")?.id ?? null;
  }
  if (pirateTileId) {
    const pirateTile = tiles.find((tile) => tile.id === pirateTileId);
    if (pirateTile) {
      pirateTile.occupant = "pirate";
    }
  }
}

function resolveScenarioRobberTileId(
  input: {
    boardSize: BoardSize;
    scenarioId: ScenarioId;
    layoutMode: LayoutMode;
    playerCount: number;
  },
  tiles: TileView[],
  defaultRobberTileId: string | null,
  firstDesertTileId: string | null
): string | null {
  const fallbackTileId =
    defaultRobberTileId ??
    firstDesertTileId ??
    tiles.find((tile) => tile.terrain !== "sea" && tile.kind !== "sea")?.id ??
    null;
  if (input.layoutMode !== "official_variable") {
    return fallbackTileId;
  }

  const profile = createProfile(input.boardSize, input.scenarioId, input.playerCount);
  switch (profile.variableRobberPlacement) {
    case "token_12":
      return findTileIdByTokenValue(tiles, 12) ?? fallbackTileId;
    case "first_desert":
      return firstDesertTileId ?? fallbackTileId;
    default:
      return fallbackTileId;
  }
}

function findTileIdByTokenValue(tiles: TileView[], token: number): string | null {
  return tiles.find((tile) => tile.token === token && tile.terrain !== "sea")?.id ?? null;
}

function isSeaTile(tile: TileView): boolean {
  if (tile.kind === "fog" && tile.hidden) {
    return true;
  }
  return tile.terrain === "sea" || tile.kind === "sea";
}

function isLandTile(tile: TileView): boolean {
  return !isSeaTile(tile);
}

export function finalizeSeafarersBoard(
  tiles: TileView[],
  vertices: VertexView[],
  edges: EdgeView[]
): void {
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));

  for (const edge of edges) {
    const adjacentTiles = edge.tileIds.flatMap((tileId) => {
      const tile = tileById.get(tileId);
      return tile ? [tile] : [];
    });
    const seaCount = adjacentTiles.filter(isSeaTile).length;
    const landCount = adjacentTiles.filter(isLandTile).length;
    const boundaryShoreline = edge.tileIds.length === 1 && landCount === 1;
    const boundarySea = edge.tileIds.length === 1 && seaCount === 1;

    if (boundaryShoreline || (landCount === 1 && seaCount === 1)) {
      edge.routeZone = "coast";
      edge.roadAllowed = true;
      edge.shipAllowed = true;
    } else if (boundarySea || landCount === 0) {
      edge.routeZone = "sea";
      edge.roadAllowed = false;
      edge.shipAllowed = true;
    } else {
      edge.routeZone = "land";
      edge.roadAllowed = true;
      edge.shipAllowed = false;
    }

    edge.routeType = edge.ownerId ? edge.routeType ?? "road" : null;
    edge.movable = false;
    edge.blockedByPirate = false;
    edge.placedOnTurn = edge.placedOnTurn ?? null;
  }

  const landTileIds = tiles.filter(isLandTile).map((tile) => tile.id);
  const landNeighbors = new Map<string, string[]>();
  for (const tileId of landTileIds) {
    landNeighbors.set(tileId, []);
  }

  for (const edge of edges) {
    const adjacentLandIds = edge.tileIds.filter((tileId) => {
      const tile = tileById.get(tileId);
      return tile ? isLandTile(tile) : false;
    });
    if (adjacentLandIds.length !== 2) {
      continue;
    }

    const [leftId, rightId] = adjacentLandIds;
    if (!leftId || !rightId) {
      continue;
    }

    landNeighbors.get(leftId)?.push(rightId);
    landNeighbors.get(rightId)?.push(leftId);
  }

  const islandByTileId = new Map<string, string>();
  let islandIndex = 0;
  for (const tileId of landTileIds) {
    if (islandByTileId.has(tileId)) {
      continue;
    }

    islandIndex += 1;
    const islandId = `island-${islandIndex}`;
    const queue = [tileId];
    islandByTileId.set(tileId, islandId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      for (const neighborId of landNeighbors.get(current) ?? []) {
        if (islandByTileId.has(neighborId)) {
          continue;
        }
        islandByTileId.set(neighborId, islandId);
        queue.push(neighborId);
      }
    }
  }

  for (const vertex of vertices) {
    const islandId =
      vertex.tileIds
        .map((tileId) => islandByTileId.get(tileId))
        .find((value): value is string => !!value) ?? null;
    vertex.islandId = islandId;
    vertex.coastal = vertex.edgeIds.some((edgeId) => {
      const edge = edges.find((candidate) => candidate.id === edgeId);
      return edge?.shipAllowed === true;
    });
  }
}

function resolveTileByCoord(
  tilesByCoord: Map<string, TileView>,
  tileCoord: string
): TileView {
  const tile = tilesByCoord.get(tileCoord) ?? null;
  if (!tile) {
    throw new Error(`Missing tile ${tileCoord} in Seafarers scenario spec.`);
  }
  return tile;
}

function resolveVertexIdFromRef(
  tilesByCoord: Map<string, TileView>,
  ref: TileVertexRefSpec
): string {
  const tile = resolveTileByCoord(tilesByCoord, ref.tileCoord);
  const vertexId = tile.vertexIds[ref.corner] ?? null;
  if (!vertexId) {
    throw new Error(`Missing vertex corner ${ref.corner} on tile ${ref.tileCoord}.`);
  }
  return vertexId;
}

function resolveEdgeIdFromRef(
  tilesByCoord: Map<string, TileView>,
  ref: TileEdgeRefSpec
): string {
  const tile = resolveTileByCoord(tilesByCoord, ref.tileCoord);
  const edgeId = tile.edgeIds[ref.side] ?? null;
  if (!edgeId) {
    throw new Error(`Missing edge side ${ref.side} on tile ${ref.tileCoord}.`);
  }
  return edgeId;
}

function resolveVillageSiteVertexId(
  tilesByCoord: Map<string, TileView>,
  site: OfficialVillageSiteSpec
): string {
  if (site.edgeRef) {
    const tile = resolveTileByCoord(tilesByCoord, site.edgeRef.tileCoord);
    const vertexId = tile.vertexIds[site.edgeRef.side] ?? null;
    if (!vertexId) {
      throw new Error(`Missing vertex side ${site.edgeRef.side} on tile ${site.edgeRef.tileCoord}.`);
    }
    return vertexId;
  }
  if (!site.ref) {
    throw new Error("Village site is missing both ref and edgeRef.");
  }
  return resolveVertexIdFromRef(tilesByCoord, site.ref);
}

function getOfficialSiteCoord(site: OfficialSiteSpec): string {
  if (site.type === "village") {
    return site.edgeRef?.tileCoord ?? site.ref?.tileCoord ?? "";
  }
  return site.ref.tileCoord;
}

function createOfficialScenarioSites(
  spec: OfficialFixedScenarioSpec,
  input: {
    scenarioId: ScenarioId;
    boardSize: BoardSize;
  },
  tilesByCoord: Map<string, TileView>
): BoardSiteView[] {
  return (spec.sites ?? []).map((siteSpec, index) => {
    switch (siteSpec.type) {
      case "village": {
        const vertexId = resolveVillageSiteVertexId(tilesByCoord, siteSpec);
        const edgeId = siteSpec.edgeRef ? resolveEdgeIdFromRef(tilesByCoord, siteSpec.edgeRef) : null;
        const numberToken =
          siteSpec.numberToken ??
          [...tilesByCoord.values()].find(
            (tile) =>
              (edgeId ? tile.edgeIds.includes(edgeId) : tile.vertexIds.includes(vertexId)) &&
              tile.token !== null &&
              tile.terrain !== "sea" &&
              tile.kind !== "sea"
          )?.token ??
          null;
        if (numberToken === null) {
          const locationLabel = siteSpec.edgeRef
            ? `${siteSpec.edgeRef.tileCoord}:edge:${siteSpec.edgeRef.side}`
            : `${siteSpec.ref?.tileCoord}:${siteSpec.ref?.corner}`;
          throw new Error(
            `Missing number token for village site at ${locationLabel}.`
          );
        }
        return {
          id: `site-village-${index + 1}`,
          type: "village",
          scenarioId: "seafarers.cloth_for_catan",
          vertexId,
          edgeId,
          numberToken,
          clothSupply: siteSpec.clothSupply ?? 5,
          initialClothSupply: siteSpec.initialClothSupply ?? 5
        } satisfies BoardSiteView;
      }
      case "landing":
        return {
          id: `site-landing-${index + 1}`,
          type: "landing",
          scenarioId: "seafarers.pirate_islands",
          vertexId: resolveVertexIdFromRef(tilesByCoord, siteSpec.ref),
          beachheadColor: SCENARIO_COLOR_ORDER[index] ?? null
        } satisfies BoardSiteView;
      case "fortress":
        return {
          id: `site-fortress-${index + 1}`,
          type: "fortress",
          scenarioId: "seafarers.pirate_islands",
          vertexId: resolveVertexIdFromRef(tilesByCoord, siteSpec.ref),
          pirateLairCount: siteSpec.pirateLairCount ?? 3,
          fortressColor: SCENARIO_COLOR_ORDER[index] ?? null,
          captured: false
        } satisfies BoardSiteView;
      case "wonder": {
        const config = getWonderConfig(input.boardSize, siteSpec.wonderId);
        return {
          id: `site-wonder-${index + 1}`,
          type: "wonder",
          scenarioId: "seafarers.wonders_of_catan",
          vertexId: resolveVertexIdFromRef(tilesByCoord, siteSpec.ref),
          wonderId: siteSpec.wonderId,
          requirementId: config.requirementId,
          buildCost: { ...config.buildCost },
          progress: 0,
          claimed: false
        } satisfies BoardSiteView;
      }
    }
  });
}

function createOfficialScenarioMarkers(
  spec: OfficialFixedScenarioSpec,
  tilesByCoord: Map<string, TileView>
): ScenarioMarkerView[] {
  return (spec.markers ?? []).map((markerSpec, index) => {
    switch (markerSpec.type) {
      case "forgotten_tribe_vp":
        return {
          id: `marker-forgotten-vp-${index + 1}`,
          type: "forgotten_tribe_vp",
          edgeId: resolveEdgeIdFromRef(tilesByCoord, markerSpec.ref)
        } satisfies ScenarioMarkerView;
      case "forgotten_tribe_development":
        return {
          id: `marker-forgotten-development-${index + 1}`,
          type: "forgotten_tribe_development",
          edgeId: resolveEdgeIdFromRef(tilesByCoord, markerSpec.ref)
        } satisfies ScenarioMarkerView;
      case "forgotten_tribe_port":
        return {
          id: `marker-forgotten-port-${markerSpec.portType}-${index + 1}`,
          type: "forgotten_tribe_port",
          edgeId: resolveEdgeIdFromRef(tilesByCoord, markerSpec.ref),
          portType: markerSpec.portType
        } satisfies ScenarioMarkerView;
      case "wonder_block":
        return {
          id: `marker-wonder-block-${index + 1}`,
          type: "wonder_block",
          vertexId: resolveVertexIdFromRef(tilesByCoord, markerSpec.ref),
          scenarioId: "seafarers.wonders_of_catan",
          marker: markerSpec.marker
        } satisfies ScenarioMarkerView;
    }
  });
}

function requiresExplicitOfficialSites(scenarioId: ScenarioId): boolean {
  switch (scenarioId) {
    case "seafarers.cloth_for_catan":
    case "seafarers.pirate_islands":
    case "seafarers.wonders_of_catan":
      return true;
    default:
      return false;
  }
}

function requiresExplicitOfficialMarkers(scenarioId: ScenarioId): boolean {
  switch (scenarioId) {
    case "seafarers.forgotten_tribe":
    case "seafarers.wonders_of_catan":
      return true;
    default:
      return false;
  }
}

function requiresExplicitOfficialPirateFleetPath(scenarioId: ScenarioId): boolean {
  return scenarioId === "seafarers.pirate_islands";
}

export function createSeafarersScenarioFeatures(
  input: {
    scenarioId: ScenarioId;
    boardSize: BoardSize;
    layoutMode: LayoutMode;
    playerCount: number;
  },
  tiles: TileView[],
  vertices: VertexView[],
  edges: EdgeView[]
): ScenarioFeatures {
  const profile = createProfile(input.boardSize, input.scenarioId, input.playerCount);
  const resolvedPlayerCount = resolveScenarioPlayerCount(input.playerCount, input.boardSize);
  const profileOverride = getScenarioProfileOverride(
    input.scenarioId,
    input.boardSize,
    resolvedPlayerCount
  );
  const fixedSpec =
    input.layoutMode === "official_fixed"
      ? getOfficialFixedScenarioSpec(input.scenarioId, input.boardSize, input.playerCount)
      : null;
  const scenarioProfile =
    fixedSpec?.logicalIslandGroups !== undefined
      ? {
          ...profile,
          logicalIslandGroups: cloneLogicalIslandGroups(fixedSpec.logicalIslandGroups)
        }
      : profile;
  applyLogicalIslandGroups(scenarioProfile, tiles, vertices);
  const islands = collectIslands(tiles, vertices, edges);
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const tileByCoord = new Map(tiles.map((tile) => [coordKey(tile.q, tile.r), tile]));
  const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const homeIslandIds = new Set(selectHomeIslandIds(scenarioProfile, islands));
  const foreignIslands = islands.filter((island) => !homeIslandIds.has(island.id));
  const explicitSites = fixedSpec?.sites ?? profileOverride?.sites;
  const explicitMarkers = fixedSpec?.markers ?? profileOverride?.markers;
  if (input.layoutMode === "official_fixed") {
    if (requiresExplicitOfficialSites(input.scenarioId) && !explicitSites) {
      throw new Error(
        `Missing explicit official fixed site data for Seafarers scenario ${input.scenarioId}:${input.boardSize}:${resolvedPlayerCount}.`
      );
    }
    if (requiresExplicitOfficialMarkers(input.scenarioId) && !explicitMarkers) {
      throw new Error(
        `Missing explicit official fixed marker data for Seafarers scenario ${input.scenarioId}:${input.boardSize}:${resolvedPlayerCount}.`
      );
    }
    if (
      requiresExplicitOfficialPirateFleetPath(input.scenarioId) &&
      !getSeafarersPirateFleetPathCoords({
        scenarioId: input.scenarioId,
        boardSize: input.boardSize,
        playerCount: input.playerCount,
        layoutMode: input.layoutMode
      })
    ) {
      throw new Error(
        `Missing explicit official fixed pirate fleet path for Seafarers scenario ${input.scenarioId}:${input.boardSize}:${resolvedPlayerCount}.`
      );
    }
  }
  const sites: BoardSiteView[] = explicitSites
    ? createOfficialScenarioSites(
        {
          tiles: {},
          ports: [],
          sites: explicitSites
        },
        input,
        tileByCoord
      )
    : [];
  const scenarioMarkers: ScenarioMarkerView[] = explicitMarkers
    ? createOfficialScenarioMarkers(
        {
          tiles: {},
          ports: [],
          markers: explicitMarkers
        },
        tileByCoord
      )
    : [];

  if (input.layoutMode !== "official_fixed" && !explicitSites && input.scenarioId === "seafarers.cloth_for_catan") {
    sites.push(...createVillageSites(input.boardSize, foreignIslands, vertexById, tileById));
  }

  if (input.layoutMode !== "official_fixed" && !explicitSites && input.scenarioId === "seafarers.wonders_of_catan") {
    sites.push(...createWonderSites(input.boardSize, foreignIslands, vertexById));
  }
  if (input.layoutMode !== "official_fixed" && !explicitMarkers && input.scenarioId === "seafarers.wonders_of_catan") {
    scenarioMarkers.push(...createWonderBlockMarkers(sites));
  }

  if (input.layoutMode !== "official_fixed" && !explicitSites && input.scenarioId === "seafarers.pirate_islands") {
    sites.push(...createLandingSites(foreignIslands, vertexById, input.playerCount));
    sites.push(...createFortressSites(foreignIslands, vertexById, input.playerCount));
  }

  if (input.layoutMode !== "official_fixed" && !explicitMarkers && input.scenarioId === "seafarers.forgotten_tribe") {
    scenarioMarkers.push(...createForgottenTribeMarkers(input.boardSize, foreignIslands));
  }

  scenarioMarkers.push(
    ...createIslandRewardMarkers(input.scenarioId, foreignIslands, vertexById, tiles, edges)
  );

  for (const site of sites) {
    if (site.type === "village" && site.edgeId) {
      continue;
    }
    const vertex = vertexById.get(site.vertexId);
    if (vertex) {
      vertex.site = { ...site };
    }
  }

  return {
    sites,
    scenarioMarkers
  };
}

function collectIslands(
  tiles: TileView[],
  vertices: VertexView[],
  edges: EdgeView[]
): IslandInfo[] {
  const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const islandsById = new Map<string, IslandInfo>();

  for (const tile of tiles) {
    if (!isLandTile(tile)) {
      continue;
    }

    const islandId =
      tile.vertexIds
        .map((vertexId) => vertexById.get(vertexId)?.islandId ?? null)
        .find((value): value is string => !!value) ?? null;
    if (!islandId) {
      continue;
    }

    const current =
      islandsById.get(islandId) ??
      {
        id: islandId,
        tileIds: [],
        vertexIds: [],
        coastalVertexIds: [],
        coastalEdgeIds: [],
        size: 0,
        centroidX: 0,
        centroidY: 0
      };
    current.tileIds.push(tile.id);
    current.size += 1;
    current.centroidX += tile.x;
    current.centroidY += tile.y;
    for (const vertexId of tile.vertexIds) {
      if (!current.vertexIds.includes(vertexId)) {
        current.vertexIds.push(vertexId);
      }
    }
    islandsById.set(islandId, current);
  }

  for (const island of islandsById.values()) {
    island.centroidX /= Math.max(1, island.size);
    island.centroidY /= Math.max(1, island.size);
    island.coastalVertexIds = island.vertexIds.filter((vertexId) => vertexById.get(vertexId)?.coastal === true);
    island.coastalEdgeIds = edges
      .filter((edge) => edge.routeZone === "coast" && edge.vertexIds.some((vertexId) => island.vertexIds.includes(vertexId)))
      .map((edge) => edge.id);
  }

  return [...islandsById.values()].sort((left, right) => {
    if (right.size !== left.size) {
      return right.size - left.size;
    }
    if (right.centroidX !== left.centroidX) {
      return right.centroidX - left.centroidX;
    }
    return left.centroidY - right.centroidY;
  });
}

function applyLogicalIslandGroups(
  profile: ScenarioProfile,
  tiles: TileView[],
  vertices: VertexView[]
): void {
  if (profile.logicalIslandGroups.length === 0) {
    return;
  }

  const groupByCoord = new Map<string, string>();
  profile.logicalIslandGroups.forEach((group, index) => {
    const islandId = `island-${index + 1}`;
    for (const coord of group) {
      groupByCoord.set(coord, islandId);
    }
  });
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));

  for (const vertex of vertices) {
    const countsByIslandId = new Map<string, number>();
    for (const tileId of vertex.tileIds) {
      const tile = tileById.get(tileId);
      if (!tile || isSeaTile(tile)) {
        continue;
      }
      const islandId = groupByCoord.get(coordKey(tile.q, tile.r));
      if (!islandId) {
        continue;
      }
      countsByIslandId.set(islandId, (countsByIslandId.get(islandId) ?? 0) + 1);
    }

    if (countsByIslandId.size === 0) {
      continue;
    }

    vertex.islandId = [...countsByIslandId.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })[0]?.[0] ?? vertex.islandId ?? null;
  }
}

function selectHomeIslandIds(profile: ScenarioProfile, islands: IslandInfo[]): string[] {
  return islands.slice(0, profile.homeIslandCount).map((island) => island.id);
}

function createVillageSites(
  boardSize: BoardSize,
  islands: IslandInfo[],
  verticesById: Map<string, VertexView>,
  tilesById: Map<string, TileView>
): BoardSiteView[] {
  const candidateIslands = [...islands].sort((left, right) => {
    if (left.size !== right.size) {
      return left.size - right.size;
    }
    return left.centroidX - right.centroidX;
  });
  const sites: BoardSiteView[] = [];
  const siteLimit = boardSize === "extended" ? 12 : 8;
  const perIslandLimit = Math.max(2, Math.ceil(siteLimit / Math.max(1, candidateIslands.length)));
  let index = 0;

  for (const island of candidateIslands) {
    const vertexIds = pickDistinctVertices(
      island.coastalVertexIds.filter((vertexId) => getVertexNumberToken(verticesById.get(vertexId) ?? null, tilesById) !== null),
      verticesById,
      perIslandLimit
    );
    for (const vertexId of vertexIds) {
      const numberToken = getVertexNumberToken(verticesById.get(vertexId) ?? null, tilesById);
      if (numberToken === null) {
        continue;
      }
      index += 1;
      sites.push({
        id: `site-village-${index}`,
        type: "village",
        scenarioId: "seafarers.cloth_for_catan",
        vertexId,
        numberToken,
        clothSupply: 5,
        initialClothSupply: 5
      });
      if (index >= siteLimit) {
        return sites;
      }
    }
  }

  return sites;
}

function createWonderSites(
  boardSize: BoardSize,
  islands: IslandInfo[],
  verticesById: Map<string, VertexView>
): BoardSiteView[] {
  const configs = boardSize === "extended" ? EXTENDED_WONDER_CONFIGS : STANDARD_WONDER_CONFIGS;
  const perIslandLimit = Math.max(1, Math.ceil(configs.length / Math.max(1, islands.length)));
  const candidateVertexIds = islands.flatMap((island) =>
    pickDistinctVertices(island.coastalVertexIds, verticesById, perIslandLimit)
  );
  return candidateVertexIds.slice(0, configs.length).map((vertexId, index) => {
    const config = configs[index]!;
    return {
      id: `site-wonder-${index + 1}`,
      type: "wonder",
      scenarioId: "seafarers.wonders_of_catan",
      vertexId,
      wonderId: config.wonderId,
      requirementId: config.requirementId,
      buildCost: { ...config.buildCost },
      progress: 0,
      claimed: false
    } satisfies BoardSiteView;
  });
}

function createFortressSites(
  islands: IslandInfo[],
  verticesById: Map<string, VertexView>,
  playerCount: number
): BoardSiteView[] {
  const candidateIslands = [...islands].sort((left, right) => left.centroidX - right.centroidX);
  const fortressCount = Math.max(3, Math.min(playerCount, SCENARIO_COLOR_ORDER.length));
  const perIslandLimit = Math.max(1, Math.ceil(fortressCount / Math.max(1, candidateIslands.length)));
  const vertexIds = candidateIslands.flatMap((island) =>
    pickDistinctVertices(island.coastalVertexIds, verticesById, perIslandLimit)
  );
  return vertexIds.slice(0, fortressCount).map((vertexId, index) => ({
    id: `site-fortress-${index + 1}`,
    type: "fortress",
    scenarioId: "seafarers.pirate_islands",
    vertexId,
    pirateLairCount: 3,
    fortressColor: SCENARIO_COLOR_ORDER[index] ?? null,
    captured: false
  }));
}

function createLandingSites(
  islands: IslandInfo[],
  verticesById: Map<string, VertexView>,
  playerCount: number
): BoardSiteView[] {
  const candidateIslands = [...islands].sort((left, right) => left.centroidX - right.centroidX);
  const landingCount = Math.max(3, Math.min(playerCount, SCENARIO_COLOR_ORDER.length));
  const perIslandLimit = Math.max(1, Math.ceil(landingCount / Math.max(1, candidateIslands.length)));
  const vertexIds = candidateIslands.flatMap((island) =>
    pickDistinctVertices(island.coastalVertexIds, verticesById, perIslandLimit)
  );
  return vertexIds.slice(0, landingCount).map((vertexId, index) => ({
    id: `site-landing-${index + 1}`,
    type: "landing",
    scenarioId: "seafarers.pirate_islands",
    vertexId,
    beachheadColor: SCENARIO_COLOR_ORDER[index] ?? null
  }));
}

function createForgottenTribeMarkers(
  boardSize: BoardSize,
  islands: IslandInfo[]
): ScenarioMarkerView[] {
  const candidateEdges = islands
    .flatMap((island) => island.coastalEdgeIds)
    .filter((edgeId, index, all) => all.indexOf(edgeId) === index);
  const vpCount = boardSize === "extended" ? 10 : 8;
  const developmentCount = boardSize === "extended" ? 6 : 4;
  const ports =
    boardSize === "extended" ? EXTENDED_FORGOTTEN_TRIBE_PORTS : STANDARD_FORGOTTEN_TRIBE_PORTS;
  const markers: ScenarioMarkerView[] = [];
  let index = 0;

  for (let count = 0; count < vpCount && index < candidateEdges.length; count += 1, index += 1) {
    markers.push({
      id: `marker-forgotten-vp-${count + 1}`,
      type: "forgotten_tribe_vp",
      edgeId: candidateEdges[index]!
    });
  }
  for (
    let count = 0;
    count < developmentCount && index < candidateEdges.length;
    count += 1, index += 1
  ) {
    markers.push({
      id: `marker-forgotten-development-${count + 1}`,
      type: "forgotten_tribe_development",
      edgeId: candidateEdges[index]!
    });
  }
  for (const portType of ports) {
    if (index >= candidateEdges.length) {
      break;
    }
    markers.push({
      id: `marker-forgotten-port-${portType}-${index + 1}`,
      type: "forgotten_tribe_port",
      edgeId: candidateEdges[index]!,
      portType
    });
    index += 1;
  }

  return markers;
}

function createIslandRewardMarkers(
  scenarioId: ScenarioId,
  islands: IslandInfo[],
  verticesById: Map<string, VertexView>,
  tiles: TileView[],
  edges: EdgeView[]
): ScenarioMarkerView[] {
  type IslandRewardMarker = Extract<ScenarioMarkerView, { type: "island_reward" }>;
  const rewardPoints = getSeafarersIslandRewardPoints(scenarioId);
  if (rewardPoints === 0) {
    return [];
  }
  const resolvedRewardPoints: 1 | 2 = rewardPoints;

  const regions =
    scenarioId === "seafarers.through_the_desert"
      ? collectThroughTheDesertRegions(tiles, edges, verticesById)
      : islands.map((island) => ({
          id: island.id,
          vertexIds: island.coastalVertexIds.length > 0 ? island.coastalVertexIds : island.vertexIds
        }));

  return regions
    .map((region, index) => {
      const vertexId = pickScenarioMarkerVertex(region.vertexIds, verticesById);
      if (!vertexId) {
        return null;
      }
      return {
        id: `marker-island-reward-${index + 1}`,
        type: "island_reward",
        vertexId,
        scenarioId: scenarioId as Exclude<
          ScenarioId,
          "base.standard" | "seafarers.cloth_for_catan" | "seafarers.pirate_islands"
        >,
        regionId: region.id,
        rewardPoints: resolvedRewardPoints
      } satisfies IslandRewardMarker;
    })
    .filter((marker): marker is IslandRewardMarker => marker !== null);
}

function createWonderBlockMarkers(sites: BoardSiteView[]): ScenarioMarkerView[] {
  return sites
    .filter((site): site is Extract<BoardSiteView, { type: "wonder" }> => site.type === "wonder")
    .map((site, index) => ({
      id: `marker-wonder-block-${index + 1}`,
      type: "wonder_block",
      vertexId: site.vertexId,
      scenarioId: "seafarers.wonders_of_catan",
      marker:
        site.requirementId === "great_wall_marker" ||
        site.requirementId === "great_bridge_marker" ||
        site.requirementId === "lighthouse_marker"
          ? "!"
          : "x"
    }));
}

function pickScenarioMarkerVertex(
  vertexIds: readonly string[],
  verticesById: Map<string, VertexView>
): string | null {
  return [...vertexIds]
    .sort((leftId, rightId) => {
      const left = verticesById.get(leftId);
      const right = verticesById.get(rightId);
      if (!left || !right) {
        return leftId.localeCompare(rightId);
      }
      if (right.x !== left.x) {
        return right.x - left.x;
      }
      return left.y - right.y;
    })[0] ?? null;
}

function collectThroughTheDesertRegions(
  tiles: TileView[],
  edges: EdgeView[],
  verticesById: Map<string, VertexView>
): Array<{ id: string; vertexIds: string[] }> {
  const regionTiles = tiles.filter(isThroughTheDesertRegionTile);
  if (regionTiles.length === 0) {
    return [];
  }

  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const neighborsByTileId = new Map<string, string[]>();
  for (const tile of regionTiles) {
    neighborsByTileId.set(tile.id, []);
  }

  for (const edge of edges) {
    const adjacentRegionTileIds = edge.tileIds.filter((tileId) => {
      const tile = tileById.get(tileId);
      return tile ? isThroughTheDesertRegionTile(tile) : false;
    });
    if (adjacentRegionTileIds.length !== 2) {
      continue;
    }

    const [leftId, rightId] = adjacentRegionTileIds;
    if (!leftId || !rightId) {
      continue;
    }
    neighborsByTileId.get(leftId)?.push(rightId);
    neighborsByTileId.get(rightId)?.push(leftId);
  }

  const regions: Array<{ id: string; vertexIds: string[] }> = [];
  const visited = new Set<string>();
  let regionIndex = 0;

  for (const tile of regionTiles) {
    if (visited.has(tile.id)) {
      continue;
    }

    regionIndex += 1;
    const regionVertexIds = new Set<string>();
    const queue = [tile.id];
    visited.add(tile.id);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }
      const currentTile = tileById.get(currentId);
      if (!currentTile) {
        continue;
      }

      for (const vertexId of currentTile.vertexIds) {
        if (verticesById.has(vertexId)) {
          regionVertexIds.add(vertexId);
        }
      }

      for (const neighborId of neighborsByTileId.get(currentId) ?? []) {
        if (visited.has(neighborId)) {
          continue;
        }
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    regions.push({
      id: `through_desert_region_${regionIndex}`,
      vertexIds: [...regionVertexIds]
    });
  }

  return regions;
}

function isThroughTheDesertRegionTile(tile: TileView): boolean {
  return tile.terrain !== null && tile.terrain !== "sea" && tile.terrain !== "desert" && tile.kind !== "sea";
}

function pickDistinctVertices(
  vertexIds: string[],
  verticesById: Map<string, VertexView>,
  count: number
): string[] {
  const orderedVertexIds = [...vertexIds].sort((leftId, rightId) => {
    const left = verticesById.get(leftId);
    const right = verticesById.get(rightId);
    if (!left || !right) {
      return leftId.localeCompare(rightId);
    }
    if (left.x !== right.x) {
      return right.x - left.x;
    }
    return left.y - right.y;
  });
  const selected: string[] = [];
  for (const vertexId of orderedVertexIds) {
    const vertex = verticesById.get(vertexId);
    if (!vertex) {
      continue;
    }
    if (
      selected.some((selectedId) => {
        const selectedVertex = verticesById.get(selectedId);
        return selectedVertex?.adjacentVertexIds.includes(vertexId);
      })
    ) {
      continue;
    }
    selected.push(vertexId);
    if (selected.length >= count) {
      break;
    }
  }
  return selected;
}

function getVertexNumberToken(
  vertex: VertexView | null,
  tilesById: Map<string, TileView>
): number | null {
  if (!vertex) {
    return null;
  }
  const tile = vertex.tileIds
    .map((tileId) => tilesById.get(tileId) ?? null)
    .find((candidate) => candidate && candidate.token !== null && candidate.terrain !== "sea");
  return tile?.token ?? null;
}
