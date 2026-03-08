import type { MatchEvent } from "./events.js";
import type { GameConfig, RoomGameConfig } from "./gameConfig.js";

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

export type Resource = (typeof RESOURCES)[number];
export type PlayerColor = (typeof PLAYER_COLORS)[number];
export type DevelopmentCardType = (typeof DEVELOPMENT_CARD_TYPES)[number];
export type PortType = (typeof PORT_TYPES)[number];
export type UserRole = "user" | "admin";
export type BuildingType = "settlement" | "city";
export type MatchPhase =
  | "room"
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
  blockedReason?: "fresh" | "turn_limit" | "no_road_target" | "passive" | null;
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
  token: number | null;
  robber: boolean;
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
}

export interface EdgeView {
  id: string;
  vertexIds: [string, string];
  tileIds: string[];
  ownerId: string | null;
  color: PlayerColor | null;
}

export interface BoardView {
  tiles: TileView[];
  vertices: VertexView[];
  edges: EdgeView[];
  ports: PortView[];
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
}

export interface MaritimeRate {
  resource: Resource;
  ratio: number;
}

export interface AllowedMoves {
  canRoll: boolean;
  canBuyDevelopmentCard: boolean;
  canEndTurn: boolean;
  canCreateTradeOffer: boolean;
  canMaritimeTrade: boolean;
  initialSettlementVertexIds: string[];
  initialRoadEdgeIds: string[];
  settlementVertexIds: string[];
  cityVertexIds: string[];
  roadEdgeIds: string[];
  freeRoadEdgeIds: string[];
  robberMoveOptions: RobberMoveOption[];
  pendingDiscardCount: number;
  playableDevelopmentCards: DevelopmentCardType[];
  maritimeRates: MaritimeRate[];
  acceptableTradeOfferIds: string[];
  declineableTradeOfferIds: string[];
  withdrawableTradeOfferIds: string[];
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
      receive: Resource;
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
      error: string;
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
