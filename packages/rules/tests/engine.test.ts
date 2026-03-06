import { describe, expect, it } from "vitest";
import { createEmptyResourceMap } from "@hexagonia/shared";
import { applyAction, createMatchState } from "../src/engine";

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
});
