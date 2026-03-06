import type { Resource, ResourceMap } from "./game.js";
import { RESOURCES } from "./game.js";

export function createEmptyResourceMap(): ResourceMap {
  return {
    brick: 0,
    lumber: 0,
    ore: 0,
    grain: 0,
    wool: 0
  };
}

export function cloneResourceMap(input: Partial<ResourceMap> = {}): ResourceMap {
  const next = createEmptyResourceMap();
  for (const resource of RESOURCES) {
    next[resource] = input[resource] ?? 0;
  }
  return next;
}

export function addResources(
  current: ResourceMap,
  delta: Partial<ResourceMap>
): ResourceMap {
  const next = cloneResourceMap(current);
  for (const resource of RESOURCES) {
    next[resource] += delta[resource] ?? 0;
  }
  return next;
}

export function subtractResources(
  current: ResourceMap,
  delta: Partial<ResourceMap>
): ResourceMap {
  const next = cloneResourceMap(current);
  for (const resource of RESOURCES) {
    next[resource] -= delta[resource] ?? 0;
  }
  return next;
}

export function hasResources(
  current: ResourceMap,
  cost: Partial<ResourceMap>
): boolean {
  return RESOURCES.every((resource) => current[resource] >= (cost[resource] ?? 0));
}

export function totalResources(resourceMap: ResourceMap): number {
  return RESOURCES.reduce((total, resource) => total + resourceMap[resource], 0);
}

export function isEmptyResourceMap(resourceMap: Partial<ResourceMap>): boolean {
  return RESOURCES.every((resource) => (resourceMap[resource] ?? 0) === 0);
}

export function equalResourceMaps(a: Partial<ResourceMap>, b: Partial<ResourceMap>): boolean {
  return RESOURCES.every((resource) => (a[resource] ?? 0) === (b[resource] ?? 0));
}

export function toResourceEntries(
  resourceMap: Partial<ResourceMap>
): Array<[Resource, number]> {
  return RESOURCES.map((resource) => [resource, resourceMap[resource] ?? 0]);
}
