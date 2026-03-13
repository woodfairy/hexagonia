from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, deque
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from extract_official_scenarios import (
    GENERATOR_PATH,
    build_environment,
    extract_scenario_info_entries,
    normalize_resource_name,
)


RESOURCE_NAME_TO_INTERNAL = {
    "field": "grain",
    "forest": "lumber",
    "hill": "brick",
    "mountain": "ore",
    "pasture": "wool",
    "generic": "generic",
}
PORT_DISTRIBUTION_ORDER = ("generic", "brick", "lumber", "ore", "grain", "wool")
AXIAL_NEIGHBOR_OFFSETS = ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1))
PLAYER_COLORS_BY_COUNT: dict[int, tuple[str, ...]] = {
    3: ("red", "blue", "white"),
    4: ("red", "blue", "white", "orange"),
    5: ("red", "blue", "white", "orange", "green"),
    6: ("red", "blue", "white", "orange", "green", "purple"),
}
PLAYER_COLOR_ORDER = PLAYER_COLORS_BY_COUNT[6]
COLOR_NAME_TO_INTERNAL = {
    "red": "red",
    "blue": "blue",
    "white": "white",
    "orange": "orange",
    "green": "green",
    "brown": "purple",
    "purple": "purple",
}
PIRATE_FLEET_WAYPOINT_COUNT = {
    "standard": 3,
    "extended": 5,
}

PROJECT_SCENARIO_VARIANTS: dict[str, list[tuple[str, str, tuple[int, ...]]]] = {
    "heading-for-new-shores-3": [("seafarers.heading_for_new_shores", "standard", (3,))],
    "heading-for-new-shores-4": [("seafarers.heading_for_new_shores", "standard", (4,))],
    "heading-for-new-shores-56": [("seafarers.heading_for_new_shores", "extended", (5, 6))],
    "the-four-islands-3": [("seafarers.four_islands", "standard", (3,))],
    "the-four-islands-4": [("seafarers.four_islands", "standard", (4,))],
    "the-six-islands": [("seafarers.six_islands", "extended", (5, 6))],
    "through-the-desert-3": [("seafarers.through_the_desert", "standard", (3,))],
    "through-the-desert-4": [("seafarers.through_the_desert", "standard", (4,))],
    "through-the-desert-56": [("seafarers.through_the_desert", "extended", (5, 6))],
    "the-forgotten-tribe-34": [("seafarers.forgotten_tribe", "standard", (3, 4))],
    "the-forgotten-tribe-56": [("seafarers.forgotten_tribe", "extended", (5, 6))],
    "cloth-for-catan-34": [("seafarers.cloth_for_catan", "standard", (3, 4))],
    "cloth-for-catan-56": [("seafarers.cloth_for_catan", "extended", (5, 6))],
    "the-pirate-islands-34": [("seafarers.pirate_islands", "standard", (3, 4))],
    "the-pirate-islands-56": [("seafarers.pirate_islands", "extended", (5, 6))],
    "the-wonders-of-catan-34": [("seafarers.wonders_of_catan", "standard", (3, 4))],
    "the-wonders-of-catan-56": [("seafarers.wonders_of_catan", "extended", (5, 6))],
}


def coord_sort_key(coord: str) -> tuple[int, int]:
    q, r = coord.split(":")
    return int(r), int(q)


def player_color_sort_key(color: str) -> int:
    return PLAYER_COLOR_ORDER.index(color)


def build_layout_coords(map_info: dict[str, Any], map_class: str) -> list[str]:
    map_class_info = map_info[map_class]
    rows: list[int] = map_class_info["hexesPerRow"]

    if map_class_info.get("baseClass") == "hexagon-gallery-seafarers":
        compact_row_count = (len(rows) + 1) // 2
        plateau_count = max(0, compact_row_count - 7)
        rows = [4, 5, 6, 7, *([7] * plateau_count), 6, 5, 4]

        expected_tile_count = int(map_class_info["numTiles"])
        if sum(rows) != expected_tile_count:
            raise ValueError(
                f"Unexpected compact Seafarers row sum for {map_class}: {sum(rows)} != {expected_tile_count}"
            )

    center_row_index = len(rows) // 2
    layout_coords: list[str] = []
    q_start = 0
    previous_row_len = rows[0]

    for row_index, row_len in enumerate(rows):
        if row_index > 0 and row_len > previous_row_len:
            q_start -= row_len - previous_row_len

        r = row_index - center_row_index
        for offset in range(row_len):
            layout_coords.append(f"{q_start + offset}:{r}")

        previous_row_len = row_len

    return layout_coords


