import type { MatchEvent } from "./events.js";
import type { ErrorDescriptor } from "./errors.js";
import type { GameConfig, RoomGameConfig } from "./gameConfig.js";
import type { Locale } from "./locale.js";
import type { ScenarioId } from "./scenarios.js";

export const RESOURCES = ["brick", "lumber", "ore", "grain", "wool"] as const;
export const PLAYER_COLORS = ["red", "blue", "white", "orange", "green", "purple"] as const;
export const DEVELOPMENT_CARD_TYPES = [
  "knight",
  "victory_point",
  "road_building",
  "year_of_plenty",
  "monopoly"
] as const;
export const PORT_TYPES = ["generic", ...RESOURCES] as const;
export const TILE_KINDS = ["land", "sea", "fog"] as const;
export const TILE_TERRAINS = [...RESOURCES, "desert", "gold", "sea"] as const;
export const TILE_OCCUPANTS = ["robber", "pirate"] as const;
export const ROUTE_TYPES = ["road", "ship", "warship"] as const;
export const ROUTE_BUILD_TYPES = ["road", "ship"] as const;
export const ROUTE_ZONES = ["land", "sea", "coast"] as const;
export const BOARD_SITE_TYPES = ["village", "fortress", "wonder", "landing"] as const;
export const PIRATE_STEAL_TYPES = ["resource", "cloth"] as const;
export const SCENARIO_SETUP_STAGES = ["tiles", "tokens", "ports", "ready"] as const;
export const WONDER_IDS = [
  "great_wall",
  "great_bridge",
  "grand_monument",
  "grand_theater",
  "grand_castle",
  "lighthouse",
  "great_library"
] as const;
export const WONDER_REQUIREMENT_IDS = [
  "great_wall_marker",
  "great_bridge_marker",
  "lighthouse_marker",
  "city_at_port_with_long_route",
  "two_cities",
  "city_and_six_vp"
] as const;

export type Resource = (typeof RESOURCES)[number];
export type PlayerColor = (typeof PLAYER_COLORS)[number];
export type DevelopmentCardType = (typeof DEVELOPMENT_CARD_TYPES)[number];
export type PortType = (typeof PORT_TYPES)[number];
export type TileKind = (typeof TILE_KINDS)[number];
export type TileTerrain = (typeof TILE_TERRAINS)[number];
export type TileOccupant = (typeof TILE_OCCUPANTS)[number];
export type RouteType = (typeof ROUTE_TYPES)[number];
export type RouteBuildType = (typeof ROUTE_BUILD_TYPES)[number];
export type RouteZone = (typeof ROUTE_ZONES)[number];
export type BoardSiteType = (typeof BOARD_SITE_TYPES)[number];
export type PirateStealType = (typeof PIRATE_STEAL_TYPES)[number];
export type ScenarioSetupStage = (typeof SCENARIO_SETUP_STAGES)[number];
export type WonderId = (typeof WONDER_IDS)[number];
export type WonderRequirementId = (typeof WONDER_REQUIREMENT_IDS)[number];
export type UserRole = "user" | "admin";
export type BuildingType = "settlement" | "city";
export type MatchPhase =
  | "room"
  | "scenario_setup"
  | "setup_forward"
  | "setup_reverse"
  | "turn_roll"
  | "turn_action"
  | "special_build"
  | "paired_player_action"
  | "robber_interrupt"
  | "game_over";

export interface ResourceMap extends Record<Resource, number> {}

export interface DevelopmentCardView {
  id: string;
  type: DevelopmentCardType;
  boughtOnTurn: number;
  playable: boolean;
  blockedReason?: "fresh" | "turn_limit" | "no_road_target" | "passive" | "scenario" | null;
}

export interface PendingDevelopmentEffectView {
  type: "road_building";
  remainingRoads: 1 | 2;
}

export interface BuildingView {
  ownerId: string;
  color: PlayerColor;
  type: BuildingType;
}

interface BaseBoardSiteView {
  id: string;
  vertexId: string;
  ownerId?: string | null;
  color?: PlayerColor | null;
  label?: string | null;
}

export type ClothVillageSiteView = BaseBoardSiteView & {
  type: "village";
  scenarioId: "seafarers.cloth_for_catan";
  numberToken: number;
  clothSupply: number;
  initialClothSupply: number;
};

