import type {
  ActionIntent,
  AllowedMoves,
  DevelopmentCardType,
  EdgeView,
  MatchEvent,
  MatchPhase,
  MatchSnapshot,
  PlayerColor,
  PlayerView,
  Resource,
  ResourceMap,
  RoomDetails,
  TileView,
  TradeOfferView,
  VertexView
} from "@hexagonia/shared";
import {
  DEVELOPMENT_CARD_TYPES,
  PLAYER_COLORS,
  RESOURCES,
  addResources,
  cloneResourceMap,
  createEmptyResourceMap,
  hasResources,
  isEmptyResourceMap,
  subtractResources,
  totalResources
} from "@hexagonia/shared";
import { generateBaseBoard, type GeneratedBoard } from "./board.js";
import { SeededRandom } from "./random.js";

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
  resources: ResourceMap;
  developmentCards: InternalDevelopmentCard[];
  roads: string[];
  settlements: string[];
  cities: string[];
  playedKnightCount: number;
  hasPlayedDevelopmentCardThisTurn: boolean;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
}

interface InternalTradeOffer {
  id: string;
  fromPlayerId: string;
  targetPlayerId: string | null;
  give: ResourceMap;
  want: ResourceMap;
  createdAtTurn: number;
}

interface SetupState {
  direction: "forward" | "reverse";
  stage: "settlement" | "road";
  currentIndex: number;
  pendingSettlementVertexId: string | null;
}

interface RobberState {
  resumePhase: MatchPhase;
  pendingDiscardByPlayerId: Record<string, number>;
}

export interface GameState {
  matchId: string;
  roomId: string;
  seed: string;
  version: number;
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
  currentTrade: InternalTradeOffer | null;
  eventLog: MatchEvent[];
  randomState: number;
  setupState: SetupState | null;
  robberState: RobberState | null;
}

export interface MatchPlayerInput {
  id: string;
  username: string;
  seatIndex: number;
  connected?: boolean;
}

const BUILD_COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { ore: 3, grain: 2 },
  development: { ore: 1, grain: 1, wool: 1 }
} as const;

const RESOURCE_BANK_START = 19;
const DEVELOPMENT_DECK_COUNTS: Record<DevelopmentCardType, number> = {
  knight: 14,
  victory_point: 5,
  road_building: 2,
  year_of_plenty: 2,
  monopoly: 2
};

export class GameRuleError extends Error {}

export function createMatchState(input: {
  matchId: string;
  roomId: string;
  seed: string;
  players: MatchPlayerInput[];
}): GameState {
  const rng = new SeededRandom(input.seed);
  const board = generateBaseBoard(input.seed);
  const developmentDeck = createDevelopmentDeck(rng);

  const players = [...input.players]
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((player, index) => ({
      id: player.id,
      username: player.username,
      color: PLAYER_COLORS[index]!,
      seatIndex: player.seatIndex,
      connected: player.connected ?? true,
      resources: createEmptyResourceMap(),
      developmentCards: [],
      roads: [],
      settlements: [],
      cities: [],
      playedKnightCount: 0,
      hasPlayedDevelopmentCardThisTurn: false,
      hasLongestRoad: false,
      hasLargestArmy: false
    }));

  const state: GameState = {
    matchId: input.matchId,
    roomId: input.roomId,
    seed: input.seed,
    version: 1,
    phase: "setup_forward",
    previousPhase: null,
    turn: 0,
    currentPlayerIndex: 0,
    board,
    players,
    bank: {
      brick: RESOURCE_BANK_START,
      lumber: RESOURCE_BANK_START,
      ore: RESOURCE_BANK_START,
      grain: RESOURCE_BANK_START,
      wool: RESOURCE_BANK_START
    },
    developmentDeck,
    dice: null,
    winnerId: null,
    currentTrade: null,
    eventLog: [],
    randomState: rng.state,
    setupState: {
      direction: "forward",
      stage: "settlement",
      currentIndex: 0,
      pendingSettlementVertexId: null
    },
    robberState: null
  };

  appendEvent(state, {
    type: "match_started",
    payload: {
      players: players.map((player) => ({
        id: player.id,
        username: player.username,
        color: player.color
      }))
    }
  });

  return state;
}

export function createSnapshot(state: GameState, viewerId: string): MatchSnapshot {
  return {
    matchId: state.matchId,
    roomId: state.roomId,
    seed: state.seed,
    version: state.version,
    you: viewerId,
    phase: state.phase,
    previousPhase: state.previousPhase,
    currentPlayerId: getCurrentPlayer(state).id,
    turn: state.turn,
    board: cloneBoard(state.board),
    players: state.players.map((player) => createPlayerView(state, player.id, viewerId)),
    bank: cloneResourceMap(state.bank),
    dice: state.dice,
    currentTrade: state.currentTrade ? toTradeView(state.currentTrade) : null,
    allowedMoves: getAllowedMoves(state, viewerId),
    eventLog: state.eventLog.slice(-25),
    winnerId: state.winnerId
  };
}

