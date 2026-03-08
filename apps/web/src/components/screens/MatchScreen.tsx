import { useEffect, useMemo, useRef, useState, type CSSProperties, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type {
  ClientMessage,
  DevelopmentCardView,
  MatchSnapshot,
  PortType,
  Resource,
  ResourceMap,
  RoomDetails
} from "@hexagonia/shared";
import {
  BUILD_COSTS,
  createEmptyResourceMap,
  equalResourceMaps,
  hasResources,
  isEmptyResourceMap,
  RESOURCES,
  totalResources
} from "@hexagonia/shared";
import { BoardScene, type BoardFocusCue, type InteractionMode } from "../../BoardScene";
import { type BoardVisualSettings, TILE_COLORS } from "../../boardVisuals";
import { PortMarkerIcon, ResourceIcon } from "../../resourceIcons";
import { PlayerColorBadge, PlayerIdentity } from "../shared/PlayerIdentity";
import { PlayerMention, renderMatchPlayerText } from "../shared/PlayerText";
import { ProfileMenu, ProfileMenuPanel } from "../shell/ProfileMenu";
import { formatPhase, getPlayerAccentClass, renderPlayerColorLabel, renderResourceLabel, renderResourceMap } from "../../ui";
import {
  createEmptyMatchNotificationPrivateCache,
  createMatchNotificationState,
  type MatchNotification
} from "./matchNotifications";
import {
  canAffordCost,
  canBankPayYearOfPlenty,
  createBuildActionState,
  createOwnActionCameraCue,
  createOwnActionCue,
  describeDevelopmentCardStatus,
  getLatestDiceRollEvent,
  getPlayerColor,
  getPlayerName,
  getPlayerPresenceState,
  getRobberDiscardGroups,
  getTurnStatus,
  type TurnStatus,
  renderDevelopmentLabel
} from "./matchScreenViewModel";
import {
  clampTradeDraftCount,
  DiceFace,
  type MatchScreenNotification,
  MatchNotificationCard,
  PlayerBadge,
  PlayerStatCard,
  rollPreviewValue,
  setTradeDraftCount,
  TradeBanner,
  TradeQuantityControl,
  TradeResourceCardGrid
} from "./matchScreenParts";

export interface TradeFormState {
  give: ResourceMap;
  want: ResourceMap;
  targetPlayerId: string;
}

export interface MaritimeFormState {
  give: Resource;
  receive: Resource;
}

type MatchProfileMenuProps = ComponentProps<typeof ProfileMenu>;
type MatchPanelTab = "overview" | "actions" | "hand" | "trade" | "players" | "profile";
type SheetState = "peek" | "half" | "full";
type TradeSection = "player" | "maritime";

const MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "actions", label: "Aktionen" },
  { id: "trade", label: "Handel" },
  { id: "hand", label: "Hand" },
  { id: "overview", label: "Events" },
  { id: "players", label: "Spieler" }
];

const MOBILE_MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "actions", label: "Aktionen" },
  { id: "trade", label: "Handel" },
  { id: "hand", label: "Hand" },
  { id: "overview", label: "Events" },
  { id: "profile", label: "Profil" }
];

const MATCH_TAB_ORDER: Record<MatchPanelTab, number> = {
  actions: 0,
  trade: 1,
  hand: 2,
  overview: 3,
  players: 4,
  profile: 4
};

const AUTO_FOCUS_STORAGE_KEY = "hexagonia:auto-focus";
const BOARD_LEGEND_STORAGE_KEY = "hexagonia:board-legend";
const BOARD_HUD_STORAGE_KEY = "hexagonia:board-hud";
const RESOURCE_LEGEND: Array<{ resource: Resource | "desert"; note: string }> = [
  { resource: "brick", note: "Lehm für Straßen und Siedlungen." },
  { resource: "lumber", note: "Holz für Straßen und Siedlungen." },
  { resource: "ore", note: "Erz für Städte und Entwicklungen." },
  { resource: "grain", note: "Getreide für Siedlungen, Städte und Entwicklungen." },
  { resource: "wool", note: "Wolle für Siedlungen und Entwicklungen." },
  { resource: "desert", note: "Wüste: keine Erträge, hier startet der Räuber." }
];
const HARBOR_LEGEND: Array<{ type: PortType; note: string }> = [
  { type: "generic", note: "3:1 für beliebige Rohstoffe. Es zählt immer deine beste angrenzende Hafenrate." },
  { type: "brick", note: "2:1 für Lehm, wenn deine eigene Siedlung oder Stadt direkt am Hafen liegt." },
  { type: "lumber", note: "2:1 für Holz, wenn deine eigene Siedlung oder Stadt direkt am Hafen liegt." },
  { type: "ore", note: "2:1 für Erz, wenn deine eigene Siedlung oder Stadt direkt am Hafen liegt." },
  { type: "grain", note: "2:1 für Getreide, wenn deine eigene Siedlung oder Stadt direkt am Hafen liegt." },
  { type: "wool", note: "2:1 für Wolle, wenn deine eigene Siedlung oder Stadt direkt am Hafen liegt." }
];
const COMPACT_RESOURCE_LEGEND: Array<{ resource: Resource | "desert"; note: string }> = [
  { resource: "brick", note: "Straßen, Siedlungen" },
  { resource: "lumber", note: "Straßen, Siedlungen" },
  { resource: "ore", note: "Städte, Entwicklung" },
  { resource: "grain", note: "Siedlungen, Städte, Entwicklung" },
  { resource: "wool", note: "Siedlungen, Entwicklung" },
  { resource: "desert", note: "Kein Ertrag, Startfeld des Räubers" }
];

const COMPACT_HARBOR_LEGEND: Array<{ type: PortType; note: string }> = [
  { type: "generic", note: "3 gleiche Karten gegen 1 Wahlkarte" },
  { type: "brick", note: "2 Lehm gegen 1 Wahlkarte" },
  { type: "lumber", note: "2 Holz gegen 1 Wahlkarte" },
  { type: "ore", note: "2 Erz gegen 1 Wahlkarte" },
  { type: "grain", note: "2 Getreide gegen 1 Wahlkarte" },
  { type: "wool", note: "2 Wolle gegen 1 Wahlkarte" }
];

function isDenseLegendViewport(width: number, height: number): boolean {
  return width < 1320 || height < 840;
}

interface DiceDisplayState {
  left: number | null;
  right: number | null;
  total: number | null;
  phase: "idle" | "expand" | "rolling" | "settle";
  actorName: string | null;
}

interface BuildActionTooltipState {
  title: string;
  lines: string[];
  left: number;
  top: number;
  placement: "above" | "below";
}

const DICE_EXPAND_MS = 0;
const DICE_ROLL_MS = 560;
const DICE_SETTLE_MS = 260;

