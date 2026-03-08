import type {
  DevelopmentCardView,
  MatchEventOf,
  MatchSnapshot,
  PlayerColor,
  Resource
} from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import type { BoardFocusCue, InteractionMode } from "../../BoardScene";
import { renderResourceLabel } from "../../ui";

export type BuildActionId = "road" | "settlement" | "city" | "development";

export interface TurnStatus {
  title: string;
  detail: string;
  playerId?: string;
  callout?: string;
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
    knight: "Ritter",
    victory_point: "Siegpunkt",
    road_building: "Straßenbau",
    year_of_plenty: "Erfindung",
    monopoly: "Monopol"
  };

  return labels[type] ?? type;
}

export function describeDevelopmentCardStatus(
  card: DevelopmentCardView,
  match: MatchSnapshot
): { label: string; detail: string; toneClass: string } {
  const isOwnActionWindow =
    match.currentPlayerId === match.you &&
    (match.phase === "turn_roll" || match.phase === "turn_action") &&
    !match.pendingDevelopmentEffect;

  if (card.type === "victory_point") {
    return {
      label: "Passiv",
      detail: "Zählt automatisch als geheimer Siegpunkt und wird nicht manuell ausgespielt.",
      toneClass: "muted"
    };
  }

  if (card.boughtOnTurn >= match.turn) {
    return {
      label: "Ab nächstem Zug",
      detail: "Diese Karte darf erst ab deinem nächsten eigenen Zug ausgespielt werden.",
      toneClass: "is-warning"
    };
  }

  if (!isOwnActionWindow) {
    return {
      label: "Bereit",
      detail: "Die Karte ist vorbereitet und kann in deinem nächsten aktiven Zug gespielt werden.",
      toneClass: "muted"
    };
  }

  if (!card.playable) {
    if (card.blockedReason === "no_road_target") {
      return {
        label: "Kein Ziel",
        detail: "Aktuell gibt es keine legale kostenlose Straße für diese Karte.",
        toneClass: "is-warning"
      };
    }

    return {
      label: "Zuglimit erreicht",
      detail: "In diesem Zug wurde bereits eine Entwicklungskarte ausgespielt.",
      toneClass: "is-warning"
    };
  }

  switch (card.type) {
    case "knight":
      return {
        label: "Spielbar",
        detail: "Startet sofort die Räuberphase und zählt für die größte Rittermacht.",
        toneClass: ""
      };
    case "road_building":
      return {
        label: "Spielbar",
        detail: "Erlaubt dir bis zu zwei kostenlose Straßen, vor oder nach dem Würfeln.",
        toneClass: ""
      };
    case "year_of_plenty":
      return {
        label: "Spielbar",
        detail: "Nimmt zwei frei gewählte Rohstoffe aus der Bank.",
        toneClass: ""
      };
    case "monopoly":
      return {
        label: "Spielbar",
        detail: "Zieht eine gewählte Rohstoffart von allen Mitspielern ein.",
        toneClass: ""
      };
    default:
      return {
        label: "Spielbar",
        detail: "Diese Entwicklungskarte kann jetzt ausgespielt werden.",
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
  const isBuildPhase = props.phase === "turn_action";
  const hasLegalTarget = props.legalTargetCount === undefined ? true : props.legalTargetCount > 0;
  const active = props.activeMode ? props.interactionMode === props.activeMode : false;
  const actionable = props.enabled && props.isCurrentPlayer && isBuildPhase && enoughResources && hasLegalTarget;

  let note = `Kosten: ${renderCostText(props.cost)}`;
  if (!props.isCurrentPlayer) {
    note = "Nicht dein Zug";
  } else if (!isBuildPhase) {
    note = props.phase === "turn_roll" ? "Erst würfeln" : "Gerade nicht verfügbar";
  } else if (!enoughResources) {
    note = `Fehlt: ${renderMissingCost(missing)}`;
  } else if (!hasLegalTarget) {
    note = id === "development" ? "Zurzeit nicht verfügbar" : "Kein gültiger Bauplatz";
  } else if (active) {
    note = "Bauplatz auf dem Brett wählen";
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
      title: "Setze deine Start-Straße",
      detail: "Alle erlaubten Kanten an deiner Start-Siedlung sind hervorgehoben.",
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
      title: remainingRoads === 2 ? "Wähle die erste freie Straße" : "Wähle die zweite freie Straße",
      detail:
        remainingRoads === 2
          ? "Alle aktuell erlaubten kostenlosen Straßen für Straßenbau sind markiert."
          : "Alle legalen Folgeplätze für die zweite kostenlose Straße sind markiert.",
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
      title: "Baue eine Straße",
      detail: "Alle erlaubten Straßenkanten sind auf dem Brett markiert.",
      vertexIds: [],
      edgeIds: match.allowedMoves.roadEdgeIds,
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
      title: "Baue eine Siedlung",
      detail: "Alle gültigen Siedlungsplätze sind markiert.",
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
      title: "Werte eine Siedlung zur Stadt auf",
      detail: "Alle ausbaufähigen Siedlungen sind markiert.",
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
      title: "Bewege den Räuber",
      detail: "Alle legalen Räuber-Ziele sind markiert.",
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: "wide"
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
    return {
      key: `camera-initial-settlement-${match.version}-${match.allowedMoves.initialSettlementVertexIds.join(",")}`,
      mode: "action",
      title: "Setze deine Start-Siedlung",
      detail: "Die Kamera startet auf einem gültigen Startplatz.",
      vertexIds: match.allowedMoves.initialSettlementVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "wide",
      zoomPreset: "distribution"
    };
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    const [edgeId] = match.allowedMoves.initialRoadEdgeIds;
    if (!edgeId) {
      return null;
    }

    return {
      key: `camera-initial-road-${match.version}-${edgeId}`,
      mode: "action",
      title: "Setze deine Start-Straße",
      detail: "Die Kamera startet auf einer gültigen Startkante.",
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
      title: remainingRoads === 2 ? "Wähle die erste freie Straße" : "Wähle die zweite freie Straße",
      detail:
        remainingRoads === 2
          ? "Die Kamera hält den relevanten Straßenbau-Bereich im Blick."
          : "Die Kamera bleibt bei der ausgewählten Straßenbau-Kette.",
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
      title: "Baue eine Straße",
      detail: "Die Kamera fokussiert den lokalen Straßenbereich.",
      vertexIds: [],
      edgeIds: match.allowedMoves.roadEdgeIds,
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
      title: "Baue eine Siedlung",
      detail: "Die Kamera fokussiert den lokalen Siedlungsbereich.",
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
      title: "Werte eine Siedlung zur Stadt auf",
      detail: "Die Kamera fokussiert den lokalen Ausbau-Bereich.",
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
      title: "Bewege den Räuber",
      detail: "Die Kamera fokussiert den lokalen Räuber-Bereich.",
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: "wide"
    };
  }

  return null;
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
    return "Ein Spieler";
  }

  return getPlayerById(match, playerId)?.username ?? "Ein Spieler";
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
      label: "Online",
      detail: "Im Raum verbunden",
      toneClass: "is-online",
      indicatorClass: "is-online"
    };
  }

  if (
    typeof player.disconnectDeadlineAt === "number" &&
    player.disconnectDeadlineAt > now
  ) {
    return {
      label: "Getrennt",
      detail: `Entfernt in ${formatCountdown(player.disconnectDeadlineAt - now)}`,
      toneClass: "is-offline",
      indicatorClass: "is-offline"
    };
  }

  return {
    label: "Getrennt",
    detail: "Wartet auf Entfernen",
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
  const activePlayerName = activePlayer?.username ?? "Unbekannt";
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
      "Unbekannt";
    return withPlayer(
      "Partie beendet",
      `${winner} hat die Partie gewonnen.`,
      match.winnerId
    );
  }

  if (trade) {
    const proposer =
      match.players.find((player) => player.id === trade.fromPlayerId)?.username ??
      "Unbekannt";
    if (trade.fromPlayerId === match.you) {
      const target = trade.toPlayerId
        ? match.players.find((player) => player.id === trade.toPlayerId)?.username ??
          "dem Zielspieler"
        : "einen Mitspieler";
      return withPlayer(
        "Warte auf Handelsantwort",
        trade.targetPlayerId
          ? `${target} entscheidet über dein Angebot.`
          : "Ein Mitspieler kann dein Angebot annehmen.",
        trade.toPlayerId ?? undefined
      );
    }
    if (!trade.toPlayerId || trade.toPlayerId === match.you) {
      return withPlayer(
        "Antwort von dir",
        `${proposer} wartet auf deine Entscheidung zum Handel.`,
        selfId
      );
    }
    const target =
      match.players.find((player) => player.id === trade.toPlayerId)?.username ??
      activePlayerName;
    return withPlayer(
      `Warte auf ${target}`,
      `${proposer} hat ein Handelsangebot offen.`,
      trade.toPlayerId
    );
  }

  if (match.allowedMoves.pendingDiscardCount > 0 && match.phase !== "robber_interrupt") {
    return withPlayer(
      "Aktion von dir",
      `Lege ${match.allowedMoves.pendingDiscardCount} Karten ab, damit ${activePlayerName} weitermachen kann.`,
      selfId
    );
  }

  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    return isCurrentPlayer
      ? withPlayer("Aktion von dir", "Setze jetzt deine Start-Siedlung.", selfId)
      : withPlayer(
          `Warte auf ${activePlayerName}`,
          `${activePlayerName} setzt eine Start-Siedlung.`,
          activePlayer?.id
        );
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    return isCurrentPlayer
      ? withPlayer("Aktion von dir", "Setze jetzt deine angrenzende Start-Straße.", selfId)
      : withPlayer(
          `Warte auf ${activePlayerName}`,
          `${activePlayerName} setzt eine Start-Straße.`,
          activePlayer?.id
        );
  }

  if (match.phase === "robber_interrupt") {
    const { pending, done } = getRobberDiscardGroups(match);
    if (match.allowedMoves.pendingDiscardCount > 0) {
      const othersPending = pending.filter((entry) => entry.player.id !== selfId);
      const suffix =
        othersPending.length > 0
          ? ` Danach warten noch ${summarizeRobberPlayers(
              othersPending.map((entry) => entry.player.username)
            )}.`
          : "";
      return withPlayer(
        "Aktion von dir",
        `Lege ${match.allowedMoves.pendingDiscardCount} Karten ab, damit die Räuberphase weitergehen kann.${suffix}`,
        selfId
      );
    }
    if (isCurrentPlayer && interactionMode === "robber") {
      return withPlayer(
        "Setze jetzt den Räuber",
        "Klicke jetzt ein markiertes Feld an, um den Räuber dorthin zu setzen. Erst danach geht die Räuberphase weiter.",
        selfId,
        "Jetzt Feld anklicken"
      );
    }
    if (pending.length > 0) {
      return withPlayer(
        "Warte auf Abwürfe",
        `${summarizeRobberPlayers(
          pending.map((entry) => entry.player.username)
        )} müssen noch Karten abwerfen.`,
        pending[0]?.player.id
      );
    }
    if (done.length > 0) {
      return withPlayer(
        `Warte auf ${activePlayerName}`,
        "Alle Abwürfe sind erledigt. Der Räuber wird jetzt versetzt.",
        activePlayer?.id
      );
    }
    return withPlayer(
      `Warte auf ${activePlayerName}`,
      `${activePlayerName} schließt die Räuberphase ab.`,
      activePlayer?.id
    );
  }

  if (interactionMode === "road_building") {
    const remainingRoads =
      match.pendingDevelopmentEffect?.type === "road_building"
        ? match.pendingDevelopmentEffect.remainingRoads
        : 2;
    return withPlayer(
      "Aktion von dir",
      remainingRoads === 2
        ? "Wähle die erste kostenlose Straße."
        : "Wähle die zweite kostenlose Straße oder beende den Effekt.",
      selfId
    );
  }

  if (interactionMode === "road") {
    return withPlayer("Aktion von dir", "Wähle eine gültige Straßenkante.", selfId);
  }

  if (interactionMode === "settlement") {
    return withPlayer(
      "Aktion von dir",
      "Wähle einen gültigen Platz für deine Siedlung.",
      selfId
    );
  }

  if (interactionMode === "city") {
    return withPlayer(
      "Aktion von dir",
      "Wähle eine eigene Siedlung für den Ausbau.",
      selfId
    );
  }

  if (match.allowedMoves.canRoll) {
    return isCurrentPlayer
      ? withPlayer("Aktion von dir", "Du musst jetzt würfeln.", selfId)
      : withPlayer(
          `Warte auf ${activePlayerName}`,
          `${activePlayerName} startet den Zug mit dem Wurf.`,
          activePlayer?.id
        );
  }

  if (isCurrentPlayer && match.phase === "turn_action") {
    return withPlayer("Aktion von dir", "Baue, handle oder beende deinen Zug.", selfId);
  }

  if (match.phase === "turn_action") {
    return withPlayer(
      `Warte auf ${activePlayerName}`,
      `${activePlayerName} ist am Zug.`,
      activePlayer?.id
    );
  }

  if (match.phase === "setup_forward" || match.phase === "setup_reverse") {
    return withPlayer(
      `Warte auf ${activePlayerName}`,
      `${activePlayerName} ist im Startaufbau.`,
      activePlayer?.id
    );
  }

  if (selfPlayer && !isCurrentPlayer) {
    return withPlayer(
      `Warte auf ${activePlayerName}`,
      `${activePlayerName} führt die nächste Aktion aus.`,
      activePlayer?.id
    );
  }

  return {
    title: "Warte auf die nächste Aktion",
    detail: "Sobald ein legaler Schritt möglich ist, wird er hier angezeigt."
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
      title: "Nicht dein Zug",
      lines: ["Bauen ist nur in deinem eigenen Zug möglich."]
    };
  }

  if (props.phase !== "turn_action") {
    return {
      title: props.phase === "turn_roll" ? "Erst würfeln" : "Gerade nicht verfügbar",
      lines: [
        props.phase === "turn_roll"
          ? "Du musst den Zug zuerst mit dem Würfelwurf starten."
          : "Diese Aktion ist in der aktuellen Phase gesperrt."
      ]
    };
  }

  if (props.missing.length > 0) {
    return {
      title: "Rohstoffe fehlen",
      lines: props.missing.map(
        (entry) => `${entry.count}x ${renderResourceLabel(entry.resource)} fehlt`
      )
    };
  }

  if (!props.hasLegalTarget) {
    return {
      title: id === "development" ? "Zurzeit nicht verfügbar" : "Kein gültiger Bauplatz",
      lines: [
        id === "development"
          ? "Im Moment kann keine Entwicklungskarte gekauft werden."
          : "Auf dem Brett gibt es aktuell kein legales Ziel für diese Aktion."
      ]
    };
  }

  if (props.active) {
    return {
      title: "Bauplatz wählen",
      lines: ["Wähle jetzt direkt auf dem Brett ein gültiges Ziel."]
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
    return "niemand";
  }
  if (names.length === 1) {
    return names[0]!;
  }
  if (names.length === 2) {
    return `${names[0]} und ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;
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
