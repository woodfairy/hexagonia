import type { Resource } from "@hexagonia/shared";

export type BoardPieceStyle = "minimal" | "stylized";

export interface BoardVisualSettings {
  textures: boolean;
  props: boolean;
  terrainRelief: boolean;
  resourceIcons: boolean;
  pieceStyle: BoardPieceStyle;
}

export const BOARD_VISUAL_SETTINGS_STORAGE_KEY = "hexagonia:board-visual-profile";
const BOARD_VISUAL_SETTINGS_STORAGE_VERSION_KEY = "hexagonia:board-visual-profile-version";
const BOARD_VISUAL_SETTINGS_STORAGE_VERSION = "2";
const LEGACY_CLASSIC_BOARD_VISUAL_PROFILE_STORAGE_VALUE = "modern-textured";
export const DEFAULT_BOARD_VISUAL_SETTINGS: BoardVisualSettings = {
  textures: true,
  props: true,
  terrainRelief: true,
  resourceIcons: false,
  pieceStyle: "minimal"
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
        props: true,
        terrainRelief: true
      });
    case "classic":
    case LEGACY_CLASSIC_BOARD_VISUAL_PROFILE_STORAGE_VALUE:
      return createBoardVisualSettings({
        textures: true,
        terrainRelief: true
      });
    case "modern":
    case "fast":
      return createBoardVisualSettings({
        textures: false,
        props: false,
        terrainRelief: false
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
    ...(typeof candidate.textures === "boolean" ? { textures: candidate.textures } : {}),
    ...(typeof candidate.props === "boolean" ? { props: candidate.props } : {}),
    ...(typeof candidate.terrainRelief === "boolean" ? { terrainRelief: candidate.terrainRelief } : {}),
    ...(typeof candidate.resourceIcons === "boolean" ? { resourceIcons: candidate.resourceIcons } : {}),
    ...(candidate.pieceStyle === "minimal" || candidate.pieceStyle === "stylized"
      ? { pieceStyle: candidate.pieceStyle }
      : {})
  });
}

function shouldUpgradeStoredTerrainRelief(
  serializedSettings: string | null,
  serializedVersion: string | null,
  resolvedSettings: BoardVisualSettings
): boolean {
  if (serializedVersion === BOARD_VISUAL_SETTINGS_STORAGE_VERSION) {
    return false;
  }

  if (!resolvedSettings.textures || resolvedSettings.terrainRelief) {
    return false;
  }

  const legacySettings = resolveLegacyBoardVisualSettings(serializedSettings);
  if (legacySettings) {
    return legacySettings.textures && !legacySettings.terrainRelief;
  }

  if (!serializedSettings) {
    return false;
  }

  try {
    const candidate = JSON.parse(serializedSettings) as Partial<Record<keyof BoardVisualSettings, unknown>>;
    return (
      candidate.textures === true &&
      candidate.props === true &&
      candidate.terrainRelief === false &&
      (candidate.resourceIcons === undefined || candidate.resourceIcons === false) &&
      (candidate.pieceStyle === undefined || candidate.pieceStyle === "minimal")
    );
  } catch {
    return false;
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
  const storedVersion = window.localStorage.getItem(BOARD_VISUAL_SETTINGS_STORAGE_VERSION_KEY);
  const deserializedSettings = deserializeBoardVisualSettings(storedSettings);
  const resolvedSettings = shouldUpgradeStoredTerrainRelief(storedSettings, storedVersion, deserializedSettings)
    ? { ...deserializedSettings, terrainRelief: true }
    : deserializedSettings;
  const normalizedSettings = serializeBoardVisualSettings(resolvedSettings);

  if (storedSettings !== normalizedSettings || storedVersion !== BOARD_VISUAL_SETTINGS_STORAGE_VERSION) {
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
  window.localStorage.setItem(BOARD_VISUAL_SETTINGS_STORAGE_VERSION_KEY, BOARD_VISUAL_SETTINGS_STORAGE_VERSION);
}
