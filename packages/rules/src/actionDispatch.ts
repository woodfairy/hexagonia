import type {
  ActionIntent,
  PirateStealType,
  PortType,
  Resource,
  ResourceMap,
  RouteBuildType,
  TileTerrain
} from "@hexagonia/shared";

export interface ActionHandlerSet<TState> {
  handleScenarioSetupPlaceTile(
    state: TState,
    playerId: string,
    tileId: string,
    terrain: TileTerrain
  ): void;
  handleScenarioSetupClearTile(state: TState, playerId: string, tileId: string): void;
  handleScenarioSetupPlaceToken(state: TState, playerId: string, tileId: string, token: number): void;
  handleScenarioSetupClearToken(state: TState, playerId: string, tileId: string): void;
  handleScenarioSetupPlacePort(state: TState, playerId: string, edgeId: string, portType: PortType): void;
  handleScenarioSetupClearPort(state: TState, playerId: string, edgeId: string): void;
  handleScenarioSetupSetReady(state: TState, playerId: string, ready: boolean): void;
  handleInitialSettlement(state: TState, playerId: string, vertexId: string): void;
  handleInitialRoad(state: TState, playerId: string, edgeId: string, routeType?: RouteBuildType): void;
  handleDiscardResources(state: TState, playerId: string, resources: ResourceMap): void;
  handleRollDice(state: TState, playerId: string): void;
  handleBuildRoad(state: TState, playerId: string, edgeId: string, freeBuild: boolean): void;
  handleBuildShip(state: TState, playerId: string, edgeId: string, freeBuild: boolean): void;
  handleMoveShip(state: TState, playerId: string, fromEdgeId: string, toEdgeId: string): void;
  handleBuildSettlement(state: TState, playerId: string, vertexId: string): void;
  handleBuildCity(state: TState, playerId: string, vertexId: string): void;
  handleBuyDevelopmentCard(state: TState, playerId: string): void;
  handlePlayKnight(state: TState, playerId: string): void;
  handlePlayRoadBuilding(state: TState, playerId: string): void;
  handlePlaceFreeRoad(state: TState, playerId: string, edgeId: string, routeType?: RouteBuildType): void;
  handleFinishRoadBuilding(state: TState, playerId: string): void;
  handlePlayYearOfPlenty(state: TState, playerId: string, resources: [Resource, Resource]): void;
  handlePlayMonopoly(state: TState, playerId: string, resource: Resource): void;
  handleMoveRobber(state: TState, playerId: string, tileId: string, targetPlayerId?: string): void;
  handleMovePirate(
    state: TState,
    playerId: string,
    tileId: string,
    targetPlayerId?: string,
    stealType?: PirateStealType
  ): void;
  handleStealOnSeven(state: TState, playerId: string, targetPlayerId: string): void;
  handleChooseGoldResource(state: TState, playerId: string, resources: Resource[]): void;
  handlePlacePortToken(state: TState, playerId: string, vertexId: string, portType: PortType): void;
  handleClaimWonder(state: TState, playerId: string, vertexId: string): void;
  handleBuildWonderLevel(state: TState, playerId: string, vertexId: string): void;
  handleAttackFortress(state: TState, playerId: string, vertexId: string): void;
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

export function applyScenarioSetupAction<TState>(
  handlers: ActionHandlerSet<TState>,
  state: TState,
  playerId: string,
  action: ActionIntent
): boolean {
  switch (action.type) {
    case "scenario_setup_place_tile":
      handlers.handleScenarioSetupPlaceTile(state, playerId, action.tileId, action.terrain);
      return true;
    case "scenario_setup_clear_tile":
      handlers.handleScenarioSetupClearTile(state, playerId, action.tileId);
      return true;
    case "scenario_setup_place_token":
      handlers.handleScenarioSetupPlaceToken(state, playerId, action.tileId, action.token);
      return true;
    case "scenario_setup_clear_token":
      handlers.handleScenarioSetupClearToken(state, playerId, action.tileId);
      return true;
    case "scenario_setup_place_port":
      handlers.handleScenarioSetupPlacePort(state, playerId, action.edgeId, action.portType);
      return true;
    case "scenario_setup_clear_port":
      handlers.handleScenarioSetupClearPort(state, playerId, action.edgeId);
      return true;
    case "scenario_setup_set_ready":
      handlers.handleScenarioSetupSetReady(state, playerId, action.ready);
      return true;
    default:
      return false;
  }
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
      handlers.handleInitialRoad(state, playerId, action.edgeId, action.routeType);
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
    case "move_pirate":
      handlers.handleMovePirate(
        state,
        playerId,
        action.tileId,
        action.targetPlayerId,
        action.stealType
      );
      return true;
    case "steal_on_seven":
      handlers.handleStealOnSeven(state, playerId, action.targetPlayerId);
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
    case "build_ship":
      handlers.handleBuildShip(state, playerId, action.edgeId, false);
      return true;
    case "move_ship":
      handlers.handleMoveShip(state, playerId, action.fromEdgeId, action.toEdgeId);
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
      handlers.handlePlaceFreeRoad(state, playerId, action.edgeId, action.routeType);
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
    case "choose_gold_resource":
      handlers.handleChooseGoldResource(state, playerId, action.resources);
      return true;
    case "place_port_token":
      handlers.handlePlacePortToken(state, playerId, action.vertexId, action.portType);
      return true;
    case "claim_wonder":
      handlers.handleClaimWonder(state, playerId, action.vertexId);
      return true;
    case "build_wonder_level":
      handlers.handleBuildWonderLevel(state, playerId, action.vertexId);
      return true;
    case "attack_fortress":
      handlers.handleAttackFortress(state, playerId, action.vertexId);
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
