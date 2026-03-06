import { describe, expect, it } from "vitest";
import { createEmptyResourceMap } from "@hexagonia/shared";
import { applyAction, createMatchState, createSnapshot } from "../src/engine";

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
