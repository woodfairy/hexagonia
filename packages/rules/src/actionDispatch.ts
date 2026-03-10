import type { ActionIntent, Resource, ResourceMap } from "@hexagonia/shared";

export interface ActionHandlerSet<TState> {
  handleInitialSettlement(state: TState, playerId: string, vertexId: string): void;
  handleInitialRoad(state: TState, playerId: string, edgeId: string): void;
  handleDiscardResources(state: TState, playerId: string, resources: ResourceMap): void;
  handleRollDice(state: TState, playerId: string): void;
  handleBuildRoad(state: TState, playerId: string, edgeId: string, freeBuild: boolean): void;
  handleBuildSettlement(state: TState, playerId: string, vertexId: string): void;
  handleBuildCity(state: TState, playerId: string, vertexId: string): void;
  handleBuyDevelopmentCard(state: TState, playerId: string): void;
  handlePlayKnight(state: TState, playerId: string): void;
  handlePlayRoadBuilding(state: TState, playerId: string): void;
  handlePlaceFreeRoad(state: TState, playerId: string, edgeId: string): void;
  handleFinishRoadBuilding(state: TState, playerId: string): void;
  handlePlayYearOfPlenty(state: TState, playerId: string, resources: [Resource, Resource]): void;
  handlePlayMonopoly(state: TState, playerId: string, resource: Resource): void;
  handleMoveRobber(state: TState, playerId: string, tileId: string, targetPlayerId?: string): void;
  handleCreateTradeOffer(
    state: TState,
    playerId: string,
    toPlayerId: string | null,
    give: ResourceMap,
    want: ResourceMap
  ): void;
  handleAcceptTradeOffer(state: TState, playerId: string, tradeId: string): void;
  handleDeclineTradeOffer(state: TState, playerId: string, tradeId: string): void;
  handleWithdrawTradeOffer(state: TState, playerId: string, tradeId: string): void;
  handleMaritimeTrade(
    state: TState,
    playerId: string,
    give: Resource,
    receive: ResourceMap,
    giveCount: number
  ): void;
  handleEndTurn(state: TState, playerId: string): void;
}

export function applySetupAction<TState>(
  handlers: ActionHandlerSet<TState>,
  state: TState,
  playerId: string,
  action: ActionIntent
): boolean {
  switch (action.type) {
    case "place_initial_settlement":
      handlers.handleInitialSettlement(state, playerId, action.vertexId);
      return true;
    case "place_initial_road":
      handlers.handleInitialRoad(state, playerId, action.edgeId);
      return true;
    default:
      return false;
  }
}

export function applyRobberAction<TState>(
  handlers: ActionHandlerSet<TState>,
  state: TState,
  playerId: string,
  action: ActionIntent
): boolean {
  switch (action.type) {
    case "discard_resources":
      handlers.handleDiscardResources(state, playerId, action.resources);
      return true;
    case "move_robber":
      handlers.handleMoveRobber(state, playerId, action.tileId, action.targetPlayerId);
      return true;
    default:
      return false;
  }
}

export function applyBuildAction<TState>(
  handlers: ActionHandlerSet<TState>,
  state: TState,
  playerId: string,
  action: ActionIntent
): boolean {
  switch (action.type) {
    case "build_road":
      handlers.handleBuildRoad(state, playerId, action.edgeId, false);
      return true;
    case "build_settlement":
      handlers.handleBuildSettlement(state, playerId, action.vertexId);
      return true;
    case "build_city":
      handlers.handleBuildCity(state, playerId, action.vertexId);
      return true;
    default:
      return false;
  }
}

export function applyDevelopmentAction<TState>(
  handlers: ActionHandlerSet<TState>,
  state: TState,
  playerId: string,
  action: ActionIntent
): boolean {
  switch (action.type) {
    case "buy_development_card":
      handlers.handleBuyDevelopmentCard(state, playerId);
      return true;
    case "play_knight":
      handlers.handlePlayKnight(state, playerId);
      return true;
    case "play_road_building":
      handlers.handlePlayRoadBuilding(state, playerId);
      return true;
    case "place_free_road":
      handlers.handlePlaceFreeRoad(state, playerId, action.edgeId);
      return true;
    case "finish_road_building":
      handlers.handleFinishRoadBuilding(state, playerId);
      return true;
    case "play_year_of_plenty":
      handlers.handlePlayYearOfPlenty(state, playerId, action.resources);
      return true;
    case "play_monopoly":
      handlers.handlePlayMonopoly(state, playerId, action.resource);
      return true;
    default:
      return false;
  }
}

export function applyTradeAction<TState>(
  handlers: ActionHandlerSet<TState>,
  state: TState,
  playerId: string,
  action: ActionIntent
): boolean {
  switch (action.type) {
    case "create_trade_offer":
      handlers.handleCreateTradeOffer(state, playerId, action.toPlayerId, action.give, action.want);
      return true;
    case "accept_trade_offer":
      handlers.handleAcceptTradeOffer(state, playerId, action.tradeId);
      return true;
    case "decline_trade_offer":
      handlers.handleDeclineTradeOffer(state, playerId, action.tradeId);
      return true;
    case "withdraw_trade_offer":
      handlers.handleWithdrawTradeOffer(state, playerId, action.tradeId);
      return true;
    case "maritime_trade":
      handlers.handleMaritimeTrade(state, playerId, action.give, action.receive, action.giveCount);
      return true;
    default:
      return false;
  }
}

export function applyTurnAction<TState>(
  handlers: ActionHandlerSet<TState>,
  state: TState,
  playerId: string,
  action: ActionIntent
): boolean {
  switch (action.type) {
    case "roll_dice":
      handlers.handleRollDice(state, playerId);
      return true;
    case "end_turn":
      handlers.handleEndTurn(state, playerId);
      return true;
    default:
      return false;
  }
}
