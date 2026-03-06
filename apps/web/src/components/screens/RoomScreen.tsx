import type { AuthUser, RoomDetails, SetupMode } from "@hexagonia/shared";
import { PlayerColorBadge, PlayerIdentity } from "../shared/PlayerIdentity";
import { renderPlayerColorLabel } from "../../ui";

export function RoomScreen(props: {
  room: RoomDetails;
  session: AuthUser;
  presence: string[];
  onJoinRoom: () => void;
  onKickUser: (userId: string) => void;
  onSetupModeChange: (setupMode: SetupMode) => void;
  onStartingSeatChange: (startingSeatIndex: number) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onCopyCode: () => void;
  onCopyInviteLink: () => void;
}) {
  const currentSeat = props.room.seats.find((seat) => seat.userId === props.session.id) ?? null;
  const seatedPlayers = props.room.seats.filter((seat) => seat.userId);
  const readyPlayers = seatedPlayers.filter((seat) => seat.ready).length;
  const isOwner = props.room.ownerUserId === props.session.id;
  const hasFreeSeat = props.room.seats.some((seat) => !seat.userId);
  const canJoinRoom = !currentSeat && props.room.status === "open" && hasFreeSeat;
  const joinUnavailableLabel = props.room.status !== "open" ? "Partie läuft bereits" : hasFreeSeat ? "Nicht verfügbar" : "Raum ist voll";
  const canStart = isOwner && seatedPlayers.length >= 3 && seatedPlayers.length <= 4 && readyPlayers === seatedPlayers.length;
  const canEditSettings = isOwner && props.room.status === "open";
  const startingSeat = props.room.seats.find((seat) => seat.index === props.room.startingSeatIndex && seat.userId) ?? null;

  return (
    <section className="screen-shell room-shell">
      <div className="room-main-grid">
        <article className="surface room-hero">
          <div className="surface-head room-surface-head">
            <div className="room-title-stack">
              <div className="eyebrow">Raumlobby</div>
              <div className="room-code-row">
                <h1>{props.room.code}</h1>
                <span className="status-pill">{props.room.status === "open" ? "Offen" : "Laufend"}</span>
              </div>
              <p className="muted-copy room-subline">Private Einladung für bis zu vier Spieler.</p>
            </div>
            <div className="room-share-actions">
              <button type="button" className="ghost-button" onClick={props.onCopyInviteLink}>
                Link kopieren
              </button>
              <button type="button" className="ghost-button" onClick={props.onCopyCode}>
                Code kopieren
              </button>
            </div>
          </div>

          <div className="room-meta-strip">
            <span className="status-pill">{seatedPlayers.length}/4 besetzt</span>
            <span className={`status-pill ${readyPlayers === seatedPlayers.length && seatedPlayers.length >= 3 ? "" : "muted"}`}>
              {readyPlayers} bereit
            </span>
            <span className="status-pill">{isOwner ? "Du hostest" : "Host verwaltet den Start"}</span>
          </div>

          <div className="seat-grid">
            {props.room.seats.map((seat) => {
              const online = seat.userId ? props.presence.includes(seat.userId) : false;
              const occupied = !!seat.userId;
              const mine = seat.userId === props.session.id;
              const canKick = isOwner && props.room.status === "open" && occupied && !mine && !!seat.userId;
              const isStartingSeat = props.room.startingSeatIndex === seat.index && occupied;

              return (
                <article key={seat.index} className={`seat-card player-surface player-accent-${seat.color} ${mine ? "is-mine" : ""}`}>
                  <div className="seat-card-top">
                    <div className="seat-slot-meta">
                      <span className={`seat-chip seat-${seat.color}`}>Platz {seat.index + 1}</span>
                      {occupied ? (
                        <div className="seat-status-meta">
                          <PlayerColorBadge color={seat.color} compact />
                          <span className={`online-indicator ${online ? "is-online" : "is-offline"}`} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {occupied && seat.username ? (
                    <PlayerIdentity
                      username={seat.username}
                      color={seat.color}
                      compact
                      isSelf={mine}
                      {...(mine ? { meta: `Deine Farbe: ${renderPlayerColorLabel(seat.color)}` } : {})}
                    />
                  ) : (
                    <strong className="seat-open-label">Offen</strong>
                  )}
                  <span>{seat.ready ? "Bereit" : occupied ? "Wartet" : "Verfügbar"}</span>
                  <span className="muted-copy">
                    {occupied
                      ? isStartingSeat
                        ? "Startspieler dieser Partie"
                        : online
                          ? "Online im Raum"
                          : "Nicht verbunden"
                      : "Jeder eingeladene Spieler kann beitreten"}
                  </span>
                  {canKick ? (
                    <button className="ghost-button is-danger" type="button" onClick={() => props.onKickUser(seat.userId!)}>
                      Spieler entfernen
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </article>

        <div className="room-side-stack">
          <article className="surface room-control-card">
            <div className="eyebrow">Steuerung</div>
            <h2>Startklar machen</h2>
            <p className="muted-copy room-action-hint">
              Startet mit 3 bis 4 sitzenden Spielern, sobald alle bereit sind. Der Host legt den Startspieler vor dem Match fest.
            </p>

            <div className="mini-segmented room-setup-mode">
              <button
                type="button"
                className={props.room.setupMode === "official_variable" ? "is-active" : ""}
                disabled={!canEditSettings}
                onClick={() => props.onSetupModeChange("official_variable")}
              >
                Variabler Aufbau
              </button>
              <button
                type="button"
                className={props.room.setupMode === "beginner" ? "is-active" : ""}
                disabled={!canEditSettings}
                onClick={() => props.onSetupModeChange("beginner")}
              >
                Anfängeraufbau
              </button>
            </div>

            {props.room.setupMode === "beginner" && seatedPlayers.length === 3 ? (
              <p className="muted-copy room-action-hint">
                Im Anfängeraufbau mit 3 Spielern werden die Match-Farben auf die offiziellen Einsteigerfarben umgelegt.
              </p>
            ) : null}

            <div className="room-settings-block">
              <div className="room-setting-head">
                <span className="eyebrow">Startspieler</span>
                <strong>{startingSeat?.username ?? `Platz ${props.room.startingSeatIndex + 1}`}</strong>
              </div>
              <p className="muted-copy room-action-hint">
                Nur besetzte Plätze können als Startspieler gewählt werden.
              </p>
              <div className="mini-segmented room-starting-seat">
                {seatedPlayers.map((seat) => (
                  <button
                    key={seat.index}
                    type="button"
                    className={props.room.startingSeatIndex === seat.index ? "is-active" : ""}
                    disabled={!canEditSettings}
                    onClick={() => props.onStartingSeatChange(seat.index)}
                  >
                    {seat.username ?? `Platz ${seat.index + 1}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="room-action-stack">
              {!currentSeat ? (
                canJoinRoom ? (
                  <>
                    <p className="muted-copy room-action-hint">Beim Beitritt bekommst du automatisch den nächsten freien Platz.</p>
                    <button className="primary-button" type="button" onClick={props.onJoinRoom}>
                      Beitreten
                    </button>
                  </>
                ) : (
                  <button className="secondary-button" type="button" disabled>
                    {joinUnavailableLabel}
                  </button>
                )
              ) : null}
              {currentSeat ? (
                <button
                  className={currentSeat.ready ? "secondary-button is-accent" : "primary-button"}
                  type="button"
                  onClick={() => props.onReady(!currentSeat.ready)}
                >
                  {currentSeat.ready ? "Nicht mehr bereit" : "Bereit"}
                </button>
              ) : null}
              {canStart ? (
                <button className="primary-button" type="button" onClick={props.onStart}>
                  Partie starten
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={props.onLeave}>
                Raum verlassen
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
