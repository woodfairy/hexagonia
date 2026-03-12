import {
  getScenarioCatalogEntry,
  getScenarioAllowedLayoutModes,
  getScenarioDefaultLayoutMode,
  getScenarioDefaultTurnRule,
  isLayoutMode,
  isRulesFamily,
  isScenarioId,
  isScenarioRulesetId,
  resolveScenarioIdForPlayerCount,
  type LayoutMode,
  type RulesFamily,
  type ScenarioId,
  type ScenarioRulesetId
} from "./scenarios.js";

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

export type ScenarioOptionValue = string | number | boolean | null;

export interface ScenarioOptions {
  victoryPointsToWin?: number;
  newWorldScenarioSetupEnabled?: boolean;
  [key: string]: ScenarioOptionValue | undefined;
}

export interface GameConfig {
  rulesFamily: RulesFamily;
  scenarioId: ScenarioId;
  scenarioRulesetId: ScenarioRulesetId;
  layoutMode: LayoutMode;
  scenarioOptions: ScenarioOptions;
  boardSize: BoardSize;
  setupMode: SetupMode;
  turnRule: TurnRule;
  startingPlayer: StartingPlayerConfig;
  enabledExpansions: ExpansionId[];
}

export interface GameConfigPatch {
  rulesFamily?: RulesFamily;
  scenarioId?: ScenarioId;
  scenarioRulesetId?: ScenarioRulesetId;
  layoutMode?: LayoutMode;
  scenarioOptions?: Partial<ScenarioOptions>;
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
export const CURRENT_OFFICIAL_SCENARIO_RULESET_ID: ScenarioRulesetId = "current_2025";
export const DEFAULT_BASE_SCENARIO_ID: ScenarioId = "base.standard";
export const DEFAULT_SEAFARERS_SCENARIO_ID: ScenarioId = "seafarers.heading_for_new_shores";

export const DEFAULT_GAME_CONFIG: GameConfig = {
  rulesFamily: "base",
  scenarioId: DEFAULT_BASE_SCENARIO_ID,
  scenarioRulesetId: CURRENT_OFFICIAL_SCENARIO_RULESET_ID,
  layoutMode: "official_variable",
  scenarioOptions: {
    victoryPointsToWin: getScenarioCatalogEntry(DEFAULT_BASE_SCENARIO_ID).defaultVictoryPointsToWin,
    newWorldScenarioSetupEnabled: false
  },
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

function clampVictoryPointsToWin(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 3 ? value : fallback;
}

function normalizeEnabledExpansions(value: unknown): ExpansionId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(isExpansionId))];
}

function normalizeScenarioOptions(
  value: unknown,
  fallbackVictoryPointsToWin: number
): ScenarioOptions {
  const base: ScenarioOptions = {
    victoryPointsToWin: fallbackVictoryPointsToWin,
    newWorldScenarioSetupEnabled: false
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return base;
  }

  const candidate = value as Record<string, unknown>;
  const next: ScenarioOptions = { ...base };
  for (const [key, entry] of Object.entries(candidate)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      next[key] = entry;
    }
  }

  next.victoryPointsToWin = clampVictoryPointsToWin(
    candidate.victoryPointsToWin,
    fallbackVictoryPointsToWin
  );
  next.newWorldScenarioSetupEnabled =
    typeof candidate.newWorldScenarioSetupEnabled === "boolean"
      ? candidate.newWorldScenarioSetupEnabled
      : false;

  return next;
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

function resolveDefaultScenarioId(
  rulesFamily: RulesFamily,
  enabledExpansions: ExpansionId[]
): ScenarioId {
  if (rulesFamily === "seafarers" || enabledExpansions.includes("seafarers")) {
    return DEFAULT_SEAFARERS_SCENARIO_ID;
  }

  return DEFAULT_BASE_SCENARIO_ID;
}

function ensureScenarioFamilyCompatibility(
  rulesFamily: RulesFamily,
  scenarioId: ScenarioId,
  enabledExpansions: ExpansionId[]
): ScenarioId {
  const scenario = getScenarioCatalogEntry(scenarioId);
  if (scenario.rulesFamily === rulesFamily) {
    return scenarioId;
  }

  return resolveDefaultScenarioId(rulesFamily, enabledExpansions);
}

function resolveEffectiveRulesFamily(
  value: unknown,
  enabledExpansions: ExpansionId[]
): RulesFamily {
  if (isRulesFamily(value)) {
    return value;
  }

  return enabledExpansions.includes("seafarers") ? "seafarers" : DEFAULT_GAME_CONFIG.rulesFamily;
}

