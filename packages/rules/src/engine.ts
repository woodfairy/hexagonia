import type {
  ActionIntent,
  AllowedMoves,
  BoardSiteView,
  DevelopmentCardView,
  DevelopmentCardType,
  EdgeView,
  ErrorParams,
  GameConfig,
  MatchEvent,
  MatchEventInput,
  MatchPhase,
  MatchSnapshot,
  PirateStealType,
  PortType,
  PlayerColor,
  PlayerView,
  RouteBuildType,
  RoutePlacementOption,
  Resource,
  ResourceMap,
  RoomDetails,
  ScenarioSetupStage,
  StartingPlayerRollRound,
  StartingPlayerRollResult,
  TileOccupant,
  TileTerrain,
  TileView,
  TradeOfferView,
  VertexView
} from "@hexagonia/shared";
import {
  BUILD_COSTS,
  DEVELOPMENT_CARD_TYPES,
  RESOURCES,
  addResources,
  cloneResourceMap,
  createEmptyResourceMap,
  getScenarioVictoryPointsToWin,
  hasResources,
  isNewWorldScenarioSetupEnabled,
  isEmptyResourceMap,
  subtractResources,
  totalResources
} from "@hexagonia/shared";
import {
  applyScenarioSetupAction,
  applyBuildAction,
  applyDevelopmentAction,
  applyRobberAction,
  applySetupAction,
  applyTradeAction,
  applyTurnAction,
  type ActionHandlerSet
} from "./actionDispatch.js";
import { generateBaseBoard, type GeneratedBoard } from "./board.js";
import { SeededRandom } from "./random.js";
import {
  createSeafarersScenarioFeatures,
  finalizeSeafarersBoard,
  getFogIslandsOriginalSetup,
  getSeafarersHomeIslandCount,
  getSeafarersIslandRewardPoints,
  getSeafarersPirateFleetPathCoords
} from "./seafarersBoard.js";
import { CURRENT_MATCH_SCHEMA_VERSION } from "./schema.js";

interface InternalDevelopmentCard {
  id: string;
  type: DevelopmentCardType;
  boughtOnTurn: number;
}

interface InternalPlayer {
  id: string;
  username: string;
  color: PlayerColor;
  seatIndex: number;
  connected: boolean;
  disconnectDeadlineAt: number | null;
  resources: ResourceMap;
  developmentCards: InternalDevelopmentCard[];
  roads: string[];
  ships: string[];
  warships: string[];
  settlements: string[];
  cities: string[];
  playedKnightCount: number;
  hasPlayedDevelopmentCardThisTurn: boolean;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  specialVictoryPoints: number;
  clothCount: number;
  harborTokens: PortType[];
  wonderProgress: number;
  homeIslandIds: string[];
  homeRegionIds: string[];
  rewardedRegionIds: string[];
}

interface InternalTradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string | null;
  give: ResourceMap;
  want: ResourceMap;
  createdAtTurn: number;
  declinedByPlayerIds: string[];
}

interface SetupStep {
  direction: "forward" | "reverse";
  grantInitialResources: boolean;
}

interface SetupState {
  stage: "settlement" | "road";
  currentIndex: number;
  pendingSettlementVertexId: string | null;
  stepIndex: number;
  steps: SetupStep[];
}

interface RobberState {
  resumePhase: MatchPhase;
  pendingDiscardByPlayerId: Record<string, number>;
  mode?: "standard" | "pirate_islands_seven";
}

function sortId(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

interface PendingRoadBuildingEffect {
  type: "road_building";
  remainingRoads: 1 | 2;
  resumePhase: "turn_roll" | "turn_action" | "paired_player_action";
}

interface PendingRollResolution {
  type: "pirate_islands";
  playerId: string;
  total: number;
  dice: [number, number];
}

interface PirateIslandsScenarioState {
  type: "pirate_islands";
  fleetPathTileIds: string[];
  fleetPositionIndex: number;
  exclamationTileId: string | null;
}

interface FogRevealEntry {
  terrain: TileTerrain;
  token: number | null;
  robber: boolean;
  occupant: TileOccupant | null;
}

interface FogIslandsScenarioState {
  type: "fog_islands";
  revealEntriesByTileId: Record<string, FogRevealEntry>;
  hiddenTerrainStack?: TileTerrain[];
  hiddenTokenStack?: number[];
}

interface NewWorldScenarioState {
  type: "new_world";
}

type ScenarioState =
  | PirateIslandsScenarioState
  | FogIslandsScenarioState
  | NewWorldScenarioState
  | null;

type NewWorldTerrain = TileTerrain;

interface ScenarioSetupState {
  type: "new_world";
  stage: ScenarioSetupStage;
  readyByPlayerId: Record<string, boolean>;
  tilePool: Record<NewWorldTerrain, number>;
  tokenPool: Record<number, number>;
  portPool: Record<PortType, number>;
  placeableTileIds: string[];
  portEdgeIds: string[];
  validationErrorCode: string | null;
}

interface TurnContext {
  primaryPlayerIndex: number;
  specialBuildQueue: number[];
}

interface PendingGoldSelection {
  playerId: string;
  count: number;
  source: "gold_tile" | "pirate_fleet_reward";
}

interface BeginnerPlacement {
  color: PlayerColor;
  firstSettlementVertexId: string;
  firstRoadEdgeId: string;
  secondSettlementVertexId: string;
  secondRoadEdgeId: string;
}

interface AwardUpdateResult {
  previousHolderId: string | null;
  nextHolderId: string | null;
  valuesByPlayerId: Record<string, number>;
}

export interface GameState {
  matchId: string;
  roomId: string;
  seed: string;
  schemaVersion: number;
  version: number;
  gameConfig: GameConfig;
  phase: MatchPhase;
  previousPhase: MatchPhase | null;
  turn: number;
  currentPlayerIndex: number;
  board: GeneratedBoard;
  players: InternalPlayer[];
  bank: ResourceMap;
  developmentDeck: InternalDevelopmentCard[];
  dice: [number, number] | null;
  winnerId: string | null;
  tradeOffers: InternalTradeOffer[];
  eventLog: MatchEvent[];
  randomState: string;
  setupState: SetupState | null;
  robberState: RobberState | null;
  pendingDevelopmentEffect: PendingRoadBuildingEffect | null;
  pendingGoldSelections: PendingGoldSelection[];
  pendingRollResolution: PendingRollResolution | null;
  scenarioState: ScenarioState;
  scenarioSetupState: ScenarioSetupState | null;
  turnContext: TurnContext;
}

export interface MatchPlayerInput {
  id: string;
  username: string;
  color: PlayerColor;
  seatIndex: number;
  connected?: boolean;
}

const RESOURCE_BANK_START_BY_BOARD_SIZE: Record<GameConfig["boardSize"], number> = {
  standard: 19,
  extended: 24
};
const CLOTH_TOKEN_TOTAL_BY_BOARD_SIZE: Record<GameConfig["boardSize"], number> = {
  standard: 50,
  extended: 70
};
const BEGINNER_PLAYER_COLORS: Record<3 | 4, PlayerColor[]> = {
  3: ["red", "blue", "orange"],
  4: ["red", "blue", "white", "orange"]
};
const BEGINNER_PLACEMENTS: BeginnerPlacement[] = [
  {
    color: "red",
    firstSettlementVertexId: "vertex-7",
    firstRoadEdgeId: "edge-13",
    secondSettlementVertexId: "vertex-25",
    secondRoadEdgeId: "edge-31"
  },
  {
    color: "blue",
    firstSettlementVertexId: "vertex-14",
    firstRoadEdgeId: "edge-16",
    secondSettlementVertexId: "vertex-29",
    secondRoadEdgeId: "edge-36"
  },
  {
    color: "white",
    firstSettlementVertexId: "vertex-18",
    firstRoadEdgeId: "edge-21",
    secondSettlementVertexId: "vertex-31",
    secondRoadEdgeId: "edge-39"
  },
  {
    color: "orange",
    firstSettlementVertexId: "vertex-20",
    firstRoadEdgeId: "edge-24",
    secondSettlementVertexId: "vertex-33",
    secondRoadEdgeId: "edge-42"
  }
];
const DEVELOPMENT_DECK_COUNTS_BY_BOARD_SIZE: Record<
  GameConfig["boardSize"],
  Record<DevelopmentCardType, number>
> = {
  standard: {
    knight: 14,
    victory_point: 5,
    road_building: 2,
    year_of_plenty: 2,
    monopoly: 2
  },
  extended: {
    knight: 20,
    victory_point: 5,
    road_building: 3,
    year_of_plenty: 3,
    monopoly: 3
  }
};
const NEW_WORLD_TILE_POOL_BY_BOARD_SIZE: Record<GameConfig["boardSize"], Record<NewWorldTerrain, number>> = {
  standard: {
    sea: 19,
    brick: 4,
    lumber: 5,
    ore: 4,
    grain: 5,
    wool: 5,
    gold: 0,
    desert: 0
  },
  extended: {
    sea: 21,
    brick: 7,
    lumber: 7,
    ore: 7,
    grain: 7,
    wool: 7,
    gold: 4,
    desert: 3
  }
};
const NEW_WORLD_TOKEN_POOL_BY_BOARD_SIZE: Record<GameConfig["boardSize"], readonly number[]> = {
  standard: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12],
  extended: [
    2, 2,
    3, 3, 3,
    4, 4, 4, 4,
    5, 5, 5, 5, 5,
    6, 6, 6, 6, 6,
    8, 8, 8, 8, 8,
    9, 9, 9, 9, 9,
    10, 10, 10, 10,
    11, 11, 11, 11,
    12, 12
  ]
};
const NEW_WORLD_PORT_POOL_BY_BOARD_SIZE: Record<GameConfig["boardSize"], Record<PortType, number>> = {
  standard: {
    generic: 5,
    brick: 1,
    lumber: 1,
    ore: 1,
    grain: 1,
    wool: 1
  },
  extended: {
    generic: 5,
    brick: 1,
    lumber: 1,
    ore: 1,
    grain: 1,
    wool: 2
  }
};

function createNewWorldTerrainPool(boardSize: GameConfig["boardSize"]): NewWorldTerrain[] {
  return Object.entries(NEW_WORLD_TILE_POOL_BY_BOARD_SIZE[boardSize]).flatMap(([terrain, count]) =>
    Array.from({ length: count }, () => terrain as NewWorldTerrain)
  );
}

function createNewWorldPortPool(boardSize: GameConfig["boardSize"]): PortType[] {
  return Object.entries(NEW_WORLD_PORT_POOL_BY_BOARD_SIZE[boardSize]).flatMap(([portType, count]) =>
    Array.from({ length: count }, () => portType as PortType)
  );
}

function createDistributedNewWorldPortSlotIndices(candidateEdgeCount: number, portCount: number): number[] {
  if (portCount === 0) {
    return [];
  }
  if (portCount > candidateEdgeCount) {
    throw new Error("New World port count exceeds available coastal edges.");
  }

  const step = candidateEdgeCount / portCount;
  const offset = Math.floor(step / 2);
  const usedIndices = new Set<number>();
  const indices: number[] = [];

  for (let portIndex = 0; portIndex < portCount; portIndex += 1) {
    let edgeIndex = Math.floor(portIndex * step + offset) % candidateEdgeCount;
    while (usedIndices.has(edgeIndex)) {
      edgeIndex = (edgeIndex + 1) % candidateEdgeCount;
    }
    usedIndices.add(edgeIndex);
    indices.push(edgeIndex);
  }

  return indices;
}

function getNewWorldPortOrdering(state: GameState, edgeIds: readonly string[]): EdgeView[] {
  const edgeById = new Map(state.board.edges.map((edge) => [edge.id, edge]));
  const vertexById = new Map(state.board.vertices.map((vertex) => [vertex.id, vertex]));
  const centerX =
    state.board.tiles.reduce((sum, tile) => sum + tile.x, 0) /
    Math.max(1, state.board.tiles.length);
  const centerY =
    state.board.tiles.reduce((sum, tile) => sum + tile.y, 0) /
    Math.max(1, state.board.tiles.length);

  return edgeIds
    .map((edgeId) => edgeById.get(edgeId) ?? null)
    .filter((edge): edge is EdgeView => edge !== null)
    .sort((left, right) => {
      const leftVertexA = vertexById.get(left.vertexIds[0]);
      const leftVertexB = vertexById.get(left.vertexIds[1]);
      const rightVertexA = vertexById.get(right.vertexIds[0]);
      const rightVertexB = vertexById.get(right.vertexIds[1]);
      if (!leftVertexA || !leftVertexB || !rightVertexA || !rightVertexB) {
        return sortId(left.id, right.id);
      }

      const leftAngle = Math.atan2((leftVertexA.y + leftVertexB.y) / 2 - centerY, (leftVertexA.x + leftVertexB.x) / 2 - centerX);
      const rightAngle = Math.atan2(
        (rightVertexA.y + rightVertexB.y) / 2 - centerY,
        (rightVertexA.x + rightVertexB.x) / 2 - centerX
      );
      return leftAngle - rightAngle || sortId(left.id, right.id);
    });
}

function prepareOfficialNewWorldTileLayout(state: GameState, rng: SeededRandom): void {
  const terrains = rng.shuffle(createNewWorldTerrainPool(state.gameConfig.boardSize));
  if (terrains.length !== state.board.tiles.length) {
    throw new Error("New World terrain pool does not match board size.");
  }

  state.board.ports = [];
  state.board.sites = [];
  state.board.scenarioMarkers = [];
  syncScenarioSetupPortTypes(state);

  for (const [index, tile] of state.board.tiles.entries()) {
    const terrain = terrains[index]!;
    tile.terrain = terrain;
    tile.token = null;
    tile.robber = false;
    tile.occupant = null;
    tile.hidden = false;
    tile.discovered = true;
    tile.kind = terrain === "sea" ? "sea" : "land";
    tile.resource = isResourceTerrain(terrain) ? terrain : "desert";
  }
}

function canAssignNewWorldToken(
  tile: TileView,
  token: number,
  assignedTokensByTileId: Map<string, number>,
  adjacentTileIdsByTileId: Map<string, string[]>
): boolean {
  if (tile.terrain === "gold" && isRedNumberTokenValue(token)) {
    return false;
  }
  if (!isRedNumberTokenValue(token)) {
    return true;
  }

  return (adjacentTileIdsByTileId.get(tile.id) ?? []).every(
    (adjacentTileId) => !isRedNumberTokenValue(assignedTokensByTileId.get(adjacentTileId) ?? null)
  );
}

function assignOfficialNewWorldTokens(state: GameState, rng: SeededRandom): void {
  const tokenTargetTiles = state.board.tiles.filter(
    (tile) => tile.terrain !== null && tile.terrain !== "sea" && tile.terrain !== "desert"
  );
  const tokenTargetTileIds = new Set(tokenTargetTiles.map((tile) => tile.id));
  const adjacentTileIdsByTileId = new Map(tokenTargetTiles.map((tile) => [tile.id, [] as string[]]));

  for (const edge of state.board.edges) {
    const adjacentTileIds = edge.tileIds.filter((tileId) => tokenTargetTileIds.has(tileId));
    if (adjacentTileIds.length !== 2) {
      continue;
    }

    const [firstTileId, secondTileId] = adjacentTileIds as [string, string];
    adjacentTileIdsByTileId.get(firstTileId)?.push(secondTileId);
    adjacentTileIdsByTileId.get(secondTileId)?.push(firstTileId);
  }

  const orderedTiles = [...tokenTargetTiles].sort((left, right) => {
    const leftScore = (left.terrain === "gold" ? 100 : 0) + (adjacentTileIdsByTileId.get(left.id)?.length ?? 0) * 10;
    const rightScore = (right.terrain === "gold" ? 100 : 0) + (adjacentTileIdsByTileId.get(right.id)?.length ?? 0) * 10;
    return rightScore - leftScore || sortId(left.id, right.id);
  });

  for (let attempt = 0; attempt < 512; attempt += 1) {
    const remainingTokens = rng.shuffle([...NEW_WORLD_TOKEN_POOL_BY_BOARD_SIZE[state.gameConfig.boardSize]]);
    const assignedTokensByTileId = new Map<string, number>();
    let valid = true;

    for (const tile of orderedTiles) {
      let selectedIndex = -1;
      for (let tokenIndex = 0; tokenIndex < remainingTokens.length; tokenIndex += 1) {
        const token = remainingTokens[tokenIndex]!;
        if (!canAssignNewWorldToken(tile, token, assignedTokensByTileId, adjacentTileIdsByTileId)) {
          continue;
        }
        selectedIndex = tokenIndex;
        break;
      }

      if (selectedIndex < 0) {
        valid = false;
        break;
      }

      assignedTokensByTileId.set(tile.id, remainingTokens[selectedIndex]!);
      remainingTokens.splice(selectedIndex, 1);
    }

    if (!valid) {
      continue;
    }

    for (const tile of state.board.tiles) {
      tile.token = assignedTokensByTileId.get(tile.id) ?? null;
    }

    if (getNewWorldTokenValidationError(state, tokenTargetTiles) === null) {
      return;
    }
  }

  throw new Error("Unable to assign official New World number tokens.");
}

function assignOfficialNewWorldPorts(state: GameState, rng: SeededRandom): void {
  const portTypes = rng.shuffle(createNewWorldPortPool(state.gameConfig.boardSize));
  const initialEdgeOrder = getNewWorldPortOrdering(state, getNewWorldPortCandidateEdgeIds(state)).map((edge) => edge.id);
  const baseIndexByEdgeId = new Map(initialEdgeOrder.map((edgeId, index) => [edgeId, index]));
  const targetIndices = createDistributedNewWorldPortSlotIndices(initialEdgeOrder.length, portTypes.length);

  state.board.ports = [];
  for (const [portIndex, portType] of portTypes.entries()) {
    const occupiedEdgeIds = new Set(state.board.ports.map((port) => port.edgeId));
    const availableEdges = getNewWorldPortOrdering(
      state,
      getNewWorldPortCandidateEdgeIds(state).filter((edgeId) => !occupiedEdgeIds.has(edgeId))
    );
    if (availableEdges.length === 0) {
      throw new Error("Unable to assign official New World ports.");
    }

    const targetIndex = targetIndices[portIndex] ?? 0;
    const selectedEdge =
      [...availableEdges].sort((left, right) => {
        const leftIndex = baseIndexByEdgeId.get(left.id) ?? 0;
        const rightIndex = baseIndexByEdgeId.get(right.id) ?? 0;
        const leftDistance = (leftIndex - targetIndex + initialEdgeOrder.length) % initialEdgeOrder.length;
        const rightDistance = (rightIndex - targetIndex + initialEdgeOrder.length) % initialEdgeOrder.length;
        return leftDistance - rightDistance || sortId(left.id, right.id);
      })[0] ?? null;

    if (!selectedEdge) {
      throw new Error("Unable to assign official New World ports.");
    }

    state.board.ports.push({
      id: `port-${portIndex}`,
      edgeId: selectedEdge.id,
      vertexIds: [...selectedEdge.vertexIds] as [string, string],
      type: portType
    });
  }

  state.board.ports.sort((left, right) => sortId(left.id, right.id));
  syncScenarioSetupPortTypes(state);
}

function applyOfficialNewWorldSetup(state: GameState): void {
  const rng = new SeededRandom(`${state.seed}:official-new-world`);
  prepareOfficialNewWorldTileLayout(state, rng);
  assignOfficialNewWorldTokens(state, rng);
  assignOfficialNewWorldPorts(state, rng);
  initializeNewWorldBoardAfterScenarioSetup(state);
}

export class GameRuleError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly errorParams?: ErrorParams
  ) {
    super(errorCode);
    this.name = "GameRuleError";
  }
}

const ACTION_HANDLERS: ActionHandlerSet<GameState> = {
  handleScenarioSetupPlaceTile,
  handleScenarioSetupClearTile,
  handleScenarioSetupPlaceToken,
  handleScenarioSetupClearToken,
  handleScenarioSetupPlacePort,
  handleScenarioSetupClearPort,
  handleScenarioSetupSetReady,
  handleInitialSettlement,
  handleInitialRoad,
  handleDiscardResources,
  handleRollDice,
  handleBuildRoad,
  handleBuildShip,
  handleMoveShip,
  handleBuildSettlement,
  handleBuildCity,
  handleBuyDevelopmentCard,
  handlePlayKnight,
  handlePlayRoadBuilding,
  handlePlaceFreeRoad,
  handleFinishRoadBuilding,
  handlePlayYearOfPlenty,
  handlePlayMonopoly,
  handleMoveRobber,
  handleMovePirate,
  handleStealOnSeven,
  handleChooseGoldResource,
  handlePlacePortToken,
  handleClaimWonder,
  handleBuildWonderLevel,
  handleAttackFortress,
  handleCreateTradeOffer,
  handleAcceptTradeOffer,
  handleDeclineTradeOffer,
  handleWithdrawTradeOffer,
  handleMaritimeTrade,
  handleEndTurn
};

export function createMatchState(input: {
  matchId: string;
  roomId: string;
  seed: string;
  gameConfig: GameConfig;
  startingPlayerRoll?: StartingPlayerRollResult;
  players: MatchPlayerInput[];
}): GameState {
  const rng = new SeededRandom(input.seed);
  const board = generateBaseBoard(input.seed, input.gameConfig, input.players.length);
  const developmentDeck = createDevelopmentDeck(rng, input.gameConfig, input.players.length);
  const resourceBankStart = RESOURCE_BANK_START_BY_BOARD_SIZE[input.gameConfig.boardSize];
  const setupSteps = createSetupSteps(input.gameConfig);

  const seatedPlayers = [...input.players]
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((player, index) => ({
      ...player,
      color:
        input.gameConfig.setupMode === "beginner"
          ? BEGINNER_PLAYER_COLORS[seatedPlayersColorKey(input.players.length)][index] ?? player.color
          : player.color
    }));
  const startingPlayerIndex = Math.max(
    0,
    seatedPlayers.findIndex(
      (player) => player.seatIndex === input.gameConfig.startingPlayer.seatIndex
    )
  );
  const players = rotatePlayers(seatedPlayers, startingPlayerIndex).map((player) => ({
      id: player.id,
      username: player.username,
      color: player.color,
      seatIndex: player.seatIndex,
      connected: player.connected ?? true,
      disconnectDeadlineAt: null,
      resources: createEmptyResourceMap(),
      developmentCards: [],
      roads: [],
      ships: [],
      warships: [],
      settlements: [],
      cities: [],
      playedKnightCount: 0,
      hasPlayedDevelopmentCardThisTurn: false,
      hasLongestRoad: false,
      hasLargestArmy: false,
      specialVictoryPoints: 0,
      clothCount: 0,
      harborTokens: [],
      wonderProgress: 0,
      homeIslandIds: [],
      homeRegionIds: [],
      rewardedRegionIds: []
    }));

  const state: GameState = {
    matchId: input.matchId,
    roomId: input.roomId,
    seed: input.seed,
    schemaVersion: CURRENT_MATCH_SCHEMA_VERSION,
    version: 1,
    gameConfig: input.gameConfig,
    phase: getSetupPhaseForDirection(setupSteps[0]?.direction ?? "forward"),
    previousPhase: null,
    turn: 0,
    currentPlayerIndex: 0,
    board,
    players,
    bank: {
      brick: resourceBankStart,
      lumber: resourceBankStart,
      ore: resourceBankStart,
      grain: resourceBankStart,
      wool: resourceBankStart
    },
    developmentDeck,
    dice: null,
    winnerId: null,
    tradeOffers: [],
    eventLog: [],
    randomState: rng.state,
    setupState: {
      stage: "settlement",
      currentIndex: setupSteps[0]?.direction === "reverse" ? Math.max(0, players.length - 1) : 0,
      pendingSettlementVertexId: null,
      stepIndex: 0,
      steps: setupSteps
    },
    robberState: null,
    pendingDevelopmentEffect: null,
    pendingGoldSelections: [],
    pendingRollResolution: null,
    scenarioState: null,
    scenarioSetupState: null,
    turnContext: {
      primaryPlayerIndex: 0,
      specialBuildQueue: []
    }
  };

  if (input.gameConfig.scenarioId === "seafarers.new_world") {
    state.scenarioState = {
      type: "new_world"
    };

    if (isNewWorldScenarioSetupEnabled(input.gameConfig)) {
      state.phase = "scenario_setup";
      state.previousPhase = null;
      state.setupState = null;
      state.scenarioSetupState = createNewWorldScenarioSetupState(state);
      prepareNewWorldScenarioSetupBoard(state);
    } else {
      applyOfficialNewWorldSetup(state);
    }
  }

  applyScenarioSetup(state);
  updatePirateBlocks(state);

  if (input.startingPlayerRoll) {
    appendEvent(state, {
      type: "starting_player_rolled",
      byPlayerId: input.startingPlayerRoll.winnerPlayerId,
      payload: {
        winnerPlayerId: input.startingPlayerRoll.winnerPlayerId,
        winnerSeatIndex: input.startingPlayerRoll.winnerSeatIndex,
        rounds: input.startingPlayerRoll.rounds
      }
    });
  }

  if (input.gameConfig.setupMode === "beginner") {
    applyBeginnerSetup(state);
    capturePlayerHomeIslands(state);
    state.phase = "turn_roll";
    state.turn = 1;
    state.setupState = null;
    state.turnContext.primaryPlayerIndex = 0;
  }

  appendEvent(state, {
    type: "match_started",
    payload: {
      players: players.map((player) => ({
        id: player.id,
        username: player.username,
        color: player.color
      })),
      gameConfig: input.gameConfig,
      startingPlayerId: players[0]?.id ?? null
    }
  });

  return state;
}

