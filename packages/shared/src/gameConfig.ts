export const SETUP_MODES = ["official_variable", "beginner"] as const;
export const STARTING_PLAYER_MODES = ["rolled", "manual"] as const;
export const EXPANSION_IDS = ["seafarers"] as const;

export type SetupMode = (typeof SETUP_MODES)[number];
export type StartingPlayerMode = (typeof STARTING_PLAYER_MODES)[number];
export type ExpansionId = (typeof EXPANSION_IDS)[number];

export interface StartingPlayerConfig {
  mode: StartingPlayerMode;
  seatIndex: number;
}

export interface GameConfig {
  setupMode: SetupMode;
  startingPlayer: StartingPlayerConfig;
  enabledExpansions: ExpansionId[];
}

export interface GameConfigPatch {
  setupMode?: SetupMode;
  startingPlayer?: Partial<StartingPlayerConfig>;
  enabledExpansions?: ExpansionId[];
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  setupMode: "official_variable",
  startingPlayer: {
    mode: "rolled",
    seatIndex: 0
  },
  enabledExpansions: []
};

function isSetupMode(value: unknown): value is SetupMode {
  return typeof value === "string" && SETUP_MODES.includes(value as SetupMode);
}

function isStartingPlayerMode(value: unknown): value is StartingPlayerMode {
  return typeof value === "string" && STARTING_PLAYER_MODES.includes(value as StartingPlayerMode);
}

function isExpansionId(value: unknown): value is ExpansionId {
  return typeof value === "string" && EXPANSION_IDS.includes(value as ExpansionId);
}

function clampSeatIndex(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeEnabledExpansions(value: unknown): ExpansionId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(isExpansionId))];
}

export function normalizeGameConfig(value: unknown): GameConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createGameConfig();
  }

  const candidate = value as {
    setupMode?: unknown;
    startingPlayer?: {
      mode?: unknown;
      seatIndex?: unknown;
    } | null;
    enabledExpansions?: unknown;
  };

  return {
    setupMode: isSetupMode(candidate.setupMode)
      ? candidate.setupMode
      : DEFAULT_GAME_CONFIG.setupMode,
    startingPlayer: {
      mode: isStartingPlayerMode(candidate.startingPlayer?.mode)
        ? candidate.startingPlayer.mode
        : DEFAULT_GAME_CONFIG.startingPlayer.mode,
      seatIndex: clampSeatIndex(
        candidate.startingPlayer?.seatIndex,
        DEFAULT_GAME_CONFIG.startingPlayer.seatIndex
      )
    },
    enabledExpansions: normalizeEnabledExpansions(candidate.enabledExpansions)
  };
}

export function createGameConfig(overrides?: Partial<GameConfig>): GameConfig {
  return mergeGameConfig(DEFAULT_GAME_CONFIG, overrides ?? {});
}

export function mergeGameConfig(base: GameConfig, patch: Partial<GameConfigPatch>): GameConfig {
  return normalizeGameConfig({
    ...base,
    ...patch,
    startingPlayer: {
      ...base.startingPlayer,
      ...(patch.startingPlayer ?? {})
    },
    enabledExpansions: patch.enabledExpansions ?? base.enabledExpansions
  });
}

export function resolveGameConfigFromLegacy(input: {
  gameConfig?: unknown;
  setupMode?: unknown;
  startingPlayerMode?: unknown;
  startingSeatIndex?: unknown;
}): GameConfig {
  if (input.gameConfig !== undefined && input.gameConfig !== null) {
    return normalizeGameConfig(input.gameConfig);
  }

  return normalizeGameConfig({
    setupMode: input.setupMode,
    startingPlayer: {
      mode: input.startingPlayerMode,
      seatIndex: input.startingSeatIndex
    },
    enabledExpansions: []
  });
}
