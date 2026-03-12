import type { ReactNode } from "react";
import type { ErrorParams, MatchSnapshot, Resource, ResourceMap } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import { useI18n } from "../../i18n";
import { ResourceIcon } from "../../resourceIcons";
import { getPlayerAccentClass, renderResourceLabel } from "../../ui";
import { PlayerIdentity } from "../shared/PlayerIdentity";
import { PlayerMention } from "../shared/PlayerText";

type DialogText = (key: string, params?: ErrorParams) => string;

function getRobberDiscardGroups(
  players: MatchSnapshot["players"],
  robberDiscardStatus: MatchSnapshot["robberDiscardStatus"]
) {
  const entries = robberDiscardStatus.flatMap((entry) => {
    const player = players.find((candidate) => candidate.id === entry.playerId);
    return player ? [{ ...entry, player }] : [];
  });

  return {
    pending: entries.filter((entry) => !entry.done),
    completed: entries.filter((entry) => entry.done)
  };
}

function getRobberWaitDialogCopy(
  text: DialogText,
  currentPlayer: MatchSnapshot["players"][number] | null,
  pendingPlayers: ReturnType<typeof getRobberDiscardGroups>["pending"]
): { title: string; statusLabel: string; detail: ReactNode } {
  if (pendingPlayers.length > 0) {
    return {
      title: text("match.robberPhase.wait.strikesTitle"),
      statusLabel:
        pendingPlayers.length === 1
          ? text("match.robberPhase.wait.singlePending")
          : text("match.robberPhase.wait.multiPending", { count: pendingPlayers.length }),
      detail: currentPlayer ? (
        <>
          {text("match.robberPhase.wait.beforeMove")}
          <PlayerMention color={currentPlayer.color}>{currentPlayer.username}</PlayerMention>
          {text("match.robberPhase.wait.afterMove")}
        </>
      ) : (
        text("match.robberPhase.wait.beforeMoveOnly")
      )
    };
  }

  if (currentPlayer) {
    return {
      title: text("match.robberPhase.moveTitle"),
      statusLabel: text("match.robberPhase.moveStatus"),
      detail: (
        <>
          <PlayerMention color={currentPlayer.color}>{currentPlayer.username}</PlayerMention>
          {text("match.robberPhase.moveDetail")}
        </>
      )
    };
  }

  return {
    title: text("match.robberPhase.moveTitle"),
    statusLabel: text("match.robberPhase.moveStatus"),
    detail: text("match.robberPhase.wait.readyToMove")
  };
}