function createSetupSteps(gameConfig: GameConfig): SetupStep[] {
  if (gameConfig.scenarioId === "seafarers.cloth_for_catan") {
    return [
      { direction: "forward", grantInitialResources: false },
      { direction: "reverse", grantInitialResources: false },
      { direction: "forward", grantInitialResources: true }
    ];
  }

  return [
    { direction: "forward", grantInitialResources: false },
    { direction: "reverse", grantInitialResources: true }
  ];
}

function getSetupPhaseForDirection(direction: SetupStep["direction"]): "setup_forward" | "setup_reverse" {
  return direction === "reverse" ? "setup_reverse" : "setup_forward";
}

function getCurrentSetupStep(setup: SetupState): SetupStep {
  return setup.steps[setup.stepIndex] ?? setup.steps[setup.steps.length - 1] ?? {
    direction: "forward",
    grantInitialResources: false
  };
}

function applyScenarioSetup(state: GameState): void {
  if (state.gameConfig.setupMode === "beginner") {
    return;
  }
  if (state.gameConfig.scenarioId === "seafarers.fog_islands") {
    state.scenarioState = createFogIslandsScenarioState(state);
    finalizeSeafarersBoard(state.board.tiles, state.board.vertices, state.board.edges);
    state.board.scenarioMarkers = [];
    updatePirateBlocks(state);
    return;
  }
  if (state.gameConfig.scenarioId === "seafarers.pirate_islands") {
    applyPirateIslandsScenarioSetup(state);
  }
}

function createFogIslandsScenarioState(state: GameState): FogIslandsScenarioState | null {
  const hiddenTiles = [...state.board.tiles]
    .filter((tile) => tile.kind === "fog" && tile.hidden)
    .sort((left, right) => Number(left.id.slice(5)) - Number(right.id.slice(5)));
  if (hiddenTiles.length === 0) {
    return null;
  }

  const fogSetup = getFogIslandsOriginalSetup({
    scenarioId: state.gameConfig.scenarioId,
    boardSize: state.gameConfig.boardSize,
    playerCount: state.players.length
  });
  if (fogSetup) {
    if (hiddenTiles.length !== fogSetup.hiddenCoords.length) {
      throw new Error("Fog Islands hidden coord count does not match the original setup.");
    }

    for (const tile of hiddenTiles) {
      tile.terrain = null;
      tile.resource = "desert";
      tile.token = null;
      tile.robber = false;
      tile.occupant = null;
      tile.hidden = true;
      tile.discovered = false;
      tile.kind = "fog";
    }

    const hiddenTerrainStack = new SeededRandom(
      `${state.seed}:fog-islands:hidden-hexes:${state.gameConfig.boardSize}:${state.players.length}`
    ).shuffle([...fogSetup.hiddenTerrainPool]);
    const hiddenTokenStack = new SeededRandom(
      `${state.seed}:fog-islands:hidden-tokens:${state.gameConfig.boardSize}:${state.players.length}`
    ).shuffle([...fogSetup.hiddenTokenPool]);
    if (hiddenTerrainStack.length !== hiddenTiles.length) {
      throw new Error("Fog Islands hidden hex stack size does not match the hidden tile count.");
    }
    if (
      hiddenTokenStack.length !==
      hiddenTerrainStack.filter((terrain) => terrain !== "sea" && terrain !== "desert").length
    ) {
      throw new Error("Fog Islands hidden token stack size does not match the hidden land count.");
    }

    return {
      type: "fog_islands",
      revealEntriesByTileId: {},
      hiddenTerrainStack,
      hiddenTokenStack
    };
  }

  const revealEntriesByTileId: Record<string, FogRevealEntry> = {};
  for (const tile of hiddenTiles) {
    revealEntriesByTileId[tile.id] = {
      terrain: tile.terrain ?? "sea",
      token: tile.token,
      robber: tile.robber,
      occupant: tile.occupant ?? null
    };
    tile.terrain = null;
    tile.resource = "desert";
    tile.token = null;
    tile.robber = false;
    tile.occupant = null;
    tile.hidden = true;
    tile.discovered = false;
    tile.kind = "fog";
  }

  return {
    type: "fog_islands",
    revealEntriesByTileId
  };
}

function applyPirateIslandsScenarioSetup(state: GameState): void {
  const homeIslandId = getPirateIslandsHomeIslandId(state);
  if (!homeIslandId) {
    return;
  }

  state.scenarioState = createPirateIslandsScenarioState(state);

  if (state.board.sites) {
    const orderedPlayers = [...state.players].sort((left, right) => left.seatIndex - right.seatIndex);
    const fortressSites = state.board.sites
      .filter(
        (
          site
        ): site is Extract<NonNullable<GeneratedBoard["sites"]>[number], { type: "fortress" }> => site.type === "fortress"
      )
      .sort((left, right) =>
        compareVerticesForScenarioSetup(getVertex(state, left.vertexId), getVertex(state, right.vertexId))
      );
    const landingSites = state.board.sites
      .filter(
        (
          site
        ): site is Extract<NonNullable<GeneratedBoard["sites"]>[number], { type: "landing" }> => site.type === "landing"
      )
      .sort((left, right) =>
        compareVerticesForScenarioSetup(getVertex(state, left.vertexId), getVertex(state, right.vertexId))
      );

    const retainedSiteIds = new Set<string>();
    for (const site of state.board.sites) {
      if (site.type !== "fortress" && site.type !== "landing") {
        retainedSiteIds.add(site.id);
      }
    }

    fortressSites.slice(0, orderedPlayers.length).forEach((site, index) => {
      site.fortressColor = orderedPlayers[index]?.color ?? null;
      retainedSiteIds.add(site.id);
    });
    landingSites.slice(0, orderedPlayers.length).forEach((site, index) => {
      site.beachheadColor = orderedPlayers[index]?.color ?? null;
      retainedSiteIds.add(site.id);
    });

    state.board.sites = state.board.sites.filter((site) => retainedSiteIds.has(site.id));
    const siteByVertexId = new Map(
      state.board.sites
        .filter((site) => !(site.type === "village" && site.edgeId))
        .map((site) => [site.vertexId, site])
    );
    for (const vertex of state.board.vertices) {
      vertex.site = siteByVertexId.get(vertex.id) ?? null;
    }
  }

  const candidateVertexIds = state.board.vertices
    .filter((vertex) => vertex.islandId === homeIslandId && vertex.coastal === true && !vertex.site)
    .sort(compareVerticesForScenarioSetup)
    .map((vertex) => vertex.id);
  const usedEdgeIds = new Set<string>();

  for (const player of state.players) {
    const vertexId = candidateVertexIds.find((candidateVertexId) => {
      if (!isSettlementVertexOpen(state, candidateVertexId, player.id)) {
        return false;
      }
      return !!getAvailableScenarioStartShipEdge(state, candidateVertexId, usedEdgeIds);
    });
    if (!vertexId) {
      continue;
    }

    placeBuilding(state, player.id, vertexId, "settlement");
    const edge = getAvailableScenarioStartShipEdge(state, vertexId, usedEdgeIds);
    if (!edge) {
      continue;
    }
    placeShip(state, player.id, edge.id, "ship");
    usedEdgeIds.add(edge.id);
  }
}

function getAvailableScenarioStartShipEdge(
  state: GameState,
  vertexId: string,
  usedEdgeIds: Set<string>
): EdgeView | null {
  const homeIslandId = getVertex(state, vertexId).islandId;
  if (!homeIslandId) {
    return null;
  }

  return (
    getVertex(state, vertexId).edgeIds
      .map((edgeId) => getEdge(state, edgeId))
      .filter(
        (edge) =>
          edge.ownerId === null &&
          !usedEdgeIds.has(edge.id) &&
          edge.shipAllowed === true &&
          edge.routeZone === "coast" &&
          edge.vertexIds.every((endpointVertexId) => getVertex(state, endpointVertexId).islandId === homeIslandId)
      )
      .sort((left, right) => Number(left.id.slice(5)) - Number(right.id.slice(5)))[0] ?? null
  );
}

function createPirateIslandsScenarioState(state: GameState): PirateIslandsScenarioState {
  const fleetPathTileIds = buildPirateFleetPathTileIds(state);
  const pirateTileId = state.board.tiles.find((tile) => tile.occupant === "pirate")?.id ?? fleetPathTileIds[0] ?? "";
  const fleetPositionIndex = Math.max(0, fleetPathTileIds.indexOf(pirateTileId));
  return {
    type: "pirate_islands",
    fleetPathTileIds,
    fleetPositionIndex,
    exclamationTileId:
      state.gameConfig.boardSize === "extended" && fleetPathTileIds.length > 2
        ? fleetPathTileIds[Math.floor(fleetPathTileIds.length / 2)] ?? null
        : null
  };
}

function buildPirateFleetPathTileIds(state: GameState): string[] {
  const explicitPathCoords = getSeafarersPirateFleetPathCoords({
    scenarioId: state.gameConfig.scenarioId,
    boardSize: state.gameConfig.boardSize,
    playerCount: state.players.length,
    layoutMode: state.gameConfig.layoutMode
  });
  if (explicitPathCoords && explicitPathCoords.length > 0) {
    const tileByCoord = new Map<string, string>(
      state.board.tiles.map((tile) => [`${tile.q}:${tile.r}`, tile.id] as const)
    );
    const explicitTileIds = explicitPathCoords
      .map((coord) => tileByCoord.get(coord) ?? null)
      .filter((tileId): tileId is string => tileId !== null);
    if (explicitTileIds.length > 0) {
      return explicitTileIds;
    }
  }

  const seaTiles = state.board.tiles.filter((tile) => tile.terrain === "sea");
  if (seaTiles.length <= 1) {
    return seaTiles.map((tile) => tile.id);
  }

  const centroid = seaTiles.reduce(
    (result, tile) => ({
      x: result.x + tile.x,
      y: result.y + tile.y
    }),
    { x: 0, y: 0 }
  );
  const centerX = centroid.x / seaTiles.length;
  const centerY = centroid.y / seaTiles.length;
  const orderedTileIds = [...seaTiles]
    .sort((left, right) => {
      const leftAngle = Math.atan2(left.y - centerY, left.x - centerX);
      const rightAngle = Math.atan2(right.y - centerY, right.x - centerX);
      if (leftAngle !== rightAngle) {
        return leftAngle - rightAngle;
      }
      return left.id.localeCompare(right.id);
    })
    .map((tile) => tile.id);
  const pirateTileId = state.board.tiles.find((tile) => tile.occupant === "pirate")?.id ?? orderedTileIds[0] ?? null;
  if (!pirateTileId) {
    return orderedTileIds;
  }

  const startIndex = orderedTileIds.indexOf(pirateTileId);
  if (startIndex <= 0) {
    return orderedTileIds;
  }
  return [...orderedTileIds.slice(startIndex), ...orderedTileIds.slice(0, startIndex)];
}

function getPirateIslandsScenarioState(state: GameState): PirateIslandsScenarioState | null {
  return state.scenarioState?.type === "pirate_islands" ? state.scenarioState : null;
}

function resolvePirateIslandsFleetRoll(
  state: GameState,
  playerId: string,
  dice: [number, number]
): void {
  const scenarioState = getPirateIslandsScenarioState(state);
  if (!scenarioState || scenarioState.fleetPathTileIds.length === 0) {
    return;
  }

  const currentPirateTile = state.board.tiles.find((tile) => tile.occupant === "pirate") ?? null;
  if (!currentPirateTile) {
    return;
  }

  const pirateStrength = Math.min(dice[0], dice[1]);
  const nextIndex =
    scenarioState.fleetPathTileIds.length > 0
      ? (scenarioState.fleetPositionIndex + pirateStrength) % scenarioState.fleetPathTileIds.length
      : 0;
  const nextTileId = scenarioState.fleetPathTileIds[nextIndex] ?? currentPirateTile.id;
  const nextTile = getTile(state, nextTileId);
  if (currentPirateTile.id !== nextTile.id) {
    currentPirateTile.occupant = null;
    nextTile.occupant = "pirate";
  }
  updatePirateBlocks(state);
  scenarioState.fleetPositionIndex = nextIndex;

  appendEvent(state, {
    type: "pirate_fleet_moved",
    byPlayerId: playerId,
    payload: {
      tileId: nextTile.id,
      distance: pirateStrength,
      strength: pirateStrength
    }
  });

  if (
    scenarioState.exclamationTileId &&
    nextTile.id === scenarioState.exclamationTileId
  ) {
    return;
  }

  resolvePirateFleetAttack(state, playerId, nextTile.id, pirateStrength);
}

function resolvePirateFleetAttack(
  state: GameState,
  playerId: string,
  tileId: string,
  pirateStrength: number
): void {
  const tile = getTile(state, tileId);
  const attacksCurrentPlayer = tile.vertexIds.some(
    (vertexId) => getVertex(state, vertexId).building?.ownerId === playerId
  );
  if (!attacksCurrentPlayer) {
    return;
  }

  const playerStrength = getPlayer(state, playerId).warships.length;
  if (playerStrength > pirateStrength) {
    if (RESOURCES.some((resource) => state.bank[resource] > 0)) {
      state.pendingGoldSelections.push({ playerId, count: 1, source: "pirate_fleet_reward" });
    }
    appendEvent(state, {
      type: "pirate_fleet_attacked",
      byPlayerId: playerId,
      payload: {
        tileId,
        targetPlayerId: playerId,
        pirateStrength,
        playerStrength,
        outcome: "won"
      }
    });
    return;
  }

  if (playerStrength < pirateStrength) {
    const discardCount = discardRandomResourcesToBank(
      state,
      playerId,
      1 + getPlayer(state, playerId).cities.length
    );
    appendEvent(state, {
      type: "pirate_fleet_attacked",
      byPlayerId: playerId,
      payload: {
        tileId,
        targetPlayerId: playerId,
        pirateStrength,
        playerStrength,
        outcome: "lost",
        discardCount
      }
    });
    return;
  }

  appendEvent(state, {
    type: "pirate_fleet_attacked",
    byPlayerId: playerId,
    payload: {
      tileId,
      targetPlayerId: playerId,
      pirateStrength,
      playerStrength,
      outcome: "tied"
    }
  });
}

function discardRandomResourcesToBank(state: GameState, playerId: string, count: number): number {
  const player = getPlayer(state, playerId);
  const discardCount = Math.min(count, totalResources(player.resources));
  if (discardCount <= 0) {
    return 0;
  }

  const rng = new SeededRandom(state.randomState);
  for (let index = 0; index < discardCount; index += 1) {
    const pool = RESOURCES.flatMap((resource) =>
      Array.from({ length: player.resources[resource] ?? 0 }, () => resource)
    );
    if (!pool.length) {
      break;
    }

    const resource = pool[Math.floor(rng.next() * pool.length)]!;
    const delta = createEmptyResourceMap();
    delta[resource] = 1;
    player.resources = subtractResources(player.resources, delta);
    state.bank = addResources(state.bank, delta);
  }
  state.randomState = rng.state;
  return discardCount;
}

function completePirateIslandsRollResolution(
  state: GameState,
  playerId: string,
  total: number,
  dice: [number, number]
): void {
  if (total === 7) {
    const pendingDiscardByPlayerId: Record<string, number> = {};
    for (const player of state.players) {
      const count = totalResources(player.resources);
      if (count > 7) {
        pendingDiscardByPlayerId[player.id] = Math.floor(count / 2);
      }
    }

    const hasPendingDiscard = Object.keys(pendingDiscardByPlayerId).length > 0;
    const canSteal = getPirateIslandsSevenStealTargets(state, playerId).length > 0;
    if (!hasPendingDiscard && !canSteal) {
      state.phase = "turn_action";
      state.previousPhase = null;
      return;
    }

    state.phase = "robber_interrupt";
    state.previousPhase = "turn_roll";
    state.robberState = {
      resumePhase: "turn_action",
      pendingDiscardByPlayerId,
      mode: "pirate_islands_seven"
    };
    return;
  }

  distributeResourcesForRoll(state, total, playerId, dice);
  state.phase = "turn_action";
  state.previousPhase = null;
}

function getPirateIslandsSevenStealTargets(state: GameState, playerId: string): string[] {
  if (state.gameConfig.scenarioId !== "seafarers.pirate_islands") {
    return [];
  }

  return state.players
    .filter((player) => player.id !== playerId && totalResources(player.resources) > 0)
    .map((player) => player.id);
}

export function createSnapshot(state: GameState, viewerId: string): MatchSnapshot {
  return {
    matchId: state.matchId,
    roomId: state.roomId,
    seed: state.seed,
    schemaVersion: state.schemaVersion,
    version: state.version,
    gameConfig: state.gameConfig,
    you: viewerId,
    phase: state.phase,
    previousPhase: state.previousPhase,
    currentPlayerId: getCurrentPlayer(state).id,
    turn: state.turn,
    board: cloneBoard(state.board),
    players: state.players.map((player) => createPlayerView(state, player.id, viewerId)),
    bank: cloneResourceMap(state.bank),
    dice: state.dice,
    tradeOffers: state.tradeOffers.filter((trade) => canPlayerSeeTradeOffer(state, viewerId, trade)).map((trade) => toTradeView(trade)),
    robberDiscardStatus: getRobberDiscardStatusView(state),
    pendingDevelopmentEffect: state.pendingDevelopmentEffect
      ? {
          type: state.pendingDevelopmentEffect.type,
          remainingRoads: state.pendingDevelopmentEffect.remainingRoads
        }
      : null,
    allowedMoves: getAllowedMoves(state, viewerId),
    scenarioSetup: createScenarioSetupView(state, viewerId),
    publicInitialSettlementVertexIds: getPublicInitialSettlementVertexIds(state),
    eventLog: state.eventLog.slice(-25),
    winnerId: state.winnerId
  };
}

function createNewWorldScenarioSetupState(state: GameState): ScenarioSetupState {
  const boardSize = state.gameConfig.boardSize;
  const tokenPool = Object.fromEntries(
    NEW_WORLD_TOKEN_POOL_BY_BOARD_SIZE[boardSize].map((token) => [token, 0])
  ) as Record<number, number>;
  for (const token of NEW_WORLD_TOKEN_POOL_BY_BOARD_SIZE[boardSize]) {
    tokenPool[token] = (tokenPool[token] ?? 0) + 1;
  }
  return {
    type: "new_world",
    stage: "tiles",
    readyByPlayerId: Object.fromEntries(state.players.map((player) => [player.id, false])),
    tilePool: { ...NEW_WORLD_TILE_POOL_BY_BOARD_SIZE[boardSize] },
    tokenPool,
    portPool: { ...NEW_WORLD_PORT_POOL_BY_BOARD_SIZE[boardSize] },
    placeableTileIds: state.board.tiles.map((tile) => tile.id),
    portEdgeIds: [],
    validationErrorCode: "game.scenario_setup_tiles_remaining"
  };
}

function prepareNewWorldScenarioSetupBoard(state: GameState): void {
  const setupState = getScenarioSetupState(state);
  for (const tileId of setupState.placeableTileIds) {
    const tile = getTile(state, tileId);
    tile.resource = "desert";
    tile.terrain = null;
    tile.token = null;
    tile.robber = false;
    tile.occupant = null;
    tile.kind = "fog";
    tile.hidden = true;
    tile.discovered = false;
  }

  state.board.ports = [];
  state.board.scenarioMarkers = [];
  syncScenarioSetupPortTypes(state);
}

function createScenarioSetupView(state: GameState, viewerId: string): MatchSnapshot["scenarioSetup"] {
  if (state.phase !== "scenario_setup" || !state.scenarioSetupState) {
    return null;
  }

  return {
    scenarioId: "seafarers.new_world",
    stage: state.scenarioSetupState.stage,
    canEdit: isScenarioSetupEditableByPlayer(state, viewerId),
    isReady: state.scenarioSetupState.readyByPlayerId[viewerId] === true,
    players: state.players.map((player) => ({
      playerId: player.id,
      ready: state.scenarioSetupState?.readyByPlayerId[player.id] === true
    })),
    tilePool: Object.entries(state.scenarioSetupState.tilePool)
      .map(([terrain, remaining]) => ({
        terrain: terrain as NewWorldTerrain,
        remaining
      }))
      .filter((entry) => entry.remaining > 0),
    tokenPool: Object.entries(state.scenarioSetupState.tokenPool)
      .map(([token, remaining]) => ({
        token: Number(token),
        remaining
      }))
      .filter((entry) => entry.remaining > 0)
      .sort((left, right) => left.token - right.token),
    portPool: Object.entries(state.scenarioSetupState.portPool)
      .map(([portType, remaining]) => ({
        portType: portType as PortType,
        remaining
      }))
      .filter((entry) => entry.remaining > 0),
    placeableTileIds:
      state.scenarioSetupState.stage === "tiles"
        ? [...state.scenarioSetupState.placeableTileIds]
        : [],
    tokenTileIds:
      state.scenarioSetupState.stage === "tokens"
        ? state.scenarioSetupState.placeableTileIds
            .map((tileId) => getTile(state, tileId))
            .filter((tile) => tile.terrain !== null && tile.terrain !== "sea" && tile.terrain !== "desert")
            .map((tile) => tile.id)
        : [],
    portEdgeIds:
      state.scenarioSetupState.stage === "ports"
        ? [...state.scenarioSetupState.portEdgeIds]
        : [],
    validationErrorCode: state.scenarioSetupState.validationErrorCode
  };
}

function getScenarioSetupState(state: GameState): ScenarioSetupState {
  if (state.phase !== "scenario_setup" || !state.scenarioSetupState) {
    throw new GameRuleError("game.action_phase_not_allowed");
  }
  return state.scenarioSetupState;
}

function isScenarioSetupEditableByPlayer(state: GameState, playerId: string): boolean {
  return getScenarioSetupState(state).readyByPlayerId[playerId] !== true;
}

function ensureScenarioSetupEditableByPlayer(state: GameState, playerId: string): void {
  if (!isScenarioSetupEditableByPlayer(state, playerId)) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
}

function resetScenarioSetupReady(state: GameState): void {
  const setupState = getScenarioSetupState(state);
  for (const player of state.players) {
    setupState.readyByPlayerId[player.id] = false;
  }
}

function countRemainingPoolEntries(entries: Record<string, number>): number {
  return Object.values(entries).reduce((sum, count) => sum + count, 0);
}

function syncScenarioSetupPortTypes(state: GameState): void {
  const portTypeByVertexId = new Map<string, PortType>();
  for (const port of state.board.ports) {
    for (const vertexId of port.vertexIds) {
      portTypeByVertexId.set(vertexId, port.type);
    }
  }
  for (const vertex of state.board.vertices) {
    vertex.portType = portTypeByVertexId.get(vertex.id) ?? null;
  }
}

function isNewWorldLandTerrain(terrain: TileTerrain | null | undefined): terrain is Exclude<TileTerrain, "sea"> {
  return terrain !== null && terrain !== undefined && terrain !== "sea";
}

function getNewWorldPortCandidateEdgeIds(state: GameState): string[] {
  const tileById = new Map(state.board.tiles.map((tile) => [tile.id, tile]));
  const occupiedPortEdgeIds = new Set(state.board.ports.map((port) => port.edgeId));
  const blockedVertexIds = new Set(
    state.board.ports.flatMap((port) => port.vertexIds)
  );

  return state.board.edges
    .filter((edge) => {
      const adjacentTiles = edge.tileIds
        .map((tileId) => tileById.get(tileId) ?? null)
        .filter((tile): tile is TileView => tile !== null);
      if (adjacentTiles.length === 0 || adjacentTiles.some((tile) => tile.terrain === null || tile.terrain === undefined)) {
        return false;
      }

      const landCount = adjacentTiles.filter((tile) => isNewWorldLandTerrain(tile.terrain)).length;
      const seaCount = adjacentTiles.filter((tile) => tile.terrain === "sea").length;
      const isBoundaryLandEdge = adjacentTiles.length === 1 && landCount === 1;
      const isCoastalEdge = adjacentTiles.length === 2 && landCount === 1 && seaCount === 1;
      if (!isBoundaryLandEdge && !isCoastalEdge) {
        return false;
      }

      if (occupiedPortEdgeIds.has(edge.id)) {
        return true;
      }

      return edge.vertexIds.every((vertexId) => !blockedVertexIds.has(vertexId));
    })
    .map((edge) => edge.id)
    .sort((left, right) => sortId(left, right));
}

function isRedNumberTokenValue(token: number | null): boolean {
  return token === 6 || token === 8;
}

