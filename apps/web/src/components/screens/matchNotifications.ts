import type { DevelopmentCardType, MatchSnapshot, Resource, ResourceMap, TradeOfferView } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import type { BoardFocusBadge, BoardFocusCue } from "../../BoardScene";
import { renderEventLabel, renderResourceLabel, renderResourceMap } from "../../ui";

type MatchEvent = MatchSnapshot["eventLog"][number];
type MatchEventOf<TType extends MatchEvent["type"]> = Extract<MatchEvent, { type: TType }>;
type MatchPlayer = MatchSnapshot["players"][number];

export interface MatchNotification {
  key: string;
  eventId: string;
  eventType: MatchEvent["type"];
  label: string;
  title: string;
  detail: string;
  badges: BoardFocusBadge[];
  tradeSummary?: {
    give: ResourceMap;
    receive: ResourceMap;
  };
  playerId?: string;
  accentPlayerId?: string;
  atTurn: number;
  cue: BoardFocusCue | null;
  autoFocus: boolean;
  emphasis: "neutral" | "warning" | "success";
}

export interface MatchNotificationPrivateCache {
  developmentCardTypesByEventId: Partial<Record<string, DevelopmentCardType>>;
  robberVictimIdsByEventId: Partial<Record<string, string>>;
  robberResourcesByEventId: Partial<Record<string, Resource>>;
}

export interface MatchNotificationState {
  heroNotification: MatchNotification | null;
  boardFocusNotification: MatchNotification | null;
  recentNotifications: MatchNotification[];
  historyNotifications: MatchNotification[];
  announcementText: string | null;
  boardCue: BoardFocusCue | null;
  privateCache: MatchNotificationPrivateCache;
}

interface NotificationBuildContext {
  currentMatch: MatchSnapshot;
  previousMatch: MatchSnapshot | null;
  viewerId: string;
  privateCache: MatchNotificationPrivateCache;
}

export function createEmptyMatchNotificationPrivateCache(): MatchNotificationPrivateCache {
  return {
    developmentCardTypesByEventId: {},
    robberVictimIdsByEventId: {},
    robberResourcesByEventId: {}
  };
}

export function createMatchNotificationState(args: {
  currentMatch: MatchSnapshot;
  previousMatch: MatchSnapshot | null;
  viewerId: string;
  privateCache: MatchNotificationPrivateCache;
}): MatchNotificationState {
  const privateCache = clonePrivateCache(args.privateCache);
  const context: NotificationBuildContext = {
    currentMatch: args.currentMatch,
    previousMatch: args.previousMatch,
    viewerId: args.viewerId,
    privateCache
  };

  const previousEventIds = new Set(args.previousMatch?.eventLog.map((event) => event.id) ?? []);
  const newlySeenEventIds = args.previousMatch
    ? args.currentMatch.eventLog.filter((event) => !previousEventIds.has(event.id)).map((event) => event.id)
    : [];
  const newlySeenEventIdSet = new Set(newlySeenEventIds);

  const notificationsInOrder = args.currentMatch.eventLog
    .map((event) => createNotification(context, event))
    .filter((notification): notification is MatchNotification => !!notification);
  const historyNotifications = notificationsInOrder.slice().reverse();
  const recentNotifications = historyNotifications.slice(0, 8);
  const newNotifications = notificationsInOrder.filter((notification) => newlySeenEventIdSet.has(notification.eventId));
  const heroNotification = newNotifications.at(-1) ?? notificationsInOrder.at(-1) ?? null;
  const boardFocusNotification = pickBoardFocusNotification(newNotifications, notificationsInOrder);
  const boardCue = boardFocusNotification?.cue ?? null;
  const announcementText =
    args.previousMatch && newNotifications.length
      ? newNotifications
          .filter((notification) => shouldAnnounce(notification))
          .slice(-3)
          .map((notification) => `${notification.title}. ${notification.detail}`)
          .join(" ")
      : null;

  return {
    heroNotification,
    boardFocusNotification,
    recentNotifications,
    historyNotifications,
    announcementText,
    boardCue,
    privateCache
  };
}

function pickBoardFocusNotification(
  newNotifications: MatchNotification[],
  notificationsInOrder: MatchNotification[]
): MatchNotification | null {
  if (newNotifications.length > 0) {
    return pickPreferredNewBoardFocusNotification(newNotifications);
  }

  for (let index = notificationsInOrder.length - 1; index >= 0; index -= 1) {
    const notification = notificationsInOrder[index];
    if (notification?.cue) {
      return notification;
    }
  }

  return null;
}

function pickPreferredNewBoardFocusNotification(notifications: MatchNotification[]): MatchNotification | null {
  let bestNotification: MatchNotification | null = null;
  let bestPriority = Number.NEGATIVE_INFINITY;

  for (const notification of notifications) {
    if (!notification.cue) {
      continue;
    }

    const priority = getBoardFocusPriority(notification.eventType);
    if (priority >= bestPriority) {
      bestNotification = notification;
      bestPriority = priority;
    }
  }

  return bestNotification;
}

function getBoardFocusPriority(eventType: MatchNotification["eventType"]): number {
  switch (eventType) {
    case "initial_settlement_placed":
    case "settlement_built":
    case "initial_road_placed":
    case "road_built":
    case "city_built":
    case "robber_moved":
      return 4;
    case "resources_distributed":
      return 3;
    case "longest_road_awarded":
    case "largest_army_awarded":
      return 2;
    default:
      return 1;
  }
}

function createNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification | null {
  switch (event.type) {
    case "starting_player_rolled":
      return createStartingPlayerNotification(context.currentMatch, event);
    case "match_started":
      return createMatchStartedNotification(context.currentMatch, event, context.viewerId);
    case "initial_settlement_placed":
      return createSettlementNotification(context.currentMatch, event, context.viewerId, true);
    case "settlement_built":
      return createSettlementNotification(context.currentMatch, event, context.viewerId, false);
    case "initial_road_placed":
      return createRoadNotification(context.currentMatch, event, context.viewerId, context.previousMatch, true);
    case "road_built":
      return createRoadNotification(context.currentMatch, event, context.viewerId, context.previousMatch, false);
    case "city_built":
      return createCityNotification(context.currentMatch, event);
    case "initial_resources_granted":
      return createInitialResourcesNotification(context.currentMatch, event, context.viewerId);
    case "resources_discarded":
      return createDiscardNotification(context.currentMatch, event, context.viewerId);
    case "dice_rolled":
      return createDiceNotification(context.currentMatch, event);
    case "resources_distributed":
      return createDistributionNotification(context.currentMatch, event);
    case "development_card_bought":
      return createDevelopmentBoughtNotification(context, event);
    case "development_card_played":
      return createDevelopmentPlayedNotification(context.currentMatch, event, context.viewerId);
    case "robber_moved":
      return createRobberNotification(context, event);
    case "trade_offered":
      return createTradeOfferedNotification(context, event);
    case "trade_completed":
      return createTradeCompletedNotification(context, event);
    case "trade_declined":
      return createTradeDeclinedNotification(context, event);
    case "trade_cancelled":
      return createTradeCancelledNotification(context, event);
    case "maritime_trade":
      return createMaritimeTradeNotification(context.currentMatch, event, context.viewerId);
    case "special_build_started":
      return createSpecialBuildStartedNotification(context.currentMatch, event, context.viewerId);
    case "paired_player_started":
      return createPairedPlayerStartedNotification(context.currentMatch, event, context.viewerId);
    case "turn_ended":
      return createTurnEndedNotification(context.currentMatch, event, context.viewerId);
    case "longest_road_awarded":
      return createLongestRoadAwardedNotification(context.currentMatch, event, context.viewerId);
    case "longest_road_lost":
      return createLongestRoadLostNotification(context.currentMatch, event, context.viewerId);
    case "largest_army_awarded":
      return createLargestArmyAwardedNotification(context.currentMatch, event, context.viewerId);
    case "largest_army_lost":
      return createLargestArmyLostNotification(context.currentMatch, event, context.viewerId);
    case "game_won":
      return createGameWonNotification(context.currentMatch, event, context.viewerId);
    default:
      return createFallbackNotification(context.currentMatch, event);
  }
}

function createStartingPlayerNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"starting_player_rolled">
): MatchNotification {
  const summary = event.payload.summary;
  return createBaseNotification(match, event, {
    label: "Start",
    title: getPlayerPredicate(match, match.you, event.byPlayerId, "beginnt die Partie", "beginnst die Partie"),
    detail: summary ?? "Der Startspieler wurde ausgewählt.",
    emphasis: "success"
  });
}

function createMatchStartedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"match_started">,
  viewerId: string
): MatchNotification {
  const startingPlayerId = event.payload.startingPlayerId;
  const setupMode = event.payload.gameConfig.setupMode;
  const playerCount = event.payload.players.length;
  return createBaseNotification(match, event, {
    label: "Partie",
    title: "Partie gestartet",
    detail: startingPlayerId
      ? `${getPlayerPredicate(match, viewerId, startingPlayerId, "eröffnet die Runde", "eröffnest die Runde")}.${setupMode === "beginner" ? " Anfängeraufbau aktiv." : ""}`
      : "Die Runde läuft jetzt.",
    badges: [
      { label: `${playerCount} Spieler` },
      ...(setupMode ? [{ label: setupMode === "beginner" ? "Anfängeraufbau" : "Offizielles Setup" }] : [])
    ],
    emphasis: "success"
  });
}

function createSettlementNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"initial_settlement_placed" | "settlement_built">,
  viewerId: string,
  initial: boolean
): MatchNotification | null {
  const vertexId = event.payload.vertexId;

  const followUp = initial ? describeInitialSettlementFollowUp(match, viewerId) : null;
  return createBaseNotification(match, event, {
    label: initial ? "Startaufbau" : "Bau",
    title: initial
      ? getPlayerPredicate(match, viewerId, event.byPlayerId, "setzt eine Start-Siedlung")
      : getPlayerPredicate(match, viewerId, event.byPlayerId, "baut eine Siedlung", "baust eine Siedlung"),
    detail: followUp?.detail ?? (initial ? "Der neue Startplatz ist auf dem Brett markiert." : "Der neue Siedlungsplatz ist auf dem Brett markiert."),
    ...(followUp ? { badges: followUp.badges } : {}),
    ...(followUp?.accentPlayerId ? { accentPlayerId: followUp.accentPlayerId } : {}),
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: initial ? "Start-Siedlung gesetzt" : "Neue Siedlung gebaut",
      detail: "Der Bauplatz ist markiert.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    },
    autoFocus: true
  });
}

function createRoadNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"initial_road_placed" | "road_built">,
  viewerId: string,
  previousMatch: MatchSnapshot | null,
  initial: boolean
): MatchNotification | null {
  const edgeId = event.payload.edgeId;
  const freeBuild = event.type === "road_built" ? event.payload.freeBuild : false;
  const followUp = initial ? describeInitialRoadFollowUp(match, previousMatch, viewerId, event.byPlayerId) : null;
  const title = initial
    ? getPlayerPredicate(match, match.you, event.byPlayerId, "setzt eine Start-Straße")
    : freeBuild
      ? getPlayerPredicate(match, match.you, event.byPlayerId, "legt eine kostenlose Straße", "legst eine kostenlose Straße")
      : getPlayerPredicate(match, match.you, event.byPlayerId, "baut eine Straße", "baust eine Straße");
  const detail = initial
    ? "Die neue Verbindung ist auf dem Brett markiert."
    : freeBuild
      ? "Die Straße stammt aus Straßenbau."
      : "Die neue Verbindung ist auf dem Brett markiert.";
  const detailText = followUp?.detail ?? detail;

  return createBaseNotification(match, event, {
    label: initial ? "Startaufbau" : "Bau",
    title,
    detail: detailText,
    ...(followUp ? { badges: followUp.badges } : {}),
    ...(followUp?.accentPlayerId ? { accentPlayerId: followUp.accentPlayerId } : {}),
    cue: {
      key: `event-${event.id}-${edgeId}`,
      mode: "event",
      title: "Neue Straße",
      detail: "Die Kante ist hervorgehoben.",
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    },
    autoFocus: true
  });
}