export type PirateFortressSiteView = BaseBoardSiteView & {
  type: "fortress";
  scenarioId: "seafarers.pirate_islands";
  pirateLairCount: number;
  fortressColor?: PlayerColor | null;
  captured: boolean;
};

export type WonderSiteView = BaseBoardSiteView & {
  type: "wonder";
  scenarioId: "seafarers.wonders_of_catan";
  wonderId: WonderId;
  requirementId: WonderRequirementId;
  buildCost: ResourceMap;
  progress: number;
  claimed: boolean;
};

export type LandingSiteView = BaseBoardSiteView & {
  type: "landing";
  scenarioId: "seafarers.pirate_islands";
  beachheadColor?: PlayerColor | null;
};

export type BoardSiteView =
  | ClothVillageSiteView
  | PirateFortressSiteView
  | WonderSiteView
  | LandingSiteView;

export type ForgottenTribeScenarioMarkerView =
  | {
      id: string;
      type: "forgotten_tribe_vp";
      edgeId: string;
      claimedByPlayerId?: string | null;
    }
  | {
      id: string;
      type: "forgotten_tribe_development";
      edgeId: string;
      claimedByPlayerId?: string | null;
    }
  | {
      id: string;
      type: "forgotten_tribe_port";
      edgeId: string;
      portType: PortType;
      claimedByPlayerId?: string | null;
    };

export type IslandRewardScenarioMarkerView = {
  id: string;
  type: "island_reward";
  vertexId: string;
  scenarioId: Exclude<ScenarioId, "base.standard" | "seafarers.cloth_for_catan" | "seafarers.pirate_islands">;
  regionId: string;
  rewardPoints: 1 | 2;
  claimedByPlayerId?: string | null;
};

export type WonderBlockScenarioMarkerView = {
  id: string;
  type: "wonder_block";
  vertexId: string;
  scenarioId: "seafarers.wonders_of_catan";
  marker: "x" | "!";
};

export type ScenarioSetupTilePoolEntry = {
  terrain: TileTerrain;
  remaining: number;
};

export type ScenarioSetupTokenPoolEntry = {
  token: number;
  remaining: number;
};

export type ScenarioSetupPortPoolEntry = {
  portType: PortType;
  remaining: number;
};

export interface ScenarioSetupPlayerView {
  playerId: string;
  ready: boolean;
}

export interface ScenarioSetupView {
  scenarioId: "seafarers.new_world";
  stage: ScenarioSetupStage;
  canEdit: boolean;
  isReady: boolean;
  players: ScenarioSetupPlayerView[];
  tilePool: ScenarioSetupTilePoolEntry[];
  tokenPool: ScenarioSetupTokenPoolEntry[];
  portPool: ScenarioSetupPortPoolEntry[];
  placeableTileIds: string[];
  tokenTileIds: string[];
  portEdgeIds: string[];
  validationErrorCode: string | null;
}

export type ScenarioMarkerView =
  | ForgottenTribeScenarioMarkerView
  | IslandRewardScenarioMarkerView
  | WonderBlockScenarioMarkerView;

export interface PortView {
  id: string;
  edgeId: string;
  vertexIds: [string, string];
  type: PortType;
}

export interface TileView {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  resource: Resource | "desert";
  kind?: TileKind;
  terrain?: TileTerrain | null;
  token: number | null;
  robber: boolean;
  occupant?: TileOccupant | null;
  hidden?: boolean;
  discovered?: boolean;
  vertexIds: string[];
  edgeIds: string[];
}

export interface VertexView {
  id: string;
  x: number;
  y: number;
  tileIds: string[];
  edgeIds: string[];
  adjacentVertexIds: string[];
  building: BuildingView | null;
  portType: PortType | null;
  site?: BoardSiteView | null;
  islandId?: string | null;
  coastal?: boolean;
}

export interface EdgeView {
  id: string;
  vertexIds: [string, string];
  tileIds: string[];
  ownerId: string | null;
  color: PlayerColor | null;
  routeType?: RouteType | null;
  routeZone?: RouteZone;
  roadAllowed?: boolean;
  shipAllowed?: boolean;
  movable?: boolean;
  blockedByPirate?: boolean;
  placedOnTurn?: number | null;
}

