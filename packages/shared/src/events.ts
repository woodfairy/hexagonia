import type { GameConfig } from "./gameConfig.js";
import type {
  DevelopmentCardType,
  PirateStealType,
  PortType,
  PlayerColor,
  RouteBuildType,
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

export type ScenarioRewardType =
  | "forgotten_tribe_vp"
  | "forgotten_tribe_development"
  | "forgotten_tribe_port"
  | "cloth_village"
  | "island_reward_1"
  | "island_reward_2";

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
  | BaseMatchEvent<"initial_road_placed", { edgeId: string; routeType: RouteBuildType }>
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
  | BaseMatchEvent<"ship_built", { edgeId: string; routeType: "ship" | "warship"; freeBuild: boolean }>
  | BaseMatchEvent<"ship_moved", { fromEdgeId: string; toEdgeId: string }>
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
      "pirate_moved",
      {
        tileId: string;
        targetPlayerId: string | null;
        stealType?: PirateStealType;
      }
    >
  | BaseMatchEvent<
      "pirate_fleet_moved",
      {
        tileId: string;
        distance: number;
        strength: number;
      }
    >
  | BaseMatchEvent<
      "pirate_fleet_attacked",
      {
        tileId: string;
        targetPlayerId: string;
        pirateStrength: number;
        playerStrength: number;
        outcome: "won" | "lost" | "tied";
        discardCount?: number;
      }
    >
  | BaseMatchEvent<"pirate_seven_stolen", { targetPlayerId: string }>
  | BaseMatchEvent<"warship_converted", { edgeId: string }>
  | BaseMatchEvent<"gold_resource_chosen", { resources: Resource[] }>
  | BaseMatchEvent<"scenario_setup_completed", { scenarioId: "seafarers.new_world" }>
  | BaseMatchEvent<"harbor_token_placed", { vertexId: string; portType: PortType }>
  | BaseMatchEvent<"scenario_reward_claimed", { rewardType: ScenarioRewardType; markerId: string }>
  | BaseMatchEvent<"wonder_claimed", { vertexId: string }>
  | BaseMatchEvent<"wonder_level_built", { vertexId: string; level: number }>
  | BaseMatchEvent<"fortress_attacked", { vertexId: string; strength: number; defeated: boolean }>
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
