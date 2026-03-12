import type { ExpansionId } from "./gameConfig.js";
import type { Resource } from "./game.js";

export type BuildCostKey = "road" | "ship" | "settlement" | "city" | "development";

export interface ExpansionDefinition {
  id: ExpansionId;
  label: string;
  enabledByDefault: boolean;
}

export const BUILD_COSTS: Record<BuildCostKey, Partial<Record<Resource, number>>> = {
  road: { brick: 1, lumber: 1 },
  ship: { lumber: 1, wool: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { ore: 3, grain: 2 },
  development: { ore: 1, grain: 1, wool: 1 }
};

export const EXPANSION_DEFINITIONS: Record<ExpansionId, ExpansionDefinition> = {
  seafarers: {
    id: "seafarers",
    label: "Seefahrer",
    enabledByDefault: false
  }
};
