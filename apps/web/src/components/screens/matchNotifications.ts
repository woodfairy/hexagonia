import type { DevelopmentCardType, MatchSnapshot, Resource, ResourceMap, TradeOfferView } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import type { BoardFocusBadge, BoardFocusCue } from "../../BoardScene";
import { createCatalogText, createText, getDocumentLocale, resolveText } from "../../i18n";
import { renderEventLabel, renderResourceLabel, renderResourceMap } from "../../ui";

type MatchEvent = MatchSnapshot["eventLog"][number];
type MatchEventOf<TType extends MatchEvent["type"]> = Extract<MatchEvent, { type: TType }>;
type MatchPlayer = MatchSnapshot["players"][number];
type TranslationParams = Parameters<typeof createText>[2];

function t(de: string, params?: TranslationParams): string {
  return resolveText(getDocumentLocale(), createText(de, undefined, params));
}

function tk(key: string, fallbackDe: string, params?: TranslationParams): string {
  return resolveText(getDocumentLocale(), createCatalogText(key, fallbackDe, undefined, params));
}

function formatNameList(names: string[]): string {
  if (names.length === 0) {
    return t("niemand");
  }

  try {
    return new Intl.ListFormat(getDocumentLocale(), { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

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
  const summary = summarizeStartingPlayerRounds(match, event);
  return createBaseNotification(match, event, {
    label: t("Start"),
    title: getPlayerPredicate(match, match.you, event.byPlayerId, "beginnt die Partie", "beginnst die Partie"),
    detail: summary ?? t("Der Startspieler wurde ausgewählt."),
    emphasis: "success"
  });
}

function summarizeStartingPlayerRounds(
  match: MatchSnapshot,
  event: MatchEventOf<"starting_player_rolled">
): string {
  const winnerName = getDisplayPlayerName(match, match.you, event.payload.winnerPlayerId);
  const lastRound = event.payload.rounds.at(-1);

  if (!lastRound) {
    return t("{winner} beginnt die Partie.", { winner: winnerName });
  }

  const contenderCount = lastRound.contenderPlayerIds.length;
  const hasRollOff = event.payload.rounds.length > 1 || contenderCount > 1;

  return hasRollOff
    ? t("{winner} gewinnt das Stechen mit {total}.", { winner: winnerName, total: lastRound.highestTotal })
    : t("{winner} gewinnt den Startwurf mit {total}.", { winner: winnerName, total: lastRound.highestTotal });
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
    label: t("Partie"),
    title: t("Partie gestartet"),
    detail: startingPlayerId
      ? setupMode === "beginner"
        ? t("{detail} Anfängeraufbau aktiv.", {
            detail: getPlayerPredicate(match, viewerId, startingPlayerId, "eröffnet die Runde", "eröffnest die Runde")
          })
        : t("{detail}.", {
            detail: getPlayerPredicate(match, viewerId, startingPlayerId, "eröffnet die Runde", "eröffnest die Runde")
          })
      : t("Die Runde läuft jetzt."),
    badges: [
      { label: t("{count} Spieler", { count: playerCount }) },
      ...(setupMode ? [{ label: setupMode === "beginner" ? t("Anfängeraufbau") : t("Offizielles Setup") }] : [])
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
    label: initial ? t("Startaufbau") : t("Bau"),
    title: initial
      ? getPlayerPredicate(match, viewerId, event.byPlayerId, "setzt eine Start-Siedlung")
      : getPlayerPredicate(match, viewerId, event.byPlayerId, "baut eine Siedlung", "baust eine Siedlung"),
    detail: followUp?.detail ?? (initial ? t("Der neue Startplatz ist auf dem Brett markiert.") : t("Der neue Siedlungsplatz ist auf dem Brett markiert.")),
    ...(followUp ? { badges: followUp.badges } : {}),
    ...(followUp?.accentPlayerId ? { accentPlayerId: followUp.accentPlayerId } : {}),
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: initial ? t("Start-Siedlung gesetzt") : t("Neue Siedlung gebaut"),
      detail: t("Der Bauplatz ist markiert."),
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
    ? t("Die neue Verbindung ist auf dem Brett markiert.")
    : freeBuild
      ? t("Die Straße stammt aus Straßenbau.")
      : t("Die neue Verbindung ist auf dem Brett markiert.");
  const detailText = followUp?.detail ?? detail;

  return createBaseNotification(match, event, {
    label: initial ? t("Startaufbau") : t("Bau"),
    title,
    detail: detailText,
    ...(followUp ? { badges: followUp.badges } : {}),
    ...(followUp?.accentPlayerId ? { accentPlayerId: followUp.accentPlayerId } : {}),
    cue: {
      key: `event-${event.id}-${edgeId}`,
      mode: "event",
      title: t("Neue Straße"),
      detail: t("Die Kante ist hervorgehoben."),
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
        ? t("Die Start-Siedlung steht. Du setzt jetzt deine angrenzende Start-Straße.")
        : t("Die Start-Siedlung steht. {player} setzt jetzt die angrenzende Start-Straße.", { player: nextPlayerName }),
    badges: [
      { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
      { label: t("Start-Straße") }
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
          ? t("Der Startaufbau ist abgeschlossen. Du eröffnest jetzt die Partie mit dem Würfelwurf.")
          : t("Der Startaufbau ist abgeschlossen. {player} eröffnet jetzt die Partie mit dem Würfelwurf.", {
              player: nextPlayerName
            }),
      badges: [
        { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
        { label: t("Würfeln") }
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
          ? t("Die Hinrunde ist abgeschlossen. Du setzt jetzt direkt deine zweite Start-Siedlung.")
          : t("Deine Start-Straße steht. Du setzt jetzt direkt deine nächste Start-Siedlung.")
        : reverseStarted
          ? t("Die Hinrunde ist abgeschlossen. {player} setzt jetzt direkt die zweite Start-Siedlung.", { player: nextPlayerName })
          : t("{player} setzt jetzt direkt die nächste Start-Siedlung.", { player: nextPlayerName });
  } else {
    detail =
      nextPlayerId === viewerId
        ? t("Die Start-Straße steht. Du bist jetzt mit deiner Start-Siedlung dran.")
        : t("Die Start-Straße steht. {player} ist jetzt mit der nächsten Start-Siedlung dran.", {
            player: nextPlayerName
          });
  }

  return {
    detail,
    badges: [
      { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
      { label: reverseStarted ? t("Rückrunde") : t("Start-Siedlung") }
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
    label: t("Bau"),
    title: getPlayerPredicate(match, match.you, event.byPlayerId, "baut eine Stadt", "baust eine Stadt"),
    detail: t("Der ausgebaute Stadtplatz ist auf dem Brett markiert."),
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: t("Neue Stadt"),
      detail: t("Der ausgebaute Stadtplatz ist hervorgehoben."),
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
    label: t("Startaufbau"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält Start-Rohstoffe", "erhältst Start-Rohstoffe"),
    detail: renderResourceMap(resources) || t("Es wurden keine Rohstoffe verteilt."),
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
    ? t("Noch offen: {players}.", { players: joinNames(remainingPlayers) })
    : t("Alle nötigen Abwürfe sind erledigt. Der Räuber wird als Nächstes bewegt.");
  return createBaseNotification(match, event, {
    label: t("Räuberphase"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "wirft {count} Karten ab", "wirfst {count} Karten ab", {
      count: count ?? "?"
    }),
    detail,
    badges: count === null ? [] : [{ label: t("{count} Karten", { count }) }],
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
      ? t("{count} Spieler müssen jetzt Karten abwerfen. Danach {detail}", {
          count: pendingPlayers,
          detail: getRobberPlacementInstruction(match, match.you, match.currentPlayerId, true)
        })
      : getRobberPlacementInstruction(match, match.you);
  return createBaseNotification(match, event, {
    label: t("Räuberphase"),
    title: getPlayerPredicate(match, match.you, event.byPlayerId, "würfelt 7", "würfelst 7"),
    detail,
    badges: [
      ...(dice ? [{ label: t("Wurf {first} + {second} = 7", { first: dice[0], second: dice[1] }) }] : []),
      { label: t("Räuber aktiv"), tone: "warning" },
      { label: t("Jetzt Feld wählen"), tone: "warning" }
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
      ? t("Die markierten Felder schütten jetzt Rohstoffe aus.")
      : tileIds.length > 0
        ? t("Die markierten Felder wären aktiv, verteilen in dieser Lage aber keine Rohstoffe.")
        : t("Kein Feld mit dieser Zahl schüttet Rohstoffe aus.");

  return createBaseNotification(match, event, {
    label: t("Wurf"),
    title: getPlayerPredicate(match, match.you, event.byPlayerId, "würfelt {roll}", "würfelst {roll}", {
      roll: roll ?? "?"
    }),
    detail,
    badges: [
      ...(dice && roll !== null ? [{ label: t("Wurf {first} + {second} = {roll}", { first: dice[0], second: dice[1], roll }) }] : []),
      ...(tileLine ? [{ label: tileLine }] : []),
      ...grantBadges,
      ...blockedResources.map((resource) => ({
        label: t("Blockiert: {resource}", { resource: renderResourceLabel(resource) }),
        tone: "warning" as const
      }))
    ],
    cue: {
      key: `event-${event.id}-distribution-${roll ?? "x"}-${tileIds.join(",")}`,
      mode: "event",
      title: t("Wurf {roll}", { roll: roll ?? "?" }),
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
    ? t("Du ziehst {card}", { card: renderDevelopmentTypeLabel(cardType) })
    : getPlayerPredicate(context.currentMatch, viewerId, event.byPlayerId, "kauft eine Entwicklungskarte", "kaufst eine Entwicklungskarte");
  const detail =
    cardType && isViewerActor
      ? t("{card} liegt jetzt in deiner Hand.", { card: renderDevelopmentTypeLabel(cardType) })
      : isViewerActor
        ? t("Die gezogene Karte liegt jetzt in deiner Hand.")
        : t("Der genaue Kartentyp bleibt für dich verdeckt.");
  return createBaseNotification(context.currentMatch, event, {
    label: t("Entwicklung"),
    title,
    detail,
    badges: [
      ...(remaining !== null ? [{ label: t("{count} Karten im Stapel", { count: remaining }) }] : []),
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
          label: t("Räuberphase"),
          title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Ritter", "spielst Ritter"),
          detail: t("Die Räuberphase startet sofort."),
          badges: [{ label: t("Ritter"), tone: "warning" }],
          emphasis: "warning",
          autoFocus: true
        }),
        detail: getRobberPlacementInstruction(match, viewerId, event.byPlayerId)
      };
    case "road_building":
      return createBaseNotification(match, event, {
        label: t("Entwicklung"),
        title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Straßenbau", "spielst Straßenbau"),
        detail: t("Es folgen bis zu zwei kostenlose Straßen."),
        badges: [{ label: t("Kostenlose Straßen"), tone: "warning" }]
      });
    case "year_of_plenty": {
      const resources = event.payload.resources.map((resource) => renderResourceLabel(resource));
      return createBaseNotification(match, event, {
        label: t("Entwicklung"),
        title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Erfindung", "spielst Erfindung"),
        detail: resources.length
          ? `${getPlayerPredicate(match, viewerId, event.byPlayerId, "nimmt {resources} aus der Bank", "nimmst {resources} aus der Bank", {
              resources: resources.join(` ${t("und")} `)
            })}.`
          : t("Es werden zwei Rohstoffe aus der Bank genommen."),
        badges: resources.map((resource) => ({ label: resource, tone: "warning" as const })),
        emphasis: "success"
      });
    }
    case "monopoly": {
      const resource = event.payload.resource;
      const total = event.payload.total;
      return createBaseNotification(match, event, {
        label: t("Entwicklung"),
        title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Monopol", "spielst Monopol"),
        detail: resource
          ? `${getPlayerPredicate(
              match,
              viewerId,
              event.byPlayerId,
              "zieht {resource} von allen Mitspielern ein",
              "ziehst {resource} von allen Mitspielern ein",
              { resource: renderResourceLabel(resource) }
            )}.`
          : t("Eine Rohstoffart wird von allen Mitspielern eingezogen."),
        badges: [
          ...(resource ? [{ label: renderResourceLabel(resource), tone: "warning" as const }] : []),
          ...(total !== null ? [{ label: t("{count} Karten", { count: total }) }] : [])
        ],
        emphasis: "warning"
      });
    }
  }

  const _exhaustive: never = event.payload;
  void _exhaustive;
  return createBaseNotification(match, event, {
    label: t("Entwicklung"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "spielt Entwicklung", "spielst Entwicklung"),
    detail: t("Der Entwicklungskarteneffekt ist jetzt aktiv.")
  });
}

function createRobberNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"robber_moved">
): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tileId = event.payload.tileId;
  const tileLabel = tileId ? getTileLabel(match, tileId) : t("ein neues Feld");
  const victimId = getRobberVictimId(context, event);
  const exactResource = getRobberResourceForViewer(context, event, victimId);
  const title = victimId
    ? exactResource
      ? getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "stiehlt {resource} von {player}",
          "stiehlst {resource} von {player}",
          {
            resource: renderResourceLabel(exactResource),
            player: getDisplayPlayerObject(match, viewerId, victimId, "dative")
          }
        )
      : getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "bestiehlt {player}",
          "bestiehlst {player}",
          { player: getDisplayPlayerObject(match, viewerId, victimId, "accusative") }
        )
    : getPlayerPredicate(match, viewerId, event.byPlayerId, "bewegt den Räuber", "bewegst den Räuber");
  const detail = t("Der Räuber blockiert jetzt {tile}.", { tile: tileLabel });

  return createBaseNotification(match, event, {
    label: t("Räuberphase"),
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
      title: t("Räuber versetzt"),
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
  const targetForExchange = toPlayerId ? getDisplayPlayerObject(match, viewerId, toPlayerId, "dative") : t("allen Mitspielern");
  const targetForOffer = toPlayerId ? getDisplayPlayerObject(match, viewerId, toPlayerId, "accusative") : t("alle Mitspieler");
  return createBaseNotification(match, event, {
    label: t("Handel"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "bietet einen Handel an", "bietest einen Handel an"),
    detail: trade
      ? `${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "gibt {give} und möchte {want} von {player}",
          "gibst {give} und möchtest {want} von {player}",
          {
            give: renderResourceMap(trade.give) || t("nichts"),
            want: renderResourceMap(trade.want) || t("nichts"),
            player: targetForExchange
          }
        )}.`
      : t("Das Angebot richtet sich an {target}.", { target: targetForOffer }),
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
    label: t("Handel"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "nimmt einen Handel an", "nimmst einen Handel an"),
    detail: proposerId
      ? t("Das Angebot von {player} wurde abgeschlossen.", {
          player: getDisplayPlayerObject(match, viewerId, proposerId, "dative")
        })
      : t("Ein Handelsangebot wurde abgeschlossen."),
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
    label: t("Handel"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "lehnt einen Handel ab", "lehnst einen Handel ab"),
    detail: proposerName ? t("Das Angebot kam von {player}.", { player: proposerName }) : t("Das Angebot wurde nicht angenommen.")
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
    previousTrade?.toPlayerId ? getDisplayPlayerObject(match, viewerId, previousTrade.toPlayerId, "accusative") : t("alle Mitspieler");
  return createBaseNotification(match, event, {
    label: t("Handel"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "zieht einen Handel zurück", "ziehst einen Handel zurück"),
    detail: t("Das Angebot war für {player}.", { player: targetPlayerName })
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
    label: t("Handel"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "handelt mit dem Hafen", "handelst mit dem Hafen"),
    detail:
      give && giveCount !== null
        ? t("{count} {resource} gegen {receive}.", {
            count: giveCount,
            resource: renderResourceLabel(give),
            receive: receiveSummary || t("nichts")
          })
        : t("Der Hafenhandel wurde ausgeführt."),
    badges: [
      ...(give && giveCount !== null ? [{ label: t("{count} {resource}", { count: giveCount, resource: renderResourceLabel(give) }) }] : []),
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
    label: t("Spielerwechsel"),
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
      title: t("Neuer Zug"),
      detail: t("Die Kamera zeigt wieder das gesamte Spielfeld."),
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
    label: t("Sonderbauphase"),
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
    )}. ${t("Kein Würfeln, kein Spielerhandel, kein Hafenhandel und keine Entwicklungskarte spielen.")}`,
    badges: [
      ...(primaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, primaryPlayerId), playerId: primaryPlayerId, tone: "player" as const }]
        : []),
      ...(builderPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, builderPlayerId), playerId: builderPlayerId, tone: "player" as const }]
        : []),
      { label: t("Kein Würfeln"), tone: "warning" }
    ],
    ...(builderPlayerId ? { accentPlayerId: builderPlayerId } : {}),
    cue: {
      key: `event-${event.id}-special-build`,
      mode: "event",
      title: t("Sonderbauphase"),
      detail: t("Jetzt ist nur Bauen oder Entwicklung kaufen erlaubt."),
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
    label: t("Paired Players"),
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
    )}. ${t("Kein Handel mit Mitspielern.")}`,
    badges: [
      ...(primaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, primaryPlayerId), playerId: primaryPlayerId, tone: "player" as const }]
        : []),
      ...(secondaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, secondaryPlayerId), playerId: secondaryPlayerId, tone: "player" as const }]
        : []),
      { label: t("Kein Spielerhandel"), tone: "warning" }
    ],
    ...(secondaryPlayerId ? { accentPlayerId: secondaryPlayerId } : {}),
    cue: {
      key: `event-${event.id}-paired-player`,
      mode: "event",
      title: t("Paired Players"),
      detail: t("Spieler 2 führt jetzt seine Zusatzaktion aus."),
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
    label: t("Auszeichnung"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "übernimmt die Längste Straße", "übernimmst die Längste Straße"),
    detail: previousPlayerId
      ? `${getPlayerPredicate(match, viewerId, previousPlayerId, "verliert die Auszeichnung", "verlierst die Auszeichnung")} und ${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP", "erhältst 2 öffentliche VP")}.`
      : `${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP für die Längste Straße", "erhältst 2 öffentliche VP für die Längste Straße")}.`,
    badges: [
      ...(length !== null ? [{ label: t("Länge {count}", { count: length }) }] : []),
      ...(publicVictoryPoints !== null ? [{ label: t("Öffentliche VP {count}", { count: publicVictoryPoints }) }] : []),
      { label: t("+{count} VP", { count: 2 }), tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-longest-road-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: t("Längste Straße"),
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
    label: t("Auszeichnung"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "verliert die Längste Straße", "verlierst die Längste Straße"),
    detail: nextPlayerId
      ? `${getPlayerPredicate(match, viewerId, nextPlayerId, "übernimmt die Auszeichnung", "übernimmst die Auszeichnung")}.`
      : t("Die Auszeichnung ist im Moment bei niemandem."),
    badges: [
      ...(length !== null ? [{ label: t("Länge {count}", { count: length }) }] : []),
      ...(publicVictoryPoints !== null ? [{ label: t("Öffentliche VP {count}", { count: publicVictoryPoints }) }] : []),
      { label: t("-{count} VP", { count: 2 }), tone: "warning" }
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
    label: t("Auszeichnung"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "übernimmt die Größte Rittermacht", "übernimmst die Größte Rittermacht"),
    detail: previousPlayerId
      ? `${getPlayerPredicate(match, viewerId, previousPlayerId, "verliert die Auszeichnung", "verlierst die Auszeichnung")} und ${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP", "erhältst 2 öffentliche VP")}.`
      : `${getPlayerPredicate(match, viewerId, event.byPlayerId, "erhält 2 öffentliche VP für die Größte Rittermacht", "erhältst 2 öffentliche VP für die Größte Rittermacht")}.`,
    badges: [
      ...(knightCount !== null ? [{ label: t("Ritter {count}", { count: knightCount }) }] : []),
      ...(publicVictoryPoints !== null ? [{ label: t("Öffentliche VP {count}", { count: publicVictoryPoints }) }] : []),
      { label: t("+{count} VP", { count: 2 }), tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-largest-army-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: t("Größte Rittermacht"),
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
    label: t("Auszeichnung"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "verliert die Größte Rittermacht", "verlierst die Größte Rittermacht"),
    detail: nextPlayerId
      ? `${getPlayerPredicate(match, viewerId, nextPlayerId, "übernimmt die Auszeichnung", "übernimmst die Auszeichnung")}.`
      : t("Die Auszeichnung ist im Moment bei niemandem."),
    badges: [
      ...(knightCount !== null ? [{ label: t("Ritter {count}", { count: knightCount }) }] : []),
      ...(publicVictoryPoints !== null ? [{ label: t("Öffentliche VP {count}", { count: publicVictoryPoints }) }] : []),
      { label: t("-{count} VP", { count: 2 }), tone: "warning" }
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
    label: t("Sieg"),
    title: getPlayerPredicate(match, viewerId, event.byPlayerId, "gewinnt die Partie", "gewinnst die Partie"),
    detail: victoryPoints !== null
      ? `${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "beendet die Partie mit {count} Siegpunkten",
          "beendest die Partie mit {count} Siegpunkten",
          { count: victoryPoints }
        )}.`
      : t("Die Partie ist beendet."),
    badges: victoryPoints !== null ? [{ label: `${victoryPoints} VP`, tone: "warning" }] : [],
    autoFocus: true,
    emphasis: "success"
  });
}

function createFallbackNotification(match: MatchSnapshot, event: MatchEvent): MatchNotification {
  return createBaseNotification(match, event, {
    label: getNotificationLabel(event),
    title: renderEventLabel(event.type),
    detail: t("Zug {turn}.", { turn: event.atTurn })
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
      { label: t("Zug {turn}", { turn: event.atTurn }) }
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
    return count > 0 ? [{ label: t("{count} {resource}", { count, resource: renderResourceLabel(resource) }) }] : [];
  });
}

function summarizeGrantBadges(match: MatchSnapshot, grantsByPlayerId: Record<string, ResourceMap>): BoardFocusBadge[] {
  return Object.entries(grantsByPlayerId).flatMap(([playerId, resourceMap]) => {
    const summary = renderResourceMap(resourceMap);
    return summary
      ? [{
          label: t("{player} +{summary}", { player: getDisplayPlayerName(match, match.you, playerId), summary }),
          playerId,
          tone: "player" as const
        }]
      : [];
  });
}

function summarizeTileLine(match: MatchSnapshot, tileIds: string[], roll: number | null): string {
  if (!tileIds.length) {
    return roll === null ? t("Keine aktiven Felder") : t("Keine aktiven Felder für {roll}", { roll });
  }

  const labels = tileIds
    .map((tileId) => match.board.tiles.find((tile) => tile.id === tileId))
    .filter((tile): tile is MatchSnapshot["board"]["tiles"][number] => !!tile)
    .map((tile) => `${renderResourceLabel(tile.resource)} ${tile.token ?? ""}`.trim());

  return t("Felder {labels}", { labels: labels.join(" / ") });
}

function getTileLabel(match: MatchSnapshot, tileId: string): string {
  const tile = match.board.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return t("ein Feld");
  }

  return `${renderResourceLabel(tile.resource)} ${tile.token ?? ""}`.trim();
}

function getNotificationLabel(event: MatchEvent): string {
  switch (event.type) {
    case "special_build_started":
    case "paired_player_started":
      return t("Spielerwechsel");
    case "turn_ended":
      return t("Spielerwechsel");
    case "dice_rolled":
    case "resources_discarded":
    case "robber_moved":
      return t("Räuberphase");
    case "development_card_bought":
    case "development_card_played":
      return t("Entwicklung");
    case "trade_offered":
    case "trade_completed":
    case "trade_declined":
    case "trade_cancelled":
    case "maritime_trade":
      return t("Handel");
    case "road_built":
    case "settlement_built":
    case "city_built":
      return t("Bau");
    case "longest_road_awarded":
    case "longest_road_lost":
    case "largest_army_awarded":
    case "largest_army_lost":
      return t("Auszeichnung");
    case "game_won":
      return t("Sieg");
    default:
      return t("Live-Geschehen");
  }
}

function renderDevelopmentTypeLabel(type: DevelopmentCardType | null): string {
  switch (type) {
    case "knight":
      return t("Ritter");
    case "victory_point":
      return t("Siegpunkt");
    case "road_building":
      return t("Straßenbau");
    case "year_of_plenty":
      return t("Erfindung");
    case "monopoly":
      return t("Monopol");
    case null:
      return t("Entwicklungskarte");
    default:
      return type;
  }
}

function getDisplayPlayerName(match: MatchSnapshot, viewerId: string, playerId?: string): string {
  if (!playerId) {
    return t("Ein Spieler");
  }

  if (playerId === viewerId) {
    return t("Du");
  }

  return getPlayerById(match, playerId)?.username ?? t("Ein Spieler");
}

function getRobberPlacementInstruction(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined = match.currentPlayerId,
  lowerCaseSelf = false
): string {
  if (!playerId) {
    return t("Jetzt muss ein markiertes Feld für den Räuber gewählt werden.");
  }

  if (playerId === viewerId) {
    return lowerCaseSelf
      ? t("musst du jetzt ein markiertes Feld anklicken und den Räuber setzen.")
      : t("Du musst jetzt ein markiertes Feld anklicken und den Räuber setzen.");
  }

  return t("{player} muss jetzt ein markiertes Feld anklicken und den Räuber setzen.", {
    player: getDisplayPlayerName(match, viewerId, playerId)
  });
}

function getPlayerPredicate(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined,
  thirdPersonPredicate: string,
  secondPersonPredicate = thirdPersonPredicate,
  params?: TranslationParams
): string {
  if (!playerId) {
    return t("{player} {predicate}", { player: t("Ein Spieler"), predicate: t(thirdPersonPredicate, params) });
  }

  if (playerId === viewerId) {
    const predicate =
      secondPersonPredicate === thirdPersonPredicate
        ? tk(`${secondPersonPredicate}__self`, secondPersonPredicate, params)
        : t(secondPersonPredicate, params);
    return t("{player} {predicate}", { player: t("Du"), predicate });
  }

  return t("{player} {predicate}", {
    player: getPlayerById(match, playerId)?.username ?? t("Ein Spieler"),
    predicate: t(thirdPersonPredicate, params)
  });
}

function getDisplayPlayerObject(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined,
  grammaticalCase: "accusative" | "dative" = "accusative"
): string {
  if (!playerId) {
    return grammaticalCase === "dative" ? t("einem Spieler") : t("einen Spieler");
  }

  if (playerId === viewerId) {
    return grammaticalCase === "dative" ? t("dir") : t("dich");
  }

  return getPlayerById(match, playerId)?.username ?? (grammaticalCase === "dative" ? t("einem Spieler") : t("einen Spieler"));
}

function getPlayerById(match: MatchSnapshot, playerId?: string): MatchPlayer | null {
  if (!playerId) {
    return null;
  }

  return match.players.find((player) => player.id === playerId) ?? null;
}

function joinNames(names: string[]): string {
  return formatNameList(names);
}