function getNewWorldTokenValidationError(
  state: GameState,
  tokenTargetTiles: TileView[]
): string | null {
  if (tokenTargetTiles.some((tile) => tile.terrain === "gold" && isRedNumberTokenValue(tile.token))) {
    return "game.scenario_setup_gold_red_number";
  }

  const tokenTilesById = new Map(tokenTargetTiles.map((tile) => [tile.id, tile]));
  for (const edge of state.board.edges) {
    const adjacentTokenTiles = edge.tileIds
      .map((tileId) => tokenTilesById.get(tileId) ?? null)
      .filter((tile): tile is TileView => tile !== null);
    if (
      adjacentTokenTiles.length === 2 &&
      adjacentTokenTiles.every((tile) => isRedNumberTokenValue(tile.token))
    ) {
      return "game.scenario_setup_red_numbers_adjacent";
    }
  }

  return null;
}

function recomputeNewWorldScenarioSetupState(state: GameState): void {
  const setupState = getScenarioSetupState(state);
  const remainingTiles = countRemainingPoolEntries(setupState.tilePool);
  const remainingTokens = countRemainingPoolEntries(
    Object.fromEntries(Object.entries(setupState.tokenPool).map(([key, value]) => [key, value]))
  );
  const remainingPorts = countRemainingPoolEntries(setupState.portPool);

  setupState.portEdgeIds = remainingTiles === 0 ? getNewWorldPortCandidateEdgeIds(state) : [];

  if (remainingTiles > 0) {
    setupState.stage = "tiles";
    setupState.validationErrorCode = "game.scenario_setup_tiles_remaining";
    return;
  }

  const tokenTargetTiles = setupState.placeableTileIds
    .map((tileId) => getTile(state, tileId))
    .filter((tile) => tile.terrain !== null && tile.terrain !== "sea" && tile.terrain !== "desert");
  if (remainingTokens > 0 || tokenTargetTiles.some((tile) => tile.token === null)) {
    setupState.stage = "tokens";
    setupState.validationErrorCode = "game.scenario_setup_tokens_remaining";
    return;
  }

  const tokenValidationError = getNewWorldTokenValidationError(state, tokenTargetTiles);
  if (tokenValidationError) {
    setupState.stage = "tokens";
    setupState.validationErrorCode = tokenValidationError;
    return;
  }

  if (remainingPorts > 0) {
    setupState.stage = "ports";
    setupState.validationErrorCode = "game.scenario_setup_ports_remaining";
    return;
  }

  setupState.stage = "ready";
  setupState.validationErrorCode = null;
}

function completeScenarioSetupIfReady(state: GameState): void {
  const setupState = getScenarioSetupState(state);
  if (
    setupState.stage !== "ready" ||
    setupState.validationErrorCode !== null ||
    state.players.some((player) => setupState.readyByPlayerId[player.id] !== true)
  ) {
    return;
  }

  initializeNewWorldBoardAfterScenarioSetup(state);
  const setupSteps = createSetupSteps(state.gameConfig);
  state.setupState = {
    stage: "settlement",
    currentIndex: setupSteps[0]?.direction === "reverse" ? Math.max(0, state.players.length - 1) : 0,
    pendingSettlementVertexId: null,
    stepIndex: 0,
    steps: setupSteps
  };
  state.phase = getSetupPhaseForDirection(setupSteps[0]?.direction ?? "forward");
  state.previousPhase = null;
  state.currentPlayerIndex = state.setupState.currentIndex;
  state.scenarioSetupState = null;
  appendEvent(state, {
    type: "scenario_setup_completed",
    payload: {
      scenarioId: "seafarers.new_world"
    }
  });
}

function initializeNewWorldBoardAfterScenarioSetup(state: GameState): void {
  for (const tile of state.board.tiles) {
    tile.robber = false;
    tile.occupant = null;
    tile.hidden = false;
    tile.discovered = true;
    if (tile.terrain === "sea") {
      tile.kind = "sea";
      tile.resource = "desert";
      tile.token = null;
      continue;
    }
    tile.kind = "land";
    tile.resource = isResourceTerrain(tile.terrain) ? tile.terrain : "desert";
  }
  const robberTile =
    state.board.tiles.find((tile) => tile.terrain !== "sea" && tile.token === 12) ??
    state.board.tiles.find((tile) => tile.terrain === "desert") ??
    state.board.tiles.find((tile) => tile.terrain !== "sea") ??
    null;
  if (robberTile) {
    robberTile.robber = true;
  }
  const pirateTile = state.board.tiles.find((tile) => tile.terrain === "sea") ?? null;
  if (pirateTile) {
    pirateTile.occupant = "pirate";
  }
  finalizeSeafarersBoard(state.board.tiles, state.board.vertices, state.board.edges);
  syncScenarioFeatures(state);
  updatePirateBlocks(state);
}

function isResourceTerrain(terrain: TileTerrain | null | undefined): terrain is Resource {
  return !!terrain && RESOURCES.includes(terrain as Resource);
}

function getScenarioSetupTile(state: GameState, tileId: string): TileView {
  const setupState = getScenarioSetupState(state);
  if (!setupState.placeableTileIds.includes(tileId)) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
  return getTile(state, tileId);
}

function clearScenarioSetupTileToken(state: GameState, tile: TileView): void {
  const setupState = getScenarioSetupState(state);
  if (tile.token === null) {
    return;
  }
  setupState.tokenPool[tile.token] = (setupState.tokenPool[tile.token] ?? 0) + 1;
  tile.token = null;
}

function syncScenarioFeatures(state: GameState): void {
  const currentIslandRewardClaims = new Map<string, string>();
  for (const marker of state.board.scenarioMarkers ?? []) {
    if (marker.type === "island_reward" && marker.claimedByPlayerId) {
      currentIslandRewardClaims.set(marker.regionId, marker.claimedByPlayerId);
    }
  }
  for (const player of state.players) {
    for (const regionId of player.rewardedRegionIds) {
      currentIslandRewardClaims.set(regionId, player.id);
    }
  }

  const features = createSeafarersScenarioFeatures(
    {
      scenarioId: state.gameConfig.scenarioId,
      boardSize: state.gameConfig.boardSize,
      layoutMode: state.gameConfig.layoutMode,
      playerCount: state.players.length
    },
    state.board.tiles,
    state.board.vertices,
    state.board.edges
  );
  for (const marker of features.scenarioMarkers) {
    if (marker.type !== "island_reward") {
      continue;
    }
    marker.claimedByPlayerId = currentIslandRewardClaims.get(marker.regionId) ?? null;
  }
  state.board.sites = features.sites;
  state.board.scenarioMarkers = features.scenarioMarkers;
}

function handleScenarioSetupPlaceTile(
  state: GameState,
  playerId: string,
  tileId: string,
  terrain: TileTerrain
): void {
  void getPlayer(state, playerId);
  ensureScenarioSetupEditableByPlayer(state, playerId);
  const setupState = getScenarioSetupState(state);
  const tile = getScenarioSetupTile(state, tileId);
  if (tile.terrain !== terrain && (setupState.tilePool[terrain as NewWorldTerrain] ?? 0) <= 0) {
    throw new GameRuleError("game.scenario_setup_pool_empty");
  }
  if (tile.terrain !== null) {
    setupState.tilePool[tile.terrain as NewWorldTerrain] += 1;
  }
  clearScenarioSetupTileToken(state, tile);
  setupState.tilePool[terrain as NewWorldTerrain] -= 1;
  tile.terrain = terrain;
  tile.resource = isResourceTerrain(terrain) ? terrain : "desert";
  tile.kind = terrain === "sea" ? "sea" : "land";
  tile.hidden = false;
  tile.discovered = true;
  tile.robber = false;
  tile.occupant = null;
  resetScenarioSetupReady(state);
  recomputeNewWorldScenarioSetupState(state);
}

function handleScenarioSetupClearTile(state: GameState, playerId: string, tileId: string): void {
  void getPlayer(state, playerId);
  ensureScenarioSetupEditableByPlayer(state, playerId);
  const setupState = getScenarioSetupState(state);
  const tile = getScenarioSetupTile(state, tileId);
  if (tile.terrain !== null) {
    setupState.tilePool[tile.terrain as NewWorldTerrain] += 1;
  }
  clearScenarioSetupTileToken(state, tile);
  tile.terrain = null;
  tile.resource = "desert";
  tile.kind = "fog";
  tile.hidden = true;
  tile.discovered = false;
  tile.robber = false;
  tile.occupant = null;
  resetScenarioSetupReady(state);
  recomputeNewWorldScenarioSetupState(state);
}

function handleScenarioSetupPlaceToken(
  state: GameState,
  playerId: string,
  tileId: string,
  token: number
): void {
  void getPlayer(state, playerId);
  ensureScenarioSetupEditableByPlayer(state, playerId);
  const setupState = getScenarioSetupState(state);
  const tile = getScenarioSetupTile(state, tileId);
  if (tile.terrain === null || tile.terrain === "sea" || tile.terrain === "desert") {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
  if (tile.token !== token && (setupState.tokenPool[token] ?? 0) <= 0) {
    throw new GameRuleError("game.scenario_setup_pool_empty");
  }
  clearScenarioSetupTileToken(state, tile);
  setupState.tokenPool[token] = (setupState.tokenPool[token] ?? 0) - 1;
  tile.token = token;
  resetScenarioSetupReady(state);
  recomputeNewWorldScenarioSetupState(state);
}

function handleScenarioSetupClearToken(state: GameState, playerId: string, tileId: string): void {
  void getPlayer(state, playerId);
  ensureScenarioSetupEditableByPlayer(state, playerId);
  const tile = getScenarioSetupTile(state, tileId);
  clearScenarioSetupTileToken(state, tile);
  resetScenarioSetupReady(state);
  recomputeNewWorldScenarioSetupState(state);
}

function handleScenarioSetupPlacePort(
  state: GameState,
  playerId: string,
  edgeId: string,
  portType: PortType
): void {
  void getPlayer(state, playerId);
  ensureScenarioSetupEditableByPlayer(state, playerId);
  const setupState = getScenarioSetupState(state);
  if (!setupState.portEdgeIds.includes(edgeId)) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
  const edge = getEdge(state, edgeId);
  const existingPort = state.board.ports.find((port) => port.edgeId === edgeId) ?? null;
  if (existingPort?.type !== portType && (setupState.portPool[portType] ?? 0) <= 0) {
    throw new GameRuleError("game.scenario_setup_pool_empty");
  }
  if (existingPort) {
    setupState.portPool[existingPort.type] += 1;
  }
  state.board.ports = state.board.ports.filter((port) => port.edgeId !== edgeId);
  setupState.portPool[portType] -= 1;
  state.board.ports.push({
    id: existingPort?.id ?? `port-${edgeId}`,
    edgeId,
    vertexIds: [...edge.vertexIds] as [string, string],
    type: portType
  });
  state.board.ports.sort((left, right) => sortId(left.id, right.id));
  syncScenarioSetupPortTypes(state);
  resetScenarioSetupReady(state);
  recomputeNewWorldScenarioSetupState(state);
}

function handleScenarioSetupClearPort(state: GameState, playerId: string, edgeId: string): void {
  void getPlayer(state, playerId);
  ensureScenarioSetupEditableByPlayer(state, playerId);
  const setupState = getScenarioSetupState(state);
  if (!setupState.portEdgeIds.includes(edgeId)) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }

  const existingPort = state.board.ports.find((port) => port.edgeId === edgeId) ?? null;
  if (!existingPort) {
    return;
  }
  setupState.portPool[existingPort.type] += 1;
  state.board.ports = state.board.ports.filter((port) => port.edgeId !== edgeId);
  syncScenarioSetupPortTypes(state);
  resetScenarioSetupReady(state);
  recomputeNewWorldScenarioSetupState(state);
}

function handleScenarioSetupSetReady(state: GameState, playerId: string, ready: boolean): void {
  const setupState = getScenarioSetupState(state);
  if (ready && (setupState.stage !== "ready" || setupState.validationErrorCode !== null)) {
    throw new GameRuleError("game.scenario_setup_not_ready");
  }
  setupState.readyByPlayerId[playerId] = ready;
  completeScenarioSetupIfReady(state);
}

export function applyAction(state: GameState, playerId: string, action: ActionIntent): GameState {
  if (state.phase === "game_over") {
    throw new GameRuleError("game.already_over");
  }

  const next = cloneState(state);
  const pendingGoldSelection = next.pendingGoldSelections[0] ?? null;
  if (
    pendingGoldSelection &&
    (action.type !== "choose_gold_resource" || pendingGoldSelection.playerId !== playerId)
  ) {
    throw new GameRuleError("game.gold_selection_pending");
  }
  if (next.pendingDevelopmentEffect && !isPendingDevelopmentAction(action)) {
    throw new GameRuleError("game.pending_development_effect");
  }

  const handledScenarioSetup = applyScenarioSetupAction(ACTION_HANDLERS, next, playerId, action);
  if (next.phase === "scenario_setup" && !handledScenarioSetup) {
    throw new GameRuleError("game.action_phase_not_allowed");
  }

  if (
    !handledScenarioSetup &&
    !applySetupAction(ACTION_HANDLERS, next, playerId, action) &&
    !applyRobberAction(ACTION_HANDLERS, next, playerId, action) &&
    !applyBuildAction(ACTION_HANDLERS, next, playerId, action) &&
    !applyDevelopmentAction(ACTION_HANDLERS, next, playerId, action) &&
    !applyTradeAction(ACTION_HANDLERS, next, playerId, action) &&
    !applyTurnAction(ACTION_HANDLERS, next, playerId, action)
  ) {
    throw new GameRuleError("game.unknown_action", { actionType: action.type });
  }

  updateAwards(next);
  reconcileTradeOffers(next);
  maybeDeclareWinner(next);
  next.version += 1;
  return next;
}

export function updatePlayerConnection(
  state: GameState,
  playerId: string,
  connected: boolean
): GameState {
  const next = cloneState(state);
  const player = getPlayer(next, playerId);
  player.connected = connected;
  if (connected) {
    player.disconnectDeadlineAt = null;
  } else {
    player.disconnectDeadlineAt ??= null;
  }
  return next;
}

export function setPlayerDisconnectDeadline(
  state: GameState,
  playerId: string,
  disconnectDeadlineAt: number | null
): GameState {
  const next = cloneState(state);
  getPlayer(next, playerId).disconnectDeadlineAt = disconnectDeadlineAt;
  return next;
}

export function roomToPlayers(room: RoomDetails): MatchPlayerInput[] {
  return room.seats
    .filter((seat) => seat.userId && seat.username)
    .map((seat) => ({
      id: seat.userId!,
      username: seat.username!,
      color: seat.color,
      seatIndex: seat.index,
      connected: true
    }));
}

export function rollStartingPlayer(
  players: MatchPlayerInput[],
  seed: string
): StartingPlayerRollResult {
  const orderedPlayers = [...players].sort((left, right) => left.seatIndex - right.seatIndex);
  const rng = new SeededRandom(`${seed}:starting-player`);
  let contenders = orderedPlayers;
  const rounds: StartingPlayerRollRound[] = [];

  while (contenders.length > 1) {
    let highestTotal = -1;
    let leaders: MatchPlayerInput[] = [];
    const rolls = contenders.map((player) => {
      const dice: [number, number] = [rng.nextInt(1, 6), rng.nextInt(1, 6)];
      const total = dice[0] + dice[1];
      if (total > highestTotal) {
        highestTotal = total;
        leaders = [player];
      } else if (total === highestTotal) {
        leaders.push(player);
      }

      return {
        playerId: player.id,
        username: player.username,
        seatIndex: player.seatIndex,
        dice,
        total
      };
    });

    rounds.push({
      contenderPlayerIds: contenders.map((player) => player.id),
      leaderPlayerIds: leaders.map((player) => player.id),
      highestTotal,
      rolls
    });
    contenders = leaders;
  }

  const winner = contenders[0] ?? orderedPlayers[0];
  if (!winner) {
    throw new GameRuleError("game.starting_player_unresolved");
  }

  return {
    winnerPlayerId: winner.id,
    winnerSeatIndex: winner.seatIndex,
    rounds
  };
}

function handleInitialSettlement(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(state.phase === "setup_forward" || state.phase === "setup_reverse");
  ensureCurrentPlayer(state, playerId);
  if (!state.setupState || state.setupState.stage !== "settlement") {
    throw new GameRuleError("game.initial_settlement_not_expected");
  }

  if (!getInitialSettlementVertices(state).includes(vertexId)) {
    throw new GameRuleError("game.initial_settlement_not_allowed");
  }

  placeBuilding(state, playerId, vertexId, "settlement");
  state.setupState.pendingSettlementVertexId = vertexId;
  state.setupState.stage = "road";

  appendEvent(state, {
    type: "initial_settlement_placed",
    byPlayerId: playerId,
    payload: { vertexId }
  });

  if (getCurrentSetupStep(state.setupState).grantInitialResources) {
    grantInitialResources(state, playerId, vertexId);
  }
}

function handleInitialRoad(
  state: GameState,
  playerId: string,
  edgeId: string,
  requestedRouteType?: RouteBuildType
): void {
  ensurePhase(state.phase === "setup_forward" || state.phase === "setup_reverse");
  ensureCurrentPlayer(state, playerId);
  if (!state.setupState || state.setupState.stage !== "road" || !state.setupState.pendingSettlementVertexId) {
    throw new GameRuleError("game.initial_road_not_expected");
  }

  const routeOptions = getInitialRouteOptions(state, state.setupState.pendingSettlementVertexId).filter(
    (option) => option.edgeId === edgeId
  );
  if (!routeOptions.length) {
    throw new GameRuleError("game.initial_road_not_allowed");
  }

  const routeType = resolveRouteBuildType(routeOptions, requestedRouteType);
  if (routeType === "ship") {
    placeShip(state, playerId, edgeId, "ship");
    resolveScenarioEdgeRewards(state, playerId, edgeId);
  } else {
    placeRoad(state, playerId, edgeId);
  }
  appendEvent(state, {
    type: "initial_road_placed",
    byPlayerId: playerId,
    payload: { edgeId, routeType }
  });

  const setup = state.setupState;
  const lastIndex = state.players.length - 1;
  const currentStep = getCurrentSetupStep(setup);
  setup.pendingSettlementVertexId = null;
  setup.stage = "settlement";

  if (currentStep.direction === "forward") {
    if (setup.currentIndex < lastIndex) {
      setup.currentIndex += 1;
      state.currentPlayerIndex = setup.currentIndex;
      return;
    }
  } else if (setup.currentIndex > 0) {
    setup.currentIndex -= 1;
    state.currentPlayerIndex = setup.currentIndex;
    return;
  }

  const nextStep = setup.steps[setup.stepIndex + 1] ?? null;
  if (nextStep) {
    setup.stepIndex += 1;
    setup.currentIndex = nextStep.direction === "reverse" ? lastIndex : 0;
    state.currentPlayerIndex = setup.currentIndex;
    state.phase = getSetupPhaseForDirection(nextStep.direction);
    state.previousPhase = null;
    return;
  }

  state.setupState = null;
  capturePlayerHomeIslands(state);
  state.phase = "turn_roll";
  state.currentPlayerIndex = 0;
  state.turn = 1;
  state.previousPhase = null;
  state.turnContext.primaryPlayerIndex = 0;
}

function handleDiscardResources(state: GameState, playerId: string, resources: ResourceMap): void {
  ensurePhase(state.phase === "robber_interrupt");
  const robberState = state.robberState;
  if (!robberState) {
    throw new GameRuleError("game.robber_state_missing");
  }

  const required = robberState.pendingDiscardByPlayerId[playerId] ?? 0;
  if (!required) {
    throw new GameRuleError("game.discard_not_pending");
  }

  const player = getPlayer(state, playerId);
  if (!hasResources(player.resources, resources) || totalResources(resources) !== required) {
    throw new GameRuleError("game.discard_invalid");
  }

  player.resources = subtractResources(player.resources, resources);
  state.bank = addResources(state.bank, resources);
  robberState.pendingDiscardByPlayerId[playerId] = 0;

  appendEvent(state, {
    type: "resources_discarded",
    byPlayerId: playerId,
    payload: { count: required }
  });

  if (
    robberState.mode === "pirate_islands_seven" &&
    !hasPendingDiscard(state) &&
    getPirateIslandsSevenStealTargets(state, getCurrentPlayer(state).id).length === 0
  ) {
    state.phase = robberState.resumePhase;
    state.previousPhase = null;
    state.robberState = null;
  }
}

function handleRollDice(state: GameState, playerId: string): void {
  ensurePhase(state.phase === "turn_roll");
  ensureCurrentPlayer(state, playerId);

  const dice = [nextDie(state), nextDie(state)] as [number, number];
  const total = dice[0] + dice[1];
  state.dice = dice;

  appendEvent(state, {
    type: "dice_rolled",
    byPlayerId: playerId,
    payload: { dice, total }
  });

  if (state.gameConfig.scenarioId === "seafarers.pirate_islands") {
    resolvePirateIslandsFleetRoll(state, playerId, dice);
    if (state.pendingGoldSelections.length > 0) {
      state.pendingRollResolution = {
        type: "pirate_islands",
        playerId,
        total,
        dice
      };
      return;
    }

    completePirateIslandsRollResolution(state, playerId, total, dice);
    return;
  }

  if (total === 7) {
    const pendingDiscardByPlayerId: Record<string, number> = {};
    for (const player of state.players) {
      const count = totalResources(player.resources);
      if (count > 7) {
        pendingDiscardByPlayerId[player.id] = Math.floor(count / 2);
      }
    }

    state.phase = "robber_interrupt";
    state.previousPhase = "turn_roll";
    state.robberState = {
      resumePhase: "turn_action",
      pendingDiscardByPlayerId
    };
    return;
  }

  distributeResourcesForRoll(state, total, playerId, dice);
  state.phase = "turn_action";
  state.previousPhase = null;
}

function handleBuildRoad(
  state: GameState,
  playerId: string,
  edgeId: string,
  freeBuild: boolean
): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  ensureRoadPlacement(state, playerId, edgeId);

  if (!freeBuild) {
    payCost(state, playerId, BUILD_COSTS.road);
  }

  placeRoad(state, playerId, edgeId);
  appendEvent(state, {
    type: "road_built",
    byPlayerId: playerId,
    payload: { edgeId, freeBuild }
  });

  revealAdjacentFogTiles(state, playerId, edgeId);
}

function handleBuildShip(
  state: GameState,
  playerId: string,
  edgeId: string,
  freeBuild: boolean
): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  ensureShipPlacement(state, playerId, edgeId);

  if (!freeBuild) {
    payCost(state, playerId, BUILD_COSTS.ship);
  }

  placeShip(state, playerId, edgeId, "ship");
  resolveScenarioEdgeRewards(state, playerId, edgeId);
  appendEvent(state, {
    type: "ship_built",
    byPlayerId: playerId,
    payload: { edgeId, routeType: "ship", freeBuild }
  });

  revealAdjacentFogTiles(state, playerId, edgeId);
}

function handleMoveShip(
  state: GameState,
  playerId: string,
  fromEdgeId: string,
  toEdgeId: string
): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  if (!getMovableShipEdgeIds(state, playerId).includes(fromEdgeId)) {
    throw new GameRuleError("game.ship_not_movable");
  }

  const fromEdge = getEdge(state, fromEdgeId);
  const routeType = fromEdge.routeType === "warship" ? "warship" : "ship";
  clearOwnedRoute(state, playerId, fromEdgeId);
  ensureShipPlacement(state, playerId, toEdgeId);
  placeShip(state, playerId, toEdgeId, routeType);
  resolveScenarioEdgeRewards(state, playerId, toEdgeId);
  appendEvent(state, {
    type: "ship_moved",
    byPlayerId: playerId,
    payload: { fromEdgeId, toEdgeId }
  });

  revealAdjacentFogTiles(state, playerId, toEdgeId);
}

function handleBuildSettlement(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  ensureSettlementPlacement(state, playerId, vertexId);
  payCost(state, playerId, BUILD_COSTS.settlement);
  placeBuilding(state, playerId, vertexId, "settlement");
  resolveSettlementScenarioRewards(state, playerId, vertexId);

  appendEvent(state, {
    type: "settlement_built",
    byPlayerId: playerId,
    payload: { vertexId }
  });
}

function handleBuildCity(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  const player = getPlayer(state, playerId);
  if (player.cities.length >= 4) {
    throw new GameRuleError("game.cities_unavailable");
  }

  const vertex = getVertex(state, vertexId);
  if (vertex.building?.ownerId !== playerId || vertex.building.type !== "settlement") {
    throw new GameRuleError("game.no_own_settlement");
  }

  payCost(state, playerId, BUILD_COSTS.city);
  vertex.building = {
    ownerId: playerId,
    color: player.color,
    type: "city"
  };
  player.settlements = player.settlements.filter((id) => id !== vertexId);
  player.cities.push(vertexId);

  appendEvent(state, {
    type: "city_built",
    byPlayerId: playerId,
    payload: { vertexId }
  });
}

