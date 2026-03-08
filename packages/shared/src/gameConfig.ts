export const SETUP_MODES = ["official_variable", "beginner"] as const;
export const STARTING_PLAYER_MODES = ["rolled", "manual"] as const;
export const EXPANSION_IDS = ["seafarers"] as const;
export const BOARD_SIZES = ["standard", "extended"] as const;
export const TURN_RULES = ["standard", "paired_players", "special_build_phase"] as const;
export const RULES_PRESETS = ["standard", "custom"] as const;

export type SetupMode = (typeof SETUP_MODES)[number];
export type StartingPlayerMode = (typeof STARTING_PLAYER_MODES)[number];
export type ExpansionId = (typeof EXPANSION_IDS)[number];
export type BoardSize = (typeof BOARD_SIZES)[number];
export type TurnRule = (typeof TURN_RULES)[number];
export type RulesPreset = (typeof RULES_PRESETS)[number];

export interface StartingPlayerConfig {
  mode: StartingPlayerMode;
  seatIndex: number;
}

export interface GameConfig {
  boardSize: BoardSize;
  setupMode: SetupMode;
  turnRule: TurnRule;
  startingPlayer: StartingPlayerConfig;
  enabledExpansions: ExpansionId[];
}

export interface GameConfigPatch {
  boardSize?: BoardSize;
  setupMode?: SetupMode;
  turnRule?: TurnRule;
  startingPlayer?: Partial<StartingPlayerConfig>;
  enabledExpansions?: ExpansionId[];
}

export interface RoomGameConfig extends GameConfig {
  rulesPreset: RulesPreset;
}

export interface RoomGameConfigPatch extends GameConfigPatch {
  rulesPreset?: RulesPreset;
}

type RoomGameConfigSeat = {
  index: number;
  userId: string | null;
};

export const CURRENT_OFFICIAL_TURN_RULE: TurnRule = "standard";

export const DEFAULT_GAME_CONFIG: GameConfig = {
  boardSize: "standard",
  setupMode: "official_variable",
  turnRule: "standard",
  startingPlayer: {
    mode: "rolled",
    seatIndex: 0
  },
  enabledExpansions: []
};

export const DEFAULT_ROOM_GAME_CONFIG: RoomGameConfig = {
  rulesPreset: "standard",
  ...DEFAULT_GAME_CONFIG
};

function isSetupMode(value: unknown): value is SetupMode {
  return typeof value === "string" && SETUP_MODES.includes(value as SetupMode);
}

function isBoardSize(value: unknown): value is BoardSize {
  return typeof value === "string" && BOARD_SIZES.includes(value as BoardSize);
}

function isStartingPlayerMode(value: unknown): value is StartingPlayerMode {
  return typeof value === "string" && STARTING_PLAYER_MODES.includes(value as StartingPlayerMode);
}

function isTurnRule(value: unknown): value is TurnRule {
  return typeof value === "string" && TURN_RULES.includes(value as TurnRule);
}

function isRulesPreset(value: unknown): value is RulesPreset {
  return typeof value === "string" && RULES_PRESETS.includes(value as RulesPreset);
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
    boardSize?: unknown;
    setupMode?: unknown;
    turnRule?: unknown;
    startingPlayer?: {
      mode?: unknown;
      seatIndex?: unknown;
    } | null;
    enabledExpansions?: unknown;
  };

  return {
    boardSize: isBoardSize(candidate.boardSize)
      ? candidate.boardSize
      : DEFAULT_GAME_CONFIG.boardSize,
    setupMode: isSetupMode(candidate.setupMode)
      ? candidate.setupMode
      : DEFAULT_GAME_CONFIG.setupMode,
    turnRule: isTurnRule(candidate.turnRule)
      ? candidate.turnRule
      : DEFAULT_GAME_CONFIG.turnRule,
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

export function normalizeRoomGameConfig(value: unknown): RoomGameConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createRoomGameConfig();
  }

  const candidate = value as { rulesPreset?: unknown };

  return {
    rulesPreset: isRulesPreset(candidate.rulesPreset)
      ? candidate.rulesPreset
      : DEFAULT_ROOM_GAME_CONFIG.rulesPreset,
    ...normalizeGameConfig(value)
  };
}

export function createGameConfig(overrides?: Partial<GameConfig>): GameConfig {
  return mergeGameConfig(DEFAULT_GAME_CONFIG, overrides ?? {});
}