export function applyAction(state: GameState, playerId: string, action: ActionIntent): GameState {
  if (state.phase === "game_over") {
    throw new GameRuleError("Das Spiel ist bereits beendet.");
  }

  const next = cloneState(state);

  switch (action.type) {
    case "place_initial_settlement":
      handleInitialSettlement(next, playerId, action.vertexId);
      break;
    case "place_initial_road":
      handleInitialRoad(next, playerId, action.edgeId);
      break;
    case "discard_resources":
      handleDiscardResources(next, playerId, action.resources);
      break;
    case "roll_dice":
      handleRollDice(next, playerId);
      break;
    case "build_road":
      handleBuildRoad(next, playerId, action.edgeId, false);
      break;
    case "build_settlement":
      handleBuildSettlement(next, playerId, action.vertexId);
      break;
    case "build_city":
      handleBuildCity(next, playerId, action.vertexId);
      break;
    case "buy_development_card":
      handleBuyDevelopmentCard(next, playerId);
      break;
    case "play_knight":
      handlePlayKnight(next, playerId);
      break;
    case "play_road_building":
      handlePlayRoadBuilding(next, playerId, action.edgeIds);
      break;
    case "play_year_of_plenty":
      handlePlayYearOfPlenty(next, playerId, action.resources);
      break;
    case "play_monopoly":
      handlePlayMonopoly(next, playerId, action.resource);
      break;
    case "move_robber":
      handleMoveRobber(next, playerId, action.tileId, action.targetPlayerId);
      break;
    case "offer_trade":
      handleOfferTrade(next, playerId, action.targetPlayerId, action.give, action.want);
      break;
    case "respond_trade":
      handleRespondTrade(next, playerId, action.tradeId, action.accept);
      break;
    case "cancel_trade":
      handleCancelTrade(next, playerId, action.tradeId);
      break;
    case "maritime_trade":
      handleMaritimeTrade(next, playerId, action.give, action.receive, action.giveCount);
      break;
    case "end_turn":
      handleEndTurn(next, playerId);
      break;
    default:
      assertNever(action);
  }

  updateAwards(next);
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
  getPlayer(next, playerId).connected = connected;
  return next;
}

export function roomToPlayers(room: RoomDetails): MatchPlayerInput[] {
  return room.seats
    .filter((seat) => seat.userId && seat.username)
    .map((seat) => ({
      id: seat.userId!,
      username: seat.username!,
      seatIndex: seat.index,
      connected: true
    }));
}

function handleInitialSettlement(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(state.phase === "setup_forward" || state.phase === "setup_reverse");
  ensureCurrentPlayer(state, playerId);
  if (!state.setupState || state.setupState.stage !== "settlement") {
    throw new GameRuleError("Aktuell wird keine Start-Siedlung erwartet.");
  }

  if (!getInitialSettlementVertices(state).includes(vertexId)) {
    throw new GameRuleError("Diese Startposition ist nicht erlaubt.");
  }

  placeBuilding(state, playerId, vertexId, "settlement");
  state.setupState.pendingSettlementVertexId = vertexId;
  state.setupState.stage = "road";

  appendEvent(state, {
    type: "initial_settlement_placed",
    byPlayerId: playerId,
    payload: { vertexId }
  });

  if (state.setupState.direction === "reverse") {
    grantInitialResources(state, playerId, vertexId);
  }
}

function handleInitialRoad(state: GameState, playerId: string, edgeId: string): void {
  ensurePhase(state.phase === "setup_forward" || state.phase === "setup_reverse");
  ensureCurrentPlayer(state, playerId);
  if (!state.setupState || state.setupState.stage !== "road" || !state.setupState.pendingSettlementVertexId) {
    throw new GameRuleError("Aktuell wird keine Start-Straße erwartet.");
  }

  const legalEdges = getInitialRoadEdges(state, state.setupState.pendingSettlementVertexId);
  if (!legalEdges.includes(edgeId)) {
    throw new GameRuleError("Diese Startstraße ist nicht erlaubt.");
  }

  placeRoad(state, playerId, edgeId);
  appendEvent(state, {
    type: "initial_road_placed",
    byPlayerId: playerId,
    payload: { edgeId }
  });

  const setup = state.setupState;
  const lastIndex = state.players.length - 1;
  setup.pendingSettlementVertexId = null;
  setup.stage = "settlement";

  if (setup.direction === "forward") {
    if (setup.currentIndex < lastIndex) {
      setup.currentIndex += 1;
      state.currentPlayerIndex = setup.currentIndex;
      return;
    }

    state.phase = "setup_reverse";
    setup.direction = "reverse";
    setup.currentIndex = lastIndex;
    state.currentPlayerIndex = lastIndex;
    return;
  }

  if (setup.currentIndex > 0) {
    setup.currentIndex -= 1;
    state.currentPlayerIndex = setup.currentIndex;
    return;
  }

  state.setupState = null;
  state.phase = "turn_roll";
  state.currentPlayerIndex = 0;
  state.turn = 1;
  state.previousPhase = null;
}

