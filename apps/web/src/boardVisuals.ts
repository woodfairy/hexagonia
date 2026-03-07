import type { Resource } from "@hexagonia/shared";

export type BoardVisualProfile = "modern" | "ultra";

export const BOARD_VISUAL_PROFILE_STORAGE_KEY = "hexagonia:board-visual-profile";

export const TILE_COLORS: Record<Resource | "desert", string> = {
  brick: "#b86146",
  lumber: "#2f6f37",
  ore: "#79869a",
  grain: "#c7a13a",
  wool: "#a8cc79",
  desert: "#ccb07b"
};

export function resolveInitialBoardVisualProfile(): BoardVisualProfile {
  if (typeof window === "undefined") {
    return "modern";
  }

  return window.localStorage.getItem(BOARD_VISUAL_PROFILE_STORAGE_KEY) === "ultra" ? "ultra" : "modern";
}