function resolveEffectiveLayoutMode(
  input: {
    layoutMode?: unknown;
    setupMode?: unknown;
  },
  scenarioId: ScenarioId
): LayoutMode {
  const scenario = getScenarioCatalogEntry(scenarioId);
  if (isLayoutMode(input.layoutMode)) {
    return scenario.fixedLayoutOnly && input.layoutMode === "official_variable"
      ? scenario.defaultLayoutMode
      : input.layoutMode;
  }

  if (input.setupMode === "official_variable") {
    return scenario.fixedLayoutOnly ? scenario.defaultLayoutMode : "official_variable";
  }

  return scenario.defaultLayoutMode;
}

export function normalizeGameConfig(value: unknown): GameConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createGameConfig();
  }

  const candidate = value as {
    rulesFamily?: unknown;
    scenarioId?: unknown;
    scenarioRulesetId?: unknown;
    layoutMode?: unknown;
    scenarioOptions?: unknown;
    boardSize?: unknown;
    setupMode?: unknown;
    turnRule?: unknown;
    startingPlayer?: {
      mode?: unknown;
      seatIndex?: unknown;
    } | null;
    enabledExpansions?: unknown;
  };

  const enabledExpansions = normalizeEnabledExpansions(candidate.enabledExpansions);
  const rulesFamily = resolveEffectiveRulesFamily(candidate.rulesFamily, enabledExpansions);
  const requestedScenarioId = isScenarioId(candidate.scenarioId)
    ? candidate.scenarioId
    : resolveDefaultScenarioId(rulesFamily, enabledExpansions);
  const scenarioId = ensureScenarioFamilyCompatibility(
    rulesFamily,
    requestedScenarioId,
    enabledExpansions
  );
  const scenario = getScenarioCatalogEntry(scenarioId);
  const layoutMode = resolveEffectiveLayoutMode(candidate, scenarioId);

  return {
    rulesFamily,
    scenarioId,
    scenarioRulesetId: isScenarioRulesetId(candidate.scenarioRulesetId)
      ? candidate.scenarioRulesetId
      : scenario.rulesetId,
    layoutMode,
    scenarioOptions: normalizeScenarioOptions(
      candidate.scenarioOptions,
      scenario.defaultVictoryPointsToWin
    ),
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
    enabledExpansions:
      enabledExpansions.length > 0
        ? enabledExpansions
        : [...scenario.enabledExpansions]
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
    scenarioOptions: {
      ...base.scenarioOptions,
      ...(patch.scenarioOptions ?? {})
    },
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
    scenarioOptions: {
      ...base.scenarioOptions,
      ...(patch.scenarioOptions ?? {})
    },
    startingPlayer: {
      ...base.startingPlayer,
      ...(patch.startingPlayer ?? {})
    },
    enabledExpansions: patch.enabledExpansions ?? base.enabledExpansions
  });
}

export function getScenarioVictoryPointsToWin(gameConfig: GameConfig): number {
  return clampVictoryPointsToWin(
    gameConfig.scenarioOptions.victoryPointsToWin,
    getScenarioCatalogEntry(gameConfig.scenarioId).defaultVictoryPointsToWin
  );
}

export function isNewWorldScenarioSetupEnabled(
  gameConfig: Pick<GameConfig, "scenarioId" | "scenarioOptions">
): boolean {
  return (
    gameConfig.scenarioId === "seafarers.new_world" &&
    gameConfig.scenarioOptions.newWorldScenarioSetupEnabled === true
  );
}

