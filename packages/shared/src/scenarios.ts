import scenarioCatalogJson from "./scenarioCatalog.json" with { type: "json" };
import type { BoardSize, ExpansionId, TurnRule } from "./gameConfig.js";

export const RULES_FAMILIES = ["base", "seafarers"] as const;
export const SCENARIO_RULESET_IDS = ["current_2025"] as const;
export const LAYOUT_MODES = ["official_fixed", "official_variable"] as const;

export type RulesFamily = (typeof RULES_FAMILIES)[number];
export type ScenarioRulesetId = (typeof SCENARIO_RULESET_IDS)[number];
export type LayoutMode = (typeof LAYOUT_MODES)[number];
export type ScenarioGroup = "base" | "official_seafarers";

type ScenarioCatalogJson = typeof scenarioCatalogJson;
export type ScenarioId = keyof ScenarioCatalogJson;

export interface ScenarioCatalogEntry {
  id: ScenarioId;
  rulesFamily: RulesFamily;
  rulesetId: ScenarioRulesetId;
  titleKey: string;
  summaryKey: string;
  playerCounts: readonly number[];
  defaultBoardSize: BoardSize;
  defaultTurnRule: TurnRule;
  defaultLayoutMode: LayoutMode;
  defaultVictoryPointsToWin: number;
  fixedLayoutOnly: boolean;
  playerCountLayoutModes?: Partial<Record<number, readonly LayoutMode[]>>;
  playerCountDefaultLayoutModes?: Partial<Record<number, LayoutMode>>;
  playerCountTurnRules?: Partial<Record<number, TurnRule>>;
  enabledExpansions: readonly ExpansionId[];
  scenarioGroup: ScenarioGroup;
}

type ScenarioCatalogJsonEntry = Omit<ScenarioCatalogEntry, "id"> & { id: ScenarioId };
const rawScenarioCatalog = scenarioCatalogJson as Record<ScenarioId, ScenarioCatalogJsonEntry>;

export const SCENARIO_CATALOG = Object.freeze(
  Object.fromEntries(
    Object.entries(rawScenarioCatalog).map(([scenarioId, entry]) => [
      scenarioId,
      {
        ...entry,
        id: scenarioId as ScenarioId
      }
    ])
  )
) as { readonly [K in ScenarioId]: ScenarioCatalogEntry & { id: K } };

export const SCENARIO_IDS = Object.freeze(
  Object.keys(SCENARIO_CATALOG) as ScenarioId[]
);

export function isRulesFamily(value: unknown): value is RulesFamily {
  return typeof value === "string" && RULES_FAMILIES.includes(value as RulesFamily);
}

export function isScenarioRulesetId(value: unknown): value is ScenarioRulesetId {
  return typeof value === "string" && SCENARIO_RULESET_IDS.includes(value as ScenarioRulesetId);
}

export function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === "string" && LAYOUT_MODES.includes(value as LayoutMode);
}

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === "string" && value in SCENARIO_CATALOG;
}

export function getScenarioCatalogEntry(scenarioId: ScenarioId): ScenarioCatalogEntry {
  return SCENARIO_CATALOG[scenarioId];
}

export function getScenarioAllowedLayoutModes(
  scenarioId: ScenarioId,
  playerCount: number
): readonly LayoutMode[] {
  const scenario = getScenarioCatalogEntry(scenarioId);
  const playerCountModes = scenario.playerCountLayoutModes?.[playerCount];
  if (playerCountModes?.length) {
    return playerCountModes;
  }

  return scenario.fixedLayoutOnly ? ["official_fixed"] : LAYOUT_MODES;
}

export function getScenarioDefaultLayoutMode(
  scenarioId: ScenarioId,
  playerCount: number
): LayoutMode {
  const scenario = getScenarioCatalogEntry(scenarioId);
  return scenario.playerCountDefaultLayoutModes?.[playerCount] ?? scenario.defaultLayoutMode;
}

export function getScenarioDefaultTurnRule(
  scenarioId: ScenarioId,
  playerCount: number
): TurnRule {
  const scenario = getScenarioCatalogEntry(scenarioId);
  return scenario.playerCountTurnRules?.[playerCount] ?? scenario.defaultTurnRule;
}

export function isScenarioFixedLayoutOnly(
  scenarioId: ScenarioId,
  playerCount: number
): boolean {
  const allowedModes = getScenarioAllowedLayoutModes(scenarioId, playerCount);
  return allowedModes.length === 1 && allowedModes[0] === "official_fixed";
}

export function listScenarioCatalogEntries(rulesFamily?: RulesFamily): ScenarioCatalogEntry[] {
  const entries = Object.values(SCENARIO_CATALOG);
  return rulesFamily ? entries.filter((entry) => entry.rulesFamily === rulesFamily) : entries;
}

export function resolveScenarioIdForPlayerCount(
  scenarioId: ScenarioId,
  playerCount: number
): ScenarioId {
  const entry = getScenarioCatalogEntry(scenarioId);
  if (entry.playerCounts.includes(playerCount)) {
    return scenarioId;
  }

  if (scenarioId === "seafarers.four_islands" && playerCount >= 5) {
    return "seafarers.six_islands";
  }

  if (scenarioId === "seafarers.six_islands" && playerCount <= 4) {
    return "seafarers.four_islands";
  }

  return entry.rulesFamily === "seafarers"
    ? "seafarers.heading_for_new_shores"
    : "base.standard";
}