export interface BoardView {
  tiles: TileView[];
  vertices: VertexView[];
  edges: EdgeView[];
  ports: PortView[];
  sites?: BoardSiteView[];
  scenarioMarkers?: ScenarioMarkerView[];
}

export interface PlayerSummary {
  id: string;
  username: string;
  color: PlayerColor;
}

export interface PlayerView extends PlayerSummary {
  seatIndex: number;
  connected: boolean;
  disconnectDeadlineAt: number | null;
  resourceCount: number;
  resources?: ResourceMap;
  developmentCardCount: number;
  developmentCards?: DevelopmentCardView[];
  hiddenVictoryPoints?: number;
  publicVictoryPoints: number;
  totalVictoryPoints?: number;
  roadsBuilt: number;
  settlementsBuilt: number;
  citiesBuilt: number;
  playedKnightCount: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  shipsBuilt?: number;
  warshipsBuilt?: number;
  specialVictoryPoints?: number;
  clothCount?: number;
  harborTokenCount?: number;
  harborTokens?: PortType[];
  wonderProgress?: number;
  routeLength?: number;
}

export interface TradeOfferView {
  id: string;
  fromPlayerId: string;
  toPlayerId: string | null;
  targetPlayerId?: string | null;
  give: ResourceMap;
  want: ResourceMap;
  createdAtTurn: number;
}

export interface RobberDiscardStatusView {
  playerId: string;
  requiredCount: number;
  done: boolean;
}

export interface RobberMoveOption {
  tileId: string;
  targetPlayerIds: string[];
  moveType?: TileOccupant;
  pirateStealTypes?: PirateStealType[];
}

export interface MaritimeRate {
  resource: Resource;
  ratio: number;
}

export interface RoutePlacementOption {
  edgeId: string;
  routeType: RouteBuildType;
}

export interface AllowedMoves {
  canRoll: boolean;
  canBuyDevelopmentCard: boolean;
  canEndTurn: boolean;
  canCreateTradeOffer: boolean;
  canMaritimeTrade: boolean;
  initialSettlementVertexIds: string[];
  initialRoadEdgeIds: string[];
  initialRouteOptions: RoutePlacementOption[];
  settlementVertexIds: string[];
  cityVertexIds: string[];
  roadEdgeIds: string[];
  shipEdgeIds: string[];
  movableShipEdgeIds: string[];
  freeRoadEdgeIds: string[];
  freeRouteOptions: RoutePlacementOption[];
  robberMoveOptions: RobberMoveOption[];
  pirateMoveOptions: RobberMoveOption[];
  pirateStealTargetPlayerIds: string[];
  pendingDiscardCount: number;
  playableDevelopmentCards: DevelopmentCardType[];
  maritimeRates: MaritimeRate[];
  acceptableTradeOfferIds: string[];
  declineableTradeOfferIds: string[];
  withdrawableTradeOfferIds: string[];
  goldResourceChoiceCount: number;
  goldResourceChoiceSource: "gold_tile" | "pirate_fleet_reward" | null;
  placeablePortVertexIds: string[];
  wonderVertexIds: string[];
  fortressVertexIds: string[];
}

export interface MatchSnapshot {
  matchId: string;
  roomId: string;
  seed: string;
  schemaVersion: number;
  version: number;
  gameConfig: GameConfig;
  you: string;
  phase: MatchPhase;
  previousPhase: MatchPhase | null;
  currentPlayerId: string;
  turn: number;
  board: BoardView;
  players: PlayerView[];
  bank: ResourceMap;
  dice: [number, number] | null;
  tradeOffers: TradeOfferView[];
  robberDiscardStatus: RobberDiscardStatusView[];
  pendingDevelopmentEffect: PendingDevelopmentEffectView | null;
  allowedMoves: AllowedMoves;
  scenarioSetup: ScenarioSetupView | null;
  publicInitialSettlementVertexIds: string[];
  eventLog: MatchEvent[];
  winnerId: string | null;
}

export interface SeatState {
  index: number;
  userId: string | null;
  username: string | null;
  color: PlayerColor;
  ready: boolean;
}

export interface RoomSummary {
  id: string;
  code: string;
  ownerUserId: string;
  gameConfig: RoomGameConfig;
  status: "open" | "in_match" | "closed";
  matchId: string | null;
  createdAt: string;
}