export function sanitizeRoomGameConfig(
  roomGameConfig: RoomGameConfig,
  seatsOrPlayerCount: RoomGameConfigSeat[] | number
): RoomGameConfig {
  const seatContext = toSeatContext(seatsOrPlayerCount);
  const normalized = normalizeRoomGameConfig(roomGameConfig);
  const occupiedSeats = seatContext.filter((seat) => !!seat.userId);
  const playerCount = occupiedSeats.length || seatContext.length || 0;
  const scenarioId = resolveScenarioIdForPlayerCount(normalized.scenarioId, Math.max(playerCount, 3));
  const scenario = getScenarioCatalogEntry(scenarioId);
  const effectivePlayerCount = Math.max(playerCount, 3);
  const allowedLayoutModes = getScenarioAllowedLayoutModes(scenarioId, effectivePlayerCount);
  const defaultLayoutMode = getScenarioDefaultLayoutMode(scenarioId, effectivePlayerCount);
  const startingSeatStillOccupied = occupiedSeats.some(
    (seat) => seat.index === normalized.startingPlayer.seatIndex
  );
  const nextStartingSeatIndex = startingSeatStillOccupied
    ? normalized.startingPlayer.seatIndex
    : (occupiedSeats[0]?.index ?? normalized.startingPlayer.seatIndex);
  const boardSize: BoardSize =
    scenario.rulesFamily === "base"
      ? occupiedSeats.length >= 5
        ? "extended"
        : normalized.boardSize
      : occupiedSeats.length >= 5
        ? "extended"
        : scenario.defaultBoardSize;
  const setupMode =
    scenario.rulesFamily === "base"
      ? boardSize === "extended" && normalized.setupMode === "beginner"
        ? "official_variable"
        : normalized.setupMode
      : "official_variable";
  const layoutMode = allowedLayoutModes.includes(normalized.layoutMode)
    ? normalized.layoutMode
    : defaultLayoutMode;

  return {
    ...normalized,
    rulesFamily: scenario.rulesFamily,
    scenarioId,
    scenarioRulesetId: scenario.rulesetId,
    layoutMode,
    scenarioOptions: normalizeScenarioOptions(
      normalized.scenarioOptions,
      scenario.defaultVictoryPointsToWin
    ),
    boardSize,
    setupMode,
    turnRule:
      scenario.rulesFamily === "seafarers"
        ? getScenarioDefaultTurnRule(scenarioId, effectivePlayerCount)
        : normalized.turnRule,
    enabledExpansions: [...scenario.enabledExpansions],
    startingPlayer: {
      ...normalized.startingPlayer,
      seatIndex: nextStartingSeatIndex
    }
  };
}

export function resolveOfficialGameConfig(
  seatsOrPlayerCount: RoomGameConfigSeat[] | number,
  roomGameConfig?: Partial<RoomGameConfig>
): GameConfig {
  const seatContext = toSeatContext(seatsOrPlayerCount);
  const occupiedSeats = seatContext.filter((seat) => !!seat.userId);
  const playerCount = occupiedSeats.length || seatContext.length || 0;
  const requestedScenarioId =
    roomGameConfig && isScenarioId(roomGameConfig.scenarioId)
      ? roomGameConfig.scenarioId
      : DEFAULT_BASE_SCENARIO_ID;
  const effectivePlayerCount = Math.max(playerCount, 3);
  const scenarioId = resolveScenarioIdForPlayerCount(requestedScenarioId, effectivePlayerCount);
  const scenario = getScenarioCatalogEntry(scenarioId);
  const boardSize: BoardSize =
    scenario.rulesFamily === "base"
      ? occupiedSeats.length >= 5
        ? "extended"
        : "standard"
      : occupiedSeats.length >= 5
        ? "extended"
        : scenario.defaultBoardSize;

  return normalizeGameConfig({
    rulesFamily: scenario.rulesFamily,
    scenarioId,
    scenarioRulesetId: scenario.rulesetId,
    layoutMode: getScenarioDefaultLayoutMode(scenarioId, effectivePlayerCount),
    scenarioOptions: {
      victoryPointsToWin: scenario.defaultVictoryPointsToWin,
      newWorldScenarioSetupEnabled: false
    },
    boardSize,
    setupMode: "official_variable",
    turnRule:
      scenario.rulesFamily === "seafarers"
        ? getScenarioDefaultTurnRule(scenarioId, effectivePlayerCount)
        : CURRENT_OFFICIAL_TURN_RULE,
    startingPlayer: {
      mode: "rolled",
      seatIndex: occupiedSeats[0]?.index ?? 0
    },
    enabledExpansions: [...scenario.enabledExpansions]
  });
}

export function resolveRoomGameConfig(
  roomGameConfig: RoomGameConfig,
  seatsOrPlayerCount: RoomGameConfigSeat[] | number
): GameConfig {
  const sanitizedRoomGameConfig = sanitizeRoomGameConfig(roomGameConfig, seatsOrPlayerCount);

  if (sanitizedRoomGameConfig.rulesPreset === "standard") {
    return resolveOfficialGameConfig(seatsOrPlayerCount, sanitizedRoomGameConfig);
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
  const officialConfig = resolveOfficialGameConfig(seatsOrPlayerCount, roomGameConfig);

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
    layoutMode: input.setupMode === "official_variable" ? "official_variable" : undefined,
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
    layoutMode: input.setupMode === "official_variable" ? "official_variable" : undefined,
    turnRule: input.turnRule,
    startingPlayer: {
      mode: input.startingPlayerMode,
      seatIndex: input.startingSeatIndex
    },
    enabledExpansions: []
  });
}
