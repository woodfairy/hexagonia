import { describe, expect, it } from "vitest";
import { PLAYER_COLORS, createEmptyResourceMap } from "@hexagonia/shared";
import { generateBaseBoard } from "../src/board";
import { applyAction, createMatchState, createSnapshot } from "../src/engine";
import { SeededRandom } from "../src/random";

const OFFICIAL_VARIABLE_NUMBER_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

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
