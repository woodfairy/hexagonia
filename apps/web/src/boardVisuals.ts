import type { Resource } from "@hexagonia/shared";

export type BoardVisualProfile = "fast" | "modern" | "ultra";

export const BOARD_VISUAL_PROFILE_STORAGE_KEY = "hexagonia:board-visual-profile";
const TEXTURED_BOARD_VISUAL_PROFILE_STORAGE_VALUE = "modern-textured";

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
    return "fast";
  }

  const storedProfile = window.localStorage.getItem(BOARD_VISUAL_PROFILE_STORAGE_KEY);
  switch (storedProfile) {
    case "ultra":
      return "ultra";
    case TEXTURED_BOARD_VISUAL_PROFILE_STORAGE_VALUE:
      return "modern";
    case "fast":
    case "modern":
    default:
      return "fast";
  }
}

export function serializeBoardVisualProfile(profile: BoardVisualProfile): string {
  switch (profile) {
    case "modern":
      return TEXTURED_BOARD_VISUAL_PROFILE_STORAGE_VALUE;
    case "fast":
    case "ultra":
      return profile;
  }
}
