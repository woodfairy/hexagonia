import type { Resource } from "@hexagonia/shared";

export interface BoardVisualSettings {
  textures: boolean;
  props: boolean;
  terrainRelief: boolean;
  terrainMotion: boolean;
}

export const BOARD_VISUAL_SETTINGS_STORAGE_KEY = "hexagonia:board-visual-profile";
const LEGACY_CLASSIC_BOARD_VISUAL_PROFILE_STORAGE_VALUE = "modern-textured";
export const DEFAULT_BOARD_VISUAL_SETTINGS: BoardVisualSettings = {
  textures: false,
  props: true,
  terrainRelief: false,
  terrainMotion: false
};

export const TILE_COLORS: Record<Resource | "desert", string> = {
  brick: "#b86146",
  lumber: "#2f6f37",
  ore: "#79869a",
  grain: "#c7a13a",
  wool: "#8eb667",
  desert: "#ccb07b"
};

function createBoardVisualSettings(overrides?: Partial<BoardVisualSettings>): BoardVisualSettings {
  return {
    ...DEFAULT_BOARD_VISUAL_SETTINGS,
    ...overrides
  };
}

function resolveLegacyBoardVisualSettings(storedProfile: string | null): BoardVisualSettings | null {
  switch (storedProfile) {
    case "ultra":
      return createBoardVisualSettings({
        textures: true,
        props: true,
        terrainRelief: true,
        terrainMotion: true
      });
    case "fancy":
      return createBoardVisualSettings({
        textures: true,
        props: true
      });
    case "classic":
    case LEGACY_CLASSIC_BOARD_VISUAL_PROFILE_STORAGE_VALUE:
      return createBoardVisualSettings({
        textures: true
      });
    case "modern":
    case "fast":
      return createBoardVisualSettings({
        textures: false,
        props: false
      });
    default:
      return null;
  }
}

function normalizeBoardVisualSettings(value: unknown): BoardVisualSettings {
  if (!value || typeof value !== "object") {
    return createBoardVisualSettings();
  }

  const candidate = value as Partial<Record<keyof BoardVisualSettings, unknown>>;
  return createBoardVisualSettings({
    textures: candidate.textures === true,
    props: candidate.props === true,
    terrainRelief: candidate.terrainRelief === true,
    terrainMotion: candidate.terrainMotion === true
  });
}

export function deserializeBoardVisualSettings(serializedSettings: string | null): BoardVisualSettings {
  const legacy = resolveLegacyBoardVisualSettings(serializedSettings);
  if (legacy) {
    return legacy;
  }

  if (!serializedSettings) {
    return createBoardVisualSettings();
  }

  try {
    return normalizeBoardVisualSettings(JSON.parse(serializedSettings));
  } catch {
    return createBoardVisualSettings();
  }
}

export function resolveInitialBoardVisualSettings(): BoardVisualSettings {
  if (typeof window === "undefined") {
    return createBoardVisualSettings();
  }

  return deserializeBoardVisualSettings(window.localStorage.getItem(BOARD_VISUAL_SETTINGS_STORAGE_KEY));
}

export function serializeBoardVisualSettings(settings: BoardVisualSettings): string {
  return JSON.stringify(normalizeBoardVisualSettings(settings));
}
