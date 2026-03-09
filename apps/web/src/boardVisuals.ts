import type { Resource } from "@hexagonia/shared";

export type BoardPieceStyle = "modern" | "detailed";

export interface BoardVisualSettings {
  textures: boolean;
  props: boolean;
  terrainRelief: boolean;
  resourceIcons: boolean;
  pieceStyle: BoardPieceStyle;
}

export const BOARD_VISUAL_SETTINGS_STORAGE_KEY = "hexagonia:board-visual-profile";
const LEGACY_CLASSIC_BOARD_VISUAL_PROFILE_STORAGE_VALUE = "modern-textured";
export const DEFAULT_BOARD_VISUAL_SETTINGS: BoardVisualSettings = {
  textures: false,
  props: true,
  terrainRelief: true,
  resourceIcons: false,
  pieceStyle: "detailed"
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
        terrainRelief: true
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
  const pieceStyle = resolveBoardPieceStyle(candidate.pieceStyle);
  return createBoardVisualSettings({
    ...(typeof candidate.textures === "boolean" ? { textures: candidate.textures } : {}),
    ...(typeof candidate.props === "boolean" ? { props: candidate.props } : {}),
    ...(typeof candidate.terrainRelief === "boolean" ? { terrainRelief: candidate.terrainRelief } : {}),
    ...(typeof candidate.resourceIcons === "boolean" ? { resourceIcons: candidate.resourceIcons } : {}),
    ...(pieceStyle ? { pieceStyle } : {})
  });
}

function resolveBoardPieceStyle(value: unknown): BoardPieceStyle | null {
  switch (value) {
    case "modern":
    case "detailed":
      return value;
    case "minimal":
      return "modern";
    case "stylized":
      return "detailed";
    default:
      return null;
  }
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

  const storedSettings = window.localStorage.getItem(BOARD_VISUAL_SETTINGS_STORAGE_KEY);
  const resolvedSettings = deserializeBoardVisualSettings(storedSettings);
  const normalizedSettings = serializeBoardVisualSettings(resolvedSettings);

  if (storedSettings !== normalizedSettings) {
    persistBoardVisualSettings(resolvedSettings);
  }

  return resolvedSettings;
}

export function serializeBoardVisualSettings(settings: BoardVisualSettings): string {
  return JSON.stringify(normalizeBoardVisualSettings(settings));
}

export function persistBoardVisualSettings(settings: BoardVisualSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    BOARD_VISUAL_SETTINGS_STORAGE_KEY,
    serializeBoardVisualSettings(settings)
  );
}
