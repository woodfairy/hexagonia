import { describe, expect, it } from "vitest";
import {
  PLAYER_COLORS,
  createEmptyResourceMap,
  createGameConfig,
  type SetupMode,
  type StartingPlayerMode
} from "@hexagonia/shared";
import { generateBaseBoard } from "../src/board";
import {
  applyAction,
  createMatchState as createBaseMatchState,
  createSnapshot,
  rollStartingPlayer
} from "../src/engine";
import { SeededRandom } from "../src/random";

const OFFICIAL_VARIABLE_NUMBER_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

type LegacyCreateMatchStateInput = Omit<Parameters<typeof createBaseMatchState>[0], "gameConfig"> & {
  setupMode: SetupMode;
  startingSeatIndex: number;
  startingPlayerMode?: StartingPlayerMode;
};

function createMatchState(input: Parameters<typeof createBaseMatchState>[0] | LegacyCreateMatchStateInput) {
  if ("gameConfig" in input) {
    return createBaseMatchState(input);
  }

  const {
    setupMode,
    startingSeatIndex,
    startingPlayerMode = "manual",
    ...rest
  } = input;

  return createBaseMatchState({
    ...rest,
    gameConfig: createGameConfig({
      setupMode,
      startingPlayer: {
        mode: startingPlayerMode,
        seatIndex: startingSeatIndex
      }
    })
  });
}

