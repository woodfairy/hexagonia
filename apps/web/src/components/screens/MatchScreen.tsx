import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type {
  ClientMessage,
  DevelopmentCardView,
  MatchSnapshot,
  PlayerColor,
  PortType,
  Resource,
  ResourceMap,
  RoomDetails
} from "@hexagonia/shared";
import { createEmptyResourceMap, equalResourceMaps, hasResources, isEmptyResourceMap, RESOURCES, totalResources } from "@hexagonia/shared";
import { BoardScene, type BoardFocusBadge, type BoardFocusCue, type InteractionMode } from "../../BoardScene";
import { type BoardVisualSettings, TILE_COLORS } from "../../boardVisuals";
import { PortMarkerIcon, ResourceIcon } from "../../resourceIcons";
import { PlayerColorBadge, PlayerIdentity } from "../shared/PlayerIdentity";
import { formatPhase, getPlayerAccentClass, renderEventLabel, renderPlayerColorLabel, renderResourceLabel, renderResourceMap } from "../../ui";

export interface TradeFormState {
  give: ResourceMap;
  want: ResourceMap;
  targetPlayerId: string;
}

export interface MaritimeFormState {
  give: Resource;
  receive: Resource;
}

type MatchPanelTab = "overview" | "actions" | "hand" | "trade" | "players";
type SheetState = "peek" | "half" | "full";
type TradeSection = "player" | "maritime";
type BuildActionId = "road" | "settlement" | "city" | "development";

const MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "overview", label: "Überblick" },
  { id: "actions", label: "Aktionen" },
  { id: "hand", label: "Hand" },
  { id: "trade", label: "Handel" },
  { id: "players", label: "Spieler" }
];

const MOBILE_MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "actions", label: "Aktionen" },
  { id: "hand", label: "Hand" },
  { id: "trade", label: "Handel" },
  { id: "overview", label: "Mehr" }
];

const BUILD_COSTS: Record<BuildActionId, Partial<Record<Resource, number>>> = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { grain: 2, ore: 3 },
  development: { grain: 1, wool: 1, ore: 1 }
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
let dicePreviewCursor = 0;

