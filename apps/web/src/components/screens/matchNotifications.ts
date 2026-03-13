import type { DevelopmentCardType, Locale, MatchSnapshot, Resource, ResourceMap, TradeOfferView } from "@hexagonia/shared";
import { PIRATE_FRAME_TILE_ID, RESOURCES } from "@hexagonia/shared";
import type { BoardFocusBadge, BoardFocusCue } from "../../BoardScene";
import { translate } from "../../i18n";
import {
  renderEventLabel as renderEventLabelByLocale,
  renderResourceLabel as renderResourceLabelByLocale,
  renderResourceMap as renderResourceMapByLocale
} from "../../ui";

type MatchEvent = MatchSnapshot["eventLog"][number];
type MatchEventOf<TType extends MatchEvent["type"]> = Extract<MatchEvent, { type: TType }>;
type MatchPlayer = MatchSnapshot["players"][number];
type TranslationParams = Parameters<typeof translate>[4];

interface NotificationTextHelpers {
  locale: Locale;
  t: (key: string, params?: TranslationParams) => string;
  formatNameList: (names: string[]) => string;
  renderEventLabel: (type: MatchEvent["type"]) => string;
  renderResourceLabel: (resource: Resource | "desert" | string) => string;
  renderResourceMap: (resourceMap: ResourceMap) => string;
}

let activeNotificationTextHelpers = createNotificationTextHelpers("de");

function createNotificationTextHelpers(locale: Locale): NotificationTextHelpers {
  return {
    locale,
    t: (key, params) => translate(locale, key, undefined, undefined, params),
    formatNameList: (names) => formatNameList(locale, names),
    renderEventLabel: (type) => renderEventLabelByLocale(locale, type),
    renderResourceLabel: (resource) => renderResourceLabelByLocale(locale, resource),
    renderResourceMap: (resourceMap) => renderResourceMapByLocale(locale, resourceMap)
  };
}

function t(key: string, params?: TranslationParams): string {
  return activeNotificationTextHelpers.t(key, params);
}

function tx(key: string, params?: TranslationParams): string {
  return t(key, params);
}

function formatNameList(locale: Locale, names: string[]): string {
  if (names.length === 0) {
    return translate(locale, "match.notification.common.none");
  }

  try {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

function renderEventLabel(type: MatchEvent["type"]): string {
  return activeNotificationTextHelpers.renderEventLabel(type);
}

function renderResourceLabel(resource: Resource | "desert" | string): string {
  return activeNotificationTextHelpers.renderResourceLabel(resource);
}

function renderResourceMap(resourceMap: ResourceMap): string {
  return activeNotificationTextHelpers.renderResourceMap(resourceMap);
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
  locale: Locale;
  currentMatch: MatchSnapshot;
  previousMatch: MatchSnapshot | null;
  viewerId: string;
  privateCache: MatchNotificationPrivateCache;
  text: NotificationTextHelpers;
}

export function createEmptyMatchNotificationPrivateCache(): MatchNotificationPrivateCache {
  return {
    developmentCardTypesByEventId: {},
    robberVictimIdsByEventId: {},
    robberResourcesByEventId: {}
  };
}

export function createMatchNotificationState(args: {
  locale: Locale;
  currentMatch: MatchSnapshot;
  previousMatch: MatchSnapshot | null;
  viewerId: string;
  privateCache: MatchNotificationPrivateCache;
}): MatchNotificationState {
  const privateCache = clonePrivateCache(args.privateCache);
  const text = createNotificationTextHelpers(args.locale);
  const previousText = activeNotificationTextHelpers;
  activeNotificationTextHelpers = text;
  const context: NotificationBuildContext = {
    locale: args.locale,
    currentMatch: args.currentMatch,
    previousMatch: args.previousMatch,
    viewerId: args.viewerId,
    privateCache,
    text
  };

  try {
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
  } finally {
    activeNotificationTextHelpers = previousText;
  }
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
    case "ship_built":
    case "ship_moved":
    case "city_built":
    case "robber_moved":
    case "pirate_moved":
    case "harbor_token_placed":
    case "wonder_claimed":
    case "wonder_level_built":
    case "fortress_attacked":
    case "warship_converted":
      return 4;
    case "resources_distributed":
    case "pirate_fleet_moved":
    case "pirate_fleet_attacked":
    case "scenario_reward_claimed":
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
    case "ship_built":
      return createShipBuiltNotification(context.currentMatch, event, context.viewerId);
    case "ship_moved":
      return createShipMovedNotification(context.currentMatch, event, context.viewerId);
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
    case "pirate_moved":
      return createPirateNotification(context.currentMatch, event, context.viewerId);
    case "pirate_fleet_moved":
      return createPirateFleetMovedNotification(context.currentMatch, event);
    case "pirate_fleet_attacked":
      return createPirateFleetAttackedNotification(context.currentMatch, event, context.viewerId);
    case "pirate_seven_stolen":
      return createPirateSevenStolenNotification(context.currentMatch, event, context.viewerId);
    case "gold_resource_chosen":
      return createGoldResourceChosenNotification(context.currentMatch, event, context.viewerId);
    case "scenario_setup_completed":
      return createScenarioSetupCompletedNotification(context.currentMatch, event);
    case "harbor_token_placed":
      return createHarborTokenPlacedNotification(context.currentMatch, event, context.viewerId);
    case "scenario_reward_claimed":
      return createScenarioRewardClaimedNotification(context.currentMatch, event, context.viewerId);
    case "wonder_claimed":
      return createWonderClaimedNotification(context.currentMatch, event, context.viewerId);
    case "wonder_level_built":
      return createWonderLevelBuiltNotification(context.currentMatch, event, context.viewerId);
    case "fortress_attacked":
      return createFortressAttackedNotification(context.currentMatch, event, context.viewerId);
    case "warship_converted":
      return createWarshipConvertedNotification(context.currentMatch, event, context.viewerId);
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
    label: tx("match.notification.label.start"),
    title: getPlayerPredicate(
      match,
      match.you,
      event.byPlayerId,
      "match.notification.predicate.startingPlayerBegins",
      "match.notification.predicate.startingPlayerBegins.self"
    ),
    detail: summary ?? tx("match.notification.startingPlayer.detail.selected"),
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
    return tx("match.notification.startingPlayer.summary.default", { winner: winnerName });
  }

  const contenderCount = lastRound.contenderPlayerIds.length;
  const hasRollOff = event.payload.rounds.length > 1 || contenderCount > 1;

  return hasRollOff
    ? tx("match.notification.startingPlayer.summary.rollOff", { winner: winnerName, total: lastRound.highestTotal })
    : tx("match.notification.startingPlayer.summary.openingRoll", {
        winner: winnerName,
        total: lastRound.highestTotal
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
    label: tx("match.notification.label.match"),
    title: tx("match.notification.matchStarted.title"),
    detail: startingPlayerId
      ? setupMode === "beginner"
        ? tx("match.notification.matchStarted.detail.beginner", {
            detail: getPlayerPredicate(
              match,
              viewerId,
              startingPlayerId,
              "match.notification.predicate.openRound",
              "match.notification.predicate.openRound.self"
            )
          })
        : tx("match.notification.matchStarted.detail.default", {
            detail: getPlayerPredicate(
              match,
              viewerId,
              startingPlayerId,
              "match.notification.predicate.openRound",
              "match.notification.predicate.openRound.self"
            )
          })
      : tx("match.notification.matchStarted.detail.running"),
    badges: [
      { label: tx("match.notification.matchStarted.badge.players", { count: playerCount }) },
      ...(setupMode
        ? [{
            label: setupMode === "beginner"
              ? tx("match.notification.matchStarted.badge.setup.beginner")
              : tx("match.notification.matchStarted.badge.setup.official")
          }]
        : [])
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
    label: initial ? tx("match.notification.label.setup") : tx("match.notification.label.build"),
    title: initial
      ? getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.placeInitialSettlement",
          "match.notification.predicate.placeInitialSettlement.self"
        )
      : getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.buildSettlement",
          "match.notification.predicate.buildSettlement.self"
        ),
    detail: followUp?.detail ??
      (initial
        ? tx("match.notification.settlement.detail.initial")
        : tx("match.notification.settlement.detail.built")),
    ...(followUp ? { badges: followUp.badges } : {}),
    ...(followUp?.accentPlayerId ? { accentPlayerId: followUp.accentPlayerId } : {}),
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: initial
        ? tx("match.notification.settlement.cue.title.initial")
        : tx("match.notification.settlement.cue.title.built"),
      detail: tx("match.notification.settlement.cue.detail"),
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
    ? getPlayerPredicate(
        match,
        match.you,
        event.byPlayerId,
        "match.notification.predicate.placeInitialRoad",
        "match.notification.predicate.placeInitialRoad.self"
      )
    : freeBuild
      ? getPlayerPredicate(
          match,
          match.you,
          event.byPlayerId,
          "match.notification.predicate.placeFreeRoad",
          "match.notification.predicate.placeFreeRoad.self"
        )
      : getPlayerPredicate(
          match,
          match.you,
          event.byPlayerId,
          "match.notification.predicate.buildRoad",
          "match.notification.predicate.buildRoad.self"
        );
  const detail = initial
    ? tx("match.notification.road.detail.marked")
    : freeBuild
      ? tx("match.notification.road.detail.freeBuild")
      : tx("match.notification.road.detail.marked");
  const detailText = followUp?.detail ?? detail;

  return createBaseNotification(match, event, {
    label: initial ? tx("match.notification.label.setup") : tx("match.notification.label.build"),
    title,
    detail: detailText,
    ...(followUp ? { badges: followUp.badges } : {}),
    ...(followUp?.accentPlayerId ? { accentPlayerId: followUp.accentPlayerId } : {}),
    cue: {
      key: `event-${event.id}-${edgeId}`,
      mode: "event",
      title: tx("match.notification.road.cue.title"),
      detail: tx("match.notification.road.cue.detail"),
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    },
    autoFocus: true
  });
}

function createShipBuiltNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"ship_built">,
  viewerId: string
): MatchNotification {
  const { edgeId, routeType, freeBuild } = event.payload;
  const routeKey = routeType === "warship" ? "warship" : "ship";
  const titleKey = `match.notification.shipBuilt.title.${freeBuild ? "free" : "paid"}.${routeKey}`;
  const detailKey =
    routeType === "warship"
      ? "match.notification.shipBuilt.detail.warship"
      : freeBuild
        ? "match.notification.shipBuilt.detail.free"
        : "match.notification.shipBuilt.detail.paid";

  return createBaseNotification(match, event, {
    label: tx("match.notification.label.build"),
    title: getPlayerPredicateByKey(match, viewerId, event.byPlayerId, titleKey, `${titleKey}.self`),
    detail: tx(detailKey),
    badges: [
      { label: renderRouteLabel(routeType) },
      ...(freeBuild ? [{ label: tx("match.notification.badge.free"), tone: "warning" as const }] : [])
    ],
    cue: {
      key: `event-${event.id}-${edgeId}`,
      mode: "event",
      title: tx(`match.notification.shipBuilt.cue.title.${routeKey}`),
      detail: tx("match.notification.shipBuilt.cue.detail"),
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    },
    autoFocus: true
  });
}

function createShipMovedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"ship_moved">,
  viewerId: string
): MatchNotification {
  const { fromEdgeId, toEdgeId } = event.payload;
  const routeType = match.board.edges.find((edge) => edge.id === toEdgeId)?.routeType ?? "ship";
  const routeKey = routeType === "warship" ? "warship" : "ship";
  const titleKey = `match.notification.shipMoved.title.${routeKey}`;

  return createBaseNotification(match, event, {
    label: tx("match.notification.label.build"),
    title: getPlayerPredicateByKey(match, viewerId, event.byPlayerId, titleKey, `${titleKey}.self`),
    detail: tx("match.notification.shipMoved.detail"),
    badges: [{ label: renderRouteLabel(routeType) }],
    cue: {
      key: `event-${event.id}-${fromEdgeId}-${toEdgeId}`,
      mode: "event",
      title: tx(`match.notification.shipMoved.cue.title.${routeKey}`),
      detail: tx("match.notification.shipMoved.cue.detail"),
      vertexIds: [],
      edgeIds: [fromEdgeId, toEdgeId],
      tileIds: [],
      scale: "wide"
    },
    autoFocus: true
  });
}

function createPirateNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"pirate_moved">,
  viewerId: string
): MatchNotification {
  const { tileId, targetPlayerId, stealType } = event.payload;
  const movedToFrame = tileId === PIRATE_FRAME_TILE_ID;
  const tileLabel = getTileLabel(match, tileId);
  const title =
    targetPlayerId && stealType === "cloth"
      ? getPlayerPredicateByKey(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.pirateMoved.title.cloth",
          "match.notification.pirateMoved.title.cloth.self",
          { player: getDisplayPlayerObject(match, viewerId, targetPlayerId, "dative") }
        )
      : targetPlayerId
        ? getPlayerPredicateByKey(
            match,
            viewerId,
            event.byPlayerId,
            "match.notification.pirateMoved.title.resource",
            "match.notification.pirateMoved.title.resource.self",
            { player: getDisplayPlayerObject(match, viewerId, targetPlayerId, "accusative") }
          )
        : getPlayerPredicateByKey(
            match,
            viewerId,
            event.byPlayerId,
            "match.notification.pirateMoved.title.move",
            "match.notification.pirateMoved.title.move.self"
          );

  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title,
    detail: movedToFrame
      ? tx("match.notification.pirateMoved.detailFrame")
      : tx("match.notification.pirateMoved.detail", { tile: tileLabel }),
    badges: [
      ...(targetPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, targetPlayerId), playerId: targetPlayerId, tone: "player" as const }]
        : []),
      ...(stealType ? [{ label: renderPirateStealTypeLabel(stealType), tone: "warning" as const }] : []),
      ...(tileLabel ? [{ label: tileLabel }] : [])
    ],
    cue: movedToFrame
      ? null
      : {
          key: `event-${event.id}-${tileId ?? "pirate"}`,
          mode: "event",
          title: tx("match.notification.pirateMoved.cue.title"),
          detail: tx("match.notification.pirateMoved.cue.detail"),
          vertexIds: [],
          edgeIds: [],
          tileIds: tileId ? [tileId] : [],
          scale: "wide"
        },
    autoFocus: true,
    emphasis: "warning"
  });
}

function createPirateFleetMovedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"pirate_fleet_moved">
): MatchNotification {
  const tileLabel = getTileLabel(match, event.payload.tileId);
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: tx("match.notification.pirateFleetMoved.title"),
    detail: tx("match.notification.pirateFleetMoved.detail", { tile: tileLabel }),
    badges: [
      { label: tx("match.notification.badge.strength", { count: event.payload.strength }) },
      { label: tx("match.notification.badge.distance", { count: event.payload.distance }) },
      ...(tileLabel ? [{ label: tileLabel }] : [])
    ],
    cue: {
      key: `event-${event.id}-${event.payload.tileId}`,
      mode: "event",
      title: tx("match.notification.pirateFleetMoved.cue.title"),
      detail: tx("match.notification.pirateFleetMoved.cue.detail"),
      vertexIds: [],
      edgeIds: [],
      tileIds: [event.payload.tileId],
      scale: "wide"
    },
    autoFocus: true,
    emphasis: "warning"
  });
}

function createPirateFleetAttackedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"pirate_fleet_attacked">,
  viewerId: string
): MatchNotification {
  const { tileId, targetPlayerId, pirateStrength, playerStrength, outcome, discardCount } = event.payload;
  const titleKey =
    outcome === "won"
      ? "match.notification.pirateFleetAttacked.title.won"
      : outcome === "lost"
        ? "match.notification.pirateFleetAttacked.title.lost"
        : "match.notification.pirateFleetAttacked.title.tied";
  const detail =
    outcome === "won"
      ? tx("match.notification.pirateFleetAttacked.detail.won")
      : outcome === "lost"
        ? discardCount
          ? tx("match.notification.pirateFleetAttacked.detail.lost.discard", {
              player: getDisplayPlayerName(match, viewerId, targetPlayerId),
              count: discardCount
            })
          : tx("match.notification.pirateFleetAttacked.detail.lost")
        : tx("match.notification.pirateFleetAttacked.detail.tied");

  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: getPlayerPredicateByKey(match, viewerId, targetPlayerId, titleKey, `${titleKey}.self`),
    detail,
    badges: [
      ...(targetPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, targetPlayerId), playerId: targetPlayerId, tone: "player" as const }]
        : []),
      { label: tx("match.notification.badge.pirates", { count: pirateStrength }) },
      { label: tx("match.notification.badge.warships", { count: playerStrength }) },
      ...(discardCount
        ? [{ label: tx("match.notification.badge.discard", { count: discardCount }), tone: "warning" as const }]
        : [])
    ],
    cue: {
      key: `event-${event.id}-${tileId}`,
      mode: "event",
      title: tx("match.notification.pirateFleetAttacked.cue.title"),
      detail,
      vertexIds: [],
      edgeIds: [],
      tileIds: [tileId],
      scale: "wide"
    },
    autoFocus: true,
    emphasis: outcome === "lost" ? "warning" : outcome === "won" ? "success" : "neutral"
  });
}

function createPirateSevenStolenNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"pirate_seven_stolen">,
  viewerId: string
): MatchNotification {
  const targetPlayerId = event.payload.targetPlayerId;
  return createBaseNotification(match, event, {
    label: tx("match.pirateIslandsSeven.title"),
    title: getPlayerPredicateByKey(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.pirateSevenStolen.title",
      "match.notification.pirateSevenStolen.title.self",
      { player: getDisplayPlayerObject(match, viewerId, targetPlayerId, "dative") }
    ),
    detail: tx("match.notification.pirateSevenStolen.detail"),
    badges: targetPlayerId
      ? [{ label: getDisplayPlayerName(match, viewerId, targetPlayerId), playerId: targetPlayerId, tone: "player" }]
      : [],
    emphasis: "warning"
  });
}

function createGoldResourceChosenNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"gold_resource_chosen">,
  viewerId: string
): MatchNotification {
  const reward = createResourceMapFromSelection(event.payload.resources);
  const rewardSummary = renderResourceMap(reward);
  return createBaseNotification(match, event, {
    label: tx("match.goldChoice.title"),
    title: getPlayerPredicateByKey(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.goldResourceChosen.title",
      "match.notification.goldResourceChosen.title.self"
    ),
    detail: rewardSummary
      ? tx("match.notification.goldResourceChosen.detail.withResources", { resources: rewardSummary })
      : tx("match.notification.goldResourceChosen.detail.done"),
    badges: buildResourceBadges(reward),
    emphasis: "success"
  });
}

function createScenarioSetupCompletedNotification(
  _match: MatchSnapshot,
  event: MatchEventOf<"scenario_setup_completed">
): MatchNotification {
  return createBaseNotification(_match, event, {
    label: tx("match.notification.label.scenario"),
    title: renderEventLabel(event.type),
    detail:
      event.payload.scenarioId === "seafarers.new_world"
        ? tx("match.notification.scenarioSetupCompleted.detail.newWorld")
        : tx("match.notification.scenarioSetupCompleted.detail.default"),
    emphasis: "success"
  });
}

function createHarborTokenPlacedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"harbor_token_placed">,
  viewerId: string
): MatchNotification {
  const harborLabel = renderHarborTypeLabel(event.payload.portType);
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: getPlayerPredicateByKey(match, viewerId, event.byPlayerId, "match.notification.harborTokenPlaced.title"),
    detail: tx("match.notification.harborTokenPlaced.detail", { harbor: harborLabel }),
    badges: [{ label: harborLabel }],
    cue: {
      key: `event-${event.id}-${event.payload.vertexId}`,
      mode: "event",
      title: tx("match.notification.harborTokenPlaced.cue.title"),
      detail: tx("match.notification.harborTokenPlaced.cue.detail"),
      vertexIds: [event.payload.vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createScenarioRewardClaimedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"scenario_reward_claimed">,
  viewerId: string
): MatchNotification {
  const reward = describeScenarioReward(match, event);
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: getPlayerPredicateByKey(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.scenarioRewardClaimed.title",
      "match.notification.scenarioRewardClaimed.title.self",
      { reward: reward.label }
    ),
    detail: reward.detail,
    badges: reward.badges,
    ...(reward.cue ? { cue: reward.cue, autoFocus: true } : {}),
    emphasis: "success"
  });
}

function createWonderClaimedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"wonder_claimed">,
  viewerId: string
): MatchNotification {
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: getPlayerPredicateByKey(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.wonderClaimed.title",
      "match.notification.wonderClaimed.title.self"
    ),
    detail: tx("match.notification.wonderClaimed.detail"),
    cue: {
      key: `event-${event.id}-${event.payload.vertexId}`,
      mode: "event",
      title: tx("match.notification.wonderClaimed.cue.title"),
      detail: tx("match.notification.wonderClaimed.cue.detail"),
      vertexIds: [event.payload.vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createWonderLevelBuiltNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"wonder_level_built">,
  viewerId: string
): MatchNotification {
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: getPlayerPredicateByKey(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.wonderLevelBuilt.title",
      "match.notification.wonderLevelBuilt.title.self"
    ),
    detail:
      event.payload.level >= 4
        ? tx("match.notification.wonderLevelBuilt.detail.complete")
        : tx("match.notification.wonderLevelBuilt.detail.level", { count: event.payload.level }),
    badges: [{ label: tx("match.notification.badge.level", { count: event.payload.level }) }],
    cue: {
      key: `event-${event.id}-${event.payload.vertexId}`,
      mode: "event",
      title: tx("match.notification.wonderLevelBuilt.cue.title"),
      detail: tx("match.notification.wonderLevelBuilt.cue.detail"),
      vertexIds: [event.payload.vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    },
    autoFocus: true,
    emphasis: "success"
  });
}

function createFortressAttackedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"fortress_attacked">,
  viewerId: string
): MatchNotification {
  const site = getSiteAtVertex(match, event.payload.vertexId, "fortress");
  const titleKey = site?.captured
    ? "match.notification.fortressAttacked.title.captured"
    : event.payload.defeated
      ? "match.notification.fortressAttacked.title.hit"
      : "match.notification.fortressAttacked.title.failed";
  const detail = site?.captured
    ? tx("match.notification.fortressAttacked.detail.captured")
    : event.payload.defeated
      ? site
        ? tx("match.notification.fortressAttacked.detail.hit.remaining", { count: site.pirateLairCount })
        : tx("match.notification.fortressAttacked.detail.hit.default")
      : tx("match.notification.fortressAttacked.detail.failed", { count: event.payload.strength });

  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: getPlayerPredicateByKey(match, viewerId, event.byPlayerId, titleKey, `${titleKey}.self`),
    detail,
    badges: [
      { label: tx("match.notification.badge.roll", { count: event.payload.strength }) },
      ...(site?.captured
        ? [{ label: tx("match.notification.badge.captured"), tone: "warning" as const }]
        : site
          ? [{ label: tx("match.notification.badge.lairs", { count: site.pirateLairCount }) }]
          : [])
    ],
    cue: {
      key: `event-${event.id}-${event.payload.vertexId}`,
      mode: "event",
      title: tx("match.notification.fortressAttacked.cue.title"),
      detail,
      vertexIds: [event.payload.vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    },
    autoFocus: true,
    emphasis: event.payload.defeated ? "success" : "warning"
  });
}

