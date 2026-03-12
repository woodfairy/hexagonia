import { useEffect, useMemo, useRef, useState, type CSSProperties, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { memo, startTransition } from "react";
import type { FocusEvent, MouseEvent, PointerEvent } from "react";
import type {
  ClientMessage,
  DevelopmentCardView,
  MatchSnapshot,
  PirateStealType,
  PortType,
  RouteBuildType,
  Resource,
  ResourceMap,
  TileTerrain,
  RoomDetails
} from "@hexagonia/shared";
import {
  BUILD_COSTS,
  createEmptyResourceMap,
  equalResourceMaps,
  hasResources,
  RESOURCES,
  totalResources
} from "@hexagonia/shared";
import { BoardScene, type ArmedBoardSelection, type BoardFocusCue, type InteractionMode } from "../../BoardScene";
import { getMatchActionConfirmation, getMatchActionKey } from "../../appSupport";
import { type BoardVisualSettings, TILE_COLORS } from "../../boardVisuals";
import { getDocumentLocale, translate, useI18n } from "../../i18n";
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
  createOpeningMatchCameraCue,
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
  TradeCompactSummary,
  TradeBanner
} from "./matchScreenParts";

export interface TradeFormState {
  give: ResourceMap;
  want: ResourceMap;
  targetPlayerId: string;
}

export interface MaritimeFormState {
  give: Resource | "";
  giveCount: number;
  receive: ResourceMap;
}

export interface PendingBoardActionState {
  key: string;
  message: Extract<ClientMessage, { type: "match.action" }>;
  selection: ArmedBoardSelection;
  targetPlayerIds: string[];
  pirateStealTypes?: PirateStealType[];
  afterConfirm?: () => void;
}

export interface PendingRouteChoiceState {
  kind: "initial" | "free";
  edgeId: string;
  routeTypes: RouteBuildType[];
}

type MatchProfileMenuProps = ComponentProps<typeof ProfileMenu>;
type MatchPanelTab = "overview" | "actions" | "hand" | "trade" | "players" | "profile";
type SheetState = "peek" | "half" | "full";
type TradeMode = "player" | "maritime";
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
type TradeSelectOption = {
  value: string;
  label: string;
  secondaryLabel?: string;
  icon?: ReactNode;
  accentClassName?: string;
  disabled?: boolean;
  title?: string;
};

export interface MatchScreenProps {
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
  goldChoice: Resource[];
  pendingRouteChoice: PendingRouteChoiceState | null;
  selectedPortTokenType: PortType | null;
  selectedScenarioSetupTerrain: TileTerrain | null;
  selectedScenarioSetupToken: number | null;
  selectedScenarioSetupPortType: PortType | null;
  pendingBoardAction: PendingBoardActionState | null;
  onAction: (message: ClientMessage) => void;
  onChooseRouteType: (routeType: RouteBuildType) => void;
  onCancelRouteChoice: () => void;
  onConfirmPendingBoardAction: () => void;
  onCancelPendingBoardAction: () => void;
  onSelectPendingRobberTarget: (targetPlayerId: string) => void;
  onSelectPendingPirateStealType: (stealType: PirateStealType) => void;
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
  setGoldChoice: Dispatch<SetStateAction<Resource[]>>;
  setSelectedPortTokenType: Dispatch<SetStateAction<PortType | null>>;
  setSelectedScenarioSetupTerrain: Dispatch<SetStateAction<TileTerrain | null>>;
  setSelectedScenarioSetupToken: Dispatch<SetStateAction<number | null>>;
  setSelectedScenarioSetupPortType: Dispatch<SetStateAction<PortType | null>>;
}

const MATCH_TABS: Array<{ id: MatchPanelTab; labelKey: string }> = [
  { id: "actions", labelKey: "match.tab.actions" },
  { id: "trade", labelKey: "match.tab.trade" },
  { id: "hand", labelKey: "match.tab.hand" },
  { id: "overview", labelKey: "match.tab.events" },
  { id: "players", labelKey: "match.tab.players" }
];