describe("rules engine", () => {
  it("starts in forward setup", () => {
    const state = createMatchState({
      matchId: "match-1",
      roomId: "room-1",
      seed: "test-seed",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    expect(state.phase).toBe("setup_forward");
    expect(state.players).toHaveLength(3);
  });

  it("keeps empty resource maps stable", () => {
    expect(createEmptyResourceMap()).toEqual({
      brick: 0,
      lumber: 0,
      ore: 0,
      grain: 0,
      wool: 0
    });
  });

  it("rejects invalid turn actions during setup", () => {
    const state = createMatchState({
      matchId: "match-1",
      roomId: "room-1",
      seed: "test-seed",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    expect(() => applyAction(state, "p1", { type: "roll_dice" })).toThrow();
  });

  it("starts setup with the configured starting seat", () => {
    const state = createMatchState({
      matchId: "match-start-seat",
      roomId: "room-1",
      seed: "test-seed",
      setupMode: "official_variable",
      startingSeatIndex: 2,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    expect(state.players[0]?.id).toBe("p3");
    expect(state.players[1]?.id).toBe("p1");
    expect(state.players[2]?.id).toBe("p2");
    expect(state.currentPlayerIndex).toBe(0);
  });

  it("rolls only the first player and records the result in the match events", () => {
    const players = createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"]);
    const rolledStart = rollStartingPlayer(players, "start-roll-seed");
    const state = createMatchState({
      matchId: "match-roll-start",
      roomId: "room-1",
      seed: "start-roll-seed",
      setupMode: "official_variable",
      startingPlayerMode: "rolled",
      startingSeatIndex: rolledStart.winnerSeatIndex,
      startingPlayerRoll: rolledStart,
      players
    });

    expect(state.players[0]?.seatIndex).toBe(rolledStart.winnerSeatIndex);
    expect(state.eventLog[0]?.type).toBe("starting_player_rolled");
    expect(state.eventLog[0]?.byPlayerId).toBe(rolledStart.winnerPlayerId);
    expect(state.eventLog[0]?.payload.summary).toBe(rolledStart.summary);
  });

  it("rerolls only the tied leaders when the starting-player roll is tied", () => {
    const tieSeed = findSeedWithStartingRollTie();
    const rolledStart = rollStartingPlayer(
      createPlayers(["p1", "p2", "p3", "p4"], ["Alice", "Bob", "Cara", "Dino"]),
      tieSeed
    );

    expect(rolledStart.rounds.length).toBeGreaterThan(1);
    expect(rolledStart.rounds[0]!.leaderPlayerIds.length).toBeGreaterThan(1);
    expect(rolledStart.rounds[1]!.contenderPlayerIds).toEqual(rolledStart.rounds[0]!.leaderPlayerIds);
    expect(rolledStart.rounds.at(-1)?.leaderPlayerIds).toHaveLength(1);
    expect(rolledStart.rounds.at(-1)?.leaderPlayerIds[0]).toBe(rolledStart.winnerPlayerId);
  });

  it("generates the standard base-board topology", () => {
    const board = generateBaseBoard("test-seed");

    expect(board.tiles).toHaveLength(19);
    expect(board.vertices).toHaveLength(54);
    expect(board.edges).toHaveLength(72);
    expect(board.vertices.filter((vertex) => vertex.tileIds.length === 1)).toHaveLength(18);
    expect(board.vertices.filter((vertex) => vertex.tileIds.length === 2)).toHaveLength(12);
    expect(board.vertices.filter((vertex) => vertex.tileIds.length === 3)).toHaveLength(24);
    expect(board.edges.filter((edge) => edge.tileIds.length === 1)).toHaveLength(30);
    expect(board.edges.filter((edge) => edge.tileIds.length === 2)).toHaveLength(42);
  });

  it("uses the official variable-setup spiral for number tokens", () => {
    const board = generateBaseBoard("official-layout-seed");
    const tokenOrders = createAllOfficialPlacementOrders(board.tiles).map((order) =>
      order
        .filter((tile) => tile.resource !== "desert")
        .map((tile) => tile.token)
    );

    expect(
      tokenOrders.some(
        (tokens) =>
          tokens.length === OFFICIAL_VARIABLE_NUMBER_TOKENS.length &&
          tokens.every((token, index) => token === OFFICIAL_VARIABLE_NUMBER_TOKENS[index])
      )
    ).toBe(true);
  });

  it("keeps the beginner setup fixed across seeds", () => {
    const firstBoard = generateBaseBoard("beginner-a", "beginner");
    const secondBoard = generateBaseBoard("beginner-b", "beginner");

    expect(
      firstBoard.tiles.map((tile) => ({
        resource: tile.resource,
        token: tile.token,
        robber: tile.robber
      }))
    ).toEqual(
      secondBoard.tiles.map((tile) => ({
        resource: tile.resource,
        token: tile.token,
        robber: tile.robber
      }))
    );
    expect(firstBoard.ports.map((port) => port.type)).toEqual(secondBoard.ports.map((port) => port.type));
    expect(firstBoard.ports.map((port) => port.edgeId)).toEqual(secondBoard.ports.map((port) => port.edgeId));
  });

  it("uses red, blue and orange for the 3-player beginner setup", () => {
    const state = createMatchState({
      matchId: "match-beginner-colors",
      roomId: "room-1",
      seed: "beginner-colors",
      setupMode: "beginner",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    expect(state.players.map((player) => player.color)).toEqual(["red", "blue", "orange"]);
    expect(state.players.some((player) => player.color === "white")).toBe(false);
  });

  it("grants resources to settlements adjacent to the rolled number", () => {
    const state = createMatchState({
      matchId: "match-1",
      roomId: "room-1",
      seed: "test-seed",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    const tile = state.board.tiles.find((entry) => entry.resource !== "desert" && entry.token === 8 && !entry.robber)!;
    const vertexId = tile.vertexIds[0]!;
    const player = state.players[0]!;
    const vertex = state.board.vertices.find((entry) => entry.id === vertexId)!;
    const expectedByResource = createEmptyResourceMap();

    vertex.building = {
      ownerId: player.id,
      color: player.color,
      type: "settlement"
    };
    player.settlements = [vertexId];
    player.resources = createEmptyResourceMap();
    state.phase = "turn_roll";
    state.previousPhase = null;
    state.setupState = null;
    state.robberState = null;
    state.tradeOffers = [];
    state.currentPlayerIndex = 0;
    state.turn = 1;
    state.dice = null;

    for (const adjacentTileId of vertex.tileIds) {
      const adjacentTile = state.board.tiles.find((entry) => entry.id === adjacentTileId)!;
      if (adjacentTile.resource !== "desert" && adjacentTile.token === 8 && !adjacentTile.robber) {
        expectedByResource[adjacentTile.resource] += 1;
      }
    }

    state.randomState = findRandomStateForTotal(8);
    const nextState = applyAction(state, player.id, { type: "roll_dice" });
    const self = nextState.players.find((entry) => entry.id === player.id)!;

    expect(self.resources).toEqual(expectedByResource);
    expect(nextState.eventLog.at(-1)?.type).toBe("resources_distributed");
  });

  it("never allows a settlement directly next to another settlement", () => {
    let state = createMatchState({
      matchId: "match-1",
      roomId: "room-1",
      seed: "test-seed",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    while (state.phase === "setup_forward" || state.phase === "setup_reverse") {
      const currentPlayerId = state.players[state.currentPlayerIndex]!.id;
      const snapshot = createSnapshot(state, currentPlayerId);

      if (snapshot.allowedMoves.initialSettlementVertexIds.length > 0) {
        state = applyAction(state, currentPlayerId, {
          type: "place_initial_settlement",
          vertexId: snapshot.allowedMoves.initialSettlementVertexIds[0]!
        });
        continue;
      }

      state = applyAction(state, currentPlayerId, {
        type: "place_initial_road",
        edgeId: snapshot.allowedMoves.initialRoadEdgeIds[0]!
      });
    }

    const player = state.players.find((entry) => entry.id === "p1")!;
    const occupiedVertexId = player.settlements[0]!;
    const occupiedVertex = state.board.vertices.find((vertex) => vertex.id === occupiedVertexId)!;
    const blockedVertexId = occupiedVertex.adjacentVertexIds.find((neighborId) => {
      const neighbor = state.board.vertices.find((vertex) => vertex.id === neighborId)!;
      return !neighbor.building;
    })!;
    const connectingEdge = state.board.edges.find(
      (edge) => edge.vertexIds.includes(occupiedVertexId) && edge.vertexIds.includes(blockedVertexId)
    )!;

    state.phase = "turn_action";
    state.currentPlayerIndex = state.players.findIndex((entry) => entry.id === "p1");
    state.tradeOffers = [];
    state.robberState = null;
    player.resources = {
      brick: 1,
      lumber: 1,
      grain: 1,
      wool: 1,
      ore: 0
    };

    connectingEdge.ownerId = "p1";
    connectingEdge.color = player.color;
    if (!player.roads.includes(connectingEdge.id)) {
      player.roads.push(connectingEdge.id);
    }

    const snapshot = createSnapshot(state, "p1");
    expect(snapshot.allowedMoves.settlementVertexIds).not.toContain(blockedVertexId);
    expect(() => applyAction(state, "p1", { type: "build_settlement", vertexId: blockedVertexId })).toThrow();
  });

  it("lets a single entitled player receive the remaining bank stock", () => {
    const state = createMatchState({
      matchId: "match-bank-single",
      roomId: "room-1",
      seed: "bank-single",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    const tile = state.board.tiles.find((entry) => entry.resource === "grain" && entry.token === 8 && !entry.robber)!;
    const player = state.players.find((entry) => entry.id === "p1")!;
    const vertexId = tile.vertexIds[0]!;
    const vertex = state.board.vertices.find((entry) => entry.id === vertexId)!;

    vertex.building = {
      ownerId: player.id,
      color: player.color,
      type: "city"
    };
    player.cities = [vertexId];
    state.bank.grain = 1;
    state.phase = "turn_roll";
    state.setupState = null;
    state.turn = 1;
    state.currentPlayerIndex = state.players.findIndex((entry) => entry.id === "p1");
    state.randomState = findRandomStateForTotal(8);

    const nextState = applyAction(state, "p1", { type: "roll_dice" });
    expect(nextState.players.find((entry) => entry.id === "p1")!.resources.grain).toBe(1);
    expect(nextState.bank.grain).toBe(0);
  });

  it("blocks a resource type completely when multiple players compete for too little bank stock", () => {
    const state = createMatchState({
      matchId: "match-bank-shared",
      roomId: "room-1",
      seed: "bank-shared",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    const tile = state.board.tiles.find((entry) => entry.resource === "grain" && entry.token === 8 && !entry.robber)!;
    const [firstVertexId, secondVertexId] = tile.vertexIds;
    const firstPlayer = state.players.find((entry) => entry.id === "p1")!;
    const secondPlayer = state.players.find((entry) => entry.id === "p2")!;
    const firstVertex = state.board.vertices.find((entry) => entry.id === firstVertexId)!;
    const secondVertex = state.board.vertices.find((entry) => entry.id === secondVertexId)!;

    firstVertex.building = {
      ownerId: firstPlayer.id,
      color: firstPlayer.color,
      type: "settlement"
    };
    secondVertex.building = {
      ownerId: secondPlayer.id,
      color: secondPlayer.color,
      type: "settlement"
    };
    firstPlayer.settlements = [firstVertexId!];
    secondPlayer.settlements = [secondVertexId!];
    state.bank.grain = 1;
    state.phase = "turn_roll";
    state.setupState = null;
    state.turn = 1;
    state.currentPlayerIndex = state.players.findIndex((entry) => entry.id === "p1");
    state.randomState = findRandomStateForTotal(8);

    const nextState = applyAction(state, "p1", { type: "roll_dice" });
    expect(nextState.players.find((entry) => entry.id === "p1")!.resources.grain).toBe(0);
    expect(nextState.players.find((entry) => entry.id === "p2")!.resources.grain).toBe(0);
    expect(nextState.bank.grain).toBe(1);
  });

  it("exposes public robber discard progress in the snapshot", () => {
    const state = createMatchState({
      matchId: "match-robber-status",
      roomId: "room-1",
      seed: "robber-status",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    state.phase = "turn_roll";
    state.setupState = null;
    state.turn = 1;
    state.currentPlayerIndex = 0;
    state.players.find((entry) => entry.id === "p1")!.resources = {
      brick: 4,
      lumber: 4,
      ore: 0,
      grain: 0,
      wool: 0
    };
    state.players.find((entry) => entry.id === "p2")!.resources = {
      brick: 3,
      lumber: 3,
      ore: 1,
      grain: 1,
      wool: 0
    };
    state.players.find((entry) => entry.id === "p3")!.resources = createEmptyResourceMap();
    state.randomState = findRandomStateForTotal(7);

    const robberState = applyAction(state, "p1", { type: "roll_dice" });
    const beforeDiscard = createSnapshot(robberState, "p1");

    expect(beforeDiscard.robberDiscardStatus).toEqual(
      expect.arrayContaining([
        { playerId: "p1", requiredCount: 4, done: false },
        { playerId: "p2", requiredCount: 4, done: false }
      ])
    );

    const afterDiscard = applyAction(robberState, "p1", {
      type: "discard_resources",
      resources: {
        brick: 4,
        lumber: 0,
        ore: 0,
        grain: 0,
        wool: 0
      }
    });
    const afterSnapshot = createSnapshot(afterDiscard, "p2");

    expect(afterSnapshot.robberDiscardStatus).toEqual(
      expect.arrayContaining([
        { playerId: "p1", requiredCount: 0, done: true },
        { playerId: "p2", requiredCount: 4, done: false }
      ])
    );
  });

  it("requires choosing a robber victim when multiple players can be stolen from", () => {
    const state = createMatchState({
      matchId: "match-robber-multi",
      roomId: "room-1",
      seed: "robber-multi",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    const { tile } = prepareRobberMoveState(state);
    assignSettlement(state, "p2", tile.vertexIds[0]!);
    assignSettlement(state, "p3", tile.vertexIds[2]!);
    state.players.find((player) => player.id === "p2")!.resources.brick = 1;
    state.players.find((player) => player.id === "p3")!.resources.ore = 1;

    const snapshot = createSnapshot(state, "p1");
    const option = snapshot.allowedMoves.robberMoveOptions.find((entry) => entry.tileId === tile.id)!;

    expect(option.targetPlayerIds).toEqual(expect.arrayContaining(["p2", "p3"]));
    expect(() => applyAction(state, "p1", { type: "move_robber", tileId: tile.id })).toThrow(
      /Wähle den Spieler/
    );
  });

  it("steals from the explicitly chosen robber victim", () => {
    const state = createMatchState({
      matchId: "match-robber-choice",
      roomId: "room-1",
      seed: "robber-choice",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    const { tile } = prepareRobberMoveState(state);
    assignSettlement(state, "p2", tile.vertexIds[0]!);
    assignSettlement(state, "p3", tile.vertexIds[2]!);
    state.players.find((player) => player.id === "p2")!.resources.brick = 1;
    state.players.find((player) => player.id === "p3")!.resources.ore = 1;

    const nextState = applyAction(state, "p1", {
      type: "move_robber",
      tileId: tile.id,
      targetPlayerId: "p3"
    });

    expect(nextState.players.find((player) => player.id === "p1")!.resources.ore).toBe(1);
    expect(nextState.players.find((player) => player.id === "p2")!.resources.brick).toBe(1);
    expect(nextState.players.find((player) => player.id === "p3")!.resources.ore).toBe(0);
  });

  it("still auto-steals when only one robber victim is possible", () => {
    const state = createMatchState({
      matchId: "match-robber-single",
      roomId: "room-1",
      seed: "robber-single",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    const { tile } = prepareRobberMoveState(state);
    assignSettlement(state, "p2", tile.vertexIds[0]!);
    state.players.find((player) => player.id === "p2")!.resources.brick = 1;

    const nextState = applyAction(state, "p1", {
      type: "move_robber",
      tileId: tile.id
    });

    expect(nextState.players.find((player) => player.id === "p1")!.resources.brick).toBe(1);
    expect(nextState.players.find((player) => player.id === "p2")!.resources.brick).toBe(0);
  });

  it("creates the official development deck composition", () => {
    const state = createMatchState({
      matchId: "match-dev-deck",
      roomId: "room-1",
      seed: "dev-deck",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    const counts = state.developmentDeck.reduce<Record<string, number>>((acc, card) => {
      acc[card.type] = (acc[card.type] ?? 0) + 1;
      return acc;
    }, {});

    expect(state.developmentDeck).toHaveLength(25);
    expect(counts).toEqual({
      knight: 14,
      victory_point: 5,
      road_building: 2,
      year_of_plenty: 2,
      monopoly: 2
    });
  });

  it("does not allow playing a freshly bought development card in the same turn", () => {
    const state = createMatchState({
      matchId: "match-dev-buy-lock",
      roomId: "room-1",
      seed: "dev-buy-lock",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 3);
    state.players.find((player) => player.id === "p1")!.resources = {
      brick: 0,
      lumber: 0,
      ore: 1,
      grain: 1,
      wool: 1
    };
    state.developmentDeck = [
      {
        id: "dev-monopoly",
        type: "monopoly",
        boughtOnTurn: 0
      }
    ];

    const nextState = applyAction(state, "p1", { type: "buy_development_card" });
    const snapshot = createSnapshot(nextState, "p1");
    const self = snapshot.players.find((player) => player.id === "p1")!;

    expect(self.developmentCards).toEqual([
      expect.objectContaining({
        id: "dev-monopoly",
        type: "monopoly",
        boughtOnTurn: 3,
        playable: false
      })
    ]);
    expect(snapshot.allowedMoves.playableDevelopmentCards).toEqual([]);
    expect(() => applyAction(nextState, "p1", { type: "play_monopoly", resource: "ore" })).toThrow();
  });

  it("counts victory point cards as hidden points and can win at the start of the turn", () => {
    const state = createMatchState({
      matchId: "match-victory-point",
      roomId: "room-1",
      seed: "victory-point",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 5);
    const nextPlayer = state.players.find((player) => player.id === "p2")!;
    nextPlayer.settlements = ["s1", "s2", "s3"];
    nextPlayer.cities = ["c1", "c2", "c3"];
    nextPlayer.developmentCards = [
      {
        id: "vp-1",
        type: "victory_point",
        boughtOnTurn: 2
      }
    ];

    const nextSnapshot = createSnapshot(state, "p2");
    const selfView = nextSnapshot.players.find((player) => player.id === "p2")!;
    expect(selfView.hiddenVictoryPoints).toBe(1);
    expect(selfView.totalVictoryPoints).toBe(10);
    expect(nextSnapshot.allowedMoves.playableDevelopmentCards).not.toContain("victory_point");

    const nextState = applyAction(state, "p1", { type: "end_turn" });
    expect(nextState.currentPlayerIndex).toBe(1);
    expect(nextState.winnerId).toBe("p2");
    expect(nextState.phase).toBe("game_over");
  });

  it("starts and finishes the paired players action between regular turns", () => {
    const state = createMatchState({
      matchId: "match-paired-players",
      roomId: "room-1",
      seed: "paired-players",
      gameConfig: createGameConfig({
        turnRule: "paired_players",
        startingPlayer: {
          mode: "manual",
          seatIndex: 0
        }
      }),
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 1);

    const pairedState = applyAction(state, "p1", { type: "end_turn" });
    const pairedSnapshot = createSnapshot(pairedState, "p3");

    expect(pairedState.phase).toBe("paired_player_action");
    expect(pairedState.turn).toBe(1);
    expect(pairedState.currentPlayerIndex).toBe(2);
    expect(pairedState.eventLog.at(-1)).toEqual(
      expect.objectContaining({
        type: "paired_player_started",
        byPlayerId: "p3",
        payload: expect.objectContaining({
          primaryPlayerId: "p1",
          secondaryPlayerId: "p3"
        })
      })
    );
    expect(pairedSnapshot.currentPlayerId).toBe("p3");
    expect(pairedSnapshot.allowedMoves.canEndTurn).toBe(true);
    expect(pairedSnapshot.allowedMoves.canMaritimeTrade).toBe(true);
    expect(pairedSnapshot.allowedMoves.canCreateTradeOffer).toBe(false);

    const nextTurnState = applyAction(pairedState, "p3", { type: "end_turn" });

    expect(nextTurnState.phase).toBe("turn_roll");
    expect(nextTurnState.turn).toBe(2);
    expect(nextTurnState.currentPlayerIndex).toBe(1);
    expect(nextTurnState.players[nextTurnState.currentPlayerIndex]?.id).toBe("p2");
    expect(nextTurnState.eventLog.at(-1)).toEqual(
      expect.objectContaining({
        type: "turn_ended",
        byPlayerId: "p3",
        payload: expect.objectContaining({
          nextPlayerId: "p2",
          turn: 2
        })
      })
    );
  });

  it("keeps the rolled dice visible and rotates builders during the special build phase", () => {
    const state = createMatchState({
      matchId: "match-special-build",
      roomId: "room-1",
      seed: "special-build",
      gameConfig: createGameConfig({
        turnRule: "special_build_phase",
        startingPlayer: {
          mode: "manual",
          seatIndex: 0
        }
      }),
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 1);
    state.dice = [4, 3];

    const firstBuilderState = applyAction(state, "p1", { type: "end_turn" });
    const firstBuilderSnapshot = createSnapshot(firstBuilderState, "p2");

    expect(firstBuilderState.phase).toBe("special_build");
    expect(firstBuilderState.turn).toBe(1);
    expect(firstBuilderState.dice).toEqual([4, 3]);
    expect(firstBuilderState.currentPlayerIndex).toBe(1);
    expect(firstBuilderState.eventLog.at(-1)).toEqual(
      expect.objectContaining({
        type: "special_build_started",
        byPlayerId: "p2",
        payload: expect.objectContaining({
          primaryPlayerId: "p1",
          builderPlayerId: "p2"
        })
      })
    );
    expect(firstBuilderSnapshot.allowedMoves.canRoll).toBe(false);
    expect(firstBuilderSnapshot.allowedMoves.canEndTurn).toBe(true);
    expect(firstBuilderSnapshot.allowedMoves.canMaritimeTrade).toBe(false);
    expect(firstBuilderSnapshot.allowedMoves.canCreateTradeOffer).toBe(false);

    const secondBuilderState = applyAction(firstBuilderState, "p2", { type: "end_turn" });

    expect(secondBuilderState.phase).toBe("special_build");
    expect(secondBuilderState.turn).toBe(1);
    expect(secondBuilderState.currentPlayerIndex).toBe(2);
    expect(secondBuilderState.dice).toEqual([4, 3]);
    expect(secondBuilderState.eventLog.at(-1)).toEqual(
      expect.objectContaining({
        type: "special_build_started",
        byPlayerId: "p3",
        payload: expect.objectContaining({
          primaryPlayerId: "p1",
          builderPlayerId: "p3"
        })
      })
    );

    const nextTurnState = applyAction(secondBuilderState, "p3", { type: "end_turn" });

    expect(nextTurnState.phase).toBe("turn_roll");
    expect(nextTurnState.turn).toBe(2);
    expect(nextTurnState.currentPlayerIndex).toBe(1);
    expect(nextTurnState.players[nextTurnState.currentPlayerIndex]?.id).toBe("p2");
  });

  it("wins immediately when buying a victory point card for the tenth point", () => {
    const state = createMatchState({
      matchId: "match-victory-point-buy-win",
      roomId: "room-1",
      seed: "victory-point-buy-win",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 6);
    const player = state.players.find((entry) => entry.id === "p1")!;
    player.settlements = ["s1", "s2", "s3"];
    player.cities = ["c1", "c2", "c3"];
    player.resources = {
      brick: 0,
      lumber: 0,
      ore: 1,
      grain: 1,
      wool: 1
    };
    state.developmentDeck = [
      {
        id: "vp-buy-win",
        type: "victory_point",
        boughtOnTurn: 0
      }
    ];

    const nextState = applyAction(state, "p1", { type: "buy_development_card" });
    const snapshot = createSnapshot(nextState, "p1");
    const self = snapshot.players.find((entry) => entry.id === "p1")!;

    expect(nextState.winnerId).toBe("p1");
    expect(nextState.phase).toBe("game_over");
    expect(self.hiddenVictoryPoints).toBe(1);
    expect(self.totalVictoryPoints).toBe(10);
  });

  it("moves all cards of the chosen resource to the monopoly player", () => {
    const state = createMatchState({
      matchId: "match-monopoly",
      roomId: "room-1",
      seed: "monopoly",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 4);
    grantDevelopmentCard(state, "p1", "monopoly", 1);
    state.players.find((player) => player.id === "p2")!.resources.wool = 2;
    state.players.find((player) => player.id === "p3")!.resources.wool = 1;

    const nextState = applyAction(state, "p1", { type: "play_monopoly", resource: "wool" });

    expect(nextState.players.find((player) => player.id === "p1")!.resources.wool).toBe(3);
    expect(nextState.players.find((player) => player.id === "p2")!.resources.wool).toBe(0);
    expect(nextState.players.find((player) => player.id === "p3")!.resources.wool).toBe(0);
    expect(nextState.eventLog.at(-1)?.payload).toEqual(
      expect.objectContaining({
        cardType: "monopoly",
        resource: "wool",
        total: 3
      })
    );
  });

  it("lets year of plenty take the same resource twice when the bank can pay", () => {
    const state = createMatchState({
      matchId: "match-year-plenty-success",
      roomId: "room-1",
      seed: "year-plenty-success",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 4);
    grantDevelopmentCard(state, "p1", "year_of_plenty", 1);
    state.bank.ore = 2;

    const nextState = applyAction(state, "p1", {
      type: "play_year_of_plenty",
      resources: ["ore", "ore"]
    });

    expect(nextState.players.find((player) => player.id === "p1")!.resources.ore).toBe(2);
    expect(nextState.bank.ore).toBe(0);
  });

  it("rejects year of plenty when the bank cannot pay both resources", () => {
    const state = createMatchState({
      matchId: "match-year-plenty-fail",
      roomId: "room-1",
      seed: "year-plenty-fail",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 4);
    grantDevelopmentCard(state, "p1", "year_of_plenty", 1);
    state.bank.ore = 1;

    expect(() =>
      applyAction(state, "p1", {
        type: "play_year_of_plenty",
        resources: ["ore", "ore"]
      })
    ).toThrow();
  });

  it("awards largest army when a player reaches the third played knight", () => {
    const state = createMatchState({
      matchId: "match-largest-army",
      roomId: "room-1",
      seed: "largest-army",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 4);
    state.dice = [3, 4];
    state.players.find((player) => player.id === "p1")!.playedKnightCount = 2;
    grantDevelopmentCard(state, "p1", "knight", 1);

    const nextState = applyAction(state, "p1", { type: "play_knight" });
    const player = nextState.players.find((entry) => entry.id === "p1")!;

    expect(player.playedKnightCount).toBe(3);
    expect(player.hasLargestArmy).toBe(true);
    expect(nextState.phase).toBe("robber_interrupt");
  });

  it("runs road building step by step before the roll and unlocks the second road after the first", () => {
    const state = createMatchState({
      matchId: "match-road-building-roll",
      roomId: "room-1",
      seed: "road-building-roll",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_roll", 4);
    const { firstEdgeId, secondEdgeId } = prepareRoadBuildingState(state, "p1");
    grantDevelopmentCard(state, "p1", "road_building", 1);

    const started = applyAction(state, "p1", { type: "play_road_building" });
    const startedSnapshot = createSnapshot(started, "p1");

    expect(startedSnapshot.pendingDevelopmentEffect).toEqual({
      type: "road_building",
      remainingRoads: 2
    });
    expect(startedSnapshot.allowedMoves.canRoll).toBe(false);
    expect(startedSnapshot.allowedMoves.freeRoadEdgeIds).toContain(firstEdgeId);
    expect(startedSnapshot.allowedMoves.freeRoadEdgeIds).not.toContain(secondEdgeId);
    expect(() => applyAction(started, "p1", { type: "end_turn" })).toThrow();

    const afterFirstRoad = applyAction(started, "p1", {
      type: "place_free_road",
      edgeId: firstEdgeId
    });
    const afterFirstSnapshot = createSnapshot(afterFirstRoad, "p1");

    expect(afterFirstSnapshot.pendingDevelopmentEffect).toEqual({
      type: "road_building",
      remainingRoads: 1
    });
    expect(afterFirstSnapshot.allowedMoves.freeRoadEdgeIds).toContain(secondEdgeId);

    const finished = applyAction(afterFirstRoad, "p1", { type: "finish_road_building" });
    expect(finished.pendingDevelopmentEffect).toBeNull();
    expect(finished.phase).toBe("turn_roll");
    expect(finished.players.find((player) => player.id === "p1")!.roads).toContain(firstEdgeId);
  });

  it("completes road building automatically after the second free road in the action phase", () => {
    const state = createMatchState({
      matchId: "match-road-building-action",
      roomId: "room-1",
      seed: "road-building-action",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 4);
    state.dice = [2, 5];
    const { firstEdgeId, secondEdgeId } = prepareRoadBuildingState(state, "p1");
    grantDevelopmentCard(state, "p1", "road_building", 1);

    const started = applyAction(state, "p1", { type: "play_road_building" });
    const afterFirstRoad = applyAction(started, "p1", {
      type: "place_free_road",
      edgeId: firstEdgeId
    });
    const finished = applyAction(afterFirstRoad, "p1", {
      type: "place_free_road",
      edgeId: secondEdgeId
    });

    expect(finished.pendingDevelopmentEffect).toBeNull();
    expect(finished.phase).toBe("turn_action");
    expect(finished.players.find((player) => player.id === "p1")!.roads).toEqual(
      expect.arrayContaining([firstEdgeId, secondEdgeId])
    );
    expect(finished.eventLog.at(-1)?.payload).toEqual(
      expect.objectContaining({
        edgeId: secondEdgeId,
        freeBuild: true
      })
    );
  });

  it("ends road building automatically when no second free road remains legal", () => {
    const state = createMatchState({
      matchId: "match-road-building-auto-finish",
      roomId: "room-1",
      seed: "road-building-auto-finish",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    prepareTurnState(state, "p1", "turn_action", 4);
    state.dice = [4, 2];
    const { existingEdgeId, firstEdgeId, blockedVertexId } = prepareAutoFinishingRoadBuildingState(state, "p1");

    expect(existingEdgeId).toBeTruthy();
    expect(blockedVertexId).toBeTruthy();
    grantDevelopmentCard(state, "p1", "road_building", 1);

    const started = applyAction(state, "p1", { type: "play_road_building" });
    const finished = applyAction(started, "p1", {
      type: "place_free_road",
      edgeId: firstEdgeId
    });

    expect(finished.pendingDevelopmentEffect).toBeNull();
    expect(finished.phase).toBe("turn_action");
    expect(finished.players.find((player) => player.id === "p1")!.roads).toContain(firstEdgeId);
  });

  it("removes longest road when the previous holder is no longer tied for the lead", () => {
    const state = createMatchState({
      matchId: "match-road-award",
      roomId: "room-1",
      seed: "road-award",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    state.phase = "turn_action";
    state.setupState = null;
    state.turn = 2;
    state.tradeOffers = [];

    const p1 = state.players.find((entry) => entry.id === "p1")!;
    const p2 = state.players.find((entry) => entry.id === "p2")!;
    const p3 = state.players.find((entry) => entry.id === "p3")!;
    p1.hasLongestRoad = true;

    const p1Roads = findRoadPath(state, 4);
    const p2Roads = findRoadPath(state, 5, new Set(p1Roads));
    const p3Roads = findRoadPath(state, 5, new Set([...p1Roads, ...p2Roads]));

    for (const edgeId of p1Roads) {
      const edge = state.board.edges.find((entry) => entry.id === edgeId)!;
      edge.ownerId = p1.id;
      edge.color = p1.color;
    }
    for (const edgeId of p2Roads) {
      const edge = state.board.edges.find((entry) => entry.id === edgeId)!;
      edge.ownerId = p2.id;
      edge.color = p2.color;
    }
    for (const edgeId of p3Roads) {
      const edge = state.board.edges.find((entry) => entry.id === edgeId)!;
      edge.ownerId = p3.id;
      edge.color = p3.color;
    }
    p1.roads = p1Roads;
    p2.roads = p2Roads;
    p3.roads = p3Roads;

    const nextState = applyAction(state, p1.id, { type: "end_turn" });
    expect(nextState.players.find((entry) => entry.id === "p1")!.hasLongestRoad).toBe(false);
    expect(nextState.players.find((entry) => entry.id === "p2")!.hasLongestRoad).toBe(false);
    expect(nextState.players.find((entry) => entry.id === "p3")!.hasLongestRoad).toBe(false);
  });

  it("declares victory immediately at the beginning of a player's turn", () => {
    const state = createMatchState({
      matchId: "match-turn-win",
      roomId: "room-1",
      seed: "turn-win",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    state.phase = "turn_action";
    state.setupState = null;
    state.turn = 2;
    state.currentPlayerIndex = 0;

    const current = state.players[0]!;
    const next = state.players[1]!;
    next.settlements = ["a", "b", "c", "d"];
    next.cities = ["e", "f", "g"];
    next.developmentCards = [];

    const nextState = applyAction(state, current.id, { type: "end_turn" });

    expect(nextState.currentPlayerIndex).toBe(1);
    expect(nextState.winnerId).toBe(next.id);
    expect(nextState.phase).toBe("game_over");
  });

  it("accepts a domestic trade offer and clears all open offers", () => {
    const state = createMatchState({
      matchId: "match-trade",
      roomId: "room-1",
      seed: "trade-seed",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    state.phase = "turn_action";
    state.setupState = null;
    state.turn = 3;
    state.currentPlayerIndex = 0;

    const p1 = state.players.find((entry) => entry.id === "p1")!;
    const p2 = state.players.find((entry) => entry.id === "p2")!;
    p1.resources.brick = 1;
    p2.resources.wool = 1;

    const offered = applyAction(state, "p1", {
      type: "create_trade_offer",
      toPlayerId: "p2",
      give: {
        brick: 1,
        lumber: 0,
        ore: 0,
        grain: 0,
        wool: 0
      },
      want: {
        brick: 0,
        lumber: 0,
        ore: 0,
        grain: 0,
        wool: 1
      }
    });

    expect(offered.tradeOffers).toHaveLength(1);

    const resolved = applyAction(offered, "p2", {
      type: "accept_trade_offer",
      tradeId: offered.tradeOffers[0]!.id
    });

    expect(resolved.players.find((entry) => entry.id === "p1")!.resources.wool).toBe(1);
    expect(resolved.players.find((entry) => entry.id === "p2")!.resources.brick).toBe(1);
    expect(resolved.tradeOffers).toHaveLength(0);
    expect(resolved.phase).toBe("turn_action");
  });

  it("keeps an open trade offer active for other players after one player declines", () => {
    const state = createMatchState({
      matchId: "match-open-trade",
      roomId: "room-1",
      seed: "trade-open-seed",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2", "p3"], ["Alice", "Bob", "Cara"])
    });

    state.phase = "turn_action";
    state.setupState = null;
    state.turn = 3;
    state.currentPlayerIndex = 0;

    const p1 = state.players.find((entry) => entry.id === "p1")!;
    const p2 = state.players.find((entry) => entry.id === "p2")!;
    const p3 = state.players.find((entry) => entry.id === "p3")!;
    p1.resources.brick = 1;
    p2.resources.wool = 1;
    p3.resources.wool = 1;

    const offered = applyAction(state, "p1", {
      type: "create_trade_offer",
      toPlayerId: null,
      give: {
        brick: 1,
        lumber: 0,
        ore: 0,
        grain: 0,
        wool: 0
      },
      want: {
        brick: 0,
        lumber: 0,
        ore: 0,
        grain: 0,
        wool: 1
      }
    });

    const declined = applyAction(offered, "p2", {
      type: "decline_trade_offer",
      tradeId: offered.tradeOffers[0]!.id
    });

    expect(declined.tradeOffers).toHaveLength(1);

    const p2Snapshot = createSnapshot(declined, "p2");
    expect(p2Snapshot.tradeOffers).toHaveLength(0);
    expect(p2Snapshot.allowedMoves.acceptableTradeOfferIds).toHaveLength(0);
    expect(p2Snapshot.allowedMoves.declineableTradeOfferIds).toHaveLength(0);

    const p3Snapshot = createSnapshot(declined, "p3");
    expect(p3Snapshot.tradeOffers).toHaveLength(1);
    expect(p3Snapshot.allowedMoves.acceptableTradeOfferIds).toEqual([declined.tradeOffers[0]!.id]);
    expect(p3Snapshot.allowedMoves.declineableTradeOfferIds).toEqual([declined.tradeOffers[0]!.id]);

    const resolved = applyAction(declined, "p3", {
      type: "accept_trade_offer",
      tradeId: declined.tradeOffers[0]!.id
    });

    expect(resolved.players.find((entry) => entry.id === "p1")!.resources.wool).toBe(1);
    expect(resolved.players.find((entry) => entry.id === "p3")!.resources.brick).toBe(1);
    expect(resolved.tradeOffers).toHaveLength(0);
  });

  it("allows trade offers where the proposer gives nothing", () => {
    const state = createMatchState({
      matchId: "match-trade-want-only",
      roomId: "room-1",
      seed: "trade-want-only-seed",
      setupMode: "official_variable",
      startingSeatIndex: 0,
      players: createPlayers(["p1", "p2"], ["Alice", "Bob"])
    });

    state.phase = "turn_action";
    state.setupState = null;
    state.turn = 3;
    state.currentPlayerIndex = 0;

    state.players.find((entry) => entry.id === "p2")!.resources.wool = 1;

    const offered = applyAction(state, "p1", {
      type: "create_trade_offer",
      toPlayerId: "p2",
      give: {
        brick: 0,
        lumber: 0,
        ore: 0,
        grain: 0,
        wool: 0
      },
      want: {
        brick: 0,
        lumber: 0,
        ore: 0,
        grain: 0,
        wool: 1
      }
    });

    expect(offered.tradeOffers).toHaveLength(1);
    expect(offered.tradeOffers[0]!.give).toEqual(createEmptyResourceMap());
    expect(offered.tradeOffers[0]!.want.wool).toBe(1);
  });
});

function findRandomStateForTotal(total: number): string {
  for (let candidate = 1; candidate < 100_000; candidate += 1) {
    const seed = `roll-${candidate}`;
    const rng = new SeededRandom(seed);
    const rolledTotal = rng.nextInt(1, 6) + rng.nextInt(1, 6);
    if (rolledTotal === total) {
      return seed;
    }
  }

  throw new Error(`Could not find a deterministic RNG state for roll ${total}.`);
}

function findSeedWithStartingRollTie(): string {
  for (let candidate = 1; candidate < 25_000; candidate += 1) {
    const seed = `start-tie-${candidate}`;
    const rolledStart = rollStartingPlayer(
      createPlayers(["p1", "p2", "p3", "p4"], ["Alice", "Bob", "Cara", "Dino"]),
      seed
    );
    if (rolledStart.rounds.length > 1) {
      return seed;
    }
  }

  throw new Error("Could not find a deterministic starting-player tie seed.");
}

function prepareRobberMoveState(state: ReturnType<typeof createMatchState>) {
  state.phase = "robber_interrupt";
  state.previousPhase = null;
  state.setupState = null;
  state.turn = 2;
  state.currentPlayerIndex = 0;
  state.tradeOffers = [];
  state.robberState = {
    resumePhase: "turn_action",
    pendingDiscardByPlayerId: {}
  };
  state.players.forEach((player) => {
    player.resources = createEmptyResourceMap();
    player.settlements = [];
  });

  const tile = state.board.tiles.find((entry) => entry.resource !== "desert" && !entry.robber)!;
  return { tile };
}

function assignSettlement(state: ReturnType<typeof createMatchState>, playerId: string, vertexId: string) {
  const player = state.players.find((entry) => entry.id === playerId)!;
  const vertex = state.board.vertices.find((entry) => entry.id === vertexId)!;

  vertex.building = {
    ownerId: player.id,
    color: player.color,
    type: "settlement"
  };
  player.settlements.push(vertexId);
}

function prepareTurnState(
  state: ReturnType<typeof createMatchState>,
  playerId: string,
  phase: "turn_roll" | "turn_action",
  turn: number
) {
  state.phase = phase;
  state.previousPhase = null;
  state.setupState = null;
  state.robberState = null;
  state.pendingDevelopmentEffect = null;
  state.tradeOffers = [];
  state.turn = turn;
  state.dice = phase === "turn_action" ? [1, 1] : null;
  state.currentPlayerIndex = state.players.findIndex((player) => player.id === playerId);
  state.players.forEach((player) => {
    player.hasPlayedDevelopmentCardThisTurn = false;
    player.resources = createEmptyResourceMap();
  });
}

function grantDevelopmentCard(
  state: ReturnType<typeof createMatchState>,
  playerId: string,
  type: "knight" | "victory_point" | "road_building" | "year_of_plenty" | "monopoly",
  boughtOnTurn: number
) {
  const player = state.players.find((entry) => entry.id === playerId)!;
  player.developmentCards.push({
    id: `grant-${type}-${player.developmentCards.length + 1}`,
    type,
    boughtOnTurn
  });
}

function prepareRoadBuildingState(state: ReturnType<typeof createMatchState>, playerId: string) {
  const [firstEdgeId, secondEdgeId] = findRoadPath(state, 2);
  const firstEdge = state.board.edges.find((edge) => edge.id === firstEdgeId)!;
  const secondEdge = state.board.edges.find((edge) => edge.id === secondEdgeId)!;
  const sharedVertexId = firstEdge.vertexIds.find((vertexId) => secondEdge.vertexIds.includes(vertexId))!;
  const startVertexId = firstEdge.vertexIds.find((vertexId) => vertexId !== sharedVertexId)!;

  assignSettlement(state, playerId, startVertexId);
  return { firstEdgeId, secondEdgeId, startVertexId, sharedVertexId };
}

function prepareAutoFinishingRoadBuildingState(state: ReturnType<typeof createMatchState>, playerId: string) {
  const player = state.players.find((entry) => entry.id === playerId)!;

  for (const vertex of state.board.vertices) {
    if (vertex.edgeIds.length !== 2) {
      continue;
    }

    const [existingEdgeId, firstEdgeId] = vertex.edgeIds;
    const firstEdge = state.board.edges.find((edge) => edge.id === firstEdgeId)!;
    const existingEdge = state.board.edges.find((edge) => edge.id === existingEdgeId)!;
    const blockedVertexId = firstEdge.vertexIds.find((vertexId) => vertexId !== vertex.id)!;
    const sealedVertexId = existingEdge.vertexIds.find((vertexId) => vertexId !== vertex.id)!;
    const blockedVertex = state.board.vertices.find((entry) => entry.id === blockedVertexId)!;
    if (blockedVertex.edgeIds.length < 2) {
      continue;
    }

    state.board.edges.find((edge) => edge.id === existingEdgeId)!.ownerId = playerId;
    state.board.edges.find((edge) => edge.id === existingEdgeId)!.color = player.color;
    player.roads.push(existingEdgeId);
    assignSettlement(state, "p2", blockedVertexId);
    assignSettlement(state, "p2", sealedVertexId);

    return { existingEdgeId, firstEdgeId, blockedVertexId, sealedVertexId };
  }

  throw new Error("Could not prepare an auto-finishing road-building state.");
}

function createAllOfficialPlacementOrders<T extends { q: number; r: number }>(tiles: T[]): T[][] {
  const tilesByCoord = new Map(tiles.map((tile) => [toCoordKey(tile.q, tile.r), tile]));
  const outerRing = createCounterclockwiseRing(2).map((coord) => tilesByCoord.get(toCoordKey(coord.q, coord.r))!);
  const innerRing = createCounterclockwiseRing(1).map((coord) => tilesByCoord.get(toCoordKey(coord.q, coord.r))!);
  const centerTile = tilesByCoord.get(toCoordKey(0, 0))!;

  return Array.from({ length: 6 }, (_, startCornerIndex) => [
    ...rotate(outerRing, startCornerIndex * 2),
    ...rotate(innerRing, startCornerIndex),
    centerTile
  ]);
}

function createCounterclockwiseRing(radius: number): Array<{ q: number; r: number }> {
  const directions = [
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 }
  ];
  const coords: Array<{ q: number; r: number }> = [];
  let q = radius;
  let r = -radius;

  for (const direction of directions) {
    for (let step = 0; step < radius; step += 1) {
      coords.push({ q, r });
      q += direction.q;
      r += direction.r;
    }
  }

  return coords;
}

function rotate<T>(values: T[], startIndex: number): T[] {
  const offset = startIndex % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function toCoordKey(q: number, r: number): string {
  return `${q}:${r}`;
}

function createPlayers(ids: string[], usernames: string[]) {
  return ids.map((id, index) => ({
    id,
    username: usernames[index]!,
    color: PLAYER_COLORS[index]!,
    seatIndex: index
  }));
}

function findRoadPath(state: ReturnType<typeof createMatchState>, length: number, blocked = new Set<string>()): string[] {
  for (const edge of state.board.edges) {
    if (blocked.has(edge.id)) {
      continue;
    }

    for (const vertexId of edge.vertexIds) {
      const path = extendRoadPath(state, edge.id, vertexId, length, blocked, new Set([edge.id]), [edge.id]);
      if (path) {
        return path;
      }
    }
  }

  throw new Error(`Could not find a road path of length ${length}.`);
}

function extendRoadPath(
  state: ReturnType<typeof createMatchState>,
  currentEdgeId: string,
  fromVertexId: string,
  targetLength: number,
  blocked: Set<string>,
  used: Set<string>,
  path: string[]
): string[] | null {
  if (path.length === targetLength) {
    return path;
  }

  const edge = state.board.edges.find((entry) => entry.id === currentEdgeId)!;
  const nextVertexId = edge.vertexIds[0] === fromVertexId ? edge.vertexIds[1] : edge.vertexIds[0];
  const vertex = state.board.vertices.find((entry) => entry.id === nextVertexId)!;

  for (const candidateEdgeId of vertex.edgeIds) {
    if (used.has(candidateEdgeId) || blocked.has(candidateEdgeId)) {
      continue;
    }

    const nextUsed = new Set(used);
    nextUsed.add(candidateEdgeId);
    const nextPath = [...path, candidateEdgeId];
    const result = extendRoadPath(state, candidateEdgeId, nextVertexId, targetLength, blocked, nextUsed, nextPath);
    if (result) {
      return result;
    }
  }

  return null;
}
