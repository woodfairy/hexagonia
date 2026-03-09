import type { ReactNode } from "react";
import type { MatchSnapshot, Resource, ResourceMap } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import { ResourceIcon } from "../../resourceIcons";
import { getPlayerAccentClass, renderResourceLabel } from "../../ui";
import { PlayerIdentity } from "../shared/PlayerIdentity";
import { PlayerMention } from "../shared/PlayerText";

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
  currentPlayer: MatchSnapshot["players"][number] | null,
  pendingPlayers: ReturnType<typeof getRobberDiscardGroups>["pending"]
): { title: string; detail: ReactNode } {
  if (pendingPlayers.length > 0) {
    return {
      title: "Karten werden abgeworfen",
      detail: currentPlayer ? (
        <>
          Betroffene Spieler müssen jetzt Karten abwerfen. Danach setzt{" "}
          <PlayerMention color={currentPlayer.color}>{currentPlayer.username}</PlayerMention> den Räuber.
        </>
      ) : (
        "Betroffene Spieler müssen jetzt Karten abwerfen. Danach wird der Räuber versetzt."
      )
    };
  }

  if (currentPlayer) {
    return {
      title: "Räuber wird versetzt",
      detail: (
        <>
          <PlayerMention color={currentPlayer.color}>{currentPlayer.username}</PlayerMention> versetzt jetzt den Räuber.
        </>
      )
    };
  }

  return {
    title: "Räuber wird versetzt",
    detail: "Alle Abwürfe sind erledigt. Der Räuber wird jetzt versetzt."
  };
}

