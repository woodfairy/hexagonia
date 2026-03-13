import type {
  DevelopmentCardView,
  MatchEventOf,
  MatchSnapshot,
  PlayerColor,
  Resource
} from "@hexagonia/shared";
import { BUILD_COSTS, PIRATE_FRAME_TILE_ID, RESOURCES } from "@hexagonia/shared";
import type { BoardFocusCue, InteractionMode } from "../../BoardScene";
import { getDocumentLocale, translate } from "../../i18n";
import { renderResourceLabel } from "../../ui";

export type BuildActionId = "road" | "ship" | "settlement" | "city" | "development";

export interface TurnStatus {
  title: string;
  detail: string;
  playerId?: string;
  callout?: string;
}

function t(key: string, params?: Record<string, string | number>): string {
  return translate(getDocumentLocale(), key, undefined, undefined, params);
}

function hasPirateFrameMoveOption(match: MatchSnapshot): boolean {
  return match.allowedMoves.pirateMoveOptions.some((option) => option.tileId === PIRATE_FRAME_TILE_ID);
}

export function getRobberDiscardGroups(match: MatchSnapshot) {
  const entries = match.robberDiscardStatus
    .map((entry) => {
      const player = getPlayerById(match, entry.playerId);
      if (!player) {
        return null;
      }

      return {
        ...entry,
        player
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry);

  return {
    pending: entries.filter((entry) => !entry.done),
    done: entries.filter((entry) => entry.done)
  };
}

export function renderDevelopmentLabel(type: DevelopmentCardView["type"]): string {
  const labels: Record<DevelopmentCardView["type"], string> = {
    knight: t("match.development.knight"),
    victory_point: t("match.development.victoryPoint"),
    road_building: t("match.development.roadBuilding"),
    year_of_plenty: t("match.development.yearOfPlenty"),
    monopoly: t("match.development.monopoly")
  };

  return labels[type] ?? type;
}

export function describeDevelopmentCardStatus(
  card: DevelopmentCardView,
  match: MatchSnapshot
): { label: string; detail: string; toneClass: string } {
  const isOwnActionWindow =
    match.currentPlayerId === match.you &&
    (match.phase === "turn_roll" ||
      match.phase === "turn_action" ||
      match.phase === "paired_player_action") &&
    !match.pendingDevelopmentEffect;

  if (card.type === "victory_point") {
    return {
      label: t("match.development.status.passive"),
      detail: t("match.development.status.passive.detail"),
      toneClass: "muted"
    };
  }

  if (card.boughtOnTurn >= match.turn) {
    return {
      label: t("match.development.status.nextTurn"),
      detail: t("match.development.status.nextTurn.detail"),
      toneClass: "is-warning"
    };
  }

  if (!isOwnActionWindow) {
    return {
      label: t("match.development.status.ready"),
      detail: t("match.development.status.ready.detail"),
      toneClass: "muted"
    };
  }

  if (!card.playable) {
    if (card.blockedReason === "no_road_target") {
      return {
        label: t("match.development.status.noTarget"),
        detail: t("match.development.status.noTarget.detail"),
        toneClass: "is-warning"
      };
    }

    return {
      label: t("match.development.status.turnLimit"),
      detail: t("match.development.status.turnLimit.detail"),
      toneClass: "is-warning"
    };
  }

  switch (card.type) {
    case "knight":
      return {
        label: t("match.development.status.playable"),
        detail: t("match.development.status.playable.knight"),
        toneClass: ""
      };
    case "road_building":
      return {
        label: t("match.development.status.playable"),
        detail: t("match.development.status.playable.roadBuilding"),
        toneClass: ""
      };
    case "year_of_plenty":
      return {
        label: t("match.development.status.playable"),
        detail: t("match.development.status.playable.yearOfPlenty"),
        toneClass: ""
      };
    case "monopoly":
      return {
        label: t("match.development.status.playable"),
        detail: t("match.development.status.playable.monopoly"),
        toneClass: ""
      };
    default:
      return {
        label: t("match.development.status.playable"),
        detail: t("match.development.status.playable.default"),
        toneClass: ""
      };
  }
}

export function createBuildActionState(
  id: BuildActionId,
  label: string,
  props: {
    cost: Partial<Record<Resource, number>>;
    enabled: boolean;
    phase: MatchSnapshot["phase"];
    isCurrentPlayer: boolean;
    resources: Partial<Record<Resource, number>> | undefined;
    legalTargetCount?: number;
    interactionMode?: InteractionMode;
    activeMode?: InteractionMode;
    onClick: () => void;
  }
) {
  const resources = props.resources;
  const missing = getMissingCost(resources, props.cost);
  const enoughResources = missing.length === 0;
  const isBuildPhase =
    props.phase === "turn_action" ||
    props.phase === "special_build" ||
    props.phase === "paired_player_action";
  const hasLegalTarget = props.legalTargetCount === undefined ? true : props.legalTargetCount > 0;
  const active = props.activeMode ? props.interactionMode === props.activeMode : false;
  const actionable = props.enabled && props.isCurrentPlayer && isBuildPhase && enoughResources && hasLegalTarget;

  let note = t("match.build.note.cost", { cost: renderCostText(props.cost) });
  if (!props.isCurrentPlayer) {
    note = t("match.build.note.notYourTurn");
  } else if (!isBuildPhase) {
    note = props.phase === "turn_roll" ? t("match.build.note.rollFirst") : t("match.build.note.unavailable");
  } else if (!enoughResources) {
    note = t("match.build.note.missing", { resources: renderMissingCost(missing) });
  } else if (!hasLegalTarget) {
    note = id === "development" ? t("match.build.note.currentlyUnavailable") : t("match.build.note.noLegalTarget");
  } else if (active) {
    note = t("match.build.note.selectOnBoard");
  }

  return {
    id,
    label,
    costLabel: renderCostText(props.cost),
    note,
    tooltip: describeBuildActionTooltip(id, {
      phase: props.phase,
      isCurrentPlayer: props.isCurrentPlayer,
      missing,
      hasLegalTarget,
      active
    }),
    active,
    disabled: !actionable,
    onClick: props.onClick
  };
}

export function createOwnActionCue(
  match: MatchSnapshot,
  _activePlayer: MatchSnapshot["players"][number] | null,
  interactionMode: InteractionMode,
  _selectedRoadEdges: string[]
): BoardFocusCue | null {
  if (match.phase === "scenario_setup" && match.scenarioSetup) {
    if (interactionMode === "scenario_setup_tile") {
      const tileIds =
        match.scenarioSetup.stage === "tiles"
          ? match.scenarioSetup.placeableTileIds
          : match.scenarioSetup.stage === "tokens"
            ? match.scenarioSetup.tokenTileIds
            : [];
      if (!tileIds.length) {
        return null;
      }
      return {
        key: `scenario-setup-tiles-${match.version}-${match.scenarioSetup.stage}-${tileIds.join(",")}`,
        mode: "action",
        title:
          match.scenarioSetup.stage === "tiles"
            ? t("match.scenarioSetup.cue.tiles.title")
            : t("match.scenarioSetup.cue.tokens.title"),
        detail:
          match.scenarioSetup.stage === "tiles"
            ? t("match.scenarioSetup.cue.tiles.detail")
            : t("match.scenarioSetup.cue.tokens.detail"),
        vertexIds: [],
        edgeIds: [],
        tileIds,
        scale: "medium"
      };
    }

    if (interactionMode === "scenario_setup_port") {
      if (!match.scenarioSetup.portEdgeIds.length) {
        return null;
      }
      return {
        key: `scenario-setup-ports-${match.version}-${match.scenarioSetup.portEdgeIds.join(",")}`,
        mode: "action",
        title: t("match.scenarioSetup.cue.ports.title"),
        detail: t("match.scenarioSetup.cue.ports.detail"),
        vertexIds: [],
        edgeIds: match.scenarioSetup.portEdgeIds,
        tileIds: [],
        scale: "wide"
      };
    }
  }

  if (match.currentPlayerId !== match.you) {
    return null;
  }

  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    return null;
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    return {
      key: `action-initial-road-${match.version}-${match.allowedMoves.initialRoadEdgeIds.join(",")}`,
      mode: "action",
      title: t("match.cue.initialRoad.title"),
      detail: t("match.cue.initialRoad.detail"),
      vertexIds: [],
      edgeIds: match.allowedMoves.initialRoadEdgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "road_building") {
    const focusEdgeIds = match.allowedMoves.freeRoadEdgeIds;
    const remainingRoads =
      match.pendingDevelopmentEffect?.type === "road_building"
        ? match.pendingDevelopmentEffect.remainingRoads
        : 2;
    if (!focusEdgeIds.length) {
      return null;
    }

    return {
      key: `action-road-building-${match.version}-${focusEdgeIds.join(",")}`,
      mode: "action",
      title:
        remainingRoads === 2
          ? t("match.cue.roadBuilding.first.title")
          : t("match.cue.roadBuilding.second.title"),
      detail:
        remainingRoads === 2
          ? t("match.cue.roadBuilding.first.detail")
          : t("match.cue.roadBuilding.second.detail"),
      vertexIds: [],
      edgeIds: focusEdgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "road") {
    if (!match.allowedMoves.roadEdgeIds.length) {
      return null;
    }

    return {
      key: `action-road-${match.version}-${match.allowedMoves.roadEdgeIds.join(",")}`,
      mode: "action",
      title: t("match.cue.road.title"),
      detail: t("match.cue.road.detail"),
      vertexIds: [],
      edgeIds: match.allowedMoves.roadEdgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "ship") {
    if (!match.allowedMoves.shipEdgeIds.length) {
      return null;
    }

    return {
      key: `action-ship-${match.version}-${match.allowedMoves.shipEdgeIds.join(",")}`,
      mode: "action",
      title: t("match.cue.ship.title"),
      detail: t("match.cue.ship.detail"),
      vertexIds: [],
      edgeIds: match.allowedMoves.shipEdgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "move_ship") {
    const edgeIds =
      _selectedRoadEdges.length > 0
        ? match.allowedMoves.shipEdgeIds
        : match.allowedMoves.movableShipEdgeIds;
    if (!edgeIds.length) {
      return null;
    }

    return {
      key: `action-move-ship-${match.version}-${edgeIds.join(",")}`,
      mode: "action",
      title:
        _selectedRoadEdges.length > 0
          ? t("match.cue.moveShip.targetTitle")
          : t("match.cue.moveShip.sourceTitle"),
      detail:
        _selectedRoadEdges.length > 0
          ? t("match.cue.moveShip.targetDetail")
          : t("match.cue.moveShip.sourceDetail"),
      vertexIds: [],
      edgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "settlement") {
    if (!match.allowedMoves.settlementVertexIds.length) {
      return null;
    }

    return {
      key: `action-settlement-${match.version}-${match.allowedMoves.settlementVertexIds.join(",")}`,
      mode: "action",
      title: t("match.cue.settlement.title"),
      detail: t("match.cue.settlement.detail"),
      vertexIds: match.allowedMoves.settlementVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "city") {
    if (!match.allowedMoves.cityVertexIds.length) {
      return null;
    }

    return {
      key: `action-city-${match.version}-${match.allowedMoves.cityVertexIds.join(",")}`,
      mode: "action",
      title: t("match.cue.city.title"),
      detail: t("match.cue.city.detail"),
      vertexIds: match.allowedMoves.cityVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "robber") {
    const tileIds = match.allowedMoves.robberMoveOptions.map((option) => option.tileId);
    if (!tileIds.length) {
      return null;
    }

    return {
      key: `action-robber-${match.version}-${tileIds.join(",")}`,
      mode: "action",
      title: t("match.cue.robber.title"),
      detail: t("match.cue.robber.detail"),
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: "wide"
    };
  }

  if (interactionMode === "pirate") {
    const tileIds = match.allowedMoves.pirateMoveOptions
      .map((option) => option.tileId)
      .filter((tileId) => tileId !== PIRATE_FRAME_TILE_ID);
    const detailKey = hasPirateFrameMoveOption(match)
      ? "match.cue.pirate.detailWithFrame"
      : "match.cue.pirate.detail";
    if (!tileIds.length) {
      return null;
    }

    return {
      key: `action-pirate-${match.version}-${tileIds.join(",")}`,
      mode: "action",
      title: t("match.cue.pirate.title"),
      detail: t(detailKey),
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: "wide"
    };
  }

  if (interactionMode === "place_port") {
    if (!match.allowedMoves.placeablePortVertexIds.length) {
      return null;
    }

    return {
      key: `action-place-port-${match.version}-${match.allowedMoves.placeablePortVertexIds.join(",")}`,
      mode: "action",
      title: t("match.cue.placePort.title"),
      detail: t("match.cue.placePort.detail"),
      vertexIds: match.allowedMoves.placeablePortVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "claim_wonder" || interactionMode === "build_wonder") {
    if (!match.allowedMoves.wonderVertexIds.length) {
      return null;
    }

    return {
      key: `action-wonder-${interactionMode}-${match.version}-${match.allowedMoves.wonderVertexIds.join(",")}`,
      mode: "action",
      title:
        interactionMode === "claim_wonder"
          ? t("match.cue.claimWonder.title")
          : t("match.cue.buildWonder.title"),
      detail:
        interactionMode === "claim_wonder"
          ? t("match.cue.claimWonder.detail")
          : t("match.cue.buildWonder.detail"),
      vertexIds: match.allowedMoves.wonderVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "attack_fortress") {
    if (!match.allowedMoves.fortressVertexIds.length) {
      return null;
    }

    return {
      key: `action-fortress-${match.version}-${match.allowedMoves.fortressVertexIds.join(",")}`,
      mode: "action",
      title: t("match.cue.attackFortress.title"),
      detail: t("match.cue.attackFortress.detail"),
      vertexIds: match.allowedMoves.fortressVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  return null;
}

export function createOwnActionCameraCue(
  match: MatchSnapshot,
  _activePlayer: MatchSnapshot["players"][number] | null,
  interactionMode: InteractionMode,
  selectedRoadEdges: string[]
): BoardFocusCue | null {
  if (match.currentPlayerId !== match.you) {
    return null;
  }

  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    return createInitialSettlementCameraCue(
      match.allowedMoves.initialSettlementVertexIds,
      `camera-initial-settlement-${match.version}-${match.allowedMoves.initialSettlementVertexIds.join(",")}`
    );
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    const [edgeId] = match.allowedMoves.initialRoadEdgeIds;
    if (!edgeId) {
      return null;
    }

    return {
      key: `camera-initial-road-${match.version}-${edgeId}`,
      mode: "action",
      title: t("match.camera.initialRoad.title"),
      detail: t("match.camera.initialRoad.detail"),
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "road_building") {
    const seedEdgeId =
      selectedRoadEdges.length > 0
        ? selectedRoadEdges[selectedRoadEdges.length - 1]
        : null;
    const edgeIds = seedEdgeId
      ? [seedEdgeId, ...match.allowedMoves.freeRoadEdgeIds.filter((edgeId) => edgeId !== seedEdgeId)]
      : match.allowedMoves.freeRoadEdgeIds;
    const remainingRoads =
      match.pendingDevelopmentEffect?.type === "road_building"
        ? match.pendingDevelopmentEffect.remainingRoads
        : 2;
    if (!edgeIds.length) {
      return null;
    }

    return {
      key: `camera-road-building-${match.version}-${edgeIds.join(",")}`,
      mode: "action",
      title:
        remainingRoads === 2
          ? t("match.camera.roadBuilding.first.title")
          : t("match.camera.roadBuilding.second.title"),
      detail:
        remainingRoads === 2
          ? t("match.camera.roadBuilding.first.detail")
          : t("match.camera.roadBuilding.second.detail"),
      vertexIds: [],
      edgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "road") {
    if (!match.allowedMoves.roadEdgeIds.length) {
      return null;
    }

    return {
      key: `camera-road-${match.version}-${match.allowedMoves.roadEdgeIds.join(",")}`,
      mode: "action",
      title: t("match.camera.road.title"),
      detail: t("match.camera.road.detail"),
      vertexIds: [],
      edgeIds: match.allowedMoves.roadEdgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "ship") {
    if (!match.allowedMoves.shipEdgeIds.length) {
      return null;
    }

    return {
      key: `camera-ship-${match.version}-${match.allowedMoves.shipEdgeIds.join(",")}`,
      mode: "action",
      title: t("match.camera.ship.title"),
      detail: t("match.camera.ship.detail"),
      vertexIds: [],
      edgeIds: match.allowedMoves.shipEdgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "move_ship") {
    const edgeIds =
      selectedRoadEdges.length > 0
        ? match.allowedMoves.shipEdgeIds
        : match.allowedMoves.movableShipEdgeIds;
    if (!edgeIds.length) {
      return null;
    }

    return {
      key: `camera-move-ship-${match.version}-${edgeIds.join(",")}`,
      mode: "action",
      title:
        selectedRoadEdges.length > 0
          ? t("match.camera.moveShip.target.title")
          : t("match.camera.moveShip.source.title"),
      detail:
        selectedRoadEdges.length > 0
          ? t("match.camera.moveShip.target.detail")
          : t("match.camera.moveShip.source.detail"),
      vertexIds: [],
      edgeIds,
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "settlement") {
    if (!match.allowedMoves.settlementVertexIds.length) {
      return null;
    }

    return {
      key: `camera-settlement-${match.version}-${match.allowedMoves.settlementVertexIds.join(",")}`,
      mode: "action",
      title: t("match.camera.settlement.title"),
      detail: t("match.camera.settlement.detail"),
      vertexIds: match.allowedMoves.settlementVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "city") {
    if (!match.allowedMoves.cityVertexIds.length) {
      return null;
    }

    return {
      key: `camera-city-${match.version}-${match.allowedMoves.cityVertexIds.join(",")}`,
      mode: "action",
      title: t("match.camera.city.title"),
      detail: t("match.camera.city.detail"),
      vertexIds: match.allowedMoves.cityVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "robber") {
    const tileIds = match.allowedMoves.robberMoveOptions.map((option) => option.tileId);
    if (!tileIds.length) {
      return null;
    }

    return {
      key: `camera-robber-${match.version}-${tileIds.join(",")}`,
      mode: "action",
      title: t("match.camera.robber.title"),
      detail: t("match.camera.robber.detail"),
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: "wide",
      cameraFit: "board"
    };
  }

  if (interactionMode === "pirate") {
    const tileIds = match.allowedMoves.pirateMoveOptions
      .map((option) => option.tileId)
      .filter((tileId) => tileId !== PIRATE_FRAME_TILE_ID);
    const detailKey = hasPirateFrameMoveOption(match)
      ? "match.camera.pirate.detailWithFrame"
      : "match.camera.pirate.detail";
    if (!tileIds.length) {
      return null;
    }

    return {
      key: `camera-pirate-${match.version}-${tileIds.join(",")}`,
      mode: "action",
      title: t("match.camera.pirate.title"),
      detail: t(detailKey),
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: "wide",
      cameraFit: "board"
    };
  }

  if (interactionMode === "place_port") {
    if (!match.allowedMoves.placeablePortVertexIds.length) {
      return null;
    }

    return {
      key: `camera-place-port-${match.version}-${match.allowedMoves.placeablePortVertexIds.join(",")}`,
      mode: "action",
      title: t("match.camera.placePort.title"),
      detail: t("match.camera.placePort.detail"),
      vertexIds: match.allowedMoves.placeablePortVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "claim_wonder" || interactionMode === "build_wonder") {
    if (!match.allowedMoves.wonderVertexIds.length) {
      return null;
    }

    return {
      key: `camera-wonder-${interactionMode}-${match.version}-${match.allowedMoves.wonderVertexIds.join(",")}`,
      mode: "action",
      title:
        interactionMode === "claim_wonder"
          ? t("match.camera.claimWonder.title")
          : t("match.camera.buildWonder.title"),
      detail:
        interactionMode === "claim_wonder"
          ? t("match.camera.claimWonder.detail")
          : t("match.camera.buildWonder.detail"),
      vertexIds: match.allowedMoves.wonderVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "attack_fortress") {
    if (!match.allowedMoves.fortressVertexIds.length) {
      return null;
    }

    return {
      key: `camera-fortress-${match.version}-${match.allowedMoves.fortressVertexIds.join(",")}`,
      mode: "action",
      title: t("match.camera.attackFortress.title"),
      detail: t("match.camera.attackFortress.detail"),
      vertexIds: match.allowedMoves.fortressVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  return null;
}

export function createOpeningMatchCameraCue(match: MatchSnapshot): BoardFocusCue | null {
  if (match.version !== 1 || !match.publicInitialSettlementVertexIds.length) {
    return null;
  }

  return createInitialSettlementCameraCue(
    match.publicInitialSettlementVertexIds,
    `camera-opening-initial-settlement-${match.version}-${match.publicInitialSettlementVertexIds.join(",")}`
  );
}

function createInitialSettlementCameraCue(vertexIds: string[], key: string): BoardFocusCue | null {
  if (!vertexIds.length) {
    return null;
  }

  return {
    key,
    mode: "action",
    title: t("match.camera.initialSettlement.title"),
    detail: t("match.camera.initialSettlement.detail"),
    vertexIds,
    edgeIds: [],
    tileIds: [],
    scale: "wide",
    cameraFit: "board",
    zoomPreset: "distribution"
  };
}

export function getLatestDiceRollEvent(
  match: MatchSnapshot
): MatchEventOf<"dice_rolled"> | null {
  for (let index = match.eventLog.length - 1; index >= 0; index -= 1) {
    const event = match.eventLog[index];
    if (event?.type === "dice_rolled") {
      return event;
    }
  }

  return null;
}

export function getPlayerName(match: MatchSnapshot, playerId?: string): string {
  if (!playerId) {
    return t("shared.playerFallback");
  }

  return getPlayerById(match, playerId)?.username ?? t("shared.playerFallback");
}

export function getPlayerById(match: MatchSnapshot, playerId?: string) {
  if (!playerId) {
    return null;
  }

  return match.players.find((player) => player.id === playerId) ?? null;
}

export function getPlayerColor(
  match: MatchSnapshot,
  playerId?: string
): PlayerColor | null {
  return getPlayerById(match, playerId)?.color ?? null;
}

export function getPlayerPresenceState(
  player: MatchSnapshot["players"][number],
  now: number
) {
  if (player.connected) {
    return {
      label: t("match.presence.online"),
      detail: t("match.presence.online.detail"),
      toneClass: "is-online",
      indicatorClass: "is-online"
    };
  }

  if (
    typeof player.disconnectDeadlineAt === "number" &&
    player.disconnectDeadlineAt > now
  ) {
    return {
      label: t("match.presence.disconnected"),
      detail: t("match.presence.disconnected.removal", {
        countdown: formatCountdown(player.disconnectDeadlineAt - now)
      }),
      toneClass: "is-offline",
      indicatorClass: "is-offline"
    };
  }

  return {
    label: t("match.presence.disconnected"),
    detail: t("match.presence.disconnected.waitingRemoval"),
    toneClass: "is-offline",
    indicatorClass: "is-offline"
  };
}

export function getTurnStatus(
  match: MatchSnapshot,
  activePlayer: MatchSnapshot["players"][number] | null,
  selfPlayer: MatchSnapshot["players"][number] | null,
  interactionMode: InteractionMode
): TurnStatus {
  const activePlayerName = activePlayer?.username ?? t("shared.unknown");
  const isCurrentPlayer = match.currentPlayerId === match.you;
  const ownTrade =
    match.tradeOffers.find((offer) =>
      match.allowedMoves.withdrawableTradeOfferIds.includes(offer.id)
    ) ??
    match.tradeOffers.find((offer) => offer.fromPlayerId === match.you) ??
    null;
  const actionableTrade =
    match.tradeOffers.find(
      (offer) =>
        match.allowedMoves.acceptableTradeOfferIds.includes(offer.id) ||
        match.allowedMoves.declineableTradeOfferIds.includes(offer.id)
    ) ?? null;
  const trade = ownTrade ?? actionableTrade ?? match.tradeOffers[0] ?? null;
  const selfId = selfPlayer?.id ?? match.you;
  const withPlayer = (
    title: string,
    detail: string,
    playerId?: string,
    callout?: string
  ): TurnStatus => ({
    title,
    detail,
    ...(playerId ? { playerId } : {}),
    ...(callout ? { callout } : {})
  });

  if (match.winnerId) {
    const winner =
      match.players.find((player) => player.id === match.winnerId)?.username ??
      t("shared.unknown");
    return withPlayer(
      t("match.turnStatus.gameOver.title"),
      t("match.turnStatus.gameOver.detail", { player: winner }),
      match.winnerId
    );
  }

  if (match.phase === "scenario_setup" && match.scenarioSetup) {
    const playerCount = match.scenarioSetup.players.filter((player) => player.ready).length;
    const detailKey =
      match.scenarioSetup.stage === "tiles"
        ? "match.turnStatus.scenarioSetup.tiles"
        : match.scenarioSetup.stage === "tokens"
          ? "match.turnStatus.scenarioSetup.tokens"
          : match.scenarioSetup.stage === "ports"
            ? "match.turnStatus.scenarioSetup.ports"
            : match.scenarioSetup.canEdit
              ? "match.turnStatus.scenarioSetup.ready"
              : "match.turnStatus.scenarioSetup.readyLocked";

    return withPlayer(
      t("match.turnStatus.scenarioSetup.title"),
      t(detailKey, {
        count: playerCount,
        total: match.scenarioSetup.players.length
      }),
      selfId,
      match.scenarioSetup.validationErrorCode
        ? t("match.turnStatus.scenarioSetup.validation")
        : undefined
    );
  }

  if (trade) {
    const proposer =
      match.players.find((player) => player.id === trade.fromPlayerId)?.username ??
      t("shared.unknown");
    if (trade.fromPlayerId === match.you) {
      const target = trade.toPlayerId
        ? match.players.find((player) => player.id === trade.toPlayerId)?.username ??
          t("match.turnStatus.trade.targetPlayer")
        : t("match.turnStatus.trade.otherPlayer");
      return withPlayer(
        t("match.turnStatus.trade.waitingReply.title"),
        trade.targetPlayerId
          ? t("match.turnStatus.trade.waitingReply.targeted", { player: target })
          : t("match.turnStatus.trade.waitingReply.open"),
        trade.toPlayerId ?? undefined
      );
    }
    if (!trade.toPlayerId || trade.toPlayerId === match.you) {
      return withPlayer(
        t("match.turnStatus.trade.answerFromYou.title"),
        t("match.turnStatus.trade.answerFromYou.detail", { player: proposer }),
        selfId
      );
    }
    const target =
      match.players.find((player) => player.id === trade.toPlayerId)?.username ??
      activePlayerName;
    return withPlayer(
      t("match.turnStatus.waitForPlayer.title", { player: target }),
      t("match.turnStatus.trade.openOffer.detail", { player: proposer }),
      trade.toPlayerId
    );
  }

  if (match.allowedMoves.pendingDiscardCount > 0 && match.phase !== "robber_interrupt") {
    return withPlayer(
      t("match.turnStatus.yourAction.title"),
      t("match.turnStatus.pendingDiscard.detail", {
        count: match.allowedMoves.pendingDiscardCount,
        player: activePlayerName
      }),
      selfId
    );
  }

  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    return isCurrentPlayer
      ? withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.initialSettlement.self"), selfId)
      : withPlayer(
          t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
          t("match.turnStatus.initialSettlement.other", { player: activePlayerName }),
          activePlayer?.id
        );
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    return isCurrentPlayer
      ? withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.initialRoad.self"), selfId)
      : withPlayer(
          t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
          t("match.turnStatus.initialRoad.other", { player: activePlayerName }),
          activePlayer?.id
        );
  }

  if (match.allowedMoves.goldResourceChoiceCount > 0) {
    if (match.allowedMoves.goldResourceChoiceSource === "pirate_fleet_reward") {
      return withPlayer(
        t("match.turnStatus.pirateReward.title"),
        t("match.turnStatus.pirateReward.detail"),
        selfId
      );
    }

    return withPlayer(
      t("match.turnStatus.goldChoice.title"),
      t("match.turnStatus.goldChoice.detail", { count: match.allowedMoves.goldResourceChoiceCount }),
      selfId
    );
  }

  if (match.allowedMoves.pirateStealTargetPlayerIds.length > 0) {
    return withPlayer(
      t("match.turnStatus.pirateSeven.title"),
      t("match.turnStatus.pirateSeven.detail"),
      selfId,
      t("match.turnStatus.pirateSeven.callout")
    );
  }

  if (match.phase === "robber_interrupt") {
    const { pending, done } = getRobberDiscardGroups(match);
    if (match.allowedMoves.pendingDiscardCount > 0) {
      const othersPending = pending.filter((entry) => entry.player.id !== selfId);
      const suffix =
        othersPending.length > 0
          ? t("match.turnStatus.robber.pendingOthersSuffix", {
              players: summarizeRobberPlayers(othersPending.map((entry) => entry.player.username))
            })
          : "";
      return withPlayer(
        t("match.turnStatus.yourAction.title"),
        t("match.turnStatus.robber.discardSelf", {
          count: match.allowedMoves.pendingDiscardCount,
          suffix
        }),
        selfId
      );
    }
    if (isCurrentPlayer && interactionMode === "robber") {
      return withPlayer(
        t("match.turnStatus.robber.moveTitle"),
        t("match.turnStatus.robber.moveDetail"),
        selfId,
        t("match.turnStatus.robber.moveCallout")
      );
    }
    if (pending.length > 0) {
      return withPlayer(
        t("match.turnStatus.robber.strikesTitle"),
        t("match.turnStatus.robber.pendingOthers", {
          players: summarizeRobberPlayers(pending.map((entry) => entry.player.username))
        }),
        pending[0]?.player.id
      );
    }
    if (done.length > 0) {
      return withPlayer(
        t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
        t("match.turnStatus.robber.allDiscarded"),
        activePlayer?.id
      );
    }
    return withPlayer(
      t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
      t("match.turnStatus.robber.finishing", { player: activePlayerName }),
      activePlayer?.id
    );
  }

  if (interactionMode === "road_building") {
    const remainingRoads =
      match.pendingDevelopmentEffect?.type === "road_building"
        ? match.pendingDevelopmentEffect.remainingRoads
        : 2;
    return withPlayer(
      t("match.turnStatus.yourAction.title"),
      remainingRoads === 2
        ? t("match.turnStatus.roadBuilding.first")
        : t("match.turnStatus.roadBuilding.second"),
      selfId
    );
  }

  if (interactionMode === "road") {
    return withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.road.select"), selfId);
  }

  if (interactionMode === "ship") {
    return withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.ship.select"), selfId);
  }

  if (interactionMode === "move_ship") {
    return withPlayer(
      t("match.turnStatus.yourAction.title"),
      t("match.turnStatus.ship.move"),
      selfId
    );
  }

  if (interactionMode === "settlement") {
    return withPlayer(
      t("match.turnStatus.yourAction.title"),
      t("match.turnStatus.settlement.select"),
      selfId
    );
  }

  if (interactionMode === "city") {
    return withPlayer(
      t("match.turnStatus.yourAction.title"),
      t("match.turnStatus.city.select"),
      selfId
    );
  }

  if (interactionMode === "pirate") {
    const detailKey = hasPirateFrameMoveOption(match)
      ? "match.turnStatus.pirate.moveDetailWithFrame"
      : "match.turnStatus.pirate.moveDetail";
    const calloutKey = hasPirateFrameMoveOption(match)
      ? "match.turnStatus.pirate.moveCalloutWithFrame"
      : "match.turnStatus.pirate.moveCallout";
    return withPlayer(
      t("match.turnStatus.pirate.moveTitle"),
      t(detailKey),
      selfId,
      t(calloutKey)
    );
  }

  if (interactionMode === "place_port") {
    return withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.placePort.select"), selfId);
  }

  if (interactionMode === "claim_wonder") {
    return withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.claimWonder.select"), selfId);
  }

  if (interactionMode === "build_wonder") {
    return withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.buildWonder.select"), selfId);
  }

  if (interactionMode === "attack_fortress") {
    return withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.attackFortress.select"), selfId);
  }

  if (isCurrentPlayer && match.allowedMoves.fortressVertexIds.length > 0) {
    return withPlayer(
      t("match.turnStatus.yourAction.title"),
      t("match.turnStatus.attackFortress.endTurn"),
      selfId,
      t("match.turnStatus.attackFortress.callout")
    );
  }

  if (match.allowedMoves.canRoll) {
    return isCurrentPlayer
      ? withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.roll.self"), selfId)
      : withPlayer(
          t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
          t("match.turnStatus.roll.other", { player: activePlayerName }),
          activePlayer?.id
        );
  }

  if (match.phase === "special_build") {
    const canBuildOrBuy =
      !!selfPlayer &&
      (match.allowedMoves.canBuyDevelopmentCard ||
        (match.allowedMoves.roadEdgeIds.length > 0 && canAffordCost(selfPlayer.resources, BUILD_COSTS.road)) ||
        (match.allowedMoves.shipEdgeIds.length > 0 && canAffordCost(selfPlayer.resources, BUILD_COSTS.ship)) ||
        (match.allowedMoves.settlementVertexIds.length > 0 && canAffordCost(selfPlayer.resources, BUILD_COSTS.settlement)) ||
        (match.allowedMoves.cityVertexIds.length > 0 && canAffordCost(selfPlayer.resources, BUILD_COSTS.city)));
    return isCurrentPlayer
      ? withPlayer(
          t("match.turnStatus.yourAction.title"),
          t("match.turnStatus.specialBuild.self"),
          selfId,
          canBuildOrBuy ? undefined : t("match.turnStatus.specialBuild.noMove")
        )
      : withPlayer(
          t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
          t("match.turnStatus.specialBuild.other", { player: activePlayerName }),
          activePlayer?.id
        );
  }

  if (match.phase === "paired_player_action") {
    return isCurrentPlayer
      ? withPlayer(
          t("match.turnStatus.yourAction.title"),
          t("match.turnStatus.pairedPlayers.self"),
          selfId
        )
      : withPlayer(
          t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
          t("match.turnStatus.pairedPlayers.other", { player: activePlayerName }),
          activePlayer?.id
        );
  }

  if (isCurrentPlayer && match.phase === "turn_action") {
    return withPlayer(t("match.turnStatus.yourAction.title"), t("match.turnStatus.turnAction.self"), selfId);
  }

  if (match.phase === "turn_action") {
    return withPlayer(
      t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
      t("match.turnStatus.turnAction.other", { player: activePlayerName }),
      activePlayer?.id
    );
  }

  if (match.phase === "setup_forward" || match.phase === "setup_reverse") {
    return withPlayer(
      t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
      t("match.turnStatus.setup.other", { player: activePlayerName }),
      activePlayer?.id
    );
  }

  if (selfPlayer && !isCurrentPlayer) {
    return withPlayer(
      t("match.turnStatus.waitForPlayer.title", { player: activePlayerName }),
      t("match.turnStatus.nextAction.other", { player: activePlayerName }),
      activePlayer?.id
    );
  }

  return {
    title: t("match.turnStatus.nextAction.title"),
    detail: t("match.turnStatus.nextAction.detail")
  };
}

export function canAffordCost(
  resources: Partial<Record<Resource, number>> | undefined,
  cost: Partial<Record<Resource, number>>
): boolean {
  return getMissingCost(resources, cost).length === 0;
}

export function canBankPayYearOfPlenty(
  bank: Partial<Record<Resource, number>>,
  resources: [Resource, Resource]
): boolean {
  const [first, second] = resources;
  if (first === second) {
    return (bank[first] ?? 0) >= 2;
  }

  return (bank[first] ?? 0) >= 1 && (bank[second] ?? 0) >= 1;
}

function describeBuildActionTooltip(
  id: BuildActionId,
  props: {
    phase: MatchSnapshot["phase"];
    isCurrentPlayer: boolean;
    missing: Array<{ resource: Resource; count: number }>;
    hasLegalTarget: boolean;
    active: boolean;
  }
): { title: string; lines: string[] } | null {
  if (!props.isCurrentPlayer) {
    return {
      title: t("match.tooltip.notYourTurn.title"),
      lines: [t("match.tooltip.notYourTurn.detail")]
    };
  }

  const isBuildPhase =
    props.phase === "turn_action" ||
    props.phase === "special_build" ||
    props.phase === "paired_player_action";

  if (!isBuildPhase) {
    return {
      title: props.phase === "turn_roll" ? t("match.tooltip.rollFirst.title") : t("match.tooltip.unavailable.title"),
      lines: [
        props.phase === "turn_roll"
          ? t("match.tooltip.rollFirst.detail")
          : t("match.tooltip.unavailable.detail")
        ]
    };
  }

  if (props.phase === "special_build") {
    return {
      title: t("match.tooltip.specialBuild.title"),
      lines: [
        t("match.tooltip.specialBuild.detail1"),
        t("match.tooltip.specialBuild.detail2")
      ]
    };
  }

  if (props.missing.length > 0) {
    return {
      title: t("match.tooltip.missingResources.title"),
      lines: props.missing.map(
        (entry) => t("match.tooltip.missingResources.entry", {
          count: entry.count,
          resource: renderResourceLabel(entry.resource)
        })
      )
    };
  }

  if (!props.hasLegalTarget) {
    return {
      title: id === "development" ? t("match.tooltip.currentlyUnavailable.title") : t("match.tooltip.noLegalTarget.title"),
      lines: [
        id === "development"
          ? t("match.tooltip.currentlyUnavailable.detail")
          : t("match.tooltip.noLegalTarget.detail")
      ]
    };
  }

  if (props.active) {
    return {
      title: t("match.tooltip.selectTarget.title"),
      lines: [t("match.tooltip.selectTarget.detail")]
    };
  }

  return null;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function summarizeRobberPlayers(names: string[]): string {
  if (names.length === 0) {
    return t("match.robberPlayers.none");
  }

  return new Intl.ListFormat(getDocumentLocale(), {
    style: "long",
    type: "conjunction"
  }).format(names);
}

function renderCostText(cost: Partial<Record<Resource, number>>): string {
  return RESOURCES.flatMap((resource) =>
    cost[resource] ? `${cost[resource]} ${renderResourceLabel(resource)}` : []
  ).join(" · ");
}

function getMissingCost(
  resources: Partial<Record<Resource, number>> | undefined,
  cost: Partial<Record<Resource, number>>
) {
  return RESOURCES.flatMap((resource) => {
    const required = cost[resource] ?? 0;
    const available = resources?.[resource] ?? 0;
    return required > available ? [{ resource, count: required - available }] : [];
  });
}

function renderMissingCost(
  missing: Array<{ resource: Resource; count: number }>
): string {
  return missing
    .map((entry) => `${entry.count} ${renderResourceLabel(entry.resource)}`)
    .join(" · ");
}
