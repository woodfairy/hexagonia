import type { Resource } from "@hexagonia/shared";

export type BoardVisualProfile = "modern" | "classic" | "fancy" | "ultra";

export const BOARD_VISUAL_PROFILE_STORAGE_KEY = "hexagonia:board-visual-profile";
const LEGACY_CLASSIC_BOARD_VISUAL_PROFILE_STORAGE_VALUE = "modern-textured";

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

  const storedProfile = window.localStorage.getItem(BOARD_VISUAL_PROFILE_STORAGE_KEY);
  switch (storedProfile) {
    case "ultra":
      return "ultra";
    case "fancy":
      return "fancy";
    case "classic":
    case LEGACY_CLASSIC_BOARD_VISUAL_PROFILE_STORAGE_VALUE:
      return "classic";
    case "modern":
    case "fast":
    default:
      return "modern";
  }
}

export function serializeBoardVisualProfile(profile: BoardVisualProfile): string {
  switch (profile) {
    case "classic":
    case "fancy":
    case "modern":
    case "ultra":
      return profile;
  }
}
