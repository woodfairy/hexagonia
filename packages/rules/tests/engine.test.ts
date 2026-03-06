import { describe, expect, it } from "vitest";
import { createEmptyResourceMap } from "@hexagonia/shared";
import { generateBaseBoard } from "../src/board";
import { applyAction, createMatchState, createSnapshot } from "../src/engine";
import { SeededRandom } from "../src/random";

describe("rules engine", () => {
  it("starts in forward setup", () => {
    const state = createMatchState({
      matchId: "match-1",
      roomId: "room-1",
      seed: "test-seed",
      players: [
        { id: "p1", username: "Alice", seatIndex: 0 },
        { id: "p2", username: "Bob", seatIndex: 1 },
        { id: "p3", username: "Cara", seatIndex: 2 }
      ]
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
      players: [
        { id: "p1", username: "Alice", seatIndex: 0 },
        { id: "p2", username: "Bob", seatIndex: 1 },
        { id: "p3", username: "Cara", seatIndex: 2 }
      ]
    });

    expect(() => applyAction(state, "p1", { type: "roll_dice" })).toThrow();
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

  it("grants resources to settlements adjacent to the rolled number", () => {
    const state = createMatchState({
      matchId: "match-1",
      roomId: "room-1",
      seed: "test-seed",
      players: [
        { id: "p1", username: "Alice", seatIndex: 0 },
        { id: "p2", username: "Bob", seatIndex: 1 },
        { id: "p3", username: "Cara", seatIndex: 2 }
      ]
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
    state.currentTrade = null;
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
      players: [
        { id: "p1", username: "Alice", seatIndex: 0 },
        { id: "p2", username: "Bob", seatIndex: 1 },
        { id: "p3", username: "Cara", seatIndex: 2 }
      ]
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
    state.currentTrade = null;
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
});

function findRandomStateForTotal(total: number): number {
  for (let candidate = 1; candidate < 100_000; candidate += 1) {
    const rng = new SeededRandom(candidate);
    const rolledTotal = rng.nextInt(1, 6) + rng.nextInt(1, 6);
    if (rolledTotal === total) {
      return candidate;
    }
  }

  throw new Error(`Could not find a deterministic RNG state for roll ${total}.`);
}