export function ConfirmActionDialog(props: {
  title: string;
  detail: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { translate: t } = useI18n();
  const text = (key: string, params?: ErrorParams) => t(key, undefined, undefined, params);

  return (
    <div className="confirm-overlay" role="presentation" onClick={props.onCancel}>
      <div
        className="confirm-dialog surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-copy">
          <span className="eyebrow">{text("shared.confirmation")}</span>
          <h2 id="confirm-action-title">{props.title}</h2>
          <p>{props.detail}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="ghost-button" onClick={props.onCancel}>
            {text("shared.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RobberTargetDialog(props: {
  players: MatchSnapshot["players"];
  targetPlayerIds: string[];
  onCancel: () => void;
  onSelect: (targetPlayerId: string) => void;
}) {
  const { translate: t } = useI18n();
  const text = (key: string, params?: ErrorParams) => t(key, undefined, undefined, params);
  const targets = props.targetPlayerIds.flatMap((targetPlayerId) => {
    const player = props.players.find((entry) => entry.id === targetPlayerId);
    return player ? [player] : [];
  });

  return (
    <div className="confirm-overlay robber-target-overlay" role="presentation" onClick={props.onCancel}>
      <div
        className="confirm-dialog robber-target-dialog surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="robber-target-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-copy robber-target-copy">
          <span className="eyebrow">{text("match.robberPhase.title")}</span>
          <h2 id="robber-target-title">{text("match.robberPhase.target.title")}</h2>
          <p>{text("match.robberPhase.target.detail")}</p>
        </div>
        <div className="robber-target-options">
          {targets.map((player) => (
            <button
              key={player.id}
              type="button"
              className={`robber-target-option surface ${player.connected ? "" : "is-offline"} ${getPlayerAccentClass(player.color)}`}
              onClick={() => props.onSelect(player.id)}
            >
              <PlayerIdentity color={player.color} username={player.username} />
              <span className="robber-target-meta">
                {player.connected ? text("connection.online") : text("connection.disconnected")}
              </span>
            </button>
          ))}
        </div>
        <div className="confirm-actions robber-target-actions">
          <button type="button" className="ghost-button" onClick={props.onCancel}>
            {text("shared.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RobberDiscardDialog(props: {
  canConfirm: boolean;
  requiredCount: number;
  selectedCount: number;
  remainingCount: number;
  ownedResources: ResourceMap | null;
  draft: ResourceMap;
  minimized: boolean;
  players: MatchSnapshot["players"];
  robberDiscardStatus: MatchSnapshot["robberDiscardStatus"];
  onAdjust: (resource: Resource, delta: -1 | 1) => void;
  onConfirm: () => void;
  onMinimize: () => void;
  onExpand: () => void;
}) {
  const { locale, translate: t } = useI18n();
  const text = (key: string, params?: ErrorParams) => t(key, undefined, undefined, params);
  const ownedTotal = RESOURCES.reduce((total, resource) => total + (props.ownedResources?.[resource] ?? 0), 0);
  const { pending: pendingPlayers, completed: completedPlayers } = getRobberDiscardGroups(
    props.players,
    props.robberDiscardStatus
  );

  if (props.minimized) {
    return (
      <aside className="robber-discard-mini surface" role="dialog" aria-modal="false" aria-labelledby="robber-discard-mini-title">
        <div className="robber-discard-mini-copy">
          <span className="eyebrow">{text("match.robberPhase.title")}</span>
          <strong id="robber-discard-mini-title">
            {props.remainingCount > 0
              ? text("match.robberPhase.cardsRemaining", { count: props.remainingCount })
              : text("match.robberPhase.selectionComplete")}
          </strong>
          <span>
            {pendingPlayers.length > 0
              ? pendingPlayers.length === 1
                ? text("match.robberPhase.onePlayerPending")
                : text("match.robberPhase.manyPlayersPending", { count: pendingPlayers.length })
              : text("match.robberPhase.nonePendingLong")}
          </span>
        </div>
        <button type="button" className="primary-button" onClick={props.onExpand}>
          {text("match.robberPhase.continueSelection")}
        </button>
      </aside>
    );
  }

  return (
    <div className="confirm-overlay robber-discard-overlay" role="presentation">
      <div className="confirm-dialog discard-dialog surface" role="dialog" aria-modal="true" aria-labelledby="discard-dialog-title">
        <div className="confirm-copy discard-copy">
          <span className="eyebrow">{text("match.robberPhase.title")}</span>
          <h2 id="discard-dialog-title">{text("match.robberPhase.discardTitle")}</h2>
          <p>{text("match.robberPhase.discardDetail", { count: props.requiredCount })}</p>
          <p className="discard-owned-total">
            {text("match.robberPhase.handCount", { count: ownedTotal })}
          </p>
        </div>

        <div className="discard-summary">
          <span className="status-pill">{text("match.robberPhase.inHand", { count: ownedTotal })}</span>
          <span className="status-pill">{text("match.robberPhase.selectedCount", { count: props.selectedCount })}</span>
          <span className={`status-pill ${props.remainingCount === 0 ? "" : "is-warning"}`}>
            {props.remainingCount === 0
              ? text("match.robberPhase.selectionComplete")
              : text("match.robberPhase.cardsRemaining", { count: props.remainingCount })}
          </span>
          <button type="button" className="ghost-button discard-minimize-button" onClick={props.onMinimize}>
            {text("match.robberPhase.minimize")}
          </button>
        </div>

        <div className="discard-status-grid">
          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>{text("match.robberPhase.pendingPlayers")}</strong>
              <span>{pendingPlayers.length}</span>
            </div>
            {pendingPlayers.length ? (
              <div className="discard-status-list">
                {pendingPlayers.map(({ player, requiredCount }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill is-warning">{t("match.robberPhase.status.open")}</span>
                      <span>{text("match.robberPhase.wait.remaining", { count: requiredCount })}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">{text("match.robberPhase.nonePendingLong")}</div>
            )}
          </section>

          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>{text("match.robberPhase.completed")}</strong>
              <span>{completedPlayers.length}</span>
            </div>
            {completedPlayers.length ? (
              <div className="discard-status-list">
                {completedPlayers.map(({ player }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill">{text("match.robberPhase.status.done")}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">{text("match.robberPhase.noneCompleted")}</div>
            )}
          </section>
        </div>

        <div className="discard-resource-grid">
          {RESOURCES.map((resource) => {
            const owned = props.ownedResources?.[resource] ?? 0;
            const selected = props.draft[resource] ?? 0;
            return (
              <article key={resource} className="discard-resource-card">
                <div className="discard-resource-head">
                  <span className="discard-resource-icon" aria-hidden="true">
                    <ResourceIcon resource={resource} tone="light" size={20} />
                  </span>
                  <div className="discard-resource-copy">
                    <strong>{renderResourceLabel(locale, resource)}</strong>
                    <span>{text("match.robberPhase.resourceInHand", { count: owned })}</span>
                  </div>
                </div>
                <div className="discard-stepper">
                  <button type="button" className="ghost-button" onClick={() => props.onAdjust(resource, -1)} disabled={selected <= 0}>
                    -
                  </button>
                  <div
                    className="discard-stepper-count"
                    aria-label={text("match.robberPhase.selectedResourceAria", {
                      count: selected,
                      resource: renderResourceLabel(locale, resource)
                    })}
                  >
                    {selected}
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => props.onAdjust(resource, 1)}
                    disabled={owned <= selected || props.remainingCount <= 0}
                  >
                    +
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="confirm-actions discard-actions">
          <div className={`discard-helper ${props.remainingCount === 0 ? "" : "is-warning"}`}>
            {props.remainingCount === 0
              ? text("match.robberPhase.helper.complete")
              : text("match.robberPhase.helper.remaining", { count: props.remainingCount })}
          </div>
          <div className="discard-actions-buttons">
            <button type="button" className="ghost-button" onClick={props.onMinimize}>
              {text("match.robberPhase.viewBoard")}
            </button>
            <button type="button" className="primary-button" onClick={props.onConfirm} disabled={!props.canConfirm}>
              {text("match.robberPhase.discardAction")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RobberWaitDialog(props: {
  players: MatchSnapshot["players"];
  currentPlayer: MatchSnapshot["players"][number] | null;
  robberDiscardStatus: MatchSnapshot["robberDiscardStatus"];
}) {
  const { translate: t } = useI18n();
  const text = (key: string, params?: ErrorParams) => t(key, undefined, undefined, params);
  const { pending: pendingPlayers, completed: completedPlayers } = getRobberDiscardGroups(
    props.players,
    props.robberDiscardStatus
  );
  const copy = getRobberWaitDialogCopy(text, props.currentPlayer, pendingPlayers);
  const trackedDiscardCount = pendingPlayers.length + completedPlayers.length;

  return (
    <div className="confirm-overlay robber-wait-overlay" role="presentation">
      <div className="confirm-dialog robber-wait-dialog surface" role="dialog" aria-modal="true" aria-labelledby="robber-wait-title">
        <div className="confirm-copy discard-copy robber-wait-copy">
          <span className="eyebrow">{text("match.robberPhase.title")}</span>
          <div className="robber-wait-hero">
            <span className="robber-wait-signal" aria-hidden="true" />
            <div className="robber-wait-hero-copy">
              <h2 id="robber-wait-title">{copy.title}</h2>
              <span className={`status-pill ${pendingPlayers.length > 0 ? "is-warning" : ""}`}>{copy.statusLabel}</span>
            </div>
          </div>
          <p>{copy.detail}</p>
        </div>

        <section className="robber-wait-status" aria-label={text("match.robberPhase.discardStatus")}>
          <div className="robber-wait-status-head">
            <div>
              <strong>{text("match.robberPhase.backgroundDiscards")}</strong>
              <span>
                {pendingPlayers.length > 0
                  ? pendingPlayers.length === 1
                    ? text("match.robberPhase.onePlayerWaiting")
                    : text("match.robberPhase.manyPlayersWaiting", { count: pendingPlayers.length })
                  : text("match.robberPhase.nonePending")}
              </span>
            </div>
            {trackedDiscardCount > 0 ? (
              <span className="status-pill muted">
                {completedPlayers.length}/{trackedDiscardCount} {text("match.robberPhase.status.done")}
              </span>
            ) : null}
          </div>

          <div className="robber-wait-rows">
            {pendingPlayers.map(({ player, requiredCount }) => (
              <article key={player.id} className={`robber-wait-row is-pending player-accent-${player.color}`}>
                <PlayerIdentity username={player.username} color={player.color} compact />
                <div className="robber-wait-row-meta">
                  <span className="status-pill is-warning">{t("match.robberPhase.status.open")}</span>
                  <span>{text("match.robberPhase.wait.remaining", { count: requiredCount })}</span>
                </div>
              </article>
            ))}
            {completedPlayers.map(({ player }) => (
              <article key={player.id} className={`robber-wait-row is-complete player-accent-${player.color}`}>
                <PlayerIdentity username={player.username} color={player.color} compact />
                <div className="robber-wait-row-meta">
                  <span className="status-pill">{text("match.robberPhase.status.done")}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