export function createRoomGameConfig(overrides?: Partial<RoomGameConfig>): RoomGameConfig {
  return mergeRoomGameConfig(DEFAULT_ROOM_GAME_CONFIG, overrides ?? {});
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

export function mergeRoomGameConfig(
  base: RoomGameConfig,
  patch: Partial<RoomGameConfigPatch>
): RoomGameConfig {
  return normalizeRoomGameConfig({
    ...base,
    ...patch,
    startingPlayer: {
      ...base.startingPlayer,
      ...(patch.startingPlayer ?? {})
    },
    enabledExpansions: patch.enabledExpansions ?? base.enabledExpansions
  });
}

function toSeatContext(seatsOrPlayerCount: RoomGameConfigSeat[] | number): RoomGameConfigSeat[] {
  if (typeof seatsOrPlayerCount === "number") {
    const occupiedSeatCount = Math.max(0, Math.trunc(seatsOrPlayerCount));
    return Array.from({ length: occupiedSeatCount }, (_, index) => ({
      index,
      userId: `occupied-${index}`
    }));
  }

  return seatsOrPlayerCount.map((seat) => ({
    index: seat.index,
    userId: seat.userId
  }));
}

export function sanitizeRoomGameConfig(
  roomGameConfig: RoomGameConfig,
  seatsOrPlayerCount: RoomGameConfigSeat[] | number
): RoomGameConfig {
  const seatContext = toSeatContext(seatsOrPlayerCount);
  const normalized = normalizeRoomGameConfig(roomGameConfig);
  const occupiedSeats = seatContext.filter((seat) => !!seat.userId);
  const startingSeatStillOccupied = occupiedSeats.some(
    (seat) => seat.index === normalized.startingPlayer.seatIndex
  );
  const nextStartingSeatIndex = startingSeatStillOccupied
    ? normalized.startingPlayer.seatIndex
    : (occupiedSeats[0]?.index ?? normalized.startingPlayer.seatIndex);
  const boardSize: BoardSize =
    occupiedSeats.length >= 5 ? "extended" : normalized.boardSize;
  const setupMode =
    boardSize === "extended" && normalized.setupMode === "beginner"
      ? "official_variable"
      : normalized.setupMode;

  return {
    ...normalized,
    boardSize,
    setupMode,
    startingPlayer: {
      ...normalized.startingPlayer,
      seatIndex: nextStartingSeatIndex
    }
  };
}

export function resolveOfficialGameConfig(
  seatsOrPlayerCount: RoomGameConfigSeat[] | number
): GameConfig {
  const seatContext = toSeatContext(seatsOrPlayerCount);
  const occupiedSeats = seatContext.filter((seat) => !!seat.userId);

  return normalizeGameConfig({
    boardSize: occupiedSeats.length >= 5 ? "extended" : "standard",
    setupMode: "official_variable",
    turnRule: CURRENT_OFFICIAL_TURN_RULE,
    startingPlayer: {
      mode: "rolled",
      seatIndex: occupiedSeats[0]?.index ?? 0
    },
    enabledExpansions: []
  });
}

export function resolveRoomGameConfig(
  roomGameConfig: RoomGameConfig,
  seatsOrPlayerCount: RoomGameConfigSeat[] | number
): GameConfig {
  const sanitizedRoomGameConfig = sanitizeRoomGameConfig(roomGameConfig, seatsOrPlayerCount);

  if (sanitizedRoomGameConfig.rulesPreset === "standard") {
    return resolveOfficialGameConfig(seatsOrPlayerCount);
  }

  return normalizeGameConfig(sanitizedRoomGameConfig);
}

export function isOfficialRoomGameConfig(
  roomGameConfig: RoomGameConfig,
  seatsOrPlayerCount: RoomGameConfigSeat[] | number
): boolean {
  const effectiveConfig = resolveRoomGameConfig(
    {
      ...roomGameConfig,
      rulesPreset: "custom"
    },
    seatsOrPlayerCount
  );
  const officialConfig = resolveOfficialGameConfig(seatsOrPlayerCount);

  return JSON.stringify(effectiveConfig) === JSON.stringify(officialConfig);
}

export function resolveGameConfigFromLegacy(input: {
  gameConfig?: unknown;
  boardSize?: unknown;
  setupMode?: unknown;
  turnRule?: unknown;
  startingPlayerMode?: unknown;
  startingSeatIndex?: unknown;
}): GameConfig {
  if (input.gameConfig !== undefined && input.gameConfig !== null) {
    return normalizeGameConfig(input.gameConfig);
  }

  return normalizeGameConfig({
    boardSize: input.boardSize,
    setupMode: input.setupMode,
    turnRule: input.turnRule,
    startingPlayer: {
      mode: input.startingPlayerMode,
      seatIndex: input.startingSeatIndex
    },
    enabledExpansions: []
  });
}

export function resolveRoomGameConfigFromLegacy(input: {
  gameConfig?: unknown;
  boardSize?: unknown;
  setupMode?: unknown;
  turnRule?: unknown;
  startingPlayerMode?: unknown;
  startingSeatIndex?: unknown;
}): RoomGameConfig {
  if (input.gameConfig !== undefined && input.gameConfig !== null) {
    return normalizeRoomGameConfig(input.gameConfig);
  }

  return normalizeRoomGameConfig({
    boardSize: input.boardSize,
    setupMode: input.setupMode,
    turnRule: input.turnRule,
    startingPlayer: {
      mode: input.startingPlayerMode,
      seatIndex: input.startingSeatIndex
    },
    enabledExpansions: []
  });
}
