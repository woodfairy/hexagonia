import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ClientMessage, MatchSnapshot, PlayerColor, Resource, ResourceMap, RoomDetails } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import { BoardScene, TILE_COLORS, type BoardFocusCue, type InteractionMode } from "../../BoardScene";
import { ResourceIcon } from "../../resourceIcons";
import { PlayerColorBadge, PlayerIdentity } from "../shared/PlayerIdentity";
import { formatPhase, getPlayerAccentClass, renderEventLabel, renderPlayerColorLabel, renderResourceLabel, renderResourceMap } from "../../ui";

export interface TradeFormState {
  give: Resource;
  giveCount: number;
  want: Resource;
  wantCount: number;
  targetPlayerId: string;
}

export interface MaritimeFormState {
  give: Resource;
  receive: Resource;
}

type MatchPanelTab = "overview" | "actions" | "hand" | "trade" | "players";
type SheetState = "peek" | "half" | "full";
type ActionSection = "build" | "cards";
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
let dicePreviewCursor = 0;

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
  rolling: boolean;
  actorName: string | null;
}

export function MatchScreen(props: {
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
  const [actionSection, setActionSection] = useState<ActionSection>("build");
  const [tradeSection, setTradeSection] = useState<TradeSection>("player");
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

    const stored = window.localStorage.getItem(BOARD_LEGEND_STORAGE_KEY);
    if (stored) {
      return stored !== "closed";
    }

    return window.innerWidth >= 720;
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
    rolling: false,
    actorName: latestDiceEvent ? getPlayerName(props.match, latestDiceEvent.byPlayerId) : null
  }));
  const seenDiceEventIdRef = useRef<string | null>(latestDiceEvent?.id ?? null);
  const diceAnimationTimerRef = useRef<number | null>(null);
  const diceAnimationCompleteRef = useRef<number | null>(null);

  const activePlayer = props.match.players.find((player) => player.id === props.match.currentPlayerId) ?? null;
  const isCurrentPlayer = props.match.currentPlayerId === props.match.you;
  const recentEvents = useMemo(() => props.match.eventLog.slice(-5).reverse(), [props.match.eventLog]);
  const recentFocusableEvent = useMemo(() => getLatestFocusableEvent(props.match), [props.match]);
  const actionCue = useMemo(
    () => createOwnActionCue(props.match, activePlayer, props.interactionMode, props.selectedRoadEdges),
    [activePlayer, props.interactionMode, props.match, props.selectedRoadEdges]
  );
  const highlightCue = actionCue ?? recentFocusableEvent?.cue ?? null;
  const shouldAutoFocusRecentEvent =
    !!recentFocusableEvent &&
    (recentFocusableEvent.event.type === "dice_rolled" ||
      recentFocusableEvent.event.type === "resources_distributed" ||
      recentFocusableEvent.event.byPlayerId !== props.match.you);
  const cameraCue =
    autoFocusEnabled
      ? (actionCue ?? (shouldAutoFocusRecentEvent ? (recentFocusableEvent?.cue ?? null) : null))
      : null;
  const spotlightCue = cameraCue ?? actionCue ?? recentFocusableEvent?.cue ?? null;
  const tradeTargetPlayers = isCurrentPlayer
    ? props.match.players.filter((player) => player.id !== props.match.you)
    : props.match.players.filter((player) => player.id === props.match.currentPlayerId);
  const selectedTradeTargetPlayer =
    tradeTargetPlayers.find((player) => player.id === props.tradeForm.targetPlayerId) ??
    (!isCurrentPlayer ? activePlayer : null);
  const maritimeRatio =
    props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === props.maritimeForm.give)?.ratio ?? 4;
  const ownedGiveResources = RESOURCES.filter((resource) => (props.selfPlayer?.resources?.[resource] ?? 0) > 0);
  const tradeGiveMax = props.selfPlayer?.resources?.[props.tradeForm.give] ?? 0;
  const affordableMaritimeGiveResources = RESOURCES.filter((resource) => {
    const ratio = props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === resource)?.ratio ?? 4;
    return (props.selfPlayer?.resources?.[resource] ?? 0) >= ratio;
  });
  const turnStatus = getTurnStatus(props.match, activePlayer, props.selfPlayer, props.interactionMode, props.selectedRoadEdges.length);
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
    props.tradeForm.giveCount > 0 &&
    props.tradeForm.wantCount > 0 &&
    canAffordOffer(props.selfPlayer?.resources, props.tradeForm.give, props.tradeForm.giveCount);
  const canSubmitMaritimeTrade = (props.selfPlayer?.resources?.[props.maritimeForm.give] ?? 0) >= maritimeRatio;
  const canPlayYearOfPlenty = canBankPayYearOfPlenty(props.match.bank, props.yearOfPlenty);
  const mobileHudSummary = props.selfPlayer
    ? `${props.selfPlayer.publicVictoryPoints} VP · ${props.selfPlayer.resourceCount} Karten`
    : "HUD";
  const boardDiceLabel = props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : "Wurf offen";
  const mobileBoardSummary = activePlayer
    ? activePlayer.id === props.match.you
      ? "Du bist am Zug"
      : `${activePlayer.username} ist am Zug`
    : "Warte auf Spieler";
  const visibleTabs = isMobileViewport ? MOBILE_MATCH_TABS : MATCH_TABS;
  const spotlightBadges = isCompactViewport ? spotlightCue?.badges?.slice(0, 1) : spotlightCue?.badges;
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
    if (!isMobileViewport) {
      return;
    }

    setBoardLegendOpen(false);
    setBoardHudOpen(false);
  }, [isMobileViewport]);

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
      rolling: false,
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
        rolling: false,
        actorName
      });
      return;
    }

    if (seenDiceEventIdRef.current === latestDiceEvent.id) {
      setDiceDisplay((current) => ({
        ...current,
        left: actualDice?.[0] ?? current.left,
        right: actualDice?.[1] ?? current.right,
        total: total ?? current.total,
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
      total,
      rolling: true,
      actorName
    });

    diceAnimationTimerRef.current = window.setInterval(() => {
      setDiceDisplay((current) => ({
        ...current,
        left: rollPreviewValue(),
        right: rollPreviewValue(),
        rolling: true
      }));
    }, 88);

    diceAnimationCompleteRef.current = window.setTimeout(() => {
      if (diceAnimationTimerRef.current !== null) {
        window.clearInterval(diceAnimationTimerRef.current);
        diceAnimationTimerRef.current = null;
      }
      setDiceDisplay({
        left: actualDice?.[0] ?? null,
        right: actualDice?.[1] ?? null,
        total,
        rolling: false,
        actorName
      });
      diceAnimationCompleteRef.current = null;
    }, 900);
  }, [latestDiceEvent, props.match]);

  useEffect(() => {
    const normalizedGive =
      ownedGiveResources.length > 0 && !ownedGiveResources.includes(props.tradeForm.give)
        ? ownedGiveResources[0]!
        : props.tradeForm.give;
    const normalizedGiveCount = clampTradeCount(props.tradeForm.giveCount, props.selfPlayer?.resources?.[normalizedGive] ?? 0);
    if (normalizedGive === props.tradeForm.give && normalizedGiveCount === props.tradeForm.giveCount) {
      return;
    }

    props.setTradeForm((current) => ({
      ...current,
      give: normalizedGive,
      giveCount: clampTradeCount(current.give === normalizedGive ? current.giveCount : normalizedGiveCount, props.selfPlayer?.resources?.[normalizedGive] ?? 0)
    }));
  }, [ownedGiveResources, props.selfPlayer?.resources, props.setTradeForm, props.tradeForm.give, props.tradeForm.giveCount]);

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
    <div className={`board-legend-list ${isMobileViewport ? "is-mobile-inline" : ""}`}>
      {RESOURCE_LEGEND.map((entry) => (
        <div key={entry.resource} className="board-legend-resource">
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
  const boardHintLegend = (
    <div className="board-legend-notes">
      <div className="board-legend-note">
        <span className="legend-signal is-gold" aria-hidden="true" />
        <span>Goldene Hinweise markieren die aktuelle Aktion oder das Live-Geschehen.</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-pulse" aria-hidden="true" />
        <span>Pulsierende Marker zeigen dir, was du gerade anklicken kannst.</span>
      </div>
    </div>
  );
  const activePlayerCardClassName = [
    "info-card-feature",
    activePlayer ? "player-surface" : "",
    activePlayer ? getPlayerAccentClass(activePlayer.color) : ""
  ]
    .join(" ")
    .trim();

  const tabPanels: Record<MatchPanelTab, ReactNode> = {
    overview: (
      <div className={`panel-frame overview-frame ${isMobileViewport ? "is-mobile-overview" : ""}`}>
        <div className="dock-card-grid match-overview-grid">
          <InfoCard
            label="Am Zug"
            value={
              activePlayer ? (
                <PlayerIdentity
                  username={activePlayer.username}
                  color={activePlayer.color}
                  compact
                  isSelf={activePlayer.id === props.match.you}
                />
              ) : (
                "-"
              )
            }
            className={activePlayerCardClassName}
          />
          <InfoCard label="Phase" value={formatPhase(props.match.phase)} />
          <InfoCard label="Würfel" value={boardDiceLabel} />
        </div>
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
                      <span>{player.publicVictoryPoints} VP</span>
                      <span>{player.resourceCount} Karten</span>
                      {player.hasLongestRoad ? <span>Längste Straße</span> : null}
                      {player.hasLargestArmy ? <span>Größte Rittermacht</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="dock-section">
              <div className="dock-section-head">
                <h3>Legende</h3>
                <span>Rohstoffe und Hinweise</span>
              </div>
              <div className="mobile-legend-stack">
                {resourceLegendList}
                {boardHintLegend}
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
              <article key={event.id} className="event-card">
                <div className="event-card-head">
                  <strong>{renderEventLabel(event.type)}</strong>
                  {event.byPlayerId ? (
                    <PlayerBadge match={props.match} playerId={event.byPlayerId} compact />
                  ) : null}
                </div>
                <span>Zug {event.atTurn}</span>
              </article>
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
          {renderQuickActions()}
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
            <span>Spielbar: {props.match.allowedMoves.playableDevelopmentCards.length}</span>
          </div>
          <div className="mini-segmented">
            <button type="button" className={actionSection === "build" ? "is-active" : ""} onClick={() => setActionSection("build")}>
              Schnell
            </button>
            <button type="button" className={actionSection === "cards" ? "is-active" : ""} onClick={() => setActionSection("cards")}>
              Karten
            </button>
          </div>
          {actionSection === "build" ? (
            <div className="action-stack compact">
              <button
                type="button"
                className="secondary-button"
                disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("knight")}
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
              <button
                type="button"
                className="secondary-button"
                disabled={
                  !props.match.allowedMoves.playableDevelopmentCards.includes("road_building") ||
                  props.match.allowedMoves.roadEdgeIds.length === 0
                }
                onClick={() => {
                  props.setInteractionMode("road_building");
                  props.setSelectedRoadEdges([]);
                }}
              >
                Straßenbau
              </button>
            </div>
          ) : (
            <div className="action-stack compact">
              <div className="triple-select">
                <select
                  value={props.yearOfPlenty[0]}
                  onChange={(event) =>
                    props.setYearOfPlenty(([_, second]) => [event.target.value as Resource, second])
                  }
                >
                  {RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {renderResourceLabel(resource)}
                    </option>
                  ))}
                </select>
                <select
                  value={props.yearOfPlenty[1]}
                  onChange={(event) =>
                    props.setYearOfPlenty(([first]) => [first, event.target.value as Resource])
                  }
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
                  disabled={
                    !props.match.allowedMoves.playableDevelopmentCards.includes("year_of_plenty") ||
                    !canPlayYearOfPlenty
                  }
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
                  Erfindung
                </button>
              </div>
              <div className="triple-select">
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
                  disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("monopoly")}
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
                  Monopol
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    ),
    hand: (
      <div className="panel-frame hand-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Rohstoffe</h3>
            <span>Geheime Handkarten bleiben lokal sichtbar.</span>
          </div>
          <div className="resource-grid">
            {RESOURCES.map((resource) => (
              <article key={resource} className="resource-card">
                <div className="resource-card-head">
                  <ResourceIcon resource={resource} shell />
                  <strong>{renderResourceLabel(resource)}</strong>
                </div>
                <span>{props.selfPlayer?.resources?.[resource] ?? 0}</span>
              </article>
            ))}
          </div>
        </section>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Entwicklung</h3>
            <span>{props.selfPlayer?.developmentCards?.length ?? 0} Karten</span>
          </div>
          <div className="scroll-list card-list">
            {props.selfPlayer?.developmentCards?.length ? (
              props.selfPlayer.developmentCards.map((card) => (
                <article key={card.id} className="mini-card">
                  <strong>{renderDevelopmentLabel(card.type)}</strong>
                  <span>{card.playable ? "Spielbar" : "Noch gesperrt"}</span>
                </article>
              ))
            ) : (
              <div className="empty-state">Keine Entwicklungskarten auf der Hand.</div>
            )}
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
              {props.match.tradeOffers.length > 0 ? (
                <TradeBanner currentUserId={props.match.you} match={props.match} onAction={props.onAction} />
              ) : null}
              <div className="trade-builder">
                <article className="trade-side-card trade-side-give">
                  <div className="trade-side-head">
                    <span className="eyebrow">Du gibst</span>
                    <strong>{props.tradeForm.giveCount}x {renderResourceLabel(props.tradeForm.give)}</strong>
                  </div>
                  <div className="trade-side-inputs">
                    <ResourceChoiceGrid
                      value={props.tradeForm.give}
                      disabledResources={RESOURCES.filter((resource) => (props.selfPlayer?.resources?.[resource] ?? 0) <= 0)}
                      onChange={(resource) => props.setTradeForm((current) => ({ ...current, give: resource }))}
                    />
                    <input
                      type="number"
                      min={tradeGiveMax > 0 ? 1 : 0}
                      max={Math.max(0, tradeGiveMax)}
                      disabled={tradeGiveMax <= 0}
                      value={props.tradeForm.giveCount}
                      onChange={(event) =>
                        props.setTradeForm((current) => ({
                          ...current,
                          giveCount: clampTradeCount(event.target.value, props.selfPlayer?.resources?.[current.give] ?? 0)
                        }))
                      }
                    />
                  </div>
                </article>

                <div className="trade-direction-chip">gegen</div>

                <article className="trade-side-card trade-side-receive">
                  <div className="trade-side-head">
                    <span className="eyebrow">Du erhältst</span>
                    <strong>{props.tradeForm.wantCount}x {renderResourceLabel(props.tradeForm.want)}</strong>
                  </div>
                  <div className="trade-side-inputs">
                    <ResourceChoiceGrid
                      value={props.tradeForm.want}
                      onChange={(resource) => props.setTradeForm((current) => ({ ...current, want: resource }))}
                    />
                    <input
                      type="number"
                      min={1}
                      value={props.tradeForm.wantCount}
                      onChange={(event) =>
                        props.setTradeForm((current) => ({
                          ...current,
                          wantCount: Number(event.target.value) || 1
                        }))
                      }
                    />
                  </div>
                </article>

                <article className="trade-target-card">
                  <div className="trade-side-head">
                    <span className="eyebrow">Angebot an</span>
                    <strong>
                      {props.tradeForm.targetPlayerId
                        ? tradeTargetPlayers.find((player) => player.id === props.tradeForm.targetPlayerId)?.username ?? "Zielspieler"
                        : "Offen für alle"}
                    </strong>
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
                <ResourceChoiceGrid
                  value={props.maritimeForm.give}
                  disabledResources={RESOURCES.filter((resource) => !affordableMaritimeGiveResources.includes(resource))}
                  onChange={(resource) => props.setMaritimeForm((current) => ({ ...current, give: resource }))}
                />
              </article>

              <div className="trade-direction-chip">{maritimeRatio}:1</div>

              <article className="trade-side-card trade-side-receive">
                <div className="trade-side-head">
                  <span className="eyebrow">Du erhältst</span>
                  <strong>1x {renderResourceLabel(props.maritimeForm.receive)}</strong>
                </div>
                <ResourceChoiceGrid
                  value={props.maritimeForm.receive}
                  onChange={(resource) => props.setMaritimeForm((current) => ({ ...current, receive: resource }))}
                />
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
          {props.match.players.map((player) => (
            <article
              key={player.id}
              className={`player-card player-surface player-accent-${player.color} ${player.id === props.match.currentPlayerId ? "is-active-turn" : ""}`}
            >
              <div className="player-card-head">
                <PlayerIdentity
                  username={player.username}
                  color={player.color}
                  isSelf={player.id === props.match.you}
                  compact
                />
                <PlayerColorBadge color={player.color} label={renderPlayerColorLabel(player.color)} compact />
              </div>
              <div className="player-stat-grid">
                <InfoCard label="VP" value={String(player.publicVictoryPoints)} />
                <InfoCard label="Karten" value={String(player.resourceCount)} />
                <InfoCard label="Straßen" value={String(player.roadsBuilt)} />
                <InfoCard label="Ritter" value={String(player.playedKnightCount)} />
              </div>
              <div className="status-strip">
                {player.id === props.match.currentPlayerId ? (
                  <span className={`status-pill player-badge player-accent-${player.color}`}>Am Zug</span>
                ) : null}
                {player.hasLongestRoad ? <span className="status-pill">Längste Straße</span> : null}
                {player.hasLargestArmy ? <span className="status-pill">Größte Rittermacht</span> : null}
                {player.id !== props.match.currentPlayerId && !player.hasLargestArmy && !player.hasLongestRoad ? (
                  <span className="status-pill muted">Keine Auszeichnung</span>
                ) : null}
              </div>
            </article>
          ))}
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
            />
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
                      <strong>VP</strong>
                      <span>{props.selfPlayer?.publicVictoryPoints ?? 0}</span>
                    </span>
                    <span className="board-hud-pill">
                      <strong>Hand</strong>
                      <span>{props.selfPlayer?.resourceCount ?? 0}</span>
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
                    <span>Rohstoffe und Brett-Hinweise</span>
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
                      <span className="eyebrow">Brett-Hinweise</span>
                      {boardHintLegend}
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
                {!isCompactViewport ? <span>{spotlightCue.detail}</span> : null}
                {spotlightBadges?.length ? (
                  <div className="board-spotlight-badges">
                    {spotlightBadges.map((badge) => (
                      <span key={badge} className="board-spotlight-badge">
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className={`board-dice-widget ${diceDisplay.rolling ? "is-rolling" : ""} ${isMobileViewport ? "is-mobile" : ""}`}>
              <div className="board-dice-head">
                <span className="eyebrow">Wurf</span>
                <strong>{diceDisplay.total !== null ? diceDisplay.total : "Offen"}</strong>
              </div>
              <div className="board-dice-row" aria-live="polite">
                <DiceFace value={diceDisplay.left} />
                <DiceFace value={diceDisplay.right} />
              </div>
              <span className="board-dice-copy">
                {diceDisplay.actorName
                  ? diceDisplay.rolling
                    ? `${diceDisplay.actorName} würfelt...`
                    : `${diceDisplay.actorName} hat ${diceDisplay.total ?? "-"} gewürfelt`
                  : "Warte auf den nächsten Wurf."}
              </span>
            </div>
          </div>
          {!spotlightCue && !isMobileViewport ? (
            <div className="board-bottom-hint">
              <div
                className={`turn-status-card ${
                  turnStatus.playerId ? getPlayerAccentClass(getPlayerColor(props.match, turnStatus.playerId)) : ""
                }`}
              >
                {turnStatus.playerId ? <PlayerBadge match={props.match} playerId={turnStatus.playerId} compact /> : null}
                <strong>{turnStatus.title}</strong>
                <span>{turnStatus.detail}</span>
              </div>
            </div>
          ) : null}
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
                className={activeTab === tab.id ? "is-active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="tab-panel-shell">{tabPanels[activeTab]}</div>
        </aside>

        <section className={`surface match-sheet is-${sheetState}`}>
          <div className="match-sheet-handle-row">
            <button type="button" className="sheet-size-button" onClick={() => setSheetState("peek")}>
              Kompakt
            </button>
            <button type="button" className="sheet-size-button" onClick={() => setSheetState("half")}>
              Fokus
            </button>
            <button type="button" className="sheet-size-button" onClick={() => setSheetState("full")}>
              Voll
            </button>
          </div>
          <div className={`match-sheet-summary ${isMobileViewport ? "is-mobile" : ""}`}>
            {turnStatus.playerId ? <PlayerBadge match={props.match} playerId={turnStatus.playerId} compact /> : null}
            <strong>{turnStatus.title}</strong>
            <span>{`${formatPhase(props.match.phase)} · Zug ${props.match.turn}`}</span>
            {sheetState !== "peek" ? <span>{turnStatus.detail}</span> : null}
          </div>
          {sheetState !== "peek" && hasQuickActions ? <div className="sheet-quick-actions">{renderQuickActions(false)}</div> : null}
          {sheetState !== "peek" ? (
            <div className="tab-strip mobile" role="tablist" aria-label="Mobile Match Navigation">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? "is-active" : ""}
                  onClick={() => {
                    setActiveTab(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}
          {sheetState !== "peek" ? <div className="tab-panel-shell mobile">{tabPanels[activeTab]}</div> : null}
        </section>
      </div>
    </section>
  );
}

function ResourceChoiceGrid(props: {
  value: Resource;
  disabledResources?: Resource[];
  onChange: (resource: Resource) => void;
}) {
  return (
    <div className="trade-resource-picker" role="listbox" aria-label="Rohstoff auswählen">
      {RESOURCES.map((resource) => (
        <button
          key={resource}
          type="button"
          className={`trade-resource-option ${props.value === resource ? "is-active" : ""}`}
          onClick={() => props.onChange(resource)}
          title={renderResourceLabel(resource)}
          aria-label={renderResourceLabel(resource)}
          aria-selected={props.value === resource}
          disabled={props.disabledResources?.includes(resource) ?? false}
        >
          <ResourceIcon resource={resource} shell size={15} />
        </button>
      ))}
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

function clampTradeCount(value: number | string, maxAvailable: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const sanitized = Number.isFinite(numeric) ? Math.floor(numeric) : 1;
  if (maxAvailable <= 0) {
    return 0;
  }

  const upperBound = Math.max(1, maxAvailable);
  return Math.min(Math.max(sanitized, 1), upperBound);
}

function TradeBanner(props: {
  match: MatchSnapshot;
  currentUserId: string;
  onAction: (message: ClientMessage) => void;
}) {
  const trade = props.match.tradeOffers[0];
  if (!trade) {
    return null;
  }

  const responderVisible =
    props.currentUserId !== trade.fromPlayerId &&
    (!trade.toPlayerId || trade.toPlayerId === props.currentUserId);

  return (
    <div className="trade-banner">
      <div className="trade-banner-copy">
        <strong>Aktuelles Angebot</strong>
        <span>Gibt: {renderResourceMap(trade.give)}</span>
        <span>Erhält: {renderResourceMap(trade.want)}</span>
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
        ) : null}
      </div>
    </div>
  );
}

function InfoCard(props: { label: string; value: ReactNode; className?: string }) {
  return (
    <article className={`info-card ${props.className ?? ""}`.trim()}>
      <span>{props.label}</span>
      <div className="info-card-value">{props.value}</div>
    </article>
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
  selectedRoadEdges: string[]
): BoardFocusCue | null {
  if (match.currentPlayerId !== match.you) {
    return null;
  }

  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    const vertexId = match.allowedMoves.initialSettlementVertexIds[0];
    if (!vertexId) {
      return null;
    }

    return {
      key: `action-initial-settlement-${match.version}-${vertexId}`,
      mode: "action",
      title: "Setze deine Start-Siedlung",
      detail: "Der erste gültige Bauplatz ist markiert. Du kannst die Kamera trotzdem frei bewegen.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
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
    const focusEdgeIds = selectedRoadEdges.length
      ? [...selectedRoadEdges, ...match.allowedMoves.roadEdgeIds.filter((edgeId) => !selectedRoadEdges.includes(edgeId))]
      : match.allowedMoves.roadEdgeIds;
    if (!focusEdgeIds.length) {
      return null;
    }

    return {
      key: `action-road-building-${match.version}-${focusEdgeIds.join(",")}`,
      mode: "action",
      title: selectedRoadEdges.length === 0 ? "Wähle die erste freie Straße" : "Wähle die zweite freie Straße",
      detail: "Alle aktuell erlaubten kostenlosen Straßen sind markiert.",
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
      if (!edgeId) {
        return null;
      }

      return {
        key: `event-${event.id}-${edgeId}`,
        mode: "event",
        title: `${actorName} baut eine Straße`,
        detail: "Die neue Verbindung ist direkt im Brett markiert.",
        vertexIds: [],
        edgeIds: [edgeId],
        tileIds: [],
        scale: "medium"
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
          dice ? `Wurf: ${dice[0]} + ${dice[1]} = ${total}` : `Wurf: ${total}`,
          "Räuber aktiv"
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
        dice ? `Wurf: ${dice[0]} + ${dice[1]} = ${roll}` : `Wurf: ${roll}`,
        tileLine,
        ...grantLines,
        ...(blockedResources.length
          ? [`Bank blockiert: ${blockedResources.map((resource) => renderResourceLabel(resource)).join(", ")}`]
          : [])
      ].filter(Boolean);

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
      if (cardType === "road_building") {
        const edgeIds = getPayloadStringArray(event.payload, "edgeIds");
        if (!edgeIds.length) {
          return null;
        }

        return {
          key: `event-${event.id}-${edgeIds.join(",")}`,
          mode: "event",
          title: `${actorName} spielt Straßenbau`,
          detail: "Die kostenlosen Straßen werden im Brett markiert.",
          vertexIds: [],
          edgeIds,
          tileIds: [],
          scale: "medium"
        };
      }
      return null;
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

function getPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function getPayloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
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
): string[] {
  return Object.entries(grantsByPlayerId)
    .map(([playerId, resourceMap]) => {
      const playerName = playerId === match.you ? "Du" : getPlayerName(match, playerId);
      const resources = renderResourceMap(resourceMap);
      return resources ? `${playerName}: +${resources}` : "";
    })
    .filter((entry): entry is string => !!entry);
}

function getTurnStatus(
  match: MatchSnapshot,
  activePlayer: MatchSnapshot["players"][number] | null,
  selfPlayer: MatchSnapshot["players"][number] | null,
  interactionMode: InteractionMode,
  selectedRoadCount: number
) : TurnStatus {
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

  if (match.allowedMoves.pendingDiscardCount > 0) {
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
    if (isCurrentPlayer && interactionMode === "robber") {
      return withPlayer("Aktion von dir", "Wähle das Zielfeld für den Räuber.", selfId);
    }
    return withPlayer(`Warte auf ${activePlayerName}`, `${activePlayerName} schließt die Räuberphase ab.`, activePlayer?.id);
  }

  if (interactionMode === "road_building") {
    return withPlayer(
      "Aktion von dir",
      selectedRoadCount === 0 ? "Wähle die erste kostenlose Straße." : "Wähle die zweite kostenlose Straße.",
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

function canAffordOffer(resources: Partial<Record<Resource, number>> | undefined, resource: Resource, count: number): boolean {
  return (resources?.[resource] ?? 0) >= count;
}

function canBankPayYearOfPlenty(bank: Partial<Record<Resource, number>>, resources: [Resource, Resource]): boolean {
  const [first, second] = resources;
  if (first === second) {
    return (bank[first] ?? 0) >= 2;
  }

  return (bank[first] ?? 0) >= 1 && (bank[second] ?? 0) >= 1;
}