function handleBuyDevelopmentCard(state: GameState, playerId: string): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  if (!state.developmentDeck.length) {
    throw new GameRuleError("game.development_deck_empty");
  }

  payCost(state, playerId, BUILD_COSTS.development);
  const card = state.developmentDeck.shift()!;
  card.boughtOnTurn = state.turn;
  getPlayer(state, playerId).developmentCards.push(card);

  appendEvent(state, {
    type: "development_card_bought",
    byPlayerId: playerId,
    payload: { remaining: state.developmentDeck.length }
  });
}

function handlePlayKnight(state: GameState, playerId: string): void {
  ensurePhase(isDevelopmentCardPhase(state.phase));
  ensureCurrentPlayer(state, playerId);

  if (state.gameConfig.scenarioId === "seafarers.pirate_islands") {
    if (findConvertibleWarshipEdgeId(state, playerId) === null) {
      throw new GameRuleError("game.scenario_action_unavailable");
    }

    playDevelopmentCard(state, playerId, "knight");
    const edgeId = convertShipToWarship(state, playerId);
    appendEvent(state, {
      type: "development_card_played",
      byPlayerId: playerId,
      payload: { cardType: "knight" }
    });
    appendEvent(state, {
      type: "warship_converted",
      byPlayerId: playerId,
      payload: { edgeId }
    });
    return;
  }

  playDevelopmentCard(state, playerId, "knight");

  const resumePhase = state.dice ? state.phase : "turn_roll";
  state.phase = "robber_interrupt";
  state.previousPhase = resumePhase;
  state.robberState = {
    resumePhase,
    pendingDiscardByPlayerId: {}
  };

  getPlayer(state, playerId).playedKnightCount += 1;
  appendEvent(state, {
    type: "development_card_played",
    byPlayerId: playerId,
    payload: { cardType: "knight" }
  });
}

