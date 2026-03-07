import type { DevelopmentCardType, MatchSnapshot, Resource, ResourceMap, TradeOfferView } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import type { BoardFocusBadge, BoardFocusCue } from "../../BoardScene";
import { renderEventLabel, renderResourceLabel, renderResourceMap } from "../../ui";

type MatchEvent = MatchSnapshot["eventLog"][number];
type MatchPlayer = MatchSnapshot["players"][number];

export interface MatchNotification {
  key: string;
  eventId: string;
  eventType: string;
  label: string;
  title: string;
  detail: string;
  badges: BoardFocusBadge[];
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
  const boardCue = heroNotification?.cue ?? null;
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
    recentNotifications,
    historyNotifications,
    announcementText,
    boardCue,
    privateCache
  };
}

function createNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification | null {
  switch (event.type) {
    case "starting_player_rolled":
      return createStartingPlayerNotification(context.currentMatch, event);
    case "match_started":
      return createMatchStartedNotification(context.currentMatch, event, context.viewerId);
    case "initial_settlement_placed":
      return createSettlementNotification(context.currentMatch, event, true);
    case "settlement_built":
      return createSettlementNotification(context.currentMatch, event, false);
    case "initial_road_placed":
      return createRoadNotification(context.currentMatch, event, true);
    case "road_built":
      return createRoadNotification(context.currentMatch, event, false);
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

function createStartingPlayerNotification(match: MatchSnapshot, event: MatchEvent): MatchNotification {
  const summary = getPayloadString(event.payload, "summary");
  return createBaseNotification(match, event, {
    label: "Start",
    title: `${getDisplayPlayerName(match, match.you, event.byPlayerId)} beginnt die Partie`,
    detail: summary ?? "Der Startspieler wurde ausgewaehlt.",
    emphasis: "success"
  });
}

function createMatchStartedNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const startingPlayerId = getPayloadString(event.payload, "startingPlayerId");
  const setupMode = getPayloadString(event.payload, "setupMode");
  const playerCount = getPayloadObjectArray(event.payload, "players").length;
  return createBaseNotification(match, event, {
    label: "Partie",
    title: "Partie gestartet",
    detail: startingPlayerId
      ? `${getDisplayPlayerName(match, viewerId, startingPlayerId)} eroeffnet die Runde.${setupMode === "beginner" ? " Anfaengeraufbau aktiv." : ""}`
      : "Die Runde laeuft jetzt.",
    badges: [
      { label: `${playerCount} Spieler` },
      ...(setupMode ? [{ label: setupMode === "beginner" ? "Anfaengeraufbau" : "Offizielles Setup" }] : [])
    ],
    emphasis: "success"
  });
}

function createSettlementNotification(match: MatchSnapshot, event: MatchEvent, initial: boolean): MatchNotification | null {
  const vertexId = getPayloadString(event.payload, "vertexId");
  if (!vertexId) {
    return createFallbackNotification(match, event);
  }

  return createBaseNotification(match, event, {
    label: initial ? "Startaufbau" : "Bau",
    title: initial
      ? `${getDisplayPlayerName(match, match.you, event.byPlayerId)} setzt eine Start-Siedlung`
      : `${getDisplayPlayerName(match, match.you, event.byPlayerId)} baut eine Siedlung`,
    detail: initial ? "Der neue Startplatz ist auf dem Brett markiert." : "Der neue Siedlungsplatz ist auf dem Brett markiert.",
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: initial ? "Start-Siedlung gesetzt" : "Neue Siedlung gebaut",
      detail: "Der Bauplatz ist markiert.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    }
  });
}

function createRoadNotification(match: MatchSnapshot, event: MatchEvent, initial: boolean): MatchNotification | null {
  const edgeId = getPayloadString(event.payload, "edgeId");
  if (!edgeId) {
    return createFallbackNotification(match, event);
  }

  const freeBuild = getPayloadBoolean(event.payload, "freeBuild");
  const title = initial
    ? `${getDisplayPlayerName(match, match.you, event.byPlayerId)} setzt eine Start-Strasse`
    : freeBuild
      ? `${getDisplayPlayerName(match, match.you, event.byPlayerId)} legt eine kostenlose Strasse`
      : `${getDisplayPlayerName(match, match.you, event.byPlayerId)} baut eine Strasse`;
  const detail = initial
    ? "Die neue Verbindung ist auf dem Brett markiert."
    : freeBuild
      ? "Die Strasse stammt aus Strassenbau."
      : "Die neue Verbindung ist auf dem Brett markiert.";

  return createBaseNotification(match, event, {
    label: initial ? "Startaufbau" : "Bau",
    title,
    detail,
    cue: {
      key: `event-${event.id}-${edgeId}`,
      mode: "event",
      title: "Neue Strasse",
      detail: "Die Kante ist hervorgehoben.",
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    }
  });
}

function createCityNotification(match: MatchSnapshot, event: MatchEvent): MatchNotification | null {
  const vertexId = getPayloadString(event.payload, "vertexId");
  if (!vertexId) {
    return createFallbackNotification(match, event);
  }

  return createBaseNotification(match, event, {
    label: "Bau",
    title: `${getDisplayPlayerName(match, match.you, event.byPlayerId)} baut eine Stadt`,
    detail: "Der ausgebauten Stadtplatz ist auf dem Brett markiert.",
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: "Neue Stadt",
      detail: "Der ausgebauten Stadtplatz ist hervorgehoben.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    }
  });
}

function createInitialResourcesNotification(
  match: MatchSnapshot,
  event: MatchEvent,
  viewerId: string
): MatchNotification {
  const resources = getPayloadResourceMap(event.payload, "resources");
  return createBaseNotification(match, event, {
    label: "Startaufbau",
    title: `${getDisplayPlayerName(match, viewerId, event.byPlayerId)} erhaelt Start-Rohstoffe`,
    detail: renderResourceMap(resources) || "Es wurden keine Rohstoffe verteilt.",
    badges: buildResourceBadges(resources)
  });
}

function createDiscardNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const count = getPayloadNumber(event.payload, "count");
  const remainingPlayers = match.robberDiscardStatus
    .filter((entry) => !entry.done)
    .map((entry) => getDisplayPlayerName(match, viewerId, entry.playerId));
  const detail = remainingPlayers.length
    ? `Noch offen: ${joinNames(remainingPlayers)}.`
    : "Alle noetigen Abwuerfe sind erledigt. Der Raeuber wird als Naechstes bewegt.";
  return createBaseNotification(match, event, {
    label: "Raeuberphase",
    title: `${getDisplayPlayerName(match, viewerId, event.byPlayerId)} wirft ${count ?? "?"} Karten ab`,
    detail,
    badges: count === null ? [] : [{ label: `${count} Karten` }],
    emphasis: "warning",
    autoFocus: true
  });
}

