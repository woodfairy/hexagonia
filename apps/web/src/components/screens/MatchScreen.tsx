import { useEffect, useMemo, useRef, useState, type CSSProperties, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type { FocusEvent, MouseEvent, PointerEvent } from "react";
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
import { BoardScene, type ArmedBoardSelection, type BoardFocusCue, type InteractionMode } from "../../BoardScene";
import { getMatchActionConfirmation, getMatchActionKey } from "../../appSupport";
import { type BoardVisualSettings, TILE_COLORS } from "../../boardVisuals";
import { PortMarkerIcon, ResourceIcon } from "../../resourceIcons";
import { PlayerColorBadge, PlayerIdentity } from "../shared/PlayerIdentity";
import { renderMatchPlayerText } from "../shared/PlayerText";
import { ProfileMenu, ProfileMenuPanel } from "../shell/ProfileMenu";
import { formatPhase, getPlayerAccentClass, renderPlayerColorLabel, renderResourceLabel } from "../../ui";
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
  TradeBanner
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

export interface PendingBoardActionState {
  key: string;
  title: string;
  detail: string;
  confirmLabel: string;
  message: Extract<ClientMessage, { type: "match.action" }>;
  selection: ArmedBoardSelection;
  targetPlayerIds: string[];
  afterConfirm?: () => void;
}

type MatchProfileMenuProps = ComponentProps<typeof ProfileMenu>;
type MatchPanelTab = "overview" | "actions" | "hand" | "trade" | "players" | "profile";
type SheetState = "peek" | "half" | "full";
type TradeMode = "player" | "bank" | "harbor";
type MatchTabLayoutConfig = {
  columns: number;
  gridColumns: number;
  centerIncompleteRow: boolean;
  stretchSingleItemRow: boolean;
};
type MatchTabLayoutItem = {
  id: MatchPanelTab;
  row: number;
  start: number;
  span: number;
};
type MatchTabLayout = {
  columns: number;
  gridColumns: number;
  rows: number;
  activeIndex: number;
  active: MatchTabLayoutItem;
  items: MatchTabLayoutItem[];
};
type InlineConfirmButtonProps = {
  confirmKey: string;
  armedActionKey: string | null;
  onArm: (key: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  buttonClassName: string;
  disabled?: boolean;
  content: ReactNode;
  armedContent?: ReactNode;
  buttonProps?: Omit<ComponentProps<"button">, "type" | "className" | "onClick" | "disabled">;
};
type TradeComposerContextState = {
  kind: "default" | "counter";
  sourceTradeId: string | null;
  lockedTargetPlayerId: string | null;
};

const MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "actions", label: "Aktionen" },
  { id: "trade", label: "Handel" },
  { id: "hand", label: "Hand" },
  { id: "overview", label: "Events" },
  { id: "players", label: "Spieler" }
];

