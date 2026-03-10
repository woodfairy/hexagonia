import type { ReactNode } from "react";
import type { Locale, MatchSnapshot, Resource, ResourceMap } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import { createText, resolveText, useI18n } from "../../i18n";
import { ResourceIcon } from "../../resourceIcons";
import { getPlayerAccentClass, renderResourceLabel } from "../../ui";
import { PlayerIdentity } from "../shared/PlayerIdentity";
import { PlayerMention } from "../shared/PlayerText";

type TranslationParams = Parameters<typeof createText>[2];

function resolveDialogText(locale: Locale, de: string, en: string, params?: TranslationParams): string {
  return resolveText(locale, createText(de, en, params));
}

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
  locale: Locale,
  currentPlayer: MatchSnapshot["players"][number] | null,
  pendingPlayers: ReturnType<typeof getRobberDiscardGroups>["pending"]
): { title: string; statusLabel: string; detail: ReactNode } {
  const text = (de: string, en: string, params?: TranslationParams) => resolveDialogText(locale, de, en, params);

  if (pendingPlayers.length > 0) {
    return {
      title: text("Der Räuber schlägt zu", "The robber strikes"),
      statusLabel:
        pendingPlayers.length === 1
          ? text("1 Abwurf offen", "1 discard pending")
          : text("{count} Abwürfe offen", "{count} discards pending", { count: pendingPlayers.length }),
      detail: currentPlayer ? (
        <>
          {text(
            "Bevor der Räuber versetzt wird, müssen betroffene Spieler jetzt Karten abwerfen. Danach setzt ",
            "Before the robber is moved, affected players must discard cards now. Afterwards "
          )}
          <PlayerMention color={currentPlayer.color}>{currentPlayer.username}</PlayerMention>
          {text(" den Räuber.", " moves the robber.")}
        </>
      ) : (
        text(
          "Bevor der Räuber versetzt wird, müssen betroffene Spieler jetzt Karten abwerfen.",
          "Before the robber is moved, affected players must discard cards now."
        )
      )
    };
  }

  if (currentPlayer) {
    return {
      title: text("Räuber wird versetzt", "Robber is moving"),
      statusLabel: text("Räuberzug aktiv", "Robber action active"),
      detail: (
        <>
          <PlayerMention color={currentPlayer.color}>{currentPlayer.username}</PlayerMention>
          {text(" versetzt jetzt den Räuber.", " is now moving the robber.")}
        </>
      )
    };
  }

  return {
    title: text("Räuber wird versetzt", "Robber is moving"),
    statusLabel: text("Räuberzug aktiv", "Robber action active"),
    detail: text(
      "Alle Abwürfe sind erledigt. Der Räuber wird jetzt versetzt.",
      "All discards are complete. The robber is now being moved."
    )
  };
}