function handleDiscardResources(state: GameState, playerId: string, resources: ResourceMap): void {
  ensurePhase(state.phase === "robber_interrupt");
  const robberState = state.robberState;
  if (!robberState) {
    throw new GameRuleError("Kein Räuberstatus aktiv.");
  }

  const required = robberState.pendingDiscardByPlayerId[playerId] ?? 0;
  if (!required) {
    throw new GameRuleError("Für diesen Spieler ist kein Abwurf offen.");
  }

  const player = getPlayer(state, playerId);
  if (!hasResources(player.resources, resources) || totalResources(resources) !== required) {
    throw new GameRuleError("Der gewählte Abwurf ist ungültig.");
  }

  player.resources = subtractResources(player.resources, resources);
  state.bank = addResources(state.bank, resources);
  robberState.pendingDiscardByPlayerId[playerId] = 0;

  appendEvent(state, {
    type: "resources_discarded",
    byPlayerId: playerId,
    payload: { count: required }
  });
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

  distributeResourcesForRoll(state, total);
  state.phase = "turn_action";
  state.previousPhase = null;
}

function handleBuildRoad(
  state: GameState,
  playerId: string,
  edgeId: string,
  freeBuild: boolean
): void {
  ensurePhase(state.phase === "turn_action");
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
}

function handleBuildSettlement(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(state.phase === "turn_action");
  ensureCurrentPlayer(state, playerId);
  ensureSettlementPlacement(state, playerId, vertexId);
  payCost(state, playerId, BUILD_COSTS.settlement);
  placeBuilding(state, playerId, vertexId, "settlement");

  appendEvent(state, {
    type: "settlement_built",
    byPlayerId: playerId,
    payload: { vertexId }
  });
}