def build_coord_by_index(layout_coords: list[str]) -> dict[str, str]:
    return {str(index): coord for index, coord in enumerate(layout_coords, start=1)}


def iter_neighbor_coords(coord: str) -> list[str]:
    q, r = map(int, coord.split(":"))
    return [f"{q + dq}:{r + dr}" for dq, dr in AXIAL_NEIGHBOR_OFFSETS]


def normalize_port_type(value: str | None) -> str | None:
    if value is None:
        return None
    return RESOURCE_NAME_TO_INTERNAL.get(value, normalize_resource_name(value))


def normalize_token_value(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def build_port_distribution(scenario: dict[str, Any]) -> list[str]:
    harbor_pools = scenario.get("harborPools") or []
    counts = harbor_pools[0] if harbor_pools else ((scenario.get("totals") or {}).get("harbors") or {})
    distribution: list[str] = []
    for port_type in PORT_DISTRIBUTION_ORDER:
        official_name = (
            "generic"
            if port_type == "generic"
            else {
                "brick": "hill",
                "lumber": "forest",
                "ore": "mountain",
                "grain": "field",
                "wool": "pasture",
            }[port_type]
        )
        distribution.extend([port_type] * int(counts.get(official_name, 0)))
    return distribution


def collect_numeric_tokens(*token_maps: Any) -> dict[str, int]:
    merged: dict[str, int] = {}
    for token_map in token_maps:
        if not isinstance(token_map, dict):
            continue
        for tile_index, raw_value in token_map.items():
            token_value = normalize_token_value(raw_value)
            if token_value is not None:
                merged[str(tile_index)] = token_value
    return merged


def resolve_explicit_robber_index(scenario: dict[str, Any]) -> str | None:
    recommended_fixed = scenario.get("recommendedFixed") or {}
    explicit_recommended = recommended_fixed.get("robber")
    if isinstance(explicit_recommended, (str, int)):
        return str(explicit_recommended)

    robber = scenario.get("robber") or {}
    if robber.get("type") == "fixed":
        return str(robber["value"])
    return None


def resolve_explicit_pirate_index(scenario: dict[str, Any]) -> str | None:
    pirate = scenario.get("pirate") or {}
    if pirate.get("type") == "fixed":
        return str(pirate["value"])
    return None


def terrain_at_coord(layout_coords: list[str], tiles: dict[str, dict[str, Any]], coord: str) -> str:
    if coord not in layout_coords:
        return "sea"
    return str((tiles.get(coord) or {}).get("terrain") or "sea")


def collect_land_coords(layout_coords: list[str], tiles: dict[str, dict[str, Any]]) -> set[str]:
    return {coord for coord in layout_coords if terrain_at_coord(layout_coords, tiles, coord) != "sea"}


def flood_fill_coords(seed_coords: set[str], allowed_coords: set[str]) -> set[str]:
    seeds = [coord for coord in seed_coords if coord in allowed_coords]
    discovered = set(seeds)
    queue = deque(seeds)

    while queue:
        current = queue.popleft()
        for neighbor in iter_neighbor_coords(current):
            if neighbor not in allowed_coords or neighbor in discovered:
                continue
            discovered.add(neighbor)
            queue.append(neighbor)

    return discovered


def build_tile_specs(
    scenario: dict[str, Any],
    layout_coords: list[str],
    coord_by_index: dict[str, str],
) -> dict[str, dict[str, Any]]:
    fixed = scenario.get("fixed") or {}
    recommended_fixed = scenario.get("recommendedFixed") or {}
    fixed_resources = fixed.get("resources") or {}
    recommended_resources = recommended_fixed.get("resources") or {}
    numeric_tokens = collect_numeric_tokens(
        fixed.get("tokens") or {},
        recommended_fixed.get("tokens") or {},
        recommended_fixed.get("token") or {},
    )
    explicit_robber_index = resolve_explicit_robber_index(scenario)
    explicit_pirate_index = resolve_explicit_pirate_index(scenario)

    explicit_resources: dict[str, str] = {}
    for resource_map in (fixed_resources, recommended_resources):
        for tile_index, raw_resource in resource_map.items():
            explicit_resources[str(tile_index)] = normalize_resource_name(str(raw_resource))

    hidden_indices = sorted(
        [tile_index for tile_index, terrain in explicit_resources.items() if terrain == "reveal"],
        key=int,
    )
    hidden_index_set = set(hidden_indices)

    tiles: dict[str, dict[str, Any]] = {}
    for tile_index, terrain in explicit_resources.items():
        if terrain == "reveal":
            continue
        coord = coord_by_index[tile_index]
        tile: dict[str, Any] = {"terrain": terrain}
        token = numeric_tokens.get(tile_index)
        if token is not None:
            tile["token"] = token
        if explicit_robber_index == tile_index:
            tile["robber"] = True
        if explicit_pirate_index == tile_index:
            tile["kind"] = "sea"
            tile["occupant"] = "pirate"
        tiles[coord] = tile

    if explicit_pirate_index and explicit_pirate_index not in explicit_resources:
        coord = coord_by_index[explicit_pirate_index]
        tiles[coord] = {"terrain": "sea", "kind": "sea", "occupant": "pirate"}

    if not hidden_indices:
        return tiles

    hidden_coords = [coord_by_index[tile_index] for tile_index in hidden_indices]
    hidden_coord_set = set(hidden_coords)

    visible_counts: Counter[str] = Counter()
    for coord in layout_coords:
        if coord in hidden_coord_set:
            continue
        visible_counts[terrain_at_coord(layout_coords, tiles, coord)] += 1

    hidden_terrain_pool: list[str] = []
    for raw_terrain, raw_count in ((scenario.get("totals") or {}).get("resources") or {}).items():
        if raw_terrain == "reveal":
            continue
        terrain = normalize_resource_name(str(raw_terrain))
        hidden_count = int(raw_count) - visible_counts[terrain]
        if hidden_count > 0:
            hidden_terrain_pool.extend([terrain] * hidden_count)

    visible_token_counts: Counter[int] = Counter(
        tile["token"] for tile in tiles.values() if isinstance(tile.get("token"), int)
    )
    hidden_token_pool: list[int] = []
    for raw_token, raw_count in ((scenario.get("totals") or {}).get("tokens") or {}).items():
        token = int(raw_token)
        hidden_count = int(raw_count) - visible_token_counts[token]
        if hidden_count > 0:
            hidden_token_pool.extend([token] * hidden_count)

    if len(hidden_coords) != len(hidden_terrain_pool):
        raise ValueError(
            f"Fog coord count mismatch for {scenario['name']}: {len(hidden_coords)} coords, {len(hidden_terrain_pool)} terrains."
        )

    expected_hidden_token_count = sum(
        1 for terrain in hidden_terrain_pool if terrain not in {"sea", "desert", "gold"}
    )
    if len(hidden_token_pool) != expected_hidden_token_count:
        raise ValueError(
            f"Fog token count mismatch for {scenario['name']}: {expected_hidden_token_count} expected, {len(hidden_token_pool)} available."
        )

    hidden_token_index = 0
    for tile_index, terrain in zip(hidden_indices, hidden_terrain_pool):
        coord = coord_by_index[tile_index]
        tile: dict[str, Any] = {
            "terrain": terrain,
            "hidden": True,
            "kind": "fog",
        }
        if terrain not in {"sea", "desert", "gold"}:
            tile["token"] = hidden_token_pool[hidden_token_index]
            hidden_token_index += 1
        if explicit_robber_index == tile_index:
            tile["robber"] = True
        if explicit_pirate_index == tile_index:
            tile["occupant"] = "pirate"
        tiles[coord] = tile

    if hidden_token_index != len(hidden_token_pool):
        raise ValueError(f"Unused fog tokens while building {scenario['name']}.")

    return tiles


def collect_port_refs(scenario: dict[str, Any], coord_by_index: dict[str, str]) -> list[dict[str, Any]]:
    harbors = ((scenario.get("recommendedFixed") or {}).get("harbors") or {})
    refs: list[dict[str, Any]] = []
    for tile_index, placements in harbors.items():
        for placement in placements:
            side, raw_type = placement
            ref: dict[str, Any] = {
                "tileCoord": coord_by_index[str(tile_index)],
                "side": int(side),
            }
            port_type = normalize_port_type(raw_type)
            if port_type is not None:
                ref["type"] = port_type
            refs.append(ref)
    return refs


def build_ports(scenario: dict[str, Any], coord_by_index: dict[str, str]) -> list[dict[str, Any]]:
    return collect_port_refs(scenario, coord_by_index)


def build_edge_refs(token_map: Any, coord_by_index: dict[str, str]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    if not isinstance(token_map, dict):
        return refs
    for tile_index, placements in token_map.items():
        coord = coord_by_index[str(tile_index)]
        for placement in placements:
            refs.append(
                {
                    "tileCoord": coord,
                    "side": int(placement["side"]),
                }
            )
    return refs


def build_colored_point_refs(token_map: Any, coord_by_index: dict[str, str]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    if not isinstance(token_map, dict):
        return refs
    for tile_index, placements in token_map.items():
        coord = coord_by_index[str(tile_index)]
        for placement in placements:
            if not str(placement.get("positionType") or "").startswith("point"):
                continue
            color = COLOR_NAME_TO_INTERNAL.get(str(placement.get("color")))
            if color is None:
                continue
            refs.append(
                {
                    "color": color,
                    "ref": {
                        "tileCoord": coord,
                        "corner": int(placement["side"]),
                    },
                }
            )
    return refs


def build_forgotten_tribe_markers(
    scenario: dict[str, Any],
    coord_by_index: dict[str, str],
) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    for ref in build_edge_refs(scenario.get("catanChitTokens"), coord_by_index):
        markers.append({"type": "forgotten_tribe_vp", "ref": ref})
    for ref in build_edge_refs(scenario.get("developmentCardTokens"), coord_by_index):
        markers.append({"type": "forgotten_tribe_development", "ref": ref})

    port_types = build_port_distribution(scenario)
    port_refs = collect_port_refs(scenario, coord_by_index)
    if len(port_refs) != len(port_types):
        raise ValueError(
            f"Forgotten Tribe port count mismatch for {scenario['name']}: {len(port_refs)} refs, {len(port_types)} types."
        )
    for port_type, ref in zip(port_types, port_refs):
        markers.append({"type": "forgotten_tribe_port", "ref": ref, "portType": port_type})
    return markers


def build_cloth_sites(
    scenario: dict[str, Any],
    coord_by_index: dict[str, str],
) -> list[dict[str, Any]]:
    sites: list[dict[str, Any]] = []
    fixed_tokens = ((scenario.get("fixed") or {}).get("tokens") or {})
    catan_chit_tokens = scenario.get("catanChitTokens") or {}
    for tile_index, placements in sorted(catan_chit_tokens.items(), key=lambda entry: int(entry[0])):
        coord = coord_by_index[str(tile_index)]
        token_values = fixed_tokens.get(str(tile_index))
        if not isinstance(token_values, list) or len(token_values) != len(placements):
            raise ValueError(
                f"Cloth village token count mismatch for {scenario['name']} tile {tile_index}: "
                f"{len(placements)} placements, {0 if not isinstance(token_values, list) else len(token_values)} tokens."
            )
        numeric_tokens: list[int] = []
        for raw_token in token_values:
            token = normalize_token_value(raw_token)
            if token is None:
                raise ValueError(f"Invalid cloth village token {raw_token!r} for {scenario['name']} tile {tile_index}.")
            numeric_tokens.append(token)
        for placement, number_token in zip(placements, numeric_tokens):
            sites.append(
                {
                    "type": "village",
                    "edgeRef": {
                        "tileCoord": coord,
                        "side": int(placement["side"]),
                    },
                    "numberToken": number_token,
                }
            )
    return sites


def build_shortest_path(
    start_coord: str,
    target_coords: set[str],
    allowed_coords: set[str],
) -> list[str]:
    if start_coord not in allowed_coords:
        raise ValueError(f"Path start {start_coord} is not in the allowed coord set.")

    queue = deque([start_coord])
    previous: dict[str, str | None] = {start_coord: None}
    found_target: str | None = None

    while queue and found_target is None:
        current = queue.popleft()
        if current in target_coords:
            found_target = current
            break
        for neighbor in sorted(iter_neighbor_coords(current), key=coord_sort_key):
            if neighbor not in allowed_coords or neighbor in previous:
                continue
            previous[neighbor] = current
            queue.append(neighbor)

    if found_target is None:
        return [start_coord]

    path: list[str] = []
    current: str | None = found_target
    while current is not None:
        path.append(current)
        current = previous[current]
    path.reverse()
    return path


def sample_path_waypoints(path: list[str], desired_count: int) -> list[str]:
    if desired_count <= 0 or len(path) <= desired_count:
        return path

    last_index = len(path) - 1
    sampled: list[str] = []
    for index in range(desired_count):
        waypoint = path[round(index * last_index / (desired_count - 1))]
        if not sampled or sampled[-1] != waypoint:
            sampled.append(waypoint)
    if sampled[-1] != path[-1]:
        sampled.append(path[-1])
    return sampled


def build_pirate_home_group(
    scenario: dict[str, Any],
    coord_by_index: dict[str, str],
    layout_coords: list[str],
    tiles: dict[str, dict[str, Any]],
) -> set[str]:
    settlement_refs = build_colored_point_refs(scenario.get("settlementShapeTokens"), coord_by_index)
    ordered_refs = sorted(
        settlement_refs,
        key=lambda entry: (
            coord_sort_key(entry["ref"]["tileCoord"]),
            player_color_sort_key(entry["color"]),
        ),
    )
    home_seed_refs = ordered_refs[: len(ordered_refs) // 2]
    home_seed_tiles = {entry["ref"]["tileCoord"] for entry in home_seed_refs}
    return flood_fill_coords(home_seed_tiles, collect_land_coords(layout_coords, tiles))


def build_pirate_sites(
    scenario: dict[str, Any],
    coord_by_index: dict[str, str],
    layout_coords: list[str],
    tiles: dict[str, dict[str, Any]],
    board_size: str,
    player_count: int,
) -> tuple[list[dict[str, Any]], list[list[str]], list[str]]:
    home_group = build_pirate_home_group(scenario, coord_by_index, layout_coords, tiles)
    land_coords = collect_land_coords(layout_coords, tiles)
    allowed_colors = set(PLAYER_COLORS_BY_COUNT[player_count])

    landing_refs = [
        entry
        for entry in build_colored_point_refs(scenario.get("settlementShapeTokens"), coord_by_index)
        if entry["ref"]["tileCoord"] not in home_group and entry["color"] in allowed_colors
    ]
    fortress_refs = [
        entry
        for entry in build_colored_point_refs(scenario.get("circleTokens"), coord_by_index)
        if entry["color"] in allowed_colors
    ]
    landing_refs.sort(key=lambda entry: player_color_sort_key(entry["color"]))
    fortress_refs.sort(key=lambda entry: player_color_sort_key(entry["color"]))

    if len(landing_refs) != player_count:
        raise ValueError(
            f"Landing site count mismatch for {scenario['name']} ({player_count} players): {len(landing_refs)}."
        )
    if len(fortress_refs) != player_count:
        raise ValueError(
            f"Fortress site count mismatch for {scenario['name']} ({player_count} players): {len(fortress_refs)}."
        )

    sites: list[dict[str, Any]] = []
    for entry in landing_refs:
        sites.append({"type": "landing", "ref": entry["ref"]})
    for entry in fortress_refs:
        sites.append({"type": "fortress", "ref": entry["ref"], "pirateLairCount": 3})

    logical_island_groups = [sorted(home_group, key=coord_sort_key)]
    for coord in sorted(land_coords - home_group, key=coord_sort_key):
        logical_island_groups.append([coord])

    pirate_index = resolve_explicit_pirate_index(scenario)
    if pirate_index is None:
        raise ValueError(f"Missing pirate start tile for {scenario['name']}.")
    pirate_coord = coord_by_index[pirate_index]

    def is_pathable(coord: str) -> bool:
        terrain = terrain_at_coord(layout_coords, tiles, coord)
        if terrain not in {"sea", "desert"}:
            return False
        if coord == pirate_coord:
            return True
        return any(neighbor in land_coords for neighbor in iter_neighbor_coords(coord))

    pathable_coords = {coord for coord in layout_coords if is_pathable(coord)}
    target_coords = {
        coord
        for coord in pathable_coords
        if any(neighbor in home_group for neighbor in iter_neighbor_coords(coord))
    }
    full_path = build_shortest_path(pirate_coord, target_coords - {pirate_coord}, pathable_coords)
    pirate_fleet_path = sample_path_waypoints(full_path, PIRATE_FLEET_WAYPOINT_COUNT[board_size])

    return sites, logical_island_groups, pirate_fleet_path


def build_variant_spec(
    official_key: str,
    scenario: dict[str, Any],
    map_info: dict[str, Any],
    board_size: str,
    player_count: int,
) -> dict[str, Any]:
    layout_coords = build_layout_coords(map_info, scenario["mapClass"])
    coord_by_index = build_coord_by_index(layout_coords)
    tiles = build_tile_specs(scenario, layout_coords, coord_by_index)
    spec: dict[str, Any] = {
        "layoutCoords": layout_coords,
        "logicalIslandGroups": [],
        "tiles": tiles,
        "ports": build_ports(scenario, coord_by_index),
        "portDistribution": build_port_distribution(scenario),
    }

    if official_key.startswith("the-forgotten-tribe"):
        spec["ports"] = []
        spec["portDistribution"] = []
        spec["markers"] = build_forgotten_tribe_markers(scenario, coord_by_index)

    if official_key.startswith("cloth-for-catan"):
        spec["sites"] = build_cloth_sites(scenario, coord_by_index)

    if official_key.startswith("the-pirate-islands"):
        sites, logical_island_groups, pirate_fleet_path = build_pirate_sites(
            scenario,
            coord_by_index,
            layout_coords,
            tiles,
            board_size,
            player_count,
        )
        spec["sites"] = sites
        spec["logicalIslandGroups"] = logical_island_groups
        spec["pirateFleetPath"] = pirate_fleet_path

    return spec


def generate_specs() -> dict[str, Any]:
    source = GENERATOR_PATH.read_text(encoding="utf-8")
    environment = build_environment(source)
    map_info = environment["mapInfo"]
    scenarios = extract_scenario_info_entries(source, environment, PROJECT_SCENARIO_VARIANTS.keys())

    generated: dict[str, Any] = {}
    for official_key, variants in PROJECT_SCENARIO_VARIANTS.items():
        scenario = scenarios[official_key]
        for scenario_id, board_size, player_counts in variants:
            for player_count in player_counts:
                generated[f"{scenario_id}:{board_size}:{player_count}"] = build_variant_spec(
                    official_key,
                    scenario,
                    map_info,
                    board_size,
                    player_count,
                )
    return generated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main() -> None:
    arguments = parse_args()
    generated = generate_specs()
    rendered = json.dumps(generated, indent=2, ensure_ascii=False)
    if arguments.output:
        arguments.output.write_text(rendered + "\n", encoding="utf-8")
        return
    print(rendered)


if __name__ == "__main__":
    main()