function handlePlayRoadBuilding(state: GameState, playerId: string): void {
  ensurePhase(isDevelopmentCardPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  if (!getLegalFreeRouteEdges(state, playerId).length) {
    throw new GameRuleError("game.free_road_not_available");
  }

  playDevelopmentCard(state, playerId, "road_building");
  clearTradeOffers(state);
  state.pendingDevelopmentEffect = {
    type: "road_building",
    remainingRoads: 2,
    resumePhase:
      state.phase === "turn_roll"
        ? "turn_roll"
        : state.phase === "paired_player_action"
          ? "paired_player_action"
          : "turn_action"
  };

  appendEvent(state, {
    type: "development_card_played",
    byPlayerId: playerId,
    payload: { cardType: "road_building" }
  });
}

function handlePlaceFreeRoad(
  state: GameState,
  playerId: string,
  edgeId: string,
  requestedRouteType?: RouteBuildType
): void {
  ensurePhase(isDevelopmentCardPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  const effect = getPendingRoadBuildingEffect(state);
  const routeOptions = getLegalFreeRouteOptions(state, playerId).filter((option) => option.edgeId === edgeId);
  if (!routeOptions.length) {
    throw new GameRuleError("game.free_road_not_allowed");
  }

  const routeType = resolveRouteBuildType(routeOptions, requestedRouteType);
  if (routeType === "ship") {
    placeShip(state, playerId, edgeId, "ship");
    resolveScenarioEdgeRewards(state, playerId, edgeId);
    appendEvent(state, {
      type: "ship_built",
      byPlayerId: playerId,
      payload: { edgeId, routeType: "ship", freeBuild: true }
    });
  } else {
    placeRoad(state, playerId, edgeId);
    appendEvent(state, {
      type: "road_built",
      byPlayerId: playerId,
      payload: { edgeId, freeBuild: true }
    });
  }
  revealAdjacentFogTiles(state, playerId, edgeId);

  if (effect.remainingRoads === 2) {
    effect.remainingRoads = 1;
    completeRoadBuildingIfDone(state);
    return;
  }

  state.pendingDevelopmentEffect = null;
  state.phase = effect.resumePhase;
  state.previousPhase = null;
}

function handleFinishRoadBuilding(state: GameState, playerId: string): void {
  ensurePhase(isDevelopmentCardPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  const effect = getPendingRoadBuildingEffect(state);
  if (effect.remainingRoads === 2) {
    throw new GameRuleError("game.road_building_requires_one_road");
  }

  state.pendingDevelopmentEffect = null;
  state.phase = effect.resumePhase;
  state.previousPhase = null;
}

function handlePlayYearOfPlenty(
  state: GameState,
  playerId: string,
  resources: [Resource, Resource]
): void {
  ensurePhase(isDevelopmentCardPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  playDevelopmentCard(state, playerId, "year_of_plenty");

  const take = createEmptyResourceMap();
  take[resources[0]] += 1;
  take[resources[1]] += 1;
  if (!hasResources(state.bank, take)) {
    throw new GameRuleError("game.bank_cannot_pay");
  }

  state.bank = subtractResources(state.bank, take);
  getPlayer(state, playerId).resources = addResources(getPlayer(state, playerId).resources, take);

  appendEvent(state, {
    type: "development_card_played",
    byPlayerId: playerId,
    payload: { cardType: "year_of_plenty", resources }
  });
}

function handlePlayMonopoly(state: GameState, playerId: string, resource: Resource): void {
  ensurePhase(isDevelopmentCardPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  playDevelopmentCard(state, playerId, "monopoly");

  let total = 0;
  for (const player of state.players) {
    if (player.id === playerId) {
      continue;
    }
    total += player.resources[resource];
    player.resources[resource] = 0;
  }
  getPlayer(state, playerId).resources[resource] += total;

  appendEvent(state, {
    type: "development_card_played",
    byPlayerId: playerId,
    payload: { cardType: "monopoly", resource, total }
  });
}

function handleMoveRobber(
  state: GameState,
  playerId: string,
  tileId: string,
  targetPlayerId?: string
): void {
  ensurePhase(state.phase === "robber_interrupt");
  ensureCurrentPlayer(state, playerId);
  if (!state.robberState) {
    throw new GameRuleError("game.robber_state_inactive");
  }
  if (state.robberState.mode === "pirate_islands_seven") {
    throw new GameRuleError("game.action_phase_not_allowed");
  }
  if (hasPendingDiscard(state)) {
    throw new GameRuleError("game.robber_discard_first");
  }

  const currentRobberTile = state.board.tiles.find((tile) => tile.robber) ?? null;
  if (currentRobberTile?.id === tileId) {
    throw new GameRuleError("game.robber_must_move");
  }

  if (currentRobberTile) {
    currentRobberTile.robber = false;
  }
  getTile(state, tileId).robber = true;

  const victims = getRobberStealTargets(state, playerId, tileId);
  if (victims.length > 0) {
    if (victims.length > 1 && !targetPlayerId) {
      throw new GameRuleError("game.robber_target_required");
    }

    const victimId = targetPlayerId ?? victims[0]!;
    if (!victims.includes(victimId)) {
      throw new GameRuleError("game.robber_target_invalid");
    }
    stealRandomResource(state, playerId, victimId);
  }

  appendEvent(state, {
    type: "robber_moved",
    byPlayerId: playerId,
    payload: { tileId, targetPlayerId: targetPlayerId ?? null }
  });

  state.phase = state.robberState.resumePhase;
  state.previousPhase = null;
  state.robberState = null;
}

function handleMovePirate(
  state: GameState,
  playerId: string,
  tileId: string,
  targetPlayerId?: string,
  stealType?: PirateStealType
): void {
  ensurePhase(state.phase === "robber_interrupt");
  ensureCurrentPlayer(state, playerId);
  if (!state.robberState) {
    throw new GameRuleError("game.robber_state_inactive");
  }
  if (state.robberState.mode === "pirate_islands_seven") {
    throw new GameRuleError("game.action_phase_not_allowed");
  }
  if (hasPendingDiscard(state)) {
    throw new GameRuleError("game.robber_discard_first");
  }
  if (!getPirateMoveOptions(state, playerId).some((option) => option.tileId === tileId)) {
    throw new GameRuleError("game.pirate_must_move");
  }

  for (const tile of state.board.tiles) {
    if (tile.occupant === "pirate") {
      tile.occupant = null;
    }
  }
  const pirateTile = getTile(state, tileId);
  pirateTile.occupant = "pirate";
  updatePirateBlocks(state);

  const victims = getPirateStealTargets(state, playerId, tileId);
  let resolvedStealType: PirateStealType | undefined;
  if (victims.length > 0) {
    if (victims.length > 1 && !targetPlayerId) {
      throw new GameRuleError("game.pirate_target_required");
    }

    const victimId = targetPlayerId ?? victims[0]!;
    if (!victims.includes(victimId)) {
      throw new GameRuleError("game.pirate_target_invalid");
    }
    const allowedStealTypes = getPirateStealTypesForTarget(state, victimId);
    if (allowedStealTypes.length > 1 && !stealType) {
      throw new GameRuleError("game.pirate_steal_type_required");
    }
    resolvedStealType = stealType ?? allowedStealTypes[0];
    if (!resolvedStealType || !allowedStealTypes.includes(resolvedStealType)) {
      throw new GameRuleError("game.pirate_target_invalid");
    }

    if (resolvedStealType === "cloth") {
      stealClothToken(state, playerId, victimId);
    } else {
      stealRandomResource(state, playerId, victimId);
    }
  }

  appendEvent(state, {
    type: "pirate_moved",
    byPlayerId: playerId,
    payload: {
      tileId,
      targetPlayerId: targetPlayerId ?? null,
      ...(resolvedStealType ? { stealType: resolvedStealType } : {})
    }
  });

  state.phase = state.robberState.resumePhase;
  state.previousPhase = null;
  state.robberState = null;
}

function handleStealOnSeven(state: GameState, playerId: string, targetPlayerId: string): void {
  ensurePhase(state.phase === "robber_interrupt");
  ensureCurrentPlayer(state, playerId);
  if (!state.robberState || state.robberState.mode !== "pirate_islands_seven") {
    throw new GameRuleError("game.robber_state_inactive");
  }
  if (hasPendingDiscard(state)) {
    throw new GameRuleError("game.robber_discard_first");
  }

  const validTargetPlayerIds = getPirateIslandsSevenStealTargets(state, playerId);
  if (!validTargetPlayerIds.length) {
    state.phase = state.robberState.resumePhase;
    state.previousPhase = null;
    state.robberState = null;
    return;
  }
  if (!validTargetPlayerIds.includes(targetPlayerId)) {
    throw new GameRuleError("game.pirate_target_invalid");
  }

  stealRandomResource(state, playerId, targetPlayerId);
  appendEvent(state, {
    type: "pirate_seven_stolen",
    byPlayerId: playerId,
    payload: { targetPlayerId }
  });

  state.phase = state.robberState.resumePhase;
  state.previousPhase = null;
  state.robberState = null;
}

function handleChooseGoldResource(
  state: GameState,
  playerId: string,
  resources: Resource[]
): void {
  const pendingSelection = state.pendingGoldSelections[0];
  if (!pendingSelection || pendingSelection.playerId !== playerId) {
    throw new GameRuleError("game.gold_selection_not_pending");
  }
  if (resources.length !== pendingSelection.count) {
    throw new GameRuleError("game.gold_selection_invalid");
  }

  const reward = createEmptyResourceMap();
  for (const resource of resources) {
    reward[resource] += 1;
  }
  if (!hasResources(state.bank, reward)) {
    throw new GameRuleError("game.bank_cannot_pay");
  }

  state.bank = subtractResources(state.bank, reward);
  getPlayer(state, playerId).resources = addResources(getPlayer(state, playerId).resources, reward);
  state.pendingGoldSelections.shift();

  appendEvent(state, {
    type: "gold_resource_chosen",
    byPlayerId: playerId,
    payload: { resources }
  });

  if (!state.pendingGoldSelections.length && state.pendingRollResolution) {
    const pendingRollResolution = state.pendingRollResolution;
    state.pendingRollResolution = null;
    completePirateIslandsRollResolution(
      state,
      pendingRollResolution.playerId,
      pendingRollResolution.total,
      pendingRollResolution.dice
    );
  }
}

function handlePlacePortToken(
  state: GameState,
  playerId: string,
  vertexId: string,
  portType: PortType
): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);

  const player = getPlayer(state, playerId);
  const tokenIndex = player.harborTokens.findIndex((entry) => entry === portType);
  if (tokenIndex === -1) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
  if (!getPlaceablePortVertices(state, playerId).includes(vertexId)) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }

  const vertex = getVertex(state, vertexId);
  vertex.portType = portType;
  player.harborTokens.splice(tokenIndex, 1);

  appendEvent(state, {
    type: "harbor_token_placed",
    byPlayerId: playerId,
    payload: { vertexId, portType }
  });
}

function handleClaimWonder(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  const site = getSiteAtVertex(state, vertexId, "wonder");
  if (
    !site ||
    site.ownerId ||
    playerOwnsWonder(state, playerId) ||
    !meetsWonderRequirement(state, playerId, site)
  ) {
    throw new GameRuleError("game.wonder_not_available");
  }

  site.ownerId = playerId;
  site.color = getPlayer(state, playerId).color;
  site.claimed = true;
  syncVertexSite(state, site);

  appendEvent(state, {
    type: "wonder_claimed",
    byPlayerId: playerId,
    payload: { vertexId }
  });
}

function handleBuildWonderLevel(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  const site = getSiteAtVertex(state, vertexId, "wonder");
  if (!site || site.ownerId !== playerId || (site.progress ?? 0) >= 4) {
    throw new GameRuleError("game.wonder_not_owned");
  }

  payCost(state, playerId, site.buildCost);
  site.progress = (site.progress ?? 0) + 1;
  getPlayer(state, playerId).wonderProgress = Math.max(
    getPlayer(state, playerId).wonderProgress,
    site.progress
  );
  syncVertexSite(state, site);

  appendEvent(state, {
    type: "wonder_level_built",
    byPlayerId: playerId,
    payload: { vertexId, level: site.progress }
  });
}

function handleAttackFortress(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(isBuildActionPhase(state.phase));
  ensureCurrentPlayer(state, playerId);
  clearTradeOffers(state);
  performFortressAttack(state, playerId, vertexId);
  if (state.phase === "game_over") {
    return;
  }

  advanceAfterTurnEnd(state, playerId);
}

function performFortressAttack(state: GameState, playerId: string, vertexId: string): void {
  const site = getSiteAtVertex(state, vertexId, "fortress");
  const assaultRoute = getPirateFortressAssaultRoute(state, playerId, vertexId);
  if (
    !site ||
    site.fortressColor !== getPlayer(state, playerId).color ||
    site.ownerId === playerId ||
    site.captured ||
    !assaultRoute
  ) {
    throw new GameRuleError("game.fortress_not_available");
  }

  const strength = nextDie(state);
  const defeated = assaultRoute.warshipCount > strength;
  if (defeated) {
    site.pirateLairCount = Math.max(0, site.pirateLairCount - 1);
    if (site.pirateLairCount === 0) {
      site.ownerId = playerId;
      site.color = getPlayer(state, playerId).color;
      site.captured = true;
      const player = getPlayer(state, playerId);
      const vertex = getVertex(state, vertexId);
      if (!vertex.building) {
        vertex.building = {
          ownerId: playerId,
          color: player.color,
          type: "settlement"
        };
      }
      if (!player.settlements.includes(vertexId)) {
        player.settlements.push(vertexId);
      }
    }
  } else {
    const routesToRemove = assaultRoute.removableEdgeIds.slice(0, assaultRoute.warshipCount < strength ? 2 : 1);
    for (const edgeId of routesToRemove) {
      clearOwnedRoute(state, playerId, edgeId);
    }
  }
  syncVertexSite(state, site);
  if (
    (state.board.sites ?? []).every(
      (candidateSite) => (candidateSite.type === "fortress" ? candidateSite.captured : true)
    )
  ) {
    for (const tile of state.board.tiles) {
      if (tile.occupant === "pirate") {
        tile.occupant = null;
      }
    }
    updatePirateBlocks(state);
  }

  appendEvent(state, {
    type: "fortress_attacked",
    byPlayerId: playerId,
    payload: { vertexId, strength, defeated }
  });

  // Pirate Islands can be won directly by capturing the matching fortress.
  maybeDeclareWinner(state);
}

function handleCreateTradeOffer(
  state: GameState,
  playerId: string,
  toPlayerId: string | null,
  give: ResourceMap,
  want: ResourceMap
): void {
  ensurePhase(state.phase === "turn_action");
  if (isEmptyResourceMap(give) && isEmptyResourceMap(want)) {
    throw new GameRuleError("trade.empty");
  }

  const player = getPlayer(state, playerId);
  const currentPlayerId = getCurrentPlayer(state).id;
  if (!hasResources(player.resources, give)) {
    throw new GameRuleError("trade.resources_unavailable");
  }
  if (toPlayerId === playerId) {
    throw new GameRuleError("trade.self_forbidden");
  }
  if (toPlayerId && !state.players.some((entry) => entry.id === toPlayerId)) {
    throw new GameRuleError("trade.partner_invalid");
  }
  if (playerId === currentPlayerId) {
    if (toPlayerId === currentPlayerId) {
      throw new GameRuleError("trade.active_player_self_target_forbidden");
    }
  } else if (toPlayerId !== currentPlayerId) {
    throw new GameRuleError("trade.counter_must_target_active_player");
  }

  const trade: InternalTradeOffer = {
    id: `trade-${state.version + 1}-${state.tradeOffers.length + 1}`,
    fromPlayerId: playerId,
    toPlayerId,
    give: cloneResourceMap(give),
    want: cloneResourceMap(want),
    createdAtTurn: state.turn,
    declinedByPlayerIds: []
  };
  state.tradeOffers.push(trade);

  appendEvent(state, {
    type: "trade_offered",
    byPlayerId: playerId,
    payload: { tradeId: trade.id, toPlayerId }
  });
}

function handleAcceptTradeOffer(state: GameState, playerId: string, tradeId: string): void {
  ensurePhase(state.phase === "turn_action");
  const trade = getTradeOffer(state, tradeId);
  if (!trade) {
    throw new GameRuleError("trade.inactive");
  }
  if (!canPlayerAcceptTradeOffer(state, playerId, trade)) {
    throw new GameRuleError("trade.cannot_accept");
  }

  const proposer = getPlayer(state, trade.fromPlayerId);
  const responder = getPlayer(state, playerId);
  if (!hasResources(proposer.resources, trade.give) || !hasResources(responder.resources, trade.want)) {
    throw new GameRuleError("trade.insufficient_resources");
  }

  proposer.resources = subtractResources(proposer.resources, trade.give);
  proposer.resources = addResources(proposer.resources, trade.want);
  responder.resources = subtractResources(responder.resources, trade.want);
  responder.resources = addResources(responder.resources, trade.give);

  clearTradeOffers(state);

  appendEvent(state, {
    type: "trade_completed",
    byPlayerId: playerId,
    payload: { tradeId, fromPlayerId: trade.fromPlayerId }
  });
}

function handleDeclineTradeOffer(state: GameState, playerId: string, tradeId: string): void {
  ensurePhase(state.phase === "turn_action");
  const trade = getTradeOffer(state, tradeId);
  if (!trade) {
    throw new GameRuleError("trade.inactive");
  }
  if (!canPlayerDeclineTradeOffer(state, playerId, trade)) {
    throw new GameRuleError("trade.cannot_decline");
  }

  if (trade.toPlayerId) {
    state.tradeOffers = state.tradeOffers.filter((offer) => offer.id !== tradeId);
  } else if (!trade.declinedByPlayerIds.includes(playerId)) {
    trade.declinedByPlayerIds.push(playerId);
    if (getOpenTradeRecipientIds(state, trade).length === 0) {
      state.tradeOffers = state.tradeOffers.filter((offer) => offer.id !== tradeId);
    }
  }

  appendEvent(state, {
    type: "trade_declined",
    byPlayerId: playerId,
    payload: { tradeId }
  });
}

function handleWithdrawTradeOffer(state: GameState, playerId: string, tradeId: string): void {
  ensurePhase(state.phase === "turn_action");
  const trade = getTradeOffer(state, tradeId);
  if (!trade) {
    throw new GameRuleError("trade.inactive");
  }
  if (!canPlayerWithdrawTradeOffer(playerId, trade)) {
    throw new GameRuleError("trade.only_offer_owner_can_withdraw");
  }

  state.tradeOffers = state.tradeOffers.filter((offer) => offer.id !== tradeId);

  appendEvent(state, {
    type: "trade_cancelled",
    byPlayerId: playerId,
    payload: { tradeId }
  });
}

function handleMaritimeTrade(
  state: GameState,
  playerId: string,
  give: Resource,
  receive: ResourceMap,
  giveCount: number
): void {
  ensurePhase(state.phase === "turn_action" || state.phase === "paired_player_action");
  ensureCurrentPlayer(state, playerId);

  const ratio = getMaritimeRate(state, playerId, give);
  if (giveCount < ratio || giveCount % ratio !== 0) {
    throw new GameRuleError("trade.harbor_rate_invalid");
  }

  const payment = createEmptyResourceMap();
  payment[give] = giveCount;
  const reward = cloneResourceMap(receive);
  if (isEmptyResourceMap(reward)) {
    throw new GameRuleError("trade.receive_required");
  }
  if ((reward[give] ?? 0) > 0) {
    throw new GameRuleError("trade.resources_must_differ");
  }
  if (totalResources(reward) !== giveCount / ratio) {
    throw new GameRuleError("trade.harbor_distribution_invalid");
  }
  const player = getPlayer(state, playerId);

  if (!hasResources(player.resources, payment) || !hasResources(state.bank, reward)) {
    throw new GameRuleError("trade.maritime_not_possible");
  }

  player.resources = subtractResources(player.resources, payment);
  player.resources = addResources(player.resources, reward);
  state.bank = addResources(state.bank, payment);
  state.bank = subtractResources(state.bank, reward);

  appendEvent(state, {
    type: "maritime_trade",
    byPlayerId: playerId,
    payload: { give, receive: reward, giveCount }
  });
}

function handleEndTurn(state: GameState, playerId: string): void {
  ensurePhase(state.phase === "turn_action" || state.phase === "special_build" || state.phase === "paired_player_action");
  ensureCurrentPlayer(state, playerId);
  clearTradeOffers(state);

  const fortressVertexId = getAttackableFortressVertices(state, playerId)[0] ?? null;
  if (fortressVertexId) {
    performFortressAttack(state, playerId, fortressVertexId);
    if (state.phase === "game_over") {
      return;
    }
  }

  advanceAfterTurnEnd(state, playerId);
}

function advanceAfterTurnEnd(state: GameState, playerId: string): void {
  if (state.phase === "special_build") {
    continueOrFinishSpecialBuildPhase(state, playerId);
    return;
  }

  if (state.phase === "paired_player_action") {
    finishRegularTurn(state, playerId, getNextPlayerIndex(state, state.turnContext.primaryPlayerIndex));
    return;
  }

  if (usesSpecialBuildTurnRule(state)) {
    startSpecialBuildPhase(state);
    return;
  }

  if (usesPairedPlayersTurnRule(state)) {
    startPairedPlayerAction(state);
    return;
  }

  finishRegularTurn(state, playerId, getNextPlayerIndex(state, state.currentPlayerIndex));
}

function startPairedPlayerAction(state: GameState): void {
  const secondaryPlayerIndex = getPairedPlayerIndex(state);
  if (secondaryPlayerIndex === state.currentPlayerIndex) {
    finishRegularTurn(state, getCurrentPlayer(state).id, getNextPlayerIndex(state, state.currentPlayerIndex));
    return;
  }

  state.turnContext.primaryPlayerIndex = state.currentPlayerIndex;
  const primaryPlayerId = state.players[state.turnContext.primaryPlayerIndex]!.id;
  const secondaryPlayerId = state.players[secondaryPlayerIndex]!.id;
  state.currentPlayerIndex = secondaryPlayerIndex;
  state.phase = "paired_player_action";
  state.previousPhase = "turn_action";
  appendEvent(state, {
    type: "paired_player_started",
    byPlayerId: secondaryPlayerId,
    payload: {
      primaryPlayerId,
      secondaryPlayerId
    }
  });
}

function startSpecialBuildPhase(state: GameState): void {
  const primaryPlayerIndex = state.currentPlayerIndex;
  const queue = state.players
    .map((_, index) => index)
    .filter((index) => index !== primaryPlayerIndex)
    .map((_, offset) => getNextPlayerIndex(state, primaryPlayerIndex, offset + 1));

  resetTurnFlags(state);
  const primaryPlayerId = state.players[primaryPlayerIndex]!.id;
  state.turnContext.primaryPlayerIndex = primaryPlayerIndex;
  state.turnContext.specialBuildQueue = queue.slice(1);
  state.currentPlayerIndex = queue[0] ?? getNextPlayerIndex(state, primaryPlayerIndex);
  const builderPlayerId = state.players[state.currentPlayerIndex]!.id;
  state.phase = "special_build";
  state.previousPhase = "turn_action";
  appendEvent(state, {
    type: "special_build_started",
    byPlayerId: builderPlayerId,
    payload: {
      primaryPlayerId,
      builderPlayerId
    }
  });
}

function continueOrFinishSpecialBuildPhase(state: GameState, playerId: string): void {
  const nextBuilderIndex = state.turnContext.specialBuildQueue.shift();
  if (nextBuilderIndex !== undefined) {
    const primaryPlayerId = state.players[state.turnContext.primaryPlayerIndex]!.id;
    const builderPlayerId = state.players[nextBuilderIndex]!.id;
    state.currentPlayerIndex = nextBuilderIndex;
    state.previousPhase = "special_build";
    appendEvent(state, {
      type: "special_build_started",
      byPlayerId: builderPlayerId,
      payload: {
        primaryPlayerId,
        builderPlayerId
      }
    });
    return;
  }

  finishRegularTurn(
    state,
    playerId,
    getNextPlayerIndex(state, state.turnContext.primaryPlayerIndex)
  );
}

function finishRegularTurn(state: GameState, playerId: string, nextPlayerIndex: number): void {
  beginRegularTurn(state, nextPlayerIndex);
  appendEvent(state, {
    type: "turn_ended",
    byPlayerId: playerId,
    payload: { nextPlayerId: getCurrentPlayer(state).id, turn: state.turn }
  });
  maybeDeclareWinner(state);
}

function beginRegularTurn(state: GameState, nextPlayerIndex: number): void {
  state.currentPlayerIndex = nextPlayerIndex;
  state.turn += 1;
  state.phase = "turn_roll";
  state.previousPhase = null;
  state.dice = null;
  state.pendingRollResolution = null;
  state.turnContext.primaryPlayerIndex = nextPlayerIndex;
  state.turnContext.specialBuildQueue = [];
  resetTurnFlags(state);
}

function resetTurnFlags(state: GameState): void {
  for (const player of state.players) {
    player.hasPlayedDevelopmentCardThisTurn = false;
  }
}

function placeRoad(state: GameState, playerId: string, edgeId: string): void {
  const player = getPlayer(state, playerId);
  if (player.roads.length >= 15) {
    throw new GameRuleError("game.roads_unavailable");
  }

  const edge = getEdge(state, edgeId);
  edge.ownerId = playerId;
  edge.color = player.color;
  edge.routeType = "road";
  edge.placedOnTurn = state.turn;
  player.roads.push(edgeId);
}

function placeShip(
  state: GameState,
  playerId: string,
  edgeId: string,
  routeType: "ship" | "warship"
): void {
  const player = getPlayer(state, playerId);
  if (player.ships.length + player.warships.length >= 15) {
    throw new GameRuleError("game.ships_unavailable");
  }
  const edge = getEdge(state, edgeId);
  edge.ownerId = playerId;
  edge.color = player.color;
  edge.routeType = routeType;
  edge.placedOnTurn = state.turn;
  if (routeType === "warship") {
    player.warships.push(edgeId);
    return;
  }
  player.ships.push(edgeId);
}

function clearOwnedRoute(state: GameState, playerId: string, edgeId: string): void {
  const edge = getEdge(state, edgeId);
  if (edge.ownerId !== playerId) {
    throw new GameRuleError("game.road_occupied");
  }

  const player = getPlayer(state, playerId);
  player.roads = player.roads.filter((id) => id !== edgeId);
  player.ships = player.ships.filter((id) => id !== edgeId);
  player.warships = player.warships.filter((id) => id !== edgeId);
  edge.ownerId = null;
  edge.color = null;
  edge.routeType = null;
  edge.movable = false;
  edge.placedOnTurn = null;
}

function placeBuilding(
  state: GameState,
  playerId: string,
  vertexId: string,
  type: "settlement" | "city"
): void {
  const player = getPlayer(state, playerId);
  if (type === "settlement" && player.settlements.length >= 5) {
    throw new GameRuleError("game.settlements_unavailable");
  }

  if (type === "settlement" && !isSettlementVertexOpen(state, vertexId, playerId)) {
    throw new GameRuleError("game.intersection_occupied");
  }

  const vertex = getVertex(state, vertexId);
  vertex.building = {
    ownerId: playerId,
    color: player.color,
    type
  };

  if (type === "settlement") {
    player.settlements.push(vertexId);
  } else {
    player.cities.push(vertexId);
  }
}

function grantInitialResources(state: GameState, playerId: string, vertexId: string): void {
  const vertex = getVertex(state, vertexId);
  const resources = createEmptyResourceMap();

  for (const tileId of vertex.tileIds) {
    const tile = getTile(state, tileId);
    if (tile.resource !== "desert") {
      resources[tile.resource] += 1;
    }
  }

  for (const resource of RESOURCES) {
    resources[resource] = Math.min(resources[resource], state.bank[resource]);
  }

  state.bank = subtractResources(state.bank, resources);
  getPlayer(state, playerId).resources = addResources(getPlayer(state, playerId).resources, resources);

  appendEvent(state, {
    type: "initial_resources_granted",
    byPlayerId: playerId,
    payload: { resources }
  });
}

function distributeResourcesForRoll(
  state: GameState,
  roll: number,
  playerId: string,
  dice: [number, number]
): void {
  const demandByResource = new Map<Resource, number>();
  const grantByPlayerId = new Map<string, ResourceMap>();
  const goldChoicesByPlayerId = new Map<string, number>();
  const affectedTileIds: string[] = [];

  for (const tile of state.board.tiles) {
    if (
      tile.terrain === "sea" ||
      tile.hidden ||
      tile.robber ||
      tile.token !== roll ||
      tile.kind === "sea"
    ) {
      continue;
    }

    affectedTileIds.push(tile.id);

    for (const vertexId of tile.vertexIds) {
      const vertex = getVertex(state, vertexId);
      if (!vertex.building) {
        continue;
      }

      const amount = vertex.building.type === "city" ? 2 : 1;
      if (tile.terrain === "gold") {
        goldChoicesByPlayerId.set(
          vertex.building.ownerId,
          (goldChoicesByPlayerId.get(vertex.building.ownerId) ?? 0) + amount
        );
        continue;
      }

      if (tile.resource === "desert") {
        continue;
      }
      const grant = grantByPlayerId.get(vertex.building.ownerId) ?? createEmptyResourceMap();
      grant[tile.resource] += amount;
      grantByPlayerId.set(vertex.building.ownerId, grant);
      demandByResource.set(tile.resource, (demandByResource.get(tile.resource) ?? 0) + amount);
    }
  }

  const blockedResources: Resource[] = [];
  for (const resource of RESOURCES) {
    const demand = demandByResource.get(resource) ?? 0;
    if (demand > state.bank[resource]) {
      const recipients = [...grantByPlayerId.values()].filter((grant) => grant[resource] > 0);
      if (recipients.length === 1) {
        recipients[0]![resource] = state.bank[resource];
      } else {
        blockedResources.push(resource);
        for (const grant of grantByPlayerId.values()) {
          grant[resource] = 0;
        }
      }
    }
  }

  for (const [playerId, grant] of grantByPlayerId.entries()) {
    if (isEmptyResourceMap(grant)) {
      continue;
    }
    getPlayer(state, playerId).resources = addResources(getPlayer(state, playerId).resources, grant);
    state.bank = subtractResources(state.bank, grant);
  }

  appendEvent(state, {
    type: "resources_distributed",
    byPlayerId: playerId,
    payload: {
      roll,
      dice,
      tileIds: affectedTileIds,
      grantsByPlayerId: Object.fromEntries(
        [...grantByPlayerId.entries()]
          .filter(([, grant]) => !isEmptyResourceMap(grant))
          .map(([targetPlayerId, grant]) => [targetPlayerId, cloneResourceMap(grant)])
      ),
      blockedResources
    }
  });

  awardVillageClothForRoll(state, roll);

  state.pendingGoldSelections = [...goldChoicesByPlayerId.entries()]
    .map(([targetPlayerId, count]) => ({
      playerId: targetPlayerId,
      count,
      source: "gold_tile" as const
    }))
    .sort((left, right) => {
      const leftIndex = state.players.findIndex((player) => player.id === left.playerId);
      const rightIndex = state.players.findIndex((player) => player.id === right.playerId);
      return leftIndex - rightIndex;
    });
}

function updateAwards(state: GameState): void {
  const largestArmy = updateLargestArmy(state);
  const longestRoad = updateLongestRoad(state);

  if (isLargestArmyEnabled(state)) {
    appendLargestArmyEvents(state, largestArmy);
  }
  if (isLongestRoadEnabled(state)) {
    appendLongestRoadEvents(state, longestRoad);
  }
}

function updateLargestArmy(state: GameState): AwardUpdateResult {
  if (!isLargestArmyEnabled(state)) {
    const currentHolder = state.players.find((player) => player.hasLargestArmy) ?? null;
    state.players.forEach((player) => {
      player.hasLargestArmy = false;
    });
    return {
      previousHolderId: currentHolder?.id ?? null,
      nextHolderId: null,
      valuesByPlayerId: Object.fromEntries(
        state.players.map((player) => [player.id, player.playedKnightCount])
      )
    };
  }

  const counts = state.players.map((player) => ({
    playerId: player.id,
    count: player.playedKnightCount
  }));
  const valuesByPlayerId = Object.fromEntries(counts.map((entry) => [entry.playerId, entry.count]));
  counts.sort((left, right) => right.count - left.count);
  const leader = counts[0];
  const currentHolder = state.players.find((player) => player.hasLargestArmy) ?? null;

  if (!leader || leader.count < 3) {
    state.players.forEach((player) => {
      player.hasLargestArmy = false;
    });

    return {
      previousHolderId: currentHolder?.id ?? null,
      nextHolderId: null,
      valuesByPlayerId
    };
  }

  const leaders = counts.filter((entry) => entry.count === leader.count);
  if (leaders.length === 1) {
    state.players.forEach((player) => {
      player.hasLargestArmy = player.id === leader.playerId;
    });

    return {
      previousHolderId: currentHolder?.id ?? null,
      nextHolderId: leader.playerId,
      valuesByPlayerId
    };
  }

  if (currentHolder && leaders.some((entry) => entry.playerId === currentHolder.id)) {
    state.players.forEach((player) => {
      player.hasLargestArmy = player.id === currentHolder.id;
    });

    return {
      previousHolderId: currentHolder.id,
      nextHolderId: currentHolder.id,
      valuesByPlayerId
    };
  }

  state.players.forEach((player) => {
    player.hasLargestArmy = false;
  });

  return {
    previousHolderId: currentHolder?.id ?? null,
    nextHolderId: null,
    valuesByPlayerId
  };
}

function updateLongestRoad(state: GameState): AwardUpdateResult {
  if (!isLongestRoadEnabled(state)) {
    const currentHolder = state.players.find((player) => player.hasLongestRoad) ?? null;
    state.players.forEach((player) => {
      player.hasLongestRoad = false;
    });
    return {
      previousHolderId: currentHolder?.id ?? null,
      nextHolderId: null,
      valuesByPlayerId: Object.fromEntries(
        state.players.map((player) => [player.id, calculateLongestTradeRoute(state, player.id)])
      )
    };
  }

  const lengths = state.players.map((player) => ({
    playerId: player.id,
    length: calculateLongestTradeRoute(state, player.id)
  }));
  const valuesByPlayerId = Object.fromEntries(lengths.map((entry) => [entry.playerId, entry.length]));
  lengths.sort((left, right) => right.length - left.length);
  const leader = lengths[0];
  const currentHolder = state.players.find((player) => player.hasLongestRoad) ?? null;

  if (!leader || leader.length < 5) {
    state.players.forEach((player) => {
      player.hasLongestRoad = false;
    });

    return {
      previousHolderId: currentHolder?.id ?? null,
      nextHolderId: null,
      valuesByPlayerId
    };
  }

  const leaders = lengths.filter((entry) => entry.length === leader.length);
  if (leaders.length === 1) {
    state.players.forEach((player) => {
      player.hasLongestRoad = player.id === leader.playerId;
    });

    return {
      previousHolderId: currentHolder?.id ?? null,
      nextHolderId: leader.playerId,
      valuesByPlayerId
    };
  }

  if (currentHolder && leaders.some((entry) => entry.playerId === currentHolder.id)) {
    state.players.forEach((player) => {
      player.hasLongestRoad = player.id === currentHolder.id;
    });

    return {
      previousHolderId: currentHolder.id,
      nextHolderId: currentHolder.id,
      valuesByPlayerId
    };
  }

  state.players.forEach((player) => {
    player.hasLongestRoad = false;
  });

  return {
    previousHolderId: currentHolder?.id ?? null,
    nextHolderId: null,
    valuesByPlayerId
  };
}

function appendLargestArmyEvents(state: GameState, update: AwardUpdateResult): void {
  if (update.previousHolderId === update.nextHolderId) {
    return;
  }

  if (update.previousHolderId) {
    appendEvent(state, {
      type: "largest_army_lost",
      byPlayerId: update.previousHolderId,
      payload: {
        nextPlayerId: update.nextHolderId,
        knightCount: update.valuesByPlayerId[update.previousHolderId] ?? 0,
        publicVictoryPoints: getPublicVictoryPoints(state, update.previousHolderId)
      }
    });
  }

  if (update.nextHolderId) {
    const player = getPlayer(state, update.nextHolderId);
    appendEvent(state, {
      type: "largest_army_awarded",
      byPlayerId: update.nextHolderId,
      payload: {
        previousPlayerId: update.previousHolderId,
        knightCount: update.valuesByPlayerId[update.nextHolderId] ?? 0,
        publicVictoryPoints: getPublicVictoryPoints(state, update.nextHolderId),
        vertexIds: [...player.settlements, ...player.cities]
      }
    });
  }
}

function appendLongestRoadEvents(state: GameState, update: AwardUpdateResult): void {
  if (update.previousHolderId === update.nextHolderId) {
    return;
  }

  if (update.previousHolderId) {
    appendEvent(state, {
      type: "longest_road_lost",
      byPlayerId: update.previousHolderId,
      payload: {
        nextPlayerId: update.nextHolderId,
        length: update.valuesByPlayerId[update.previousHolderId] ?? 0,
        publicVictoryPoints: getPublicVictoryPoints(state, update.previousHolderId)
      }
    });
  }

  if (update.nextHolderId) {
    const player = getPlayer(state, update.nextHolderId);
    appendEvent(state, {
      type: "longest_road_awarded",
      byPlayerId: update.nextHolderId,
      payload: {
        previousPlayerId: update.previousHolderId,
        length: update.valuesByPlayerId[update.nextHolderId] ?? 0,
        publicVictoryPoints: getPublicVictoryPoints(state, update.nextHolderId),
        edgeIds: [...player.roads, ...player.ships, ...player.warships]
      }
    });
  }
}

function maybeDeclareWinner(state: GameState): void {
  if (state.winnerId) {
    return;
  }
  if (state.phase === "special_build") {
    return;
  }

  if (state.gameConfig.scenarioId === "seafarers.cloth_for_catan" && state.phase === "turn_roll") {
    const depletedVillageCount = (state.board.sites ?? []).filter(
      (site) => site.type === "village" && site.clothSupply === 0
    ).length;
    if (depletedVillageCount >= 5) {
      const winningPlayer = [...state.players].sort((left, right) => {
        const pointDelta = getVictoryPoints(state, right.id) - getVictoryPoints(state, left.id);
        if (pointDelta !== 0) {
          return pointDelta;
        }
        return right.clothCount - left.clothCount;
      })[0];
      if (winningPlayer) {
        declareWinner(state, winningPlayer.id);
      }
      return;
    }
  }

  const currentPlayer = getCurrentPlayer(state);
  const currentVictoryPoints = getVictoryPoints(state, currentPlayer.id);
  if (state.gameConfig.scenarioId === "seafarers.wonders_of_catan") {
    const wonderProgress = getPlayerWonderProgress(state, currentPlayer.id);
    if (wonderProgress >= 4) {
      declareWinner(state, currentPlayer.id);
      return;
    }
    if (currentVictoryPoints >= getScenarioVictoryPointsToWin(state.gameConfig)) {
      const highestOtherWonderProgress = Math.max(
        0,
        ...state.players
          .filter((player) => player.id !== currentPlayer.id)
          .map((player) => getPlayerWonderProgress(state, player.id))
      );
      if (wonderProgress > highestOtherWonderProgress) {
        declareWinner(state, currentPlayer.id);
      }
    }
    return;
  }

  if (
    state.gameConfig.scenarioId === "seafarers.pirate_islands" &&
    currentVictoryPoints >= getScenarioVictoryPointsToWin(state.gameConfig) &&
    !playerHasCapturedOwnFortress(state, currentPlayer.id)
  ) {
    return;
  }

  if (currentVictoryPoints < getScenarioVictoryPointsToWin(state.gameConfig)) {
    return;
  }

  declareWinner(state, currentPlayer.id);
}

function createPlayerView(state: GameState, playerId: string, viewerId: string): PlayerView {
  const player = getPlayer(state, playerId);
  const isSelf = player.id === viewerId;
  const view: PlayerView = {
    id: player.id,
    username: player.username,
    color: player.color,
    seatIndex: player.seatIndex,
    connected: player.connected,
    disconnectDeadlineAt: player.disconnectDeadlineAt ?? null,
    resourceCount: totalResources(player.resources),
    developmentCardCount: player.developmentCards.length,
    publicVictoryPoints: getPublicVictoryPoints(state, player.id),
    roadsBuilt: player.roads.length,
    settlementsBuilt: player.settlements.length,
    citiesBuilt: player.cities.length,
    playedKnightCount: player.playedKnightCount,
    hasLongestRoad: player.hasLongestRoad,
    hasLargestArmy: player.hasLargestArmy,
    shipsBuilt: player.ships.length,
    warshipsBuilt: player.warships.length,
    specialVictoryPoints: player.specialVictoryPoints,
    clothCount: player.clothCount,
    harborTokenCount: player.harborTokens.length,
    wonderProgress: player.wonderProgress,
    routeLength: calculateLongestTradeRoute(state, player.id)
  };

  if (isSelf) {
    const hasRoadBuildingTarget =
      player.developmentCards.some((card) => card.type === "road_building") &&
      getLegalFreeRouteEdges(state, player.id).length > 0;
    view.resources = cloneResourceMap(player.resources);
    view.developmentCards = player.developmentCards.map((card) => {
      const blockedReason = getDevelopmentCardBlockedReason(state, player, card, hasRoadBuildingTarget);
      const developmentCard: DevelopmentCardView = {
        id: card.id,
        type: card.type,
        boughtOnTurn: card.boughtOnTurn,
        playable: blockedReason === null
      };
      if (blockedReason !== undefined) {
        developmentCard.blockedReason = blockedReason;
      }
      return developmentCard;
    });
    view.hiddenVictoryPoints = player.developmentCards.filter(
      (card) => card.type === "victory_point"
    ).length;
    view.totalVictoryPoints = getVictoryPoints(state, player.id);
    view.harborTokens = [...player.harborTokens];
  }

  return view;
}

function canPlayKnightDevelopmentCard(state: GameState, playerId: string): boolean {
  return (
    state.gameConfig.scenarioId !== "seafarers.pirate_islands" ||
    findConvertibleWarshipEdgeId(state, playerId) !== null
  );
}

function getDevelopmentCardBlockedReason(
  state: GameState,
  player: InternalPlayer,
  card: InternalDevelopmentCard,
  hasRoadBuildingTarget: boolean
): DevelopmentCardView["blockedReason"] {
  if (card.type === "victory_point") {
    return "passive";
  }
  if (card.boughtOnTurn >= state.turn) {
    return "fresh";
  }
  if (player.hasPlayedDevelopmentCardThisTurn) {
    return "turn_limit";
  }
  if (card.type === "road_building" && !hasRoadBuildingTarget) {
    return "no_road_target";
  }
  if (card.type === "knight" && !canPlayKnightDevelopmentCard(state, player.id)) {
    return "scenario";
  }
  return null;
}

function getAllowedMoves(state: GameState, playerId: string): AllowedMoves {
  if (state.phase === "scenario_setup") {
    return {
      canRoll: false,
      canBuyDevelopmentCard: false,
      canEndTurn: false,
      canCreateTradeOffer: false,
      canMaritimeTrade: false,
      initialSettlementVertexIds: [],
      initialRoadEdgeIds: [],
      initialRouteOptions: [],
      settlementVertexIds: [],
      cityVertexIds: [],
      roadEdgeIds: [],
      shipEdgeIds: [],
      movableShipEdgeIds: [],
      freeRoadEdgeIds: [],
      freeRouteOptions: [],
      robberMoveOptions: [],
      pirateMoveOptions: [],
      pirateStealTargetPlayerIds: [],
      pendingDiscardCount: 0,
      playableDevelopmentCards: [],
      maritimeRates: [],
      acceptableTradeOfferIds: [],
      declineableTradeOfferIds: [],
      withdrawableTradeOfferIds: [],
      goldResourceChoiceCount: 0,
      goldResourceChoiceSource: null,
      placeablePortVertexIds: [],
      wonderVertexIds: [],
      fortressVertexIds: []
    };
  }

  const isCurrentPlayer = getCurrentPlayer(state).id === playerId;
  const pendingDiscardCount = state.robberState?.pendingDiscardByPlayerId[playerId] ?? 0;
  const hasActivePendingDevelopmentEffect = !!state.pendingDevelopmentEffect;
  const hasPendingDevelopmentEffect = isCurrentPlayer && hasActivePendingDevelopmentEffect;
  const isBuildPhase = isBuildActionPhase(state.phase);
  const isDevelopmentPhase = isDevelopmentCardPhase(state.phase);
  const publicInitialSettlementVertexIds = getPublicInitialSettlementVertexIds(state);
  const activeGoldSelection = state.pendingGoldSelections[0] ?? null;
  const playerMayResolveGold = activeGoldSelection?.playerId === playerId;
  const goldLocksOtherActions = !!activeGoldSelection;
  const freeRoadEdgeIds =
    hasPendingDevelopmentEffect && state.pendingDevelopmentEffect?.type === "road_building"
      ? getLegalFreeRouteEdges(state, playerId)
      : [];

  return {
    canRoll:
      state.phase === "turn_roll" &&
      isCurrentPlayer &&
      !hasActivePendingDevelopmentEffect &&
      !goldLocksOtherActions,
    canBuyDevelopmentCard:
      isBuildPhase &&
      isCurrentPlayer &&
      !hasActivePendingDevelopmentEffect &&
      !goldLocksOtherActions &&
      state.developmentDeck.length > 0 &&
      hasResources(getPlayer(state, playerId).resources, BUILD_COSTS.development),
    canEndTurn: isBuildPhase && isCurrentPlayer && !hasActivePendingDevelopmentEffect && !goldLocksOtherActions,
    canCreateTradeOffer:
      state.phase === "turn_action" && !hasActivePendingDevelopmentEffect && !goldLocksOtherActions,
    canMaritimeTrade:
      isCurrentPlayer && !hasActivePendingDevelopmentEffect && !goldLocksOtherActions && canUseMaritimeTrade(state),
    initialSettlementVertexIds: isCurrentPlayer ? publicInitialSettlementVertexIds : [],
    initialRoadEdgeIds:
      isCurrentPlayer &&
      !!state.setupState &&
      state.setupState.stage === "road" &&
      !!state.setupState.pendingSettlementVertexId
        ? getInitialRoadEdges(state, state.setupState.pendingSettlementVertexId)
        : [],
    initialRouteOptions:
      isCurrentPlayer &&
      !!state.setupState &&
      state.setupState.stage === "road" &&
      !!state.setupState.pendingSettlementVertexId
        ? getInitialRouteOptions(state, state.setupState.pendingSettlementVertexId)
        : [],
    settlementVertexIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getLegalSettlementVertices(state, playerId)
        : [],
    cityVertexIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getUpgradeableCityVertices(state, playerId)
        : [],
    roadEdgeIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getLegalRoadEdges(state, playerId)
        : [],
    shipEdgeIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getLegalShipEdges(state, playerId)
        : [],
    movableShipEdgeIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getMovableShipEdgeIds(state, playerId)
        : [],
    freeRoadEdgeIds,
    freeRouteOptions:
      hasPendingDevelopmentEffect && state.pendingDevelopmentEffect?.type === "road_building"
        ? getLegalFreeRouteOptions(state, playerId)
        : [],
    robberMoveOptions:
      isCurrentPlayer &&
      state.phase === "robber_interrupt" &&
      !hasActivePendingDevelopmentEffect &&
      !goldLocksOtherActions &&
      pendingDiscardCount === 0 &&
      !hasPendingDiscard(state)
        ? getRobberMoveOptions(state, playerId)
        : [],
    pirateMoveOptions:
      isCurrentPlayer &&
      state.phase === "robber_interrupt" &&
      !hasActivePendingDevelopmentEffect &&
      !goldLocksOtherActions &&
      pendingDiscardCount === 0 &&
      !hasPendingDiscard(state)
        ? getPirateMoveOptions(state, playerId)
        : [],
    pirateStealTargetPlayerIds:
      isCurrentPlayer &&
      state.phase === "robber_interrupt" &&
      !hasActivePendingDevelopmentEffect &&
      !goldLocksOtherActions &&
      pendingDiscardCount === 0 &&
      !hasPendingDiscard(state)
        ? getPirateIslandsSevenStealTargets(state, playerId)
        : [],
    pendingDiscardCount,
    playableDevelopmentCards:
      isCurrentPlayer && isDevelopmentPhase && !goldLocksOtherActions
        ? getPlayableDevelopmentCards(state, playerId)
        : [],
    maritimeRates: RESOURCES.map((resource) => ({
      resource,
      ratio: getMaritimeRate(state, playerId, resource)
    })),
    acceptableTradeOfferIds: hasActivePendingDevelopmentEffect || goldLocksOtherActions
      ? []
      : state.tradeOffers
      .filter((offer) => canPlayerAcceptTradeOffer(state, playerId, offer))
      .map((offer) => offer.id),
    declineableTradeOfferIds: hasActivePendingDevelopmentEffect || goldLocksOtherActions
      ? []
      : state.tradeOffers
      .filter((offer) => canPlayerDeclineTradeOffer(state, playerId, offer))
      .map((offer) => offer.id),
    withdrawableTradeOfferIds: hasActivePendingDevelopmentEffect || goldLocksOtherActions
      ? []
      : state.tradeOffers
      .filter((offer) => canPlayerWithdrawTradeOffer(playerId, offer))
      .map((offer) => offer.id),
    goldResourceChoiceCount: playerMayResolveGold ? activeGoldSelection.count : 0,
    goldResourceChoiceSource: playerMayResolveGold ? activeGoldSelection.source : null,
    placeablePortVertexIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getPlaceablePortVertices(state, playerId)
        : [],
    wonderVertexIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getWonderActionVertices(state, playerId)
        : [],
    fortressVertexIds:
      isCurrentPlayer && isBuildPhase && !hasPendingDevelopmentEffect && !goldLocksOtherActions
        ? getAttackableFortressVertices(state, playerId)
        : []
  };
}

function getPublicInitialSettlementVertexIds(state: GameState): string[] {
  if (!state.setupState || state.setupState.stage !== "settlement") {
    return [];
  }

  if (state.phase !== "setup_forward" && state.phase !== "setup_reverse") {
    return [];
  }

  return getInitialSettlementVertices(state);
}

function getRobberDiscardStatusView(state: GameState): MatchSnapshot["robberDiscardStatus"] {
  if (!state.robberState) {
    return [];
  }

  return state.players
    .map((player) => {
      const requiredCount = state.robberState?.pendingDiscardByPlayerId[player.id];
      if (requiredCount === undefined) {
        return null;
      }

      return {
        playerId: player.id,
        requiredCount,
        done: requiredCount === 0
      };
    })
    .filter((entry): entry is MatchSnapshot["robberDiscardStatus"][number] => !!entry);
}

function getInitialSettlementVertices(state: GameState): string[] {
  return state.board.vertices
    .filter(
      (vertex) =>
        isSettlementVertexOpen(state, vertex.id) &&
        isInitialSettlementVertexAllowed(state, vertex.id)
    )
    .map((vertex) => vertex.id);
}

function getInitialRoadEdges(state: GameState, settlementVertexId: string): string[] {
  return getUniqueRouteEdgeIds(getInitialRouteOptions(state, settlementVertexId));
}

function getInitialRouteOptions(state: GameState, settlementVertexId: string): RoutePlacementOption[] {
  return state.board.edges.flatMap((edge) => {
    if (edge.ownerId || !edge.vertexIds.includes(settlementVertexId)) {
      return [];
    }

    const routeTypes: RouteBuildType[] = [];
    if (edge.roadAllowed) {
      routeTypes.push("road");
    }
    if (canPlaceShipOnEdge(state, edge.id)) {
      routeTypes.push("ship");
    }

    return routeTypes.map((routeType) => ({
      edgeId: edge.id,
      routeType
    }));
  });
}

function getLegalRoadEdges(state: GameState, playerId: string): string[] {
  return state.board.edges
    .filter((edge) => {
      try {
        ensureRoadPlacement(state, playerId, edge.id);
        return true;
      } catch {
        return false;
      }
    })
    .map((edge) => edge.id);
}

function getLegalShipEdges(state: GameState, playerId: string): string[] {
  return state.board.edges
    .filter((edge) => {
      try {
        ensureShipPlacement(state, playerId, edge.id);
        return true;
      } catch {
        return false;
      }
    })
    .map((edge) => edge.id);
}

function getLegalFreeRouteEdges(state: GameState, playerId: string): string[] {
  return getUniqueRouteEdgeIds(getLegalFreeRouteOptions(state, playerId));
}

function getLegalFreeRouteOptions(state: GameState, playerId: string): RoutePlacementOption[] {
  return [
    ...getLegalRoadEdges(state, playerId).map((edgeId) => ({
      edgeId,
      routeType: "road" as const
    })),
    ...getLegalShipEdges(state, playerId).map((edgeId) => ({
      edgeId,
      routeType: "ship" as const
    }))
  ];
}

function getLegalSettlementVertices(state: GameState, playerId: string): string[] {
  return state.board.vertices
    .filter((vertex) => {
      try {
        ensureSettlementPlacement(state, playerId, vertex.id);
        return true;
      } catch {
        return false;
      }
    })
    .map((vertex) => vertex.id);
}

function getUpgradeableCityVertices(state: GameState, playerId: string): string[] {
  return getPlayer(state, playerId).settlements.filter((vertexId) => {
    const vertex = getVertex(state, vertexId);
    return vertex.building?.ownerId === playerId && vertex.building.type === "settlement";
  });
}

function getRobberMoveOptions(state: GameState, playerId: string) {
  if (!isRobberEnabled(state) || state.robberState?.mode === "pirate_islands_seven") {
    return [];
  }

  const currentRobberTileId = state.board.tiles.find((tile) => tile.robber)?.id ?? "";
  return state.board.tiles
    .filter(
      (tile) =>
        tile.id !== currentRobberTileId &&
        tile.terrain !== "sea" &&
        canRobberOccupyTile(state, tile.id)
    )
    .map((tile) => ({
      tileId: tile.id,
      targetPlayerIds: getRobberStealTargets(state, playerId, tile.id)
    }));
}

function getPirateMoveOptions(state: GameState, playerId: string) {
  if (
    !isPirateEnabled(state) ||
    !canPlayerMovePirate(state, playerId) ||
    state.robberState?.mode === "pirate_islands_seven"
  ) {
    return [];
  }

  const currentPirateTileId =
    state.board.tiles.find((tile) => tile.occupant === "pirate")?.id ?? "";
  return state.board.tiles
    .filter((tile) => tile.id !== currentPirateTileId && tile.terrain === "sea")
    .map((tile) => {
      const targetPlayerIds = getPirateStealTargets(state, playerId, tile.id);
      return {
        tileId: tile.id,
        targetPlayerIds,
        moveType: "pirate" as const,
        ...(targetPlayerIds.length === 1
          ? {
              pirateStealTypes: getPirateStealTypesForTarget(state, targetPlayerIds[0]!)
            }
          : {})
      };
    });
}

function getPlayableDevelopmentCards(state: GameState, playerId: string): DevelopmentCardType[] {
  const player = getPlayer(state, playerId);
  if (player.hasPlayedDevelopmentCardThisTurn) {
    return [];
  }

  const hasRoadBuildingTarget = getLegalFreeRouteEdges(state, playerId).length > 0;
  const types = new Set<DevelopmentCardType>();
  for (const card of player.developmentCards) {
    if (getDevelopmentCardBlockedReason(state, player, card, hasRoadBuildingTarget) !== null) {
      continue;
    }
    types.add(card.type);
  }
  return [...types];
}

function getPlaceablePortVertices(state: GameState, playerId: string): string[] {
  const player = getPlayer(state, playerId);
  if (player.harborTokens.length === 0) {
    return [];
  }

  return [...player.settlements, ...player.cities].filter((vertexId) => {
    const vertex = getVertex(state, vertexId);
    if (vertex.coastal !== true || vertex.portType !== null) {
      return false;
    }
    if (state.gameConfig.scenarioId !== "seafarers.forgotten_tribe") {
      return true;
    }
    return vertex.adjacentVertexIds.every((adjacentVertexId) => getVertex(state, adjacentVertexId).portType === null);
  });
}

function getWonderActionVertices(state: GameState, playerId: string): string[] {
  return (state.board.sites ?? [])
    .filter((site) => site.type === "wonder")
    .filter((site) => {
      const vertex = getVertex(state, site.vertexId);
      if (!site.ownerId) {
        return (
          vertex.building?.ownerId === playerId &&
          !playerOwnsWonder(state, playerId) &&
          meetsWonderRequirement(state, playerId, site)
        );
      }
      return (
        site.ownerId === playerId &&
        (site.progress ?? 0) < 4 &&
        hasResources(getPlayer(state, playerId).resources, site.buildCost)
      );
    })
    .map((site) => site.vertexId);
}

function getAttackableFortressVertices(state: GameState, playerId: string): string[] {
  const player = getPlayer(state, playerId);
  return (state.board.sites ?? [])
    .filter(
      (site) =>
        site.type === "fortress" &&
        site.ownerId !== playerId &&
        site.fortressColor === player.color &&
        !site.captured
    )
    .filter((site) => getPirateFortressAssaultRoute(state, playerId, site.vertexId) !== null)
    .map((site) => site.vertexId);
}

function getMaritimeRate(state: GameState, playerId: string, resource: Resource): number {
  let ratio = 4;
  const player = getPlayer(state, playerId);
  for (const vertexId of [...player.settlements, ...player.cities]) {
    const portType = getVertex(state, vertexId).portType;
    if (portType === "generic") {
      ratio = Math.min(ratio, 3);
    }
    if (portType === resource) {
      ratio = Math.min(ratio, 2);
    }
  }
  return ratio;
}

function isBuildActionPhase(phase: MatchPhase): phase is "turn_action" | "special_build" | "paired_player_action" {
  return phase === "turn_action" || phase === "special_build" || phase === "paired_player_action";
}

function isDevelopmentCardPhase(phase: MatchPhase): phase is "turn_roll" | "turn_action" | "paired_player_action" {
  return phase === "turn_roll" || phase === "turn_action" || phase === "paired_player_action";
}

function canUseMaritimeTrade(state: GameState): boolean {
  return state.phase === "turn_action" || state.phase === "paired_player_action";
}

function usesPairedPlayersTurnRule(state: GameState): boolean {
  return state.gameConfig.turnRule === "paired_players";
}

function usesSpecialBuildTurnRule(state: GameState): boolean {
  return state.gameConfig.turnRule === "special_build_phase";
}

function getNextPlayerIndex(state: GameState, playerIndex: number, offset = 1): number {
  return (playerIndex + offset) % state.players.length;
}

function getPairedPlayerIndex(state: GameState): number {
  return getNextPlayerIndex(state, state.turnContext.primaryPlayerIndex, Math.min(3, state.players.length - 1));
}

function ensureRoadPlacement(state: GameState, playerId: string, edgeId: string): void {
  const edge = getEdge(state, edgeId);
  if (edge.ownerId) {
    throw new GameRuleError("game.road_occupied");
  }
  if (!edge.roadAllowed) {
    throw new GameRuleError("game.road_must_connect");
  }

  const connected = edge.vertexIds.some((vertexId) => {
    const vertex = getVertex(state, vertexId);
    if (vertex.building?.ownerId === playerId) {
      return true;
    }
    if (vertex.building && vertex.building.ownerId !== playerId) {
      return false;
    }
    return vertex.edgeIds.some((candidateEdgeId) => {
      if (candidateEdgeId === edgeId) {
        return false;
      }
      const candidateEdge = getEdge(state, candidateEdgeId);
      return (
        candidateEdge.ownerId === playerId &&
        (candidateEdge.routeType === "road" || candidateEdge.routeType === null)
      );
    });
  });

  if (!connected) {
    throw new GameRuleError("game.road_must_connect");
  }
}

function ensureShipPlacement(state: GameState, playerId: string, edgeId: string): void {
  const edge = getEdge(state, edgeId);
  if (edge.ownerId) {
    throw new GameRuleError("game.road_occupied");
  }
  if (!canPlaceShipOnEdge(state, edgeId)) {
    throw new GameRuleError("game.ship_must_connect");
  }

  const connected = edge.vertexIds.some((vertexId) => {
    const vertex = getVertex(state, vertexId);
    if (vertex.building?.ownerId === playerId) {
      return true;
    }
    if (vertex.building && vertex.building.ownerId !== playerId) {
      return false;
    }
    return vertex.edgeIds.some((candidateEdgeId) => {
      if (candidateEdgeId === edgeId) {
        return false;
      }
      const candidateEdge = getEdge(state, candidateEdgeId);
      return (
        candidateEdge.ownerId === playerId &&
        (candidateEdge.routeType === "ship" || candidateEdge.routeType === "warship")
      );
    });
  });

  if (!connected) {
    throw new GameRuleError("game.ship_must_connect");
  }
  if (
    state.gameConfig.scenarioId === "seafarers.pirate_islands" &&
    !validatePirateIslandsRelevantRoute(state, playerId, edgeId)
  ) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
}

function canPlaceShipOnEdge(state: GameState, edgeId: string): boolean {
  const edge = getEdge(state, edgeId);
  return edge.shipAllowed === true && !edge.blockedByPirate;
}

function getUniqueRouteEdgeIds(options: RoutePlacementOption[]): string[] {
  return [...new Set(options.map((option) => option.edgeId))];
}

function resolveRouteBuildType(
  options: RoutePlacementOption[],
  requestedRouteType?: RouteBuildType
): RouteBuildType {
  const routeTypes = [...new Set(options.map((option) => option.routeType))];
  if (requestedRouteType) {
    if (!routeTypes.includes(requestedRouteType)) {
      throw new GameRuleError("game.route_type_invalid");
    }
    return requestedRouteType;
  }
  if (routeTypes.length === 1) {
    return routeTypes[0]!;
  }
  throw new GameRuleError("game.route_type_required");
}

function ensureSettlementPlacement(state: GameState, playerId: string, vertexId: string): void {
  if (!isSettlementVertexOpen(state, vertexId, playerId)) {
    throw new GameRuleError("game.intersection_occupied");
  }

  if (state.gameConfig.scenarioId === "seafarers.forgotten_tribe" && !vertexHasNumberedTile(state, vertexId)) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
  if (state.gameConfig.scenarioId === "seafarers.cloth_for_catan" && isVillageIslandVertex(state, vertexId)) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
  if (
    state.gameConfig.scenarioId === "seafarers.pirate_islands" &&
    !isPirateIslandsSettlementVertexAllowed(state, playerId, vertexId)
  ) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }

  const vertex = getVertex(state, vertexId);
  if (!vertex.edgeIds.some((edgeId) => getEdge(state, edgeId).ownerId === playerId)) {
    throw new GameRuleError("game.settlement_requires_road");
  }
}

function isSettlementVertexOpen(state: GameState, vertexId: string, playerId?: string): boolean {
  const vertex = getVertex(state, vertexId);
  if (vertex.building) {
    return false;
  }
  if (vertex.site && vertex.site.type !== "wonder") {
    if (vertex.site.type !== "landing") {
      return false;
    }
    if (state.gameConfig.scenarioId !== "seafarers.pirate_islands" || !playerId) {
      return false;
    }
    if (vertex.site.beachheadColor !== getPlayer(state, playerId).color) {
      return false;
    }
  }

  return vertex.edgeIds.every((edgeId) => {
    const edge = getEdge(state, edgeId);
    const neighborId = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    return !getVertex(state, neighborId).building;
  });
}

function playDevelopmentCard(
  state: GameState,
  playerId: string,
  type: DevelopmentCardType
): void {
  const player = getPlayer(state, playerId);
  if (player.hasPlayedDevelopmentCardThisTurn) {
    throw new GameRuleError("game.one_development_per_turn");
  }

  const cardIndex = player.developmentCards.findIndex(
    (card) => card.type === type && card.boughtOnTurn < state.turn
  );
  if (cardIndex === -1) {
    throw new GameRuleError("game.development_not_playable");
  }

  player.developmentCards.splice(cardIndex, 1);
  player.hasPlayedDevelopmentCardThisTurn = true;
}

function payCost(state: GameState, playerId: string, cost: Partial<ResourceMap>): void {
  const player = getPlayer(state, playerId);
  if (!hasResources(player.resources, cost)) {
    throw new GameRuleError("game.resources_insufficient");
  }

  player.resources = subtractResources(player.resources, cost);
  state.bank = addResources(state.bank, cost);
}

function stealRandomResource(state: GameState, thiefId: string, victimId: string): void {
  const victim = getPlayer(state, victimId);
  const pool = RESOURCES.flatMap((resource) =>
    Array.from({ length: victim.resources[resource] }, () => resource)
  );
  if (!pool.length) {
    return;
  }

  const rng = new SeededRandom(state.randomState);
  const resource = pool[Math.floor(rng.next() * pool.length)]!;
  state.randomState = rng.state;

  const delta = createEmptyResourceMap();
  delta[resource] = 1;
  victim.resources = subtractResources(victim.resources, delta);
  getPlayer(state, thiefId).resources = addResources(getPlayer(state, thiefId).resources, delta);
}

function getRobberStealTargets(state: GameState, playerId: string, tileId: string): string[] {
  const targets = new Set<string>();
  for (const vertexId of getTile(state, tileId).vertexIds) {
    const vertex = getVertex(state, vertexId);
    if (vertex.building && vertex.building.ownerId !== playerId) {
      const player = getPlayer(state, vertex.building.ownerId);
      if (totalResources(player.resources) > 0) {
        targets.add(player.id);
      }
    }
  }
  return [...targets];
}

function createDevelopmentDeck(
  rng: SeededRandom,
  gameConfig: GameConfig,
  playerCount: number
): InternalDevelopmentCard[] {
  const deck: InternalDevelopmentCard[] = [];
  let index = 0;
  const deckCounts = {
    ...DEVELOPMENT_DECK_COUNTS_BY_BOARD_SIZE[gameConfig.boardSize]
  };
  if (gameConfig.scenarioId === "seafarers.pirate_islands") {
    if (playerCount === 3) {
      deckCounts.victory_point = 0;
    } else if (playerCount === 4) {
      deckCounts.knight += deckCounts.victory_point;
      deckCounts.victory_point = 0;
    }
  }
  for (const type of DEVELOPMENT_CARD_TYPES) {
    for (let count = 0; count < deckCounts[type]; count += 1) {
      deck.push({
        id: `dev-${index}`,
        type,
        boughtOnTurn: 0
      });
      index += 1;
    }
  }
  return rng.shuffle(deck);
}

function nextDie(state: GameState): number {
  const rng = new SeededRandom(state.randomState);
  const value = rng.nextInt(1, 6);
  state.randomState = rng.state;
  return value;
}

function seatedPlayersColorKey(playerCount: number): 3 | 4 {
  return playerCount === 3 ? 3 : 4;
}

function rotatePlayers<T>(players: readonly T[], startIndex: number): T[] {
  if (!players.length) {
    return [];
  }

  const offset = ((startIndex % players.length) + players.length) % players.length;
  return [...players.slice(offset), ...players.slice(0, offset)];
}

function applyBeginnerSetup(state: GameState): void {
  for (const player of state.players) {
    const placement = BEGINNER_PLACEMENTS.find((entry) => entry.color === player.color);
    if (!placement) {
      continue;
    }

    placeBuilding(state, player.id, placement.firstSettlementVertexId, "settlement");
    placeRoad(state, player.id, placement.firstRoadEdgeId);
    placeBuilding(state, player.id, placement.secondSettlementVertexId, "settlement");
    placeRoad(state, player.id, placement.secondRoadEdgeId);
    grantInitialResources(state, player.id, placement.secondSettlementVertexId);
  }

  appendEvent(state, {
    type: "beginner_setup_applied",
    payload: {
      players: state.players.map((player) => ({
        id: player.id,
        color: player.color
      }))
    }
  });
}

function calculateLongestTradeRoute(state: GameState, playerId: string): number {
  const routeIds = getOwnedRouteIds(state, playerId);
  let longest = 0;
  for (const routeId of routeIds) {
    const edge = getEdge(state, routeId);
    longest = Math.max(
      longest,
      dfsTradeRoute(state, playerId, edge, edge.vertexIds[0], new Set([edge.id])),
      dfsTradeRoute(state, playerId, edge, edge.vertexIds[1], new Set([edge.id]))
    );
  }
  return longest;
}

function dfsTradeRoute(
  state: GameState,
  playerId: string,
  incomingEdge: EdgeView,
  vertexId: string,
  usedEdges: Set<string>
): number {
  const vertex = getVertex(state, vertexId);
  if (vertex.building && vertex.building.ownerId !== playerId) {
    return usedEdges.size;
  }

  let best = usedEdges.size;
  for (const edgeId of vertex.edgeIds) {
    if (usedEdges.has(edgeId)) {
      continue;
    }
    const edge = getEdge(state, edgeId);
    if (edge.ownerId !== playerId) {
      continue;
    }
    if (!canTraverseRouteTransition(vertex, incomingEdge, edge, playerId)) {
      continue;
    }

    const nextVertexId = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    const nextUsedEdges = new Set(usedEdges);
    nextUsedEdges.add(edge.id);
    best = Math.max(best, dfsTradeRoute(state, playerId, edge, nextVertexId, nextUsedEdges));
  }

  return best;
}

function getPublicVictoryPoints(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  return (
    player.settlements.length +
    player.cities.length * 2 +
    (player.hasLargestArmy ? 2 : 0) +
    (player.hasLongestRoad ? 2 : 0) +
    player.specialVictoryPoints +
    (state.gameConfig.scenarioId === "seafarers.cloth_for_catan" ? Math.floor(player.clothCount / 2) : 0) +
    player.wonderProgress
  );
}

function getOwnedRouteIds(state: GameState, playerId: string): string[] {
  const player = getPlayer(state, playerId);
  return [...player.roads, ...player.ships, ...player.warships];
}

function canTraverseRouteTransition(
  vertex: VertexView,
  left: EdgeView,
  right: EdgeView,
  playerId: string
): boolean {
  const leftFamily = getRouteFamily(left);
  const rightFamily = getRouteFamily(right);
  if (leftFamily === rightFamily) {
    return true;
  }

  return vertex.building?.ownerId === playerId;
}

function getRouteFamily(edge: EdgeView): "road" | "ship" {
  return edge.routeType === "ship" || edge.routeType === "warship" ? "ship" : "road";
}

function getMovableShipEdgeIds(state: GameState, playerId: string): string[] {
  const movableEdgeIds = new Set<string>();
  const visitedEdgeIds = new Set<string>();

  for (const edgeId of getOwnedShipEdgeIds(state, playerId)) {
    if (visitedEdgeIds.has(edgeId)) {
      continue;
    }

    const shipComponent = collectConnectedShipEdges(state, playerId, edgeId);
    for (const componentEdgeId of shipComponent) {
      visitedEdgeIds.add(componentEdgeId);
    }

    if (isShipComponentClosedByVillageTrade(state, playerId, shipComponent)) {
      continue;
    }

    const topology = createShipComponentTopology(state, shipComponent);
    for (const vertexId of getOpenShipRouteEndVertexIds(state, topology.vertexDegreeById)) {
      const endpointEdgeId = topology.edgeIdsByVertexId.get(vertexId)?.[0] ?? null;
      if (!endpointEdgeId) {
        continue;
      }

      const edge = getEdge(state, endpointEdgeId);
      if (edge.placedOnTurn === state.turn || edge.blockedByPirate) {
        continue;
      }
      movableEdgeIds.add(endpointEdgeId);
    }
  }

  return [...movableEdgeIds];
}

function getOwnedShipEdgeIds(state: GameState, playerId: string): string[] {
  const player = getPlayer(state, playerId);
  return [...player.ships, ...player.warships];
}

function createShipComponentTopology(
  state: GameState,
  edgeIds: ReadonlySet<string>
): {
  vertexDegreeById: Map<string, number>;
  edgeIdsByVertexId: Map<string, string[]>;
} {
  const vertexDegreeById = new Map<string, number>();
  const edgeIdsByVertexId = new Map<string, string[]>();

  for (const edgeId of edgeIds) {
    const edge = getEdge(state, edgeId);
    for (const vertexId of edge.vertexIds) {
      vertexDegreeById.set(vertexId, (vertexDegreeById.get(vertexId) ?? 0) + 1);
      const entry = edgeIdsByVertexId.get(vertexId) ?? [];
      entry.push(edgeId);
      edgeIdsByVertexId.set(vertexId, entry);
    }
  }

  return {
    vertexDegreeById,
    edgeIdsByVertexId
  };
}

function getOpenShipRouteEndVertexIds(
  state: GameState,
  vertexDegreeById: ReadonlyMap<string, number>
): string[] {
  const openEndVertexIds: string[] = [];

  for (const [vertexId, degree] of vertexDegreeById.entries()) {
    if (degree !== 1) {
      continue;
    }
    if (getVertex(state, vertexId).building) {
      continue;
    }
    openEndVertexIds.push(vertexId);
  }

  return openEndVertexIds;
}

function updatePirateBlocks(state: GameState): void {
  const pirateTileId = state.board.tiles.find((tile) => tile.occupant === "pirate")?.id ?? null;
  for (const edge of state.board.edges) {
    edge.blockedByPirate = pirateTileId ? edge.tileIds.includes(pirateTileId) : false;
  }
}

function revealAdjacentFogTiles(state: GameState, playerId: string, edgeId: string): void {
  const edge = getEdge(state, edgeId);
  let revealedAnyTile = false;
  for (const tileId of edge.tileIds) {
    const tile = getTile(state, tileId);
    if (tile.kind !== "fog" || !tile.hidden) {
      continue;
    }

    revealedAnyTile = true;
    let revealEntry: FogRevealEntry | null = null;
    if (state.scenarioState?.type === "fog_islands") {
      if (state.scenarioState.hiddenTerrainStack && state.scenarioState.hiddenTokenStack) {
        const terrain = state.scenarioState.hiddenTerrainStack.shift() ?? null;
        if (terrain === null) {
          throw new Error("Fog Islands hidden hex stack exhausted.");
        }
        const token =
          terrain !== "sea" && terrain !== "desert"
            ? (state.scenarioState.hiddenTokenStack.shift() ?? null)
            : null;
        if (terrain !== "sea" && terrain !== "desert" && token === null) {
          throw new Error("Fog Islands hidden token stack exhausted.");
        }
        revealEntry = {
          terrain,
          token,
          robber: false,
          occupant: null
        };
      } else {
        revealEntry = state.scenarioState.revealEntriesByTileId[tile.id] ?? null;
        delete state.scenarioState.revealEntriesByTileId[tile.id];
      }
    }
    const revealedTerrain = revealEntry?.terrain ?? tile.terrain ?? "sea";
    tile.terrain = revealedTerrain;
    tile.token = revealEntry?.token ?? tile.token;
    tile.robber = revealEntry?.robber ?? false;
    tile.occupant = revealEntry?.occupant ?? null;
    tile.hidden = false;
    tile.discovered = true;
    tile.kind = revealedTerrain === "sea" ? "sea" : "land";
    tile.resource = isResourceTerrain(revealedTerrain) ? revealedTerrain : "desert";
    if (revealedTerrain !== "sea" && revealedTerrain !== "desert" && revealedTerrain !== "gold") {
      const reward = createEmptyResourceMap();
      reward[revealedTerrain] = 1;
      if (hasResources(state.bank, reward)) {
        state.bank = subtractResources(state.bank, reward);
        getPlayer(state, playerId).resources = addResources(getPlayer(state, playerId).resources, reward);
      }
    } else if (revealedTerrain === "gold") {
      state.pendingGoldSelections.push({ playerId, count: 1, source: "gold_tile" });
    }
  }

  if (revealedAnyTile) {
    finalizeSeafarersBoard(state.board.tiles, state.board.vertices, state.board.edges);
    if (state.gameConfig.scenarioId === "seafarers.fog_islands") {
      syncScenarioFeatures(state);
    }
    updatePirateBlocks(state);
  }
}

function resolveScenarioEdgeRewards(state: GameState, playerId: string, edgeId: string): void {
  claimScenarioEdgeMarkers(state, playerId, edgeId);
  maybeEstablishVillageTrade(state, playerId, edgeId);
}

function claimScenarioEdgeMarkers(state: GameState, playerId: string, edgeId: string): void {
  for (const marker of state.board.scenarioMarkers ?? []) {
    if (!("edgeId" in marker) || marker.edgeId !== edgeId || marker.claimedByPlayerId) {
      continue;
    }

    marker.claimedByPlayerId = playerId;
    const player = getPlayer(state, playerId);
    switch (marker.type) {
      case "forgotten_tribe_vp":
        player.specialVictoryPoints += 1;
        break;
      case "forgotten_tribe_development": {
        const card = state.developmentDeck.shift();
        if (card) {
          card.boughtOnTurn = state.turn;
          player.developmentCards.push(card);
        }
        break;
      }
      case "forgotten_tribe_port":
        player.harborTokens.push(marker.portType);
        break;
      default:
        break;
    }

    appendEvent(state, {
      type: "scenario_reward_claimed",
      byPlayerId: playerId,
      payload: { rewardType: marker.type, markerId: marker.id }
    });
  }
}

function maybeEstablishVillageTrade(state: GameState, playerId: string, edgeId: string): void {
  if (state.gameConfig.scenarioId !== "seafarers.cloth_for_catan") {
    return;
  }

  const edge = getEdge(state, edgeId);
  if (edge.routeType !== "ship" && edge.routeType !== "warship") {
    return;
  }

  const candidateSites = (state.board.sites ?? []).filter(
    (entry): entry is Extract<BoardSiteView, { type: "village" }> =>
      entry.type === "village" && (entry.edgeId === edgeId || edge.vertexIds.includes(entry.vertexId))
  );
  for (const site of candidateSites) {
    if (site.clothSupply <= 0) {
      continue;
    }
    if (hasVillageShipConnection(state, playerId, site, edgeId)) {
      continue;
    }

    getPlayer(state, playerId).clothCount += 1;
    site.clothSupply = Math.max(0, site.clothSupply - 1);
    syncVertexSite(state, site);
    appendEvent(state, {
      type: "scenario_reward_claimed",
      byPlayerId: playerId,
      payload: { rewardType: "cloth_village", markerId: site.id }
    });
  }
}

function awardVillageClothForRoll(state: GameState, roll: number): void {
  if (state.gameConfig.scenarioId !== "seafarers.cloth_for_catan") {
    return;
  }

  for (const site of state.board.sites ?? []) {
    if (site.type !== "village" || site.numberToken !== roll || site.clothSupply <= 0) {
      continue;
    }
    const connectedPlayerIds = getVillageConnectedPlayerIds(state, site);
    if (!connectedPlayerIds.length) {
      continue;
    }

    const villageClothGranted = Math.min(site.clothSupply, connectedPlayerIds.length);
    const generalClothGranted = Math.min(
      getGeneralClothSupply(state),
      Math.max(0, connectedPlayerIds.length - villageClothGranted)
    );
    const totalClothGranted = villageClothGranted + generalClothGranted;
    if (totalClothGranted <= 0) {
      continue;
    }

    for (const playerId of connectedPlayerIds.slice(0, totalClothGranted)) {
      getPlayer(state, playerId).clothCount += 1;
    }
    site.clothSupply = Math.max(0, site.clothSupply - villageClothGranted);
    syncVertexSite(state, site);
  }
}

function getGeneralClothSupply(state: GameState): number {
  if (state.gameConfig.scenarioId !== "seafarers.cloth_for_catan") {
    return 0;
  }

  const totalVillageCloth = (state.board.sites ?? []).reduce((sum, site) => {
    return site.type === "village" ? sum + site.clothSupply : sum;
  }, 0);
  const totalPlayerCloth = state.players.reduce((sum, player) => sum + player.clothCount, 0);
  return Math.max(
    0,
    CLOTH_TOKEN_TOTAL_BY_BOARD_SIZE[state.gameConfig.boardSize] - totalVillageCloth - totalPlayerCloth
  );
}

function getVillageConnectedPlayerIds(
  state: GameState,
  site: Extract<BoardSiteView, { type: "village" }>
): string[] {
  if (site.edgeId) {
    const edge = getEdge(state, site.edgeId);
    if (!edge.ownerId || (edge.routeType !== "ship" && edge.routeType !== "warship")) {
      return [];
    }
    return [edge.ownerId];
  }

  const vertex = getVertex(state, site.vertexId);
  const connected = new Set<string>();
  for (const edgeId of vertex.edgeIds) {
    const edge = getEdge(state, edgeId);
    if (!edge.ownerId || (edge.routeType !== "ship" && edge.routeType !== "warship")) {
      continue;
    }
    connected.add(edge.ownerId);
  }
  return [...connected];
}

function hasVillageShipConnection(
  state: GameState,
  playerId: string,
  site: Extract<BoardSiteView, { type: "village" }>,
  excludeEdgeId: string
): boolean {
  if (site.edgeId) {
    if (site.edgeId === excludeEdgeId) {
      return false;
    }
    const edge = getEdge(state, site.edgeId);
    return edge.ownerId === playerId && (edge.routeType === "ship" || edge.routeType === "warship");
  }

  return getVertex(state, site.vertexId).edgeIds.some((edgeId) => {
    if (edgeId === excludeEdgeId) {
      return false;
    }
    const edge = getEdge(state, edgeId);
    return (
      edge.ownerId === playerId &&
      (edge.routeType === "ship" || edge.routeType === "warship")
    );
  });
}

function capturePlayerHomeIslands(state: GameState): void {
  for (const player of state.players) {
    player.homeIslandIds = [...new Set(
      [...player.settlements, ...player.cities]
        .map((vertexId) => getVertex(state, vertexId).islandId)
        .filter((value): value is string => !!value)
    )];
    player.homeRegionIds = [...new Set(
      [...player.settlements, ...player.cities]
        .map((vertexId) => getScenarioRewardRegionId(state, vertexId))
        .filter((value): value is string => !!value)
    )];
  }
}

function resolveSettlementScenarioRewards(
  state: GameState,
  playerId: string,
  vertexId: string
): void {
  const player = getPlayer(state, playerId);
  const regionId = getScenarioRewardRegionId(state, vertexId);
  if (!regionId || player.homeRegionIds.includes(regionId) || player.rewardedRegionIds.includes(regionId)) {
    return;
  }

  const reward = getSeafarersIslandRewardPoints(state.gameConfig.scenarioId);

  if (reward <= 0) {
    return;
  }

  player.specialVictoryPoints += reward;
  player.rewardedRegionIds.push(regionId);
  const rewardMarker = (state.board.scenarioMarkers ?? []).find(
    (marker): marker is Extract<NonNullable<GameState["board"]["scenarioMarkers"]>[number], { type: "island_reward" }> =>
      marker.type === "island_reward" && marker.regionId === regionId
  );
  if (rewardMarker) {
    rewardMarker.claimedByPlayerId = playerId;
  }
  appendEvent(state, {
    type: "scenario_reward_claimed",
    byPlayerId: playerId,
    payload: {
      rewardType: reward === 2 ? "island_reward_2" : "island_reward_1",
      markerId: rewardMarker?.id ?? `region:${regionId}`
    }
  });
}

function getScenarioRewardRegionId(state: GameState, vertexId: string): string | null {
  if (state.gameConfig.scenarioId === "seafarers.through_the_desert") {
    return getThroughTheDesertRegionId(state, vertexId);
  }

  return getVertex(state, vertexId).islandId ?? null;
}

function getThroughTheDesertRegionId(state: GameState, vertexId: string): string | null {
  const tileById = new Map(state.board.tiles.map((tile) => [tile.id, tile]));
  const startTileIds = getVertex(state, vertexId).tileIds.filter((tileId) => isThroughTheDesertRegionTile(getTile(state, tileId)));
  if (!startTileIds.length) {
    return null;
  }

  const landNeighbors = new Map<string, string[]>();
  for (const tile of state.board.tiles) {
    if (!isThroughTheDesertRegionTile(tile)) {
      continue;
    }
    landNeighbors.set(tile.id, []);
  }

  for (const edge of state.board.edges) {
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
    landNeighbors.get(leftId)?.push(rightId);
    landNeighbors.get(rightId)?.push(leftId);
  }

  const componentByTileId = new Map<string, string>();
  let componentIndex = 0;
  for (const tileId of landNeighbors.keys()) {
    if (componentByTileId.has(tileId)) {
      continue;
    }

    componentIndex += 1;
    const componentId = `through_desert_region_${componentIndex}`;
    const queue = [tileId];
    componentByTileId.set(tileId, componentId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      for (const neighborId of landNeighbors.get(current) ?? []) {
        if (componentByTileId.has(neighborId)) {
          continue;
        }
        componentByTileId.set(neighborId, componentId);
        queue.push(neighborId);
      }
    }
  }

  return componentByTileId.get(startTileIds[0]!) ?? null;
}

function isThroughTheDesertRegionTile(tile: TileView): boolean {
  return tile.terrain !== "sea" && tile.kind !== "sea" && tile.terrain !== "desert";
}

function getPirateStealTargets(state: GameState, playerId: string, tileId: string): string[] {
  const targets = new Set<string>();
  const tile = getTile(state, tileId);
  for (const edgeId of tile.edgeIds) {
    const edge = getEdge(state, edgeId);
    if (edge.ownerId && edge.ownerId !== playerId && (edge.routeType === "ship" || edge.routeType === "warship")) {
      if (getPirateStealTypesForTarget(state, edge.ownerId).length > 0) {
        targets.add(edge.ownerId);
      }
    }
  }
  return [...targets];
}

function getSiteAtVertex(
  state: GameState,
  vertexId: string,
  type: "wonder"
): Extract<NonNullable<GameState["board"]["sites"]>[number], { type: "wonder" }> | null;
function getSiteAtVertex(
  state: GameState,
  vertexId: string,
  type: "fortress"
): Extract<NonNullable<GameState["board"]["sites"]>[number], { type: "fortress" }> | null;
function getSiteAtVertex(
  state: GameState,
  vertexId: string,
  type: "wonder" | "fortress"
):
  | Extract<NonNullable<GameState["board"]["sites"]>[number], { type: "wonder" }>
  | Extract<NonNullable<GameState["board"]["sites"]>[number], { type: "fortress" }>
  | null {
  return (
    state.board.sites?.find((site) => site.vertexId === vertexId && site.type === type) ?? null
  ) as
    | Extract<NonNullable<GameState["board"]["sites"]>[number], { type: "wonder" }>
    | Extract<NonNullable<GameState["board"]["sites"]>[number], { type: "fortress" }>
    | null;
}

function syncVertexSite(state: GameState, site: NonNullable<GameState["board"]["sites"]>[number]): void {
  const vertex = getVertex(state, site.vertexId);
  if (site.type === "village" && site.edgeId) {
    if (vertex.site?.id === site.id) {
      vertex.site = null;
    }
  } else {
    vertex.site = { ...site };
  }
  if (!state.board.sites) {
    state.board.sites = [{ ...site }];
    return;
  }

  const index = state.board.sites.findIndex((entry) => entry.id === site.id);
  if (index === -1) {
    state.board.sites.push({ ...site });
    return;
  }
  state.board.sites[index] = { ...site };
}

function getPirateStealTypesForTarget(state: GameState, targetPlayerId: string): PirateStealType[] {
  const target = getPlayer(state, targetPlayerId);
  const types: PirateStealType[] = [];
  if (totalResources(target.resources) > 0) {
    types.push("resource");
  }
  if (state.gameConfig.scenarioId === "seafarers.cloth_for_catan" && target.clothCount > 0) {
    types.push("cloth");
  }
  return types;
}

function stealClothToken(state: GameState, thiefId: string, victimId: string): void {
  const victim = getPlayer(state, victimId);
  if (victim.clothCount <= 0) {
    return;
  }
  victim.clothCount -= 1;
  getPlayer(state, thiefId).clothCount += 1;
}

function declareWinner(state: GameState, playerId: string): void {
  state.winnerId = playerId;
  state.phase = "game_over";
  state.previousPhase = null;
  state.pendingDevelopmentEffect = null;
  appendEvent(state, {
    type: "game_won",
    byPlayerId: playerId,
    payload: { victoryPoints: getVictoryPoints(state, playerId) }
  });
}

function getPlayerWonderProgress(state: GameState, playerId: string): number {
  return Math.max(
    0,
    ...state.board.sites
      .filter(
        (site): site is Extract<BoardSiteView, { type: "wonder" }> =>
          site.type === "wonder" && site.ownerId === playerId
      )
      .map((site) => site.progress)
  );
}

function playerOwnsWonder(state: GameState, playerId: string): boolean {
  return (state.board.sites ?? []).some((site) => site.type === "wonder" && site.ownerId === playerId);
}

function meetsWonderRequirement(
  state: GameState,
  playerId: string,
  site: Extract<NonNullable<GameState["board"]["sites"]>[number], { type: "wonder" }>
): boolean {
  const player = getPlayer(state, playerId);
  switch (site.requirementId) {
    case "great_wall_marker":
    case "great_bridge_marker":
    case "lighthouse_marker":
      return getVertex(state, site.vertexId).building?.ownerId === playerId;
    case "city_at_port_with_long_route":
      return player.cities.some((vertexId) => getVertex(state, vertexId).portType !== null) &&
        calculateLongestTradeRoute(state, playerId) >= 5;
    case "two_cities":
      return player.cities.length >= 2;
    case "city_and_six_vp":
      return player.cities.length >= 1 && getVictoryPoints(state, playerId) >= 6;
    default:
      return false;
  }
}

function isLargestArmyEnabled(state: GameState): boolean {
  return state.gameConfig.scenarioId !== "seafarers.pirate_islands";
}

function isLongestRoadEnabled(state: GameState): boolean {
  return (
    state.gameConfig.scenarioId !== "seafarers.cloth_for_catan" &&
    state.gameConfig.scenarioId !== "seafarers.pirate_islands"
  );
}

function isRobberEnabled(state: GameState): boolean {
  return state.gameConfig.scenarioId !== "seafarers.pirate_islands";
}

function isPirateEnabled(state: GameState): boolean {
  return state.gameConfig.scenarioId !== "seafarers.wonders_of_catan";
}

function canPlayerMovePirate(state: GameState, playerId: string): boolean {
  if (state.gameConfig.scenarioId !== "seafarers.cloth_for_catan") {
    return true;
  }
  return (state.board.sites ?? []).some(
    (site) =>
      site.type === "village" &&
      getVillageConnectedPlayerIds(state, site).includes(playerId)
  );
}

function canRobberOccupyTile(state: GameState, tileId: string): boolean {
  const tile = getTile(state, tileId);
  if (tile.terrain === "sea") {
    return false;
  }
  if (state.gameConfig.scenarioId === "seafarers.forgotten_tribe") {
    return tile.token !== null;
  }
  if (state.gameConfig.scenarioId === "seafarers.cloth_for_catan") {
    return !(state.board.sites ?? []).some(
      (site) =>
        site.type === "village" &&
        (site.edgeId ? tile.edgeIds.includes(site.edgeId) : tile.vertexIds.includes(site.vertexId))
    );
  }
  return true;
}

function vertexHasNumberedTile(state: GameState, vertexId: string): boolean {
  return getVertex(state, vertexId).tileIds.some((tileId) => getTile(state, tileId).token !== null);
}

function isVillageIslandVertex(state: GameState, vertexId: string): boolean {
  const islandId = getVertex(state, vertexId).islandId;
  if (!islandId) {
    return false;
  }
  return (state.board.sites ?? []).some(
    (site) => site.type === "village" && getVertex(state, site.vertexId).islandId === islandId
  );
}

function hasWonderStartBlockMarker(state: GameState, vertexId: string): boolean {
  return (state.board.scenarioMarkers ?? []).some(
    (marker) => marker.type === "wonder_block" && marker.vertexId === vertexId
  );
}

function isInitialSettlementVertexAllowed(state: GameState, vertexId: string): boolean {
  const islandId = getVertex(state, vertexId).islandId;
  if (!islandId) {
    return false;
  }

  if (state.gameConfig.rulesFamily !== "seafarers") {
    return true;
  }

  if (state.gameConfig.scenarioId === "seafarers.through_the_desert") {
    const regionId = getScenarioRewardRegionId(state, vertexId);
    return !!regionId && getPreferredSetupRegionIds(state, 1).includes(regionId);
  }

  const homeIslandCount = getSeafarersHomeIslandCount(state.gameConfig.scenarioId);
  if (homeIslandCount > 0 && !getPreferredSetupIslandIds(state, homeIslandCount).includes(islandId)) {
    return false;
  }

  switch (state.gameConfig.scenarioId) {
    case "seafarers.cloth_for_catan":
      return !isVillageIslandVertex(state, vertexId);
    case "seafarers.wonders_of_catan":
      return !hasWonderStartBlockMarker(state, vertexId);
    default:
      return true;
  }
}

function isPirateIslandsSettlementVertexAllowed(state: GameState, playerId: string, vertexId: string): boolean {
  const vertex = getVertex(state, vertexId);
  const homeIslandId = getPirateIslandsHomeIslandId(state);
  if (!vertex.islandId || !homeIslandId) {
    return false;
  }
  if (vertex.islandId === homeIslandId) {
    return true;
  }

  if (vertex.site?.type !== "landing") {
    return false;
  }

  return vertex.site.beachheadColor === getPlayer(state, playerId).color;
}

function getPreferredSetupIslandIds(state: GameState, count: number): string[] {
  const islandStats = new Map<
    string,
    {
      id: string;
      size: number;
      centroidX: number;
      centroidY: number;
    }
  >();

  for (const tile of state.board.tiles) {
    if (tile.terrain === "sea" || tile.kind === "sea") {
      continue;
    }
    const islandId =
      tile.vertexIds
        .map((vertexId) => getVertex(state, vertexId).islandId)
        .find((value): value is string => !!value) ?? null;
    if (!islandId) {
      continue;
    }

    const current = islandStats.get(islandId) ?? {
      id: islandId,
      size: 0,
      centroidX: 0,
      centroidY: 0
    };
    current.size += 1;
    current.centroidX += tile.x;
    current.centroidY += tile.y;
    islandStats.set(islandId, current);
  }

  return [...islandStats.values()]
    .map((island) => ({
      ...island,
      centroidX: island.centroidX / Math.max(1, island.size),
      centroidY: island.centroidY / Math.max(1, island.size)
    }))
    .sort((left, right) => {
      if (right.size !== left.size) {
        return right.size - left.size;
      }
      if (right.centroidX !== left.centroidX) {
        return right.centroidX - left.centroidX;
      }
      return left.centroidY - right.centroidY;
    })
    .slice(0, count)
    .map((island) => island.id);
}

function getPreferredSetupRegionIds(state: GameState, count: number): string[] {
  const regionStats = new Map<
    string,
    {
      id: string;
      size: number;
      centroidX: number;
      centroidY: number;
    }
  >();

  for (const tile of state.board.tiles) {
    if (tile.terrain === "sea" || tile.kind === "sea") {
      continue;
    }
    const regionId =
      tile.vertexIds
        .map((vertexId) => getScenarioRewardRegionId(state, vertexId))
        .find((value): value is string => !!value) ?? null;
    if (!regionId) {
      continue;
    }

    const current = regionStats.get(regionId) ?? {
      id: regionId,
      size: 0,
      centroidX: 0,
      centroidY: 0
    };
    current.size += 1;
    current.centroidX += tile.x;
    current.centroidY += tile.y;
    regionStats.set(regionId, current);
  }

  return [...regionStats.values()]
    .map((region) => ({
      ...region,
      centroidX: region.centroidX / Math.max(1, region.size),
      centroidY: region.centroidY / Math.max(1, region.size)
    }))
    .sort((left, right) => {
      if (right.size !== left.size) {
        return right.size - left.size;
      }
      if (right.centroidX !== left.centroidX) {
        return right.centroidX - left.centroidX;
      }
      return left.centroidY - right.centroidY;
    })
    .slice(0, count)
    .map((region) => region.id);
}

interface PirateIslandsRouteAnalysis {
  edgeIds: string[];
  removableEdgeIds: string[];
  warshipCount: number;
  homeStartVertexId: string;
  landingVertexId: string;
  fortressVertexId: string;
  touchesLanding: boolean;
  touchesFortress: boolean;
}

function getPirateIslandsHomeIslandId(state: GameState): string | null {
  return getPreferredSetupIslandIds(state, 1)[0] ?? null;
}

function getPirateIslandsLandingVertexId(state: GameState, playerId: string): string | null {
  const player = getPlayer(state, playerId);
  return (
    (state.board.sites ?? []).find(
      (site) => site.type === "landing" && site.beachheadColor === player.color
    )?.vertexId ?? null
  );
}

function getPirateIslandsFortressVertexId(state: GameState, playerId: string): string | null {
  const player = getPlayer(state, playerId);
  return (
    (state.board.sites ?? []).find(
      (site) => site.type === "fortress" && site.fortressColor === player.color
    )?.vertexId ?? null
  );
}

function getPirateIslandsHomeCoastalBuildingVertexIds(
  state: GameState,
  playerId: string,
  homeIslandId: string
): string[] {
  const player = getPlayer(state, playerId);
  return [...player.settlements, ...player.cities].filter((vertexId) => {
    const vertex = getVertex(state, vertexId);
    return vertex.islandId === homeIslandId && vertex.coastal === true;
  });
}

function collectShipAllowedVertexDistances(
  state: GameState,
  startVertexIds: readonly string[]
): Map<string, number> {
  const queue = [...new Set(startVertexIds)];
  const distances = new Map<string, number>();
  for (const vertexId of queue) {
    distances.set(vertexId, 0);
  }

  while (queue.length > 0) {
    const vertexId = queue.shift();
    if (!vertexId) {
      continue;
    }
    const distance = distances.get(vertexId);
    if (distance === undefined) {
      continue;
    }
    for (const edgeId of getVertex(state, vertexId).edgeIds) {
      const edge = getEdge(state, edgeId);
      if (edge.shipAllowed !== true) {
        continue;
      }
      const neighborVertexId = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
      if (distances.has(neighborVertexId)) {
        continue;
      }
      distances.set(neighborVertexId, distance + 1);
      queue.push(neighborVertexId);
    }
  }

  return distances;
}

function isEdgeOnShortestShipVertexPath(
  leftVertexId: string,
  rightVertexId: string,
  distanceFromStart: Map<string, number>,
  distanceToTarget: Map<string, number>,
  bestDistance: number
): boolean {
  const leftFromStart = distanceFromStart.get(leftVertexId);
  const rightFromStart = distanceFromStart.get(rightVertexId);
  const leftToTarget = distanceToTarget.get(leftVertexId);
  const rightToTarget = distanceToTarget.get(rightVertexId);
  return (
    (leftFromStart !== undefined &&
      rightToTarget !== undefined &&
      leftFromStart + 1 + rightToTarget === bestDistance) ||
    (rightFromStart !== undefined &&
      leftToTarget !== undefined &&
      rightFromStart + 1 + leftToTarget === bestDistance)
  );
}

function getPirateIslandsCandidateRouteEdgeIds(state: GameState, playerId: string): Set<string> {
  if (state.gameConfig.scenarioId !== "seafarers.pirate_islands") {
    return new Set<string>();
  }

  const homeIslandId = getPirateIslandsHomeIslandId(state);
  const landingVertexId = getPirateIslandsLandingVertexId(state, playerId);
  const fortressVertexId = getPirateIslandsFortressVertexId(state, playerId);
  if (!homeIslandId || !landingVertexId || !fortressVertexId) {
    return new Set<string>();
  }

  const homeBuildingVertexIds = getPirateIslandsHomeCoastalBuildingVertexIds(state, playerId, homeIslandId);
  if (homeBuildingVertexIds.length === 0) {
    return new Set<string>();
  }

  const distanceFromHome = collectShipAllowedVertexDistances(state, homeBuildingVertexIds);
  const distanceFromLanding = collectShipAllowedVertexDistances(state, [landingVertexId]);
  const distanceFromFortress = collectShipAllowedVertexDistances(state, [fortressVertexId]);
  const bestHomeToLanding = distanceFromHome.get(landingVertexId);
  const bestLandingToFortress = distanceFromLanding.get(fortressVertexId);
  if (bestHomeToLanding === undefined || bestLandingToFortress === undefined) {
    return new Set<string>();
  }

  const candidateEdgeIds = new Set<string>();
  for (const edge of state.board.edges) {
    if (edge.shipAllowed !== true) {
      continue;
    }
    const [leftVertexId, rightVertexId] = edge.vertexIds;
    if (
      isEdgeOnShortestShipVertexPath(
        leftVertexId,
        rightVertexId,
        distanceFromHome,
        distanceFromLanding,
        bestHomeToLanding
      ) ||
      isEdgeOnShortestShipVertexPath(
        leftVertexId,
        rightVertexId,
        distanceFromLanding,
        distanceFromFortress,
        bestLandingToFortress
      )
    ) {
      candidateEdgeIds.add(edge.id);
    }
  }

  return candidateEdgeIds;
}

function isOwnedShipRouteEdgeByPlayer(state: GameState, playerId: string, edgeId: string): boolean {
  const edge = getEdge(state, edgeId);
  return (
    edge.ownerId === playerId &&
    (edge.routeType === "ship" || edge.routeType === "warship")
  );
}

function collectPirateIslandsRelevantEdgeIds(
  state: GameState,
  playerId: string,
  additionalEdgeId?: string,
  removedEdgeId?: string
): string[] {
  const candidateEdgeIds = getPirateIslandsCandidateRouteEdgeIds(state, playerId);
  const relevantEdgeIds: string[] = [];
  for (const edgeId of candidateEdgeIds) {
    if (edgeId === removedEdgeId) {
      continue;
    }
    if (edgeId === additionalEdgeId || isOwnedShipRouteEdgeByPlayer(state, playerId, edgeId)) {
      relevantEdgeIds.push(edgeId);
    }
  }
  return relevantEdgeIds;
}

function orderPathEdgeIdsFromStartVertex(
  state: GameState,
  startVertexId: string,
  edgeIds: readonly string[],
  edgeIdsByVertexId: Map<string, string[]>
): string[] {
  const remainingEdgeIds = new Set(edgeIds);
  const orderedEdgeIds: string[] = [];
  let currentVertexId = startVertexId;
  let previousEdgeId: string | null = null;

  while (remainingEdgeIds.size > 0) {
    const nextEdgeId =
      (edgeIdsByVertexId.get(currentVertexId) ?? []).find(
        (edgeId) => edgeId !== previousEdgeId && remainingEdgeIds.has(edgeId)
      ) ?? null;
    if (!nextEdgeId) {
      break;
    }
    orderedEdgeIds.push(nextEdgeId);
    remainingEdgeIds.delete(nextEdgeId);
    const edge = getEdge(state, nextEdgeId);
    currentVertexId = edge.vertexIds[0] === currentVertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    previousEdgeId = nextEdgeId;
  }

  return remainingEdgeIds.size === 0 ? orderedEdgeIds : [];
}

function getOrderedPathVertexIds(
  state: GameState,
  startVertexId: string,
  edgeIds: readonly string[]
): string[] {
  const vertexIds = [startVertexId];
  let currentVertexId = startVertexId;
  for (const edgeId of edgeIds) {
    const edge = getEdge(state, edgeId);
    currentVertexId = edge.vertexIds[0] === currentVertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    vertexIds.push(currentVertexId);
  }
  return vertexIds;
}

function analyzePirateIslandsRelevantRoute(
  state: GameState,
  playerId: string,
  additionalEdgeId?: string,
  removedEdgeId?: string
): PirateIslandsRouteAnalysis | null {
  if (state.gameConfig.scenarioId !== "seafarers.pirate_islands") {
    return null;
  }

  const homeIslandId = getPirateIslandsHomeIslandId(state);
  const landingVertexId = getPirateIslandsLandingVertexId(state, playerId);
  const fortressVertexId = getPirateIslandsFortressVertexId(state, playerId);
  if (!homeIslandId || !landingVertexId || !fortressVertexId) {
    return null;
  }

  const homeBuildingVertexIds = getPirateIslandsHomeCoastalBuildingVertexIds(state, playerId, homeIslandId);
  if (homeBuildingVertexIds.length === 0) {
    return null;
  }

  const relevantEdgeIds = collectPirateIslandsRelevantEdgeIds(state, playerId, additionalEdgeId, removedEdgeId);
  if (relevantEdgeIds.length === 0) {
    return null;
  }

  const homeBuildingVertexIdSet = new Set(homeBuildingVertexIds);
  const vertexDegreeById = new Map<string, number>();
  const edgeIdsByVertexId = new Map<string, string[]>();
  for (const edgeId of relevantEdgeIds) {
    const edge = getEdge(state, edgeId);
    for (const vertexId of edge.vertexIds) {
      vertexDegreeById.set(vertexId, (vertexDegreeById.get(vertexId) ?? 0) + 1);
      const entry = edgeIdsByVertexId.get(vertexId) ?? [];
      entry.push(edgeId);
      edgeIdsByVertexId.set(vertexId, entry);
    }
  }

  if ([...vertexDegreeById.values()].some((degree) => degree > 2)) {
    return null;
  }

  const visitedEdgeIds = new Set<string>();
  const queue = [relevantEdgeIds[0]!];
  while (queue.length > 0) {
    const edgeId = queue.shift();
    if (!edgeId || visitedEdgeIds.has(edgeId)) {
      continue;
    }
    visitedEdgeIds.add(edgeId);
    const edge = getEdge(state, edgeId);
    for (const vertexId of edge.vertexIds) {
      for (const candidateEdgeId of edgeIdsByVertexId.get(vertexId) ?? []) {
        if (!visitedEdgeIds.has(candidateEdgeId)) {
          queue.push(candidateEdgeId);
        }
      }
    }
  }

  if (visitedEdgeIds.size !== relevantEdgeIds.length) {
    return null;
  }

  const vertexIds = [...vertexDegreeById.keys()];
  if (relevantEdgeIds.length !== vertexIds.length - 1) {
    return null;
  }

  const oddVertexIds = vertexIds.filter((vertexId) => ((vertexDegreeById.get(vertexId) ?? 0) & 1) === 1);
  if (oddVertexIds.length !== 2) {
    return null;
  }

  const homeEndpointVertexIds = oddVertexIds.filter((vertexId) => homeBuildingVertexIdSet.has(vertexId));
  if (homeEndpointVertexIds.length !== 1) {
    return null;
  }

  const homeStartVertexId = homeEndpointVertexIds[0]!;
  if (vertexDegreeById.has(fortressVertexId) && !oddVertexIds.includes(fortressVertexId)) {
    return null;
  }

  const orderedEdgeIds = orderPathEdgeIdsFromStartVertex(state, homeStartVertexId, relevantEdgeIds, edgeIdsByVertexId);
  if (orderedEdgeIds.length !== relevantEdgeIds.length) {
    return null;
  }

  const orderedVertexIds = getOrderedPathVertexIds(state, homeStartVertexId, orderedEdgeIds);
  const touchesLanding = orderedVertexIds.includes(landingVertexId);
  const touchesFortress = orderedVertexIds.includes(fortressVertexId);
  if (touchesFortress && !touchesLanding) {
    return null;
  }
  if (touchesFortress && orderedVertexIds[orderedVertexIds.length - 1] !== fortressVertexId) {
    return null;
  }

  return {
    edgeIds: orderedEdgeIds,
    removableEdgeIds: touchesFortress ? [...orderedEdgeIds].reverse() : [],
    warshipCount: orderedEdgeIds.filter((edgeId) => getEdge(state, edgeId).routeType === "warship").length,
    homeStartVertexId,
    landingVertexId,
    fortressVertexId,
    touchesLanding,
    touchesFortress
  };
}

function validatePirateIslandsRelevantRoute(
  state: GameState,
  playerId: string,
  additionalEdgeId?: string,
  removedEdgeId?: string
): boolean {
  if (state.gameConfig.scenarioId !== "seafarers.pirate_islands") {
    return true;
  }

  const relevantEdgeIds = collectPirateIslandsRelevantEdgeIds(
    state,
    playerId,
    additionalEdgeId,
    removedEdgeId
  );
  if (relevantEdgeIds.length === 0) {
    return true;
  }

  return analyzePirateIslandsRelevantRoute(state, playerId, additionalEdgeId, removedEdgeId) !== null;
}

function findConvertibleWarshipEdgeId(state: GameState, playerId: string): string | null {
  const route = analyzePirateIslandsRelevantRoute(state, playerId);
  if (!route) {
    return null;
  }

  return route.edgeIds.find((edgeId) => getEdge(state, edgeId).routeType === "ship") ?? null;
}

function compareVerticesForScenarioSetup(left: VertexView, right: VertexView): number {
  if (right.x !== left.x) {
    return right.x - left.x;
  }
  return left.y - right.y;
}

function isShipComponentClosedByVillageTrade(
  state: GameState,
  playerId: string,
  shipComponent: ReadonlySet<string>
): boolean {
  if (state.gameConfig.scenarioId !== "seafarers.cloth_for_catan") {
    return false;
  }

  const hasBuilding = [...getPlayer(state, playerId).settlements, ...getPlayer(state, playerId).cities].some(
    (vertexId) => getVertex(state, vertexId).edgeIds.some((candidateEdgeId) => shipComponent.has(candidateEdgeId))
  );
  const hasVillage = (state.board.sites ?? []).some(
    (site) =>
      site.type === "village" &&
      (site.edgeId
        ? shipComponent.has(site.edgeId)
        : getVertex(state, site.vertexId).edgeIds.some((candidateEdgeId) => shipComponent.has(candidateEdgeId)))
  );
  return hasBuilding && hasVillage;
}

function collectConnectedShipEdges(state: GameState, playerId: string, startEdgeId: string): Set<string> {
  const queue = [startEdgeId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const edgeId = queue.shift();
    if (!edgeId || visited.has(edgeId)) {
      continue;
    }
    visited.add(edgeId);
    const edge = getEdge(state, edgeId);
    for (const vertexId of edge.vertexIds) {
      for (const candidateEdgeId of getVertex(state, vertexId).edgeIds) {
        const candidateEdge = getEdge(state, candidateEdgeId);
        if (
          !visited.has(candidateEdgeId) &&
          candidateEdge.ownerId === playerId &&
          (candidateEdge.routeType === "ship" || candidateEdge.routeType === "warship")
        ) {
          queue.push(candidateEdgeId);
        }
      }
    }
  }
  return visited;
}

function getPirateFortressAssaultRoute(
  state: GameState,
  playerId: string,
  fortressVertexId: string
): {
  edgeIds: string[];
  removableEdgeIds: string[];
  warshipCount: number;
} | null {
  if (state.gameConfig.scenarioId !== "seafarers.pirate_islands") {
    return null;
  }
  const route = analyzePirateIslandsRelevantRoute(state, playerId);
  if (!route || !route.touchesFortress || route.fortressVertexId !== fortressVertexId) {
    return null;
  }
  return {
    edgeIds: [...route.edgeIds],
    removableEdgeIds: [...route.removableEdgeIds],
    warshipCount: route.warshipCount
  };
}

function convertShipToWarship(state: GameState, playerId: string): string {
  const player = getPlayer(state, playerId);
  const edgeId = findConvertibleWarshipEdgeId(state, playerId);
  if (!edgeId) {
    throw new GameRuleError("game.scenario_action_unavailable");
  }
  player.ships = player.ships.filter((id) => id !== edgeId);
  player.warships.push(edgeId);
  const edge = getEdge(state, edgeId);
  edge.routeType = "warship";
  return edgeId;
}

function playerHasCapturedOwnFortress(state: GameState, playerId: string): boolean {
  const player = getPlayer(state, playerId);
  return (state.board.sites ?? []).some(
    (site) =>
      site.type === "fortress" &&
      site.ownerId === playerId &&
      site.captured &&
      site.fortressColor === player.color
  );
}

function getVictoryPoints(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  return (
    getPublicVictoryPoints(state, playerId) +
    player.developmentCards.filter((card) => card.type === "victory_point").length
  );
}

function hasPendingDiscard(state: GameState): boolean {
  return !!state.robberState && Object.values(state.robberState.pendingDiscardByPlayerId).some((count) => count > 0);
}

function completeRoadBuildingIfDone(state: GameState): void {
  const effect = getPendingRoadBuildingEffect(state);
  const currentPlayerId = getCurrentPlayer(state).id;
  if (effect.remainingRoads > 0 && getLegalFreeRouteEdges(state, currentPlayerId).length > 0) {
    return;
  }

  state.pendingDevelopmentEffect = null;
  state.phase = effect.resumePhase;
  state.previousPhase = null;
}

function getPendingRoadBuildingEffect(state: GameState): PendingRoadBuildingEffect {
  if (!state.pendingDevelopmentEffect || state.pendingDevelopmentEffect.type !== "road_building") {
    throw new GameRuleError("game.no_active_road_building");
  }

  return state.pendingDevelopmentEffect;
}

function appendEvent(
  state: GameState,
  input: MatchEventInput
): void {
  const event: MatchEvent = {
    id: `event-${state.eventLog.length + 1}`,
    atTurn: state.turn,
    ...input
  };

  state.eventLog.push(event);
}

function getTradeOffer(state: GameState, tradeId: string): InternalTradeOffer | null {
  return state.tradeOffers.find((offer) => offer.id === tradeId) ?? null;
}

function clearTradeOffers(state: GameState): void {
  state.tradeOffers = [];
}

function isPendingDevelopmentAction(action: ActionIntent): action is Extract<ActionIntent, { type: "place_free_road" | "finish_road_building" }> {
  return action.type === "place_free_road" || action.type === "finish_road_building";
}

function canPlayerWithdrawTradeOffer(playerId: string, trade: InternalTradeOffer): boolean {
  return trade.fromPlayerId === playerId;
}

function canPlayerAcceptTradeOffer(state: GameState, playerId: string, trade: InternalTradeOffer): boolean {
  const currentPlayerId = getCurrentPlayer(state).id;
  if (trade.fromPlayerId === playerId) {
    return false;
  }
  if (trade.declinedByPlayerIds.includes(playerId)) {
    return false;
  }

  if (playerId === currentPlayerId) {
    return trade.toPlayerId === currentPlayerId;
  }

  return trade.fromPlayerId === currentPlayerId && (trade.toPlayerId === null || trade.toPlayerId === playerId);
}

function canPlayerDeclineTradeOffer(state: GameState, playerId: string, trade: InternalTradeOffer): boolean {
  const currentPlayerId = getCurrentPlayer(state).id;
  if (trade.fromPlayerId === playerId) {
    return false;
  }
  if (trade.declinedByPlayerIds.includes(playerId)) {
    return false;
  }

  if (playerId === currentPlayerId) {
    return trade.toPlayerId === currentPlayerId;
  }

  return trade.fromPlayerId === currentPlayerId && (trade.toPlayerId === null || trade.toPlayerId === playerId);
}

function reconcileTradeOffers(state: GameState): void {
  if (state.phase !== "turn_action" || state.pendingDevelopmentEffect || state.pendingGoldSelections.length > 0) {
    clearTradeOffers(state);
    return;
  }

  const currentPlayerId = getCurrentPlayer(state).id;
  state.tradeOffers = state.tradeOffers.filter((trade) => {
    const proposer = state.players.find((player) => player.id === trade.fromPlayerId);
    if (!proposer || !hasResources(proposer.resources, trade.give)) {
      return false;
    }

    if (!state.players.some((player) => player.id === currentPlayerId)) {
      return false;
    }

    if (trade.fromPlayerId === currentPlayerId) {
      if (trade.toPlayerId === null) {
        return getOpenTradeRecipientIds(state, trade).length > 0;
      }

      return trade.toPlayerId !== currentPlayerId && state.players.some((player) => player.id === trade.toPlayerId);
    }

    return trade.toPlayerId === currentPlayerId;
  });
}

function toTradeView(trade: InternalTradeOffer): TradeOfferView {
  return {
    id: trade.id,
    fromPlayerId: trade.fromPlayerId,
    toPlayerId: trade.toPlayerId,
    targetPlayerId: trade.toPlayerId,
    give: cloneResourceMap(trade.give),
    want: cloneResourceMap(trade.want),
    createdAtTurn: trade.createdAtTurn
  };
}

function canPlayerSeeTradeOffer(state: GameState, playerId: string, trade: InternalTradeOffer): boolean {
  if (trade.fromPlayerId === playerId) {
    return true;
  }

  if (trade.toPlayerId) {
    return trade.toPlayerId === playerId;
  }

  return getOpenTradeRecipientIds(state, trade).includes(playerId);
}

function getOpenTradeRecipientIds(state: GameState, trade: InternalTradeOffer): string[] {
  if (trade.toPlayerId) {
    return trade.declinedByPlayerIds.includes(trade.toPlayerId) ? [] : [trade.toPlayerId];
  }

  return state.players
    .filter((player) => player.id !== trade.fromPlayerId && !trade.declinedByPlayerIds.includes(player.id))
    .map((player) => player.id);
}

function cloneBoard(board: GeneratedBoard): GeneratedBoard {
  return {
    tiles: board.tiles.map((tile) => ({
      ...tile,
      vertexIds: [...tile.vertexIds],
      edgeIds: [...tile.edgeIds]
    })),
    vertices: board.vertices.map((vertex) => ({
      ...vertex,
      tileIds: [...vertex.tileIds],
      edgeIds: [...vertex.edgeIds],
      adjacentVertexIds: [...vertex.adjacentVertexIds],
      building: vertex.building ? { ...vertex.building } : null,
      site: vertex.site ? { ...vertex.site } : null
    })),
    edges: board.edges.map((edge) => ({
      ...edge,
      vertexIds: [...edge.vertexIds] as [string, string],
      tileIds: [...edge.tileIds]
    })),
    ports: board.ports.map((port) => ({
      ...port,
      vertexIds: [...port.vertexIds] as [string, string]
    })),
    sites: board.sites.map((site) => ({ ...site })),
    scenarioMarkers: board.scenarioMarkers.map((marker) => ({ ...marker }))
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    gameConfig: {
      ...state.gameConfig,
      scenarioOptions: { ...state.gameConfig.scenarioOptions },
      startingPlayer: { ...state.gameConfig.startingPlayer },
      enabledExpansions: [...state.gameConfig.enabledExpansions]
    },
    board: cloneBoard(state.board),
    players: state.players.map((player) => ({
      ...player,
      resources: cloneResourceMap(player.resources),
      developmentCards: player.developmentCards.map((card) => ({ ...card })),
      roads: [...player.roads],
      ships: [...player.ships],
      warships: [...player.warships],
      settlements: [...player.settlements],
      cities: [...player.cities],
      harborTokens: [...player.harborTokens],
      homeIslandIds: [...player.homeIslandIds],
      homeRegionIds: [...player.homeRegionIds],
      rewardedRegionIds: [...player.rewardedRegionIds]
    })),
    bank: cloneResourceMap(state.bank),
    developmentDeck: state.developmentDeck.map((card) => ({ ...card })),
    tradeOffers: state.tradeOffers.map((trade) => ({
      ...trade,
      give: cloneResourceMap(trade.give),
      want: cloneResourceMap(trade.want),
      declinedByPlayerIds: [...trade.declinedByPlayerIds]
    })),
    eventLog: state.eventLog.map((event) => structuredClone(event)),
    setupState: state.setupState
      ? {
          ...state.setupState,
          steps: state.setupState.steps.map((step) => ({ ...step }))
        }
      : null,
    robberState: state.robberState
      ? {
          resumePhase: state.robberState.resumePhase,
          pendingDiscardByPlayerId: { ...state.robberState.pendingDiscardByPlayerId },
          ...(state.robberState.mode !== undefined ? { mode: state.robberState.mode } : {})
        }
      : null,
    pendingDevelopmentEffect: state.pendingDevelopmentEffect ? { ...state.pendingDevelopmentEffect } : null,
    pendingGoldSelections: state.pendingGoldSelections.map((selection) => ({ ...selection })),
    pendingRollResolution: state.pendingRollResolution ? { ...state.pendingRollResolution, dice: [...state.pendingRollResolution.dice] as [number, number] } : null,
    scenarioState:
      state.scenarioState?.type === "pirate_islands"
        ? {
            ...state.scenarioState,
            fleetPathTileIds: [...state.scenarioState.fleetPathTileIds]
          }
        : state.scenarioState?.type === "fog_islands"
          ? {
              ...state.scenarioState,
              ...(state.scenarioState.hiddenTerrainStack
                ? {
                    hiddenTerrainStack: [...state.scenarioState.hiddenTerrainStack]
                  }
                : {}),
              ...(state.scenarioState.hiddenTokenStack
                ? {
                    hiddenTokenStack: [...state.scenarioState.hiddenTokenStack]
                  }
                : {}),
              revealEntriesByTileId: Object.fromEntries(
                Object.entries(state.scenarioState.revealEntriesByTileId).map(([tileId, entry]) => [
                  tileId,
                  { ...entry }
                ])
              )
            }
          : state.scenarioState
            ? {
                ...state.scenarioState
              }
            : null,
    scenarioSetupState: state.scenarioSetupState
      ? {
          ...state.scenarioSetupState,
          readyByPlayerId: { ...state.scenarioSetupState.readyByPlayerId },
          tilePool: { ...state.scenarioSetupState.tilePool },
          tokenPool: { ...state.scenarioSetupState.tokenPool },
          portPool: { ...state.scenarioSetupState.portPool },
          placeableTileIds: [...state.scenarioSetupState.placeableTileIds],
          portEdgeIds: [...state.scenarioSetupState.portEdgeIds]
        }
      : null,
    turnContext: {
      primaryPlayerIndex: state.turnContext.primaryPlayerIndex,
      specialBuildQueue: [...state.turnContext.specialBuildQueue]
    }
  };
}

function ensureCurrentPlayer(state: GameState, playerId: string): void {
  if (getCurrentPlayer(state).id !== playerId) {
    throw new GameRuleError("game.turn_other_player");
  }
}

function ensurePhase(condition: boolean): void {
  if (!condition) {
    throw new GameRuleError("game.action_phase_not_allowed");
  }
}

function getCurrentPlayer(state: GameState): InternalPlayer {
  return state.players[state.currentPlayerIndex]!;
}

function getPlayer(state: GameState, playerId: string): InternalPlayer {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new GameRuleError("game.unknown_player");
  }
  return player;
}

function getTile(state: GameState, tileId: string): TileView {
  const tile = state.board.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    throw new GameRuleError("game.unknown_tile");
  }
  return tile;
}

function getVertex(state: GameState, vertexId: string): VertexView {
  const vertex = state.board.vertices.find((entry) => entry.id === vertexId);
  if (!vertex) {
    throw new GameRuleError("game.unknown_vertex");
  }
  return vertex;
}

function getEdge(state: GameState, edgeId: string): EdgeView {
  const edge = state.board.edges.find((entry) => entry.id === edgeId);
  if (!edge) {
    throw new GameRuleError("game.unknown_edge");
  }
  return edge;
}