function handleBuildCity(state: GameState, playerId: string, vertexId: string): void {
  ensurePhase(state.phase === "turn_action");
  ensureCurrentPlayer(state, playerId);
  const player = getPlayer(state, playerId);
  if (player.cities.length >= 4) {
    throw new GameRuleError("Es sind keine Städte mehr verfügbar.");
  }

  const vertex = getVertex(state, vertexId);
  if (vertex.building?.ownerId !== playerId || vertex.building.type !== "settlement") {
    throw new GameRuleError("Hier steht keine eigene Siedlung.");
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
  ensurePhase(state.phase === "turn_action");
  ensureCurrentPlayer(state, playerId);
  if (!state.developmentDeck.length) {
    throw new GameRuleError("Der Entwicklungskartenstapel ist leer.");
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
  ensurePhase(state.phase === "turn_action" || state.phase === "turn_roll");
  ensureCurrentPlayer(state, playerId);
  playDevelopmentCard(state, playerId, "knight");

  state.phase = "robber_interrupt";
  state.previousPhase = state.dice ? "turn_action" : "turn_roll";
  state.robberState = {
    resumePhase: state.dice ? "turn_action" : "turn_roll",
    pendingDiscardByPlayerId: {}
  };

  getPlayer(state, playerId).playedKnightCount += 1;
  appendEvent(state, {
    type: "development_card_played",
    byPlayerId: playerId,
    payload: { cardType: "knight" }
  });
}

function handlePlayRoadBuilding(state: GameState, playerId: string, edgeIds: string[]): void {
  ensurePhase(state.phase === "turn_action" || state.phase === "turn_roll");
  ensureCurrentPlayer(state, playerId);
  if (!edgeIds.length || edgeIds.length > 2) {
    throw new GameRuleError("Straßenbau erlaubt eine oder zwei Straßen.");
  }

  playDevelopmentCard(state, playerId, "road_building");
  for (const edgeId of edgeIds) {
    ensureRoadPlacement(state, playerId, edgeId);
    placeRoad(state, playerId, edgeId);
  }

  appendEvent(state, {
    type: "development_card_played",
    byPlayerId: playerId,
    payload: { cardType: "road_building", edgeIds }
  });
}

function handlePlayYearOfPlenty(
  state: GameState,
  playerId: string,
  resources: [Resource, Resource]
): void {
  ensurePhase(state.phase === "turn_action" || state.phase === "turn_roll");
  ensureCurrentPlayer(state, playerId);
  playDevelopmentCard(state, playerId, "year_of_plenty");

  const take = createEmptyResourceMap();
  take[resources[0]] += 1;
  take[resources[1]] += 1;
  if (!hasResources(state.bank, take)) {
    throw new GameRuleError("Die Bank kann diese Rohstoffe nicht ausgeben.");
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
  ensurePhase(state.phase === "turn_action" || state.phase === "turn_roll");
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
    throw new GameRuleError("Kein aktiver Räuberstatus.");
  }
  if (hasPendingDiscard(state)) {
    throw new GameRuleError("Zuerst müssen alle geforderten Karten abgeworfen werden.");
  }

  const currentRobberTile = state.board.tiles.find((tile) => tile.robber)!;
  if (currentRobberTile.id === tileId) {
    throw new GameRuleError("Der Räuber muss auf ein anderes Feld bewegt werden.");
  }

  currentRobberTile.robber = false;
  getTile(state, tileId).robber = true;

  const victims = getRobberStealTargets(state, playerId, tileId);
  if (victims.length > 0) {
    const fallbackVictimId = victims[0]!;
    const victimId = targetPlayerId ?? fallbackVictimId;
    if (!victims.includes(victimId)) {
      throw new GameRuleError("Von diesem Spieler kann hier nicht gestohlen werden.");
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

function handleOfferTrade(
  state: GameState,
  playerId: string,
  targetPlayerId: string | null,
  give: ResourceMap,
  want: ResourceMap
): void {
  ensurePhase(state.phase === "turn_action");
  ensureCurrentPlayer(state, playerId);
  if (isEmptyResourceMap(give) || isEmptyResourceMap(want)) {
    throw new GameRuleError("Ein Handel muss Geben und Nehmen enthalten.");
  }

  const player = getPlayer(state, playerId);
  if (!hasResources(player.resources, give)) {
    throw new GameRuleError("Diese Rohstoffe sind nicht verfügbar.");
  }
  if (targetPlayerId && !state.players.some((entry) => entry.id === targetPlayerId)) {
    throw new GameRuleError("Ungültiger Handelspartner.");
  }

  state.currentTrade = {
    id: `trade-${state.version + 1}`,
    fromPlayerId: playerId,
    targetPlayerId,
    give: cloneResourceMap(give),
    want: cloneResourceMap(want),
    createdAtTurn: state.turn
  };
  state.phase = "trade_resolution";
  state.previousPhase = "turn_action";

  appendEvent(state, {
    type: "trade_offered",
    byPlayerId: playerId,
    payload: { tradeId: state.currentTrade.id, targetPlayerId }
  });
}

function handleRespondTrade(
  state: GameState,
  playerId: string,
  tradeId: string,
  accept: boolean
): void {
  ensurePhase(state.phase === "trade_resolution");
  const trade = state.currentTrade;
  if (!trade || trade.id !== tradeId) {
    throw new GameRuleError("Dieser Handel ist nicht mehr aktiv.");
  }
  if (trade.fromPlayerId === playerId) {
    throw new GameRuleError("Der anbietende Spieler kann den Handel nicht annehmen.");
  }
  if (trade.targetPlayerId && trade.targetPlayerId !== playerId) {
    throw new GameRuleError("Dieser Handel ist an einen anderen Spieler gerichtet.");
  }

  if (!accept) {
    appendEvent(state, {
      type: "trade_declined",
      byPlayerId: playerId,
      payload: { tradeId }
    });
    return;
  }

  const proposer = getPlayer(state, trade.fromPlayerId);
  const responder = getPlayer(state, playerId);
  if (!hasResources(proposer.resources, trade.give) || !hasResources(responder.resources, trade.want)) {
    throw new GameRuleError("Einer der Spieler hat nicht mehr genügend Rohstoffe.");
  }

  proposer.resources = subtractResources(proposer.resources, trade.give);
  proposer.resources = addResources(proposer.resources, trade.want);
  responder.resources = subtractResources(responder.resources, trade.want);
  responder.resources = addResources(responder.resources, trade.give);

  state.currentTrade = null;
  state.phase = "turn_action";
  state.previousPhase = null;

  appendEvent(state, {
    type: "trade_completed",
    byPlayerId: playerId,
    payload: { tradeId, fromPlayerId: trade.fromPlayerId }
  });
}

function handleCancelTrade(state: GameState, playerId: string, tradeId: string): void {
  ensurePhase(state.phase === "trade_resolution");
  const trade = state.currentTrade;
  if (!trade || trade.id !== tradeId) {
    throw new GameRuleError("Dieser Handel ist nicht aktiv.");
  }
  if (trade.fromPlayerId !== playerId) {
    throw new GameRuleError("Nur der anbietende Spieler kann abbrechen.");
  }

  state.currentTrade = null;
  state.phase = "turn_action";
  state.previousPhase = null;

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
  receive: Resource,
  giveCount: number
): void {
  ensurePhase(state.phase === "turn_action");
  ensureCurrentPlayer(state, playerId);
  if (give === receive) {
    throw new GameRuleError("Es müssen unterschiedliche Rohstoffe gehandelt werden.");
  }

  const ratio = getMaritimeRate(state, playerId, give);
  if (giveCount !== ratio) {
    throw new GameRuleError("Der gewählte Hafenkurs ist ungültig.");
  }

  const payment = createEmptyResourceMap();
  payment[give] = giveCount;
  const reward = createEmptyResourceMap();
  reward[receive] = 1;
  const player = getPlayer(state, playerId);

  if (!hasResources(player.resources, payment) || !hasResources(state.bank, reward)) {
    throw new GameRuleError("Der Hafenhandel ist mit diesen Beständen nicht möglich.");
  }

  player.resources = subtractResources(player.resources, payment);
  player.resources = addResources(player.resources, reward);
  state.bank = addResources(state.bank, payment);
  state.bank = subtractResources(state.bank, reward);

  appendEvent(state, {
    type: "maritime_trade",
    byPlayerId: playerId,
    payload: { give, receive, giveCount }
  });
}

function handleEndTurn(state: GameState, playerId: string): void {
  ensurePhase(state.phase === "turn_action");
  ensureCurrentPlayer(state, playerId);
  if (state.currentTrade) {
    throw new GameRuleError("Ein aktiver Handel muss zuerst beendet werden.");
  }

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turn += 1;
  state.phase = "turn_roll";
  state.previousPhase = null;
  state.dice = null;
  for (const player of state.players) {
    player.hasPlayedDevelopmentCardThisTurn = false;
  }

  appendEvent(state, {
    type: "turn_ended",
    byPlayerId: playerId,
    payload: { nextPlayerId: getCurrentPlayer(state).id, turn: state.turn }
  });
}

function placeRoad(state: GameState, playerId: string, edgeId: string): void {
  const player = getPlayer(state, playerId);
  if (player.roads.length >= 15) {
    throw new GameRuleError("Es sind keine Straßen mehr verfügbar.");
  }

  const edge = getEdge(state, edgeId);
  edge.ownerId = playerId;
  edge.color = player.color;
  player.roads.push(edgeId);
}

function placeBuilding(
  state: GameState,
  playerId: string,
  vertexId: string,
  type: "settlement" | "city"
): void {
  const player = getPlayer(state, playerId);
  if (type === "settlement" && player.settlements.length >= 5) {
    throw new GameRuleError("Es sind keine Siedlungen mehr verfügbar.");
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

function distributeResourcesForRoll(state: GameState, roll: number): void {
  const demandByResource = new Map<Resource, number>();
  const grantByPlayerId = new Map<string, ResourceMap>();

  for (const tile of state.board.tiles) {
    if (tile.resource === "desert" || tile.robber || tile.token !== roll) {
      continue;
    }

    for (const vertexId of tile.vertexIds) {
      const vertex = getVertex(state, vertexId);
      if (!vertex.building) {
        continue;
      }

      const amount = vertex.building.type === "city" ? 2 : 1;
      const grant = grantByPlayerId.get(vertex.building.ownerId) ?? createEmptyResourceMap();
      grant[tile.resource] += amount;
      grantByPlayerId.set(vertex.building.ownerId, grant);
      demandByResource.set(tile.resource, (demandByResource.get(tile.resource) ?? 0) + amount);
    }
  }

  for (const resource of RESOURCES) {
    const demand = demandByResource.get(resource) ?? 0;
    if (demand > state.bank[resource]) {
      for (const grant of grantByPlayerId.values()) {
        grant[resource] = 0;
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
    payload: { roll }
  });
}

function updateAwards(state: GameState): void {
  updateLargestArmy(state);
  updateLongestRoad(state);
}

function updateLargestArmy(state: GameState): void {
  const sorted = [...state.players].sort((left, right) => right.playedKnightCount - left.playedKnightCount);
  const leader = sorted[0];
  if (!leader || leader.playedKnightCount < 3) {
    state.players.forEach((player) => {
      player.hasLargestArmy = false;
    });
    return;
  }

  const runnerUp = sorted[1];
  const currentHolder = state.players.find((player) => player.hasLargestArmy) ?? null;
  const canTake =
    !runnerUp ||
    leader.playedKnightCount > runnerUp.playedKnightCount ||
    currentHolder?.id === leader.id;

  if (!canTake) {
    return;
  }

  state.players.forEach((player) => {
    player.hasLargestArmy = player.id === leader.id;
  });
}

function updateLongestRoad(state: GameState): void {
  const lengths = state.players.map((player) => ({
    playerId: player.id,
    length: calculateLongestRoad(state, player.id)
  }));
  lengths.sort((left, right) => right.length - left.length);
  const leader = lengths[0];
  if (!leader || leader.length < 5) {
    state.players.forEach((player) => {
      player.hasLongestRoad = false;
    });
    return;
  }

  const runnerUp = lengths[1];
  const currentHolder = state.players.find((player) => player.hasLongestRoad) ?? null;
  const canTake =
    !runnerUp || leader.length > runnerUp.length || currentHolder?.id === leader.playerId;

  if (!canTake) {
    return;
  }

  state.players.forEach((player) => {
    player.hasLongestRoad = player.id === leader.playerId;
  });
}

function maybeDeclareWinner(state: GameState): void {
  if (state.winnerId) {
    return;
  }

  const winner = state.players.find((player) => getVictoryPoints(state, player.id) >= 10);
  if (!winner) {
    return;
  }

  state.winnerId = winner.id;
  state.phase = "game_over";
  appendEvent(state, {
    type: "game_won",
    byPlayerId: winner.id,
    payload: { victoryPoints: getVictoryPoints(state, winner.id) }
  });
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
    resourceCount: totalResources(player.resources),
    developmentCardCount: player.developmentCards.length,
    publicVictoryPoints: getPublicVictoryPoints(state, player.id),
    roadsBuilt: player.roads.length,
    settlementsBuilt: player.settlements.length,
    citiesBuilt: player.cities.length,
    playedKnightCount: player.playedKnightCount,
    hasLongestRoad: player.hasLongestRoad,
    hasLargestArmy: player.hasLargestArmy
  };

  if (isSelf) {
    view.resources = cloneResourceMap(player.resources);
    view.developmentCards = player.developmentCards.map((card) => ({
      id: card.id,
      type: card.type,
      boughtOnTurn: card.boughtOnTurn,
      playable:
        card.type !== "victory_point" &&
        card.boughtOnTurn < state.turn &&
        !player.hasPlayedDevelopmentCardThisTurn
    }));
    view.hiddenVictoryPoints = player.developmentCards.filter(
      (card) => card.type === "victory_point"
    ).length;
    view.totalVictoryPoints = getVictoryPoints(state, player.id);
  }

  return view;
}

function getAllowedMoves(state: GameState, playerId: string): AllowedMoves {
  const isCurrentPlayer = getCurrentPlayer(state).id === playerId;
  const pendingDiscardCount = state.robberState?.pendingDiscardByPlayerId[playerId] ?? 0;

  return {
    canRoll: state.phase === "turn_roll" && isCurrentPlayer,
    canBuyDevelopmentCard:
      state.phase === "turn_action" &&
      isCurrentPlayer &&
      state.developmentDeck.length > 0 &&
      hasResources(getPlayer(state, playerId).resources, BUILD_COSTS.development),
    canEndTurn: state.phase === "turn_action" && isCurrentPlayer && !state.currentTrade,
    canOfferTrade: state.phase === "turn_action" && isCurrentPlayer,
    initialSettlementVertexIds:
      isCurrentPlayer &&
      !!state.setupState &&
      state.setupState.stage === "settlement" &&
      (state.phase === "setup_forward" || state.phase === "setup_reverse")
        ? getInitialSettlementVertices(state)
        : [],
    initialRoadEdgeIds:
      isCurrentPlayer &&
      !!state.setupState &&
      state.setupState.stage === "road" &&
      !!state.setupState.pendingSettlementVertexId
        ? getInitialRoadEdges(state, state.setupState.pendingSettlementVertexId)
        : [],
    settlementVertexIds:
      isCurrentPlayer && state.phase === "turn_action" ? getLegalSettlementVertices(state, playerId) : [],
    cityVertexIds:
      isCurrentPlayer && state.phase === "turn_action" ? getUpgradeableCityVertices(state, playerId) : [],
    roadEdgeIds:
      isCurrentPlayer && state.phase === "turn_action" ? getLegalRoadEdges(state, playerId) : [],
    robberMoveOptions:
      isCurrentPlayer &&
      state.phase === "robber_interrupt" &&
      pendingDiscardCount === 0 &&
      !hasPendingDiscard(state)
        ? getRobberMoveOptions(state, playerId)
        : [],
    pendingDiscardCount,
    playableDevelopmentCards:
      isCurrentPlayer && (state.phase === "turn_action" || state.phase === "turn_roll")
        ? getPlayableDevelopmentCards(state, playerId)
        : [],
    maritimeRates: RESOURCES.map((resource) => ({
      resource,
      ratio: getMaritimeRate(state, playerId, resource)
    }))
  };
}

function getInitialSettlementVertices(state: GameState): string[] {
  return state.board.vertices
    .filter((vertex) => isSettlementVertexOpen(state, vertex.id))
    .map((vertex) => vertex.id);
}

function getInitialRoadEdges(state: GameState, settlementVertexId: string): string[] {
  return state.board.edges
    .filter((edge) => !edge.ownerId && edge.vertexIds.includes(settlementVertexId))
    .map((edge) => edge.id);
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
  const currentRobberTileId = state.board.tiles.find((tile) => tile.robber)?.id ?? "";
  return state.board.tiles
    .filter((tile) => tile.id !== currentRobberTileId)
    .map((tile) => ({
      tileId: tile.id,
      targetPlayerIds: getRobberStealTargets(state, playerId, tile.id)
    }));
}

function getPlayableDevelopmentCards(state: GameState, playerId: string): DevelopmentCardType[] {
  const player = getPlayer(state, playerId);
  if (player.hasPlayedDevelopmentCardThisTurn) {
    return [];
  }

  const types = new Set<DevelopmentCardType>();
  for (const card of player.developmentCards) {
    if (card.type === "victory_point" || card.boughtOnTurn >= state.turn) {
      continue;
    }
    types.add(card.type);
  }
  return [...types];
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

function ensureRoadPlacement(state: GameState, playerId: string, edgeId: string): void {
  const edge = getEdge(state, edgeId);
  if (edge.ownerId) {
    throw new GameRuleError("Die Straße ist bereits belegt.");
  }

  const connected = edge.vertexIds.some((vertexId) => {
    const vertex = getVertex(state, vertexId);
    if (vertex.building?.ownerId === playerId) {
      return true;
    }
    if (vertex.building && vertex.building.ownerId !== playerId) {
      return false;
    }
    return vertex.edgeIds.some((candidateEdgeId) => getEdge(state, candidateEdgeId).ownerId === playerId);
  });

  if (!connected) {
    throw new GameRuleError("Straßen müssen an das eigene Netz anschließen.");
  }
}

function ensureSettlementPlacement(state: GameState, playerId: string, vertexId: string): void {
  if (!isSettlementVertexOpen(state, vertexId)) {
    throw new GameRuleError("Diese Kreuzung ist nicht frei.");
  }

  const vertex = getVertex(state, vertexId);
  if (!vertex.edgeIds.some((edgeId) => getEdge(state, edgeId).ownerId === playerId)) {
    throw new GameRuleError("Neue Siedlungen müssen an eine eigene Straße grenzen.");
  }
}

function isSettlementVertexOpen(state: GameState, vertexId: string): boolean {
  const vertex = getVertex(state, vertexId);
  if (vertex.building) {
    return false;
  }
  return vertex.adjacentVertexIds.every((neighborId) => !getVertex(state, neighborId).building);
}

function playDevelopmentCard(
  state: GameState,
  playerId: string,
  type: DevelopmentCardType
): void {
  const player = getPlayer(state, playerId);
  if (player.hasPlayedDevelopmentCardThisTurn) {
    throw new GameRuleError("Es darf nur eine Entwicklungskarte pro Zug gespielt werden.");
  }

  const cardIndex = player.developmentCards.findIndex(
    (card) => card.type === type && card.boughtOnTurn < state.turn
  );
  if (cardIndex === -1) {
    throw new GameRuleError("Diese Entwicklungskarte ist aktuell nicht spielbar.");
  }

  player.developmentCards.splice(cardIndex, 1);
  player.hasPlayedDevelopmentCardThisTurn = true;
}

function payCost(state: GameState, playerId: string, cost: Partial<ResourceMap>): void {
  const player = getPlayer(state, playerId);
  if (!hasResources(player.resources, cost)) {
    throw new GameRuleError("Nicht genügend Rohstoffe vorhanden.");
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

function createDevelopmentDeck(rng: SeededRandom): InternalDevelopmentCard[] {
  const deck: InternalDevelopmentCard[] = [];
  let index = 0;
  for (const type of DEVELOPMENT_CARD_TYPES) {
    for (let count = 0; count < DEVELOPMENT_DECK_COUNTS[type]; count += 1) {
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

function calculateLongestRoad(state: GameState, playerId: string): number {
  const roadIds = getPlayer(state, playerId).roads;
  let longest = 0;
  for (const roadId of roadIds) {
    const edge = getEdge(state, roadId);
    longest = Math.max(
      longest,
      dfsRoad(state, playerId, edge.vertexIds[0], new Set([edge.id])),
      dfsRoad(state, playerId, edge.vertexIds[1], new Set([edge.id]))
    );
  }
  return longest;
}

function dfsRoad(
  state: GameState,
  playerId: string,
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

    const nextVertexId = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    const nextUsedEdges = new Set(usedEdges);
    nextUsedEdges.add(edge.id);
    best = Math.max(best, dfsRoad(state, playerId, nextVertexId, nextUsedEdges));
  }

  return best;
}

function getPublicVictoryPoints(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  return (
    player.settlements.length +
    player.cities.length * 2 +
    (player.hasLargestArmy ? 2 : 0) +
    (player.hasLongestRoad ? 2 : 0)
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

function appendEvent(
  state: GameState,
  input: {
    type: string;
    payload: Record<string, unknown>;
    byPlayerId?: string;
  }
): void {
  const event: MatchEvent = {
    id: `event-${state.eventLog.length + 1}`,
    type: input.type,
    atTurn: state.turn,
    payload: input.payload
  };

  if (input.byPlayerId) {
    event.byPlayerId = input.byPlayerId;
  }

  state.eventLog.push(event);
}

function toTradeView(trade: InternalTradeOffer): TradeOfferView {
  return {
    id: trade.id,
    fromPlayerId: trade.fromPlayerId,
    targetPlayerId: trade.targetPlayerId,
    give: cloneResourceMap(trade.give),
    want: cloneResourceMap(trade.want),
    createdAtTurn: trade.createdAtTurn
  };
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
      building: vertex.building ? { ...vertex.building } : null
    })),
    edges: board.edges.map((edge) => ({
      ...edge,
      vertexIds: [...edge.vertexIds] as [string, string],
      tileIds: [...edge.tileIds]
    })),
    ports: board.ports.map((port) => ({
      ...port,
      vertexIds: [...port.vertexIds] as [string, string]
    }))
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: cloneBoard(state.board),
    players: state.players.map((player) => ({
      ...player,
      resources: cloneResourceMap(player.resources),
      developmentCards: player.developmentCards.map((card) => ({ ...card })),
      roads: [...player.roads],
      settlements: [...player.settlements],
      cities: [...player.cities]
    })),
    bank: cloneResourceMap(state.bank),
    developmentDeck: state.developmentDeck.map((card) => ({ ...card })),
    currentTrade: state.currentTrade
      ? {
          ...state.currentTrade,
          give: cloneResourceMap(state.currentTrade.give),
          want: cloneResourceMap(state.currentTrade.want)
        }
      : null,
    eventLog: state.eventLog.map((event) => ({
      ...event,
      payload: structuredClone(event.payload)
    })),
    setupState: state.setupState ? { ...state.setupState } : null,
    robberState: state.robberState
      ? {
          resumePhase: state.robberState.resumePhase,
          pendingDiscardByPlayerId: { ...state.robberState.pendingDiscardByPlayerId }
        }
      : null
  };
}

function ensureCurrentPlayer(state: GameState, playerId: string): void {
  if (getCurrentPlayer(state).id !== playerId) {
    throw new GameRuleError("Dieser Zug gehört einem anderen Spieler.");
  }
}

function ensurePhase(condition: boolean): void {
  if (!condition) {
    throw new GameRuleError("Diese Aktion ist in der aktuellen Spielphase nicht erlaubt.");
  }
}

function getCurrentPlayer(state: GameState): InternalPlayer {
  return state.players[state.currentPlayerIndex]!;
}

function getPlayer(state: GameState, playerId: string): InternalPlayer {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new GameRuleError("Unbekannter Spieler.");
  }
  return player;
}

function getTile(state: GameState, tileId: string): TileView {
  const tile = state.board.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    throw new GameRuleError("Unbekanntes Feld.");
  }
  return tile;
}

function getVertex(state: GameState, vertexId: string): VertexView {
  const vertex = state.board.vertices.find((entry) => entry.id === vertexId);
  if (!vertex) {
    throw new GameRuleError("Unbekannte Kreuzung.");
  }
  return vertex;
}

function getEdge(state: GameState, edgeId: string): EdgeView {
  const edge = state.board.edges.find((entry) => entry.id === edgeId);
  if (!edge) {
    throw new GameRuleError("Unbekannte Kante.");
  }
  return edge;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(value)}`);
}