function createWarshipConvertedNotification(
  match: MatchSnapshot,
  event: MatchEventOf<"warship_converted">,
  viewerId: string
): MatchNotification {
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.scenario"),
    title: getPlayerPredicateByKey(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.warshipConverted.title",
      "match.notification.warshipConverted.title.self"
    ),
    detail: tx("match.notification.warshipConverted.detail"),
    badges: [{ label: renderRouteLabel("warship") }],
    cue: {
      key: `event-${event.id}-${event.payload.edgeId}`,
      mode: "event",
      title: tx("match.notification.warshipConverted.cue.title"),
      detail: tx("match.notification.warshipConverted.cue.detail"),
      vertexIds: [],
      edgeIds: [event.payload.edgeId],
      tileIds: [],
      scale: "medium"
    },
    autoFocus: true,
    emphasis: "success"
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
        ? tx("match.notification.followUp.initialSettlement.self")
        : tx("match.notification.followUp.initialSettlement.other", { player: nextPlayerName }),
    badges: [
      { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
      { label: tx("match.notification.followUp.badge.initialRoad") }
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
          ? tx("match.notification.followUp.initialRoad.complete.self")
          : tx("match.notification.followUp.initialRoad.complete.other", {
              player: nextPlayerName
            }),
      badges: [
        { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
        { label: tx("match.notification.followUp.badge.roll") }
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
          ? tx("match.notification.followUp.initialRoad.reverse.self")
          : tx("match.notification.followUp.initialRoad.samePlayer.self")
        : reverseStarted
          ? tx("match.notification.followUp.initialRoad.reverse.other", { player: nextPlayerName })
          : tx("match.notification.followUp.initialRoad.samePlayer.other", { player: nextPlayerName });
  } else {
    detail =
      nextPlayerId === viewerId
        ? tx("match.notification.followUp.initialRoad.nextPlayer.self")
        : tx("match.notification.followUp.initialRoad.nextPlayer.other", {
            player: nextPlayerName
          });
  }

  return {
    detail,
    badges: [
      { label: nextPlayerName, playerId: nextPlayerId, tone: "player" },
      { label: reverseStarted
          ? tx("match.notification.followUp.badge.reverseRound")
          : tx("match.notification.followUp.badge.initialSettlement") }
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
    label: tx("match.notification.label.build"),
    title: getPlayerPredicate(
      match,
      match.you,
      event.byPlayerId,
      "match.notification.predicate.buildCity",
      "match.notification.predicate.buildCity.self"
    ),
    detail: tx("match.notification.city.detail"),
    cue: {
      key: `event-${event.id}-${vertexId}`,
      mode: "event",
      title: tx("match.notification.city.cue.title"),
      detail: tx("match.notification.city.cue.detail"),
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
    label: tx("match.notification.label.setup"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.gainInitialResources",
      "match.notification.predicate.gainInitialResources.self"
    ),
    detail: renderResourceMap(resources) || tx("match.notification.initialResources.detail.none"),
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
    ? tx("match.notification.discard.detail.pending", { players: joinNames(remainingPlayers) })
    : tx("match.notification.discard.detail.done");
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.robber"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.discardCards",
      "match.notification.predicate.discardCards.self",
      { count: count ?? "?" }
    ),
    detail,
    badges: count === null ? [] : [{ label: tx("match.notification.discard.badge.cards", { count }) }],
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
      ? tx("match.notification.dice.seven.detail.pending", {
          count: pendingPlayers,
          detail: getRobberPlacementInstruction(match, match.you, match.currentPlayerId, true)
        })
      : getRobberPlacementInstruction(match, match.you);
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.robber"),
    title: getPlayerPredicate(
      match,
      match.you,
      event.byPlayerId,
      "match.notification.predicate.rollSeven",
      "match.notification.predicate.rollSeven.self"
    ),
    detail,
    badges: [
      ...(dice ? [{ label: tx("match.notification.dice.badge.sevenRoll", { first: dice[0], second: dice[1] }) }] : []),
      { label: tx("match.notification.dice.badge.robberActive"), tone: "warning" },
      { label: tx("match.notification.dice.badge.chooseTile"), tone: "warning" }
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
      ? tx("match.notification.distribution.detail.granted")
      : tileIds.length > 0
        ? tx("match.notification.distribution.detail.blocked")
        : tx("match.notification.distribution.detail.none");

  return createBaseNotification(match, event, {
    label: tx("match.notification.label.roll"),
    title: getPlayerPredicate(
      match,
      match.you,
      event.byPlayerId,
      "match.notification.predicate.rollNumber",
      "match.notification.predicate.rollNumber.self",
      { roll: roll ?? "?" }
    ),
    detail,
    badges: [
      ...(dice && roll !== null
        ? [{ label: tx("match.notification.dice.badge.roll", { first: dice[0], second: dice[1], roll }) }]
        : []),
      ...(tileLine ? [{ label: tileLine }] : []),
      ...grantBadges,
      ...blockedResources.map((resource) => ({
        label: tx("match.notification.distribution.badge.blocked", { resource: renderResourceLabel(resource) }),
        tone: "warning" as const
      }))
    ],
    cue: {
      key: `event-${event.id}-distribution-${roll ?? "x"}-${tileIds.join(",")}`,
      mode: "event",
      title: tx("match.notification.distribution.cue.title", { roll: roll ?? "?" }),
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
    ? tx("match.notification.developmentBought.title.selfReveal", { card: renderDevelopmentTypeLabel(cardType) })
    : getPlayerPredicate(
        context.currentMatch,
        viewerId,
        event.byPlayerId,
        "match.notification.predicate.buyDevelopmentCard",
        "match.notification.predicate.buyDevelopmentCard.self"
      );
  const detail =
    cardType && isViewerActor
      ? tx("match.notification.developmentBought.detail.selfReveal", { card: renderDevelopmentTypeLabel(cardType) })
      : isViewerActor
        ? tx("match.notification.developmentBought.detail.self")
        : tx("match.notification.developmentBought.detail.hidden");
  return createBaseNotification(context.currentMatch, event, {
    label: tx("match.notification.label.development"),
    title,
    detail,
    badges: [
      ...(remaining !== null ? [{ label: tx("match.notification.developmentBought.badge.remaining", { count: remaining }) }] : []),
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
          label: tx("match.notification.label.robber"),
          title: getPlayerPredicate(
            match,
            viewerId,
            event.byPlayerId,
            "match.notification.predicate.playKnight",
            "match.notification.predicate.playKnight.self"
          ),
          detail: tx("match.notification.developmentPlayed.knight.detail"),
          badges: [{ label: tx("match.notification.developmentType.knight"), tone: "warning" }],
          emphasis: "warning",
          autoFocus: true
        }),
        detail: getRobberPlacementInstruction(match, viewerId, event.byPlayerId)
      };
    case "road_building":
      return createBaseNotification(match, event, {
        label: tx("match.notification.label.development"),
        title: getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.playRoadBuilding",
          "match.notification.predicate.playRoadBuilding.self"
        ),
        detail: tx("match.notification.developmentPlayed.roadBuilding.detail"),
        badges: [{ label: tx("match.notification.developmentPlayed.roadBuilding.badge"), tone: "warning" }]
      });
    case "year_of_plenty": {
      const resources = event.payload.resources.map((resource) => renderResourceLabel(resource));
      return createBaseNotification(match, event, {
        label: tx("match.notification.label.development"),
        title: getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.playYearOfPlenty",
          "match.notification.predicate.playYearOfPlenty.self"
        ),
        detail: resources.length
          ? `${getPlayerPredicate(
              match,
              viewerId,
              event.byPlayerId,
              "match.notification.predicate.takeResourcesFromBank",
              "match.notification.predicate.takeResourcesFromBank.self",
              {
                resources: resources.join(` ${tx("match.notification.common.and")} `)
              }
            )}.`
          : tx("match.notification.developmentPlayed.yearOfPlenty.detail.default"),
        badges: resources.map((resource) => ({ label: resource, tone: "warning" as const })),
        emphasis: "success"
      });
    }
    case "monopoly": {
      const resource = event.payload.resource;
      const total = event.payload.total;
      return createBaseNotification(match, event, {
        label: tx("match.notification.label.development"),
        title: getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.playMonopoly",
          "match.notification.predicate.playMonopoly.self"
        ),
        detail: resource
          ? `${getPlayerPredicate(
              match,
              viewerId,
              event.byPlayerId,
              "match.notification.predicate.takeResourceFromAllPlayers",
              "match.notification.predicate.takeResourceFromAllPlayers.self",
              { resource: renderResourceLabel(resource) }
            )}.`
          : tx("match.notification.developmentPlayed.monopoly.detail.default"),
        badges: [
          ...(resource ? [{ label: renderResourceLabel(resource), tone: "warning" as const }] : []),
          ...(total !== null ? [{ label: tx("match.notification.discard.badge.cards", { count: total }) }] : [])
        ],
        emphasis: "warning"
      });
    }
  }

  const _exhaustive: never = event.payload;
  void _exhaustive;
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.development"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.playDevelopment",
      "match.notification.predicate.playDevelopment.self"
    ),
    detail: tx("match.notification.developmentPlayed.default.detail")
  });
}

function createRobberNotification(
  context: NotificationBuildContext,
  event: MatchEventOf<"robber_moved">
): MatchNotification {
  const match = context.currentMatch;
  const viewerId = context.viewerId;
  const tileId = event.payload.tileId;
  const tileLabel = tileId ? getTileLabel(match, tileId) : tx("match.notification.common.newTile");
  const victimId = getRobberVictimId(context, event);
  const exactResource = getRobberResourceForViewer(context, event, victimId);
  const title = victimId
    ? exactResource
      ? getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.robberStealResource",
          "match.notification.predicate.robberStealResource.self",
          {
            resource: renderResourceLabel(exactResource),
            player: getDisplayPlayerObject(match, viewerId, victimId, "dative")
          }
        )
      : getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.robberStealPlayer",
          "match.notification.predicate.robberStealPlayer.self",
          { player: getDisplayPlayerObject(match, viewerId, victimId, "accusative") }
        )
    : getPlayerPredicate(
        match,
        viewerId,
        event.byPlayerId,
        "match.notification.predicate.moveRobber",
        "match.notification.predicate.moveRobber.self"
      );
  const detail = tx("match.notification.robber.detail", { tile: tileLabel });

  return createBaseNotification(match, event, {
    label: tx("match.notification.label.robber"),
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
      title: tx("match.notification.robber.cue.title"),
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
  const targetForExchange = toPlayerId
    ? getDisplayPlayerObject(match, viewerId, toPlayerId, "dative")
    : tx("match.notification.trade.target.all.dative");
  const targetForOffer = toPlayerId
    ? getDisplayPlayerObject(match, viewerId, toPlayerId, "accusative")
    : tx("match.notification.trade.target.all.accusative");
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.trade"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.offerTrade",
      "match.notification.predicate.offerTrade.self"
    ),
    detail: trade
      ? `${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.offerTradeTerms",
          "match.notification.predicate.offerTradeTerms.self",
          {
            give: renderResourceMap(trade.give) || tx("match.notification.trade.nothing"),
            want: renderResourceMap(trade.want) || tx("match.notification.trade.nothing"),
            player: targetForExchange
          }
        )}.`
      : tx("match.notification.tradeOffered.detail.target", { target: targetForOffer }),
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
    label: tx("match.notification.label.trade"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.acceptTrade",
      "match.notification.predicate.acceptTrade.self"
    ),
    detail: proposerId
      ? tx("match.notification.tradeCompleted.detail.byPlayer", {
          player: getDisplayPlayerObject(match, viewerId, proposerId, "dative")
        })
      : tx("match.notification.tradeCompleted.detail.default"),
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
    label: tx("match.notification.label.trade"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.declineTrade",
      "match.notification.predicate.declineTrade.self"
    ),
    detail: proposerName
      ? tx("match.notification.tradeDeclined.detail.byPlayer", { player: proposerName })
      : tx("match.notification.tradeDeclined.detail.default")
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
    previousTrade?.toPlayerId
      ? getDisplayPlayerObject(match, viewerId, previousTrade.toPlayerId, "accusative")
      : tx("match.notification.trade.target.all.accusative");
  return createBaseNotification(match, event, {
    label: tx("match.notification.label.trade"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.cancelTrade",
      "match.notification.predicate.cancelTrade.self"
    ),
    detail: tx("match.notification.tradeCancelled.detail", { player: targetPlayerName })
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
    label: tx("match.notification.label.trade"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.maritimeTrade",
      "match.notification.predicate.maritimeTrade.self"
    ),
    detail:
      give && giveCount !== null
        ? tx("match.notification.maritimeTrade.detail.exchange", {
            count: giveCount,
            resource: renderResourceLabel(give),
            receive: receiveSummary || tx("match.notification.trade.nothing")
          })
        : tx("match.notification.maritimeTrade.detail.default"),
    badges: [
      ...(give && giveCount !== null
        ? [{ label: tx("match.notification.common.resourceCount", { count: giveCount, resource: renderResourceLabel(give) }) }]
        : []),
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
    label: tx("match.notification.label.turn"),
    title: getPlayerPredicate(
      match,
      viewerId,
      nextPlayerId,
      "match.notification.predicate.turnActive",
      "match.notification.predicate.turnActive.self"
    ),
    detail: `${getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.endTurn",
      "match.notification.predicate.endTurn.self"
    )}. ${getPlayerPredicate(
      match,
      viewerId,
      nextPlayerId,
      "match.notification.predicate.startRoll",
      "match.notification.predicate.startRoll.self"
    )}.`,
    badges: [
      ...(event.byPlayerId ? [{ label: getDisplayPlayerName(match, viewerId, event.byPlayerId), playerId: event.byPlayerId, tone: "player" as const }] : []),
      ...(nextPlayerId ? [{ label: getDisplayPlayerName(match, viewerId, nextPlayerId), playerId: nextPlayerId, tone: "player" as const }] : [])
    ],
    ...(nextPlayerId ? { accentPlayerId: nextPlayerId } : {}),
    cue: {
      key: `event-${event.id}-turn-overview`,
      mode: "event",
      title: tx("match.notification.turnEnded.cue.title"),
      detail: tx("match.notification.turnEnded.cue.detail"),
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
    label: tx("match.notification.label.specialBuild"),
    title: getPlayerPredicate(
      match,
      viewerId,
      builderPlayerId,
      "match.notification.predicate.specialBuildTurn",
      "match.notification.predicate.specialBuildTurn.self"
    ),
    detail: `${getPlayerPredicate(
      match,
      viewerId,
      primaryPlayerId,
      "match.notification.predicate.specialBuildPrimaryEnded",
      "match.notification.predicate.specialBuildPrimaryEnded.self"
    )}. ${getPlayerPredicate(
      match,
      viewerId,
      builderPlayerId,
      "match.notification.predicate.specialBuildMayBuild",
      "match.notification.predicate.specialBuildMayBuild.self"
    )}. ${tx("match.notification.specialBuild.detail.restriction")}`,
    badges: [
      ...(primaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, primaryPlayerId), playerId: primaryPlayerId, tone: "player" as const }]
        : []),
      ...(builderPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, builderPlayerId), playerId: builderPlayerId, tone: "player" as const }]
        : []),
      { label: tx("match.notification.specialBuild.badge.noRoll"), tone: "warning" }
    ],
    ...(builderPlayerId ? { accentPlayerId: builderPlayerId } : {}),
    cue: {
      key: `event-${event.id}-special-build`,
      mode: "event",
      title: tx("match.notification.specialBuild.cue.title"),
      detail: tx("match.notification.specialBuild.cue.detail"),
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
    label: tx("match.notification.label.pairedPlayers"),
    title: getPlayerPredicate(
      match,
      viewerId,
      secondaryPlayerId,
      "match.notification.predicate.pairedPlayerTurn",
      "match.notification.predicate.pairedPlayerTurn.self"
    ),
    detail: `${getPlayerPredicate(
      match,
      viewerId,
      primaryPlayerId,
      "match.notification.predicate.pairedPrimaryEnded",
      "match.notification.predicate.pairedPrimaryEnded.self"
    )}. ${getPlayerPredicate(
      match,
      viewerId,
      secondaryPlayerId,
      "match.notification.predicate.pairedPlayerMayAct",
      "match.notification.predicate.pairedPlayerMayAct.self"
    )}. ${tx("match.notification.pairedPlayers.detail.restriction")}`,
    badges: [
      ...(primaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, primaryPlayerId), playerId: primaryPlayerId, tone: "player" as const }]
        : []),
      ...(secondaryPlayerId
        ? [{ label: getDisplayPlayerName(match, viewerId, secondaryPlayerId), playerId: secondaryPlayerId, tone: "player" as const }]
        : []),
      { label: tx("match.notification.pairedPlayers.badge.noPlayerTrade"), tone: "warning" }
    ],
    ...(secondaryPlayerId ? { accentPlayerId: secondaryPlayerId } : {}),
    cue: {
      key: `event-${event.id}-paired-player`,
      mode: "event",
      title: tx("match.notification.pairedPlayers.cue.title"),
      detail: tx("match.notification.pairedPlayers.cue.detail"),
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
    label: tx("match.notification.label.award"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.takeLongestRoad",
      "match.notification.predicate.takeLongestRoad.self"
    ),
    detail: previousPlayerId
      ? `${getPlayerPredicate(
          match,
          viewerId,
          previousPlayerId,
          "match.notification.predicate.loseAward",
          "match.notification.predicate.loseAward.self"
        )} und ${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.gainTwoPublicVictoryPoints",
          "match.notification.predicate.gainTwoPublicVictoryPoints.self"
        )}.`
      : `${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.gainLongestRoadVictoryPoints",
          "match.notification.predicate.gainLongestRoadVictoryPoints.self"
        )}.`,
    badges: [
      ...(length !== null ? [{ label: tx("match.notification.award.badge.length", { count: length }) }] : []),
      ...(publicVictoryPoints !== null
        ? [{ label: tx("match.notification.award.badge.publicVictoryPoints", { count: publicVictoryPoints }) }]
        : []),
      { label: tx("match.notification.award.badge.gainVictoryPoints", { count: 2 }), tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-longest-road-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: tx("match.notification.longestRoad.cue.title"),
      detail: `${getPlayerPredicate(
        match,
        viewerId,
        event.byPlayerId,
        "match.notification.predicate.leadLongestRoad",
        "match.notification.predicate.leadLongestRoad.self"
      )}.`,
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
    label: tx("match.notification.label.award"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.loseLongestRoad",
      "match.notification.predicate.loseLongestRoad.self"
    ),
    detail: nextPlayerId
      ? `${getPlayerPredicate(
          match,
          viewerId,
          nextPlayerId,
          "match.notification.predicate.takeAward",
          "match.notification.predicate.takeAward.self"
        )}.`
      : tx("match.notification.award.detail.unclaimed"),
    badges: [
      ...(length !== null ? [{ label: tx("match.notification.award.badge.length", { count: length }) }] : []),
      ...(publicVictoryPoints !== null
        ? [{ label: tx("match.notification.award.badge.publicVictoryPoints", { count: publicVictoryPoints }) }]
        : []),
      { label: tx("match.notification.award.badge.loseVictoryPoints", { count: 2 }), tone: "warning" }
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
    label: tx("match.notification.label.award"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.takeLargestArmy",
      "match.notification.predicate.takeLargestArmy.self"
    ),
    detail: previousPlayerId
      ? `${getPlayerPredicate(
          match,
          viewerId,
          previousPlayerId,
          "match.notification.predicate.loseAward",
          "match.notification.predicate.loseAward.self"
        )} und ${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.gainTwoPublicVictoryPoints",
          "match.notification.predicate.gainTwoPublicVictoryPoints.self"
        )}.`
      : `${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.gainLargestArmyVictoryPoints",
          "match.notification.predicate.gainLargestArmyVictoryPoints.self"
        )}.`,
    badges: [
      ...(knightCount !== null ? [{ label: tx("match.notification.largestArmy.badge.knights", { count: knightCount }) }] : []),
      ...(publicVictoryPoints !== null
        ? [{ label: tx("match.notification.award.badge.publicVictoryPoints", { count: publicVictoryPoints }) }]
        : []),
      { label: tx("match.notification.award.badge.gainVictoryPoints", { count: 2 }), tone: "warning" }
    ],
    cue: {
      key: `event-${event.id}-largest-army-${event.byPlayerId ?? "player"}`,
      mode: "event",
      title: tx("match.notification.largestArmy.cue.title"),
      detail: `${getPlayerPredicate(
        match,
        viewerId,
        event.byPlayerId,
        "match.notification.predicate.leadLargestArmy",
        "match.notification.predicate.leadLargestArmy.self"
      )}.`,
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
    label: tx("match.notification.label.award"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.loseLargestArmy",
      "match.notification.predicate.loseLargestArmy.self"
    ),
    detail: nextPlayerId
      ? `${getPlayerPredicate(
          match,
          viewerId,
          nextPlayerId,
          "match.notification.predicate.takeAward",
          "match.notification.predicate.takeAward.self"
        )}.`
      : tx("match.notification.award.detail.unclaimed"),
    badges: [
      ...(knightCount !== null ? [{ label: tx("match.notification.largestArmy.badge.knights", { count: knightCount }) }] : []),
      ...(publicVictoryPoints !== null
        ? [{ label: tx("match.notification.award.badge.publicVictoryPoints", { count: publicVictoryPoints }) }]
        : []),
      { label: tx("match.notification.award.badge.loseVictoryPoints", { count: 2 }), tone: "warning" }
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
    label: tx("match.notification.label.victory"),
    title: getPlayerPredicate(
      match,
      viewerId,
      event.byPlayerId,
      "match.notification.predicate.winGame",
      "match.notification.predicate.winGame.self"
    ),
    detail: victoryPoints !== null
      ? `${getPlayerPredicate(
          match,
          viewerId,
          event.byPlayerId,
          "match.notification.predicate.finishGameWithPoints",
          "match.notification.predicate.finishGameWithPoints.self",
          { count: victoryPoints }
        )}.`
      : tx("match.notification.gameWon.detail.default"),
    badges: victoryPoints !== null ? [{ label: `${victoryPoints} VP`, tone: "warning" }] : [],
    autoFocus: true,
    emphasis: "success"
  });
}

function createFallbackNotification(match: MatchSnapshot, event: MatchEvent): MatchNotification {
  return createBaseNotification(match, event, {
    label: getNotificationLabel(event),
    title: renderEventLabel(event.type),
    detail: tx("match.notification.common.turnDetail", { turn: event.atTurn })
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
      { label: tx("match.notification.common.turn", { turn: event.atTurn }) }
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
    return count > 0
      ? [{ label: tx("match.notification.common.resourceCount", { count, resource: renderResourceLabel(resource) }) }]
      : [];
  });
}

function createResourceMapFromSelection(resources: Resource[]): ResourceMap {
  const resourceMap = {} as ResourceMap;
  for (const resource of RESOURCES) {
    resourceMap[resource] = 0;
  }

  for (const resource of resources) {
    resourceMap[resource] += 1;
  }

  return resourceMap;
}

function renderRouteLabel(routeType: string | null | undefined): string {
  switch (routeType) {
    case "road":
      return tx("match.build.road");
    case "warship":
      return tx("match.notification.route.warship");
    case "ship":
    default:
      return tx("match.build.ship");
  }
}

function renderPirateStealTypeLabel(stealType: string): string {
  return stealType === "cloth" ? tx("match.pirateSteal.cloth") : tx("match.pirateSteal.resource");
}

function renderHarborTypeLabel(portType: string): string {
  return portType === "generic"
    ? tx("match.legend.harborLabel.generic")
    : tx("match.legend.harborLabel.resource", { resource: renderResourceLabel(portType) });
}

function describeScenarioReward(
  match: MatchSnapshot,
  event: MatchEventOf<"scenario_reward_claimed">
): {
  label: string;
  detail: string;
  badges: BoardFocusBadge[];
  cue: BoardFocusCue | null;
} {
  const marker = getScenarioMarkerById(match, event.payload.markerId);
  const villageSite = getSiteById(match, event.payload.markerId);
  const tribeCue =
    marker && "edgeId" in marker
      ? {
          key: `event-${event.id}-${marker.id}`,
          mode: "event" as const,
          title: tx("match.notification.scenarioReward.tribe.cue.title"),
          detail: tx("match.notification.scenarioReward.tribe.cue.detail"),
          vertexIds: [],
          edgeIds: [marker.edgeId],
          tileIds: [],
          scale: "medium" as const
        }
      : null;

  switch (event.payload.rewardType) {
    case "forgotten_tribe_vp":
      return {
        label: tx("match.notification.scenarioReward.tribe.vp.label"),
        detail: tx("match.notification.scenarioReward.tribe.vp.detail"),
        badges: [{ label: tx("match.notification.scenarioReward.tribe.vp.label"), tone: "warning" }],
        cue: tribeCue
      };
    case "forgotten_tribe_development":
      return {
        label: tx("match.notification.scenarioReward.tribe.development.label"),
        detail: tx("match.notification.scenarioReward.tribe.development.detail"),
        badges: [{ label: tx("match.notification.scenarioReward.tribe.development.label"), tone: "warning" }],
        cue: tribeCue
      };
    case "forgotten_tribe_port": {
      const portBadge =
        marker && "portType" in marker ? [{ label: renderHarborTypeLabel(marker.portType), tone: "warning" as const }] : [];
      return {
        label: tx("match.notification.scenarioReward.tribe.port.label"),
        detail: tx("match.notification.scenarioReward.tribe.port.detail"),
        badges: [{ label: tx("match.notification.scenarioReward.tribe.port.label") }, ...portBadge],
        cue: tribeCue
      };
    }
    case "cloth_village":
      return {
        label: tx("match.notification.scenarioReward.clothVillage.label"),
        detail: tx("match.notification.scenarioReward.clothVillage.detail"),
        badges: [{ label: tx("match.notification.scenarioReward.clothVillage.label"), tone: "warning" }],
        cue: villageSite
          ? {
              key: `event-${event.id}-${villageSite.id}`,
              mode: "event",
              title: tx("match.notification.scenarioReward.clothVillage.cue.title"),
              detail: tx("match.notification.scenarioReward.clothVillage.cue.detail"),
              vertexIds: [villageSite.vertexId],
              edgeIds: [],
              tileIds: [],
              scale: "tight"
            }
          : null
      };
    case "island_reward_2":
    case "island_reward_1": {
      const pointCount = event.payload.rewardType === "island_reward_2" ? 2 : 1;
      const pointLabel = tx("match.notification.scenarioReward.island.label", { count: pointCount });
      return {
        label: pointLabel,
        detail: tx("match.notification.scenarioReward.island.detail"),
        badges: [{ label: pointLabel, tone: "warning" }],
        cue: marker && "vertexId" in marker
          ? {
              key: `event-${event.id}-${marker.id}`,
              mode: "event",
              title: tx("match.notification.scenarioReward.island.cue.title"),
              detail: tx("match.notification.scenarioReward.island.cue.detail"),
              vertexIds: [marker.vertexId],
              edgeIds: [],
              tileIds: [],
              scale: "tight"
            }
          : null
      };
    }
    default:
      return {
        label: tx("event.scenarioRewardClaimed"),
        detail: tx("match.notification.scenarioReward.default.detail"),
        badges: [],
        cue: null
      };
  }
}

function summarizeGrantBadges(match: MatchSnapshot, grantsByPlayerId: Record<string, ResourceMap>): BoardFocusBadge[] {
  return Object.entries(grantsByPlayerId).flatMap(([playerId, resourceMap]) => {
    const summary = renderResourceMap(resourceMap);
    return summary
      ? [{
          label: tx("match.notification.common.playerGrant", {
            player: getDisplayPlayerName(match, match.you, playerId),
            summary
          }),
          playerId,
          tone: "player" as const
        }]
      : [];
  });
}

function summarizeTileLine(match: MatchSnapshot, tileIds: string[], roll: number | null): string {
  if (!tileIds.length) {
    return roll === null
      ? tx("match.notification.common.noActiveTiles")
      : tx("match.notification.common.noActiveTilesForRoll", { roll });
  }

  const labels = tileIds
    .map((tileId) => match.board.tiles.find((tile) => tile.id === tileId))
    .filter((tile): tile is MatchSnapshot["board"]["tiles"][number] => !!tile)
    .map((tile) => `${renderResourceLabel(tile.resource)} ${tile.token ?? ""}`.trim());

  return tx("match.notification.common.tileList", { labels: labels.join(" / ") });
}

function getTileLabel(match: MatchSnapshot, tileId: string): string {
  if (tileId === PIRATE_FRAME_TILE_ID) {
    return tx("match.notification.common.frame");
  }

  const tile = match.board.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return tx("match.notification.common.tile");
  }

  if (tile.terrain === "sea" || tile.kind === "sea") {
    return renderResourceLabel("sea");
  }

  if (tile.terrain === "gold") {
    return tx("match.goldChoice.title");
  }

  return `${renderResourceLabel(tile.resource)} ${tile.token ?? ""}`.trim();
}

function getScenarioMarkerById(match: MatchSnapshot, markerId: string) {
  return match.board.scenarioMarkers?.find((marker) => marker.id === markerId) ?? null;
}

function getSiteById(match: MatchSnapshot, siteId: string) {
  return match.board.sites?.find((site) => site.id === siteId) ?? null;
}

function getSiteAtVertex(
  match: MatchSnapshot,
  vertexId: string,
  type?: NonNullable<MatchSnapshot["board"]["sites"]>[number]["type"]
) {
  return match.board.sites?.find((site) => site.vertexId === vertexId && (!type || site.type === type)) ?? null;
}

function getNotificationLabel(event: MatchEvent): string {
  switch (event.type) {
    case "special_build_started":
      return tx("match.notification.label.specialBuild");
    case "paired_player_started":
      return tx("match.notification.label.pairedPlayers");
    case "turn_ended":
      return tx("match.notification.label.turn");
    case "dice_rolled":
    case "resources_discarded":
    case "robber_moved":
      return tx("match.notification.label.robber");
    case "development_card_bought":
    case "development_card_played":
      return tx("match.notification.label.development");
    case "trade_offered":
    case "trade_completed":
    case "trade_declined":
    case "trade_cancelled":
    case "maritime_trade":
      return tx("match.notification.label.trade");
    case "road_built":
    case "settlement_built":
    case "city_built":
      return tx("match.notification.label.build");
    case "longest_road_awarded":
    case "longest_road_lost":
    case "largest_army_awarded":
    case "largest_army_lost":
      return tx("match.notification.label.award");
    case "game_won":
      return tx("match.notification.label.victory");
    default:
      return tx("match.notification.label.live");
  }
}

function renderDevelopmentTypeLabel(type: DevelopmentCardType | null): string {
  switch (type) {
    case "knight":
      return tx("match.notification.developmentType.knight");
    case "victory_point":
      return tx("match.notification.developmentType.victoryPoint");
    case "road_building":
      return tx("match.notification.developmentType.roadBuilding");
    case "year_of_plenty":
      return tx("match.notification.developmentType.yearOfPlenty");
    case "monopoly":
      return tx("match.notification.developmentType.monopoly");
    case null:
      return tx("match.notification.developmentType.card");
    default:
      return type;
  }
}

function getDisplayPlayerName(match: MatchSnapshot, viewerId: string, playerId?: string): string {
  if (!playerId) {
    return tx("match.notification.common.playerUnknown");
  }

  if (playerId === viewerId) {
    return tx("shared.you");
  }

  return getPlayerById(match, playerId)?.username ?? tx("match.notification.common.playerUnknown");
}

function getRobberPlacementInstruction(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined = match.currentPlayerId,
  lowerCaseSelf = false
): string {
  if (!playerId) {
    return tx("match.notification.robber.instruction.chooseTile");
  }

  if (playerId === viewerId) {
    return lowerCaseSelf
      ? tx("match.notification.robber.instruction.self.lower")
      : tx("match.notification.robber.instruction.self");
  }

  return tx("match.notification.robber.instruction.other", {
    player: getDisplayPlayerName(match, viewerId, playerId)
  });
}

function getPlayerPredicate(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined,
  thirdPersonKey: string,
  secondPersonKey = thirdPersonKey,
  params?: TranslationParams
): string {
  if (!playerId) {
    return tx("match.notification.common.playerPredicate", {
      player: tx("match.notification.common.playerUnknown"),
      predicate: tx(thirdPersonKey, params)
    });
  }

  if (playerId === viewerId) {
    return tx("match.notification.common.playerPredicate", {
      player: tx("shared.you"),
      predicate: tx(secondPersonKey, params)
    });
  }

  return tx("match.notification.common.playerPredicate", {
    player: getPlayerById(match, playerId)?.username ?? tx("match.notification.common.playerUnknown"),
    predicate: tx(thirdPersonKey, params)
  });
}

function getPlayerPredicateByKey(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined,
  thirdPersonKey: string,
  secondPersonKey?: string,
  params?: TranslationParams
): string {
  return getPlayerPredicate(match, viewerId, playerId, thirdPersonKey, secondPersonKey ?? thirdPersonKey, params);
}

function getDisplayPlayerObject(
  match: MatchSnapshot,
  viewerId: string,
  playerId: string | null | undefined,
  grammaticalCase: "accusative" | "dative" = "accusative"
): string {
  if (!playerId) {
    return grammaticalCase === "dative"
      ? tx("match.notification.common.playerObject.dative")
      : tx("match.notification.common.playerObject.accusative");
  }

  if (playerId === viewerId) {
    return grammaticalCase === "dative" ? tx("shared.youDative") : tx("shared.youAccusative");
  }

  return getPlayerById(match, playerId)?.username ??
    (grammaticalCase === "dative"
      ? tx("match.notification.common.playerObject.dative")
      : tx("match.notification.common.playerObject.accusative"));
}

function getPlayerById(match: MatchSnapshot, playerId?: string): MatchPlayer | null {
  if (!playerId) {
    return null;
  }

  return match.players.find((player) => player.id === playerId) ?? null;
}

function joinNames(names: string[]): string {
  return activeNotificationTextHelpers.formatNameList(names);
}