export function MatchScreen(props: {
  boardVisualSettings: BoardVisualSettings;
  match: MatchSnapshot;
  room: RoomDetails | null;
  selfPlayer: MatchSnapshot["players"][number] | null;
  profileMenuProps: MatchProfileMenuProps;
  interactionMode: InteractionMode;
  selectedRoadEdges: string[];
  tradeForm: TradeFormState;
  maritimeForm: MaritimeFormState;
  yearOfPlenty: [Resource, Resource];
  monopolyResource: Resource;
  onAction: (message: ClientMessage) => void;
  onOfferTrade: () => void;
  onVertexSelect: (vertexId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onTileSelect: (tileId: string) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setSelectedRoadEdges: Dispatch<SetStateAction<string[]>>;
  setTradeForm: Dispatch<SetStateAction<TradeFormState>>;
  setMaritimeForm: Dispatch<SetStateAction<MaritimeFormState>>;
  setYearOfPlenty: Dispatch<SetStateAction<[Resource, Resource]>>;
  setMonopolyResource: Dispatch<SetStateAction<Resource>>;
}) {
  const [activeTab, setActiveTab] = useState<MatchPanelTab>(() => {
    if (typeof window === "undefined") {
      return "overview";
    }

    return window.innerWidth <= 1023 ? "actions" : "overview";
  });
  const [tabTransitionDirection, setTabTransitionDirection] = useState<"forward" | "backward">("forward");
  const [sheetState, setSheetState] = useState<SheetState>(() => {
    if (typeof window === "undefined") {
      return "half";
    }

    return window.innerWidth <= 719 || window.innerHeight <= 560 ? "peek" : "half";
  });
  const [tradeSection, setTradeSection] = useState<TradeSection>("player");
  const [selectedTradeGiveResource, setSelectedTradeGiveResource] = useState<Resource>("brick");
  const [selectedTradeWantResource, setSelectedTradeWantResource] = useState<Resource>("grain");
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.innerWidth <= 719 || window.innerHeight <= 560;
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.innerWidth <= 1023;
  });
  const [isDenseLegendViewportState, setIsDenseLegendViewportState] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return isDenseLegendViewport(window.innerWidth, window.innerHeight);
  });
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem(AUTO_FOCUS_STORAGE_KEY) !== "off";
  });
  const [boardLegendOpen, setBoardLegendOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    if (window.innerWidth <= 1023 || window.innerHeight <= 560) {
      return false;
    }

    if (isDenseLegendViewport(window.innerWidth, window.innerHeight)) {
      return false;
    }

    const stored = window.localStorage.getItem(BOARD_LEGEND_STORAGE_KEY);
    if (stored) {
      return stored !== "closed";
    }

    return true;
  });
  const [boardHudOpen, setBoardHudOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    const stored = window.localStorage.getItem(BOARD_HUD_STORAGE_KEY);
    if (stored) {
      return stored === "open";
    }

    return window.innerWidth > 1023;
  });
  const [buildActionTooltip, setBuildActionTooltip] = useState<BuildActionTooltipState | null>(null);
  const latestDiceEvent = useMemo(() => getLatestDiceRollEvent(props.match), [props.match]);
  const [diceDisplay, setDiceDisplay] = useState<DiceDisplayState>(() => ({
    left: props.match.dice?.[0] ?? null,
    right: props.match.dice?.[1] ?? null,
    total: props.match.dice ? props.match.dice[0] + props.match.dice[1] : null,
    phase: "idle",
    actorName: latestDiceEvent ? getPlayerName(props.match, latestDiceEvent.byPlayerId) : null
  }));
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const seenDiceEventIdRef = useRef<string | null>(latestDiceEvent?.id ?? null);
  const diceAnimationTimerRef = useRef<number | null>(null);
  const diceAnimationCompleteRef = useRef<number | null>(null);
  const previousMatchRef = useRef<MatchSnapshot | null>(null);
  const notificationCacheRef = useRef(createEmptyMatchNotificationPrivateCache());

  const activePlayer = props.match.players.find((player) => player.id === props.match.currentPlayerId) ?? null;
  const isCurrentPlayer = props.match.currentPlayerId === props.match.you;
  const notificationState = useMemo(
    () =>
      createMatchNotificationState({
        currentMatch: props.match,
        previousMatch: previousMatchRef.current,
        viewerId: props.match.you,
        privateCache: notificationCacheRef.current
      }),
    [props.match]
  );
  const heroNotification = notificationState.heroNotification;
  const boardFocusNotification = notificationState.boardFocusNotification;
  const isDiceAnimationActive =
    (latestDiceEvent?.id ?? null) !== seenDiceEventIdRef.current || diceDisplay.phase !== "idle";
  const deferDiceNotification =
    isDiceAnimationActive &&
    !!heroNotification &&
    (heroNotification.eventType === "dice_rolled" || heroNotification.eventType === "resources_distributed");
  const visibleHeroNotification = deferDiceNotification ? null : heroNotification;
  const liveAnnouncementText = deferDiceNotification ? null : notificationState.announcementText;
  const incomingTradeOffers = useMemo(
    () =>
      props.match.tradeOffers.filter(
        (offer) =>
          props.match.allowedMoves.acceptableTradeOfferIds.includes(offer.id) ||
          props.match.allowedMoves.declineableTradeOfferIds.includes(offer.id)
      ),
    [props.match.allowedMoves.acceptableTradeOfferIds, props.match.allowedMoves.declineableTradeOfferIds, props.match.tradeOffers]
  );
  const incomingTradeOffer = incomingTradeOffers[0] ?? null;
  const incomingTradeCount = incomingTradeOffers.length;
  const actionCue = useMemo(
    () => createOwnActionCue(props.match, activePlayer, props.interactionMode, props.selectedRoadEdges),
    [activePlayer, props.interactionMode, props.match, props.selectedRoadEdges]
  );
  const actionCameraCue = useMemo(
    () => createOwnActionCameraCue(props.match, activePlayer, props.interactionMode, props.selectedRoadEdges),
    [activePlayer, props.interactionMode, props.match, props.selectedRoadEdges]
  );
  const visibleNotificationCue = isDiceAnimationActive ? null : notificationState.boardCue;
  const highlightCue = actionCue ?? visibleNotificationCue;
  const shouldAutoFocusRecentEvent =
    !!boardFocusNotification &&
    !!visibleNotificationCue &&
    boardFocusNotification.autoFocus &&
    (boardFocusNotification.eventType === "dice_rolled" ||
      boardFocusNotification.eventType === "turn_ended" ||
      boardFocusNotification.eventType === "resources_distributed" ||
      boardFocusNotification.playerId !== props.match.you);
  const cameraCue =
    autoFocusEnabled && !isDiceAnimationActive
      ? (actionCameraCue ?? (shouldAutoFocusRecentEvent ? visibleNotificationCue : null))
      : null;
  const tradeTargetPlayers = isCurrentPlayer
    ? props.match.players.filter((player) => player.id !== props.match.you)
    : props.match.players.filter((player) => player.id === props.match.currentPlayerId);
  const maritimeRatio =
    props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === props.maritimeForm.give)?.ratio ?? 4;
  const tradeGiveTotal = totalResources(props.tradeForm.give);
  const tradeWantTotal = totalResources(props.tradeForm.want);
  const tradeGiveSummary = renderResourceMap(props.tradeForm.give) || "Noch nichts im Angebot";
  const tradeWantSummary = renderResourceMap(props.tradeForm.want) || "Noch nichts angefragt";
  const effectiveTradeTargetPlayer = !isCurrentPlayer ? activePlayer : null;
  const selectedTradeTargetPlayer =
    props.tradeForm.targetPlayerId && isCurrentPlayer
      ? tradeTargetPlayers.find((player) => player.id === props.tradeForm.targetPlayerId) ?? null
      : null;
  const normalizedTradeTargetId = selectedTradeTargetPlayer?.id ?? "";
  const selectedTradeTargetAccentClass = selectedTradeTargetPlayer ? getPlayerAccentClass(selectedTradeTargetPlayer.color) : "";
  const selectedTradeGiveCount = props.tradeForm.give[selectedTradeGiveResource] ?? 0;
  const selectedTradeWantCount = props.tradeForm.want[selectedTradeWantResource] ?? 0;
  const selectedTradeGiveMax = props.selfPlayer?.resources?.[selectedTradeGiveResource] ?? 0;
  const affordableMaritimeGiveResources = RESOURCES.filter((resource) => {
    const ratio = props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === resource)?.ratio ?? 4;
    return (props.selfPlayer?.resources?.[resource] ?? 0) >= ratio;
  });
  const turnStatus = getTurnStatus(props.match, activePlayer, props.selfPlayer, props.interactionMode);
  const robberDiscardGroups = useMemo(() => getRobberDiscardGroups(props.match), [props.match]);
  const canAffordRoad = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.road);
  const canAffordSettlement = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.settlement);
  const canAffordCity = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.city);
  const buildActions = [
    createBuildActionState("road", "Straße", {
      cost: BUILD_COSTS.road,
      enabled: isCurrentPlayer && props.match.allowedMoves.roadEdgeIds.length > 0 && canAffordRoad,
      phase: props.match.phase,
      isCurrentPlayer,
      interactionMode: props.interactionMode,
      activeMode: "road",
      legalTargetCount: props.match.allowedMoves.roadEdgeIds.length,
      resources: props.selfPlayer?.resources,
      onClick: () => props.setInteractionMode(props.interactionMode === "road" ? null : "road")
    }),
    createBuildActionState("settlement", "Siedlung", {
      cost: BUILD_COSTS.settlement,
      enabled: isCurrentPlayer && props.match.allowedMoves.settlementVertexIds.length > 0 && canAffordSettlement,
      phase: props.match.phase,
      isCurrentPlayer,
      interactionMode: props.interactionMode,
      activeMode: "settlement",
      legalTargetCount: props.match.allowedMoves.settlementVertexIds.length,
      resources: props.selfPlayer?.resources,
      onClick: () => props.setInteractionMode(props.interactionMode === "settlement" ? null : "settlement")
    }),
    createBuildActionState("city", "Stadt", {
      cost: BUILD_COSTS.city,
      enabled: isCurrentPlayer && props.match.allowedMoves.cityVertexIds.length > 0 && canAffordCity,
      phase: props.match.phase,
      isCurrentPlayer,
      interactionMode: props.interactionMode,
      activeMode: "city",
      legalTargetCount: props.match.allowedMoves.cityVertexIds.length,
      resources: props.selfPlayer?.resources,
      onClick: () => props.setInteractionMode(props.interactionMode === "city" ? null : "city")
    }),
    createBuildActionState("development", "Entwicklung", {
      cost: BUILD_COSTS.development,
      enabled: props.match.allowedMoves.canBuyDevelopmentCard,
      phase: props.match.phase,
      isCurrentPlayer,
      resources: props.selfPlayer?.resources,
      onClick: () =>
        props.onAction({
          type: "match.action",
          matchId: props.match.matchId,
          action: { type: "buy_development_card" }
        })
    })
  ];
  const canSubmitTradeOffer =
    props.match.allowedMoves.canCreateTradeOffer &&
    !isEmptyResourceMap(props.tradeForm.want) &&
    hasResources(props.selfPlayer?.resources ?? createEmptyResourceMap(), props.tradeForm.give);
  const canSubmitMaritimeTrade =
    props.match.allowedMoves.canMaritimeTrade &&
    (props.selfPlayer?.resources?.[props.maritimeForm.give] ?? 0) >= maritimeRatio;
  const canPlayYearOfPlenty = canBankPayYearOfPlenty(props.match.bank, props.yearOfPlenty);
  const developmentCards = props.selfPlayer?.developmentCards ?? [];
  const hiddenVictoryPoints = props.selfPlayer?.hiddenVictoryPoints ?? 0;
  const totalVictoryPoints = props.selfPlayer?.totalVictoryPoints ?? props.selfPlayer?.publicVictoryPoints ?? 0;
  const pendingRoadBuilding =
    props.match.pendingDevelopmentEffect?.type === "road_building" ? props.match.pendingDevelopmentEffect : null;
  const playableDevelopmentCardCount =
    isCurrentPlayer &&
    !pendingRoadBuilding &&
    (props.match.phase === "turn_roll" ||
      props.match.phase === "turn_action" ||
      props.match.phase === "paired_player_action")
      ? developmentCards.filter((card) => card.playable).length
      : 0;
  const mobileHudSummary = props.selfPlayer
    ? `${totalVictoryPoints} VP gesamt · ${props.selfPlayer.resourceCount} Karten`
    : "HUD";
  const boardDiceLabel = props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : "Wurf offen";
  const deferredDiceHeroNotification = useMemo<MatchScreenNotification | null>(() => {
    if (!deferDiceNotification || !latestDiceEvent) {
      return null;
    }

    const actorId = latestDiceEvent.byPlayerId;
    const actorLabel = actorId === props.match.you ? "Du" : getPlayerName(props.match, actorId);

    return {
      key: `dice-pending-${latestDiceEvent.id}`,
      eventId: latestDiceEvent.id,
      eventType: "dice_pending",
      label: "Wurf",
      title: `${actorLabel} ${actorId === props.match.you ? "würfelst" : "würfelt"}...`,
      detail: "Das Ergebnis wird nach der Animation eingeblendet.",
      badges: [{ label: "Würfel rollen" }],
      ...(actorId ? { playerId: actorId, accentPlayerId: actorId } : {}),
      atTurn: props.match.turn,
      cue: null,
      autoFocus: false,
      emphasis: "neutral"
    };
  }, [deferDiceNotification, latestDiceEvent, props.match, props.match.turn, props.match.you]);
  const displayHeroNotification = useMemo<MatchScreenNotification>(
    () =>
      visibleHeroNotification ?? {
        key: `turn-status-${props.match.version}`,
        eventId: `turn-status-${props.match.version}`,
        eventType: "turn_status",
        label: "Partie",
        title: turnStatus.title,
        detail: turnStatus.detail,
        badges: [
          { label: `Zug ${props.match.turn}` },
          { label: formatPhase(props.match.phase) },
          ...(activePlayer
            ? [{
                label: activePlayer.id === props.match.you ? "Du" : activePlayer.username,
                playerId: activePlayer.id,
                tone: "player" as const
              }]
            : [])
        ],
        ...(turnStatus.playerId ? { playerId: turnStatus.playerId } : {}),
        ...(activePlayer ? { accentPlayerId: activePlayer.id } : {}),
        atTurn: props.match.turn,
        cue: null,
        autoFocus: false,
        emphasis: isCurrentPlayer ? "success" : "neutral"
      },
    [
      activePlayer,
      isCurrentPlayer,
      props.match.phase,
      props.match.turn,
      props.match.version,
      props.match.you,
      turnStatus.detail,
      turnStatus.playerId,
      turnStatus.title,
      visibleHeroNotification
    ]
  );
  const hasRevealedDiceResult = diceDisplay.phase === "idle" && diceDisplay.total !== null;
  const visibleTabs = isMobileViewport ? MOBILE_MATCH_TABS : MATCH_TABS;
  const effectiveSheetState: SheetState = isMobileViewport ? "full" : sheetState;
  const showIncomingTradeAlert = !!incomingTradeOffer && (activeTab !== "trade" || effectiveSheetState === "peek");
  const getTabTransitionOrder = (tab: MatchPanelTab) => {
    const visibleIndex = visibleTabs.findIndex((entry) => entry.id === tab);
    return visibleIndex === -1 ? MATCH_TAB_ORDER[tab] : visibleIndex;
  };
  const getTabLayout = (tabs: ReadonlyArray<{ id: MatchPanelTab }>, columns: number) => {
    const normalizedColumns = Math.max(1, columns);
    const gridColumns = normalizedColumns * 2;
    const rows = Math.max(1, Math.ceil(tabs.length / normalizedColumns));
    const remainder = tabs.length % normalizedColumns;
    const activeIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === activeTab)
    );

    const layout = tabs.map((tab, index) => {
      const row = Math.floor(index / normalizedColumns);
      const column = index % normalizedColumns;
      const isLastRow = row === rows - 1;
      const isTailRow = isLastRow && remainder > 0 && remainder < normalizedColumns;
      let span = 2;
      let start = column * 2 + 1;

      if (isTailRow) {
        const tailIndex = index - row * normalizedColumns;
        if (remainder === 1) {
          span = Math.max(2, gridColumns - 2);
          start = Math.floor((gridColumns - span) / 2) + 1;
        } else if (remainder === 2) {
          span = Math.floor(gridColumns / 2);
          start = tailIndex === 0 ? 1 : gridColumns - span + 1;
        }
      }

      return {
        id: tab.id,
        row,
        start,
        span
      };
    });

    const activeLayout = layout[Math.min(activeIndex, layout.length - 1)] ?? { row: 0, start: 1, span: 2 };

    return {
      rows,
      gridColumns,
      active: activeLayout,
      items: layout
    };
  };
  const getTabStripStyle = (tabs: ReadonlyArray<{ id: MatchPanelTab }>, columns: number): CSSProperties => {
    const normalizedColumns = Math.max(1, columns);
    const tabLayout = getTabLayout(tabs, normalizedColumns);

    return {
      "--tab-count": `${tabs.length}`,
      "--tab-columns": `${normalizedColumns}`,
      "--tab-grid-columns": `${tabLayout.gridColumns}`,
      "--tab-rows": `${tabLayout.rows}`,
      "--tab-active-index": `${Math.max(
        0,
        tabs.findIndex((tab) => tab.id === activeTab)
      )}`,
      "--tab-active-row": `${tabLayout.active.row}`,
      "--tab-active-grid-start": `${tabLayout.active.start}`,
      "--tab-active-grid-span": `${tabLayout.active.span}`
    } as CSSProperties;
  };
  const getTabButtonStyle = (
    tabs: ReadonlyArray<{ id: MatchPanelTab }>,
    tabId: MatchPanelTab,
    columns: number
  ): CSSProperties => {
    const tabLayout = getTabLayout(tabs, columns);
    const layout = tabLayout.items.find((item) => item.id === tabId);
    if (!layout) {
      return {};
    }

    return {
      gridColumn: `${layout.start} / span ${layout.span}`,
      gridRow: `${layout.row + 1}`
    };
  };
  const changeActiveTab = (nextTab: MatchPanelTab) => {
    if (nextTab === activeTab) {
      return;
    }

    setTabTransitionDirection(getTabTransitionOrder(nextTab) >= getTabTransitionOrder(activeTab) ? "forward" : "backward");
    setActiveTab(nextTab);
  };
  const openTradePanel = () => {
    setTradeSection("player");
    changeActiveTab("trade");
    if (effectiveSheetState === "peek") {
      setSheetState("half");
    }
  };
  const openHandPanel = () => {
    changeActiveTab("hand");
    if (effectiveSheetState === "peek") {
      setSheetState("half");
    }
  };
  const openBuildActionTooltip = (
    tooltip: { title: string; lines: string[] } | null,
    element: HTMLElement
  ) => {
    if (!tooltip) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const estimatedWidth = Math.min(272, Math.max(200, rect.width));
    const left = Math.min(
      window.innerWidth - estimatedWidth / 2 - 12,
      Math.max(estimatedWidth / 2 + 12, rect.left + rect.width / 2)
    );
    const placement = rect.top > 160 ? "above" : "below";

    setBuildActionTooltip({
      title: tooltip.title,
      lines: tooltip.lines,
      left,
      top: placement === "above" ? rect.top - 10 : rect.bottom + 10,
      placement
    });
  };
  const closeBuildActionTooltip = () => setBuildActionTooltip(null);
  const renderDevelopmentCardControls = (card: DevelopmentCardView): ReactNode => {
    if (!isCurrentPlayer) {
      return null;
    }

    switch (card.type) {
      case "knight":
        return card.playable ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              props.onAction({
                type: "match.action",
                matchId: props.match.matchId,
                action: { type: "play_knight" }
              })
            }
          >
            Ritter spielen
          </button>
        ) : null;
      case "road_building":
        return card.playable ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              props.onAction({
                type: "match.action",
                matchId: props.match.matchId,
                action: { type: "play_road_building" }
              })
            }
          >
            Straßenbau starten
          </button>
        ) : null;
      case "year_of_plenty":
        return card.playable ? (
          <div className="triple-select development-card-controls">
            <select
              value={props.yearOfPlenty[0]}
              onChange={(event) => props.setYearOfPlenty(([_, second]) => [event.target.value as Resource, second])}
            >
              {RESOURCES.map((resource) => (
                <option key={resource} value={resource}>
                  {renderResourceLabel(resource)}
                </option>
              ))}
            </select>
            <select
              value={props.yearOfPlenty[1]}
              onChange={(event) => props.setYearOfPlenty(([first]) => [first, event.target.value as Resource])}
            >
              {RESOURCES.map((resource) => (
                <option key={resource} value={resource}>
                  {renderResourceLabel(resource)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary-button"
              disabled={!canPlayYearOfPlenty}
              onClick={() =>
                props.onAction({
                  type: "match.action",
                  matchId: props.match.matchId,
                  action: {
                    type: "play_year_of_plenty",
                    resources: props.yearOfPlenty
                  }
                })
              }
            >
              Erfindung spielen
            </button>
          </div>
        ) : null;
      case "monopoly":
        return card.playable ? (
          <div className="triple-select development-card-controls">
            <select
              value={props.monopolyResource}
              onChange={(event) => props.setMonopolyResource(event.target.value as Resource)}
            >
              {RESOURCES.map((resource) => (
                <option key={resource} value={resource}>
                  {renderResourceLabel(resource)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                props.onAction({
                  type: "match.action",
                  matchId: props.match.matchId,
                  action: {
                    type: "play_monopoly",
                    resource: props.monopolyResource
                  }
                })
              }
            >
              Monopol spielen
            </button>
          </div>
        ) : null;
      case "victory_point":
        return null;
      default:
        return null;
    }
  };
  const pendingRoadBuildingCard =
    pendingRoadBuilding && isCurrentPlayer ? (
      <article className="mini-card development-card development-card-active">
        <div className="development-card-head">
          <strong>Straßenbau aktiv</strong>
          <span className="status-pill is-warning">
            {pendingRoadBuilding.remainingRoads === 2 ? "2 Straßen offen" : "1 Straße offen"}
          </span>
        </div>
        <span>
          {pendingRoadBuilding.remainingRoads === 2
            ? "Wähle jetzt die erste kostenlose Straße auf dem Brett."
            : "Wähle die zweite kostenlose Straße oder beende den Effekt."}
        </span>
        <div className="development-card-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              props.setInteractionMode("road_building");
              props.setSelectedRoadEdges([]);
            }}
          >
            Straße auf Brett wählen
          </button>
          {pendingRoadBuilding.remainingRoads === 1 ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                props.onAction({
                  type: "match.action",
                  matchId: props.match.matchId,
                  action: { type: "finish_road_building" }
                })
              }
            >
              Mit einer Straße beenden
            </button>
          ) : null}
        </div>
      </article>
    ) : null;
  const renderTabLabel = (tab: { id: MatchPanelTab; label: string }) => {
    const alertCount = tab.id === "trade" ? incomingTradeCount : 0;
    return (
      <span className="tab-button-label">
        <span>{tab.label}</span>
        {alertCount > 0 ? <span className="tab-alert-badge">{alertCount > 9 ? "9+" : alertCount}</span> : null}
      </span>
    );
  };
  const renderActiveTabPanel = (mobile = false) => (
    <div className={`tab-panel-shell ${mobile ? "mobile" : ""}`.trim()}>
      <div key={`${mobile ? "mobile" : "desktop"}-${activeTab}`} className={`tab-panel-view is-${tabTransitionDirection}`}>
        {tabPanels[activeTab]}
      </div>
    </div>
  );
  const renderQuickActionIcon = (actionId: string) => {
    switch (actionId) {
      case "roll":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="4" width="8" height="8" rx="2.1" />
            <rect x="12.5" y="12" width="8" height="8" rx="2.1" />
            <circle cx="7.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="16.5" cy="16" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="16.5" cy="12.7" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="13.2" cy="16" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        );
      case "end-turn":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h10" />
            <path d="M11 8l4 4-4 4" />
            <path d="M18.5 5v14" />
          </svg>
        );
      default:
        return null;
    }
  };
  const primaryActions = [
    {
      id: "roll",
      label: "Würfeln",
      className: "primary-button",
      disabled: !props.match.allowedMoves.canRoll,
      onClick: () =>
        props.onAction({
          type: "match.action",
          matchId: props.match.matchId,
          action: { type: "roll_dice" }
        })
    },
    {
      id: "end-turn",
      label: "Zug beenden",
      className: "primary-button",
      disabled: !props.match.allowedMoves.canEndTurn,
      onClick: () =>
        props.onAction({
          type: "match.action",
          matchId: props.match.matchId,
          action: { type: "end_turn" }
        })
    }
  ];
  const hasQuickActions = primaryActions.some((action) => !action.disabled);
  const hasDisconnectCountdown = props.match.players.some(
    (player) => !player.connected && typeof player.disconnectDeadlineAt === "number"
  );

  const renderQuickActions = (showPlaceholder = true) =>
    hasQuickActions ? (
      <div className="quick-action-grid">
        {primaryActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`${action.className} match-quick-action-button is-${action.id}`.trim()}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {renderQuickActionIcon(action.id) ? (
              <span className="match-quick-action-icon" aria-hidden="true">
                {renderQuickActionIcon(action.id)}
              </span>
            ) : null}
            <span className="match-quick-action-label">{action.label}</span>
          </button>
        ))}
      </div>
    ) : showPlaceholder ? (
      <div className="action-placeholder">
        <strong>{renderMatchPlayerText(props.match, turnStatus.title)}</strong>
        <span>{renderMatchPlayerText(props.match, turnStatus.detail)}</span>
        {turnStatus.callout ? <span className="status-pill is-warning">{turnStatus.callout}</span> : null}
      </div>
    ) : null;

  useEffect(() => {
    notificationCacheRef.current = notificationState.privateCache;
    previousMatchRef.current = props.match;
  }, [notificationState.privateCache, props.match]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(AUTO_FOCUS_STORAGE_KEY, autoFocusEnabled ? "on" : "off");
  }, [autoFocusEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth <= 1023);
      setIsCompactViewport(window.innerWidth <= 719 || window.innerHeight <= 560);
      setIsDenseLegendViewportState(isDenseLegendViewport(window.innerWidth, window.innerHeight));
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (isCompactViewport && sheetState === "half") {
      setSheetState("peek");
    }
  }, [isCompactViewport, sheetState]);

  useEffect(() => {
    if (isMobileViewport || isDenseLegendViewportState) {
      setBoardLegendOpen(false);
    }

    if (isMobileViewport) {
      setBoardHudOpen(false);
    }
  }, [isDenseLegendViewportState, isMobileViewport]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setTabTransitionDirection("backward");
      setActiveTab("overview");
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(BOARD_LEGEND_STORAGE_KEY, boardLegendOpen ? "open" : "closed");
  }, [boardLegendOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(BOARD_HUD_STORAGE_KEY, boardHudOpen ? "open" : "closed");
  }, [boardHudOpen]);

  useEffect(() => {
    if (!buildActionTooltip) {
      return;
    }

    const clearTooltip = () => setBuildActionTooltip(null);
    window.addEventListener("scroll", clearTooltip, true);
    window.addEventListener("resize", clearTooltip);
    return () => {
      window.removeEventListener("scroll", clearTooltip, true);
      window.removeEventListener("resize", clearTooltip);
    };
  }, [buildActionTooltip]);

  useEffect(() => {
    return () => {
      if (diceAnimationTimerRef.current !== null) {
        window.clearInterval(diceAnimationTimerRef.current);
      }
      if (diceAnimationCompleteRef.current !== null) {
        window.clearTimeout(diceAnimationCompleteRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasDisconnectCountdown) {
      return;
    }

    setCountdownNow(Date.now());
    const timer = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasDisconnectCountdown]);

  useEffect(() => {
    if (diceAnimationTimerRef.current !== null) {
      window.clearInterval(diceAnimationTimerRef.current);
      diceAnimationTimerRef.current = null;
    }
    if (diceAnimationCompleteRef.current !== null) {
      window.clearTimeout(diceAnimationCompleteRef.current);
      diceAnimationCompleteRef.current = null;
    }

    seenDiceEventIdRef.current = latestDiceEvent?.id ?? null;
      setDiceDisplay({
        left: props.match.dice?.[0] ?? latestDiceEvent?.payload.dice[0] ?? null,
        right: props.match.dice?.[1] ?? latestDiceEvent?.payload.dice[1] ?? null,
        total:
          latestDiceEvent?.payload.total ??
          (props.match.dice ? props.match.dice[0] + props.match.dice[1] : null),
        phase: "idle",
        actorName: latestDiceEvent ? getPlayerName(props.match, latestDiceEvent.byPlayerId) : null
      });
  }, [props.match.matchId]);

  useEffect(() => {
    if (!latestDiceEvent) {
      setDiceDisplay((current) => ({
        ...current,
        left: props.match.dice?.[0] ?? null,
        right: props.match.dice?.[1] ?? null,
        total: props.match.dice ? props.match.dice[0] + props.match.dice[1] : null,
        actorName: null
      }));
      return;
    }

    const actualDice = latestDiceEvent.payload.dice ?? props.match.dice;
    const total = latestDiceEvent.payload.total ?? (actualDice ? actualDice[0] + actualDice[1] : null);
    const actorName = getPlayerName(props.match, latestDiceEvent.byPlayerId);

    if (seenDiceEventIdRef.current === null) {
      seenDiceEventIdRef.current = latestDiceEvent.id;
      setDiceDisplay({
        left: actualDice?.[0] ?? null,
        right: actualDice?.[1] ?? null,
        total,
        phase: "idle",
        actorName
      });
      return;
    }

    if (seenDiceEventIdRef.current === latestDiceEvent.id) {
      setDiceDisplay((current) => ({
        ...current,
        left: current.phase === "idle" ? (actualDice?.[0] ?? current.left) : current.left,
        right: current.phase === "idle" ? (actualDice?.[1] ?? current.right) : current.right,
        total: current.phase === "idle" ? (total ?? current.total) : current.total,
        actorName
      }));
      return;
    }

    seenDiceEventIdRef.current = latestDiceEvent.id;
    if (diceAnimationTimerRef.current !== null) {
      window.clearInterval(diceAnimationTimerRef.current);
    }
    if (diceAnimationCompleteRef.current !== null) {
      window.clearTimeout(diceAnimationCompleteRef.current);
    }

    setDiceDisplay({
      left: rollPreviewValue(),
      right: rollPreviewValue(),
      total: null,
      phase: "expand",
      actorName
    });

    diceAnimationCompleteRef.current = window.setTimeout(() => {
        setDiceDisplay((current) => ({
          ...current,
          phase: "rolling",
          left: rollPreviewValue(),
          right: rollPreviewValue(),
          total: null
        }));

      diceAnimationTimerRef.current = window.setInterval(() => {
          setDiceDisplay((current) => ({
            ...current,
            left: rollPreviewValue(),
            right: rollPreviewValue(),
            phase: "rolling",
            total: null
          }));
        }, 92);

      diceAnimationCompleteRef.current = window.setTimeout(() => {
        if (diceAnimationTimerRef.current !== null) {
          window.clearInterval(diceAnimationTimerRef.current);
          diceAnimationTimerRef.current = null;
        }

        setDiceDisplay((current) => ({
          ...current,
          phase: "settle",
          total: null,
          actorName
        }));

        diceAnimationCompleteRef.current = window.setTimeout(() => {
          setDiceDisplay({
            left: actualDice?.[0] ?? null,
            right: actualDice?.[1] ?? null,
            total,
            phase: "idle",
            actorName
          });
          diceAnimationCompleteRef.current = null;
        }, DICE_SETTLE_MS);
      }, DICE_ROLL_MS);
    }, DICE_EXPAND_MS);
  }, [latestDiceEvent, props.match]);

  useEffect(() => {
    const normalizedGive = createEmptyResourceMap();
    const normalizedWant = createEmptyResourceMap();

    for (const resource of RESOURCES) {
      normalizedGive[resource] = clampTradeDraftCount(
        props.tradeForm.give[resource] ?? 0,
        props.selfPlayer?.resources?.[resource] ?? 0
      );
      normalizedWant[resource] = clampTradeDraftCount(props.tradeForm.want[resource] ?? 0, 99);
    }

    if (
      equalResourceMaps(normalizedGive, props.tradeForm.give) &&
      equalResourceMaps(normalizedWant, props.tradeForm.want)
    ) {
      return;
    }

    props.setTradeForm((current) => ({
      ...current,
      give: normalizedGive,
      want: normalizedWant
    }));
  }, [props.selfPlayer?.resources, props.setTradeForm, props.tradeForm.give, props.tradeForm.want]);

  useEffect(() => {
    const ownedGiveResources = RESOURCES.filter((resource) => (props.selfPlayer?.resources?.[resource] ?? 0) > 0);
    if (ownedGiveResources.length === 0 || ownedGiveResources.includes(selectedTradeGiveResource)) {
      return;
    }

    setSelectedTradeGiveResource(ownedGiveResources[0]!);
  }, [props.selfPlayer?.resources, selectedTradeGiveResource]);

  useEffect(() => {
    const normalizedGive =
      affordableMaritimeGiveResources.length > 0 && !affordableMaritimeGiveResources.includes(props.maritimeForm.give)
        ? affordableMaritimeGiveResources[0]!
        : props.maritimeForm.give;
    if (normalizedGive === props.maritimeForm.give) {
      return;
    }

    props.setMaritimeForm((current) => ({
      ...current,
      give: normalizedGive
    }));
  }, [affordableMaritimeGiveResources, props.maritimeForm.give, props.setMaritimeForm]);

  const resourceLegendList = (
    <div className={`board-legend-list ${isMobileViewport ? "is-mobile-inline" : "is-desktop-grid"}`}>
      {COMPACT_RESOURCE_LEGEND.map((entry) => (
        <div key={entry.resource} className="board-legend-resource" title={entry.note}>
          <span
            className="board-legend-resource-swatch"
            style={{ "--legend-resource-color": TILE_COLORS[entry.resource] } as CSSProperties}
            aria-hidden="true"
          >
            <ResourceIcon resource={entry.resource} tone="light" size={18} />
          </span>
          <div className="board-legend-resource-copy">
            <strong>{renderResourceLabel(entry.resource)}</strong>
            <span>{entry.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
  const harborLegendList = (
    <div className={`board-legend-list ${isMobileViewport ? "is-mobile-inline" : "is-desktop-grid"}`}>
      {COMPACT_HARBOR_LEGEND.map((entry) => (
        <div key={entry.type} className="board-legend-resource board-legend-harbor" title={entry.note}>
          <span className="board-legend-resource-swatch board-legend-harbor-swatch" aria-hidden="true">
            <PortMarkerIcon type={entry.type} size={40} className="board-legend-harbor-icon" />
          </span>
          <div className="board-legend-resource-copy">
            <strong>{entry.type === "generic" ? "3:1-Hafen" : `${renderResourceLabel(entry.type)}-Hafen`}</strong>
            <span>{entry.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
  const boardHintLegend = (
    <div className="board-legend-notes">
      <div className="board-legend-note">
        <span className="legend-signal is-gold" aria-hidden="true" />
        <span>Goldene Hinweise markieren das Live-Geschehen und wichtige Ereignisse auf dem Brett.</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-pulse" aria-hidden="true" />
        <span>Blaue pulsierende Marker zeigen dir, was du gerade anklicken oder bauen kannst.</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-port" aria-hidden="true">⚓</span>
        <span>Häfen liegen an der Küste. Es zählt immer die beste Rate deiner angrenzenden eigenen Siedlung oder Stadt.</span>
      </div>
    </div>
  );
  const compactBoardHintLegend = (
    <div className="board-legend-notes">
      <div className="board-legend-note">
        <span className="legend-signal is-gold" aria-hidden="true" />
        <span>Gold markiert Live-Ereignisse und wichtige Board-Momente.</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-pulse" aria-hidden="true" />
        <span>Blau zeigt gültige Klicks und aktuelle Bauziele.</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-port" aria-hidden="true">&#9875;</span>
        <span>Am Hafen gilt immer die beste Rate deiner angrenzenden Siedlung oder Stadt.</span>
      </div>
    </div>
  );
  const tabPanels: Record<MatchPanelTab, ReactNode> = {
    overview: (
      <div className={`panel-frame overview-frame ${isMobileViewport ? "is-mobile-overview" : ""}`}>
        {props.match.phase === "robber_interrupt" && props.match.robberDiscardStatus.length > 0 ? (
          <section className="dock-section robber-discard-surface">
            <div className="dock-section-head">
              <h3>Räuberphase</h3>
              <span>
                {robberDiscardGroups.pending.length > 0
                  ? `${robberDiscardGroups.pending.length} offen`
                  : "Alle Abwürfe erledigt"}
              </span>
            </div>
            <div className="robber-discard-columns">
              <div className="robber-discard-column">
                <div className="robber-discard-column-head">
                  <strong>Noch offen</strong>
                  <span>{robberDiscardGroups.pending.length}</span>
                </div>
                {robberDiscardGroups.pending.length ? (
                  <div className="robber-discard-list">
                    {robberDiscardGroups.pending.map(({ player, requiredCount }) => (
                        <article key={player.id} className={`robber-discard-row player-accent-${player.color}`}>
                          <PlayerIdentity username={player.username} color={player.color} compact isSelf={player.id === props.match.you} />
                          <div className="robber-discard-row-meta">
                            <span className={`status-pill player-tone-pill player-accent-${player.color} is-warning`}>offen</span>
                            <span>noch {requiredCount} abwerfen</span>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="robber-discard-empty">Niemand muss mehr abwerfen.</div>
                )}
              </div>
              <div className="robber-discard-column">
                <div className="robber-discard-column-head">
                  <strong>Bereits abgeworfen</strong>
                  <span>{robberDiscardGroups.done.length}</span>
                </div>
                {robberDiscardGroups.done.length ? (
                  <div className="robber-discard-list">
                    {robberDiscardGroups.done.map(({ player }) => (
                      <article key={player.id} className={`robber-discard-row player-accent-${player.color}`}>
                        <PlayerIdentity username={player.username} color={player.color} compact isSelf={player.id === props.match.you} />
                        <div className="robber-discard-row-meta">
                          <span className={`status-pill player-tone-pill player-accent-${player.color} is-complete`}>fertig</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="robber-discard-empty">Noch kein Spieler hat den Abwurf abgeschlossen.</div>
                )}
              </div>
            </div>
          </section>
        ) : null}
        {isMobileViewport ? (
          <>
            <section className="dock-section">
              <div className="dock-section-head">
                <h3>Spieler</h3>
                <span>{props.match.players.length} im Match</span>
              </div>
              <div className="mobile-player-list">
                {props.match.players.map((player) => (
                  <article
                    key={player.id}
                    className={`mobile-player-row ${player.id === props.match.currentPlayerId ? "is-active-turn" : ""} ${getPlayerAccentClass(player.color)}`}
                  >
                    <PlayerIdentity
                      username={player.username}
                      color={player.color}
                      compact
                      isSelf={player.id === props.match.you}
                    />
                    <div className="mobile-player-row-meta">
                      <span className="player-meta-pill">{player.publicVictoryPoints} VP</span>
                      <span className="player-meta-pill">{player.resourceCount} Karten</span>
                      {player.hasLongestRoad ? <span className="player-meta-pill is-award">Längste Straße +2 VP</span> : null}
                      {player.hasLargestArmy ? <span className="player-meta-pill is-award">Größte Rittermacht +2 VP</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
        <section className="dock-section dock-section-fill">
          <div className="dock-section-head">
            <h3>Events</h3>
            <span>{notificationState.historyNotifications.length} Einträge</span>
          </div>
          <div className="scroll-list event-list">
            {notificationState.historyNotifications.map((notification) => (
              <MatchNotificationCard
                key={notification.key}
                match={props.match}
                notification={notification}
                variant="feed"
                badgeLimit={4}
              />
            ))}
          </div>
        </section>
        {isMobileViewport ? (
          <section className="dock-section">
            <div className="dock-section-head">
              <h3>Legende</h3>
              <span>Rohstoffe, Häfen und Hinweise</span>
            </div>
            <div className="mobile-legend-stack">
              {resourceLegendList}
              {harborLegendList}
              {compactBoardHintLegend}
            </div>
          </section>
        ) : null}
      </div>
    ),
    actions: (
      <div className="panel-frame actions-frame">
        <section className="dock-section">
          <div className="action-status-card">
            <div className="action-status-head">
              <span className="eyebrow">Nächster Schritt</span>
              <span className="action-status-meta">{renderMatchPlayerText(props.match, turnStatus.title)}</span>
            </div>
            <div className="action-status-copy">
              <span>{renderMatchPlayerText(props.match, turnStatus.detail)}</span>
            </div>
            {turnStatus.callout ? <span className="status-pill is-warning">{turnStatus.callout}</span> : null}
          </div>
        </section>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Bauen</h3>
            <span>Kosten und Voraussetzungen</span>
          </div>
          <div className="build-action-grid">
            {buildActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`build-action-card ${action.active ? "is-active" : action.disabled ? "is-disabled" : "is-ready"}`}
                aria-disabled={action.disabled}
                onPointerEnter={(event) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                }}
                onPointerMove={(event) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                }}
                onPointerLeave={closeBuildActionTooltip}
                onMouseEnter={(event) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                }}
                onMouseLeave={closeBuildActionTooltip}
                onFocus={(event) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                }}
                onBlur={closeBuildActionTooltip}
                onClick={() => {
                  if (action.disabled) {
                    return;
                  }

                  action.onClick();
                }}
              >
                <span className="build-action-head">
                  <strong>{action.label}</strong>
                  <span>{action.costLabel}</span>
                </span>
              </button>
            ))}
          </div>
          {buildActionTooltip && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="floating-build-action-tooltip"
                  role="tooltip"
                  data-placement={buildActionTooltip.placement}
                  style={{ left: buildActionTooltip.left, top: buildActionTooltip.top }}
                >
                  <strong>{buildActionTooltip.title}</strong>
                  {buildActionTooltip.lines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>,
                document.body
              )
            : null}
        </section>
        {developmentCards.length || pendingRoadBuilding ? (
          <section className="dock-section">
            <div className="dock-section-head">
              <h3>Entwicklungskarten</h3>
              <span>{pendingRoadBuilding ? "Straßenbau aktiv" : `${developmentCards.length} in Hand`}</span>
            </div>
            <div className="status-strip development-summary-pills">
              <span className="status-pill">Spielbar {playableDevelopmentCardCount}</span>
              <span className="status-pill">Geheime VP {hiddenVictoryPoints}</span>
              <span className="status-pill">Gesamt VP {totalVictoryPoints}</span>
            </div>
            <button type="button" className="secondary-button" onClick={openHandPanel}>
              Zur Hand
            </button>
          </section>
        ) : null}
      </div>
    ),
    hand: (
      <div className="panel-frame hand-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Entwicklungskarten</h3>
            <span>{developmentCards.length} Karten</span>
          </div>
          <div className="development-hand-summary">
            <div className="development-hand-summary-head">
              <span className="eyebrow">Siegpunkte</span>
              <span className="development-hand-summary-meta">
                Entwicklungskarten auf der Hand: {developmentCards.length}
              </span>
            </div>
            <div className="development-hand-summary-grid">
              <article className="development-hand-summary-card">
                <span>Öffentlich sichtbar</span>
                <strong>{props.selfPlayer?.publicVictoryPoints ?? 0}</strong>
              </article>
              <article className="development-hand-summary-card">
                <span>Geheim aus Karten</span>
                <strong>{hiddenVictoryPoints}</strong>
              </article>
              <article className="development-hand-summary-card is-total">
                <span>Gesamt</span>
                <strong>{totalVictoryPoints}</strong>
              </article>
            </div>
          </div>
          <div className="scroll-list card-list">
            {pendingRoadBuildingCard}
            {developmentCards.length ? (
              developmentCards.map((card) => {
                const status = describeDevelopmentCardStatus(card, props.match);
                return (
                  <article
                    key={card.id}
                    className={`mini-card development-card ${card.playable ? "is-playable" : ""} ${
                      card.type === "victory_point" ? "is-passive" : ""
                    }`}
                  >
                    <div className="development-card-head">
                      <strong>{renderDevelopmentLabel(card.type)}</strong>
                      <span className={`status-pill ${status.toneClass}`}>{status.label}</span>
                    </div>
                    <span>{status.detail}</span>
                    <div className="development-card-actions">{renderDevelopmentCardControls(card)}</div>
                  </article>
                );
              })
            ) : !pendingRoadBuildingCard ? (
              <div className="empty-state">Keine Entwicklungskarten auf der Hand.</div>
            ) : null}
          </div>
        </section>
      </div>
    ),
    trade: (
      <div className="panel-frame trade-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Handel</h3>
          </div>
          {incomingTradeOffer ?? props.match.tradeOffers[0] ? (
            <TradeBanner
              trade={(incomingTradeOffer ?? props.match.tradeOffers[0])!}
              currentUserId={props.match.you}
              match={props.match}
              onAction={props.onAction}
            />
          ) : null}
          <div className="mini-segmented">
            <button type="button" className={tradeSection === "player" ? "is-active" : ""} onClick={() => setTradeSection("player")}>
              Spieler
            </button>
            <button type="button" className={tradeSection === "maritime" ? "is-active" : ""} onClick={() => setTradeSection("maritime")}>
              Hafen
            </button>
          </div>
          {tradeSection === "player" ? (
            <>
              <div className="trade-builder">
                <article className="trade-side-card trade-side-give">
                  <div className="trade-side-head">
                    <span className="eyebrow">Du gibst</span>
                    <strong>{tradeGiveSummary}</strong>
                  </div>
                  <div className="trade-resource-grid-shell">
                    <TradeResourceCardGrid
                      value={selectedTradeGiveResource}
                      resources={RESOURCES.map((resource) => {
                        const available = props.selfPlayer?.resources?.[resource] ?? 0;
                        const drafted = props.tradeForm.give[resource] ?? 0;
                        return {
                          resource,
                          count: available,
                          meta: drafted > 0 ? `${drafted} im Angebot` : "Auf der Hand",
                          disabled: available <= 0
                        };
                      })}
                      onChange={setSelectedTradeGiveResource}
                    />
                  </div>
                  <TradeQuantityControl
                    label="Abgeben"
                    resource={selectedTradeGiveResource}
                    value={selectedTradeGiveCount}
                    min={0}
                    max={selectedTradeGiveMax}
                    disabled={selectedTradeGiveMax <= 0}
                    helper={
                      selectedTradeGiveMax > 0
                        ? `Maximal ${selectedTradeGiveMax} Karten aus deiner Hand.`
                        : "Von diesem Rohstoff hast du aktuell nichts."
                    }
                    onChange={(value) =>
                      props.setTradeForm((current) => ({
                        ...current,
                        give: setTradeDraftCount(
                          current.give,
                          selectedTradeGiveResource,
                          value,
                          props.selfPlayer?.resources?.[selectedTradeGiveResource] ?? 0
                        )
                      }))
                    }
                  />
                  <div className="trade-draft-footer">
                    <span className={`status-pill ${tradeGiveTotal === 0 ? "muted" : ""}`}>{tradeGiveTotal} Karten</span>
                    <span className="trade-draft-footer-copy">{tradeGiveSummary}</span>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={tradeGiveTotal === 0}
                      onClick={() =>
                        props.setTradeForm((current) => ({
                          ...current,
                          give: createEmptyResourceMap()
                        }))
                      }
                    >
                      Leeren
                    </button>
                  </div>
                </article>

                <div className="trade-direction-chip">gegen</div>

                <article className="trade-side-card trade-side-receive">
                  <div className="trade-side-head">
                    <span className="eyebrow">Du erhältst</span>
                    <strong>{tradeWantSummary}</strong>
                  </div>
                  <div className="trade-resource-grid-shell">
                    <TradeResourceCardGrid
                      value={selectedTradeWantResource}
                      resources={RESOURCES.map((resource) => {
                        const drafted = props.tradeForm.want[resource] ?? 0;
                        return {
                          resource,
                          count: drafted,
                          meta: drafted > 0 ? `${drafted} angefragt` : "Anfragen"
                        };
                      })}
                      onChange={setSelectedTradeWantResource}
                    />
                  </div>
                  <TradeQuantityControl
                    label="Erhalten"
                    resource={selectedTradeWantResource}
                    value={selectedTradeWantCount}
                    min={0}
                    helper="Lege die gewünschte Kartenanzahl fest."
                    onChange={(value) =>
                      props.setTradeForm((current) => ({
                        ...current,
                        want: setTradeDraftCount(current.want, selectedTradeWantResource, value, 99)
                      }))
                    }
                  />
                  <div className="trade-draft-footer">
                    <span className={`status-pill ${tradeWantTotal === 0 ? "muted" : ""}`}>{tradeWantTotal} Karten</span>
                    <span className="trade-draft-footer-copy">{tradeWantSummary}</span>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={tradeWantTotal === 0}
                      onClick={() =>
                        props.setTradeForm((current) => ({
                          ...current,
                          want: createEmptyResourceMap()
                        }))
                      }
                    >
                      Leeren
                    </button>
                  </div>
                </article>

                <article
                  className={`trade-target-card ${isCurrentPlayer ? "trade-target-card-dropdown" : "trade-target-card-compact"}`.trim()}
                >
                  <div className="trade-side-head">
                    <span className="eyebrow">Angebot an</span>
                    <strong>
                      {renderMatchPlayerText(
                        props.match,
                        isCurrentPlayer
                          ? props.tradeForm.targetPlayerId
                            ? tradeTargetPlayers.find((player) => player.id === props.tradeForm.targetPlayerId)?.username ?? "Zielspieler"
                            : "Offen für alle"
                          : effectiveTradeTargetPlayer?.username ?? "Aktiver Spieler"
                      )}
                    </strong>
                  </div>
                  {isCurrentPlayer ? (
                    <>
                      <div className={`trade-target-select-shell ${selectedTradeTargetAccentClass}`.trim()}>
                        <span className="trade-target-select-dot" aria-hidden="true" />
                        <select
                          className="trade-target-select"
                          value={normalizedTradeTargetId}
                          onChange={(event) =>
                            props.setTradeForm((current) => ({ ...current, targetPlayerId: event.target.value }))
                          }
                          aria-label="Zielspieler für Handelsangebot"
                        >
                          <option value="">Offen für alle</option>
                          {tradeTargetPlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {`${player.username} · ${renderPlayerColorLabel(player.color)}`}
                            </option>
                          ))}
                        </select>
                        <span className="trade-target-select-caret" aria-hidden="true" />
                      </div>
                      <div className="trade-target-picker">
                      <button
                        type="button"
                        className={`trade-target-option ${props.tradeForm.targetPlayerId === "" ? "is-active" : ""}`}
                        onClick={() => props.setTradeForm((current) => ({ ...current, targetPlayerId: "" }))}
                      >
                        <span className="trade-target-title">Offen für alle</span>
                        <span className="trade-target-copy">Jeder Mitspieler kann annehmen.</span>
                      </button>
                      {tradeTargetPlayers.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          className={`trade-target-option ${getPlayerAccentClass(player.color)} ${props.tradeForm.targetPlayerId === player.id ? "is-active" : ""}`}
                          onClick={() =>
                            props.setTradeForm((current) => ({ ...current, targetPlayerId: player.id }))
                          }
                        >
                          <PlayerIdentity username={player.username} color={player.color} compact />
                          <span className="trade-target-copy">Nur dieser Spieler kann annehmen.</span>
                        </button>
                      ))}
                      </div>
                    </>
                  ) : (
                    <div className="trade-target-placeholder-copy">
                      Gegenangebote gehen immer direkt an den aktiven Spieler.
                    </div>
                  )}
                </article>

                <button
                  type="button"
                  className="primary-button trade-submit-button"
                  disabled={!canSubmitTradeOffer}
                  onClick={props.onOfferTrade}
                >
                  Angebot senden
                </button>
              </div>
            </>
          ) : (
            <div className="trade-builder maritime-builder">
              <article className="trade-side-card trade-side-give">
                <div className="trade-side-head">
                  <span className="eyebrow">Du gibst</span>
                  <strong>{maritimeRatio}x {renderResourceLabel(props.maritimeForm.give)}</strong>
                </div>
                <div className="trade-resource-grid-shell">
                  <TradeResourceCardGrid
                    value={props.maritimeForm.give}
                    resources={RESOURCES.map((resource) => {
                      const ratio = props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === resource)?.ratio ?? 4;
                      const count = props.selfPlayer?.resources?.[resource] ?? 0;
                      return {
                        resource,
                        count,
                        disabled: count < ratio,
                        meta: ratio === 4 ? "4:1 Bank" : `${ratio}:1 Hafen`
                      };
                    })}
                    onChange={(resource) => props.setMaritimeForm((current) => ({ ...current, give: resource }))}
                  />
                </div>
                <TradeQuantityControl
                  label="Abgeben"
                  resource={props.maritimeForm.give}
                  value={maritimeRatio}
                  min={maritimeRatio}
                  max={maritimeRatio}
                  fixed
                  helper={`${maritimeRatio}:1 Hafenrate`}
                  onChange={() => undefined}
                />
              </article>

              <div className="trade-direction-chip">{maritimeRatio}:1</div>

              <article className="trade-side-card trade-side-receive">
                <div className="trade-side-head">
                  <span className="eyebrow">Du erhältst</span>
                  <strong>1x {renderResourceLabel(props.maritimeForm.receive)}</strong>
                </div>
                <div className="trade-resource-grid-shell">
                  <TradeResourceCardGrid
                    value={props.maritimeForm.receive}
                    resources={RESOURCES.map((resource) => ({
                      resource,
                      count: resource === props.maritimeForm.receive ? 1 : 0,
                      meta: resource === props.maritimeForm.receive ? "Ausgewählt" : "Tauschen"
                    }))}
                    onChange={(resource) => props.setMaritimeForm((current) => ({ ...current, receive: resource }))}
                  />
                </div>
                <TradeQuantityControl
                  label="Erhalten"
                  resource={props.maritimeForm.receive}
                  value={1}
                  min={1}
                  max={1}
                  fixed
                  helper="Immer 1 Karte"
                  onChange={() => undefined}
                />
              </article>

              <article className="trade-target-card trade-target-card-placeholder" aria-hidden="true">
                <div className="trade-side-head">
                  <span className="eyebrow">Angebot an</span>
                  <strong>Bank / Hafen</strong>
                </div>
                <div className="trade-target-placeholder-copy">
                  Direkttausch
                </div>
              </article>

              <button
                type="button"
                className="secondary-button trade-submit-button"
                disabled={!isCurrentPlayer || !canSubmitMaritimeTrade}
                onClick={() =>
                  props.onAction({
                    type: "match.action",
                    matchId: props.match.matchId,
                    action: {
                      type: "maritime_trade",
                      give: props.maritimeForm.give,
                      receive: props.maritimeForm.receive,
                      giveCount: maritimeRatio
                    }
                  })
                }
              >
                {maritimeRatio}:1 tauschen
              </button>
            </div>
          )}
        </section>
      </div>
    ),
    players: (
      <div className="panel-frame players-frame">
        <div className="scroll-list player-card-list">
          {props.match.players.map((player) => {
            const presence = getPlayerPresenceState(player, countdownNow);
            return (
              <article
                key={player.id}
                className={`player-card player-surface player-accent-${player.color} ${player.id === props.match.currentPlayerId ? "is-active-turn" : ""}`}
              >
                <div className="player-card-head">
                  <div className="player-card-identity-block">
                    <PlayerIdentity
                      username={player.username}
                      color={player.color}
                      isSelf={player.id === props.match.you}
                      compact
                      meta={null}
                    />
                    <div className="player-card-presence">
                      <span className={`status-pill player-connection-pill ${presence.toneClass}`}>
                        <span className={`online-indicator ${presence.indicatorClass}`} aria-hidden="true" />
                        {presence.label}
                      </span>
                      <span className="player-connection-detail">{presence.detail}</span>
                    </div>
                  </div>
                  <div className="player-card-head-side">
                    <PlayerColorBadge
                      color={player.color}
                      label={player.id === props.match.you ? `Du · ${renderPlayerColorLabel(player.color)}` : renderPlayerColorLabel(player.color)}
                      compact
                    />
                  </div>
                  </div>
                <div className="player-stat-grid player-stat-grid-compact">
                  <PlayerStatCard label="VP" value={String(player.publicVictoryPoints)} />
                  <PlayerStatCard label="Karten" value={String(player.resourceCount)} />
                  <PlayerStatCard label="Straßen" value={String(player.roadsBuilt)} />
                  <PlayerStatCard label="Ritter" value={String(player.playedKnightCount)} />
                </div>
                  <div className="status-strip player-award-strip">
                    {player.id === props.match.currentPlayerId ? (
                      <span className={`status-pill player-badge player-accent-${player.color}`}>Am Zug</span>
                    ) : null}
                    {player.hasLongestRoad ? <span className="status-pill award-pill is-longest-road">Längste Straße +2 VP</span> : null}
                    {player.hasLargestArmy ? <span className="status-pill award-pill is-largest-army">Größte Rittermacht +2 VP</span> : null}
                    {player.id !== props.match.currentPlayerId && !player.hasLargestArmy && !player.hasLongestRoad ? (
                      <span className="status-pill muted">Keine Auszeichnung</span>
                    ) : null}
                  </div>
              </article>
            );
          })}
        </div>
      </div>
    ),
    profile: (
      <div className="panel-frame profile-frame">
        <ProfileMenuPanel {...props.profileMenuProps} inline />
      </div>
    )
  };

  return (
    <section className="screen-shell match-shell">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncementText ?? ""}
      </div>
      <div className="match-screen">
        <div className="match-stage">
          <div className={`board-topbar ${isMobileViewport ? "is-mobile" : ""}`}>
            {isMobileViewport ? (
              <>
                <div
                  className={`board-mobile-summary ${
                    getPlayerAccentClass(getPlayerColor(props.match, displayHeroNotification.accentPlayerId ?? displayHeroNotification.playerId))
                  }`}
                >
                  <MatchNotificationCard
                    key={`mobile-${displayHeroNotification.key}`}
                    match={props.match}
                    notification={displayHeroNotification}
                    variant="hero-mobile"
                  />
                  <span className="board-mobile-meta">
                    <span>Zug {props.match.turn}</span>
                    <span>{formatPhase(props.match.phase)}</span>
                    <span>{boardDiceLabel}</span>
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="board-chip">Zug {props.match.turn}</span>
                <span className="board-chip">{formatPhase(props.match.phase)}</span>
                {activePlayer ? (
                  <PlayerColorBadge
                    color={activePlayer.color}
                    label={`Am Zug · ${activePlayer.id === props.match.you ? "Du" : activePlayer.username}`}
                    compact
                  />
                ) : (
                  <span className="board-chip">Aktiv: -</span>
                )}
                <span className="board-chip">Würfel: {props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : "offen"}</span>
                <button
                  type="button"
                  className={`board-toggle board-toggle-focus ${autoFocusEnabled ? "is-active" : ""}`}
                  onClick={() => setAutoFocusEnabled((current) => !current)}
                >
                  {autoFocusEnabled ? "Auto-Fokus an" : "Auto-Fokus aus"}
                </button>
              </>
            )}
          </div>
          <div className="board-stage-frame">
            <BoardScene
              cameraCue={cameraCue}
              focusCue={highlightCue}
              interactionMode={props.interactionMode}
              onEdgeSelect={props.onEdgeSelect}
              onTileSelect={props.onTileSelect}
              onVertexSelect={props.onVertexSelect}
              selectedRoadEdges={props.selectedRoadEdges}
              snapshot={props.match}
              visualSettings={props.boardVisualSettings}
            />
            {showIncomingTradeAlert && incomingTradeOffer ? (
              <TradeBanner
                className={`is-board-alert ${isMobileViewport ? "is-mobile" : ""}`}
                trade={incomingTradeOffer}
                currentUserId={props.match.you}
                match={props.match}
                onAction={props.onAction}
                onOpenTrade={openTradePanel}
              />
            ) : null}
            <div className={`board-hud ${boardHudOpen ? "is-open" : "is-collapsed"}`}>
              {isMobileViewport ? (
                <button
                  type="button"
                  className={`board-toggle board-hud-toggle ${boardHudOpen ? "is-active" : ""}`}
                  onClick={() => setBoardHudOpen((current) => !current)}
                >
                  {boardHudOpen ? "HUD schließen" : mobileHudSummary}
                </button>
              ) : null}
              {!isMobileViewport || boardHudOpen ? (
                <div className={`board-hud-panel ${isMobileViewport ? "is-mobile" : ""}`}>
                  {!isMobileViewport && props.selfPlayer ? (
                    <div className="board-hud-row">
                      <PlayerColorBadge
                        color={props.selfPlayer.color}
                        label={`Du · ${props.selfPlayer.username} · ${renderPlayerColorLabel(props.selfPlayer.color)}`}
                      />
                    </div>
                  ) : null}
                  <div className="board-hud-row board-hud-resources">
                    {RESOURCES.map((resource) => (
                      <span
                        key={resource}
                        className="board-hud-pill"
                        title={renderResourceLabel(resource)}
                        aria-label={`${renderResourceLabel(resource)}: ${props.selfPlayer?.resources?.[resource] ?? 0}`}
                      >
                        <span className="board-hud-pill-head">
                          <ResourceIcon resource={resource} shell size={15} />
                        </span>
                        <span>{props.selfPlayer?.resources?.[resource] ?? 0}</span>
                      </span>
                    ))}
                  </div>
                  <div className="board-hud-row board-hud-stats">
                    <span className="board-hud-pill">
                      <strong>VP</strong>
                      <span>{totalVictoryPoints}</span>
                    </span>
                    <span className="board-hud-pill">
                      <strong>Hand</strong>
                      <span>{totalResources(props.selfPlayer?.resources ?? createEmptyResourceMap())}</span>
                    </span>
                    <span className="board-hud-pill">
                      <strong>Entwicklung</strong>
                      <span>{props.selfPlayer?.developmentCardCount ?? 0}</span>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
            {!isMobileViewport ? (
              <div className={`board-legend ${boardLegendOpen ? "is-open" : "is-collapsed"}`}>
                <button
                  type="button"
                  className={`board-legend-toggle ${boardLegendOpen ? "is-open" : ""}`}
                  onClick={() => setBoardLegendOpen((current) => !current)}
                  aria-expanded={boardLegendOpen}
                >
                  <span className="board-legend-toggle-copy">
                    <strong>Legende</strong>
                    <span>Rohstoffe, Häfen und Brett-Hinweise</span>
                  </span>
                  <span className="board-legend-toggle-icon" aria-hidden="true">
                    {boardLegendOpen ? "-" : "+"}
                  </span>
                </button>
                {boardLegendOpen ? (
                  <div className="board-legend-panel">
                    <div className="board-legend-section">
                      <span className="eyebrow">Spielfeldfarben</span>
                      {resourceLegendList}
                    </div>
                    <div className="board-legend-section">
                      <span className="eyebrow">Häfen</span>
                      {harborLegendList}
                    </div>
                    <div className="board-legend-section">
                      <span className="eyebrow">Brett-Hinweise</span>
                      {compactBoardHintLegend}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!isMobileViewport ? (
              <div className={`board-spotlight ${isCompactViewport ? "is-compact" : ""}`.trim()}>
                <MatchNotificationCard
                  key={`desktop-${displayHeroNotification.key}`}
                  match={props.match}
                  notification={displayHeroNotification}
                  variant="hero"
                  badgeLimit={isCompactViewport ? 2 : 4}
                />
              </div>
            ) : null}
            <div
              className={`board-dice-widget ${diceDisplay.phase === "expand" ? "is-expanding" : ""} ${
                diceDisplay.phase === "rolling" ? "is-rolling" : ""
              } ${diceDisplay.phase === "settle" ? "is-settling" : ""} ${isMobileViewport ? "is-mobile" : ""}`}
            >
              <div className="board-dice-head">
                <span className="eyebrow">Wurf</span>
                <strong>{hasRevealedDiceResult ? diceDisplay.total : "?"}</strong>
              </div>
              <div className="board-dice-row" aria-live="polite">
                <DiceFace value={diceDisplay.left} />
                <DiceFace value={diceDisplay.right} />
              </div>
              <span className="board-dice-copy">
                {diceDisplay.actorName
                  ? diceDisplay.phase !== "idle"
                    ? renderMatchPlayerText(props.match, `${diceDisplay.actorName} würfelt...`)
                    : renderMatchPlayerText(props.match, `${diceDisplay.actorName} hat ${diceDisplay.total ?? "-"} gewürfelt`)
                  : "Warte auf den nächsten Wurf."}
              </span>
            </div>
          </div>
        </div>

        <aside className="surface match-dock">
          <div className="match-dock-head">
            <div className="match-dock-head-copy">
              <div className="eyebrow">Partie</div>
              <h2>Kontrollzentrum</h2>
            </div>
            <div className="match-dock-context">
              <span className="status-pill muted">Raumcode {props.room?.code ?? "Unbekannt"}</span>
              <span className="status-pill muted">Zug {props.match.turn}</span>
            </div>
          </div>
          {hasQuickActions ? renderQuickActions(false) : null}
          <div className="tab-strip center-last-item" style={getTabStripStyle(MATCH_TABS, 3)} role="tablist" aria-label="Match Navigation">
            {MATCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                style={getTabButtonStyle(MATCH_TABS, tab.id, 3)}
                className={`${activeTab === tab.id ? "is-active" : ""} ${tab.id === "trade" && incomingTradeCount > 0 ? "has-alert" : ""}`.trim()}
                onClick={() => changeActiveTab(tab.id)}
              >
                {renderTabLabel(tab)}
              </button>
            ))}
          </div>
          {renderActiveTabPanel()}
        </aside>

        <section className={`surface match-sheet is-${effectiveSheetState}`}>
          <div
            className={`match-sheet-summary ${isMobileViewport ? "is-mobile" : ""} ${
              getPlayerAccentClass(getPlayerColor(props.match, turnStatus.playerId))
            }`.trim()}
          >
            <div className="match-sheet-summary-head">
              {turnStatus.playerId ? <PlayerBadge match={props.match} playerId={turnStatus.playerId} compact /> : null}
              <span className="match-sheet-summary-meta">{`${formatPhase(props.match.phase)} · Zug ${props.match.turn}`}</span>
            </div>
            <div className="match-sheet-summary-copy">
              <strong>{renderMatchPlayerText(props.match, turnStatus.title)}</strong>
              {effectiveSheetState !== "peek" ? (
                <span className="match-sheet-summary-detail">{renderMatchPlayerText(props.match, turnStatus.detail)}</span>
              ) : null}
              {effectiveSheetState !== "peek" && turnStatus.callout ? (
                <span className="status-pill is-warning">{turnStatus.callout}</span>
              ) : null}
            </div>
          </div>
          {effectiveSheetState !== "peek" && hasQuickActions ? <div className="sheet-quick-actions">{renderQuickActions(false)}</div> : null}
          {effectiveSheetState !== "peek" ? (
            <div
              className={`tab-strip mobile ${visibleTabs.length > 4 ? "has-five-tabs center-last-item" : ""}`.trim()}
              style={getTabStripStyle(visibleTabs, visibleTabs.length > 4 ? 3 : 2)}
              role="tablist"
              aria-label="Mobile Match Navigation"
            >
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  style={getTabButtonStyle(visibleTabs, tab.id, visibleTabs.length > 4 ? 3 : 2)}
                  className={`${activeTab === tab.id ? "is-active" : ""} ${tab.id === "trade" && incomingTradeCount > 0 ? "has-alert" : ""}`.trim()}
                  onClick={() => changeActiveTab(tab.id)}
                >
                  {renderTabLabel(tab)}
                </button>
              ))}
            </div>
          ) : null}
          {effectiveSheetState !== "peek" ? renderActiveTabPanel(true) : null}
        </section>
      </div>
    </section>
  );
}

