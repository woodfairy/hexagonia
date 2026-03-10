import type { ReactNode } from "react";
import type {
  ClientMessage,
  MatchSnapshot,
  Resource,
  ResourceMap
} from "@hexagonia/shared";
import {
  createEmptyResourceMap,
  RESOURCES
} from "@hexagonia/shared";
import { getDocumentLocale, translate } from "../../i18n";
import { ResourceIcon } from "../../resourceIcons";
import { getPlayerAccentClass, renderPlayerColorLabel, renderResourceLabel, renderResourceMap } from "../../ui";
import { PlayerColorBadge } from "../shared/PlayerIdentity";
import { renderMatchPlayerText } from "../shared/PlayerText";
import type { MatchNotification } from "./matchNotifications";
import {
  getPlayerById,
  getPlayerColor,
  getPlayerName
} from "./matchScreenViewModel";

let dicePreviewCursor = 0;

function t(key: string, params?: Record<string, string | number>) {
  return translate(getDocumentLocale(), key, undefined, undefined, params);
}

export type MatchScreenNotification = Omit<MatchNotification, "eventType"> & {
  eventType: MatchNotification["eventType"] | "dice_pending" | "turn_status";
};

export function TradeCompactSummary(props: {
  give: ResourceMap;
  receive: ResourceMap;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`match-notification-trade-summary ${props.className ?? ""}`.trim()}
      aria-label={props.ariaLabel ?? t("match.trade.summary.aria")}
    >
      <TradeCompactSummarySide resources={props.give} tone="give" />
      <span className="match-notification-trade-arrow" aria-hidden="true" />
      <TradeCompactSummarySide resources={props.receive} tone="receive" />
    </div>
  );
}

function MatchNotificationTradeSummary(props: {
  summary: NonNullable<MatchScreenNotification["tradeSummary"]>;
}) {
  return <TradeCompactSummary give={props.summary.give} receive={props.summary.receive} />;
}

function TradeCompactSummarySide(props: {
  resources: ResourceMap;
  tone: "give" | "receive";
}) {
  const entries = RESOURCES.filter((resource) => (props.resources[resource] ?? 0) > 0);

  return (
    <div className={`match-notification-trade-side is-${props.tone}`.trim()}>
      {entries.length ? (
        entries.map((resource) => (
          <span
            key={`${props.tone}-${resource}`}
            className={`match-notification-trade-chip is-${props.tone}`.trim()}
            title={`${props.resources[resource]}x ${renderResourceLabel(resource)}`}
          >
            <ResourceIcon resource={resource} shell size={12} />
            <span>{`${props.resources[resource]}x`}</span>
          </span>
        ))
      ) : (
        <span className="match-notification-trade-empty">0</span>
      )}
    </div>
  );
}

export function TradeResourceCardGrid(props: {
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
    <div className="trade-resource-card-grid" role="listbox" aria-label={t("match.trade.resourcePicker.aria")}>
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
          <span className="trade-resource-card-meta">{meta ?? t("match.trade.resourcePicker.onHand")}</span>
        </button>
      ))}
    </div>
  );
}

export function TradeQuantityControl(props: {
  label: string;
  resource: Resource;
  value: number;
  min: number;
  max?: number;
  disabled?: boolean;
  fixed?: boolean;
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
      <span className="trade-quantity-summary">
        {t("match.trade.quantity.current", {
          value: props.value,
          resource: renderResourceLabel(props.resource)
        })}
      </span>
    </div>
  );
}