function createDiceNotification(match: MatchSnapshot, event: MatchEvent): MatchNotification | null {
  const total = getPayloadNumber(event.payload, "total");
  const dice = getPayloadDice(event.payload, "dice");
  if (total === null || total !== 7) {
    return null;
  }

  const pendingPlayers = match.robberDiscardStatus.filter((entry) => !entry.done).length;
  return createBaseNotification(match, event, {
    label: "Raeuberphase",
    title: `${getDisplayPlayerName(match, match.you, event.byPlayerId)} wuerfelt 7`,
    detail:
      pendingPlayers > 0
        ? `${pendingPlayers} Spieler muessen jetzt Karten abwerfen, danach wird der Raeuber bewegt.`
        : "Niemand muss abwerfen. Der Raeuber wird jetzt bewegt.",
    badges: [
      ...(dice ? [{ label: `Wurf ${dice[0]} + ${dice[1]} = 7` }] : []),
      { label: "Raeuber aktiv", tone: "warning" }
    ],
    emphasis: "warning",
    autoFocus: true
  });
}

function createDistributionNotification(match: MatchSnapshot, event: MatchEvent): MatchNotification {
  const roll = getPayloadNumber(event.payload, "roll");
  const dice = getPayloadDice(event.payload, "dice");
  const tileIds = getPayloadStringArray(event.payload, "tileIds");
  const blockedResources = getPayloadStringArray(event.payload, "blockedResources");
  const grantsByPlayerId = getPayloadResourceMapRecord(event.payload, "grantsByPlayerId");
  const grantBadges = summarizeGrantBadges(match, grantsByPlayerId);
  const tileLine = summarizeTileLine(match, tileIds, roll);
  const detail =
    grantBadges.length > 0
      ? "Die markierten Felder schuetten jetzt Rohstoffe aus."
      : tileIds.length > 0
        ? "Die markierten Felder waeren aktiv, verteilen in dieser Lage aber keine Rohstoffe."
        : "Kein Feld mit dieser Zahl schuettet Rohstoffe aus.";

  return createBaseNotification(match, event, {
    label: "Wurf",
    title: `${getDisplayPlayerName(match, match.you, event.byPlayerId)} wuerfelt ${roll ?? "?"}`,
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
      scale: tileIds.length > 2 ? "wide" : "medium"
    },
    autoFocus: true
  });
}

function createDevelopmentBoughtNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification {
  const viewerId = context.viewerId;
  const actorName = getDisplayPlayerName(context.currentMatch, viewerId, event.byPlayerId);
  const remaining = getPayloadNumber(event.payload, "remaining");
  const cardType = getDevelopmentCardTypeForViewer(context, event);
  const isViewerActor = event.byPlayerId === viewerId;
  const title = cardType && isViewerActor ? `Du ziehst ${renderDevelopmentTypeLabel(cardType)}` : `${actorName} kauft eine Entwicklungskarte`;
  const detail =
    cardType && isViewerActor
      ? `${renderDevelopmentTypeLabel(cardType)} liegt jetzt in deiner Hand.`
      : isViewerActor
        ? "Die gezogene Karte liegt jetzt in deiner Hand."
        : "Der genaue Kartentyp bleibt fuer dich verdeckt.";
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
  event: MatchEvent,
  viewerId: string
): MatchNotification {
  const actorName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  const cardType = getPayloadString(event.payload, "cardType");
  switch (cardType) {
    case "knight":
      return createBaseNotification(match, event, {
        label: "Raeuberphase",
        title: `${actorName} spielt Ritter`,
        detail: "Die Raeuberphase startet sofort.",
        badges: [{ label: "Ritter", tone: "warning" }],
        emphasis: "warning",
        autoFocus: true
      });
    case "road_building":
      return createBaseNotification(match, event, {
        label: "Entwicklung",
        title: `${actorName} spielt Strassenbau`,
        detail: "Es folgen bis zu zwei kostenlose Strassen.",
        badges: [{ label: "Kostenlose Strassen", tone: "warning" }]
      });
    case "year_of_plenty": {
      const resources = getPayloadStringArray(event.payload, "resources").map((resource) => renderResourceLabel(resource));
      return createBaseNotification(match, event, {
        label: "Entwicklung",
        title: `${actorName} spielt Erfindung`,
        detail: resources.length ? `${actorName} nimmt ${resources.join(" und ")} aus der Bank.` : "Es werden zwei Rohstoffe aus der Bank genommen.",
        badges: resources.map((resource) => ({ label: resource, tone: "warning" as const })),
        emphasis: "success"
      });
    }
    case "monopoly": {
      const resource = getPayloadString(event.payload, "resource");
      const total = getPayloadNumber(event.payload, "total");
      return createBaseNotification(match, event, {
        label: "Entwicklung",
        title: `${actorName} spielt Monopol`,
        detail: resource
          ? `${actorName} zieht ${renderResourceLabel(resource)} von allen Mitspielern ein.`
          : "Eine Rohstoffart wird von allen Mitspielern eingezogen.",
        badges: [
          ...(resource ? [{ label: renderResourceLabel(resource), tone: "warning" as const }] : []),
          ...(total !== null ? [{ label: `${total} Karten` }] : [])
        ],
        emphasis: "warning"
      });
    }
    default:
      return createBaseNotification(match, event, {
        label: "Entwicklung",
        title: `${actorName} spielt ${renderDevelopmentTypeLabel(cardType)}`,
        detail: "Der Entwicklungskarteneffekt ist jetzt aktiv."
      });
  }
}

function createRobberNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const actorName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  const tileId = getPayloadString(event.payload, "tileId");
  const tileLabel = tileId ? getTileLabel(match, tileId) : "ein neues Feld";
  const victimId = getRobberVictimId(context, event);
  const exactResource = getRobberResourceForViewer(context, event, victimId);
  const victimName = victimId ? getDisplayPlayerName(match, viewerId, victimId) : null;
  const title = victimName
    ? exactResource
      ? `${actorName} stiehlt ${renderResourceLabel(exactResource)} von ${victimName}`
      : `${actorName} bestiehlt ${victimName}`
    : `${actorName} bewegt den Raeuber`;
  const detail = victimName
    ? exactResource
      ? `Der Raeuber blockiert jetzt ${tileLabel}.`
      : `Der Raeuber blockiert jetzt ${tileLabel}. Welche Karte gestohlen wurde, bleibt verdeckt.`
    : `Der Raeuber blockiert jetzt ${tileLabel}.`;

  return createBaseNotification(match, event, {
    label: "Raeuberphase",
    title,
    detail,
    badges: [
      ...(victimId ? [{ label: victimName ?? "Ziel", playerId: victimId, tone: "player" as const }] : []),
      ...(exactResource ? [{ label: renderResourceLabel(exactResource), tone: "warning" as const }] : []),
      ...(tileLabel ? [{ label: tileLabel }] : [])
    ],
    cue: {
      key: `event-${event.id}-${tileId ?? "robber"}`,
      mode: "event",
      title: "Raeuber versetzt",
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

function createTradeOfferedNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tradeId = getPayloadString(event.payload, "tradeId");
  const trade = tradeId ? findTrade(match.tradeOffers, tradeId) : null;
  const toPlayerId = getPayloadString(event.payload, "toPlayerId");
  const targetLabel = toPlayerId ? getDisplayPlayerName(match, viewerId, toPlayerId) : "alle Mitspieler";
  return createBaseNotification(match, event, {
    label: "Handel",
    title: `${getDisplayPlayerName(match, viewerId, event.byPlayerId)} bietet einen Handel an`,
    detail: trade
      ? `Gibt ${renderResourceMap(trade.give)} und moechte ${renderResourceMap(trade.want)} von ${targetLabel}.`
      : `Das Angebot richtet sich an ${targetLabel}.`,
    badges: trade ? tradeSummaryBadges(match, viewerId, trade) : []
  });
}

function createTradeCompletedNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const proposerId = getPayloadString(event.payload, "fromPlayerId");
  const tradeId = getPayloadString(event.payload, "tradeId");
  const previousTrade = tradeId && context.previousMatch ? findTrade(context.previousMatch.tradeOffers, tradeId) : null;
  return createBaseNotification(match, event, {
    label: "Handel",
    title: `${getDisplayPlayerName(match, viewerId, event.byPlayerId)} nimmt einen Handel an`,
    detail: proposerId
      ? `Das Angebot von ${getDisplayPlayerName(match, viewerId, proposerId)} wurde abgeschlossen.`
      : "Ein Handelsangebot wurde abgeschlossen.",
    badges: previousTrade ? tradeSummaryBadges(match, viewerId, previousTrade) : [],
    emphasis: "success"
  });
}

function createTradeDeclinedNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tradeId = getPayloadString(event.payload, "tradeId");
  const previousTrade = tradeId && context.previousMatch ? findTrade(context.previousMatch.tradeOffers, tradeId) : null;
  const proposerName = previousTrade ? getDisplayPlayerName(match, viewerId, previousTrade.fromPlayerId) : null;
  return createBaseNotification(match, event, {
    label: "Handel",
    title: `${getDisplayPlayerName(match, viewerId, event.byPlayerId)} lehnt einen Handel ab`,
    detail: proposerName ? `Das Angebot kam von ${proposerName}.` : "Das Angebot wurde nicht angenommen."
  });
}

function createTradeCancelledNotification(context: NotificationBuildContext, event: MatchEvent): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tradeId = getPayloadString(event.payload, "tradeId");
  const previousTrade = tradeId && context.previousMatch ? findTrade(context.previousMatch.tradeOffers, tradeId) : null;
  const targetPlayerName =
    previousTrade?.toPlayerId ? getDisplayPlayerName(match, viewerId, previousTrade.toPlayerId) : "alle Mitspieler";
  return createBaseNotification(match, event, {
    label: "Handel",
    title: `${getDisplayPlayerName(match, viewerId, event.byPlayerId)} zieht einen Handel zurueck`,
    detail: `Das Angebot war fuer ${targetPlayerName}.`
  });
}

function createMaritimeTradeNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const give = getPayloadString(event.payload, "give");
  const receive = getPayloadString(event.payload, "receive");
  const giveCount = getPayloadNumber(event.payload, "giveCount");
  return createBaseNotification(match, event, {
    label: "Handel",
    title: `${getDisplayPlayerName(match, viewerId, event.byPlayerId)} handelt mit dem Hafen`,
    detail:
      give && receive && giveCount !== null
        ? `${giveCount} ${renderResourceLabel(give)} gegen ${renderResourceLabel(receive)}.`
        : "Der Hafenhandel wurde ausgefuehrt.",
    badges: [
      ...(give && giveCount !== null ? [{ label: `${giveCount} ${renderResourceLabel(give)}` }] : []),
      ...(receive ? [{ label: `1 ${renderResourceLabel(receive)}`, tone: "warning" as const }] : [])
    ]
  });
}

function createTurnEndedNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const nextPlayerId = getPayloadString(event.payload, "nextPlayerId");
  const nextPlayerName = nextPlayerId ? getDisplayPlayerName(match, viewerId, nextPlayerId) : "Der naechste Spieler";
  const actorName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  return createBaseNotification(match, event, {
    label: "Spielerwechsel",
    title: `${nextPlayerName} ist jetzt am Zug`,
    detail: `${actorName} beendet den Zug. ${nextPlayerName} startet jetzt mit dem Wurf.`,
    badges: [
      ...(event.byPlayerId ? [{ label: actorName, playerId: event.byPlayerId, tone: "player" as const }] : []),
      ...(nextPlayerId ? [{ label: nextPlayerName, playerId: nextPlayerId, tone: "player" as const }] : [])
    ],
    ...(nextPlayerId ? { accentPlayerId: nextPlayerId } : {}),
    autoFocus: true,
    emphasis: "success"
  });
}

function createLongestRoadAwardedNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const edgeIds = getPayloadStringArray(event.payload, "edgeIds");
  const length = getPayloadNumber(event.payload, "length");
  const previousPlayerId = getPayloadString(event.payload, "previousPlayerId");
  const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
  const actorName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  const previousName = previousPlayerId ? getDisplayPlayerName(match, viewerId, previousPlayerId) : null;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: `${actorName} uebernimmt die Laengste Strasse`,
    detail: previousName
      ? `${previousName} verliert die Auszeichnung und ${actorName} erhaelt 2 oeffentliche VP.`
      : `${actorName} erhaelt 2 oeffentliche VP fuer die Laengste Strasse.`,
    badges: [
      ...(length !== null ? [{ label: `Laenge ${length}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Oeffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "+2 VP", tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-longest-road-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: "Laengste Strasse",
      detail: `${actorName} fuehrt jetzt die Laengste Strasse.`,
      vertexIds: [],
      edgeIds,
      tileIds: [],
      scale: edgeIds.length > 4 ? "wide" : "medium"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createLongestRoadLostNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const nextPlayerId = getPayloadString(event.payload, "nextPlayerId");
  const length = getPayloadNumber(event.payload, "length");
  const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
  const actorName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  const nextName = nextPlayerId ? getDisplayPlayerName(match, viewerId, nextPlayerId) : null;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: `${actorName} verliert die Laengste Strasse`,
    detail: nextName ? `${nextName} uebernimmt die Auszeichnung.` : "Die Auszeichnung ist im Moment bei niemandem.",
    badges: [
      ...(length !== null ? [{ label: `Laenge ${length}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Oeffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "-2 VP", tone: "warning" }
    ],
    autoFocus: true,
    emphasis: "warning"
  });
}

function createLargestArmyAwardedNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const vertexIds = getPayloadStringArray(event.payload, "vertexIds");
  const knightCount = getPayloadNumber(event.payload, "knightCount");
  const previousPlayerId = getPayloadString(event.payload, "previousPlayerId");
  const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
  const actorName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  const previousName = previousPlayerId ? getDisplayPlayerName(match, viewerId, previousPlayerId) : null;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: `${actorName} uebernimmt die Groesste Rittermacht`,
    detail: previousName
      ? `${previousName} verliert die Auszeichnung und ${actorName} erhaelt 2 oeffentliche VP.`
      : `${actorName} erhaelt 2 oeffentliche VP fuer die Groesste Rittermacht.`,
    badges: [
      ...(knightCount !== null ? [{ label: `Ritter ${knightCount}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Oeffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "+2 VP", tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-largest-army-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: "Groesste Rittermacht",
      detail: `${actorName} fuehrt jetzt die Groesste Rittermacht.`,
      vertexIds,
      edgeIds: [],
      tileIds: [],
      scale: vertexIds.length > 2 ? "wide" : "medium"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createLargestArmyLostNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const nextPlayerId = getPayloadString(event.payload, "nextPlayerId");
  const knightCount = getPayloadNumber(event.payload, "knightCount");
  const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
  const actorName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  const nextName = nextPlayerId ? getDisplayPlayerName(match, viewerId, nextPlayerId) : null;
  return createBaseNotification(match, event, {
    label: "Auszeichnung",
    title: `${actorName} verliert die Groesste Rittermacht`,
    detail: nextName ? `${nextName} uebernimmt die Auszeichnung.` : "Die Auszeichnung ist im Moment bei niemandem.",
    badges: [
      ...(knightCount !== null ? [{ label: `Ritter ${knightCount}` }] : []),
      ...(publicVictoryPoints !== null ? [{ label: `Oeffentliche VP ${publicVictoryPoints}` }] : []),
      { label: "-2 VP", tone: "warning" }
    ],
    autoFocus: true,
    emphasis: "warning"
  });
}

function createGameWonNotification(match: MatchSnapshot, event: MatchEvent, viewerId: string): MatchNotification {
  const victoryPoints = getPayloadNumber(event.payload, "victoryPoints");
  const winnerName = getDisplayPlayerName(match, viewerId, event.byPlayerId);
  return createBaseNotification(match, event, {
    label: "Sieg",
    title: `${winnerName} gewinnt die Partie`,
    detail: victoryPoints !== null ? `${winnerName} beendet das Match mit ${victoryPoints} Siegpunkten.` : "Die Partie ist beendet.",
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
  event: MatchEvent
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

function getRobberVictimId(context: NotificationBuildContext, event: MatchEvent): string | null {
  const cached = context.privateCache.robberVictimIdsByEventId[event.id];
  if (cached) {
    return cached;
  }

  const payloadVictimId = getPayloadString(event.payload, "targetPlayerId");
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
  event: MatchEvent,
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

function tradeSummaryBadges(match: MatchSnapshot, viewerId: string, trade: TradeOfferView): BoardFocusBadge[] {
  return [
    {
      label: `${getDisplayPlayerName(match, viewerId, trade.fromPlayerId)} gibt ${renderResourceMap(trade.give) || "nichts"}`,
      playerId: trade.fromPlayerId,
      tone: "player"
    },
    {
      label: `fuer ${renderResourceMap(trade.want) || "nichts"}`,
      tone: "warning"
    }
  ];
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
    return roll === null ? "Keine aktiven Felder" : `Keine aktiven Felder fuer ${roll}`;
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
    case "turn_ended":
      return "Spielerwechsel";
    case "dice_rolled":
    case "resources_discarded":
    case "robber_moved":
      return "Raeuberphase";
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

function renderDevelopmentTypeLabel(type: string | null): string {
  switch (type) {
    case "knight":
      return "Ritter";
    case "victory_point":
      return "Siegpunkt";
    case "road_building":
      return "Strassenbau";
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

function getPlayerById(match: MatchSnapshot, playerId?: string): MatchPlayer | null {
  if (!playerId) {
    return null;
  }

  return match.players.find((player) => player.id === playerId) ?? null;
}

function getPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function getPayloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

function getPayloadBoolean(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

function getPayloadDice(payload: Record<string, unknown>, key: string): [number, number] | null {
  const value = payload[key];
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const [left, right] = value;
  return typeof left === "number" && typeof right === "number" ? [left, right] : null;
}

function getPayloadStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getPayloadResourceMapRecord(payload: Record<string, unknown>, key: string): Record<string, ResourceMap> {
  const value = payload[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, ResourceMap> = {};
  for (const [playerId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    next[playerId] = getPayloadResourceMap(entry as Record<string, unknown>, "__resource_map__");
  }

  return next;
}

function getPayloadResourceMap(payload: Record<string, unknown>, key: string): ResourceMap {
  const source = key === "__resource_map__" ? payload : payload[key];
  const next = {} as ResourceMap;
  for (const resource of RESOURCES) {
    const count =
      source && typeof source === "object" && !Array.isArray(source)
        ? (source as Partial<Record<Resource, unknown>>)[resource]
        : 0;
    next[resource] = typeof count === "number" ? count : 0;
  }
  return next;
}

function getPayloadObjectArray(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object") : [];
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