const COMPACT_RESOURCE_LEGEND: Array<{ resource: Resource | "desert"; note: string }> = [
  { resource: "brick", note: "Strassen, Siedlungen" },
  { resource: "lumber", note: "Strassen, Siedlungen" },
  { resource: "ore", note: "Staedte, Entwicklung" },
  { resource: "grain", note: "Siedlungen, Staedte, Entwicklung" },
  { resource: "wool", note: "Siedlungen, Entwicklung" },
  { resource: "desert", note: "Kein Ertrag, Startfeld des Raeubers" }
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

interface FocusableEventResult {
  cue: BoardFocusCue;
  event: MatchSnapshot["eventLog"][number];
}

interface TurnStatus {
  title: string;
  detail: string;
  playerId?: string;
}

interface DiceDisplayState {
  left: number | null;
  right: number | null;
  total: number | null;
  phase: "idle" | "expand" | "rolling" | "settle";
  actorName: string | null;
}

const DICE_EXPAND_MS = 150;
const DICE_ROLL_MS = 560;
const DICE_SETTLE_MS = 260;

export function MatchScreen(props: {
  boardVisualSettings: BoardVisualSettings;
  match: MatchSnapshot;
  room: RoomDetails | null;
  selfPlayer: MatchSnapshot["players"][number] | null;
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

  const activePlayer = props.match.players.find((player) => player.id === props.match.currentPlayerId) ?? null;
  const isCurrentPlayer = props.match.currentPlayerId === props.match.you;
  const recentEvents = useMemo(() => props.match.eventLog.slice(-5).reverse(), [props.match.eventLog]);
  const recentFocusableEvent = useMemo(() => getLatestFocusableEventSinceLatestDice(props.match), [props.match]);
  const isDiceAnimationActive =
    (latestDiceEvent?.id ?? null) !== seenDiceEventIdRef.current || diceDisplay.phase !== "idle";
  const visibleRecentFocusableEvent =
    isDiceAnimationActive ? null : recentFocusableEvent;
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
  const highlightCue = actionCue ?? visibleRecentFocusableEvent?.cue ?? null;
  const shouldAutoFocusRecentEvent =
    !!visibleRecentFocusableEvent &&
    (visibleRecentFocusableEvent.event.type === "dice_rolled" ||
      visibleRecentFocusableEvent.event.type === "resources_distributed" ||
      visibleRecentFocusableEvent.event.byPlayerId !== props.match.you);
  const cameraCue =
    autoFocusEnabled && !isDiceAnimationActive
      ? (actionCue ?? (shouldAutoFocusRecentEvent ? (visibleRecentFocusableEvent?.cue ?? null) : null))
      : null;
  const spotlightCue = isDiceAnimationActive ? null : cameraCue ?? actionCue ?? visibleRecentFocusableEvent?.cue ?? null;
  const tradeTargetPlayers = isCurrentPlayer
    ? props.match.players.filter((player) => player.id !== props.match.you)
    : props.match.players.filter((player) => player.id === props.match.currentPlayerId);
  const maritimeRatio =
    props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === props.maritimeForm.give)?.ratio ?? 4;
  const maritimeRateOriginLabel = getMaritimeRateOriginLabel(props.match, props.match.you, props.maritimeForm.give, maritimeRatio);
  const maritimeRatePillLabel = `${maritimeRatio}:1`;
  const tradeGiveTotal = totalResources(props.tradeForm.give);
  const tradeWantTotal = totalResources(props.tradeForm.want);
  const tradeGiveSummary = renderResourceMap(props.tradeForm.give) || "Noch nichts im Angebot";
  const tradeWantSummary = renderResourceMap(props.tradeForm.want) || "Noch nichts angefragt";
  const effectiveTradeTargetPlayer = !isCurrentPlayer ? activePlayer : null;
  const selectedTradeGiveCount = props.tradeForm.give[selectedTradeGiveResource] ?? 0;
  const selectedTradeWantCount = props.tradeForm.want[selectedTradeWantResource] ?? 0;
  const selectedTradeGiveMax = props.selfPlayer?.resources?.[selectedTradeGiveResource] ?? 0;
  const affordableMaritimeGiveResources = RESOURCES.filter((resource) => {
    const ratio = props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === resource)?.ratio ?? 4;
    return (props.selfPlayer?.resources?.[resource] ?? 0) >= ratio;
  });
  const turnStatus = getTurnStatus(props.match, activePlayer, props.selfPlayer, props.interactionMode, props.selectedRoadEdges.length);
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
    !isEmptyResourceMap(props.tradeForm.give) &&
    !isEmptyResourceMap(props.tradeForm.want) &&
    hasResources(props.selfPlayer?.resources ?? createEmptyResourceMap(), props.tradeForm.give);
  const canSubmitMaritimeTrade = (props.selfPlayer?.resources?.[props.maritimeForm.give] ?? 0) >= maritimeRatio;
  const canPlayYearOfPlenty = canBankPayYearOfPlenty(props.match.bank, props.yearOfPlenty);
  const developmentCards = props.selfPlayer?.developmentCards ?? [];
  const hiddenVictoryPoints = props.selfPlayer?.hiddenVictoryPoints ?? 0;
  const totalVictoryPoints = props.selfPlayer?.totalVictoryPoints ?? props.selfPlayer?.publicVictoryPoints ?? 0;
  const pendingRoadBuilding =
    props.match.pendingDevelopmentEffect?.type === "road_building" ? props.match.pendingDevelopmentEffect : null;
  const playableDevelopmentCardCount =
    isCurrentPlayer && !pendingRoadBuilding && (props.match.phase === "turn_roll" || props.match.phase === "turn_action")
      ? developmentCards.filter((card) => card.playable).length
      : 0;
  const mobileHudSummary = props.selfPlayer
    ? `${totalVictoryPoints} VP gesamt · ${props.selfPlayer.resourceCount} Karten`
    : "HUD";
  const boardDiceLabel = props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : "Wurf offen";
  const mobileBoardSummary = activePlayer
    ? activePlayer.id === props.match.you
      ? "Du bist am Zug"
      : `${activePlayer.username} ist am Zug`
    : "Warte auf Spieler";
  const hasRevealedDiceResult = diceDisplay.phase === "idle" && diceDisplay.total !== null;
  const visibleTabs = isMobileViewport ? MOBILE_MATCH_TABS : MATCH_TABS;
  const spotlightBadges = isCompactViewport ? spotlightCue?.badges?.slice(0, 1) : spotlightCue?.badges;
  const effectiveSheetState: SheetState = isMobileViewport ? "full" : sheetState;
  const showIncomingTradeAlert = !!incomingTradeOffer && (activeTab !== "trade" || effectiveSheetState === "peek");
  const openTradePanel = () => {
    setTradeSection("player");
    setActiveTab("trade");
    if (effectiveSheetState === "peek") {
      setSheetState("half");
    }
  };
  const openHandPanel = () => {
    setActiveTab("hand");
    if (effectiveSheetState === "peek") {
      setSheetState("half");
    }
  };
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
    },
    {
      id: "cancel-mode",
      label: "Auswahl aufheben",
      className: "ghost-button",
      disabled: !props.interactionMode,
      onClick: () => {
        props.setInteractionMode(null);
        props.setSelectedRoadEdges([]);
      }
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
          <button key={action.id} type="button" className={action.className} disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    ) : showPlaceholder ? (
      <div className="action-placeholder">
        <strong>{turnStatus.title}</strong>
        <span>{turnStatus.detail}</span>
      </div>
    ) : null;

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
    if (isMobileViewport && activeTab === "players") {
      setActiveTab("overview");
    }
  }, [activeTab, isMobileViewport]);

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
        left: props.match.dice?.[0] ?? getPayloadDice(latestDiceEvent?.payload ?? {}, "dice")?.[0] ?? null,
        right: props.match.dice?.[1] ?? getPayloadDice(latestDiceEvent?.payload ?? {}, "dice")?.[1] ?? null,
        total:
          getPayloadNumber(latestDiceEvent?.payload ?? {}, "total") ??
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

    const actualDice = getPayloadDice(latestDiceEvent.payload, "dice") ?? props.match.dice;
    const total = getPayloadNumber(latestDiceEvent.payload, "total") ?? (actualDice ? actualDice[0] + actualDice[1] : null);
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
        <span>Blau zeigt gueltige Klicks und aktuelle Bauziele.</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-port" aria-hidden="true">&#9875;</span>
        <span>Am Hafen gilt immer die beste Rate deiner angrenzenden Siedlung oder Stadt.</span>
      </div>
    </div>
  );
  const activePlayerSummaryClassName = [
    "match-overview-summary",
    activePlayer ? "player-surface" : "",
    activePlayer ? getPlayerAccentClass(activePlayer.color) : ""
  ]
    .join(" ")
    .trim();

  const tabPanels: Record<MatchPanelTab, ReactNode> = {
    overview: (
      <div className={`panel-frame overview-frame ${isMobileViewport ? "is-mobile-overview" : ""}`}>
        <section className={activePlayerSummaryClassName}>
          <div className="match-overview-summary-head">
            <span className="eyebrow">Am Zug</span>
            {activePlayer ? (
              <div className="match-overview-summary-player">
                <span className="player-swatch" aria-hidden="true" />
                <div className="match-overview-summary-player-copy">
                  <strong className="player-name-text">{activePlayer.username}</strong>
                  <span>{activePlayer.id === props.match.you ? `Du spielst ${renderPlayerColorLabel(activePlayer.color)}` : renderPlayerColorLabel(activePlayer.color)}</span>
                </div>
              </div>
            ) : (
              <strong className="match-overview-summary-empty">-</strong>
            )}
          </div>
          <div className="match-overview-summary-meta">
            <article className="match-overview-summary-metric">
              <span>Phase</span>
              <strong>{formatPhase(props.match.phase)}</strong>
            </article>
            <article className="match-overview-summary-metric">
              <span>Würfel</span>
              <strong>{boardDiceLabel}</strong>
            </article>
          </div>
        </section>
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
          </>
        ) : null}
        <section className="dock-section dock-section-fill">
          <div className="dock-section-head">
            <h3>Letzte Aktionen</h3>
            <span>{formatPhase(props.match.phase)}</span>
          </div>
          <div className="scroll-list event-list">
            {recentEvents.map((event) => (
              (() => {
                const summary = getEventSummary(props.match, event);
                return (
                  <article key={event.id} className="event-card">
                    <div className="event-card-head">
                      <strong>{renderEventLabel(event.type)}</strong>
                      {event.byPlayerId ? (
                        <PlayerBadge match={props.match} playerId={event.byPlayerId} compact />
                      ) : null}
                    </div>
                    {summary ? <span>{summary}</span> : null}
                    <span>Zug {event.atTurn}</span>
                  </article>
                );
              })()
            ))}
          </div>
        </section>
      </div>
    ),
    actions: (
      <div className="panel-frame actions-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Jetzt möglich</h3>
            <span>{turnStatus.title}</span>
          </div>
          <div className="action-placeholder">
            <strong>{turnStatus.title}</strong>
            <span>{turnStatus.detail}</span>
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
                className={`build-action-card ${action.active ? "is-active" : ""}`}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                <span className="build-action-head">
                  <strong>{action.label}</strong>
                  <span>{action.costLabel}</span>
                </span>
                <span className="build-action-note">{action.note}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Entwicklungskarten</h3>
            <span>Spielbar: {playableDevelopmentCardCount}</span>
          </div>
          <article className="mini-card development-summary-card">
            <strong>{pendingRoadBuilding ? "Straßenbau-Effekt läuft" : "Direkt aus der Hand spielen"}</strong>
            <span>
              {pendingRoadBuilding
                ? `Es sind noch ${pendingRoadBuilding.remainingRoads} kostenlose ${pendingRoadBuilding.remainingRoads === 1 ? "Straße" : "Straßen"} offen.`
                : "Alle Entwicklungskarten werden in der Hand erklärt und von dort direkt ausgespielt."}
            </span>
          </article>
          <div className="status-strip development-summary-pills">
            <span className="status-pill">Hand {developmentCards.length}</span>
            <span className="status-pill">Geheime VP {hiddenVictoryPoints}</span>
            <span className="status-pill">Gesamt VP {totalVictoryPoints}</span>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={openHandPanel}
            disabled={!developmentCards.length && !pendingRoadBuilding}
          >
            Zur Hand wechseln
          </button>
        </section>
      </div>
    ),
    hand: (
      <div className="panel-frame hand-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Entwicklungskarten</h3>
            <span>{developmentCards.length} Karten</span>
          </div>
          <div className="status-strip development-summary-pills development-summary-pills-hand">
            <span className="status-pill">Öffentlich {props.selfPlayer?.publicVictoryPoints ?? 0}</span>
            <span className="status-pill">Geheim {hiddenVictoryPoints}</span>
            <span className="status-pill">Gesamt {totalVictoryPoints}</span>
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
            <span>{tradeSection === "player" ? "Spieler" : "Hafen"}</span>
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
                    <span>Stelle dein Angebot aus beliebigen Rohstoffen deiner Hand zusammen.</span>
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
                    <span>Fordere eine beliebige Kombination von Rohstoffen an.</span>
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

                <article className="trade-target-card">
                  <div className="trade-side-head">
                    <span className="eyebrow">Angebot an</span>
                    <strong>
                      {isCurrentPlayer
                        ? props.tradeForm.targetPlayerId
                          ? tradeTargetPlayers.find((player) => player.id === props.tradeForm.targetPlayerId)?.username ?? "Zielspieler"
                          : "Offen für alle"
                        : effectiveTradeTargetPlayer?.username ?? "Aktiver Spieler"}
                    </strong>
                  </div>
                  {isCurrentPlayer ? (
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
                  <div className="trade-rate-row">
                    <span className="trade-rate-pill">{maritimeRatePillLabel}</span>
                    <span className="trade-rate-copy">{maritimeRateOriginLabel}</span>
                  </div>
                  <span>Nur Rohstoffe mit ausreichender Anzahl sind auswählbar.</span>
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
                  helper={`${maritimeRatio}:1 mit deiner aktuell besten Hafenrate.`}
                  onChange={() => undefined}
                />
              </article>

              <div className="trade-direction-chip">{maritimeRatio}:1</div>

              <article className="trade-side-card trade-side-receive">
                <div className="trade-side-head">
                  <span className="eyebrow">Du erhältst</span>
                  <strong>1x {renderResourceLabel(props.maritimeForm.receive)}</strong>
                  <span>Wähle den Zielrohstoff für den Seehandel.</span>
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
                  helper="Du erhältst im Seehandel immer genau 1 Karte."
                  onChange={() => undefined}
                />
              </article>

              <article className="trade-target-card trade-target-card-placeholder" aria-hidden="true">
                <div className="trade-side-head">
                  <span className="eyebrow">Angebot an</span>
                  <strong>Bank / Hafen</strong>
                </div>
                <div className="trade-target-placeholder-copy">
                  Kein Zielspieler nötig. Du tauschst direkt mit dem Hafen.
                </div>
              </article>

              <button
                type="button"
                className="secondary-button trade-submit-button"
                disabled={!isCurrentPlayer || props.match.phase !== "turn_action" || !canSubmitMaritimeTrade}
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
                      <PlayerColorBadge color={player.color} label={renderPlayerColorLabel(player.color)} compact />
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
    )
  };

  return (
    <section className="screen-shell match-shell">
      <div className="match-screen">
        <div className="match-stage">
          <div className={`board-topbar ${isMobileViewport ? "is-mobile" : ""}`}>
            {isMobileViewport ? (
              <>
                <div className={`board-mobile-summary ${activePlayer ? getPlayerAccentClass(activePlayer.color) : ""}`}>
                  <span className="eyebrow">Partie</span>
                  <strong>{mobileBoardSummary}</strong>
                  <span className="board-mobile-meta">
                    <span>Zug {props.match.turn}</span>
                    <span>{formatPhase(props.match.phase)}</span>
                    <span>{boardDiceLabel}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className={`board-toggle board-toggle-focus ${autoFocusEnabled ? "is-active" : ""}`}
                  onClick={() => setAutoFocusEnabled((current) => !current)}
                >
                  {autoFocusEnabled ? "Fokus an" : "Fokus aus"}
                </button>
              </>
            ) : (
              <>
                <span className="board-chip">Zug {props.match.turn}</span>
                <span className="board-chip">{formatPhase(props.match.phase)}</span>
                {activePlayer ? (
                  <PlayerColorBadge color={activePlayer.color} label={`Am Zug: ${activePlayer.username}`} compact />
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
                        label={`Du: ${props.selfPlayer.username} - ${renderPlayerColorLabel(props.selfPlayer.color)}`}
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
                      <strong>Öff. VP</strong>
                      <span>{props.selfPlayer?.publicVictoryPoints ?? 0}</span>
                    </span>
                    <span className="board-hud-pill">
                      <strong>Geheim</strong>
                      <span>{hiddenVictoryPoints}</span>
                    </span>
                    <span className="board-hud-pill">
                      <strong>Gesamt</strong>
                      <span>{totalVictoryPoints}</span>
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
            {!isMobileViewport && spotlightCue ? (
              <div
                className={`board-spotlight ${spotlightCue.mode === "event" ? "is-event" : "is-action"} ${isCompactViewport ? "is-compact" : ""}`}
              >
                <span className="eyebrow">{spotlightCue.mode === "event" ? "Live-Geschehen" : "Deine Aktion"}</span>
                <strong>{spotlightCue.title}</strong>
                {!isCompactViewport ? <span className="board-spotlight-detail">{spotlightCue.detail}</span> : null}
                {spotlightBadges?.length ? (
                  <div className="board-spotlight-badges">
                    {spotlightBadges.map((badge, index) => {
                      const badgeColor = badge.playerId ? getPlayerColor(props.match, badge.playerId) : null;
                      const badgeAccentClass = badgeColor ? getPlayerAccentClass(badgeColor) : "";
                      return (
                        <span
                          key={`${badge.playerId ?? badge.tone ?? "neutral"}-${badge.label}-${index}`}
                          className={`board-spotlight-badge ${
                            badge.tone === "player" && badgeAccentClass ? `is-player ${badgeAccentClass}` : ""
                          } ${badge.tone === "warning" ? "is-warning" : ""}`}
                        >
                          {badge.tone === "player" && badgeAccentClass ? (
                            <span className={`board-spotlight-badge-swatch ${badgeAccentClass}`} aria-hidden="true" />
                          ) : null}
                          <span>{badge.label}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
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
                    ? `${diceDisplay.actorName} würfelt...`
                    : `${diceDisplay.actorName} hat ${diceDisplay.total ?? "-"} gewürfelt`
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
          <div className="tab-strip" role="tablist" aria-label="Match Navigation">
            {MATCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${activeTab === tab.id ? "is-active" : ""} ${tab.id === "trade" && incomingTradeCount > 0 ? "has-alert" : ""}`.trim()}
                onClick={() => setActiveTab(tab.id)}
              >
                {renderTabLabel(tab)}
              </button>
            ))}
          </div>
          <div className="tab-panel-shell">{tabPanels[activeTab]}</div>
        </aside>

        <section className={`surface match-sheet is-${effectiveSheetState}`}>
          <div className={`match-sheet-summary ${isMobileViewport ? "is-mobile" : ""}`}>
            {turnStatus.playerId ? <PlayerBadge match={props.match} playerId={turnStatus.playerId} compact /> : null}
            <strong>{turnStatus.title}</strong>
            <span>{`${formatPhase(props.match.phase)} · Zug ${props.match.turn}`}</span>
            {effectiveSheetState !== "peek" ? <span>{turnStatus.detail}</span> : null}
          </div>
          {effectiveSheetState !== "peek" && hasQuickActions ? <div className="sheet-quick-actions">{renderQuickActions(false)}</div> : null}
          {effectiveSheetState !== "peek" ? (
            <div className="tab-strip mobile" role="tablist" aria-label="Mobile Match Navigation">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`${activeTab === tab.id ? "is-active" : ""} ${tab.id === "trade" && incomingTradeCount > 0 ? "has-alert" : ""}`.trim()}
                  onClick={() => {
                    setActiveTab(tab.id);
                  }}
                >
                  {renderTabLabel(tab)}
                </button>
              ))}
            </div>
          ) : null}
          {effectiveSheetState !== "peek" ? <div className="tab-panel-shell mobile">{tabPanels[activeTab]}</div> : null}
        </section>
      </div>
    </section>
  );
}

function TradeResourceCardGrid(props: {
  value: Resource;
  resources: Array<{
    resource: Resource;
    count: number;
    meta?: string;
    disabled?: boolean;
  }>;
  onChange: (resource: Resource) => void;
}) {
  return (
    <div className="trade-resource-card-grid" role="listbox" aria-label="Rohstoff auswählen">
      {props.resources.map(({ resource, count, meta, disabled }) => (
        <button
          key={resource}
          type="button"
          className={`trade-resource-card resource-card ${props.value === resource ? "is-active" : ""}`}
          onClick={() => props.onChange(resource)}
          title={renderResourceLabel(resource)}
          aria-label={renderResourceLabel(resource)}
          aria-selected={props.value === resource}
          disabled={disabled ?? false}
        >
          <div className="trade-resource-card-head">
            <ResourceIcon resource={resource} shell />
            <strong>{renderResourceLabel(resource)}</strong>
          </div>
          <span className="trade-resource-card-count">{count}</span>
          <span className="trade-resource-card-meta">{meta ?? "Auf der Hand"}</span>
        </button>
      ))}
    </div>
  );
}

function TradeQuantityControl(props: {
  label: string;
  resource: Resource;
  value: number;
  min: number;
  max?: number;
  disabled?: boolean;
  fixed?: boolean;
  helper: string;
  onChange: (value: number | string) => void;
}) {
  const max = props.max ?? 99;
  const canDecrement = !props.fixed && !props.disabled && props.value > props.min;
  const canIncrement = !props.fixed && !props.disabled && props.value < max;

  return (
    <div className={`trade-quantity-card ${props.disabled ? "is-disabled" : ""} ${props.fixed ? "is-fixed" : ""}`}>
      <div className="trade-quantity-head">
        <div className="trade-quantity-copy">
          <span className="eyebrow">{props.label}</span>
          <strong>{renderResourceLabel(props.resource)}</strong>
        </div>
        <span className="trade-quantity-badge">{props.value}x</span>
      </div>
      {props.fixed ? (
        <div className="trade-quantity-fixed">
          <span className="trade-quantity-fixed-value">{props.value}x</span>
          <span className="trade-quantity-fixed-copy">{renderResourceLabel(props.resource)}</span>
        </div>
      ) : (
        <div className="trade-quantity-stepper">
          <div className="trade-quantity-buttons">
            <button type="button" className="trade-quantity-button" disabled={!canDecrement} onClick={() => props.onChange(props.value - 1)}>
              -
            </button>
            <button type="button" className="trade-quantity-button" disabled={!canIncrement} onClick={() => props.onChange(props.value + 1)}>
              +
            </button>
          </div>
          <div className="trade-quantity-input-row">
            <input
              type="number"
              inputMode="numeric"
              className="trade-quantity-input"
              min={props.min}
              max={props.max}
              disabled={props.disabled}
              value={props.value}
              onChange={(event) => props.onChange(event.target.value)}
            />
          </div>
        </div>
      )}
      <span className="trade-quantity-helper">{props.helper}</span>
      <span className="trade-quantity-summary">Aktuell: {props.value}x {renderResourceLabel(props.resource)}</span>
    </div>
  );
}

function DiceFace(props: { value: number | null }) {
  const positions = getDicePipPositions(props.value);
  return (
    <span className={`dice-face ${props.value === null ? "is-empty" : ""}`}>
      {positions.length ? (
        positions.map((position) => (
          <span key={position} className={`dice-pip is-${position}`} aria-hidden="true" />
        ))
      ) : (
        <span className="dice-face-copy">-</span>
      )}
    </span>
  );
}

function clampTradeDraftCount(value: number | string, maxAvailable: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const sanitized = Number.isFinite(numeric) ? Math.floor(numeric) : 0;
  if (maxAvailable <= 0) {
    return 0;
  }

  return Math.min(Math.max(sanitized, 0), maxAvailable);
}

function setTradeDraftCount(
  draft: ResourceMap,
  resource: Resource,
  value: number | string,
  maxAvailable: number
): ResourceMap {
  const next = createEmptyResourceMap();

  for (const currentResource of RESOURCES) {
    next[currentResource] =
      currentResource === resource
        ? clampTradeDraftCount(value, maxAvailable)
        : draft[currentResource] ?? 0;
  }

  return next;
}

function TradeBanner(props: {
  match: MatchSnapshot;
  trade: MatchSnapshot["tradeOffers"][number];
  currentUserId: string;
  onAction: (message: ClientMessage) => void;
  onOpenTrade?: () => void;
  className?: string;
}) {
  const trade = props.trade;

  const responderVisible =
    props.currentUserId !== trade.fromPlayerId &&
    (!trade.toPlayerId || trade.toPlayerId === props.currentUserId);
  const proposerName = getPlayerName(props.match, trade.fromPlayerId);
  const summary = getTradePerspectiveSummary(props.match, props.currentUserId, trade);
  const targetLabel = trade.toPlayerId ? `An ${getPlayerName(props.match, trade.toPlayerId)}` : "Offen für alle";

  return (
    <div className={`trade-banner ${props.className ?? ""}`.trim()}>
      <div className="trade-banner-copy">
        <strong>{trade.fromPlayerId === props.currentUserId ? "Dein Angebot" : `Angebot von ${proposerName}`}</strong>
        <span>{targetLabel}</span>
        <div className="trade-banner-summary">
          {summary.map((entry) => (
            <article key={entry.label} className="trade-banner-lane">
              <span className="eyebrow">{entry.label}</span>
              <strong>{entry.value}</strong>
              <span>{entry.helper}</span>
            </article>
          ))}
        </div>
      </div>
      <div className="trade-banner-actions">
        {responderVisible ? (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                props.onAction({
                  type: "match.action",
                  matchId: props.match.matchId,
                  action: {
                    type: "accept_trade_offer",
                    tradeId: trade.id
                  }
                })
              }
            >
              Annehmen
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                props.onAction({
                  type: "match.action",
                  matchId: props.match.matchId,
                  action: {
                    type: "decline_trade_offer",
                    tradeId: trade.id
                  }
                })
              }
            >
              Ablehnen
            </button>
            {props.onOpenTrade ? (
              <button type="button" className="secondary-button is-accent" onClick={props.onOpenTrade}>
                Zum Handel
              </button>
            ) : null}
          </>
        ) : trade.fromPlayerId === props.currentUserId ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              props.onAction({
                type: "match.action",
                matchId: props.match.matchId,
                action: {
                  type: "withdraw_trade_offer",
                  tradeId: trade.id
                }
              })
            }
          >
            Angebot beenden
          </button>
        ) : props.onOpenTrade ? (
          <button type="button" className="secondary-button is-accent" onClick={props.onOpenTrade}>
            Zum Handel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getTradePerspectiveSummary(
  match: MatchSnapshot,
  currentUserId: string,
  trade: MatchSnapshot["tradeOffers"][number]
): Array<{ label: string; value: string; helper: string }> {
  const giveText = renderResourceMap(trade.give) || "nichts";
  const wantText = renderResourceMap(trade.want) || "nichts";
  const proposerName = getPlayerName(match, trade.fromPlayerId);
  const targetName = trade.toPlayerId ? getPlayerName(match, trade.toPlayerId) : "Die andere Seite";

  if (trade.fromPlayerId === currentUserId) {
    return [
      {
        label: "Du erhältst",
        value: wantText,
        helper: `Du gibst dafür ${giveText}.`
      },
      {
        label: `${trade.toPlayerId ? targetName : "Andere Seite"} erhält`,
        value: giveText,
        helper: `${trade.toPlayerId ? targetName : "Der annehmende Spieler"} gibt dafür ${wantText}.`
      }
    ];
  }

  if (!trade.toPlayerId || trade.toPlayerId === currentUserId) {
    return [
      {
        label: "Du erhältst",
        value: giveText,
        helper: `Du gibst dafür ${wantText}.`
      },
      {
        label: `${proposerName} erhält`,
        value: wantText,
        helper: `${proposerName} gibt dafür ${giveText}.`
      }
    ];
  }

  return [
    {
      label: `${proposerName} erhält`,
      value: wantText,
      helper: `${proposerName} gibt dafür ${giveText}.`
    },
    {
      label: `${targetName} erhält`,
      value: giveText,
      helper: `${targetName} gibt dafür ${wantText}.`
    }
  ];
}

function InfoCard(props: { label: string; value: ReactNode; className?: string }) {
  return (
    <article className={`info-card ${props.className ?? ""}`.trim()}>
      <span>{props.label}</span>
      <div className="info-card-value">{props.value}</div>
    </article>
  );
}

function PlayerStatCard(props: { label: string; value: ReactNode }) {
  return (
    <div className="player-stat-card">
      <span className="player-stat-card-label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PlayerBadge(props: { match: MatchSnapshot; playerId: string; compact?: boolean }) {
  const player = getPlayerById(props.match, props.playerId);
  if (!player) {
    return null;
  }

  return (
    <PlayerColorBadge
      color={player.color}
      label={`${player.id === props.match.you ? "Du" : player.username} - ${renderPlayerColorLabel(player.color)}`}
      {...(props.compact !== undefined ? { compact: props.compact } : {})}
    />
  );
}

function getRobberDiscardGroups(match: MatchSnapshot) {
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

function renderDevelopmentLabel(type: string): string {
  const labels: Record<string, string> = {
    knight: "Ritter",
    victory_point: "Siegpunkt",
    road_building: "Straßenbau",
    year_of_plenty: "Erfindung",
    monopoly: "Monopol"
  };

  return labels[type] ?? type;
}

function describeDevelopmentCardStatus(
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

function createBuildActionState(
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
    active,
    disabled: !actionable,
    onClick: props.onClick
  };
}

function createOwnActionCue(
  match: MatchSnapshot,
  activePlayer: MatchSnapshot["players"][number] | null,
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
    const remainingRoads = match.pendingDevelopmentEffect?.type === "road_building" ? match.pendingDevelopmentEffect.remainingRoads : 2;
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
      detail: "Alle ausbaubaren eigenen Siedlungen sind markiert.",
      vertexIds: match.allowedMoves.cityVertexIds,
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "robber" || match.phase === "robber_interrupt") {
    const tileIds = match.allowedMoves.robberMoveOptions.map((option) => option.tileId);
    if (!tileIds.length) {
      return null;
    }

    return {
      key: `action-robber-${match.version}-${tileIds.join(",")}`,
      mode: "action",
      title: "Bewege den Räuber",
      detail: "Alle gültigen Zielfelder für den Räuber sind markiert.",
      vertexIds: [],
      edgeIds: [],
      tileIds,
      scale: "wide"
    };
  }

  if (match.phase === "setup_forward" || match.phase === "setup_reverse") {
    return {
      key: `action-setup-${match.version}-${activePlayer?.id ?? match.you}`,
      mode: "action",
      title: "Du bist im Startaufbau",
      detail: "Lege zuerst Siedlung und danach Straße an eine markierte Stelle.",
      vertexIds: [],
      edgeIds: [],
      tileIds: [],
      scale: "wide"
    };
  }

  return null;
}

function getLatestFocusableEvent(match: MatchSnapshot): FocusableEventResult | null {
  for (let index = match.eventLog.length - 1; index >= 0; index -= 1) {
    const event = match.eventLog[index];
    if (!event) {
      continue;
    }

    const cue = createEventCue(match, event);
    if (cue) {
      return { cue, event };
    }
  }

  return null;
}

function getLatestFocusableEventSinceLatestDice(match: MatchSnapshot): FocusableEventResult | null {
  let lowerBoundIndex = 0;

  for (let index = match.eventLog.length - 1; index >= 0; index -= 1) {
    const event = match.eventLog[index];
    if (event?.type === "dice_rolled") {
      lowerBoundIndex = index + 1;
      break;
    }
  }

  for (let index = match.eventLog.length - 1; index >= lowerBoundIndex; index -= 1) {
    const event = match.eventLog[index];
    if (!event) {
      continue;
    }

    const cue = createEventCue(match, event);
    if (cue) {
      return { cue, event };
    }
  }

  if (lowerBoundIndex > 0) {
    return null;
  }

  return getLatestFocusableEvent(match);
}

function getLatestDiceRollEvent(match: MatchSnapshot): MatchSnapshot["eventLog"][number] | null {
  for (let index = match.eventLog.length - 1; index >= 0; index -= 1) {
    const event = match.eventLog[index];
    if (event?.type === "dice_rolled") {
      return event;
    }
  }

  return null;
}

function createEventCue(
  match: MatchSnapshot,
  event: MatchSnapshot["eventLog"][number]
): BoardFocusCue | null {
  const actorName = getPlayerName(match, event.byPlayerId);

  switch (event.type) {
    case "initial_settlement_placed":
    case "settlement_built": {
      const vertexId = getPayloadString(event.payload, "vertexId");
      if (!vertexId) {
        return null;
      }

      return {
        key: `event-${event.id}-${vertexId}`,
        mode: "event",
        title: `${actorName} setzt eine Siedlung`,
        detail: "Die Kamera zeigt den gerade belegten Bauplatz.",
        vertexIds: [vertexId],
        edgeIds: [],
        tileIds: [],
        scale: "tight"
      };
    }
    case "city_built": {
      const vertexId = getPayloadString(event.payload, "vertexId");
      if (!vertexId) {
        return null;
      }

      return {
        key: `event-${event.id}-${vertexId}`,
        mode: "event",
        title: `${actorName} baut eine Stadt`,
        detail: "Der ausgebauten Stadtplatz wird hervorgehoben.",
        vertexIds: [vertexId],
        edgeIds: [],
        tileIds: [],
        scale: "tight"
      };
    }
    case "initial_road_placed":
    case "road_built": {
      const edgeId = getPayloadString(event.payload, "edgeId");
      const freeBuild = getPayloadBoolean(event.payload, "freeBuild");
      if (!edgeId) {
        return null;
      }

      return {
        key: `event-${event.id}-${edgeId}`,
        mode: "event",
        title: freeBuild ? `${actorName} setzt eine kostenlose Straße` : `${actorName} baut eine Straße`,
        detail: freeBuild
          ? "Die kostenlose Straße aus Straßenbau ist direkt im Brett markiert."
          : "Die neue Verbindung ist direkt im Brett markiert.",
        vertexIds: [],
        edgeIds: [edgeId],
        tileIds: [],
        scale: "medium"
      };
    }
    case "longest_road_awarded": {
      const edgeIds = getPayloadStringArray(event.payload, "edgeIds");
      const length = getPayloadNumber(event.payload, "length");
      const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
      const previousPlayerId = getPayloadString(event.payload, "previousPlayerId");
      const previousHolderName = previousPlayerId ? getPlayerName(match, previousPlayerId) : null;

      return {
        key: `event-${event.id}-longest-road-${event.byPlayerId ?? "unknown"}`,
        mode: "event",
        title: `${actorName} übernimmt die Längste Straße`,
        detail: previousHolderName
          ? `Die hervorgehobenen Straßen geben ${actorName} jetzt 2 öffentliche Siegpunkte. Zuvor hatte ${previousHolderName} die Auszeichnung.`
          : `Die hervorgehobenen Straßen geben ${actorName} jetzt 2 öffentliche Siegpunkte.`,
        badges: [
          ...(event.byPlayerId ? [{ label: actorName, playerId: event.byPlayerId, tone: "player" as const }] : []),
          ...(previousPlayerId ? [{ label: previousHolderName ?? "Voriger Inhaber", playerId: previousPlayerId, tone: "player" as const }] : []),
          ...(length !== null ? [{ label: `Länge: ${length}` }] : []),
          ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP: ${publicVictoryPoints}` }] : []),
          { label: "+2 VP", tone: "warning" as const }
        ],
        vertexIds: [],
        edgeIds,
        tileIds: [],
        scale: edgeIds.length > 4 ? "wide" : "medium"
      };
    }
    case "longest_road_lost": {
      const nextPlayerId = getPayloadString(event.payload, "nextPlayerId");
      const length = getPayloadNumber(event.payload, "length");
      const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
      const nextHolderName = nextPlayerId ? getPlayerName(match, nextPlayerId) : null;

      return {
        key: `event-${event.id}-longest-road-lost-${event.byPlayerId ?? "unknown"}`,
        mode: "event",
        title: `${actorName} verliert die Längste Straße`,
        detail: nextHolderName
          ? `${nextHolderName} bekommt die Auszeichnung und die 2 öffentlichen Siegpunkte.`
          : "Die Auszeichnung ist aktuell bei niemandem und die 2 öffentlichen Siegpunkte fallen weg.",
        badges: [
          ...(event.byPlayerId ? [{ label: actorName, playerId: event.byPlayerId, tone: "player" as const }] : []),
          ...(nextPlayerId ? [{ label: nextHolderName ?? "Neuer Inhaber", playerId: nextPlayerId, tone: "player" as const }] : []),
          ...(length !== null ? [{ label: `Eigene Länge: ${length}` }] : []),
          ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP: ${publicVictoryPoints}` }] : []),
          { label: "-2 VP", tone: "warning" as const }
        ],
        vertexIds: [],
        edgeIds: [],
        tileIds: [],
        scale: "wide"
      };
    }
    case "largest_army_awarded": {
      const vertexIds = getPayloadStringArray(event.payload, "vertexIds");
      const knightCount = getPayloadNumber(event.payload, "knightCount");
      const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
      const previousPlayerId = getPayloadString(event.payload, "previousPlayerId");
      const previousHolderName = previousPlayerId ? getPlayerName(match, previousPlayerId) : null;

      return {
        key: `event-${event.id}-largest-army-${event.byPlayerId ?? "unknown"}`,
        mode: "event",
        title: `${actorName} übernimmt die Größte Rittermacht`,
        detail: previousHolderName
          ? `${actorName} erhält dadurch 2 öffentliche Siegpunkte. Zuvor hielt ${previousHolderName} die Auszeichnung.`
          : `${actorName} erhält dadurch 2 öffentliche Siegpunkte.`,
        badges: [
          ...(event.byPlayerId ? [{ label: actorName, playerId: event.byPlayerId, tone: "player" as const }] : []),
          ...(previousPlayerId ? [{ label: previousHolderName ?? "Voriger Inhaber", playerId: previousPlayerId, tone: "player" as const }] : []),
          ...(knightCount !== null ? [{ label: `Ritter: ${knightCount}` }] : []),
          ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP: ${publicVictoryPoints}` }] : []),
          { label: "+2 VP", tone: "warning" as const }
        ],
        vertexIds,
        edgeIds: [],
        tileIds: [],
        scale: vertexIds.length > 2 ? "wide" : "medium"
      };
    }
    case "largest_army_lost": {
      const nextPlayerId = getPayloadString(event.payload, "nextPlayerId");
      const knightCount = getPayloadNumber(event.payload, "knightCount");
      const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
      const nextHolderName = nextPlayerId ? getPlayerName(match, nextPlayerId) : null;

      return {
        key: `event-${event.id}-largest-army-lost-${event.byPlayerId ?? "unknown"}`,
        mode: "event",
        title: `${actorName} verliert die Größte Rittermacht`,
        detail: nextHolderName
          ? `${nextHolderName} bekommt die Auszeichnung und die 2 öffentlichen Siegpunkte.`
          : "Die Auszeichnung ist aktuell bei niemandem und die 2 öffentlichen Siegpunkte fallen weg.",
        badges: [
          ...(event.byPlayerId ? [{ label: actorName, playerId: event.byPlayerId, tone: "player" as const }] : []),
          ...(nextPlayerId ? [{ label: nextHolderName ?? "Neuer Inhaber", playerId: nextPlayerId, tone: "player" as const }] : []),
          ...(knightCount !== null ? [{ label: `Ritter: ${knightCount}` }] : []),
          ...(publicVictoryPoints !== null ? [{ label: `Öffentliche VP: ${publicVictoryPoints}` }] : []),
          { label: "-2 VP", tone: "warning" as const }
        ],
        vertexIds: [],
        edgeIds: [],
        tileIds: [],
        scale: "wide"
      };
    }
    case "robber_moved": {
      const tileId = getPayloadString(event.payload, "tileId");
      if (!tileId) {
        return null;
      }

      return {
        key: `event-${event.id}-${tileId}`,
        mode: "event",
        title: `${actorName} bewegt den Räuber`,
        detail: "Das neue Räuberfeld ist hervorgehoben.",
        vertexIds: [],
        edgeIds: [],
        tileIds: [tileId],
        scale: "wide"
      };
    }
    case "dice_rolled": {
      const total = getPayloadNumber(event.payload, "total");
      const dice = getPayloadDice(event.payload, "dice");
      if (total === null) {
        return null;
      }

      if (total !== 7) {
        return null;
      }

      return {
        key: `event-${event.id}-dice-${total}`,
        mode: "event",
        title: `${actorName} würfelt ${total}`,
        detail: "Die Räuberphase startet. Betroffene Spieler müssen jetzt abwerfen und der Räuber wird anschließend bewegt.",
        badges: [
          { label: dice ? `Wurf: ${dice[0]} + ${dice[1]} = ${total}` : `Wurf: ${total}` },
          { label: "Räuber aktiv", tone: "warning" }
        ],
        vertexIds: [],
        edgeIds: [],
        tileIds: [],
        scale: "wide"
      };
    }
    case "resources_distributed": {
      const roll = getPayloadNumber(event.payload, "roll");
      const dice = getPayloadDice(event.payload, "dice");
      const tileIds = getPayloadStringArray(event.payload, "tileIds");
      const blockedResources = getPayloadStringArray(event.payload, "blockedResources");
      const grantsByPlayerId = getPayloadResourceMapRecord(event.payload, "grantsByPlayerId");
      const grantLines = summarizeGrantLines(match, grantsByPlayerId);
      const tileLine = summarizeTileLines(match, tileIds, roll);

      if (roll === null) {
        return null;
      }

      const badges = [
        { label: dice ? `Wurf: ${dice[0]} + ${dice[1]} = ${roll}` : `Wurf: ${roll}` },
        { label: tileLine },
        ...grantLines,
        ...(blockedResources.length
          ? [
              {
                label: `Bank blockiert: ${blockedResources.map((resource) => renderResourceLabel(resource)).join(", ")}`,
                tone: "warning" as const
              }
            ]
          : [])
      ].filter((badge) => badge.label);

      return {
        key: `event-${event.id}-distribution-${roll}-${tileIds.join(",")}`,
        mode: "event",
        title: `${actorName} würfelt ${roll}`,
        detail:
          grantLines.length > 0
            ? "Die markierten Felder schütten jetzt Rohstoffe aus."
            : tileIds.length > 0
              ? "Die markierten Felder wären aktiv, aber in dieser Verteilung gibt es keine Rohstoffe."
              : "Kein Feld mit dieser Zahl schüttet Rohstoffe aus.",
        badges,
        vertexIds: [],
        edgeIds: [],
        tileIds,
        scale: tileIds.length > 2 ? "wide" : "medium"
      };
    }
    case "development_card_played": {
      const cardType = getPayloadString(event.payload, "cardType");
      if (!cardType) {
        return null;
      }

      return {
        key: `event-${event.id}-${cardType}`,
        mode: "event",
        title: `${actorName} spielt ${renderDevelopmentLabel(cardType)}`,
        detail:
          cardType === "knight"
            ? "Die Räuberphase startet sofort."
            : cardType === "road_building"
              ? "Der Straßenbau-Effekt ist aktiv. Die kostenlosen Straßen folgen direkt über das Brett."
              : cardType === "year_of_plenty"
                ? "Die gewählten Rohstoffe werden aus der Bank genommen."
                : cardType === "monopoly"
                  ? "Alle Mitspieler geben die gewählte Rohstoffart ab."
                  : "Die Entwicklungskarte wird ausgeführt.",
        vertexIds: [],
        edgeIds: [],
        tileIds: [],
        scale: "medium"
      };
    }
    default:
      return null;
  }
}

function getPlayerName(match: MatchSnapshot, playerId?: string): string {
  if (!playerId) {
    return "Ein Spieler";
  }

  return getPlayerById(match, playerId)?.username ?? "Ein Spieler";
}

function getPlayerById(match: MatchSnapshot, playerId?: string) {
  if (!playerId) {
    return null;
  }

  return match.players.find((player) => player.id === playerId) ?? null;
}

function getPlayerColor(match: MatchSnapshot, playerId?: string): PlayerColor | null {
  return getPlayerById(match, playerId)?.color ?? null;
}

function getPlayerPresenceState(player: MatchSnapshot["players"][number], now: number) {
  if (player.connected) {
    return {
      label: "Online",
      detail: "Im Raum verbunden",
      toneClass: "is-online",
      indicatorClass: "is-online"
    };
  }

  if (typeof player.disconnectDeadlineAt === "number" && player.disconnectDeadlineAt > now) {
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

function getMaritimeRateOriginLabel(
  match: MatchSnapshot,
  playerId: string,
  resource: Resource,
  ratio: number
): string {
  const ownedPortTypes = new Set<PortType>();
  for (const vertex of match.board.vertices) {
    if (vertex.building?.ownerId === playerId && vertex.portType) {
      ownedPortTypes.add(vertex.portType);
    }
  }

  if (ratio === 2 && ownedPortTypes.has(resource)) {
    return `${renderResourceLabel(resource)}-Hafen`;
  }

  if (ratio === 3 && ownedPortTypes.has("generic")) {
    return "3:1-Hafen";
  }

  return "Bank";
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function getEventSummary(match: MatchSnapshot, event: MatchSnapshot["eventLog"][number]): string | null {
  if (event.type === "starting_player_rolled") {
    return getPayloadString(event.payload, "summary");
  }

  if (event.type === "development_card_played") {
    const cardType = getPayloadString(event.payload, "cardType");
    if (!cardType) {
      return null;
    }

    if (cardType === "knight") {
      return `${getPlayerName(match, event.byPlayerId)} spielt einen Ritter und startet die Räuberphase.`;
    }
    if (cardType === "road_building") {
      return `${getPlayerName(match, event.byPlayerId)} aktiviert Straßenbau und setzt jetzt bis zu zwei kostenlose Straßen.`;
    }
    if (cardType === "year_of_plenty") {
      const resources = getPayloadStringArray(event.payload, "resources");
      return `${getPlayerName(match, event.byPlayerId)} nimmt ${resources.map((resource) => renderResourceLabel(resource)).join(" und ")} aus der Bank.`;
    }
    if (cardType === "monopoly") {
      const resource = getPayloadString(event.payload, "resource");
      const total = getPayloadNumber(event.payload, "total");
      return `${getPlayerName(match, event.byPlayerId)} spielt Monopol auf ${renderResourceLabel(resource ?? "unbekannt")} und erhält ${total ?? "?"} Karten.`;
    }
  }

  if (event.type === "road_built") {
    const freeBuild = getPayloadBoolean(event.payload, "freeBuild");
    return freeBuild
      ? `${getPlayerName(match, event.byPlayerId)} setzt eine kostenlose Straße aus Straßenbau.`
      : `${getPlayerName(match, event.byPlayerId)} baut eine Straße.`;
  }

  if (event.type === "longest_road_awarded") {
    const previousPlayerId = getPayloadString(event.payload, "previousPlayerId");
    const length = getPayloadNumber(event.payload, "length");
    const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
    const previousHolderName = previousPlayerId ? getPlayerName(match, previousPlayerId) : null;
    return previousHolderName
      ? `${getPlayerName(match, event.byPlayerId)} übernimmt mit Länge ${length ?? "?"} die Längste Straße von ${previousHolderName} und steht nun bei ${publicVictoryPoints ?? "?"} öffentlichen VP.`
      : `${getPlayerName(match, event.byPlayerId)} erhält mit Länge ${length ?? "?"} die Längste Straße und steht nun bei ${publicVictoryPoints ?? "?"} öffentlichen VP.`;
  }

  if (event.type === "longest_road_lost") {
    const nextPlayerId = getPayloadString(event.payload, "nextPlayerId");
    const length = getPayloadNumber(event.payload, "length");
    const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
    return nextPlayerId
      ? `${getPlayerName(match, event.byPlayerId)} verliert die Längste Straße bei Länge ${length ?? "?"}; ${getPlayerName(match, nextPlayerId)} übernimmt. Öffentliche VP jetzt: ${publicVictoryPoints ?? "?"}.`
      : `${getPlayerName(match, event.byPlayerId)} verliert die Längste Straße; die Auszeichnung ist aktuell bei niemandem. Öffentliche VP jetzt: ${publicVictoryPoints ?? "?"}.`;
  }

  if (event.type === "largest_army_awarded") {
    const previousPlayerId = getPayloadString(event.payload, "previousPlayerId");
    const knightCount = getPayloadNumber(event.payload, "knightCount");
    const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
    const previousHolderName = previousPlayerId ? getPlayerName(match, previousPlayerId) : null;
    return previousHolderName
      ? `${getPlayerName(match, event.byPlayerId)} übernimmt mit ${knightCount ?? "?"} Rittern die Größte Rittermacht von ${previousHolderName} und steht nun bei ${publicVictoryPoints ?? "?"} öffentlichen VP.`
      : `${getPlayerName(match, event.byPlayerId)} erhält mit ${knightCount ?? "?"} Rittern die Größte Rittermacht und steht nun bei ${publicVictoryPoints ?? "?"} öffentlichen VP.`;
  }

  if (event.type === "largest_army_lost") {
    const nextPlayerId = getPayloadString(event.payload, "nextPlayerId");
    const knightCount = getPayloadNumber(event.payload, "knightCount");
    const publicVictoryPoints = getPayloadNumber(event.payload, "publicVictoryPoints");
    return nextPlayerId
      ? `${getPlayerName(match, event.byPlayerId)} verliert die Größte Rittermacht bei ${knightCount ?? "?"} Rittern; ${getPlayerName(match, nextPlayerId)} übernimmt. Öffentliche VP jetzt: ${publicVictoryPoints ?? "?"}.`
      : `${getPlayerName(match, event.byPlayerId)} verliert die Größte Rittermacht; die Auszeichnung ist aktuell bei niemandem. Öffentliche VP jetzt: ${publicVictoryPoints ?? "?"}.`;
  }

  return null;
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
  if (typeof left !== "number" || typeof right !== "number") {
    return null;
  }

  return [left, right];
}

function rollPreviewValue(): number {
  dicePreviewCursor = (dicePreviewCursor % 6) + 1;
  return dicePreviewCursor;
}

function getDicePipPositions(value: number | null): string[] {
  switch (value) {
    case 1:
      return ["center"];
    case 2:
      return ["top-left", "bottom-right"];
    case 3:
      return ["top-left", "center", "bottom-right"];
    case 4:
      return ["top-left", "top-right", "bottom-left", "bottom-right"];
    case 5:
      return ["top-left", "top-right", "center", "bottom-left", "bottom-right"];
    case 6:
      return ["top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right"];
    default:
      return [];
  }
}

function getPayloadStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function getPayloadResourceMapRecord(
  payload: Record<string, unknown>,
  key: string
): Record<string, ResourceMap> {
  const value = payload[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, ResourceMap> = {};
  for (const [playerId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    next[playerId] = RESOURCES.reduce(
      (resourceMap, resource) => {
        const count = (entry as Partial<Record<Resource, unknown>>)[resource];
        resourceMap[resource] = typeof count === "number" ? count : 0;
        return resourceMap;
      },
      {} as ResourceMap
    );
  }

  return next;
}

function summarizeTileLines(match: MatchSnapshot, tileIds: string[], roll: number | null): string {
  if (!tileIds.length) {
    return roll === null ? "Keine aktiven Felder" : `Keine aktiven Felder für ${roll}`;
  }

  const labels = tileIds
    .map((tileId) => match.board.tiles.find((tile) => tile.id === tileId))
    .filter((tile): tile is MatchSnapshot["board"]["tiles"][number] => !!tile)
    .map((tile) => `${renderResourceLabel(tile.resource)} ${tile.token ?? ""}`.trim());

  return `Felder: ${labels.join(" · ")}`;
}

function summarizeGrantLines(
  match: MatchSnapshot,
  grantsByPlayerId: Record<string, ResourceMap>
): BoardFocusBadge[] {
  return Object.entries(grantsByPlayerId)
    .flatMap(([playerId, resourceMap]) => {
      const playerName = playerId === match.you ? "Du" : getPlayerName(match, playerId);
      const resources = renderResourceMap(resourceMap);
      return resources
        ? [{
            label: `${playerName}: +${resources}`,
            playerId,
            tone: "player" as const
          }]
        : [];
    });
}

function getTurnStatus(
  match: MatchSnapshot,
  activePlayer: MatchSnapshot["players"][number] | null,
  selfPlayer: MatchSnapshot["players"][number] | null,
  interactionMode: InteractionMode,
  _selectedRoadCount: number
): TurnStatus {
  const activePlayerName = activePlayer?.username ?? "Unbekannt";
  const isCurrentPlayer = match.currentPlayerId === match.you;
  const ownTrade =
    match.tradeOffers.find((offer) => match.allowedMoves.withdrawableTradeOfferIds.includes(offer.id)) ??
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
  const withPlayer = (title: string, detail: string, playerId?: string): TurnStatus =>
    playerId ? { title, detail, playerId } : { title, detail };

  if (match.winnerId) {
    const winner = match.players.find((player) => player.id === match.winnerId)?.username ?? "Unbekannt";
    return withPlayer("Partie beendet", `${winner} hat die Partie gewonnen.`, match.winnerId);
  }

  if (trade) {
    const proposer = match.players.find((player) => player.id === trade.fromPlayerId)?.username ?? "Unbekannt";
    if (trade.fromPlayerId === match.you) {
      const target = trade.toPlayerId
        ? match.players.find((player) => player.id === trade.toPlayerId)?.username ?? "dem Zielspieler"
        : "einen Mitspieler";
      return withPlayer(
        "Warte auf Handelsantwort",
        trade.targetPlayerId ? `${target} entscheidet über dein Angebot.` : "Ein Mitspieler kann dein Angebot annehmen.",
        trade.toPlayerId ?? undefined
      );
    }
    if (!trade.toPlayerId || trade.toPlayerId === match.you) {
      return withPlayer("Antwort von dir", `${proposer} wartet auf deine Entscheidung zum Handel.`, selfId);
    }
    const target = match.players.find((player) => player.id === trade.toPlayerId)?.username ?? activePlayerName;
    return withPlayer(`Warte auf ${target}`, `${proposer} hat ein Handelsangebot offen.`, trade.toPlayerId);
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
      : withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} setzt eine Start-Siedlung.`, activePlayer?.id);
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    return isCurrentPlayer
      ? withPlayer("Aktion von dir", "Setze jetzt deine angrenzende Start-Straße.", selfId)
      : withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} setzt eine Start-Straße.`, activePlayer?.id);
  }

  if (match.phase === "robber_interrupt") {
    const { pending, done } = getRobberDiscardGroups(match);
    if (match.allowedMoves.pendingDiscardCount > 0) {
      const othersPending = pending.filter((entry) => entry.player.id !== selfId);
      const suffix =
        othersPending.length > 0
          ? ` Danach warten noch ${summarizeRobberPlayers(othersPending.map((entry) => entry.player.username))}.`
          : "";
      return withPlayer(
        "Aktion von dir",
        `Lege ${match.allowedMoves.pendingDiscardCount} Karten ab, damit die Räuberphase weitergehen kann.${suffix}`,
        selfId
      );
    }
    if (isCurrentPlayer && interactionMode === "robber") {
      return withPlayer("Aktion von dir", "Alle Abwürfe sind erledigt. Wähle jetzt das Zielfeld für den Räuber.", selfId);
    }
    if (pending.length > 0) {
      return withPlayer(
        "Warte auf Abwürfe",
        `${summarizeRobberPlayers(pending.map((entry) => entry.player.username))} müssen noch Karten abwerfen.`,
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
    return withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} schließt die Räuberphase ab.`, activePlayer?.id);
  }

  if (interactionMode === "road_building") {
    const remainingRoads = match.pendingDevelopmentEffect?.type === "road_building" ? match.pendingDevelopmentEffect.remainingRoads : 2;
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
    return withPlayer("Aktion von dir", "Wähle einen gültigen Platz für deine Siedlung.", selfId);
  }

  if (interactionMode === "city") {
    return withPlayer("Aktion von dir", "Wähle eine eigene Siedlung für den Ausbau.", selfId);
  }

  if (match.allowedMoves.canRoll) {
    return isCurrentPlayer
      ? withPlayer("Aktion von dir", "Du musst jetzt würfeln.", selfId)
      : withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} startet den Zug mit dem Wurf.`, activePlayer?.id);
  }

  if (isCurrentPlayer && match.phase === "turn_action") {
    return withPlayer("Aktion von dir", "Baue, handle oder beende deinen Zug.", selfId);
  }

  if (match.phase === "turn_action") {
    return withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} ist am Zug.`, activePlayer?.id);
  }

  if (match.phase === "setup_forward" || match.phase === "setup_reverse") {
    return withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} ist im Startaufbau.`, activePlayer?.id);
  }

  if (selfPlayer && !isCurrentPlayer) {
    return withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} führt die nächste Aktion aus.`, activePlayer?.id);
  }

  return { title: "Warte auf die nächste Aktion", detail: "Sobald ein legaler Schritt möglich ist, wird er hier angezeigt." };
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

function getMissingCost(resources: Partial<Record<Resource, number>> | undefined, cost: Partial<Record<Resource, number>>) {
  return RESOURCES.flatMap((resource) => {
    const required = cost[resource] ?? 0;
    const available = resources?.[resource] ?? 0;
    return required > available ? [{ resource, count: required - available }] : [];
  });
}

function renderMissingCost(missing: Array<{ resource: Resource; count: number }>): string {
  return missing.map((entry) => `${entry.count} ${renderResourceLabel(entry.resource)}`).join(" · ");
}

function canAffordCost(
  resources: Partial<Record<Resource, number>> | undefined,
  cost: Partial<Record<Resource, number>>
): boolean {
  return getMissingCost(resources, cost).length === 0;
}

function canBankPayYearOfPlenty(bank: Partial<Record<Resource, number>>, resources: [Resource, Resource]): boolean {
  const [first, second] = resources;
  if (first === second) {
    return (bank[first] ?? 0) >= 2;
  }

  return (bank[first] ?? 0) >= 1 && (bank[second] ?? 0) >= 1;
}