const MOBILE_MATCH_TABS: Array<{ id: MatchPanelTab; labelKey: string }> = [
  { id: "actions", labelKey: "match.tab.actions" },
  { id: "trade", labelKey: "match.tab.trade" },
  { id: "hand", labelKey: "match.tab.hand" },
  { id: "overview", labelKey: "match.tab.events" },
  { id: "profile", labelKey: "shared.profile" }
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
const MATCH_ACTIVE_TAB_STORAGE_KEY = "hexagonia:match-active-tab";

function td(key: string, params?: Record<string, string | number>) {
  return translate(getDocumentLocale(), key, undefined, undefined, params);
}

function isMatchPanelTab(value: string): value is MatchPanelTab {
  return value === "overview" || value === "actions" || value === "hand" || value === "trade" || value === "players" || value === "profile";
}

function getDefaultMatchPanelTab(): MatchPanelTab {
  return "actions";
}

function readPersistedMatchPanelTab() {
  if (typeof window === "undefined") {
    return getDefaultMatchPanelTab();
  }

  const storedTab = window.localStorage.getItem(MATCH_ACTIVE_TAB_STORAGE_KEY);
  return storedTab && isMatchPanelTab(storedTab) ? storedTab : getDefaultMatchPanelTab();
}
const RESOURCE_LEGEND: Array<{ resource: Resource | "desert"; noteKey: string }> = [
  { resource: "brick", noteKey: "match.legend.resource.brick" },
  { resource: "lumber", noteKey: "match.legend.resource.lumber" },
  { resource: "ore", noteKey: "match.legend.resource.ore" },
  { resource: "grain", noteKey: "match.legend.resource.grain" },
  { resource: "wool", noteKey: "match.legend.resource.wool" },
  { resource: "desert", noteKey: "match.legend.resource.desert" }
];
const HARBOR_LEGEND: Array<{ type: PortType; noteKey: string }> = [
  { type: "generic", noteKey: "match.legend.harbor.generic" },
  { type: "brick", noteKey: "match.legend.harbor.brick" },
  { type: "lumber", noteKey: "match.legend.harbor.lumber" },
  { type: "ore", noteKey: "match.legend.harbor.ore" },
  { type: "grain", noteKey: "match.legend.harbor.grain" },
  { type: "wool", noteKey: "match.legend.harbor.wool" }
];
const COMPACT_RESOURCE_LEGEND: Array<{ resource: Resource | "desert"; noteKey: string }> = [
  { resource: "brick", noteKey: "match.legend.resourceCompact.brick" },
  { resource: "lumber", noteKey: "match.legend.resourceCompact.lumber" },
  { resource: "ore", noteKey: "match.legend.resourceCompact.ore" },
  { resource: "grain", noteKey: "match.legend.resourceCompact.grain" },
  { resource: "wool", noteKey: "match.legend.resourceCompact.wool" },
  { resource: "desert", noteKey: "match.legend.resourceCompact.desert" }
];

const COMPACT_HARBOR_LEGEND: Array<{ type: PortType; noteKey: string }> = [
  { type: "generic", noteKey: "match.legend.harborCompact.generic" },
  { type: "brick", noteKey: "match.legend.harborCompact.brick" },
  { type: "lumber", noteKey: "match.legend.harborCompact.lumber" },
  { type: "ore", noteKey: "match.legend.harborCompact.ore" },
  { type: "grain", noteKey: "match.legend.harborCompact.grain" },
  { type: "wool", noteKey: "match.legend.harborCompact.wool" }
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

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function areBoardVisualSettingsEqual(left: BoardVisualSettings, right: BoardVisualSettings): boolean {
  return (
    left.textures === right.textures &&
    left.props === right.props &&
    left.terrainRelief === right.terrainRelief &&
    left.resourceIcons === right.resourceIcons &&
    left.pieceStyle === right.pieceStyle
  );
}

function arePendingBoardActionsEqual(
  left: PendingBoardActionState | null,
  right: PendingBoardActionState | null
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.key === right.key &&
    left.selection.kind === right.selection.kind &&
    left.selection.id === right.selection.id &&
    areStringArraysEqual(left.targetPlayerIds, right.targetPlayerIds) &&
    areStringArraysEqual(left.pirateStealTypes ?? [], right.pirateStealTypes ?? [])
  );
}

function areProfileMenuPropsEqual(left: MatchProfileMenuProps, right: MatchProfileMenuProps): boolean {
  return (
    left.connectionState === right.connectionState &&
    left.soundMuted === right.soundMuted &&
    left.hapticsMuted === right.hapticsMuted &&
    left.hapticsSupported === right.hapticsSupported &&
    left.musicPaused === right.musicPaused &&
    left.musicPlaybackMode === right.musicPlaybackMode &&
    left.selectedMusicTrackId === right.selectedMusicTrackId &&
    left.musicTracks === right.musicTracks &&
    left.session === right.session &&
    left.roomCode === right.roomCode &&
    areBoardVisualSettingsEqual(left.boardVisualSettings, right.boardVisualSettings)
  );
}

function areMatchScreenPropsEqual(left: MatchScreenProps, right: MatchScreenProps): boolean {
  return (
    left.match === right.match &&
    left.pendingDiceEvent === right.pendingDiceEvent &&
    left.diceRevealPending === right.diceRevealPending &&
    left.room === right.room &&
    left.selfPlayer === right.selfPlayer &&
    left.interactionMode === right.interactionMode &&
    left.tradeForm === right.tradeForm &&
    left.maritimeForm === right.maritimeForm &&
    left.monopolyResource === right.monopolyResource &&
    areStringArraysEqual(left.goldChoice, right.goldChoice) &&
    left.yearOfPlenty[0] === right.yearOfPlenty[0] &&
    left.yearOfPlenty[1] === right.yearOfPlenty[1] &&
    areStringArraysEqual(left.selectedRoadEdges, right.selectedRoadEdges) &&
    left.selectedScenarioSetupTerrain === right.selectedScenarioSetupTerrain &&
    left.selectedScenarioSetupToken === right.selectedScenarioSetupToken &&
    left.selectedScenarioSetupPortType === right.selectedScenarioSetupPortType &&
    arePendingBoardActionsEqual(left.pendingBoardAction, right.pendingBoardAction) &&
    areBoardVisualSettingsEqual(left.boardVisualSettings, right.boardVisualSettings) &&
    areProfileMenuPropsEqual(left.profileMenuProps, right.profileMenuProps)
  );
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
        aria-label={td("shared.cancelConfirmation")}
        tabIndex={armed ? 0 : -1}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
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

function TradeSelect(props: {
  value: string;
  ariaLabel: string;
  options: ReadonlyArray<TradeSelectOption>;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const selectedOption = props.options.find((option) => option.value === props.value) ?? props.options[0] ?? null;
  const triggerDisabled = props.disabled || props.options.length === 0;

  useEffect(() => {
    if (!open || triggerDisabled || typeof window === "undefined") {
      setMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 13.5 * 16), viewportWidth - 16);
      const estimatedHeight = Math.min(props.options.length, 6) * 46 + 14;
      const spaceBelow = viewportHeight - rect.bottom - 10;
      const spaceAbove = rect.top - 10;
      const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(8 * 16, openUpward ? spaceAbove : spaceBelow);
      const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));

      setMenuStyle({
        position: "fixed",
        insetInlineStart: left,
        insetBlockStart: openUpward ? Math.max(8, rect.top - 6) : Math.min(viewportHeight - 8, rect.bottom + 6),
        inlineSize: width,
        maxBlockSize: maxHeight,
        transform: openUpward ? "translateY(-100%)" : undefined
      });
    };

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    updateMenuPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, props.options.length, triggerDisabled]);

  useEffect(() => {
    if (triggerDisabled) {
      setOpen(false);
    }
  }, [triggerDisabled]);

  const handleSelect = (option: TradeSelectOption) => {
    if (option.disabled) {
      return;
    }

    props.onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`trade-target-select-shell ${props.className ?? ""} ${selectedOption?.accentClassName ?? ""} ${
          open ? "is-open" : ""
        }`.trim()}
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={triggerDisabled}
        title={selectedOption?.title ?? selectedOption?.label}
        onClick={() => {
          if (triggerDisabled) {
            return;
          }

          setOpen((current) => !current);
        }}
      >
        <span className="trade-target-select-leading" aria-hidden="true">
          {selectedOption?.icon ?? <span className="trade-target-select-dot" />}
        </span>
        <span className="trade-target-select-copy">{selectedOption?.label ?? td("shared.select")}</span>
        <span className="trade-target-select-caret" aria-hidden="true" />
      </button>
      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <div ref={menuRef} className="trade-select-menu" style={menuStyle} role="listbox" aria-label={props.ariaLabel}>
              {props.options.map((option) => {
                const active = option.value === props.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    className={`trade-select-menu-option ${option.accentClassName ?? ""} ${active ? "is-active" : ""}`.trim()}
                    aria-selected={active}
                    disabled={option.disabled}
                    title={option.title ?? option.label}
                    onClick={() => handleSelect(option)}
                  >
                    <span className="trade-select-menu-icon" aria-hidden="true">
                      {option.icon ?? <span className="trade-target-select-dot" />}
                    </span>
                    <span className="trade-select-menu-copy">
                      <span className="trade-select-menu-label">{option.label}</span>
                      {option.secondaryLabel ? <span className="trade-select-menu-meta">{option.secondaryLabel}</span> : null}
                    </span>
                    <span className={`trade-select-menu-check ${active ? "is-visible" : ""}`.trim()} aria-hidden="true">
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
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
      ? td("match.trade.offer.yours")
      : proposer
        ? td("match.trade.offer.fromPlayer", {
            player: proposer.id === props.currentUserId ? td("shared.youDative") : proposer.username
          })
        : td("match.trade.offer.default");

  return (
    <article className={`trade-offer-card trade-offer-row ${props.focused ? "is-focused" : ""} is-${props.variant}`.trim()}>
      <div className="trade-offer-row-head">
        <div className="trade-offer-row-party">
          {props.variant === "incoming" && proposer ? (
            <PlayerIdentity username={proposer.username} color={proposer.color} compact isSelf={proposer.id === props.currentUserId} />
          ) : (
            <strong>{offerLabel}</strong>
          )}
          <span>
            {target
              ? td("match.trade.target.player", {
                  player: target.id === props.currentUserId ? td("shared.youAccusative") : target.username
                })
              : td("match.trade.target.open")}
          </span>
        </div>
        <div className="trade-offer-row-meta">
          <span className="status-pill muted">{td("match.turnLabel", { turn: props.trade.createdAtTurn })}</span>
          {props.variant === "incoming" ? (
            <span className="status-pill is-warning">{td("match.trade.offer.replyOpen")}</span>
          ) : (
            <span className="status-pill">{td("match.trade.offer.waiting")}</span>
          )}
        </div>
      </div>
      <div className="trade-offer-row-trade">
        <TradeCompactSummary give={giveResources} receive={receiveResources} className="trade-offer-summary" />
      </div>
      <div className="trade-offer-row-actions">
        {props.variant === "own" ? (
          <>
            <button type="button" className="secondary-button" onClick={props.onEdit}>
              {td("shared.edit")}
            </button>
            <button type="button" className="ghost-button" onClick={props.onWithdraw}>
              {td("match.trade.action.withdraw")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="primary-button" disabled={!props.canAccept} onClick={props.onAccept}>
              {td("match.trade.action.accept")}
            </button>
            <button type="button" className="ghost-button" disabled={!props.canDecline} onClick={props.onDecline}>
              {td("match.trade.action.decline")}
            </button>
            <button type="button" className="secondary-button" disabled={!props.canCounter} onClick={props.onCounter}>
              {td("match.trade.action.counter")}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

const PlayersPanel = memo(function PlayersPanel(props: { match: MatchSnapshot }) {
  const { translate } = useI18n();
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, undefined, undefined, params);
  const showSeafarersPlayerStats = props.match.gameConfig.rulesFamily === "seafarers";
  const hasDisconnectCountdown = props.match.players.some(
    (player) => !player.connected && typeof player.disconnectDeadlineAt === "number"
  );
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

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

  return (
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
                    label={
                      player.id === props.match.you
                        ? t("match.playerBadge.withColor", {
                            player: t("shared.you"),
                            color: renderPlayerColorLabel(player.color)
                          })
                        : renderPlayerColorLabel(player.color)
                    }
                    compact
                  />
                </div>
              </div>
              <div className="player-stat-grid player-stat-grid-compact">
                <PlayerStatCard label={t("shared.vpShort")} value={String(player.publicVictoryPoints)} />
                <PlayerStatCard label={t("match.players.cards")} value={String(player.resourceCount)} />
                <PlayerStatCard label={t("match.players.roads")} value={String(player.roadsBuilt)} />
                <PlayerStatCard label={t("match.players.knights")} value={String(player.playedKnightCount)} />
              </div>
              {showSeafarersPlayerStats ? (
                <div className="player-stat-grid player-stat-grid-compact">
                  <PlayerStatCard label={t("match.players.routes")} value={String(player.routeLength ?? 0)} />
                  <PlayerStatCard label={t("match.players.ships")} value={String((player.shipsBuilt ?? 0) + (player.warshipsBuilt ?? 0))} />
                  <PlayerStatCard label={t("match.players.specialVp")} value={String(player.specialVictoryPoints ?? 0)} />
                  <PlayerStatCard label={t("match.players.wonders")} value={String(player.wonderProgress ?? 0)} />
                </div>
              ) : null}
              {showSeafarersPlayerStats ? (
                <div className="status-strip player-award-strip">
                  <span className="status-pill muted">{t("match.players.clothCount", { count: player.clothCount ?? 0 })}</span>
                  <span className="status-pill muted">{t("match.players.harborTokens", { count: player.harborTokenCount ?? 0 })}</span>
                </div>
              ) : null}
              <div className="status-strip player-award-strip">
                {player.id === props.match.currentPlayerId ? (
                  <span className={`status-pill player-badge player-accent-${player.color}`}>{t("match.players.activeTurn")}</span>
                ) : null}
                {player.hasLongestRoad ? <span className="status-pill award-pill is-longest-road">{t("match.award.longestRoad")}</span> : null}
                {player.hasLargestArmy ? <span className="status-pill award-pill is-largest-army">{t("match.award.largestArmy")}</span> : null}
                {player.id !== props.match.currentPlayerId && !player.hasLargestArmy && !player.hasLongestRoad ? (
                  <span className="status-pill muted">{t("match.players.noAward")}</span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
});

function MatchScreenComponent(props: MatchScreenProps) {
  const { locale, translate } = useI18n();
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, undefined, undefined, params);
  const [activeTab, setActiveTab] = useState<MatchPanelTab>(() => readPersistedMatchPanelTab());
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
  const matchTabs = useMemo(
    () => MATCH_TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) })),
    [translate]
  );
  const mobileMatchTabs = useMemo(
    () => MOBILE_MATCH_TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) })),
    [translate]
  );
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
  const seenDiceEventIdRef = useRef<string | null>(latestDiceEvent?.id ?? null);
  const diceAnimationTimerRef = useRef<number | null>(null);
  const diceAnimationCompleteRef = useRef<number | null>(null);
  const previousMatchRef = useRef<MatchSnapshot | null>(null);
  const notificationCacheRef = useRef(createEmptyMatchNotificationPrivateCache());
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
        locale,
        currentMatch: props.match,
        previousMatch: previousMatchRef.current,
        viewerId: props.match.you,
        privateCache: notificationCacheRef.current
      }),
    [locale, props.match]
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
    [activePlayer, locale, props.interactionMode, props.match, props.selectedRoadEdges]
  );
  const actionCameraCue = useMemo(
    () => createOwnActionCameraCue(props.match, activePlayer, props.interactionMode, props.selectedRoadEdges),
    [activePlayer, locale, props.interactionMode, props.match, props.selectedRoadEdges]
  );
  const openingCameraCue = useMemo(() => createOpeningMatchCameraCue(props.match), [locale, props.match]);
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
      ? (actionCameraCue ?? openingCameraCue ?? (shouldAutoFocusRecentEvent ? visibleNotificationCue : null))
      : null;
  const pendingRouteChoiceTitle = props.pendingRouteChoice
    ? props.pendingRouteChoice.kind === "initial"
      ? t("match.routeChoice.initial.title")
      : t("match.routeChoice.free.title")
    : "";
  const pendingRouteChoiceDetail = props.pendingRouteChoice
    ? props.pendingRouteChoice.kind === "initial"
      ? t("match.routeChoice.initial.detail")
      : t("match.routeChoice.free.detail")
    : "";
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
  const visibleMaritimeGiveResources = RESOURCES;
  const selectedMaritimeGiveResource = props.maritimeForm.give || null;
  const maritimeRatio = selectedMaritimeGiveResource ? (maritimeRatesByResource[selectedMaritimeGiveResource] ?? 4) : 0;
  const maritimeReceiveTotal = totalResources(props.maritimeForm.receive);
  const selectedMaritimeGiveAvailable = selectedMaritimeGiveResource
    ? (props.selfPlayer?.resources?.[selectedMaritimeGiveResource] ?? 0)
    : 0;
  const selectedMaritimeGiveMaxCount =
    selectedMaritimeGiveResource && maritimeRatio > 0 ? Math.floor(selectedMaritimeGiveAvailable / maritimeRatio) * maritimeRatio : 0;
  const maritimeReceiveCapacity = maritimeRatio > 0 ? Math.floor(props.maritimeForm.giveCount / maritimeRatio) : 0;
  const scenarioSetup = props.match.scenarioSetup;
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
  const canAffordShip = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.ship);
  const canAffordSettlement = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.settlement);
  const canAffordCity = canAffordCost(props.selfPlayer?.resources, BUILD_COSTS.city);
  const availableHarborTokens = props.selfPlayer?.harborTokens ?? [];
  const claimableWonderVertexIds = props.match.allowedMoves.wonderVertexIds.filter((vertexId) => {
    const site = props.match.board.sites?.find((entry) => entry.type === "wonder" && entry.vertexId === vertexId);
    return !site?.ownerId;
  });
  const buildableWonderVertexIds = props.match.allowedMoves.wonderVertexIds.filter((vertexId) => {
    const site = props.match.board.sites?.find((entry) => entry.type === "wonder" && entry.vertexId === vertexId);
    return site?.ownerId === props.match.you;
  });
  const canPlacePort =
    isCurrentPlayer &&
    props.match.allowedMoves.placeablePortVertexIds.length > 0 &&
    availableHarborTokens.length > 0;
  const canClaimWonder = isCurrentPlayer && claimableWonderVertexIds.length > 0;
  const canBuildWonder = isCurrentPlayer && buildableWonderVertexIds.length > 0;
  const canAttackFortress = isCurrentPlayer && props.match.allowedMoves.fortressVertexIds.length > 0;
  const renderPortTokenLabel = (type: PortType) =>
    type === "generic"
      ? t("match.legend.harborLabel.generic")
      : t("match.legend.harborLabel.resource", { resource: renderResourceLabel(type) });
  const buyDevelopmentAction: Extract<ClientMessage, { type: "match.action" }>["action"] = { type: "buy_development_card" };
  const buyDevelopmentMessage = createMatchActionMessage(buyDevelopmentAction);
  const buyDevelopmentConfirmation = getMatchActionConfirmation(props.match, buyDevelopmentAction);
  const buyDevelopmentConfirmKey =
    buyDevelopmentConfirmation && props.match.allowedMoves.canBuyDevelopmentCard
      ? createInlineConfirmKey("build-development", buyDevelopmentAction)
      : null;
  const buildActions = [
    createBuildActionState("road", t("match.build.road"), {
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
    createBuildActionState("ship", t("match.build.ship"), {
      cost: BUILD_COSTS.ship,
      enabled: isCurrentPlayer && props.match.allowedMoves.shipEdgeIds.length > 0 && canAffordShip,
      phase: props.match.phase,
      isCurrentPlayer,
      interactionMode: props.interactionMode,
      activeMode: "ship",
      legalTargetCount: props.match.allowedMoves.shipEdgeIds.length,
      resources: props.selfPlayer?.resources,
      onClick: () => props.setInteractionMode(props.interactionMode === "ship" ? null : "ship")
    }),
    createBuildActionState("settlement", t("match.build.settlement"), {
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
    createBuildActionState("city", t("match.build.city"), {
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
    createBuildActionState("development", t("match.build.development"), {
      cost: BUILD_COSTS.development,
      enabled: props.match.allowedMoves.canBuyDevelopmentCard,
      phase: props.match.phase,
      isCurrentPlayer,
      resources: props.selfPlayer?.resources,
      onClick: () => props.onAction(buyDevelopmentMessage)
    })
  ];
  const hasOwnTradeOffer = ownTradeOffers.length > 0;
  const isPlayerTradeCompletelyEmpty = tradeGiveTotal === 0 && tradeWantTotal === 0;
  const canSubmitTradeOffer =
    props.match.allowedMoves.canCreateTradeOffer &&
    !hasOwnTradeOffer &&
    !isPlayerTradeCompletelyEmpty &&
    hasResources(props.selfPlayer?.resources ?? createEmptyResourceMap(), props.tradeForm.give);
  const canSubmitMaritimeTrade =
    tradeMode !== "player" &&
    props.match.allowedMoves.canMaritimeTrade &&
    !!selectedMaritimeGiveResource &&
    props.maritimeForm.giveCount >= maritimeRatio &&
    props.maritimeForm.giveCount <= selectedMaritimeGiveMaxCount &&
    maritimeReceiveTotal > 0 &&
    maritimeReceiveTotal === maritimeReceiveCapacity &&
    visibleMaritimeGiveResources.includes(selectedMaritimeGiveResource) &&
    (props.selfPlayer?.resources?.[selectedMaritimeGiveResource] ?? 0) >= maritimeRatio;
  const canChooseMaritimeGive = tradeMode !== "player" && props.match.allowedMoves.canMaritimeTrade;
  const canPlayYearOfPlenty = canBankPayYearOfPlenty(props.match.bank, props.yearOfPlenty);
  const developmentCards = props.selfPlayer?.developmentCards ?? [];
  const hiddenVictoryPoints = props.selfPlayer?.hiddenVictoryPoints ?? 0;
  const totalVictoryPoints = props.selfPlayer?.totalVictoryPoints ?? props.selfPlayer?.publicVictoryPoints ?? 0;
  const pendingRoadBuilding =
    props.match.pendingDevelopmentEffect?.type === "road_building" ? props.match.pendingDevelopmentEffect : null;
  const canMoveShip = isCurrentPlayer && props.match.allowedMoves.movableShipEdgeIds.length > 0;
  const canMoveRobber =
    isCurrentPlayer &&
    props.match.phase === "robber_interrupt" &&
    props.match.allowedMoves.pendingDiscardCount === 0 &&
    props.match.allowedMoves.robberMoveOptions.length > 0;
  const canMovePirate =
    isCurrentPlayer &&
    props.match.phase === "robber_interrupt" &&
    props.match.allowedMoves.pendingDiscardCount === 0 &&
    props.match.allowedMoves.pirateMoveOptions.length > 0;
  const goldChoiceSource = props.match.allowedMoves.goldResourceChoiceSource;
  const goldChoiceTitle =
    goldChoiceSource === "pirate_fleet_reward"
      ? t("match.pirateRewardChoice.title")
      : t("match.goldChoice.title");
  const goldChoiceConfirmLabel =
    goldChoiceSource === "pirate_fleet_reward"
      ? t("match.pirateRewardChoice.confirm")
      : t("match.goldChoice.confirm");
  const scenarioSetupValidationLabel = scenarioSetup?.validationErrorCode
    ? t(scenarioSetup.validationErrorCode)
    : null;
  const scenarioSetupLockedLabel =
    scenarioSetup && !scenarioSetup.canEdit ? t("match.scenarioSetup.locked") : null;
  const scenarioSetupReadyCount = scenarioSetup?.players.filter((player) => player.ready).length ?? 0;
  const eligiblePirateSevenTargets = props.match.allowedMoves.pirateStealTargetPlayerIds.flatMap((targetPlayerId) => {
    const player = props.match.players.find((entry) => entry.id === targetPlayerId);
    return player ? [player] : [];
  });
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
    ? t("match.hud.mobileSummary", {
        vp: totalVictoryPoints,
        cards: props.selfPlayer.resourceCount
      })
    : t("match.hud.title");
  const boardDiceLabel = props.match.dice
    ? `${props.match.dice[0]} + ${props.match.dice[1]}`
    : t("match.dice.open");
  const displayHeroNotification = useMemo<MatchScreenNotification>(
    () =>
      heroNotification ?? {
        key: `turn-status-${props.match.version}`,
        eventId: `turn-status-${props.match.version}`,
        eventType: "turn_status",
        label: t("match.hero.label"),
        title: turnStatus.title,
        detail: turnStatus.detail,
        badges: [
          { label: t("match.turnLabel", { turn: props.match.turn }) },
          { label: formatPhase(props.match.phase) },
          ...(activePlayer
            ? [{
                label: activePlayer.id === props.match.you ? t("shared.you") : activePlayer.username,
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
      locale,
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
  const visibleTabs = isMobileViewport ? mobileMatchTabs : matchTabs;
  const effectiveSheetState: SheetState = isMobileViewport ? "full" : sheetState;
  const showIncomingTradeAlert = !!incomingTradeOffer && (activeTab !== "trade" || effectiveSheetState === "peek");
  const desktopTabLayout = useMemo(
    () => createMatchTabLayout(matchTabs, activeTab, DESKTOP_MATCH_TAB_LAYOUT),
    [activeTab, matchTabs]
  );
  const mobileTabLayout = useMemo(
    () => createMatchTabLayout(mobileMatchTabs, activeTab, MOBILE_MATCH_TAB_LAYOUT),
    [activeTab, mobileMatchTabs]
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
    startTransition(() => {
      setActiveTab(nextTab);
    });
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
            content={t("match.confirm.playKnight.confirm")}
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
            content={t("match.confirm.playRoadBuilding.confirm")}
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
              content={t("match.confirm.playYearOfPlenty.confirm")}
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
              content={t("match.confirm.playMonopoly.confirm")}
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
          <strong>{t("match.roadBuilding.active")}</strong>
          <span className="status-pill is-warning">
            {pendingRoadBuilding.remainingRoads === 2
              ? t("match.roadBuilding.twoOpen")
              : t("match.roadBuilding.oneOpen")}
          </span>
        </div>
        <span>
          {pendingRoadBuilding.remainingRoads === 2
            ? t("match.roadBuilding.selectFirst")
            : t("match.roadBuilding.selectSecond")}
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
            {t("match.roadBuilding.selectOnBoard")}
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
              content={t("match.roadBuilding.finishWithOne")}
              armedContent={finishRoadBuildingConfirmation?.confirmLabel ?? t("match.roadBuilding.finishWithOne")}
            />
          ) : null}
        </div>
      </article>
    ) : null;
  const pendingBoardTargetPlayerId =
    !!props.pendingBoardAction &&
    (props.pendingBoardAction.message.action.type === "move_robber" ||
      props.pendingBoardAction.message.action.type === "move_pirate")
      ? props.pendingBoardAction.message.action.targetPlayerId ?? null
      : null;
  const pendingPirateStealType =
    props.pendingBoardAction?.message.action.type === "move_pirate"
      ? props.pendingBoardAction.message.action.stealType ?? null
      : null;
  const pendingBoardTargetPlayers = props.pendingBoardAction
    ? props.pendingBoardAction.targetPlayerIds.flatMap((targetPlayerId) => {
        const player = props.match.players.find((entry) => entry.id === targetPlayerId);
        return player ? [player] : [];
      })
    : [];
  const pendingBoardActionConfirmation = props.pendingBoardAction
    ? getMatchActionConfirmation(props.match, props.pendingBoardAction.message.action)
    : null;
  const pendingBoardActionNeedsTarget =
    !!props.pendingBoardAction &&
    (props.pendingBoardAction.message.action.type === "move_robber" ||
      props.pendingBoardAction.message.action.type === "move_pirate") &&
    props.pendingBoardAction.targetPlayerIds.length > 1;
  const pendingBoardActionNeedsStealType =
    props.pendingBoardAction?.message.action.type === "move_pirate" &&
    (props.pendingBoardAction.pirateStealTypes?.length ?? 0) > 1;
  const canConfirmPendingBoardAction =
    !!props.pendingBoardAction &&
    (!pendingBoardActionNeedsTarget || !!pendingBoardTargetPlayerId) &&
    (!pendingBoardActionNeedsStealType || !!pendingPirateStealType);
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
        {tabPanels[activeTab]()}
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
      case "robber":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="7" r="3.1" />
            <path d="M6.5 20c1.1-4 3.1-6 5.5-6s4.4 2 5.5 6" />
            <path d="M9 11.5h6" />
          </svg>
        );
      case "pirate":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.5 7.5c1.5-1.7 3-2.5 4.5-2.5s3 .8 4.5 2.5" />
            <path d="M6.5 10.5c1.6 1 3.4 1.5 5.5 1.5s3.9-.5 5.5-1.5" />
            <path d="M8.2 19c.6-3.1 1.9-4.7 3.8-4.7s3.2 1.6 3.8 4.7" />
            <path d="M10.2 8.9h0" />
            <path d="M13.8 8.9h0" />
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
              label: t("match.quickAction.roll"),
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
    ...(canMoveRobber
      ? [
          {
            id: "robber",
            label: t("match.quickAction.moveRobber"),
            className: props.interactionMode === "robber" ? "primary-button" : "secondary-button",
            disabled: false,
            confirmKey: null,
            confirmLabel: null,
            armedLabel: null,
            onClick: () => props.setInteractionMode(props.interactionMode === "robber" ? null : "robber")
          }
        ]
      : []),
    ...(canMovePirate
      ? [
          {
            id: "pirate",
            label: t("match.quickAction.movePirate"),
            className: props.interactionMode === "pirate" ? "primary-button" : "secondary-button",
            disabled: false,
            confirmKey: null,
            confirmLabel: null,
            armedLabel: null,
            onClick: () => props.setInteractionMode(props.interactionMode === "pirate" ? null : "pirate")
          }
        ]
      : []),
    ...(props.match.allowedMoves.canEndTurn
      ? [
          {
             id: "end-turn",
             label: t("match.quickAction.endTurn"),
             className: "primary-button",
             disabled: false,
             confirmKey: endTurnConfirmKey,
             confirmLabel: endTurnConfirmation?.confirmLabel ?? t("match.quickAction.endTurn"),
             armedLabel: t("match.quickAction.endTurnNow"),
             onClick: () => props.onAction(endTurnMessage)
            }
          ]
      : [])
  ];
  const hasQuickActions = primaryActions.length > 0;
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
    if (props.goldChoice.length <= props.match.allowedMoves.goldResourceChoiceCount) {
      return;
    }

    props.setGoldChoice((current) => current.slice(0, props.match.allowedMoves.goldResourceChoiceCount));
  }, [props.goldChoice.length, props.match.allowedMoves.goldResourceChoiceCount, props.setGoldChoice]);

  useEffect(() => {
    if (!scenarioSetup) {
      if (props.selectedScenarioSetupTerrain !== null) {
        props.setSelectedScenarioSetupTerrain(null);
      }
      if (props.selectedScenarioSetupToken !== null) {
        props.setSelectedScenarioSetupToken(null);
      }
      if (props.selectedScenarioSetupPortType !== null) {
        props.setSelectedScenarioSetupPortType(null);
      }
      return;
    }

    if (
      props.selectedScenarioSetupTerrain &&
      !scenarioSetup.tilePool.some((entry) => entry.terrain === props.selectedScenarioSetupTerrain)
    ) {
      props.setSelectedScenarioSetupTerrain(scenarioSetup.tilePool[0]?.terrain ?? null);
    } else if (!props.selectedScenarioSetupTerrain && scenarioSetup.tilePool.length > 0) {
      props.setSelectedScenarioSetupTerrain(scenarioSetup.tilePool[0]?.terrain ?? null);
    }

    if (
      props.selectedScenarioSetupToken !== null &&
      !scenarioSetup.tokenPool.some((entry) => entry.token === props.selectedScenarioSetupToken)
    ) {
      props.setSelectedScenarioSetupToken(scenarioSetup.tokenPool[0]?.token ?? null);
    } else if (props.selectedScenarioSetupToken === null && scenarioSetup.tokenPool.length > 0) {
      props.setSelectedScenarioSetupToken(scenarioSetup.tokenPool[0]?.token ?? null);
    }

    if (
      props.selectedScenarioSetupPortType !== null &&
      !scenarioSetup.portPool.some((entry) => entry.portType === props.selectedScenarioSetupPortType)
    ) {
      props.setSelectedScenarioSetupPortType(scenarioSetup.portPool[0]?.portType ?? null);
    } else if (props.selectedScenarioSetupPortType === null && scenarioSetup.portPool.length > 0) {
      props.setSelectedScenarioSetupPortType(scenarioSetup.portPool[0]?.portType ?? null);
    }
  }, [
    props.selectedScenarioSetupPortType,
    props.selectedScenarioSetupTerrain,
    props.selectedScenarioSetupToken,
    props.setSelectedScenarioSetupPortType,
    props.setSelectedScenarioSetupTerrain,
    props.setSelectedScenarioSetupToken,
    scenarioSetup
  ]);

  useEffect(() => {
    setArmedActionKey(null);
  }, [activeTab, effectiveSheetState, props.match.version, tradeMode]);

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
      setActiveTab(visibleTabs[0]?.id ?? getDefaultMatchPanelTab());
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(MATCH_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

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
    if (!props.maritimeForm.give) {
      if (props.maritimeForm.giveCount === 0 && maritimeReceiveTotal === 0) {
        return;
      }

      props.setMaritimeForm((current) => ({
        ...current,
        giveCount: 0,
        receive: createEmptyResourceMap()
      }));
      return;
    }

    const normalizedGive =
      visibleMaritimeGiveResources.length === 0
        ? props.maritimeForm.give
        : visibleMaritimeGiveResources.includes(props.maritimeForm.give)
          ? props.maritimeForm.give
          : affordableMaritimeGiveResources[0] ?? visibleMaritimeGiveResources[0] ?? "";
    const normalizedRatio = normalizedGive ? (maritimeRatesByResource[normalizedGive] ?? 4) : 0;
    const normalizedAvailable = normalizedGive ? (props.selfPlayer?.resources?.[normalizedGive] ?? 0) : 0;
    const normalizedMaxCount =
      normalizedGive && normalizedRatio > 0 ? Math.floor(normalizedAvailable / normalizedRatio) * normalizedRatio : 0;
    const normalizedGiveCount =
      normalizedGive && normalizedMaxCount > 0
        ? Math.min(Math.max(normalizedRatio, props.maritimeForm.giveCount), normalizedMaxCount)
        : 0;
    const normalizedReceive = (() => {
      const next = createEmptyResourceMap();
      const maxTotal = normalizedRatio > 0 ? Math.floor(normalizedGiveCount / normalizedRatio) : 0;
      let remaining = maxTotal;
      for (const resource of RESOURCES) {
        if (resource === normalizedGive) {
          next[resource] = 0;
          continue;
        }

        const allowedByBank = props.match.bank[resource] ?? 0;
        const requested = props.maritimeForm.receive[resource] ?? 0;
        const kept = Math.max(0, Math.min(requested, allowedByBank, remaining));
        next[resource] = kept;
        remaining -= kept;
      }
      return next;
    })();

    if (
      normalizedGive === props.maritimeForm.give &&
      normalizedGiveCount === props.maritimeForm.giveCount &&
      equalResourceMaps(normalizedReceive, props.maritimeForm.receive)
    ) {
      return;
    }

    props.setMaritimeForm((current) => ({
      ...current,
      give: normalizedGive,
      giveCount: normalizedGiveCount,
      receive: normalizedReceive
    }));
  }, [
    affordableMaritimeGiveResources,
    maritimeReceiveTotal,
    maritimeRatesByResource,
    props.maritimeForm.give,
    props.maritimeForm.giveCount,
    props.maritimeForm.receive,
    props.match.bank,
    props.selfPlayer?.resources,
    props.setMaritimeForm,
    visibleMaritimeGiveResources
  ]);

  useEffect(() => {
    const visibleOfferIds = new Set([...ownTradeOffers, ...incomingTradeOffers].map((offer) => offer.id));
    if (focusedTradeOfferId && visibleOfferIds.has(focusedTradeOfferId)) {
      return;
    }

    setFocusedTradeOfferId(incomingTradeOffers[0]?.id ?? ownTradeOffers[0]?.id ?? null);
  }, [focusedTradeOfferId, incomingTradeOffers, ownTradeOffers]);

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
  const openTradeWorkspace = (options?: { mode?: TradeMode; focusTradeId?: string | null }) => {
    if (options?.mode) {
      setTradeMode(options.mode);
    }
    if (options?.focusTradeId !== undefined) {
      setFocusedTradeOfferId(options.focusTradeId);
    }

    changeActiveTab("trade");
    if (!isMobileViewport && effectiveSheetState === "peek") {
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
    const ratio = maritimeRatesByResource[resource] ?? 4;
    const available = props.selfPlayer?.resources?.[resource] ?? 0;
    const maxCount = Math.floor(available / ratio) * ratio;
    props.setMaritimeForm((current) => ({
      give: resource,
      giveCount:
        current.give === resource
          ? Math.min(current.giveCount + ratio, maxCount)
          : Math.min(ratio, maxCount),
      receive: current.give === resource ? current.receive : createEmptyResourceMap()
    }));
  };
  const handleClearMaritimeGive = () => {
    if (!selectedMaritimeGiveResource) {
      return;
    }

    props.setMaritimeForm((current) => ({
      give: current.give,
      giveCount: Math.max(0, current.giveCount - maritimeRatio),
      receive: current.giveCount - maritimeRatio > 0 ? current.receive : createEmptyResourceMap()
    }));
  };
  const handleSelectMaritimeReceive = (resource: Resource) => {
    if (!selectedMaritimeGiveResource || resource === selectedMaritimeGiveResource) {
      return;
    }

    props.setMaritimeForm((current) => ({
      ...current,
      receive: setTradeDraftCount(
        current.receive,
        resource,
        (current.receive[resource] ?? 0) + 1,
        Math.min(99, props.match.bank[resource] ?? 0)
      )
    }));
  };
  const handleClearMaritimeReceive = (resource: Resource) => {
    props.setMaritimeForm((current) => ({
      ...current,
      receive: setTradeDraftCount(current.receive, resource, (current.receive[resource] ?? 0) - 1, Math.min(99, props.match.bank[resource] ?? 0))
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

    if (!selectedMaritimeGiveResource) {
      return;
    }

    if (maritimeReceiveTotal === 0) {
      return;
    }

    props.onAction(
      createMatchActionMessage({
        type: "maritime_trade",
        give: selectedMaritimeGiveResource,
        receive: cloneTradeResourceMap(props.maritimeForm.receive),
        giveCount: props.maritimeForm.giveCount
      })
    );

    props.setMaritimeForm({
      give: "",
      giveCount: 0,
      receive: createEmptyResourceMap()
    });
  };
  const handleToggleGoldResource = (resource: Resource) => {
    props.setGoldChoice((current) => {
      const next = [...current];
      if (next.length < props.match.allowedMoves.goldResourceChoiceCount) {
        next.push(resource);
        return next;
      }

      const lastIndex = next.lastIndexOf(resource);
      if (lastIndex >= 0) {
        next.splice(lastIndex, 1);
        return next;
      }

      next[next.length - 1] = resource;
      return next;
    });
  };
  const handleSubmitGoldChoice = () => {
    if (props.goldChoice.length !== props.match.allowedMoves.goldResourceChoiceCount) {
      return;
    }

    props.onAction(
      createMatchActionMessage({
        type: "choose_gold_resource",
        resources: [...props.goldChoice]
      })
    );
    props.setGoldChoice([]);
  };
  const handleStealOnSeven = (targetPlayerId: string) => {
    props.onAction(
      createMatchActionMessage({
        type: "steal_on_seven",
        targetPlayerId
      })
    );
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
  const resourceLegendList = (
    <div className={`board-legend-list ${isMobileViewport ? "is-mobile-inline" : "is-desktop-grid"}`}>
      {COMPACT_RESOURCE_LEGEND.map((entry) => (
        <div key={entry.resource} className="board-legend-resource" title={t(entry.noteKey)}>
          <span
            className="board-legend-resource-swatch"
            style={{ "--legend-resource-color": TILE_COLORS[entry.resource] } as CSSProperties}
            aria-hidden="true"
          >
            <ResourceIcon resource={entry.resource} tone="light" size={18} />
          </span>
          <div className="board-legend-resource-copy">
            <strong>{renderResourceLabel(entry.resource)}</strong>
            <span>{t(entry.noteKey)}</span>
          </div>
        </div>
      ))}
    </div>
  );
  const harborLegendList = (
    <div className={`board-legend-list ${isMobileViewport ? "is-mobile-inline" : "is-desktop-grid"}`}>
      {COMPACT_HARBOR_LEGEND.map((entry) => (
        <div key={entry.type} className="board-legend-resource board-legend-harbor" title={t(entry.noteKey)}>
          <span className="board-legend-resource-swatch board-legend-harbor-swatch" aria-hidden="true">
            <PortMarkerIcon type={entry.type} size={40} className="board-legend-harbor-icon" />
          </span>
          <div className="board-legend-resource-copy">
            <strong>
              {entry.type === "generic"
                ? t("match.legend.harborLabel.generic")
                : t("match.legend.harborLabel.resource", { resource: renderResourceLabel(entry.type) })}
            </strong>
            <span>{t(entry.noteKey)}</span>
          </div>
        </div>
      ))}
    </div>
  );
  const boardHintLegend = (
    <div className="board-legend-notes">
      <div className="board-legend-note">
        <span className="legend-signal is-gold" aria-hidden="true" />
        <span>{t("match.legend.hint.gold")}</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-pulse" aria-hidden="true" />
        <span>{t("match.legend.hint.pulse")}</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-port" aria-hidden="true">⚓</span>
        <span>{t("match.legend.hint.port")}</span>
      </div>
    </div>
  );
  const compactBoardHintLegend = (
    <div className="board-legend-notes">
      <div className="board-legend-note">
        <span className="legend-signal is-gold" aria-hidden="true" />
        <span>{t("match.legend.hintCompact.gold")}</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-pulse" aria-hidden="true" />
        <span>{t("match.legend.hintCompact.pulse")}</span>
      </div>
      <div className="board-legend-note">
        <span className="legend-signal is-port" aria-hidden="true">&#9875;</span>
        <span>{t("match.legend.hintCompact.port")}</span>
      </div>
    </div>
  );
  const playerTradeSubmitHint = hasOwnTradeOffer
    ? t("match.trade.submitHint.editOpenOffer")
    : !props.match.allowedMoves.canCreateTradeOffer
      ? t("match.trade.submitHint.playerTradeLocked")
      : isPlayerTradeCompletelyEmpty
        ? t("match.trade.submitHint.notEmpty")
        : "";
  const maritimeTradeSubmitHint = !props.match.allowedMoves.canMaritimeTrade
    ? t("match.trade.submitHint.maritimeOwnTurn")
    : affordableMaritimeGiveResources.length === 0
      ? t("match.trade.submitHint.noMaritimeResources")
      : !selectedMaritimeGiveResource
        ? t("match.trade.submitHint.selectGive")
        : maritimeReceiveTotal === 0
          ? t("match.trade.submitHint.selectReceive")
        : maritimeReceiveTotal < maritimeReceiveCapacity
          ? t("match.trade.submitHint.remaining", { count: maritimeReceiveCapacity - maritimeReceiveTotal })
          : "";
  const maritimeActionLabel =
    affordableMaritimeGiveResources.length === 0
      ? t("match.trade.maritime.unavailable")
      : selectedMaritimeGiveResource
        ? t("match.trade.maritime.exchange", { ratio: maritimeRatio })
        : t("match.trade.maritime.action");
  const tradeModeControls = (
    <div className="mini-segmented trade-mode-segmented" role="tablist" aria-label={t("match.trade.mode.aria")}>
      <button type="button" className={tradeMode === "player" ? "is-active" : ""} onClick={() => setTradeMode("player")}>
        {t("match.trade.mode.player")}
      </button>
      <button type="button" className={tradeMode === "maritime" ? "is-active" : ""} onClick={() => setTradeMode("maritime")}>
        {t("match.trade.mode.maritime")}
      </button>
    </div>
  );
  const playerTradeTargetOptions: TradeSelectOption[] = [
    {
      value: "",
      label: t("match.trade.target.allPlayers"),
      title: t("match.trade.target.allPlayers.openOffer")
    },
    ...tradeTargetPlayers.map((player) => ({
      value: player.id,
      label: player.id === props.match.you ? t("shared.you") : player.username,
      secondaryLabel: renderPlayerColorLabel(player.color),
      accentClassName: getPlayerAccentClass(player.color),
      title: t("match.playerBadge.withColor", {
        player: player.id === props.match.you ? t("shared.you") : player.username,
        color: renderPlayerColorLabel(player.color)
      })
    }))
  ];
  const playerTradeTargetButtons = isCurrentPlayer && !tradeComposerContext.lockedTargetPlayerId ? (
    <TradeSelect
      value={props.tradeForm.targetPlayerId}
      ariaLabel={t("match.trade.target.select")}
      className={selectedTradeTargetAccentClass}
      options={playerTradeTargetOptions}
      onChange={(value) => props.setTradeForm((current) => ({ ...current, targetPlayerId: value }))}
    />
  ) : (
    <div className={`trade-target-static ${selectedTradeTargetAccentClass}`.trim()}>
      <span className="eyebrow">
        {tradeComposerContext.kind === "counter" ? t("match.trade.counterTo") : t("match.trade.target.label")}
      </span>
      <div className="trade-target-static-body">
        {effectiveTradeTargetPlayer ? (
          <PlayerIdentity
            username={effectiveTradeTargetPlayer.username}
            color={effectiveTradeTargetPlayer.color}
            compact
            isSelf={effectiveTradeTargetPlayer.id === props.match.you}
          />
        ) : (
          <strong className="trade-target-static-open">{t("match.trade.target.openShort")}</strong>
        )}
      </div>
    </div>
  );
  const playerTradeComposer = (
    <section className="trade-composer-card trade-composer-card-player">
      <div className="trade-composer-grid is-stacked">
        <div className="trade-matrix-shell is-player-draft">
          <div className="trade-matrix-head">
            <span aria-hidden="true" />
            <span>{t("match.trade.matrix.hand")}</span>
              <span>{t("match.trade.matrix.give")}</span>
              <span>{t("match.trade.matrix.receive")}</span>
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
                    incrementTitle={t("match.trade.matrix.incrementGive", {
                      resource: renderResourceLabel(resource),
                      count: available
                    })}
                    decrementTitle={t("match.trade.matrix.decrementGive", {
                      resource: renderResourceLabel(resource)
                    })}
                    onIncrement={() => updateTradeDraft("give", resource, giveDrafted + 1)}
                    onDecrement={() => updateTradeDraft("give", resource, giveDrafted - 1)}
                  />
                  <TradeMatrixDraftControl
                    value={wantDrafted}
                    tone="receive"
                    incrementDisabled={wantDisabled}
                    incrementTitle={t("match.trade.matrix.incrementReceive", {
                      resource: renderResourceLabel(resource)
                    })}
                    decrementTitle={t("match.trade.matrix.decrementReceive", {
                      resource: renderResourceLabel(resource)
                    })}
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
        {playerTradeTargetButtons}
        <div className="trade-composer-actions">
          {playerTradeSubmitHint ? (
            <div className="trade-composer-copy">
              <span>{playerTradeSubmitHint}</span>
            </div>
          ) : null}
          <div className="trade-composer-button-row">
            {tradeComposerContext.kind === "counter" ? (
              <button type="button" className="ghost-button" onClick={resetPlayerTradeComposer}>
                {t("shared.reset")}
              </button>
            ) : null}
            <button type="button" className="primary-button trade-submit-button" disabled={!canSubmitTradeOffer} onClick={handleSendTradeOffer}>
              {tradeComposerContext.kind === "counter" ? t("shared.send") : t("match.trade.action.sendOffer")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
  const maritimeTradeComposer = (
    <section className="trade-composer-card">
      <div className="trade-composer-grid is-stacked">
        {visibleMaritimeGiveResources.length ? (
          <div className="trade-matrix-shell is-maritime-draft">
            <div className="trade-matrix-head is-maritime">
              <span aria-hidden="true" />
              <span>{t("match.trade.matrix.hand")}</span>
              <span>{t("match.trade.matrix.rate")}</span>
              <span>{t("match.trade.matrix.give")}</span>
              <span>{t("match.trade.matrix.receive")}</span>
            </div>
            <div className="trade-matrix-list">
              {RESOURCES.map((resource) => {
                const ratio = maritimeRatesByResource[resource];
                const available = props.selfPlayer?.resources?.[resource] ?? 0;
                const giveVisible = visibleMaritimeGiveResources.includes(resource);
                const giveSelected = props.maritimeForm.give === resource;
                const giveMaxValue = Math.floor(available / ratio) * ratio;
                const giveValue = giveSelected ? props.maritimeForm.giveCount : 0;
                const giveIncrementDisabled =
                  !canChooseMaritimeGive || !giveVisible || available < ratio || (giveSelected && giveValue >= giveMaxValue);
                const receiveValue = props.maritimeForm.receive[resource] ?? 0;
                const canUseAsReceive =
                  tradeMode !== "player" &&
                  props.match.allowedMoves.canMaritimeTrade &&
                  !!selectedMaritimeGiveResource &&
                  affordableMaritimeGiveResources.includes(selectedMaritimeGiveResource) &&
                  resource !== selectedMaritimeGiveResource &&
                  receiveValue < (props.match.bank[resource] ?? 0) &&
                  maritimeReceiveTotal < maritimeReceiveCapacity;

                return (
                  <div key={`maritime-matrix-${resource}`} className="trade-matrix-row">
                    <div className="trade-matrix-resource" title={renderResourceLabel(resource)}>
                      <span className="trade-matrix-resource-icon" aria-hidden="true">
                        <ResourceIcon resource={resource} shell size={14} />
                      </span>
                    </div>
                    <span className="trade-matrix-meta">{available}</span>
                    <span
                      className={`trade-matrix-cell-display is-give ${giveSelected ? "is-active" : ""} ${
                        giveIncrementDisabled ? "is-disabled" : ""
                      }`.trim()}
                    >
                      {giveVisible ? `${ratio}:1` : "—"}
                    </span>
                    <TradeMatrixDraftControl
                      value={giveValue}
                      tone="give"
                      incrementDisabled={giveIncrementDisabled}
                      incrementTitle={t("match.trade.maritime.selectGive", {
                        resource: renderResourceLabel(resource)
                      })}
                      decrementTitle={t("match.trade.maritime.clearGive", {
                        resource: renderResourceLabel(resource)
                      })}
                      onIncrement={() => handleSelectMaritimeGive(resource)}
                      onDecrement={handleClearMaritimeGive}
                    />
                    <TradeMatrixDraftControl
                      value={receiveValue}
                      tone="receive"
                      incrementDisabled={!canUseAsReceive}
                      incrementTitle={t("match.trade.maritime.selectReceive", {
                        resource: renderResourceLabel(resource)
                      })}
                      decrementTitle={t("match.trade.maritime.clearReceive", {
                        resource: renderResourceLabel(resource)
                      })}
                      onIncrement={() => handleSelectMaritimeReceive(resource)}
                      onDecrement={() => handleClearMaritimeReceive(resource)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="trade-inline-empty">{t("match.trade.maritime.empty")}</div>
        )}
      </div>
      <div className="trade-composer-footer">
        <div className="trade-composer-actions">
          {maritimeTradeSubmitHint ? (
            <div className="trade-composer-copy">
              <span>{maritimeTradeSubmitHint}</span>
            </div>
          ) : null}
          <div className="trade-composer-button-row">
            <button type="button" className="primary-button trade-submit-button" disabled={!canSubmitMaritimeTrade} onClick={handleExecuteMaritimeTrade}>
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
        <h3>{ownTradeOffers.length > 1 ? t("match.trade.ownOffers") : t("match.trade.offer.yours")}</h3>
        <span>{t("match.trade.activeCount", { count: ownTradeOffers.length })}</span>
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
    <section className="dock-section trade-zone trade-zone-offers">
      <div className="dock-section-head">
        <h3>{t("match.trade.offers")}</h3>
        <span>
          {incomingTradeOffers.length
            ? t("match.trade.visibleCount", { count: incomingTradeOffers.length })
            : t("match.trade.none")}
        </span>
      </div>
      {incomingTradeOffers.length ? (
        <div className="trade-offer-list">
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
        <div className="empty-state">{t("match.trade.noneVisible")}</div>
      )}
    </section>
  );
  const tradeWorkspace = (
    <div className="panel-frame trade-frame trade-workspace">
      {tradeModeControls}
      {tradeMode === "player" ? playerTradeComposer : maritimeTradeComposer}
      {tradeOwnOffersSection}
      {tradeIncomingOffersSection}
    </div>
  );
  const tabPanels: Record<MatchPanelTab, () => ReactNode> = {
    overview: () => (
      <div className={`panel-frame overview-frame ${isMobileViewport ? "is-mobile-overview" : ""}`}>
        {props.match.phase === "robber_interrupt" && props.match.robberDiscardStatus.length > 0 ? (
          <section className="dock-section robber-discard-surface">
            <div className="dock-section-head">
              <h3>{t("match.robberPhase.title")}</h3>
              <span>
                {robberDiscardGroups.pending.length > 0
                  ? t("match.robberPhase.openCount", { count: robberDiscardGroups.pending.length })
                  : t("match.robberPhase.allDone")}
              </span>
            </div>
            <div className="robber-discard-columns">
              <div className="robber-discard-column">
                <div className="robber-discard-column-head">
                  <strong>{t("match.robberPhase.pending")}</strong>
                  <span>{robberDiscardGroups.pending.length}</span>
                </div>
                {robberDiscardGroups.pending.length ? (
                  <div className="robber-discard-list">
                    {robberDiscardGroups.pending.map(({ player, requiredCount }) => (
                        <article key={player.id} className={`robber-discard-row player-accent-${player.color}`}>
                          <PlayerIdentity username={player.username} color={player.color} compact isSelf={player.id === props.match.you} />
                          <div className="robber-discard-row-meta">
                            <span className={`status-pill player-tone-pill player-accent-${player.color} is-warning`}>
                              {t("match.robberPhase.status.open")}
                            </span>
                            <span>{t("match.robberPhase.remainingDiscard", { count: requiredCount })}</span>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="robber-discard-empty">{t("match.robberPhase.noPending")}</div>
                )}
              </div>
              <div className="robber-discard-column">
                <div className="robber-discard-column-head">
                  <strong>{t("match.robberPhase.done")}</strong>
                  <span>{robberDiscardGroups.done.length}</span>
                </div>
                {robberDiscardGroups.done.length ? (
                  <div className="robber-discard-list">
                    {robberDiscardGroups.done.map(({ player }) => (
                      <article key={player.id} className={`robber-discard-row player-accent-${player.color}`}>
                        <PlayerIdentity username={player.username} color={player.color} compact isSelf={player.id === props.match.you} />
                        <div className="robber-discard-row-meta">
                          <span className={`status-pill player-tone-pill player-accent-${player.color} is-complete`}>
                            {t("shared.done")}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="robber-discard-empty">{t("match.robberPhase.noneDone")}</div>
                )}
              </div>
            </div>
          </section>
        ) : null}
        {isMobileViewport ? (
          <>
            <section className="dock-section">
              <div className="dock-section-head">
                <h3>{t("match.tab.players")}</h3>
                <span>{t("match.players.inMatch", { count: props.match.players.length })}</span>
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
                      <span className="player-meta-pill">{t("match.players.vpCount", { count: player.publicVictoryPoints })}</span>
                      <span className="player-meta-pill">{t("match.players.cardsCount", { count: player.resourceCount })}</span>
                      {player.hasLongestRoad ? <span className="player-meta-pill is-award">{t("match.award.longestRoad")}</span> : null}
                      {player.hasLargestArmy ? <span className="player-meta-pill is-award">{t("match.award.largestArmy")}</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
        <section className="dock-section dock-section-fill">
          <div className="dock-section-head">
            <h3>{t("match.tab.events")}</h3>
            <span>{t("match.events.entries", { count: notificationState.historyNotifications.length })}</span>
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
              <h3>{t("match.legend.title")}</h3>
              <span>{t("match.legend.subtitle")}</span>
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
    actions: () => (
      <div className="panel-frame actions-frame">
        <section className="dock-section">
          <div className="action-status-card">
            <div className="action-status-head">
              <span className="eyebrow">{t("match.nextStep")}</span>
              <span className="action-status-meta">{renderMatchPlayerText(props.match, turnStatus.title)}</span>
            </div>
            <div className="action-status-copy">
              <span>{renderMatchPlayerText(props.match, turnStatus.detail)}</span>
            </div>
            {turnStatus.callout ? <span className="status-pill is-warning">{turnStatus.callout}</span> : null}
          </div>
        </section>
        {scenarioSetup ? (
          <section className="dock-section">
            <div className="dock-section-head">
              <h3>{t("match.scenarioSetup.title")}</h3>
              <span>
                {scenarioSetup.stage === "tiles"
                  ? t("match.scenarioSetup.stage.tiles")
                  : scenarioSetup.stage === "tokens"
                    ? t("match.scenarioSetup.stage.tokens")
                    : scenarioSetup.stage === "ports"
                      ? t("match.scenarioSetup.stage.ports")
                      : t("match.scenarioSetup.stage.ready")}
              </span>
            </div>
            <div className="status-strip player-award-strip">
              <span className="status-pill muted">
                {t("match.scenarioSetup.readyCount", {
                  count: scenarioSetupReadyCount,
                  total: scenarioSetup.players.length
                })}
              </span>
              {scenarioSetupValidationLabel ? (
                <span className="status-pill is-warning">{scenarioSetupValidationLabel}</span>
              ) : null}
              {scenarioSetupLockedLabel ? (
                <span className="status-pill muted">{scenarioSetupLockedLabel}</span>
              ) : null}
            </div>
            {scenarioSetup.stage === "tiles" ? (
              <div className="build-action-grid">
                <button
                  type="button"
                  className={`build-action-card ${props.selectedScenarioSetupTerrain === null ? "is-active" : "is-ready"}`.trim()}
                  disabled={!scenarioSetup.canEdit}
                  onClick={() => props.setSelectedScenarioSetupTerrain(null)}
                >
                  <span className="build-action-head">
                    <strong>{t("shared.clear")}</strong>
                    <span>{t("match.scenarioSetup.clearTile")}</span>
                  </span>
                </button>
                {scenarioSetup.tilePool.map((entry) => (
                  <button
                    key={`scenario-setup-tile-${entry.terrain}`}
                    type="button"
                    className={`build-action-card ${props.selectedScenarioSetupTerrain === entry.terrain ? "is-active" : "is-ready"}`.trim()}
                    disabled={!scenarioSetup.canEdit}
                    onClick={() => props.setSelectedScenarioSetupTerrain(entry.terrain)}
                  >
                    <span className="build-action-head">
                      <strong>{renderResourceLabel(entry.terrain)}</strong>
                      <span>{t("match.scenarioSetup.remaining", { count: entry.remaining })}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {scenarioSetup.stage === "tokens" ? (
              <div className="build-action-grid">
                <button
                  type="button"
                  className={`build-action-card ${props.selectedScenarioSetupToken === null ? "is-active" : "is-ready"}`.trim()}
                  disabled={!scenarioSetup.canEdit}
                  onClick={() => props.setSelectedScenarioSetupToken(null)}
                >
                  <span className="build-action-head">
                    <strong>{t("shared.clear")}</strong>
                    <span>{t("match.scenarioSetup.clearToken")}</span>
                  </span>
                </button>
                {scenarioSetup.tokenPool.map((entry) => (
                  <button
                    key={`scenario-setup-token-${entry.token}`}
                    type="button"
                    className={`build-action-card ${props.selectedScenarioSetupToken === entry.token ? "is-active" : "is-ready"}`.trim()}
                    disabled={!scenarioSetup.canEdit}
                    onClick={() => props.setSelectedScenarioSetupToken(entry.token)}
                  >
                    <span className="build-action-head">
                      <strong>{entry.token}</strong>
                      <span>{t("match.scenarioSetup.remaining", { count: entry.remaining })}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {scenarioSetup.stage === "ports" ? (
              <div className="build-action-grid">
                <button
                  type="button"
                  className={`build-action-card ${props.selectedScenarioSetupPortType === null ? "is-active" : "is-ready"}`.trim()}
                  disabled={!scenarioSetup.canEdit}
                  onClick={() => props.setSelectedScenarioSetupPortType(null)}
                >
                  <span className="build-action-head">
                    <strong>{t("shared.clear")}</strong>
                    <span>{t("match.scenarioSetup.clearPort")}</span>
                  </span>
                </button>
                {scenarioSetup.portPool.map((entry, index) => (
                  <button
                    key={`scenario-setup-port-${entry.portType}-${index}`}
                    type="button"
                    className={`build-action-card ${props.selectedScenarioSetupPortType === entry.portType ? "is-active" : "is-ready"}`.trim()}
                    disabled={!scenarioSetup.canEdit}
                    onClick={() => props.setSelectedScenarioSetupPortType(entry.portType)}
                  >
                    <span className="build-action-head">
                      <strong>{renderPortTokenLabel(entry.portType)}</strong>
                      <span>{t("match.scenarioSetup.remaining", { count: entry.remaining })}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="status-strip player-award-strip">
              {scenarioSetup.players.map((player) => {
                const scenarioPlayer =
                  props.match.players.find((entry) => entry.id === player.playerId) ?? null;
                return (
                  <span
                    key={`scenario-setup-ready-${player.playerId}`}
                    className={`status-pill ${player.ready ? "" : "muted"} ${scenarioPlayer ? getPlayerAccentClass(scenarioPlayer.color) : ""}`.trim()}
                  >
                    {scenarioPlayer?.username ?? player.playerId}
                  </span>
                );
              })}
            </div>
            {scenarioSetup.stage === "ready" ? (
              <div className="dock-section-actions">
                <button
                  type="button"
                  className={scenarioSetup.isReady ? "secondary-button" : "primary-button"}
                  onClick={() =>
                    props.onAction({
                      type: "match.action",
                      matchId: props.match.matchId,
                      action: {
                        type: "scenario_setup_set_ready",
                        ready: !scenarioSetup.isReady
                      }
                    })
                  }
                >
                  {scenarioSetup.isReady ? t("match.scenarioSetup.notReady") : t("match.scenarioSetup.ready")}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
        {props.match.allowedMoves.goldResourceChoiceCount > 0 ? (
          <section className="dock-section">
            <div className="dock-section-head">
              <h3>{goldChoiceTitle}</h3>
              <span>
                {t("match.goldChoice.counter", {
                  selected: props.goldChoice.length,
                  total: props.match.allowedMoves.goldResourceChoiceCount
                })}
              </span>
            </div>
            <div className="build-action-grid">
              {RESOURCES.map((resource) => {
                const count = props.goldChoice.filter((entry) => entry === resource).length;
                return (
                  <button
                    key={`gold-choice-${resource}`}
                    type="button"
                    className={`build-action-card ${count > 0 ? "is-active" : "is-ready"}`.trim()}
                    onClick={() => handleToggleGoldResource(resource)}
                  >
                    <span className="build-action-head">
                      <strong>{renderResourceLabel(resource)}</strong>
                      <span>{count > 0 ? t("match.goldChoice.selectedCount", { count }) : t("match.goldChoice.pick")}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="dock-section-actions">
              <button
                type="button"
                className="primary-button"
                disabled={props.goldChoice.length !== props.match.allowedMoves.goldResourceChoiceCount}
                onClick={handleSubmitGoldChoice}
              >
                {goldChoiceConfirmLabel}
              </button>
            </div>
          </section>
        ) : null}
        {eligiblePirateSevenTargets.length > 0 ? (
          <section className="dock-section">
            <div className="dock-section-head">
              <h3>{t("match.pirateIslandsSeven.title")}</h3>
              <span>{t("match.pirateIslandsSeven.detail")}</span>
            </div>
            <div className="build-action-grid">
              {eligiblePirateSevenTargets.map((player) => (
                <button
                  key={`pirate-seven-target-${player.id}`}
                  type="button"
                  className="build-action-card is-ready"
                  onClick={() => handleStealOnSeven(player.id)}
                >
                  <span className="build-action-head">
                    <strong>{player.username}</strong>
                    <span>{t("match.pirateIslandsSeven.cards", { count: player.resourceCount })}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>{t("match.build.title")}</h3>
            <span>{t("match.build.subtitle")}</span>
          </div>
          {canMoveShip ? (
            <div className="dock-section-actions">
              <button
                type="button"
                className={`secondary-button ${props.interactionMode === "move_ship" ? "is-accent" : ""}`.trim()}
                onClick={() => {
                  props.setSelectedRoadEdges([]);
                  props.setInteractionMode(props.interactionMode === "move_ship" ? null : "move_ship");
                }}
              >
                {t("match.build.moveShip")}
              </button>
            </div>
          ) : null}
          {canPlacePort || canClaimWonder || canBuildWonder || canAttackFortress ? (
            <div className="dock-section-actions">
              {canPlacePort ? (
                <button
                  type="button"
                  className={`secondary-button ${props.interactionMode === "place_port" ? "is-accent" : ""}`.trim()}
                  onClick={() => props.setInteractionMode(props.interactionMode === "place_port" ? null : "place_port")}
                >
                  {t("match.build.placePort")}
                </button>
              ) : null}
              {canClaimWonder ? (
                <button
                  type="button"
                  className={`secondary-button ${props.interactionMode === "claim_wonder" ? "is-accent" : ""}`.trim()}
                  onClick={() => props.setInteractionMode(props.interactionMode === "claim_wonder" ? null : "claim_wonder")}
                >
                  {t("match.build.claimWonder")}
                </button>
              ) : null}
              {canBuildWonder ? (
                <button
                  type="button"
                  className={`secondary-button ${props.interactionMode === "build_wonder" ? "is-accent" : ""}`.trim()}
                  onClick={() => props.setInteractionMode(props.interactionMode === "build_wonder" ? null : "build_wonder")}
                >
                  {t("match.build.buildWonder")}
                </button>
              ) : null}
              {canAttackFortress ? (
                <button
                  type="button"
                  className={`secondary-button ${props.interactionMode === "attack_fortress" ? "is-accent" : ""}`.trim()}
                  onClick={() => props.setInteractionMode(props.interactionMode === "attack_fortress" ? null : "attack_fortress")}
                >
                  {t("match.build.attackFortress")}
                </button>
              ) : null}
            </div>
          ) : null}
          {props.interactionMode === "place_port" && availableHarborTokens.length > 0 ? (
            <div className="build-action-grid">
              {availableHarborTokens.map((portType, index) => (
                <button
                  key={`harbor-token-${portType}-${index}`}
                  type="button"
                  className={`build-action-card ${props.selectedPortTokenType === portType ? "is-active" : "is-ready"}`.trim()}
                  onClick={() => props.setSelectedPortTokenType(portType)}
                >
                  <span className="build-action-head">
                    <strong>{renderPortTokenLabel(portType)}</strong>
                    <span>{t("match.build.placePortSelect")}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
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
              <h3>{t("match.hand.developmentCards")}</h3>
              <span>
                {pendingRoadBuilding
                  ? t("match.roadBuilding.active")
                  : t("match.hand.cardsInHand", { count: developmentCards.length })}
              </span>
            </div>
            <div className="status-strip development-summary-pills">
              <span className="status-pill">{t("match.hand.playableCount", { count: playableDevelopmentCardCount })}</span>
              <span className="status-pill">{t("match.hand.hiddenVp", { count: hiddenVictoryPoints })}</span>
              <span className="status-pill">{t("match.hand.totalVp", { count: totalVictoryPoints })}</span>
            </div>
            <button type="button" className="secondary-button" onClick={openHandPanel}>
              {t("match.hand.open")}
            </button>
          </section>
        ) : null}
      </div>
    ),
    hand: () => (
      <div className="panel-frame hand-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>{t("match.hand.developmentCards")}</h3>
            <span>{t("match.hand.cardsCount", { count: developmentCards.length })}</span>
          </div>
          <div className="development-hand-summary">
            <div className="development-hand-summary-head">
              <span className="eyebrow">{t("match.hand.victoryPoints")}</span>
              <span className="development-hand-summary-meta">
                {t("match.hand.cardsHeld", { count: developmentCards.length })}
              </span>
            </div>
            <div className="development-hand-summary-grid">
              <article className="development-hand-summary-card">
                <span>{t("match.hand.publicVisible")}</span>
                <strong>{props.selfPlayer?.publicVictoryPoints ?? 0}</strong>
              </article>
              <article className="development-hand-summary-card">
                <span>{t("match.hand.hiddenFromCards")}</span>
                <strong>{hiddenVictoryPoints}</strong>
              </article>
              <article className="development-hand-summary-card is-total">
                <span>{t("shared.total")}</span>
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
              <div className="empty-state">{t("match.hand.noDevelopmentCards")}</div>
            ) : null}
          </div>
        </section>
      </div>
    ),
    trade: () => tradeWorkspace,
    players: () => <PlayersPanel match={props.match} />,
    profile: () => (
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
                    <span>{t("match.turnLabel", { turn: props.match.turn })}</span>
                    <span>{formatPhase(props.match.phase)}</span>
                    <span>{boardDiceLabel}</span>
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="board-chip">{t("match.turnLabel", { turn: props.match.turn })}</span>
                <span className="board-chip">{formatPhase(props.match.phase)}</span>
                {props.selfPlayer ? (
                  <PlayerColorBadge
                    color={props.selfPlayer.color}
                    label={t("match.topbar.self", {
                      player: props.selfPlayer.username,
                      color: renderPlayerColorLabel(props.selfPlayer.color)
                    })}
                    compact
                  />
                ) : null}
                {activePlayer ? (
                  <PlayerColorBadge
                    color={activePlayer.color}
                    label={t("match.topbar.activePlayer", {
                      player: activePlayer.id === props.match.you ? t("shared.you") : activePlayer.username
                    })}
                    compact
                  />
                ) : (
                  <span className="board-chip">{t("match.topbar.activeEmpty")}</span>
                )}
                <span className="board-chip">
                  {t("match.topbar.dice", {
                    value: props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : t("match.dice.openShort")
                  })}
                </span>
                <button
                  type="button"
                  className={`board-toggle board-toggle-focus ${autoFocusEnabled ? "is-active" : ""}`}
                  onClick={() => setAutoFocusEnabled((current) => !current)}
                >
                  {autoFocusEnabled ? t("match.topbar.autoFocusOn") : t("match.topbar.autoFocusOff")}
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
            {props.pendingRouteChoice ? (
              <aside
                className={`surface board-route-choice ${isMobileViewport ? "is-mobile" : ""}`.trim()}
                role="dialog"
                aria-modal="false"
                aria-labelledby="board-route-choice-title"
              >
                <div className="board-route-choice-copy">
                  <span className="eyebrow">{t("shared.selection")}</span>
                  <strong id="board-route-choice-title">{pendingRouteChoiceTitle}</strong>
                  <span>{pendingRouteChoiceDetail}</span>
                </div>
                <div className="board-route-choice-options">
                  {props.pendingRouteChoice.routeTypes.map((routeType) => (
                    <button
                      key={`board-route-choice-${routeType}`}
                      type="button"
                      className="board-route-choice-option"
                      onClick={() => props.onChooseRouteType(routeType)}
                    >
                      <strong>{routeType === "ship" ? t("match.build.ship") : t("match.build.road")}</strong>
                      <span>
                        {routeType === "ship" ? t("match.routeChoice.option.ship") : t("match.routeChoice.option.road")}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="board-route-choice-actions">
                  <button type="button" className="ghost-button" onClick={props.onCancelRouteChoice}>
                    {t("shared.cancel")}
                  </button>
                </div>
              </aside>
            ) : null}
            {props.pendingBoardAction ? (
              <aside
                className={`surface board-inline-confirm ${isMobileViewport ? "is-mobile" : ""}`.trim()}
                role="dialog"
                aria-modal="false"
                aria-labelledby="board-inline-confirm-title"
              >
                <div className="board-inline-confirm-copy">
                  <span className="eyebrow">{t("shared.confirmation")}</span>
                  <strong id="board-inline-confirm-title">{pendingBoardActionConfirmation?.title ?? ""}</strong>
                  <span>{renderMatchPlayerText(props.match, pendingBoardActionConfirmation?.detail ?? "")}</span>
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
                        <span>
                          {pendingBoardTargetPlayerId === player.id ? t("shared.selected") : t("match.robber.selectVictim")}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {pendingBoardActionNeedsStealType ? (
                  <div className="board-inline-confirm-targets">
                    {(props.pendingBoardAction?.pirateStealTypes ?? []).map((stealType) => (
                      <button
                        key={stealType}
                        type="button"
                        className={`board-inline-confirm-target ${
                          pendingPirateStealType === stealType ? "is-active" : ""
                        }`.trim()}
                        onClick={() => props.onSelectPendingPirateStealType(stealType)}
                      >
                        <strong>
                          {stealType === "cloth"
                            ? t("match.pirateSteal.cloth")
                            : t("match.pirateSteal.resource")}
                        </strong>
                        <span>
                          {pendingPirateStealType === stealType
                            ? t("shared.selected")
                            : t("match.pirateSteal.select")}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="board-inline-confirm-actions">
                  <button type="button" className="ghost-button" onClick={props.onCancelPendingBoardAction}>
                    {t("shared.cancel")}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!canConfirmPendingBoardAction}
                    onClick={props.onConfirmPendingBoardAction}
                  >
                    {pendingBoardActionConfirmation?.confirmLabel ?? ""}
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
                  {boardHudOpen ? t("match.hud.close") : mobileHudSummary}
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
                      <strong>{t("shared.vpShort")}</strong>
                      <span>{totalVictoryPoints}</span>
                    </span>
                    <span className="board-hud-pill">
                      <strong>{t("match.hud.hand")}</strong>
                      <span>{totalResources(props.selfPlayer?.resources ?? createEmptyResourceMap())}</span>
                    </span>
                    <span className="board-hud-pill">
                      <strong>{t("match.hud.development")}</strong>
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
                    aria-label={boardLegendOpen ? t("match.legend.close") : t("match.legend.open")}
                >
                  <span className="board-legend-icon-glyph" aria-hidden="true">
                    i
                  </span>
                </button>
                {boardLegendOpen ? (
                  <div id="board-legend-panel" className="board-legend-panel">
                    <div className="board-legend-section">
                      <span className="eyebrow">{t("match.legend.boardColors")}</span>
                      {resourceLegendList}
                    </div>
                    <div className="board-legend-section">
                      <span className="eyebrow">{t("match.legend.harbors")}</span>
                      {harborLegendList}
                    </div>
                    <div className="board-legend-section">
                      <span className="eyebrow">{t("match.legend.boardHints")}</span>
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
                <span className="eyebrow">{t("match.dice.title")}</span>
                <strong>{hasRevealedDiceResult ? diceDisplay.total : "?"}</strong>
              </div>
              <div className="board-dice-row" aria-live="polite">
                <DiceFace value={diceDisplay.left} />
                <DiceFace value={diceDisplay.right} />
              </div>
              <span className="board-dice-copy">
                {diceDisplay.actorName
                  ? diceDisplay.phase !== "idle"
                    ? renderMatchPlayerText(props.match, t("match.dice.rolling", { player: diceDisplay.actorName }))
                    : renderMatchPlayerText(
                        props.match,
                        t("match.dice.rolled", { player: diceDisplay.actorName, total: diceDisplay.total ?? "-" })
                      )
                  : t("match.dice.waiting")}
              </span>
            </div>
          </div>
        </div>

        <aside className="surface match-dock">
          {hasQuickActions ? renderQuickActions(false) : null}
          <div className="tab-strip center-last-item" style={getTabStripStyle(desktopTabLayout)} role="tablist" aria-label={t("match.navigation.desktop")}>
            {matchTabs.map((tab) => (
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
              <span className="match-sheet-summary-meta">{`${formatPhase(props.match.phase)} · ${t("match.turnLabel", { turn: props.match.turn })}`}</span>
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
              aria-label={t("match.navigation.mobile")}
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
    </section>
  );
}

export const MatchScreen = memo(MatchScreenComponent, areMatchScreenPropsEqual);

