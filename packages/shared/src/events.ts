import type { GameConfig } from "./gameConfig.js";
import type {
  DevelopmentCardType,
  PlayerColor,
  Resource,
  ResourceMap
} from "./game.js";

export interface StartingPlayerRollRound {
  contenderPlayerIds: string[];
  leaderPlayerIds: string[];
  highestTotal: number;
  rolls: Array<{
    playerId: string;
    username: string;
    seatIndex: number;
    dice: [number, number];
    total: number;
  }>;
}

export interface StartingPlayerRollResult {
  winnerPlayerId: string;
  winnerSeatIndex: number;
  rounds: StartingPlayerRollRound[];
}

interface BaseMatchEvent<TType extends string, TPayload extends Record<string, unknown>> {
  id: string;
  type: TType;
  atTurn: number;
  byPlayerId?: string;
  payload: TPayload;
}

export type MatchEvent =
  | BaseMatchEvent<
      "starting_player_rolled",
      {
        winnerPlayerId: string;
        winnerSeatIndex: number;
        rounds: StartingPlayerRollRound[];
      }
    >
  | BaseMatchEvent<
      "match_started",
      {
        players: Array<{
          id: string;
          username: string;
          color: PlayerColor;
        }>;
        gameConfig: GameConfig;
        startingPlayerId: string | null;
      }
    >
  | BaseMatchEvent<
      "beginner_setup_applied",
      {
        players: Array<{
          id: string;
          color: PlayerColor;
        }>;
      }
    >
  | BaseMatchEvent<"initial_settlement_placed", { vertexId: string }>
  | BaseMatchEvent<"initial_road_placed", { edgeId: string }>
  | BaseMatchEvent<"initial_resources_granted", { resources: ResourceMap }>
  | BaseMatchEvent<"resources_discarded", { count: number }>
  | BaseMatchEvent<"dice_rolled", { dice: [number, number]; total: number }>
  | BaseMatchEvent<
      "resources_distributed",
      {
        roll: number;
        dice: [number, number];
        tileIds: string[];
        grantsByPlayerId: Record<string, ResourceMap>;
        blockedResources: Resource[];
      }
    >
  | BaseMatchEvent<"road_built", { edgeId: string; freeBuild: boolean }>
  | BaseMatchEvent<"settlement_built", { vertexId: string }>
  | BaseMatchEvent<"city_built", { vertexId: string }>
  | BaseMatchEvent<"development_card_bought", { remaining: number }>
  | BaseMatchEvent<
      "development_card_played",
      | { cardType: "knight" }
      | { cardType: "road_building" }
      | { cardType: "year_of_plenty"; resources: [Resource, Resource] }
      | { cardType: "monopoly"; resource: Resource; total: number }
    >
  | BaseMatchEvent<
      "robber_moved",
      {
        tileId: string;
        targetPlayerId: string | null;
      }
    >
  | BaseMatchEvent<
      "trade_offered",
      {
        tradeId: string;
        toPlayerId: string | null;
      }
    >
  | BaseMatchEvent<
      "trade_completed",
      {
        tradeId: string;
        fromPlayerId: string;
      }
    >
  | BaseMatchEvent<"trade_declined", { tradeId: string }>
  | BaseMatchEvent<"trade_cancelled", { tradeId: string }>
  | BaseMatchEvent<
      "maritime_trade",
      {
        give: Resource;
        receive: ResourceMap;
        giveCount: number;
      }
    >
  | BaseMatchEvent<
      "special_build_started",
      {
        primaryPlayerId: string;
        builderPlayerId: string;
      }
    >
  | BaseMatchEvent<
      "paired_player_started",
      {
        primaryPlayerId: string;
        secondaryPlayerId: string;
      }
    >
  | BaseMatchEvent<
      "turn_ended",
      {
        nextPlayerId: string;
        turn: number;
      }
    >
  | BaseMatchEvent<
      "longest_road_awarded",
      {
        previousPlayerId: string | null;
        length: number;
        publicVictoryPoints: number;
        edgeIds: string[];
      }
    >
  | BaseMatchEvent<
      "longest_road_lost",
      {
        nextPlayerId: string | null;
        length: number;
        publicVictoryPoints: number;
      }
    >
  | BaseMatchEvent<
      "largest_army_awarded",
      {
        previousPlayerId: string | null;
        knightCount: number;
        publicVictoryPoints: number;
        vertexIds: string[];
      }
    >
  | BaseMatchEvent<
      "largest_army_lost",
      {
        nextPlayerId: string | null;
        knightCount: number;
        publicVictoryPoints: number;
      }
    >
  | BaseMatchEvent<"game_won", { victoryPoints: number }>;

export type MatchEventType = MatchEvent["type"];
export type MatchEventOf<TType extends MatchEventType> = Extract<MatchEvent, { type: TType }>;
export type MatchEventInput = MatchEvent extends infer TEvent
  ? TEvent extends MatchEvent
    ? Omit<TEvent, "id" | "atTurn">
    : never
  : never;