const MOBILE_MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "actions", label: "Aktionen" },
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
const DESKTOP_MATCH_TAB_LAYOUT: MatchTabLayoutConfig = {
  columns: 3,
  gridColumns: 6,
  centerIncompleteRow: true,
  stretchSingleItemRow: false
};
const MOBILE_MATCH_TAB_LAYOUT: MatchTabLayoutConfig = {
  columns: 2,
  gridColumns: 4,
  centerIncompleteRow: false,
  stretchSingleItemRow: true
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

function createMatchTabLayout(
  tabs: ReadonlyArray<{ id: MatchPanelTab }>,
  activeTab: MatchPanelTab,
  config: MatchTabLayoutConfig
): MatchTabLayout {
  const columns = Math.max(1, config.columns);
  const gridColumns = Math.max(columns, config.gridColumns);
  const baseSpan = Math.max(1, Math.floor(gridColumns / columns));
  const items: MatchTabLayoutItem[] = [];

  for (let index = 0; index < tabs.length; index += columns) {
    const rowTabs = tabs.slice(index, index + columns);
    const row = Math.floor(index / columns);
    const stretchRow = config.stretchSingleItemRow && rowTabs.length === 1;
    const span = stretchRow ? gridColumns : baseSpan;
    const occupiedColumns = rowTabs.length * span;
    const leadingOffset =
      config.centerIncompleteRow && rowTabs.length < columns && !stretchRow
        ? Math.max(0, Math.floor((gridColumns - occupiedColumns) / 2))
        : 0;

    rowTabs.forEach((tab, rowIndex) => {
      items.push({
        id: tab.id,
        row,
        start: leadingOffset + 1 + rowIndex * span,
        span
      });
    });
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const resolvedActiveIndex =
    activeIndex === -1
      ? Math.max(
          0,
          tabs.findIndex((tab) => tab.id === "overview")
        )
      : activeIndex;
  const active =
    items[Math.min(resolvedActiveIndex, items.length - 1)] ?? {
      id: tabs[0]?.id ?? "overview",
      row: 0,
      start: 1,
      span: baseSpan
    };

  return {
    columns,
    gridColumns,
    rows: Math.max(1, Math.ceil(tabs.length / columns)),
    activeIndex: resolvedActiveIndex,
    active,
    items
  };
}

function getTabStripStyle(tabLayout: MatchTabLayout): CSSProperties {
  return {
    "--tab-count": `${tabLayout.items.length}`,
    "--tab-columns": `${tabLayout.columns}`,
    "--tab-grid-columns": `${tabLayout.gridColumns}`,
    "--tab-rows": `${tabLayout.rows}`,
    "--tab-active-index": `${tabLayout.activeIndex}`,
    "--tab-active-row": `${tabLayout.active.row}`,
    "--tab-active-grid-start": `${tabLayout.active.start}`,
    "--tab-active-grid-span": `${tabLayout.active.span}`
  } as CSSProperties;
}

function getTabButtonStyle(tabLayout: MatchTabLayout, tabId: MatchPanelTab): CSSProperties {
  const layout = tabLayout.items.find((item) => item.id === tabId);
  if (!layout) {
    return {};
  }

  return {
    gridColumn: `${layout.start} / span ${layout.span}`,
    gridRow: `${layout.row + 1}`
  };
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

function InlineConfirmButton(props: InlineConfirmButtonProps) {
  const armed = props.armedActionKey === props.confirmKey;

  return (
    <span className={`inline-confirm-control ${armed ? "is-armed" : ""}`.trim()}>
      <button
        type="button"
        className={`inline-confirm-main ${props.buttonClassName} ${armed ? "is-armed" : ""}`.trim()}
        disabled={props.disabled}
        onClick={() => {
          if (props.disabled) {
            return;
          }

          if (armed) {
            props.onClear();
            props.onConfirm();
            return;
          }

          props.onArm(props.confirmKey);
        }}
        {...props.buttonProps}
      >
        <span className="inline-confirm-main-content">{armed ? props.armedContent ?? props.content : props.content}</span>
      </button>
      <button
        type="button"
        className="inline-confirm-cancel"
        disabled={!armed}
        onClick={props.onClear}
        aria-label="Bestätigung abbrechen"
        tabIndex={armed ? 0 : -1}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}

function TradeResourcePillRow(props: {
  resources: ResourceMap;
  emptyLabel: string;
  tone: "give" | "receive";
}) {
  const entries = RESOURCES.filter((resource) => (props.resources[resource] ?? 0) > 0);

  return (
    <div className={`trade-resource-pill-row is-${props.tone}`.trim()}>
      {entries.length ? (
        entries.map((resource) => (
          <span
            key={resource}
            className={`trade-resource-pill is-${props.tone}`.trim()}
            title={`${props.resources[resource]}x ${renderResourceLabel(resource)}`}
          >
            <ResourceIcon resource={resource} shell size={14} />
            <span>{`${props.resources[resource]}x`}</span>
          </span>
        ))
      ) : (
        <span className="trade-resource-pill is-empty">{props.emptyLabel}</span>
      )}
    </div>
  );
}

function TradeMatrixCellButton(props: {
  value: number | string;
  tone: "give" | "receive";
  disabled?: boolean;
  active?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`trade-matrix-cell is-${props.tone} ${props.active ? "is-active" : ""}`.trim()}
      disabled={props.disabled}
      aria-pressed={props.active}
      title={props.title}
      onClick={props.onClick}
    >
      <span>{props.value}</span>
    </button>
  );
}

function TradeMatrixDraftControl(props: {
  value: number;
  tone: "give" | "receive";
  incrementDisabled?: boolean;
  incrementTitle: string;
  decrementTitle: string;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const showDecrement = props.value > 0;

  return (
    <div className={`trade-matrix-control ${showDecrement ? "has-decrement" : ""}`.trim()}>
      <TradeMatrixCellButton
        value={props.value}
        tone={props.tone}
        active={props.value > 0}
        disabled={props.incrementDisabled}
        title={props.incrementTitle}
        onClick={props.onIncrement}
      />
      {showDecrement ? (
        <button
          type="button"
          className="trade-matrix-decrement"
          title={props.decrementTitle}
          aria-label={props.decrementTitle}
          onClick={props.onDecrement}
        >
          <span aria-hidden="true">−</span>
        </button>
      ) : null}
    </div>
  );
}

function TradeOfferCard(props: {
  match: MatchSnapshot;
  trade: MatchSnapshot["tradeOffers"][number];
  currentUserId: string;
  variant: "own" | "incoming";
  focused?: boolean;
  canAccept?: boolean;
  canDecline?: boolean;
  canCounter?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
  onWithdraw?: () => void;
  onEdit?: () => void;
}) {
  const proposer = props.match.players.find((player) => player.id === props.trade.fromPlayerId) ?? null;
  const target = props.trade.toPlayerId ? props.match.players.find((player) => player.id === props.trade.toPlayerId) ?? null : null;
  const fromViewerPerspective = props.trade.fromPlayerId === props.currentUserId;
  const giveResources = fromViewerPerspective ? props.trade.give : props.trade.want;
  const receiveResources = fromViewerPerspective ? props.trade.want : props.trade.give;
  const offerLabel =
    props.variant === "own"
      ? "Dein Angebot"
      : proposer
        ? `Angebot von ${proposer.id === props.currentUserId ? "dir" : proposer.username}`
        : "Handelsangebot";

  return (
    <article className={`trade-offer-card trade-offer-row ${props.focused ? "is-focused" : ""} is-${props.variant}`.trim()}>
      <div className="trade-offer-row-head">
        <div className="trade-offer-row-party">
          {props.variant === "incoming" && proposer ? (
            <PlayerIdentity username={proposer.username} color={proposer.color} compact isSelf={proposer.id === props.currentUserId} />
          ) : (
            <strong>{offerLabel}</strong>
          )}
          <span>{target ? `An ${target.id === props.currentUserId ? "dich" : target.username}` : "Offen für alle"}</span>
        </div>
        <div className="trade-offer-row-meta">
          <span className="status-pill muted">Zug {props.trade.createdAtTurn}</span>
          {props.variant === "incoming" ? <span className="status-pill is-warning">Antwort offen</span> : <span className="status-pill">Wartet</span>}
        </div>
      </div>
      <div className="trade-offer-row-trade">
        <article className="trade-offer-lane is-give compact">
          <span className="eyebrow">Du gibst</span>
          <TradeResourcePillRow resources={giveResources} emptyLabel="Nichts" tone="give" />
        </article>
        <span className="trade-offer-row-arrow" aria-hidden="true">
          →
        </span>
        <article className="trade-offer-lane is-receive compact">
          <span className="eyebrow">Du erhältst</span>
          <TradeResourcePillRow resources={receiveResources} emptyLabel="Nichts" tone="receive" />
        </article>
      </div>
      <div className="trade-offer-row-actions">
        {props.variant === "own" ? (
          <>
            <button type="button" className="secondary-button" onClick={props.onEdit}>
              Ändern
            </button>
            <button type="button" className="ghost-button" onClick={props.onWithdraw}>
              Zurückziehen
            </button>
          </>
        ) : (
          <>
            <button type="button" className="primary-button" disabled={!props.canAccept} onClick={props.onAccept}>
              Annehmen
            </button>
            <button type="button" className="ghost-button" disabled={!props.canDecline} onClick={props.onDecline}>
              Ablehnen
            </button>
            <button type="button" className="secondary-button" disabled={!props.canCounter} onClick={props.onCounter}>
              Gegenangebot
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export function MatchScreen(props: {
  boardVisualSettings: BoardVisualSettings;
  match: MatchSnapshot;
  pendingDiceEvent: Extract<MatchSnapshot["eventLog"][number], { type: "dice_rolled" }> | null;
  diceRevealPending: boolean;
  room: RoomDetails | null;
  selfPlayer: MatchSnapshot["players"][number] | null;
  profileMenuProps: MatchProfileMenuProps;
  interactionMode: InteractionMode;
  selectedRoadEdges: string[];
  tradeForm: TradeFormState;
  maritimeForm: MaritimeFormState;
  yearOfPlenty: [Resource, Resource];
  monopolyResource: Resource;
  pendingBoardAction: PendingBoardActionState | null;
  onAction: (message: ClientMessage) => void;
  onConfirmPendingBoardAction: () => void;
  onCancelPendingBoardAction: () => void;
  onSelectPendingRobberTarget: (targetPlayerId: string) => void;
  onRollDice: () => void;
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
  const [tradeMode, setTradeMode] = useState<TradeMode>("player");
  const [tradeComposerContext, setTradeComposerContext] = useState<TradeComposerContextState>({
    kind: "default",
    sourceTradeId: null,
    lockedTargetPlayerId: null
  });
  const [focusedTradeOfferId, setFocusedTradeOfferId] = useState<string | null>(null);
  const [mobileTradeSheetOpen, setMobileTradeSheetOpen] = useState(false);
  const [mobileTradeSheetDragOffset, setMobileTradeSheetDragOffset] = useState(0);
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
      return false;
    }

    const stored = window.localStorage.getItem(BOARD_LEGEND_STORAGE_KEY);
    if (stored) {
      return stored === "open";
    }

    return false;
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
  const [armedActionKey, setArmedActionKey] = useState<string | null>(null);
  const latestDiceEvent = useMemo(
    () => props.pendingDiceEvent ?? getLatestDiceRollEvent(props.match),
    [props.match, props.pendingDiceEvent]
  );
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
  const tradeSheetHistoryActiveRef = useRef(false);
  const tradeSheetPointerIdRef = useRef<number | null>(null);
  const tradeSheetPointerStartYRef = useRef(0);
  const previousMatch = previousMatchRef.current;
  const clearArmedAction = () => setArmedActionKey(null);
  const createMatchActionMessage = (action: Extract<ClientMessage, { type: "match.action" }>["action"]) =>
    ({
      type: "match.action",
      matchId: props.match.matchId,
      action
    }) satisfies Extract<ClientMessage, { type: "match.action" }>;
  const createInlineConfirmKey = (slotId: string, action: Extract<ClientMessage, { type: "match.action" }>["action"]) =>
    `${slotId}:${getMatchActionKey(action)}`;

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
  const liveAnnouncementText = notificationState.announcementText;
  const acceptableTradeOfferIds = useMemo(
    () => new Set(props.match.allowedMoves.acceptableTradeOfferIds),
    [props.match.allowedMoves.acceptableTradeOfferIds]
  );
  const declineableTradeOfferIds = useMemo(
    () => new Set(props.match.allowedMoves.declineableTradeOfferIds),
    [props.match.allowedMoves.declineableTradeOfferIds]
  );
  const ownTradeOffers = useMemo(
    () =>
      props.match.tradeOffers
        .filter((offer) => offer.fromPlayerId === props.match.you)
        .sort((left, right) => right.createdAtTurn - left.createdAtTurn || right.id.localeCompare(left.id)),
    [props.match.tradeOffers, props.match.you]
  );
  const incomingTradeOffers = useMemo(
    () =>
      props.match.tradeOffers
        .filter((offer) => offer.fromPlayerId !== props.match.you)
        .sort((left, right) => {
          const leftActionable = acceptableTradeOfferIds.has(left.id) || declineableTradeOfferIds.has(left.id);
          const rightActionable = acceptableTradeOfferIds.has(right.id) || declineableTradeOfferIds.has(right.id);
          if (leftActionable !== rightActionable) {
            return leftActionable ? -1 : 1;
          }

          if (left.createdAtTurn !== right.createdAtTurn) {
            return right.createdAtTurn - left.createdAtTurn;
          }

          return right.id.localeCompare(left.id);
        }),
    [acceptableTradeOfferIds, declineableTradeOfferIds, props.match.tradeOffers, props.match.you]
  );
  const incomingTradeOffer = incomingTradeOffers[0] ?? null;
  const incomingTradeCount = incomingTradeOffers.filter(
    (offer) => acceptableTradeOfferIds.has(offer.id) || declineableTradeOfferIds.has(offer.id)
  ).length;
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
  const maritimeRatesByResource = useMemo(
    () =>
      RESOURCES.reduce<Record<Resource, number>>((result, resource) => {
        result[resource] = props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === resource)?.ratio ?? 4;
        return result;
      }, {} as Record<Resource, number>),
    [props.match.allowedMoves.maritimeRates]
  );
  const bankTradeResources = RESOURCES.filter((resource) => maritimeRatesByResource[resource] === 4);
  const harborTradeResources = RESOURCES.filter((resource) => maritimeRatesByResource[resource] < 4);
  const visibleMaritimeGiveResources =
    tradeMode === "bank" ? bankTradeResources : tradeMode === "harbor" ? harborTradeResources : RESOURCES;
  const maritimeRatio = maritimeRatesByResource[props.maritimeForm.give] ?? 4;
  const tradeGiveTotal = totalResources(props.tradeForm.give);
  const tradeWantTotal = totalResources(props.tradeForm.want);
  const selectedTradeTargetPlayer =
    props.tradeForm.targetPlayerId && isCurrentPlayer
      ? tradeTargetPlayers.find((player) => player.id === props.tradeForm.targetPlayerId) ?? null
      : null;
  const lockedTradeTargetPlayer =
    tradeComposerContext.lockedTargetPlayerId
      ? props.match.players.find((player) => player.id === tradeComposerContext.lockedTargetPlayerId) ?? null
      : null;
  const effectiveTradeTargetPlayer = lockedTradeTargetPlayer ?? (!isCurrentPlayer ? activePlayer : selectedTradeTargetPlayer);
  const selectedTradeTargetAccentClass = effectiveTradeTargetPlayer ? getPlayerAccentClass(effectiveTradeTargetPlayer.color) : "";
  const affordableMaritimeGiveResources = visibleMaritimeGiveResources.filter(
    (resource) => (props.selfPlayer?.resources?.[resource] ?? 0) >= maritimeRatesByResource[resource]
  );
  const turnStatus = getTurnStatus(props.match, activePlayer, props.selfPlayer, props.interactionMode);
  const robberDiscardGroups = useMemo(() => getRobberDiscardGroups(props.match), [props.match]);
  const canAffordRoad = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.road);
  const canAffordSettlement = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.settlement);
  const canAffordCity = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.city);
  const buyDevelopmentAction: Extract<ClientMessage, { type: "match.action" }>["action"] = { type: "buy_development_card" };
  const buyDevelopmentMessage = createMatchActionMessage(buyDevelopmentAction);
  const buyDevelopmentConfirmation = getMatchActionConfirmation(props.match, buyDevelopmentAction);
  const buyDevelopmentConfirmKey =
    buyDevelopmentConfirmation && props.match.allowedMoves.canBuyDevelopmentCard
      ? createInlineConfirmKey("build-development", buyDevelopmentAction)
      : null;
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
      onClick: () => props.onAction(buyDevelopmentMessage)
    })
  ];
  const hasOwnTradeOffer = ownTradeOffers.length > 0;
  const canSubmitTradeOffer =
    props.match.allowedMoves.canCreateTradeOffer &&
    !hasOwnTradeOffer &&
    !isEmptyResourceMap(props.tradeForm.give) &&
    !isEmptyResourceMap(props.tradeForm.want) &&
    hasResources(props.selfPlayer?.resources ?? createEmptyResourceMap(), props.tradeForm.give);
  const canSubmitMaritimeTrade =
    tradeMode !== "player" &&
    props.match.allowedMoves.canMaritimeTrade &&
    props.maritimeForm.give !== props.maritimeForm.receive &&
    visibleMaritimeGiveResources.includes(props.maritimeForm.give) &&
    (props.selfPlayer?.resources?.[props.maritimeForm.give] ?? 0) >= maritimeRatio;
  const canPlayYearOfPlenty = canBankPayYearOfPlenty(props.match.bank, props.yearOfPlenty);
  const developmentCards = props.selfPlayer?.developmentCards ?? [];
  const hiddenVictoryPoints = props.selfPlayer?.hiddenVictoryPoints ?? 0;
  const totalVictoryPoints = props.selfPlayer?.totalVictoryPoints ?? props.selfPlayer?.publicVictoryPoints ?? 0;
  const pendingRoadBuilding =
    props.match.pendingDevelopmentEffect?.type === "road_building" ? props.match.pendingDevelopmentEffect : null;
  const endTurnAction: Extract<ClientMessage, { type: "match.action" }>["action"] = { type: "end_turn" };
  const endTurnMessage = createMatchActionMessage(endTurnAction);
  const endTurnConfirmation = getMatchActionConfirmation(props.match, endTurnAction);
  const endTurnConfirmKey =
    endTurnConfirmation && props.match.allowedMoves.canEndTurn ? createInlineConfirmKey("quick-end-turn", endTurnAction) : null;
  const finishRoadBuildingAction: Extract<ClientMessage, { type: "match.action" }>["action"] = { type: "finish_road_building" };
  const finishRoadBuildingMessage = createMatchActionMessage(finishRoadBuildingAction);
  const finishRoadBuildingConfirmation = getMatchActionConfirmation(props.match, finishRoadBuildingAction);
  const finishRoadBuildingConfirmKey =
    finishRoadBuildingConfirmation && pendingRoadBuilding?.remainingRoads === 1
      ? createInlineConfirmKey("road-building-finish", finishRoadBuildingAction)
      : null;
  const maritimeTradeAction: Extract<ClientMessage, { type: "match.action" }>["action"] = {
    type: "maritime_trade",
    give: props.maritimeForm.give,
    receive: props.maritimeForm.receive,
    giveCount: maritimeRatio
  };
  const maritimeTradeMessage = createMatchActionMessage(maritimeTradeAction);
  const developmentInlineConfirmKeys = developmentCards.flatMap((card) => {
    if (!card.playable) {
      return [];
    }

    switch (card.type) {
      case "knight":
        return [createInlineConfirmKey(`development-card-${card.id}`, { type: "play_knight" })];
      case "road_building":
        return [createInlineConfirmKey(`development-card-${card.id}`, { type: "play_road_building" })];
      case "year_of_plenty":
        return canPlayYearOfPlenty
          ? [createInlineConfirmKey(`development-card-${card.id}`, { type: "play_year_of_plenty", resources: props.yearOfPlenty })]
          : [];
      case "monopoly":
        return [createInlineConfirmKey(`development-card-${card.id}`, { type: "play_monopoly", resource: props.monopolyResource })];
      default:
        return [];
    }
  });
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
  const displayHeroNotification = useMemo<MatchScreenNotification>(
    () =>
      heroNotification ?? {
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
      heroNotification
    ]
  );
  const hasRevealedDiceResult = diceDisplay.phase === "idle" && diceDisplay.total !== null;
  const visibleTabs = isMobileViewport ? MOBILE_MATCH_TABS : MATCH_TABS;
  const effectiveSheetState: SheetState = isMobileViewport ? "full" : sheetState;
  const showIncomingTradeAlert =
    !!incomingTradeOffer && (!isMobileViewport ? activeTab !== "trade" || effectiveSheetState === "peek" : !mobileTradeSheetOpen);
  const desktopTabLayout = useMemo(
    () => createMatchTabLayout(MATCH_TABS, activeTab, DESKTOP_MATCH_TAB_LAYOUT),
    [activeTab]
  );
  const mobileTabLayout = useMemo(
    () => createMatchTabLayout(MOBILE_MATCH_TABS, activeTab, MOBILE_MATCH_TAB_LAYOUT),
    [activeTab]
  );
  const getTabTransitionOrder = (tab: MatchPanelTab) => {
    const visibleIndex = visibleTabs.findIndex((entry) => entry.id === tab);
    return visibleIndex === -1 ? MATCH_TAB_ORDER[tab] : visibleIndex;
  };
  const changeActiveTab = (nextTab: MatchPanelTab) => {
    if (nextTab === activeTab) {
      return;
    }

    setTabTransitionDirection(getTabTransitionOrder(nextTab) >= getTabTransitionOrder(activeTab) ? "forward" : "backward");
    setActiveTab(nextTab);
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
      case "knight": {
        if (!card.playable) {
          return null;
        }

        const action: Extract<ClientMessage, { type: "match.action" }>["action"] = { type: "play_knight" };
        const confirmation = getMatchActionConfirmation(props.match, action);
        if (!confirmation) {
          return null;
        }

        return (
          <InlineConfirmButton
            confirmKey={createInlineConfirmKey(`development-card-${card.id}`, action)}
            armedActionKey={armedActionKey}
            onArm={setArmedActionKey}
            onClear={clearArmedAction}
            onConfirm={() => props.onAction(createMatchActionMessage(action))}
            buttonClassName="secondary-button"
            content="Ritter spielen"
            armedContent={confirmation.confirmLabel}
          />
        );
      }
      case "road_building": {
        if (!card.playable) {
          return null;
        }

        const action: Extract<ClientMessage, { type: "match.action" }>["action"] = { type: "play_road_building" };
        const confirmation = getMatchActionConfirmation(props.match, action);
        if (!confirmation) {
          return null;
        }

        return (
          <InlineConfirmButton
            confirmKey={createInlineConfirmKey(`development-card-${card.id}`, action)}
            armedActionKey={armedActionKey}
            onArm={setArmedActionKey}
            onClear={clearArmedAction}
            onConfirm={() => props.onAction(createMatchActionMessage(action))}
            buttonClassName="secondary-button"
            content="Straßenbau starten"
            armedContent={confirmation.confirmLabel}
          />
        );
      }
      case "year_of_plenty":
        if (!card.playable) {
          return null;
        }

        const yearOfPlentyAction: Extract<ClientMessage, { type: "match.action" }>["action"] = {
          type: "play_year_of_plenty",
          resources: props.yearOfPlenty
        };
        const yearOfPlentyConfirmation = getMatchActionConfirmation(props.match, yearOfPlentyAction);
        if (!yearOfPlentyConfirmation) {
          return null;
        }

        return (
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
            <InlineConfirmButton
              confirmKey={createInlineConfirmKey(`development-card-${card.id}`, yearOfPlentyAction)}
              armedActionKey={armedActionKey}
              onArm={setArmedActionKey}
              onClear={clearArmedAction}
              onConfirm={() => props.onAction(createMatchActionMessage(yearOfPlentyAction))}
              buttonClassName="secondary-button"
              disabled={!canPlayYearOfPlenty}
              content="Erfindung spielen"
              armedContent={yearOfPlentyConfirmation.confirmLabel}
            />
          </div>
        );
      case "monopoly":
        if (!card.playable) {
          return null;
        }

        const monopolyAction: Extract<ClientMessage, { type: "match.action" }>["action"] = {
          type: "play_monopoly",
          resource: props.monopolyResource
        };
        const monopolyConfirmation = getMatchActionConfirmation(props.match, monopolyAction);
        if (!monopolyConfirmation) {
          return null;
        }

        return (
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
            <InlineConfirmButton
              confirmKey={createInlineConfirmKey(`development-card-${card.id}`, monopolyAction)}
              armedActionKey={armedActionKey}
              onArm={setArmedActionKey}
              onClear={clearArmedAction}
              onConfirm={() => props.onAction(createMatchActionMessage(monopolyAction))}
              buttonClassName="secondary-button"
              content="Monopol spielen"
              armedContent={monopolyConfirmation.confirmLabel}
            />
          </div>
        );
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
            <InlineConfirmButton
              confirmKey={finishRoadBuildingConfirmKey ?? "road-building-finish:disabled"}
              armedActionKey={armedActionKey}
              onArm={setArmedActionKey}
              onClear={clearArmedAction}
              onConfirm={() => props.onAction(finishRoadBuildingMessage)}
              buttonClassName="ghost-button"
              disabled={!finishRoadBuildingConfirmKey}
              content="Mit einer Straße beenden"
              armedContent={finishRoadBuildingConfirmation?.confirmLabel ?? "Mit einer Straße beenden"}
            />
          ) : null}
        </div>
      </article>
    ) : null;
  const pendingBoardTargetPlayerId =
    !!props.pendingBoardAction && props.pendingBoardAction.message.action.type === "move_robber"
      ? props.pendingBoardAction.message.action.targetPlayerId ?? null
      : null;
  const pendingBoardTargetPlayers = props.pendingBoardAction
    ? props.pendingBoardAction.targetPlayerIds.flatMap((targetPlayerId) => {
        const player = props.match.players.find((entry) => entry.id === targetPlayerId);
        return player ? [player] : [];
      })
    : [];
  const pendingBoardActionNeedsTarget =
    !!props.pendingBoardAction &&
    props.pendingBoardAction.message.action.type === "move_robber" &&
    props.pendingBoardAction.targetPlayerIds.length > 1;
  const canConfirmPendingBoardAction = !!props.pendingBoardAction && (!pendingBoardActionNeedsTarget || !!pendingBoardTargetPlayerId);
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
    ...(props.match.allowedMoves.canRoll && !props.diceRevealPending
      ? [
            {
              id: "roll",
              label: "Würfeln",
              className: "primary-button",
              disabled: !props.match.allowedMoves.canRoll,
              confirmKey: null,
              confirmLabel: null,
              armedLabel: null,
              onClick: () => {
                props.onRollDice();
                props.onAction(createMatchActionMessage({ type: "roll_dice" }));
              }
            }
          ]
      : []),
    ...(props.match.allowedMoves.canEndTurn
      ? [
          {
             id: "end-turn",
             label: "Zug beenden",
             className: "primary-button",
             disabled: false,
             confirmKey: endTurnConfirmKey,
             confirmLabel: endTurnConfirmation?.confirmLabel ?? "Zug beenden",
             armedLabel: "Jetzt beenden",
             onClick: () => props.onAction(endTurnMessage)
            }
          ]
      : [])
  ];
  const hasQuickActions = primaryActions.length > 0;
  const hasDisconnectCountdown = props.match.players.some(
    (player) => !player.connected && typeof player.disconnectDeadlineAt === "number"
  );
  const visibleInlineConfirmKeys = new Set([
    ...(buyDevelopmentConfirmKey ? [buyDevelopmentConfirmKey] : []),
    ...(finishRoadBuildingConfirmKey ? [finishRoadBuildingConfirmKey] : []),
    ...developmentInlineConfirmKeys,
    ...primaryActions.flatMap((action) => (action.confirmKey ? [action.confirmKey] : []))
  ]);

  const renderQuickActions = (showPlaceholder = true) =>
    hasQuickActions ? (
      <div className={`quick-action-grid ${primaryActions.length === 1 ? "is-single" : ""}`.trim()}>
        {primaryActions.map((action) => {
          const content = (
            <>
              {renderQuickActionIcon(action.id) ? (
                <span className="match-quick-action-icon" aria-hidden="true">
                  {renderQuickActionIcon(action.id)}
                </span>
              ) : null}
              <span className="match-quick-action-label">{action.label}</span>
            </>
          );
          const armedContent = (
            <>
              {renderQuickActionIcon(action.id) ? (
                <span className="match-quick-action-icon" aria-hidden="true">
                  {renderQuickActionIcon(action.id)}
                </span>
              ) : null}
              <span className="match-quick-action-label">{action.armedLabel ?? action.confirmLabel ?? action.label}</span>
            </>
          );

          return action.confirmKey ? (
            <InlineConfirmButton
              key={action.id}
              confirmKey={action.confirmKey}
              armedActionKey={armedActionKey}
              onArm={setArmedActionKey}
              onClear={clearArmedAction}
              onConfirm={action.onClick}
              buttonClassName={`${action.className} match-quick-action-button is-${action.id}`.trim()}
              disabled={action.disabled}
              content={content}
              armedContent={armedContent}
            />
          ) : (
            <button
              key={action.id}
              type="button"
              className={`${action.className} match-quick-action-button is-${action.id}`.trim()}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {content}
            </button>
          );
        })}
      </div>
    ) : showPlaceholder ? (
      <div className="action-placeholder">
        <strong>{renderMatchPlayerText(props.match, turnStatus.title)}</strong>
        <span>{renderMatchPlayerText(props.match, turnStatus.detail)}</span>
        {turnStatus.callout ? <span className="status-pill is-warning">{turnStatus.callout}</span> : null}
      </div>
    ) : null;

  useEffect(() => {
    if (armedActionKey && !visibleInlineConfirmKeys.has(armedActionKey)) {
      setArmedActionKey(null);
    }
  }, [armedActionKey, visibleInlineConfirmKeys]);

  useEffect(() => {
    setArmedActionKey(null);
  }, [activeTab, effectiveSheetState, props.match.version, tradeMode, mobileTradeSheetOpen]);

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
    const previousLatestDiceEvent = previousMatch ? getLatestDiceRollEvent(previousMatch) : null;

    if (seenDiceEventIdRef.current === null) {
      if (!previousMatch || previousLatestDiceEvent?.id === latestDiceEvent.id) {
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
  }, [latestDiceEvent, previousMatch, props.match]);

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
    if (tradeComposerContext.lockedTargetPlayerId && props.tradeForm.targetPlayerId === tradeComposerContext.lockedTargetPlayerId) {
      return;
    }

    if (!tradeComposerContext.lockedTargetPlayerId) {
      return;
    }

    props.setTradeForm((current) => ({
      ...current,
      targetPlayerId: tradeComposerContext.lockedTargetPlayerId ?? current.targetPlayerId
    }));
  }, [props.setTradeForm, props.tradeForm.targetPlayerId, tradeComposerContext.lockedTargetPlayerId]);

  useEffect(() => {
    if (tradeMode === "player" || tradeComposerContext.kind === "default") {
      return;
    }

    setTradeComposerContext({
      kind: "default",
      sourceTradeId: null,
      lockedTargetPlayerId: null
    });
  }, [tradeComposerContext.kind, tradeMode]);

  useEffect(() => {
    const normalizedGive =
      visibleMaritimeGiveResources.length === 0
        ? props.maritimeForm.give
        : visibleMaritimeGiveResources.includes(props.maritimeForm.give)
          ? props.maritimeForm.give
          : affordableMaritimeGiveResources[0] ?? visibleMaritimeGiveResources[0]!;
    if (normalizedGive === props.maritimeForm.give) {
      return;
    }

    props.setMaritimeForm((current) => ({
      ...current,
      give: normalizedGive
    }));
  }, [affordableMaritimeGiveResources, props.maritimeForm.give, props.setMaritimeForm, visibleMaritimeGiveResources]);

  useEffect(() => {
    const visibleOfferIds = new Set([...ownTradeOffers, ...incomingTradeOffers].map((offer) => offer.id));
    if (focusedTradeOfferId && visibleOfferIds.has(focusedTradeOfferId)) {
      return;
    }

    setFocusedTradeOfferId(incomingTradeOffers[0]?.id ?? ownTradeOffers[0]?.id ?? null);
  }, [focusedTradeOfferId, incomingTradeOffers, ownTradeOffers]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (!isMobileViewport || !mobileTradeSheetOpen) {
      document.body.style.removeProperty("overflow");
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, mobileTradeSheetOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !isMobileViewport || !mobileTradeSheetOpen) {
      return;
    }

    tradeSheetHistoryActiveRef.current = true;
    window.history.pushState({ hexagoniaTradeSheet: true }, "");

    const handlePopState = () => {
      tradeSheetHistoryActiveRef.current = false;
      setMobileTradeSheetOpen(false);
      setMobileTradeSheetDragOffset(0);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isMobileViewport, mobileTradeSheetOpen]);

  useEffect(() => {
    if (isMobileViewport) {
      return;
    }

    if (typeof window !== "undefined" && tradeSheetHistoryActiveRef.current) {
      tradeSheetHistoryActiveRef.current = false;
      window.history.back();
    }

    setMobileTradeSheetOpen(false);
    setMobileTradeSheetDragOffset(0);
  }, [isMobileViewport]);

  const cloneTradeResourceMap = (source: ResourceMap): ResourceMap => {
    const next = createEmptyResourceMap();
    for (const resource of RESOURCES) {
      next[resource] = source[resource] ?? 0;
    }
    return next;
  };
  const getDefaultTradeTargetPlayerId = () => (isCurrentPlayer ? "" : props.match.currentPlayerId);
  const resetTradeComposerContext = () =>
    setTradeComposerContext({
      kind: "default",
      sourceTradeId: null,
      lockedTargetPlayerId: null
    });
  const closeMobileTradeSheet = () => {
    tradeSheetPointerIdRef.current = null;
    tradeSheetPointerStartYRef.current = 0;
    setMobileTradeSheetDragOffset(0);

    if (typeof window !== "undefined" && tradeSheetHistoryActiveRef.current) {
      window.history.back();
      return;
    }

    tradeSheetHistoryActiveRef.current = false;
    setMobileTradeSheetOpen(false);
  };
  const openTradeWorkspace = (options?: { mode?: TradeMode; focusTradeId?: string | null }) => {
    if (options?.mode) {
      setTradeMode(options.mode);
    }
    if (options?.focusTradeId !== undefined) {
      setFocusedTradeOfferId(options.focusTradeId);
    }

    if (isMobileViewport) {
      setMobileTradeSheetOpen(true);
      return;
    }

    changeActiveTab("trade");
    if (effectiveSheetState === "peek") {
      setSheetState("half");
    }
  };
  const updateTradeDraft = (lane: "give" | "want", resource: Resource, value: number | string) => {
    props.setTradeForm((current) => ({
      ...current,
      [lane]: setTradeDraftCount(
        current[lane],
        resource,
        value,
        lane === "give" ? (props.selfPlayer?.resources?.[resource] ?? 0) : 99
      )
    }));
  };
  const handleSelectMaritimeGive = (resource: Resource) => {
    props.setMaritimeForm((current) => ({
      ...current,
      give: resource
    }));
  };
  const handleSelectMaritimeReceive = (resource: Resource) => {
    props.setMaritimeForm((current) => ({
      ...current,
      receive: resource
    }));
  };
  const resetPlayerTradeComposer = () => {
    resetTradeComposerContext();
    props.setTradeForm({
      give: createEmptyResourceMap(),
      want: createEmptyResourceMap(),
      targetPlayerId: getDefaultTradeTargetPlayerId()
    });
    setFocusedTradeOfferId(incomingTradeOffers[0]?.id ?? ownTradeOffers[0]?.id ?? null);
  };
  const handleSendTradeOffer = () => {
    if (!canSubmitTradeOffer) {
      return;
    }

    props.onOfferTrade();
    resetTradeComposerContext();
  };
  const handleExecuteMaritimeTrade = () => {
    if (!canSubmitMaritimeTrade) {
      return;
    }

    props.onAction(maritimeTradeMessage);
  };
  const handleWithdrawTradeOffer = (tradeId: string) => {
    props.onAction(
      createMatchActionMessage({
        type: "withdraw_trade_offer",
        tradeId
      })
    );
  };
  const handleAcceptTradeOffer = (tradeId: string) => {
    props.onAction(
      createMatchActionMessage({
        type: "accept_trade_offer",
        tradeId
      })
    );
  };
  const handleDeclineTradeOffer = (tradeId: string) => {
    props.onAction(
      createMatchActionMessage({
        type: "decline_trade_offer",
        tradeId
      })
    );
  };
  const handleEditTradeOffer = (trade: MatchSnapshot["tradeOffers"][number]) => {
    setTradeMode("player");
    resetTradeComposerContext();
    props.setTradeForm({
      give: cloneTradeResourceMap(trade.give),
      want: cloneTradeResourceMap(trade.want),
      targetPlayerId: trade.toPlayerId ?? getDefaultTradeTargetPlayerId()
    });
    setFocusedTradeOfferId(trade.id);
    openTradeWorkspace({ mode: "player", focusTradeId: trade.id });
    handleWithdrawTradeOffer(trade.id);
  };
  const handleStartCounterOffer = (trade: MatchSnapshot["tradeOffers"][number]) => {
    const lockedTargetPlayerId = isCurrentPlayer ? trade.fromPlayerId : props.match.currentPlayerId;
    setTradeMode("player");
    setTradeComposerContext({
      kind: "counter",
      sourceTradeId: trade.id,
      lockedTargetPlayerId
    });
    props.setTradeForm({
      give: cloneTradeResourceMap(trade.want),
      want: cloneTradeResourceMap(trade.give),
      targetPlayerId: lockedTargetPlayerId
    });
    setFocusedTradeOfferId(trade.id);
    openTradeWorkspace({ mode: "player", focusTradeId: trade.id });
  };
  const handleTradeSheetPointerStart = (event: PointerEvent<HTMLDivElement>) => {
    tradeSheetPointerIdRef.current = event.pointerId;
    tradeSheetPointerStartYRef.current = event.clientY;
    setMobileTradeSheetDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleTradeSheetPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (tradeSheetPointerIdRef.current !== event.pointerId) {
      return;
    }

    setMobileTradeSheetDragOffset(Math.max(0, event.clientY - tradeSheetPointerStartYRef.current));
  };
  const handleTradeSheetPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (tradeSheetPointerIdRef.current !== event.pointerId) {
      return;
    }

    const dragDistance = Math.max(0, event.clientY - tradeSheetPointerStartYRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    tradeSheetPointerIdRef.current = null;
    tradeSheetPointerStartYRef.current = 0;
    if (dragDistance > 84) {
      closeMobileTradeSheet();
      return;
    }

    setMobileTradeSheetDragOffset(0);
  };

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
  const playerTradeSubmitHint = hasOwnTradeOffer
    ? "Offenes Angebot zuerst ändern oder zurückziehen."
    : !props.match.allowedMoves.canCreateTradeOffer
      ? "Spielerhandel ist gerade gesperrt."
      : tradeGiveTotal === 0 || tradeWantTotal === 0
        ? "Geben und Erhalten festlegen."
        : "Direkt ohne Bestätigung.";
  const maritimeTradeSubmitHint =
    tradeMode === "harbor" && harborTradeResources.length === 0
      ? "Kein passender Hafen verfügbar."
      : !props.match.allowedMoves.canMaritimeTrade
        ? "Nur im eigenen Aktionszug möglich."
        : props.maritimeForm.give === props.maritimeForm.receive
          ? "Unterschiedliche Rohstoffe wählen."
          : "Direkt ohne Bestätigung.";
  const maritimeActionLabel =
    visibleMaritimeGiveResources.length > 0 ? `${maritimeRatio}:1 tauschen` : tradeMode === "bank" ? "Banktausch nicht möglich" : "Hafentausch nicht möglich";
  const tradeToolbarStatus =
    tradeMode === "player"
      ? tradeComposerContext.kind === "counter"
        ? "Gegenangebot"
        : hasOwnTradeOffer
          ? `${ownTradeOffers.length} offen`
          : incomingTradeOffers.length
            ? `${incomingTradeOffers.length} sichtbar`
            : "Bereit"
      : tradeMode === "bank"
        ? "4:1"
        : harborTradeResources.length > 0
          ? "Beste Rate"
          : "Kein Hafen";
  const maritimeGiveSelection = createEmptyResourceMap();
  if (visibleMaritimeGiveResources.includes(props.maritimeForm.give)) {
    maritimeGiveSelection[props.maritimeForm.give] = maritimeRatio;
  }
  const maritimeReceiveSelection = createEmptyResourceMap();
  maritimeReceiveSelection[props.maritimeForm.receive] = 1;
  const tradeModeControls = (
    <div className="mini-segmented trade-mode-segmented" role="tablist" aria-label="Handelsmodus">
      <button type="button" className={tradeMode === "player" ? "is-active" : ""} onClick={() => setTradeMode("player")}>
        Spieler
      </button>
      <button type="button" className={tradeMode === "bank" ? "is-active" : ""} onClick={() => setTradeMode("bank")}>
        Bank
      </button>
      <button type="button" className={tradeMode === "harbor" ? "is-active" : ""} onClick={() => setTradeMode("harbor")}>
        Hafen
      </button>
    </div>
  );
  const selectedTradeTargetLabel =
    selectedTradeTargetPlayer == null ? "Alle Spieler" : selectedTradeTargetPlayer.id === props.match.you ? "Du" : selectedTradeTargetPlayer.username;
  const playerTradeTargetButtons = isCurrentPlayer && !tradeComposerContext.lockedTargetPlayerId ? (
    <label
      className={`trade-target-select-shell ${selectedTradeTargetAccentClass}`.trim()}
      title={
        selectedTradeTargetPlayer
          ? `${selectedTradeTargetLabel} · ${renderPlayerColorLabel(selectedTradeTargetPlayer.color)}`
          : "Offenes Angebot an alle Spieler"
      }
    >
      <span className="trade-target-select-dot" aria-hidden="true" />
      <span className="trade-target-select-copy">{selectedTradeTargetLabel}</span>
      <span className="trade-target-select-caret" aria-hidden="true" />
      <select
        className="trade-target-select"
        aria-label="Zielspieler wählen"
        value={props.tradeForm.targetPlayerId}
        onChange={(event) => props.setTradeForm((current) => ({ ...current, targetPlayerId: event.target.value }))}
      >
        <option value="">Alle Spieler</option>
        {tradeTargetPlayers.map((player) => (
          <option key={player.id} value={player.id}>
            {`${player.id === props.match.you ? "Du" : player.username} · ${renderPlayerColorLabel(player.color)}`}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <div className={`trade-target-static ${selectedTradeTargetAccentClass}`.trim()}>
      <span className="eyebrow">{tradeComposerContext.kind === "counter" ? "Gegenangebot an" : "Ziel"}</span>
      {effectiveTradeTargetPlayer ? (
        <PlayerIdentity
          username={effectiveTradeTargetPlayer.username}
          color={effectiveTradeTargetPlayer.color}
          compact
          isSelf={effectiveTradeTargetPlayer.id === props.match.you}
        />
      ) : (
        <strong>Offen</strong>
      )}
    </div>
  );
  const playerTradeComposer = (
    <section className="trade-composer-card trade-composer-card-player">
      <div className="trade-composer-headbar">
        <div className="trade-composer-title">
          <strong>{tradeComposerContext.kind === "counter" ? "Gegenangebot" : "Neues Angebot"}</strong>
        </div>
        {tradeComposerContext.kind === "counter" ? <span className="status-pill is-warning">Aktiv</span> : null}
      </div>
      <div className="trade-composer-grid is-stacked">
        <div className="trade-matrix-shell is-player-draft">
          <div className="trade-matrix-head">
            <span aria-hidden="true" />
            <span>Hand</span>
            <span>Gibst</span>
            <span>Willst</span>
          </div>
          <div className="trade-matrix-list">
            {RESOURCES.map((resource) => {
              const available = props.selfPlayer?.resources?.[resource] ?? 0;
              const giveDrafted = props.tradeForm.give[resource] ?? 0;
              const wantDrafted = props.tradeForm.want[resource] ?? 0;
              const giveDisabled = available <= 0 || giveDrafted >= available;
              const wantDisabled = wantDrafted >= 99;

              return (
                <div key={`trade-matrix-${resource}`} className="trade-matrix-row">
                  <div className="trade-matrix-resource" title={renderResourceLabel(resource)}>
                    <span className="trade-matrix-resource-icon" aria-hidden="true">
                      <ResourceIcon resource={resource} shell size={14} />
                    </span>
                  </div>
                  <span className="trade-matrix-meta">{available}</span>
                  <TradeMatrixDraftControl
                    value={giveDrafted}
                    tone="give"
                    incrementDisabled={giveDisabled}
                    incrementTitle={`${renderResourceLabel(resource)} geben · Hand ${available}`}
                    decrementTitle={`${renderResourceLabel(resource)} aus Abgabe entfernen`}
                    onIncrement={() => updateTradeDraft("give", resource, giveDrafted + 1)}
                    onDecrement={() => updateTradeDraft("give", resource, giveDrafted - 1)}
                  />
                  <TradeMatrixDraftControl
                    value={wantDrafted}
                    tone="receive"
                    incrementDisabled={wantDisabled}
                    incrementTitle={`${renderResourceLabel(resource)} erhalten`}
                    decrementTitle={`${renderResourceLabel(resource)} aus Wunsch entfernen`}
                    onIncrement={() => updateTradeDraft("want", resource, wantDrafted + 1)}
                    onDecrement={() => updateTradeDraft("want", resource, wantDrafted - 1)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="trade-composer-footer">
        <article className="trade-target-shell">
          <div className="trade-target-shell-head">
            <span className="eyebrow">Ziel</span>
            {isCurrentPlayer && !tradeComposerContext.lockedTargetPlayerId ? null : (
              <strong>
                {effectiveTradeTargetPlayer
                  ? renderMatchPlayerText(props.match, effectiveTradeTargetPlayer.id === props.match.you ? "Du" : effectiveTradeTargetPlayer.username)
                  : "Offen für alle"}
              </strong>
            )}
          </div>
          {playerTradeTargetButtons}
        </article>
        <div className="trade-composer-actions">
          <div className="trade-composer-copy">
            <span>{playerTradeSubmitHint}</span>
          </div>
          <div className="trade-composer-button-row">
            {tradeComposerContext.kind === "counter" ? (
              <button type="button" className="ghost-button" onClick={resetPlayerTradeComposer}>
                Neu
              </button>
            ) : null}
            <button type="button" className="primary-button trade-submit-button" disabled={!canSubmitTradeOffer} onClick={handleSendTradeOffer}>
              {tradeComposerContext.kind === "counter" ? "Senden" : "Angebot senden"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
  const maritimeTradeComposer = (
    <section className="trade-composer-card">
      <div className="trade-composer-headbar">
        <div className="trade-composer-title">
          <strong>{tradeMode === "bank" ? "Soforttausch" : "Beste Hafenrate"}</strong>
        </div>
      </div>
      <div className="trade-composer-grid is-stacked">
        <div className="trade-compact-lane is-give">
          <div className="trade-compact-lane-head">
            <div className="trade-compact-lane-title">
              <span className="eyebrow">Du gibst</span>
              <span className={`trade-micro-pill ${visibleMaritimeGiveResources.length === 0 ? "is-muted" : ""}`.trim()}>
                {visibleMaritimeGiveResources.length === 0 ? "Keine Rate" : `${maritimeRatio}:1`}
              </span>
            </div>
          </div>
          <TradeResourcePillRow
            resources={maritimeGiveSelection}
            emptyLabel="Keine Rate"
            tone="give"
          />
        </div>
        <div className="trade-compact-lane is-receive">
          <div className="trade-compact-lane-head">
            <div className="trade-compact-lane-title">
              <span className="eyebrow">Du erhältst</span>
              <span className="trade-micro-pill">1 Karte</span>
            </div>
          </div>
          <TradeResourcePillRow resources={maritimeReceiveSelection} emptyLabel="Kein Ziel" tone="receive" />
        </div>
        {visibleMaritimeGiveResources.length ? (
          <div className="trade-matrix-shell">
            <div className="trade-matrix-head is-maritime">
              <span aria-hidden="true" />
              <span>Info</span>
              <span>Einsatz</span>
              <span>Ziel</span>
            </div>
            <div className="trade-matrix-list">
              {RESOURCES.map((resource) => {
                const ratio = maritimeRatesByResource[resource];
                const available = props.selfPlayer?.resources?.[resource] ?? 0;
                const giveVisible = visibleMaritimeGiveResources.includes(resource);
                const giveSelected = props.maritimeForm.give === resource;
                const receiveSelected = props.maritimeForm.receive === resource;

                return (
                  <div key={`maritime-matrix-${resource}`} className="trade-matrix-row">
                    <div className="trade-matrix-resource" title={renderResourceLabel(resource)}>
                      <span className="trade-matrix-resource-icon" aria-hidden="true">
                        <ResourceIcon resource={resource} shell size={14} />
                      </span>
                    </div>
                    <span className="trade-matrix-meta">{`${available} · ${ratio}:1`}</span>
                    <TradeMatrixCellButton
                      value={giveVisible ? `${ratio}:1` : "—"}
                      tone="give"
                      active={giveSelected}
                      disabled={!giveVisible || available < ratio}
                      title={`${renderResourceLabel(resource)} als Einsatz wählen`}
                      onClick={() => handleSelectMaritimeGive(resource)}
                    />
                    <TradeMatrixCellButton
                      value={receiveSelected ? "1" : "○"}
                      tone="receive"
                      active={receiveSelected}
                      title={`${renderResourceLabel(resource)} als Ziel wählen`}
                      onClick={() => handleSelectMaritimeReceive(resource)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="trade-inline-empty">Für diesen Modus ist aktuell kein passender Rohstoff verfügbar.</div>
        )}
      </div>
      <div className="trade-composer-footer">
        <article className="trade-target-shell is-static">
          <div className="trade-target-static">
            <span className="eyebrow">Ziel</span>
            <strong>{tradeMode === "bank" ? "Bank" : "Hafen"}</strong>
          </div>
        </article>
        <div className="trade-composer-actions">
          <div className="trade-composer-copy">
            <span>{maritimeTradeSubmitHint}</span>
          </div>
          <div className="trade-composer-button-row">
            <button type="button" className="secondary-button trade-submit-button" disabled={!canSubmitMaritimeTrade} onClick={handleExecuteMaritimeTrade}>
              {maritimeActionLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
  const tradeOwnOffersSection = ownTradeOffers.length ? (
    <section className="dock-section trade-zone">
      <div className="dock-section-head">
        <h3>{ownTradeOffers.length > 1 ? "Eigene Angebote" : "Dein Angebot"}</h3>
        <span>{`${ownTradeOffers.length} aktiv`}</span>
      </div>
      <div className="trade-offer-stack">
        {ownTradeOffers.map((trade) => (
          <TradeOfferCard
            key={trade.id}
            match={props.match}
            trade={trade}
            currentUserId={props.match.you}
            variant="own"
            focused={focusedTradeOfferId === trade.id}
            onEdit={() => handleEditTradeOffer(trade)}
            onWithdraw={() => handleWithdrawTradeOffer(trade.id)}
          />
        ))}
      </div>
    </section>
  ) : null;
  const tradeIncomingOffersSection = (
    <section className="dock-section dock-section-fill trade-zone trade-zone-scroll">
      <div className="dock-section-head">
        <h3>Eingehend</h3>
        <span>{incomingTradeOffers.length ? `${incomingTradeOffers.length} sichtbar` : "Keine Angebote"}</span>
      </div>
      {incomingTradeOffers.length ? (
        <div className="scroll-list trade-offer-list">
          {incomingTradeOffers.map((trade) => (
            <TradeOfferCard
              key={trade.id}
              match={props.match}
              trade={trade}
              currentUserId={props.match.you}
              variant="incoming"
              focused={focusedTradeOfferId === trade.id}
              canAccept={acceptableTradeOfferIds.has(trade.id)}
              canDecline={declineableTradeOfferIds.has(trade.id)}
              canCounter={props.match.allowedMoves.canCreateTradeOffer && !hasOwnTradeOffer}
              onAccept={() => handleAcceptTradeOffer(trade.id)}
              onDecline={() => handleDeclineTradeOffer(trade.id)}
              onCounter={() => handleStartCounterOffer(trade)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">Aktuell liegt kein sichtbares Handelsangebot vor.</div>
      )}
    </section>
  );
  const tradeWorkspace = (
    <div className="panel-frame trade-frame trade-workspace">
      <section className="trade-toolbar">
        <div className="trade-toolbar-copy">
          <h3>Handel</h3>
          <span>{tradeToolbarStatus}</span>
        </div>
        {tradeModeControls}
      </section>
      {tradeMode === "player" ? playerTradeComposer : maritimeTradeComposer}
      {tradeOwnOffersSection}
      {tradeIncomingOffersSection}
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
            {buildActions.map((action) => {
              const className = `build-action-card ${action.active ? "is-active" : action.disabled ? "is-disabled" : "is-ready"}`;
              const content = (
                <span className="build-action-head">
                  <strong>{action.label}</strong>
                  <span>{action.costLabel}</span>
                </span>
              );
              const buttonProps = {
                "aria-disabled": action.disabled,
                onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                },
                onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                },
                onPointerLeave: closeBuildActionTooltip,
                onMouseEnter: (event: MouseEvent<HTMLButtonElement>) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                },
                onMouseLeave: closeBuildActionTooltip,
                onFocus: (event: FocusEvent<HTMLButtonElement>) => {
                  if (!action.disabled) {
                    return;
                  }

                  openBuildActionTooltip(action.tooltip, event.currentTarget);
                },
                onBlur: closeBuildActionTooltip
              } satisfies Omit<ComponentProps<"button">, "type" | "className" | "onClick" | "disabled">;

              if (action.id === "development" && buyDevelopmentConfirmKey && buyDevelopmentConfirmation) {
                return (
                  <InlineConfirmButton
                    key={action.id}
                    confirmKey={buyDevelopmentConfirmKey}
                    armedActionKey={armedActionKey}
                    onArm={setArmedActionKey}
                    onClear={clearArmedAction}
                    onConfirm={action.onClick}
                    buttonClassName={className}
                    disabled={action.disabled}
                    content={content}
                    armedContent={
                      <span className="build-action-head">
                        <strong>{buyDevelopmentConfirmation.confirmLabel}</strong>
                        <span>{action.costLabel}</span>
                      </span>
                    }
                    buttonProps={buttonProps}
                  />
                );
              }

              return (
                <button
                  key={action.id}
                  type="button"
                  className={className}
                  aria-disabled={action.disabled}
                  onPointerEnter={buttonProps.onPointerEnter}
                  onPointerMove={buttonProps.onPointerMove}
                  onPointerLeave={buttonProps.onPointerLeave}
                  onMouseEnter={buttonProps.onMouseEnter}
                  onMouseLeave={buttonProps.onMouseLeave}
                  onFocus={buttonProps.onFocus}
                  onBlur={buttonProps.onBlur}
                  onClick={() => {
                    if (action.disabled) {
                      return;
                    }

                    action.onClick();
                  }}
                >
                  {content}
                </button>
              );
            })}
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
    trade: tradeWorkspace,
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
                <div className="board-mobile-controls">
                  <button
                    type="button"
                    className={`board-mobile-trade-button ${mobileTradeSheetOpen ? "is-active" : ""} ${incomingTradeCount > 0 ? "has-alert" : ""}`.trim()}
                    onClick={() =>
                      openTradeWorkspace({
                        mode: incomingTradeOffer ? "player" : tradeMode,
                        focusTradeId: incomingTradeOffer?.id ?? focusedTradeOfferId
                      })
                    }
                    aria-expanded={mobileTradeSheetOpen}
                    aria-controls="mobile-trade-sheet"
                  >
                    <span className="board-mobile-trade-copy">
                      <strong>Handel</strong>
                      <span>
                        {incomingTradeCount > 0
                          ? `${incomingTradeCount} Antwort${incomingTradeCount === 1 ? "" : "en"} offen`
                          : hasOwnTradeOffer
                            ? "Eigenes Angebot wartet"
                            : "Schnell verhandeln"}
                      </span>
                    </span>
                    {incomingTradeCount > 0 ? (
                      <span className="tab-alert-badge">{incomingTradeCount > 9 ? "9+" : incomingTradeCount}</span>
                    ) : null}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="board-chip">Zug {props.match.turn}</span>
                <span className="board-chip">{formatPhase(props.match.phase)}</span>
                {props.selfPlayer ? (
                  <PlayerColorBadge
                    color={props.selfPlayer.color}
                    label={`Du · ${props.selfPlayer.username} · ${renderPlayerColorLabel(props.selfPlayer.color)}`}
                    compact
                  />
                ) : null}
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
              armedSelection={props.pendingBoardAction?.selection ?? null}
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
            {props.pendingBoardAction ? (
              <aside
                className={`surface board-inline-confirm ${isMobileViewport ? "is-mobile" : ""}`.trim()}
                role="dialog"
                aria-modal="false"
                aria-labelledby="board-inline-confirm-title"
              >
                <div className="board-inline-confirm-copy">
                  <span className="eyebrow">Bestätigung</span>
                  <strong id="board-inline-confirm-title">{props.pendingBoardAction.title}</strong>
                  <span>{renderMatchPlayerText(props.match, props.pendingBoardAction.detail)}</span>
                </div>
                {pendingBoardActionNeedsTarget ? (
                  <div className="board-inline-confirm-targets">
                    {pendingBoardTargetPlayers.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={`board-inline-confirm-target ${getPlayerAccentClass(player.color)} ${
                          pendingBoardTargetPlayerId === player.id ? "is-active" : ""
                        }`.trim()}
                        onClick={() => props.onSelectPendingRobberTarget(player.id)}
                      >
                        <PlayerIdentity username={player.username} color={player.color} compact isSelf={player.id === props.match.you} />
                        <span>{pendingBoardTargetPlayerId === player.id ? "Ausgewählt" : "Als Opfer wählen"}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="board-inline-confirm-actions">
                  <button type="button" className="ghost-button" onClick={props.onCancelPendingBoardAction}>
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!canConfirmPendingBoardAction}
                    onClick={props.onConfirmPendingBoardAction}
                  >
                    {props.pendingBoardAction.confirmLabel}
                  </button>
                </div>
              </aside>
            ) : null}
            {showIncomingTradeAlert && incomingTradeOffer ? (
              <TradeBanner
                className={`is-board-alert ${isMobileViewport ? "is-mobile" : ""}`}
                trade={incomingTradeOffer}
                currentUserId={props.match.you}
                match={props.match}
                onAction={props.onAction}
                onOpenTrade={() => openTradeWorkspace({ mode: "player", focusTradeId: incomingTradeOffer.id })}
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
                  className={`board-legend-icon-button ${boardLegendOpen ? "is-open" : ""}`}
                  onClick={() => setBoardLegendOpen((current) => !current)}
                  aria-expanded={boardLegendOpen}
                  aria-controls="board-legend-panel"
                  aria-label={boardLegendOpen ? "Legende schließen" : "Legende öffnen"}
                >
                  <span className="board-legend-icon-glyph" aria-hidden="true">
                    i
                  </span>
                </button>
                {boardLegendOpen ? (
                  <div id="board-legend-panel" className="board-legend-panel">
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
                <div id="board-spotlight-card">
                  <MatchNotificationCard
                    key={`desktop-${displayHeroNotification.key}`}
                    match={props.match}
                    notification={displayHeroNotification}
                    variant="hero"
                    badgeLimit={isCompactViewport ? 2 : 4}
                  />
                </div>
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
          <div className="tab-strip center-last-item" style={getTabStripStyle(desktopTabLayout)} role="tablist" aria-label="Match Navigation">
            {MATCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                style={getTabButtonStyle(desktopTabLayout, tab.id)}
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
              className="tab-strip mobile"
              style={getTabStripStyle(mobileTabLayout)}
              role="tablist"
              aria-label="Mobile Match Navigation"
            >
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  style={getTabButtonStyle(mobileTabLayout, tab.id)}
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
      {isMobileViewport && mobileTradeSheetOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <button type="button" className="trade-mobile-sheet-backdrop" aria-label="Handel schließen" onClick={closeMobileTradeSheet} />
              <section className="trade-mobile-sheet-shell" aria-hidden={false}>
                <div
                  id="mobile-trade-sheet"
                  className="surface trade-mobile-sheet"
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="mobile-trade-sheet-title"
                  style={mobileTradeSheetDragOffset > 0 ? { transform: `translateY(${mobileTradeSheetDragOffset}px)` } : undefined}
                >
                  <div
                    className="trade-mobile-sheet-handle"
                    onPointerDown={handleTradeSheetPointerStart}
                    onPointerMove={handleTradeSheetPointerMove}
                    onPointerUp={handleTradeSheetPointerEnd}
                    onPointerCancel={handleTradeSheetPointerEnd}
                  >
                    <span className="trade-mobile-sheet-grab" aria-hidden="true" />
                  </div>
                  <div className="trade-mobile-sheet-head">
                    <div>
                      <span className="eyebrow">Handel</span>
                      <h2 id="mobile-trade-sheet-title">Verhandlung</h2>
                    </div>
                    <button type="button" className="ghost-button" onClick={closeMobileTradeSheet}>
                      Schließen
                    </button>
                  </div>
                  {tradeWorkspace}
                </div>
              </section>
            </>,
            document.body
          )
        : null}
    </section>
  );
}