export function ConfirmActionDialog(props: {
  title: string;
  detail: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
          <span className="eyebrow">Bestätigung</span>
          <h2 id="confirm-action-title">{props.title}</h2>
          <p>{props.detail}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="ghost-button" onClick={props.onCancel}>
            Abbrechen
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
          <span className="eyebrow">Räuberphase</span>
          <h2 id="robber-target-title">Von wem stehlen?</h2>
          <p>Auf diesem Feld kommen mehrere Spieler infrage. Wähle das Opfer aus, bevor der Räuber bestätigt wird.</p>
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
              <span className="robber-target-meta">{player.connected ? "Online" : "Getrennt"}</span>
            </button>
          ))}
        </div>
        <div className="confirm-actions robber-target-actions">
          <button type="button" className="ghost-button" onClick={props.onCancel}>
            Abbrechen
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
  const ownedTotal = RESOURCES.reduce((total, resource) => total + (props.ownedResources?.[resource] ?? 0), 0);
  const { pending: pendingPlayers, completed: completedPlayers } = getRobberDiscardGroups(
    props.players,
    props.robberDiscardStatus
  );

  if (props.minimized) {
    return (
      <aside className="robber-discard-mini surface" role="dialog" aria-modal="false" aria-labelledby="robber-discard-mini-title">
        <div className="robber-discard-mini-copy">
          <span className="eyebrow">Räuberphase</span>
          <strong id="robber-discard-mini-title">
            {props.remainingCount > 0 ? `Noch ${props.remainingCount} Karten offen` : "Auswahl vollständig"}
          </strong>
          <span>{pendingPlayers.length > 0 ? `${pendingPlayers.length} Spieler warten noch auf den Abwurf.` : "Alle Abwürfe sind erledigt."}</span>
        </div>
        <button type="button" className="primary-button" onClick={props.onExpand}>
          Auswahl fortsetzen
        </button>
      </aside>
    );
  }

  return (
    <div className="confirm-overlay robber-discard-overlay" role="presentation">
      <div className="confirm-dialog discard-dialog surface" role="dialog" aria-modal="true" aria-labelledby="discard-dialog-title">
        <div className="confirm-copy discard-copy">
          <span className="eyebrow">Räuberphase</span>
          <h2 id="discard-dialog-title">Karten abwerfen</h2>
          <p>
            Du hast mehr als sieben Karten. Wähle genau {props.requiredCount} Karten aus, die du an die Bank abgibst, damit die
            Partie weitergehen kann.
          </p>
          <p className="discard-owned-total">Aktuell auf deiner Hand: {ownedTotal} Karten</p>
        </div>

        <div className="discard-summary">
          <span className="status-pill">Auf der Hand: {ownedTotal}</span>
          <span className="status-pill">{props.selectedCount} ausgewählt</span>
          <span className={`status-pill ${props.remainingCount === 0 ? "" : "is-warning"}`}>
            {props.remainingCount === 0 ? "Auswahl vollständig" : `Noch ${props.remainingCount} offen`}
          </span>
          <button type="button" className="ghost-button discard-minimize-button" onClick={props.onMinimize}>
            Verkleinern
          </button>
        </div>

        <div className="discard-status-grid">
          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>Noch offen</strong>
              <span>{pendingPlayers.length}</span>
            </div>
            {pendingPlayers.length ? (
              <div className="discard-status-list">
                {pendingPlayers.map(({ player, requiredCount }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill is-warning">offen</span>
                      <span>noch {requiredCount} abwerfen</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">Niemand wartet mehr auf einen Abwurf.</div>
            )}
          </section>

          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>Bereits abgeworfen</strong>
              <span>{completedPlayers.length}</span>
            </div>
            {completedPlayers.length ? (
              <div className="discard-status-list">
                {completedPlayers.map(({ player }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill">fertig</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">Bisher hat noch niemand seinen Abwurf abgeschlossen.</div>
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
                    <strong>{renderResourceLabel(resource)}</strong>
                    <span>{owned} auf der Hand</span>
                  </div>
                </div>
                <div className="discard-stepper">
                  <button type="button" className="ghost-button" onClick={() => props.onAdjust(resource, -1)} disabled={selected <= 0}>
                    -
                  </button>
                  <div className="discard-stepper-count" aria-label={`${selected} ${renderResourceLabel(resource)} ausgewählt`}>
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
              ? "Die Auswahl ist vollständig. Du kannst jetzt abwerfen."
              : `Wähle noch ${props.remainingCount} Karten aus.`}
          </div>
          <div className="discard-actions-buttons">
            <button type="button" className="ghost-button" onClick={props.onMinimize}>
              Spielfeld ansehen
            </button>
            <button type="button" className="primary-button" onClick={props.onConfirm} disabled={!props.canConfirm}>
              Karten abwerfen
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
  const pendingPlayers = props.robberDiscardStatus.flatMap((entry) => {
    if (entry.done) {
      return [];
    }

    const player = props.players.find((candidate) => candidate.id === entry.playerId);
    return player ? [{ ...entry, player }] : [];
  });
  const completedPlayers = props.robberDiscardStatus.flatMap((entry) => {
    if (!entry.done) {
      return [];
    }

    const player = props.players.find((candidate) => candidate.id === entry.playerId);
    return player ? [{ ...entry, player }] : [];
  });

  return (
    <div className="confirm-overlay robber-wait-overlay" role="presentation">
      <div className="confirm-dialog robber-wait-dialog surface" role="dialog" aria-modal="true" aria-labelledby="robber-wait-title">
        <div className="confirm-copy discard-copy">
          <span className="eyebrow">Räuberphase</span>
          <h2 id="robber-wait-title">Warte auf den Abwurf</h2>
          <p>
            {pendingPlayers.length > 0
              ? "Betroffene Spieler müssen jetzt Karten abwerfen. Danach wird der Räuber versetzt."
              : props.currentPlayer
                ? (
                    <>
                      <PlayerMention color={props.currentPlayer.color}>{props.currentPlayer.username}</PlayerMention> versetzt jetzt
                      den Räuber.
                    </>
                  )
                : "Alle Abwürfe sind erledigt. Der Räuber wird jetzt versetzt."}
          </p>
        </div>

        <div className="discard-status-grid">
          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>Noch offen</strong>
              <span>{pendingPlayers.length}</span>
            </div>
            {pendingPlayers.length ? (
              <div className="discard-status-list">
                {pendingPlayers.map(({ player, requiredCount }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill is-warning">offen</span>
                      <span>noch {requiredCount} abwerfen</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">Niemand muss mehr Karten abwerfen.</div>
            )}
          </section>

          <section className="discard-status-card">
            <div className="discard-status-head">
              <strong>Bereits abgeworfen</strong>
              <span>{completedPlayers.length}</span>
            </div>
            {completedPlayers.length ? (
              <div className="discard-status-list">
                {completedPlayers.map(({ player }) => (
                  <article key={player.id} className="discard-status-player">
                    <PlayerIdentity username={player.username} color={player.color} compact />
                    <div className="discard-status-player-meta">
                      <span className="status-pill">fertig</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discard-status-empty">Bisher hat noch niemand seinen Abwurf abgeschlossen.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