export function ConfirmActionDialog(props: {
  title: string;
  detail: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { locale } = useI18n();
  const text = (de: string, en: string) => resolveDialogText(locale, de, en);

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
          <span className="eyebrow">{text("Bestätigung", "Confirmation")}</span>
          <h2 id="confirm-action-title">{props.title}</h2>
          <p>{props.detail}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="ghost-button" onClick={props.onCancel}>
            {text("Abbrechen", "Cancel")}
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
  const { locale } = useI18n();
  const text = (de: string, en: string) => resolveDialogText(locale, de, en);
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
          <span className="eyebrow">{text("Räuberphase", "Robber phase")}</span>
          <h2 id="robber-target-title">{text("Von wem stehlen?", "Steal from whom?")}</h2>
          <p>
            {text(
              "Auf diesem Feld kommen mehrere Spieler infrage. Wähle das Opfer aus, bevor der Räuber bestätigt wird.",
              "More than one player can be targeted on this tile. Choose the victim before confirming the robber."
            )}
          </p>
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
                {player.connected ? text("Online", "Online") : text("Getrennt", "Disconnected")}
              </span>
            </button>
          ))}
        </div>
        <div className="confirm-actions robber-target-actions">
          <button type="button" className="ghost-button" onClick={props.onCancel}>
            {text("Abbrechen", "Cancel")}
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
  const { locale } = useI18n();
  const text = (de: string, en: string, params?: TranslationParams) => resolveDialogText(locale, de, en, params);
  const ownedTotal = RESOURCES.reduce((total, resource) => total + (props.ownedResources?.[resource] ?? 0), 0);
  const { pending: pendingPlayers, completed: completedPlayers } = getRobberDiscardGroups(
    props.players,
    props.robberDiscardStatus
  );

  if (props.minimized) {
    return (
      <aside className="robber-discard-mini surface" role="dialog" aria-modal="false" aria-labelledby="robber-discard-mini-title">
        <div className="robber-discard-mini-copy">
          <span className="eyebrow">{text("Räuberphase", "Robber phase")}</span>
          <strong id="robber-discard-mini-title">
            {props.remainingCount > 0
              ? text("Noch {count} Karten offen", "{count} cards remaining", { count: props.remainingCount })
              : text("Auswahl vollständig", "Selection complete")}
          </strong>
          <span>
            {pendingPlayers.length > 0
              ? text("{count} Spieler warten noch auf den Abwurf.", "{count} players are still waiting to discard.", {
                  count: pendingPlayers.length
                })
              : text("Alle Abwürfe sind erledigt.", "All discards are complete.")}
          </span>
        </div>
        <button type="button" className="primary-button" onClick={props.onExpand}>
          {text("Auswahl fortsetzen", "Continue selection")}
        </button>
      </aside>
    );
  }

  return (
    <div className="confirm-overlay robber-discard-overlay" role="presentation">
      <div className="confirm-dialog discard-dialog surface" role="dialog" aria-modal="true" aria-labelledby="discard-dialog-title">
        <div className="confirm-copy discard-copy">
          <span className="eyebrow">{text("Räuberphase", "Robber phase")}</span>
          <h2 id="discard-dialog-title">{text("Karten abwerfen", "Discard cards")}</h2>
          <p>
            {text(
              "Du hast mehr als sieben Karten. Wähle genau {count} Karten aus, die du an die Bank abgibst, damit die Partie weitergehen kann.",
              "You have more than seven cards. Choose exactly {count} cards to return to the bank so the match can continue.",
              { count: props.requiredCount }
            )}
          </p>
          <p className="discard-owned-total">
            {text("Aktuell auf deiner Hand: {count} Karten", "Currently in your hand: {count} cards", { count: ownedTotal })}
          </p>
        </div>

        <div className="discard-summary">
          <span className="status-pill">{text("Auf der Hand: {count}", "In hand: {count}", { count: ownedTotal })}</span>
          <span className="status-pill">{text("{count} ausgewählt", "{count} selected", { count: props.selectedCount })}</span>
          <span className={`status-pill ${props.remainingCount === 0 ? "" : "is-warning"}`}>
            {props.remainingCount === 0
              ? text("Auswahl vollständig", "Selection complete")
              : text("Noch {count} offen", "{count} remaining", { count: props.remainingCount })}
          </span>
          <button type="button" className="ghost-button discard-minimize-button" onClick={props.onMinimize}>
            {text("Verkleinern", "Minimize")}
          </button>
        </div>

        <div className="discard-status-grid">
          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>{text("Noch offen", "Still pending")}</strong>
              <span>{pendingPlayers.length}</span>
            </div>
            {pendingPlayers.length ? (
              <div className="discard-status-list">
                {pendingPlayers.map(({ player, requiredCount }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill is-warning">{text("offen", "pending")}</span>
                      <span>{text("noch {count} abwerfen", "{count} left to discard", { count: requiredCount })}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">{text("Niemand wartet mehr auf einen Abwurf.", "Nobody is still waiting to discard.")}</div>
            )}
          </section>

          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>{text("Bereits abgeworfen", "Already discarded")}</strong>
              <span>{completedPlayers.length}</span>
            </div>
            {completedPlayers.length ? (
              <div className="discard-status-list">
                {completedPlayers.map(({ player }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill">{text("fertig", "done")}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">
                {text("Bisher hat noch niemand seinen Abwurf abgeschlossen.", "Nobody has completed their discard yet.")}
              </div>
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
                    <span>{text("{count} auf der Hand", "{count} in hand", { count: owned })}</span>
                  </div>
                </div>
                <div className="discard-stepper">
                  <button type="button" className="ghost-button" onClick={() => props.onAdjust(resource, -1)} disabled={selected <= 0}>
                    -
                  </button>
                  <div
                    className="discard-stepper-count"
                    aria-label={text("{count} {resource} ausgewählt", "{count} {resource} selected", {
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
              ? text("Die Auswahl ist vollständig. Du kannst jetzt abwerfen.", "The selection is complete. You can discard now.")
              : text("Wähle noch {count} Karten aus.", "Choose {count} more cards.", { count: props.remainingCount })}
          </div>
          <div className="discard-actions-buttons">
            <button type="button" className="ghost-button" onClick={props.onMinimize}>
              {text("Spielfeld ansehen", "View board")}
            </button>
            <button type="button" className="primary-button" onClick={props.onConfirm} disabled={!props.canConfirm}>
              {text("Karten abwerfen", "Discard cards")}
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
  const { locale } = useI18n();
  const text = (de: string, en: string, params?: TranslationParams) => resolveDialogText(locale, de, en, params);
  const { pending: pendingPlayers, completed: completedPlayers } = getRobberDiscardGroups(
    props.players,
    props.robberDiscardStatus
  );
  const copy = getRobberWaitDialogCopy(locale, props.currentPlayer, pendingPlayers);
  const trackedDiscardCount = pendingPlayers.length + completedPlayers.length;

  return (
    <div className="confirm-overlay robber-wait-overlay" role="presentation">
      <div className="confirm-dialog robber-wait-dialog surface" role="dialog" aria-modal="true" aria-labelledby="robber-wait-title">
        <div className="confirm-copy discard-copy robber-wait-copy">
          <span className="eyebrow">{text("Räuberphase", "Robber phase")}</span>
          <div className="robber-wait-hero">
            <span className="robber-wait-signal" aria-hidden="true" />
            <div className="robber-wait-hero-copy">
              <h2 id="robber-wait-title">{copy.title}</h2>
              <span className={`status-pill ${pendingPlayers.length > 0 ? "is-warning" : ""}`}>{copy.statusLabel}</span>
            </div>
          </div>
          <p>{copy.detail}</p>
        </div>

        <section className="robber-wait-status" aria-label={text("Abwurfstatus", "Discard status")}>
          <div className="robber-wait-status-head">
            <div>
              <strong>{text("Abwürfe im Hintergrund", "Discards in progress")}</strong>
              <span>
                {pendingPlayers.length > 0
                  ? pendingPlayers.length === 1
                    ? text("1 Spieler wartet noch", "1 player is still waiting")
                    : text("{count} Spieler warten noch", "{count} players are still waiting", {
                        count: pendingPlayers.length
                      })
                  : text("Alle Abwürfe sind erledigt", "All discards are complete")}
              </span>
            </div>
            {trackedDiscardCount > 0 ? (
              <span className="status-pill muted">
                {completedPlayers.length}/{trackedDiscardCount} {text("fertig", "done")}
              </span>
            ) : null}
          </div>

          <div className="robber-wait-rows">
            {pendingPlayers.map(({ player, requiredCount }) => (
              <article key={player.id} className={`robber-wait-row is-pending player-accent-${player.color}`}>
                <PlayerIdentity username={player.username} color={player.color} compact />
                <div className="robber-wait-row-meta">
                  <span className="status-pill is-warning">{text("offen", "pending")}</span>
                  <span>{text("noch {count} abwerfen", "{count} left to discard", { count: requiredCount })}</span>
                </div>
              </article>
            ))}
            {completedPlayers.map(({ player }) => (
              <article key={player.id} className={`robber-wait-row is-complete player-accent-${player.color}`}>
                <PlayerIdentity username={player.username} color={player.color} compact />
                <div className="robber-wait-row-meta">
                  <span className="status-pill">{text("fertig", "done")}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