export interface RoomDetails extends RoomSummary {
  seats: SeatState[];
}

export type ActionIntent =
  | {
      type: "place_initial_settlement";
      vertexId: string;
    }
  | {
      type: "place_initial_road";
      edgeId: string;
      routeType?: RouteBuildType;
    }
  | {
      type: "discard_resources";
      resources: ResourceMap;
    }
  | {
      type: "roll_dice";
    }
  | {
      type: "build_road";
      edgeId: string;
    }
  | {
      type: "build_ship";
      edgeId: string;
    }
  | {
      type: "move_ship";
      fromEdgeId: string;
      toEdgeId: string;
    }
  | {
      type: "build_settlement";
      vertexId: string;
    }
  | {
      type: "build_city";
      vertexId: string;
    }
  | {
      type: "buy_development_card";
    }
  | {
      type: "play_knight";
    }
  | {
      type: "play_road_building";
    }
  | {
      type: "place_free_road";
      edgeId: string;
      routeType?: RouteBuildType;
    }
  | {
      type: "finish_road_building";
    }
  | {
      type: "play_year_of_plenty";
      resources: [Resource, Resource];
    }
  | {
      type: "play_monopoly";
      resource: Resource;
    }
  | {
      type: "move_robber";
      tileId: string;
      targetPlayerId?: string;
    }
  | {
      type: "move_pirate";
      tileId: string;
      targetPlayerId?: string;
      stealType?: PirateStealType;
    }
  | {
      type: "steal_on_seven";
      targetPlayerId: string;
    }
  | {
      type: "choose_gold_resource";
      resources: Resource[];
    }
  | {
      type: "scenario_setup_place_tile";
      tileId: string;
      terrain: TileTerrain;
    }
  | {
      type: "scenario_setup_clear_tile";
      tileId: string;
    }
  | {
      type: "scenario_setup_place_token";
      tileId: string;
      token: number;
    }
  | {
      type: "scenario_setup_clear_token";
      tileId: string;
    }
  | {
      type: "scenario_setup_place_port";
      edgeId: string;
      portType: PortType;
    }
  | {
      type: "scenario_setup_clear_port";
      edgeId: string;
    }
  | {
      type: "scenario_setup_set_ready";
      ready: boolean;
    }
  | {
      type: "place_port_token";
      vertexId: string;
      portType: PortType;
    }
  | {
      type: "claim_wonder";
      vertexId: string;
    }
  | {
      type: "build_wonder_level";
      vertexId: string;
    }
  | {
      type: "attack_fortress";
      vertexId: string;
    }
  | {
      type: "create_trade_offer";
      toPlayerId: string | null;
      give: ResourceMap;
      want: ResourceMap;
    }
  | {
      type: "accept_trade_offer";
      tradeId: string;
    }
  | {
      type: "decline_trade_offer";
      tradeId: string;
    }
  | {
      type: "withdraw_trade_offer";
      tradeId: string;
    }
  | {
      type: "maritime_trade";
      give: Resource;
      receive: ResourceMap;
      giveCount: number;
    }
  | {
      type: "end_turn";
    };

export type ClientMessage =
  | {
      type: "room.subscribe";
      roomId: string;
    }
  | {
      type: "match.reconnect";
      matchId: string;
    }
  | {
      type: "client.ping";
      at: number;
    }
  | {
      type: "match.action";
      matchId: string;
      action: ActionIntent;
    };

export type ServerMessage =
  | {
      type: "room.state";
      room: RoomDetails;
    }
  | {
      type: "server.pong";
      at: number;
    }
  | {
      type: "match.snapshot";
      snapshot: MatchSnapshot;
    }
  | {
      type: "match.event";
      event: MatchEvent;
    }
  | {
      type: "match.error";
      errorCode: string;
      errorParams?: ErrorDescriptor["errorParams"];
      actionType?: ActionIntent["type"];
    }
  | {
      type: "presence.state";
      roomId?: string;
      matchId?: string;
      onlineUserIds: string[];
    };

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  locale: Locale;
}

export interface AdminUserRecord extends AuthUser {
  createdAt: string;
}

export interface AdminMatchSummary {
  id: string;
  roomId: string;
  status: MatchPhase;
  winnerId: string | null;
  playerCount: number;
  createdAt: string;
  updatedAt: string;
}