function describeInitialSettlementFollowUp(
  match: MatchSnapshot,
  viewerId: string
): { detail: string; badges: BoardFocusBadge[]; accentPlayerId?: string } | null {
  const nextPlayerId = match.allowedMoves.initialRoadEdgeIds.length > 0 ? match.currentPlayerId : null;
  if (!nextPlayerId) {
    return null;
  }

  const nextPlayerName = getDisplayPlayerName(match, viewerId, nextPlayerId);
  return {
    detail:
      nextPlayerId === viewerId
        ? "Die Start-Siedlung steht. Du setzt jetzt deine angrenzende Start-Straße."
        : `Die Start-Siedlung steht. ${nextPlayerName} setzt jetzt die angrenzende Start-Straße.`,
    badges: [
      { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
      { label: "Start-Straße" }
    ],
    accentPlayerId: nextPlayerId
  };
}

function describeInitialRoadFollowUp(
  match: MatchSnapshot,
  previousMatch: MatchSnapshot | null,
  viewerId: string,
  actingPlayerId?: string
): { detail: string; badges: BoardFocusBadge[]; accentPlayerId?: string } | null {
  const nextPlayerId = match.currentPlayerId;
  const nextPlayerName = getDisplayPlayerName(match, viewerId, nextPlayerId);

  if (match.phase === "turn_roll" || match.allowedMoves.canRoll) {
    return {
      detail:
        nextPlayerId === viewerId
          ? "Der Startaufbau ist abgeschlossen. Du eröffnest jetzt die Partie mit dem Würfelwurf."
          : `Der Startaufbau ist abgeschlossen. ${nextPlayerName} eröffnet jetzt die Partie mit dem Würfelwurf.`,
      badges: [
        { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
        { label: "Würfeln" }
      ],
      accentPlayerId: nextPlayerId
    };
  }

  if (match.allowedMoves.initialSettlementVertexIds.length === 0) {
    return null;
  }

  const reverseStarted = previousMatch?.phase === "setup_forward" && match.phase === "setup_reverse";
  const samePlayerContinues = !!actingPlayerId && actingPlayerId === nextPlayerId;
  let detail: string;

  if (samePlayerContinues) {
    detail =
      nextPlayerId === viewerId
        ? reverseStarted
          ? "Die Hinrunde ist abgeschlossen. Du setzt jetzt direkt deine zweite Start-Siedlung."
          : "Deine Start-Straße steht. Du setzt jetzt direkt deine nächste Start-Siedlung."
        : reverseStarted
          ? `Die Hinrunde ist abgeschlossen. ${nextPlayerName} setzt jetzt direkt die zweite Start-Siedlung.`
          : `${nextPlayerName} setzt jetzt direkt die nächste Start-Siedlung.`;
  } else {
    detail =
      nextPlayerId === viewerId
        ? "Die Start-Straße steht. Du bist jetzt mit deiner Start-Siedlung dran."
        : `Die Start-Straße steht. ${nextPlayerName} ist jetzt mit der nächsten Start-Siedlung dran.`;
  }

  return {
    detail,
    badges: [
      { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
      { label: reverseStarted ? "Rückrunde" : "Start-Siedlung" }
    ],
    accentPlayerId: nextPlayerId
  };
}

function createCityNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"city_built">
): MatchNotification | null {
  const vertexId = event.payload.vertexId;
  return createBaseNotification(match, event, {
    label: "Bau",
    title: getPlayerPredicate(match, match.you, event.byPlayerId, "baut eine Stadt", "baust eine Stadt"),
    detail: "Der ausgebaute Stadtplatz ist auf dem Brett markiert.",
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: "Neue Stadt",
      detail: "Der ausgebaute Stadtplatz ist hervorgehoben.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    },
    autoFocus: true
  });
}

function createInitialResourcesNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"initial_resources_granted">,
  viewerId: string
): MatchNotification {
  const resources = event.payload.resources;
  return createBaseNotification(match, event, {
    label: "Startaufbau",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält Start-Rohstoffe", "erhältst Start-Rohstoffe"),
    detail: renderResourceMap(resources) || "Es wurden keine Rohstoffe verteilt.",
    badges: buildResourceBadges(resources)
  });
}

function createDiscardNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"resources_discarded">,
  viewerId: string
): MatchNotification {
  const count = event.payload.count;
  const remainingPlayers = match.robberDiscardStatus
    .filter((entry) => !entry.done)
    .map((entry) => getDisplayPlayerName(match, viewerId, entry.playerId));
  const detail = remainingPlayers.length
    ? `Noch offen: ${joinNames(remainingPlayers)}.`
    : "Alle nötigen Abwürfe sind erledigt. Der Räuber wird als Nächstes bewegt.";
  return createBaseNotification(match, event, {
    label: "Räuberphase",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, `wirft ${count ?? "?"} Karten ab`, `wirfst ${count ?? "?"} Karten ab`),
    detail,
    badges: count === null ? [] : [{ label: `${count} Karten` }],
    emphasis: "warning",
    autoFocus: true
  });
}

function createDiceNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"dice_rolled">
): MatchNotification | null {
  const total = event.payload.total;
  const dice = event.payload.dice;
  if (total !== 7) {
    return null;
  }

  const pendingPlayers = match.robberDiscardStatus.filter((entry) => !entry.done).length;
  const detail =
    pendingPlayers > 0
      ? `${pendingPlayers} Spieler müssen jetzt Karten abwerfen. Danach ${getRobberPlacementInstruction(match, match.you, match.currentPlayerId, true)}`
      : getRobberPlacementInstruction(match, match.you);
  return createBaseNotification(match, event, {
    label: "Räuberphase",
    title: getPlayerPredicate(match, match.you, event.byPlayerId, "würfelt 7", "würfelst 7"),
    detail,
    badges: [
      ...(dice ? [{ label: `Wurf ${dice[0]} + ${dice[1]} = 7` }] : []),
      { label: "Räuber aktiv", tone: "warning" },
      { label: "Jetzt Feld wählen", tone: "warning" }
    ],
    emphasis: "warning",
    autoFocus: true
  });
}

function createDistributionNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"resources_distributed">
): MatchNotification {
  const roll = event.payload.roll;
  const dice = event.payload.dice;
  const tileIds = event.payload.tileIds;
  const blockedResources = event.payload.blockedResources;
  const grantsByPlayerId = event.payload.grantsByPlayerId;
  const grantBadges = summarizeGrantBadges(match, grantsByPlayerId);
  const tileLine = summarizeTileLine(match, tileIds, roll);
  const detail =
    grantBadges.length > 0
      ? "Die markierten Felder schütten jetzt Rohstoffe aus."
      : tileIds.length > 0
        ? "Die markierten Felder wären aktiv, verteilen in dieser Lage aber keine Rohstoffe."
        : "Kein Feld mit dieser Zahl schüttet Rohstoffe aus.";

  return createBaseNotification(match, event, {
    label: "Wurf",
    title: getPlayerPredicate(match, match.you, event.byPlayerId, `würfelt ${roll ?? "?"}`, `würfelst ${roll ?? "?"}`),
    detail,
    badges: [
      ...(dice && roll !== null ? [{ label: `Wurf ${dice[0]} + ${dice[1]} = ${roll}` }] : []),
      ...(tileLine ? [{ label: tileLine }] : []),
      ...grantBadges,
      ...blockedResources.map((resource) => ({
        label: `Blockiert: ${renderResourceLabel(resource)}`,
        tone: "warning" as const
      }))
    ],
    cue: {
      key: `event-${event.id}-distribution-${roll ?? "x"}-${tileIds.join(",")}`,
      mode: "event",
      title: `Wurf ${roll ?? "?"}`,
      detail,
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: tileIds.length <= 1 ? "tight" : tileIds.length > 2 ? "wide" : "medium",
      zoomPreset: "roll"
    },
    autoFocus: true
  });
}

function createDevelopmentBoughtNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"development_card_bought">
): MatchNotification {
  const viewerId = context.viewerId;
  const remaining = event.payload.remaining;
  const cardType = getDevelopmentCardTypeForViewer(context, event);
  const isViewerActor = event.byPlayerId === viewerId;
  const title = cardType && isViewerActor
    ? `Du ziehst ${renderDevelopmentTypeLabel(cardType)}`
    : getPlayerPredicate(context.currentMatch, viewerId, event.byPlayerId, "kauft eine Entwicklungskarte", "kaufst eine Entwicklungskarte");
  const detail =
    cardType && isViewerActor
      ? `${renderDevelopmentTypeLabel(cardType)} liegt jetzt in deiner Hand.`
      : isViewerActor
        ? "Die gezogene Karte liegt jetzt in deiner Hand."
        : "Der genaue Kartentyp bleibt für dich verdeckt.";
  return createBaseNotification(context.currentMatch, event, {
    label: "Entwicklung",
    title,
    detail,
    badges: [
      ...(remaining !== null ? [{ label: `${remaining} Karten im Stapel` }] : []),
      ...(cardType && isViewerActor ? [{ label: renderDevelopmentTypeLabel(cardType), tone: "warning" as const }] : [])
    ],
    emphasis: cardType && isViewerActor ? "success" : "neutral"
  });
}

function createDevelopmentPlayedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"development_card_played">,
  viewerId: string
): MatchNotification {
  switch (event.payload.cardType) {
    case "knight":
      return {
        ...createBaseNotification(match, event, {
          label: "Räuberphase",
          title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Ritter", "spielst Ritter"),
          detail: "Die Räuberphase startet sofort.",
          badges: [{ label: "Ritter", tone: "warning" }],
          emphasis: "warning",
          autoFocus: true
        }),
        detail: getRobberPlacementInstruction(match, viewerId, event.byPlayerId)
      };
    case "road_building":
      return createBaseNotification(match, event, {
        label: "Entwicklung",
        title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Straßenbau", "spielst Straßenbau"),
        detail: "Es folgen bis zu zwei kostenlose Straßen.",
        badges: [{ label: "Kostenlose Straßen", tone: "warning" }]
      });
    case "year_of_plenty": {
      const resources = event.payload.resources.map((resource) => renderResourceLabel(resource));
      return createBaseNotification(match, event, {
        label: "Entwicklung",
        title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Erfindung", "spielst Erfindung"),
        detail: resources.length
          ? `${getPlayerPredicate(match, viewerId, event.byPlayerId, `nimmt ${resources.join(" und ")} aus der Bank`, `nimmst ${resources.join(" und ")} aus der Bank`)}.`
          : "Es werden zwei Rohstoffe aus der Bank genommen.",
        badges: resources.map((resource) => ({ label: resource, tone: "warning" as const })),
        emphasis: "success"
      });
    }
    case "monopoly": {
      const resource = event.payload.resource;
      const total = event.payload.total;
      return createBaseNotification(match, event, {
        label: "Entwicklung",
        title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Monopol", "spielst Monopol"),
        detail: resource
          ? `${getPlayerPredicate(match, viewerId, event.byPlayerId, `zieht ${renderResourceLabel(resource)} von allen Mitspielern ein`, `ziehst ${renderResourceLabel(resource)} von allen Mitspielern ein`)}.`
          : "Eine Rohstoffart wird von allen Mitspielern eingezogen.",
        badges: [
          ...(resource ? [{ label: renderResourceLabel(resource), tone: "warning" as const }] : []),
          ...(total !== null ? [{ label: `${total} Karten` }] : [])
        ],
        emphasis: "warning"
      });
    }
  }

  const _exhaustive: never = event.payload;
  void _exhaustive;
  return createBaseNotification(match, event, {
    label: "Entwicklung",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Entwicklung", "spielst Entwicklung"),
    detail: "Der Entwicklungskarteneffekt ist jetzt aktiv."
  });
}

function createRobberNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"robber_moved">
): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tileId = event.payload.tileId;
  const tileLabel = tileId ? getTileLabel(match, tileId) : "ein neues Feld";
  const victimId = getRobberVictimId(context, event);
  const exactResource = getRobberResourceForViewer(context, event, victimId);
  const title = victimId
    ? exactResource
      ? getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          `stiehlt ${renderResourceLabel(exactResource)} von ${getDisplayPlayerObject(match, viewerId, victimId, "dative")}`,
          `stiehlst ${renderResourceLabel(exactResource)} von ${getDisplayPlayerObject(match, viewerId, victimId, "dative")}`
        )
      : getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          `bestiehlt ${getDisplayPlayerObject(match, viewerId, victimId, "accusative")}`,
          `bestiehlst ${getDisplayPlayerObject(match, viewerId, victimId, "accusative")}`
        )
    : getPlayerPredicate(match, viewerId, event.byPlayerId, "bewegt den Räuber", "bewegst den Räuber");
  const detail = victimId
    ? exactResource
      ? `Der Räuber blockiert jetzt ${tileLabel}.`
      : `Der Räuber blockiert jetzt ${tileLabel}.`
    : `Der Räuber blockiert jetzt ${tileLabel}.`;

  return createBaseNotification(match, event, {
    label: "Räuberphase",
    title,
    detail,
    badges: [
      ...(victimId ? [{ label: getDisplayPlayerName(match, viewerId, victimId), playerId: victimId, tone: "player" as const }] : []),
      ...(exactResource ? [{ label: renderResourceLabel(exactResource), tone: "warning" as const }] : []),
      ...(tileLabel ? [{ label: tileLabel }] : [])
    ],
    cue: {
      key: `event-${event.id}-${tileId ?? "robber"}`,
      mode: "event",
      title: "Räuber versetzt",
      detail,
      vertexIds: [],
      edgeIds: [],
      tileIds: tileId ? [tileId] : [],
      scale: "wide"
    },
    autoFocus: true,
    emphasis: "warning"
  });
}

function createTradeOfferedNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"trade_offered">
): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tradeId = event.payload.tradeId;
  const trade = tradeId ? findTrade(match.tradeOffers, tradeId) : null;
  const toPlayerId = event.payload.toPlayerId;
  const targetForExchange = toPlayerId ? getDisplayPlayerObject(match, viewerId, toPlayerId, "dative") : "allen Mitspielern";
  const targetForOffer = toPlayerId ? getDisplayPlayerObject(match, viewerId, toPlayerId, "accusative") : "alle Mitspieler";
  return createBaseNotification(match, event, {
    label: "Handel",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "bietet einen Handel an", "bietest einen Handel an"),
    detail: trade
      ? `${getPlayerPredicate(match, viewerId, event.byPlayerId, `gibt ${renderResourceMap(trade.give) || "nichts"} und möchte ${renderResourceMap(trade.want) || "nichts"} von ${targetForExchange}`, `gibst ${renderResourceMap(trade.give) || "nichts"} und möchtest ${renderResourceMap(trade.want) || "nichts"} von ${targetForExchange}`)}.`
      : `Das Angebot richtet sich an ${targetForOffer}.`,
    ...(trade ? { tradeSummary: buildTradeSummary(viewerId, trade) } : {})
  });
}

function createTradeCompletedNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"trade_completed">
): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const proposerId = event.payload.fromPlayerId;
  const tradeId = event.payload.tradeId;
  const previousTrade = tradeId && context.previousMatch ? findTrade(context.previousMatch.tradeOffers, tradeId) : null;
  return createBaseNotification(match, event, {
    label: "Handel",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "nimmt einen Handel an", "nimmst einen Handel an"),
    detail: proposerId
      ? `Das Angebot von ${getDisplayPlayerObject(match, viewerId, proposerId, "dative")} wurde abgeschlossen.`
      : "Ein Handelsangebot wurde abgeschlossen.",
    ...(previousTrade ? { tradeSummary: buildTradeSummary(viewerId, previousTrade) } : {}),
    emphasis: "success"
  });
}

function createTradeDeclinedNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"trade_declined">
): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tradeId = event.payload.tradeId;
  const previousTrade = tradeId && context.previousMatch ? findTrade(context.previousMatch.tradeOffers, tradeId) : null;
  const proposerName = previousTrade ? getDisplayPlayerObject(match, viewerId, previousTrade.fromPlayerId, "dative") : null;
  return createBaseNotification(match, event, {
    label: "Handel",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "lehnt einen Handel ab", "lehnst einen Handel ab"),
    detail: proposerName ? `Das Angebot kam von ${proposerName}.` : "Das Angebot wurde nicht angenommen."
  });
}

function createTradeCancelledNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"trade_cancelled">
): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tradeId = event.payload.tradeId;
  const previousTrade = tradeId && context.previousMatch ? findTrade(context.previousMatch.tradeOffers, tradeId) : null;
  const targetPlayerName =
    previousTrade?.toPlayerId ? getDisplayPlayerObject(match, viewerId, previousTrade.toPlayerId, "accusative") : "alle Mitspieler";
  return createBaseNotification(match, event, {
    label: "Handel",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "zieht einen Handel zurück", "ziehst einen Handel zurück"),
    detail: `Das Angebot war für ${targetPlayerName}.`
  });
}

function createMaritimeTradeNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"maritime_trade">,
  viewerId: string
): MatchNotification {
  const { give, receive, giveCount } = event.payload;
  const receiveSummary = renderResourceMap(receive);
  return createBaseNotification(match, event, {
    label: "Handel",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "handelt mit dem Hafen", "handelst mit dem Hafen"),
    detail:
      give && giveCount !== null
        ? `${giveCount} ${renderResourceLabel(give)} gegen ${receiveSummary || "nichts"}.`
        : "Der Hafenhandel wurde ausgeführt.",
    badges: [
      ...(give && giveCount !== null ? [{ label: `${giveCount} ${renderResourceLabel(give)}` }] : []),
      ...(receiveSummary ? [{ label: receiveSummary, tone: "warning" as const }] : [])
    ]
  });
}

function createTurnEndedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"turn_ended">,
  viewerId: string
): MatchNotification {
  const nextPlayerId = event.payload.nextPlayerId;
  return createBaseNotification(match, event, {
    label: "Spielerwechsel",
    title: getPlayerPredicate(match, viewerId, nextPlayerId, "ist jetzt am Zug", "bist jetzt am Zug"),
    detail: `${getPlayerPredicate(match, viewerId, event.byPlayerId, "beendet den Zug", "beendest den Zug")}. ${getPlayerPredicate(match, viewerId, nextPlayerId, "startet jetzt mit dem Wurf", "startest jetzt mit dem Wurf")}.`,
    badges: [
      ...(event.byPlayerId ? [{ label: getDisplayPlayerName(match, viewerId, event.byPlayerId), playerId: event.byPlayerId, tone: "player" as const }] : []),
      ...(nextPlayerId ? [{ label: getDisplayPlayerName(match, viewerId, nextPlayerId), playerId: nextPlayerId, tone: "player" as const }] : [])
    ],
    ...(nextPlayerId ? { accentPlayerId: nextPlayerId } : {}),
    cue: {
      key: `event-${event.id}-turn-overview`,
      mode: "event",
      title: "Neuer Zug",
      detail: "Die Kamera zeigt wieder das gesamte Spielfeld.",
      vertexIds: [],
      edgeIds: [],
      tileIds: [],
      scale: "wide",
      zoomPreset: "distribution"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createSpecialBuildStartedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"special_build_started">,
  viewerId: string
): MatchNotification {
  const { primaryPlayerId, builderPlayerId } = event.payload;
  return createBaseNotification(match, event, {
    label: "Sonderbauphase",
    title: getPlayerPredicate(
      match,
      viewerId,
      builderPlayerId,
      "ist jetzt in der Sonderbauphase dran",
      "bist jetzt in der Sonderbauphase dran"
    ),
    detail: `${getPlayerPredicate(match, viewerId, primaryPlayerId, "hat den Hauptzug beendet", "hast den Hauptzug beendet")}. ${getPlayerPredicate(
      match,
      viewerId,
      builderPlayerId,
      "darf jetzt bauen oder eine Entwicklung kaufen",
      "darfst jetzt bauen oder eine Entwicklung kaufen"
    )}. Kein Würfeln, kein Spielerhandel, kein Hafenhandel und keine Entwicklungskarte spielen.`,
    badges: [
      ...(primaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, primaryPlayerId), playerId: primaryPlayerId, tone: "player" as const }]
        : []),
      ...(builderPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, builderPlayerId), playerId: builderPlayerId, tone: "player" as const }]
        : []),
      { label: "Kein Würfeln", tone: "warning" }
    ],
    ...(builderPlayerId ? { accentPlayerId: builderPlayerId } : {}),
    cue: {
      key: `event-${event.id}-special-build`,
      mode: "event",
      title: "Sonderbauphase",
      detail: "Jetzt ist nur Bauen oder Entwicklung kaufen erlaubt.",
      vertexIds: [],
      edgeIds: [],
      tileIds: [],
      scale: "wide",
      zoomPreset: "distribution"
    },
    autoFocus: true,
    emphasis: "warning"
  });
}

function createPairedPlayerStartedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"paired_player_started">,
  viewerId: string
): MatchNotification {
  const { primaryPlayerId, secondaryPlayerId } = event.payload;
  return createBaseNotification(match, event, {
    label: "Paired Players",
    title: getPlayerPredicate(
      match,
      viewerId,
      secondaryPlayerId,
      "ist jetzt als Spieler 2 am Zug",
      "bist jetzt als Spieler 2 am Zug"
    ),
    detail: `${getPlayerPredicate(match, viewerId, primaryPlayerId, "beendet die Hauptaktion", "beendest die Hauptaktion")}. ${getPlayerPredicate(
      match,
      viewerId,
      secondaryPlayerId,
      "darf jetzt bauen, Hafenhandel machen und Entwicklungskarten spielen",
      "darfst jetzt bauen, Hafenhandel machen und Entwicklungskarten spielen"
    )}. Kein Handel mit Mitspielern.`,
    badges: [
      ...(primaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, primaryPlayerId), playerId: primaryPlayerId, tone: "player" as const }]
        : []),
      ...(secondaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, secondaryPlayerId), playerId: secondaryPlayerId, tone: "player" as const }]
        : []),
      { label: "Kein Spielerhandel", tone: "warning" }
    ],
    ...(secondaryPlayerId ? { accentPlayerId: secondaryPlayerId } : {}),
    cue: {
      key: `event-${event.id}-paired-player`,
      mode: "event",
      title: "Paired Players",
      detail: "Spieler 2 führt jetzt seine Zusatzaktion aus.",
      vertexIds: [],
      edgeIds: [],
      tileIds: [],
      scale: "wide",
      zoomPreset: "distribution"
    },
    autoFocus: true,
    emphasis: "warning"
  });
}

function createLongestRoadAwardedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"longest_road_awarded">,
  viewerId: string
): MatchNotification {
  const { edgeIds, length, previousPlayerId, publicVictoryPoints } = event.payload;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "übernimmt die Längste Straße", "übernimmst die Längste Straße"),
    detail: previousPlayerId
      ? `${getPlayerPredicate(match, viewerId, previousPlayerId, "verliert die Auszeichnung", "verlierst die Auszeichnung")} und ${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP", "erhältst 2 öffentliche VP")}.`
      : `${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP für die Längste Straße", "erhältst 2 öffentliche VP für die Längste Straße")}.`,
    badges: [
      ...(length !== null ? [{ label: `Länge ${length}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "+2 VP", tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-longest-road-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: "Längste Straße",
      detail: `${getPlayerPredicate(match, viewerId, event.byPlayerId, "führt jetzt die Längste Straße", "führst jetzt die Längste Straße")}.`,
      vertexIds: [],
      edgeIds,
      tileIds: [],
      scale: edgeIds.length > 4 ? "wide" : "medium"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createLongestRoadLostNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"longest_road_lost">,
  viewerId: string
): MatchNotification {
  const { nextPlayerId, length, publicVictoryPoints } = event.payload;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "verliert die Längste Straße", "verlierst die Längste Straße"),
    detail: nextPlayerId
      ? `${getPlayerPredicate(match, viewerId, nextPlayerId, "übernimmt die Auszeichnung", "übernimmst die Auszeichnung")}.`
      : "Die Auszeichnung ist im Moment bei niemandem.",
    badges: [
      ...(length !== null ? [{ label: `Länge ${length}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "-2 VP", tone: "warning" }
    ],
    autoFocus: true,
    emphasis: "warning"
  });
}

function createLargestArmyAwardedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"largest_army_awarded">,
  viewerId: string
): MatchNotification {
  const { vertexIds, knightCount, previousPlayerId, publicVictoryPoints } = event.payload;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "übernimmt die Größte Rittermacht", "übernimmst die Größte Rittermacht"),
    detail: previousPlayerId
      ? `${getPlayerPredicate(match, viewerId, previousPlayerId, "verliert die Auszeichnung", "verlierst die Auszeichnung")} und ${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP", "erhältst 2 öffentliche VP")}.`
      : `${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP für die Größte Rittermacht", "erhältst 2 öffentliche VP für die Größte Rittermacht")}.`,
    badges: [
      ...(knightCount !== null ? [{ label: `Ritter ${knightCount}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "+2 VP", tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-largest-army-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: "Größte Rittermacht",
      detail: `${getPlayerPredicate(match, viewerId, event.byPlayerId, "führt jetzt die Größte Rittermacht", "führst jetzt die Größte Rittermacht")}.`,
      vertexIds,
      edgeIds: [],
      tileIds: [],
      scale: vertexIds.length > 2 ? "wide" : "medium"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createLargestArmyLostNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"largest_army_lost">,
  viewerId: string
): MatchNotification {
  const { nextPlayerId, knightCount, publicVictoryPoints } = event.payload;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "verliert die Größte Rittermacht", "verlierst die Größte Rittermacht"),
    detail: nextPlayerId
      ? `${getPlayerPredicate(match, viewerId, nextPlayerId, "übernimmt die Auszeichnung", "übernimmst die Auszeichnung")}.`
      : "Die Auszeichnung ist im Moment bei niemandem.",
    badges: [
      ...(knightCount !== null ? [{ label: `Ritter ${knightCount}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "-2 VP", tone: "warning" }
    ],
    autoFocus: true,
    emphasis: "warning"
  });
}

function createGameWonNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"game_won">,
  viewerId: string
): MatchNotification {
  const victoryPoints = event.payload.victoryPoints;
  return createBaseNotification(match, event, {
    label: "Sieg",
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "gewinnt die Partie", "gewinnst die Partie"),
    detail: victoryPoints !== null
      ? `${getPlayerPredicate(match, viewerId, event.byPlayerId, `beendet die Partie mit ${victoryPoints} Siegpunkten`, `beendest die Partie mit ${victoryPoints} Siegpunkten`)}.`
      : "Die Partie ist beendet.",
    badges: victoryPoints !== null ? [{ label: `${victoryPoints} VP`, tone: "warning" }] : [],
    autoFocus: true,
    emphasis: "success"
  });
}

function createFallbackNotification(match: MatchSnapshot, event: MatchEvent): MatchNotification {
  return createBaseNotification(match, event, {
    label: getNotificationLabel(event),
    title: renderEventLabel(event.type),
    detail: `Zug ${event.atTurn}.`
  });
}

function createBaseNotification(
  _match: MatchSnapshot,
  event: MatchEvent,
  input: {
    label: string;
    title: string;
    detail: string;
    badges?: BoardFocusBadge[];
    tradeSummary?: MatchNotification["tradeSummary"];
    cue?: BoardFocusCue | null;
    playerId?: string;
    accentPlayerId?: string;
    autoFocus?: boolean;
    emphasis?: MatchNotification["emphasis"];
  }
): MatchNotification {
  return {
    key: `notification-${event.id}`,
    eventId: event.id,
    eventType: event.type,
    label: input.label,
    title: input.title,
    detail: input.detail,
    badges: [
      ...(input.badges ?? []),
      { label: `Zug ${event.atTurn}` }
    ],
    ...(input.tradeSummary ? { tradeSummary: input.tradeSummary } : {}),
    atTurn: event.atTurn,
    cue: input.cue ?? null,
    autoFocus: input.autoFocus ?? false,
    emphasis: input.emphasis ?? "neutral",
    ...((input.playerId ?? event.byPlayerId) ? { playerId: input.playerId ?? event.byPlayerId } : {}),
    ...(input.accentPlayerId ? { accentPlayerId: input.accentPlayerId } : {})
  };
}

function shouldAnnounce(notification: MatchNotification): boolean {
  return notification.eventType !== "match_started";
}

function clonePrivateCache(cache: MatchNotificationPrivateCache): MatchNotificationPrivateCache {
  return {
    developmentCardTypesByEventId: { ...cache.developmentCardTypesByEventId },
    robberVictimIdsByEventId: { ...cache.robberVictimIdsByEventId },
    robberResourcesByEventId: { ...cache.robberResourcesByEventId }
  };
}

function getDevelopmentCardTypeForViewer(
  context: NotificationBuildContext,
  event: MatchEventOf<"development_card_bought">
): DevelopmentCardType | null {
  const cached = context.privateCache.developmentCardTypesByEventId[event.id];
  if (cached) {
    return cached;
  }

  if (event.byPlayerId !== context.viewerId || !context.previousMatch) {
    return null;
  }

  const previousSelf = getPlayerById(context.previousMatch, context.viewerId);
  const currentSelf = getPlayerById(context.currentMatch, context.viewerId);
  const previousCards = previousSelf?.developmentCards ?? [];
  const currentCards = currentSelf?.developmentCards ?? [];
  const previousIds = new Set(previousCards.map((card) => card.id));
  const addedCards = currentCards.filter((card) => !previousIds.has(card.id));
  const [addedCard] = addedCards;
  if (addedCards.length !== 1 || !addedCard) {
    return null;
  }

  context.privateCache.developmentCardTypesByEventId[event.id] = addedCard.type;
  return addedCard.type;
}

function getRobberVictimId(
  context: NotificationBuildContext,
  event: MatchEventOf<"robber_moved">
): string | null {
  const cached = context.privateCache.robberVictimIdsByEventId[event.id];
  if (cached) {
    return cached;
  }

  const payloadVictimId = event.payload.targetPlayerId;
  if (payloadVictimId) {
    context.privateCache.robberVictimIdsByEventId[event.id] = payloadVictimId;
    return payloadVictimId;
  }

  if (!context.previousMatch || !event.byPlayerId) {
    return null;
  }

  const thiefId = event.byPlayerId;
  const playerCountDeltas = context.currentMatch.players.map((player) => {
    const previousCount = getPlayerById(context.previousMatch!, player.id)?.resourceCount;
    return {
      playerId: player.id,
      delta: previousCount === undefined ? null : player.resourceCount - previousCount
    };
  });
  const thiefDelta = playerCountDeltas.find((entry) => entry.playerId === thiefId)?.delta;
  if (thiefDelta !== 1) {
    return null;
  }

  const victimCandidates = playerCountDeltas.filter((entry) => entry.playerId !== thiefId && entry.delta === -1);
  const hasOtherCountChanges = playerCountDeltas.some(
    (entry) => entry.delta === null || (entry.playerId !== thiefId && entry.delta !== 0 && entry.delta !== -1)
  );
  const [victimCandidate] = victimCandidates;
  if (victimCandidates.length !== 1 || hasOtherCountChanges || !victimCandidate) {
    return null;
  }

  context.privateCache.robberVictimIdsByEventId[event.id] = victimCandidate.playerId;
  return victimCandidate.playerId;
}

function getRobberResourceForViewer(
  context: NotificationBuildContext,
  event: MatchEventOf<"robber_moved">,
  victimId: string | null
): Resource | null {
  const cached = context.privateCache.robberResourcesByEventId[event.id];
  if (cached) {
    return cached;
  }

  if (!context.previousMatch || !event.byPlayerId || !victimId) {
    return null;
  }

  if (context.viewerId !== event.byPlayerId && context.viewerId !== victimId) {
    return null;
  }

  const previousSelf = getPlayerById(context.previousMatch, context.viewerId);
  const currentSelf = getPlayerById(context.currentMatch, context.viewerId);
  const previousResources = previousSelf?.resources;
  const currentResources = currentSelf?.resources;
  if (!previousResources || !currentResources) {
    return null;
  }

  const exactResource = getSingleResourceShift(
    previousResources,
    currentResources,
    context.viewerId === event.byPlayerId ? 1 : -1
  );
  if (!exactResource) {
    return null;
  }

  context.privateCache.robberResourcesByEventId[event.id] = exactResource;
  return exactResource;
}