export function DiceFace(props: { value: number | null }) {
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

export function setTradeDraftCount(
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

export function TradeBanner(props: {
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
  const fromViewerPerspective = trade.fromPlayerId === props.currentUserId;
  const isViewerTradeParty = !trade.toPlayerId || trade.toPlayerId === props.currentUserId;
  const giveResources = fromViewerPerspective ? trade.give : isViewerTradeParty ? trade.want : trade.give;
  const receiveResources = fromViewerPerspective ? trade.want : isViewerTradeParty ? trade.give : trade.want;
  const targetLabel = trade.toPlayerId
    ? t("match.trade.target.player", { player: getPlayerName(props.match, trade.toPlayerId) })
    : t("match.trade.target.open");
  const accentClass = getPlayerAccentClass(getPlayerColor(props.match, trade.fromPlayerId));
  const title = fromViewerPerspective
    ? t("match.trade.banner.yours")
    : t("match.trade.banner.fromPlayer", { player: proposerName });
  const detail = fromViewerPerspective
    ? targetLabel
    : trade.toPlayerId === props.currentUserId
      ? t("match.trade.banner.directToYou")
      : targetLabel;

  return (
    <div className={`trade-banner ${accentClass} ${props.className ?? ""}`.trim()}>
      <div className="trade-banner-head">
        <div className="trade-banner-kicker">
          <span className="eyebrow">{t("match.trade.banner.eyebrow")}</span>
          <PlayerBadge match={props.match} playerId={trade.fromPlayerId} compact />
        </div>
        <div className="trade-banner-meta">
          <span className="status-pill muted">{t("match.turnLabel", { turn: trade.createdAtTurn })}</span>
          <span className="status-pill trade-banner-target-pill">{renderMatchPlayerText(props.match, targetLabel)}</span>
        </div>
      </div>
      <div className="trade-banner-copy">
        <strong>{renderMatchPlayerText(props.match, title)}</strong>
        <span>{renderMatchPlayerText(props.match, detail)}</span>
      </div>
      <div className="trade-banner-summary">
        <article className="trade-banner-flow-side is-give">
          <span className="eyebrow">{renderMatchPlayerText(props.match, summary[0]?.label ?? t("match.trade.summary.youGive"))}</span>
          <TradeCompactSummarySide resources={giveResources} tone="give" />
        </article>
        <span className="trade-banner-flow-arrow match-notification-trade-arrow" aria-hidden="true" />
        <article className="trade-banner-flow-side is-receive">
          <span className="eyebrow">{renderMatchPlayerText(props.match, summary[1]?.label ?? t("match.trade.summary.youReceive"))}</span>
          <TradeCompactSummarySide resources={receiveResources} tone="receive" />
        </article>
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
              {t("match.trade.action.accept")}
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
              {t("match.trade.action.decline")}
            </button>
            {props.onOpenTrade ? (
              <button type="button" className="secondary-button is-accent" onClick={props.onOpenTrade}>
                {t("match.trade.action.open")}
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
            {t("match.trade.action.endOffer")}
          </button>
        ) : props.onOpenTrade ? (
          <button type="button" className="secondary-button is-accent" onClick={props.onOpenTrade}>
            {t("match.trade.action.open")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerStatCard(props: { label: string; value: ReactNode }) {
  return (
    <div className="player-stat-card">
      <span className="player-stat-card-label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function PlayerBadge(props: {
  match: MatchSnapshot;
  playerId: string;
  compact?: boolean;
  hideColorLabel?: boolean;
}) {
  const player = getPlayerById(props.match, props.playerId);
  if (!player) {
    return null;
  }

  const label = props.hideColorLabel
    ? player.id === props.match.you
      ? t("shared.you")
      : player.username
    : t("match.playerBadge.withColor", {
        player: player.id === props.match.you ? t("shared.you") : player.username,
        color: renderPlayerColorLabel(player.color)
      });

  return (
    <PlayerColorBadge
      color={player.color}
      label={label}
      {...(props.compact !== undefined ? { compact: props.compact } : {})}
    />
  );
}

export function MatchNotificationCard(props: {
  match: MatchSnapshot;
  notification: MatchScreenNotification;
  variant?: "hero" | "hero-mobile" | "feed" | "mini";
  badgeLimit?: number;
}) {
  const variant = props.variant ?? "feed";
  const accentPlayerId = props.notification.accentPlayerId ?? props.notification.playerId;
  const accentColor = accentPlayerId ? getPlayerColor(props.match, accentPlayerId) : null;
  const accentClass = getPlayerAccentClass(accentColor);
  const badges = props.badgeLimit ? props.notification.badges.slice(0, props.badgeLimit) : props.notification.badges;
  const showDetail = variant !== "hero-mobile";
  const showBadges = variant !== "hero-mobile";
  const showTradeSummary = showBadges && !!props.notification.tradeSummary;

  return (
    <article
      className={`match-notification-card is-${variant} is-${props.notification.emphasis} ${accentClass}`.trim()}
    >
      <div className="match-notification-head">
        <span className="eyebrow">{props.notification.label}</span>
        {props.notification.playerId ? (
          <PlayerBadge
            match={props.match}
            playerId={props.notification.playerId}
            compact
            hideColorLabel={variant === "hero-mobile"}
          />
        ) : null}
      </div>
      <strong>{renderMatchPlayerText(props.match, props.notification.title)}</strong>
      {showDetail ? (
        <span className="match-notification-detail">{renderMatchPlayerText(props.match, props.notification.detail)}</span>
      ) : null}
      {showTradeSummary ? <MatchNotificationTradeSummary summary={props.notification.tradeSummary!} /> : null}
      {showBadges && badges.length ? (
        <div className="match-notification-badges">
          {badges.map((badge, index) => {
            const badgeColor = badge.playerId ? getPlayerColor(props.match, badge.playerId) : null;
            const badgeAccentClass = badgeColor ? getPlayerAccentClass(badgeColor) : "";
            return (
              <span
                key={`${badge.playerId ?? badge.tone ?? "neutral"}-${badge.label}-${index}`}
                className={`match-notification-badge ${
                  badge.tone === "player" && badgeAccentClass ? `is-player ${badgeAccentClass}` : ""
                } ${badge.tone === "warning" ? "is-warning" : ""}`.trim()}
              >
                {badge.tone === "player" && badgeAccentClass ? (
                  <span className={`match-notification-badge-swatch ${badgeAccentClass}`} aria-hidden="true" />
                ) : null}
                <span>{badge.label}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export function rollPreviewValue(): number {
  dicePreviewCursor = (dicePreviewCursor % 6) + 1;
  return dicePreviewCursor;
}

export function clampTradeDraftCount(value: number | string, maxAvailable: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const sanitized = Number.isFinite(numeric) ? Math.floor(numeric) : 0;
  if (maxAvailable <= 0) {
    return 0;
  }

  return Math.min(Math.max(sanitized, 0), maxAvailable);
}

function getTradePerspectiveSummary(
  match: MatchSnapshot,
  currentUserId: string,
  trade: MatchSnapshot["tradeOffers"][number]
): Array<{ label: string; value: string }> {
  const giveText = renderResourceMap(trade.give) || t("shared.nothing");
  const wantText = renderResourceMap(trade.want) || t("shared.nothing");
  const proposerName = getPlayerName(match, trade.fromPlayerId);
  const targetName = trade.toPlayerId ? getPlayerName(match, trade.toPlayerId) : t("match.trade.otherSide");

  if (trade.fromPlayerId === currentUserId) {
    return [
      {
        label: t("match.trade.summary.youGive"),
        value: giveText
      },
      {
        label: t("match.trade.summary.youReceive"),
        value: wantText
      }
    ];
  }

  if (!trade.toPlayerId || trade.toPlayerId === currentUserId) {
    return [
      {
        label: t("match.trade.summary.youGive"),
        value: wantText
      },
      {
        label: t("match.trade.summary.youReceive"),
        value: giveText
      }
    ];
  }

  return [
    {
      label: t("match.trade.summary.playerGives", { player: proposerName }),
      value: giveText
    },
    {
      label: t("match.trade.summary.playerGives", { player: targetName }),
      value: wantText
    }
  ];
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