function getSingleResourceShift(
  previousResources: ResourceMap,
  currentResources: ResourceMap,
  expectedDelta: 1 | -1
): Resource | null {
  let matchingResource: Resource | null = null;
  let totalDelta = 0;

  for (const resource of RESOURCES) {
    const delta = (currentResources[resource] ?? 0) - (previousResources[resource] ?? 0);
    totalDelta += delta;

    if (delta === expectedDelta) {
      if (matchingResource) {
        return null;
      }
      matchingResource = resource;
      continue;
    }

    if (delta !== 0) {
      return null;
    }
  }

  return totalDelta === expectedDelta ? matchingResource : null;
}

function buildTradeSummary(
  viewerId: string,
  trade: TradeOfferView
): NonNullable<MatchNotification["tradeSummary"]> {
  if (trade.fromPlayerId === viewerId) {
    return {
      give: trade.give,
      receive: trade.want
    };
  }

  if (!trade.toPlayerId || trade.toPlayerId === viewerId) {
    return {
      give: trade.want,
      receive: trade.give
    };
  }

  return {
    give: trade.give,
    receive: trade.want
  };
}

function findTrade(tradeOffers: MatchSnapshot["tradeOffers"], tradeId: string): TradeOfferView | null {
  return tradeOffers.find((trade) => trade.id === tradeId) ?? null;
}

function buildResourceBadges(resources: ResourceMap): BoardFocusBadge[] {
  return RESOURCES.flatMap((resource) => {
    const count = resources[resource] ?? 0;
    return count > 0 ? [{ label: `${count} ${renderResourceLabel(resource)}` }] : [];
  });
}

function summarizeGrantBadges(match: MatchSnapshot, grantsByPlayerId: Record<string, ResourceMap>): BoardFocusBadge[] {
  return Object.entries(grantsByPlayerId).flatMap(([playerId, resourceMap]) => {
    const summary = renderResourceMap(resourceMap);
    return summary
      ? [{
          label: `${getDisplayPlayerName(match, match.you, playerId)} +${summary}`,
          playerId,
          tone: "player" as const
        }]
      : [];
  });
}

function summarizeTileLine(match: MatchSnapshot, tileIds: string[], roll: number | null): string {
  if (!tileIds.length) {
    return roll === null ? "Keine aktiven Felder" : `Keine aktiven Felder für ${roll}`;
  }

  const labels = tileIds
    .map((tileId) => match.board.tiles.find((tile) => tile.id === tileId))
    .filter((tile): tile is MatchSnapshot["board"]["tiles"][number] => !!tile)
    .map((tile) => `${renderResourceLabel(tile.resource)} ${tile.token ?? ""}`.trim());

  return `Felder ${labels.join(" / ")}`;
}

function getTileLabel(match: MatchSnapshot, tileId: string): string {
  const tile = match.board.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return "ein Feld";
  }

  return `${renderResourceLabel(tile.resource)} ${tile.token ?? ""}`.trim();
}

function getNotificationLabel(event: MatchEvent): string {
  switch (event.type) {
    case "special_build_started":
    case "paired_player_started":
      return "Spielerwechsel";
    case "turn_ended":
      return "Spielerwechsel";
    case "dice_rolled":
    case "resources_discarded":
    case "robber_moved":
      return "Räuberphase";
    case "development_card_bought":
    case "development_card_played":
      return "Entwicklung";
    case "trade_offered":
    case "trade_completed":
    case "trade_declined":
    case "trade_cancelled":
    case "maritime_trade":
      return "Handel";
    case "road_built":
    case "settlement_built":
    case "city_built":
      return "Bau";
    case "longest_road_awarded":
    case "longest_road_lost":
    case "largest_army_awarded":
    case "largest_army_lost":
      return "Auszeichnung";
    case "game_won":
      return "Sieg";
    default:
      return "Live-Geschehen";
  }
}

function renderDevelopmentTypeLabel(type: DevelopmentCardType | null): string {
  switch (type) {
    case "knight":
      return "Ritter";
    case "victory_point":
      return "Siegpunkt";
    case "road_building":
      return "Straßenbau";
    case "year_of_plenty":
      return "Erfindung";
    case "monopoly":
      return "Monopol";
    case null:
      return "Entwicklungskarte";
    default:
      return type;
  }
}

function getDisplayPlayerName(match: MatchSnapshot, viewerId: string, playerId?: string): string {
  if (!playerId) {
    return "Ein Spieler";
  }

  if (playerId === viewerId) {
    return "Du";
  }

  return getPlayerById(match, playerId)?.username ?? "Ein Spieler";
}

function getRobberPlacementInstruction(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined = match.currentPlayerId,
  lowerCaseSelf = false
): string {
  if (!playerId) {
    return "Jetzt muss ein markiertes Feld für den Räuber gewählt werden.";
  }

  if (playerId === viewerId) {
    return lowerCaseSelf
      ? "musst du jetzt ein markiertes Feld anklicken und den Räuber setzen."
      : "Du musst jetzt ein markiertes Feld anklicken und den Räuber setzen.";
  }

  return `${getDisplayPlayerName(match, viewerId, playerId)} muss jetzt ein markiertes Feld anklicken und den Räuber setzen.`;
}

function getPlayerPredicate(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined,
  thirdPersonPredicate: string,
  secondPersonPredicate = thirdPersonPredicate
): string {
  if (!playerId) {
    return `Ein Spieler ${thirdPersonPredicate}`;
  }

  if (playerId === viewerId) {
    return `Du ${secondPersonPredicate}`;
  }

  return `${getPlayerById(match, playerId)?.username ?? "Ein Spieler"} ${thirdPersonPredicate}`;
}

function getDisplayPlayerObject(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined,
  grammaticalCase: "accusative" | "dative" = "accusative"
): string {
  if (!playerId) {
    return grammaticalCase === "dative" ? "einem Spieler" : "einen Spieler";
  }

  if (playerId === viewerId) {
    return grammaticalCase === "dative" ? "dir" : "dich";
  }

  return getPlayerById(match, playerId)?.username ?? (grammaticalCase === "dative" ? "einem Spieler" : "einen Spieler");
}

function getPlayerById(match: MatchSnapshot, playerId?: string): MatchPlayer | null {
  if (!playerId) {
    return null;
  }

  return match.players.find((player) => player.id === playerId) ?? null;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "niemand";
  }
  if (names.length === 2) {
    return `${names[0]} und ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;
}
