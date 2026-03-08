import { useEffect, useState } from "react";
import type {
  AuthUser,
  BoardSize,
  RoomDetails,
  SetupMode,
  StartingPlayerMode,
  TurnRule
} from "@hexagonia/shared";
import { PlayerColorBadge } from "../shared/PlayerIdentity";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import { renderBoardSizeLabel, renderPlayerColorLabel, renderTurnRuleLabel } from "../../ui";

export function RoomScreen(props: {
  room: RoomDetails;
  session: AuthUser;
  presence: string[];
  joinRoomPending: boolean;
  readyPending: boolean;
  startPending: boolean;
  leavePending: boolean;
  onJoinRoom: () => void;
  onBoardSizeChange: (boardSize: BoardSize) => void;
  onKickUser: (userId: string) => void;
  onSetupModeChange: (setupMode: SetupMode) => void;
  onStartingPlayerModeChange: (startingPlayerMode: StartingPlayerMode) => void;
  onStartingSeatChange: (startingSeatIndex: number) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onTurnRuleChange: (turnRule: TurnRule) => void;
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
  const joinUnavailableLabel =
    props.room.status !== "open"
      ? "Partie laeuft bereits"
      : hasFreeSeat
        ? "Nicht verfuegbar"
        : "Raum ist voll";
  const canStart =
    isOwner &&
    seatedPlayers.length >= 3 &&
    seatedPlayers.length <= 6 &&
    readyPlayers === seatedPlayers.length;
  const canEditSettings = isOwner && props.room.status === "open";
  const extendedBoardRequired = seatedPlayers.length >= 5;
  const beginnerAvailable = props.room.gameConfig.boardSize === "standard";
  const startingSeat =
    props.room.seats.find(
      (seat) => seat.index === props.room.gameConfig.startingPlayer.seatIndex && seat.userId
    ) ?? null;
  const usesRolledStart = props.room.gameConfig.startingPlayer.mode === "rolled";
  const [showGameSettings, setShowGameSettings] = useState(isOwner);
  const setupModeLabel =
    props.room.gameConfig.setupMode === "beginner" ? "Anfaengeraufbau" : "Variabler Aufbau";
  const startingPlayerLabel = usesRolledStart
    ? "Start per Wuerfel"
    : startingSeat?.username ?? `Start: Platz ${props.room.gameConfig.startingPlayer.seatIndex + 1}`;
  const settingsSummary = [
    renderBoardSizeLabel(props.room.gameConfig.boardSize),
    setupModeLabel,
    renderTurnRuleLabel(props.room.gameConfig.turnRule),
    startingPlayerLabel
  ].join(" / ");
  const settingsExpanded = isOwner || showGameSettings;

  useEffect(() => {
    setShowGameSettings(isOwner);
  }, [isOwner, props.room.id]);

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
              <p className="muted-copy room-subline">Private Einladung fuer bis zu sechs Spieler.</p>
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
            <span className="status-pill">{seatedPlayers.length}/6 besetzt</span>
            <span
              className={`status-pill ${
                readyPlayers === seatedPlayers.length && seatedPlayers.length >= 3 ? "" : "muted"
              }`}
            >
              {readyPlayers} bereit
            </span>
            <span className="status-pill">
              {props.room.gameConfig.boardSize === "extended" ? "Erweitertes Brett" : "Standardbrett"}
            </span>
            <span className="status-pill">
              {usesRolledStart
                ? "Start wird ausgewuerfelt"
                : isOwner
                  ? "Du legst Start fest"
                  : "Host legt Start fest"}
            </span>
          </div>

          <div className="seat-grid">
            {props.room.seats.map((seat) => {
              const online = seat.userId ? props.presence.includes(seat.userId) : false;
              const occupied = !!seat.userId;
              const mine = seat.userId === props.session.id;
              const canKick = isOwner && props.room.status === "open" && occupied && !mine && !!seat.userId;
              const isStartingSeat =
                !usesRolledStart &&
                props.room.gameConfig.startingPlayer.seatIndex === seat.index &&
                occupied;
              const stateLabel = seat.ready ? "Bereit" : occupied ? "Wartet" : "Frei";
              const seatTitle = occupied ? seat.username ?? `Spieler ${seat.index + 1}` : "Freier Platz";
              const indicatorClass = occupied ? (online ? "is-online" : "is-offline") : "is-empty";

              return (
                <article
                  key={seat.index}
                  className={`seat-card player-surface player-accent-${seat.color} ${
                    mine ? "is-mine" : ""
                  } ${occupied ? "is-occupied" : "is-open"}`}
                >
                  <div className="seat-card-head">
                    <div className="seat-card-title-block">
                      <strong className="seat-card-title">{seatTitle}</strong>
                      {mine ? <span className="status-pill muted">Du</span> : null}
                    </div>
                    <div className="seat-status-meta">
                      {occupied ? (
                        <PlayerColorBadge color={seat.color} label={renderPlayerColorLabel(seat.color)} compact />
                      ) : (
                        <span className="status-pill muted">Frei</span>
                      )}
                      <span className={`online-indicator ${indicatorClass}`} aria-hidden="true" />
                    </div>
                  </div>
                  <div className="seat-card-state">
                    {isStartingSeat ? (
                      <span className="status-pill seat-start-pill">Startspieler</span>
                    ) : occupied ? (
                      <span className="seat-card-state-label">
                        {online ? "Online im Raum" : "Nicht verbunden"}
                      </span>
                    ) : (
                      <span className="seat-card-state-label">Wartet auf Spieler</span>
                    )}
                  </div>
                  <div className="seat-card-action">
                    {canKick ? (
                      <button
                        className="ghost-button is-danger"
                        type="button"
                        onClick={() => props.onKickUser(seat.userId!)}
                      >
                        Spieler entfernen
                      </button>
                    ) : (
                      <span className="seat-card-action-spacer" aria-hidden="true">
                        Spieler entfernen
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </article>

        <div className="room-side-stack">
          <article className="surface room-control-card">
            <div className="eyebrow">Steuerung</div>
            <h2>Startklar machen</h2>
            <div className="room-action-stack">
              {!currentSeat ? (
                canJoinRoom ? (
                  <>
                    <p className="muted-copy room-action-hint">
                      Beim Beitritt bekommst du automatisch den naechsten freien Platz.
                    </p>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={props.onJoinRoom}
                      disabled={props.joinRoomPending}
                    >
                      <LoadingButtonContent
                        loading={props.joinRoomPending}
                        idleLabel="Beitreten"
                        loadingLabel="Beitritt laeuft..."
                      />
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
                  disabled={props.readyPending}
                  onClick={() => props.onReady(!currentSeat.ready)}
                >
                  <LoadingButtonContent
                    loading={props.readyPending}
                    idleLabel={currentSeat.ready ? "Nicht mehr bereit" : "Bereit"}
                    loadingLabel="Status wird gespeichert..."
                  />
                </button>
              ) : null}
              {canStart ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={props.onStart}
                  disabled={props.startPending}
                >
                  <LoadingButtonContent
                    loading={props.startPending}
                    idleLabel="Partie starten"
                    loadingLabel="Partie startet..."
                  />
                </button>
              ) : null}
              <button
                className="ghost-button"
                type="button"
                onClick={props.onLeave}
                disabled={props.leavePending}
              >
                <LoadingButtonContent
                  loading={props.leavePending}
                  idleLabel="Raum verlassen"
                  loadingLabel="Raum wird verlassen..."
                />
              </button>
            </div>
            <p className="muted-copy room-action-hint">
              Startet mit 3 bis 6 sitzenden Spielern, sobald alle bereit sind. Brett,
              Aufbau und Zugregel gelten fuer die naechste Partie.
            </p>
            {!isOwner ? (
              <button
                type="button"
                className={`room-settings-toggle ${settingsExpanded ? "is-open" : ""}`}
                aria-expanded={settingsExpanded}
                onClick={() => setShowGameSettings((current) => !current)}
              >
                <span className="room-settings-toggle-copy">
                  <span className="eyebrow">Spieleinstellungen</span>
                  <strong>{settingsExpanded ? "Ausblenden" : "Anzeigen"}</strong>
                  <span>{settingsSummary}</span>
                </span>
                <span className="room-settings-toggle-icon" aria-hidden="true">
                  {settingsExpanded ? "-" : "+"}
                </span>
              </button>
            ) : null}

            {settingsExpanded ? (
              <>
                <div className="room-settings-block">
                  <div className="room-setting-head">
                    <span className="eyebrow">Spielfeldgroesse</span>
                    <strong>{props.room.gameConfig.boardSize === "extended" ? "Erweitert" : "Standard"}</strong>
                  </div>
                  <div className="mini-segmented room-setup-mode">
                    <button
                      type="button"
                      className={props.room.gameConfig.boardSize === "standard" ? "is-active" : ""}
                      disabled={!canEditSettings || extendedBoardRequired}
                      onClick={() => props.onBoardSizeChange("standard")}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      className={props.room.gameConfig.boardSize === "extended" ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onBoardSizeChange("extended")}
                    >
                      Erweitert
                    </button>
                  </div>
                  <p className="muted-copy room-action-hint">
                    {extendedBoardRequired
                      ? "Mit 5 oder 6 Spielern ist das erweiterte Brett verpflichtend."
                      : "Bei 3 oder 4 Spielern kann der Host zwischen Standard und erweitertem Brett wechseln."}
                  </p>
                </div>

                <div className="mini-segmented room-setup-mode">
                  <button
                    type="button"
                    className={props.room.gameConfig.setupMode === "official_variable" ? "is-active" : ""}
                    disabled={!canEditSettings}
                    onClick={() => props.onSetupModeChange("official_variable")}
                  >
                    Variabler Aufbau
                  </button>
                  <button
                    type="button"
                    className={props.room.gameConfig.setupMode === "beginner" ? "is-active" : ""}
                    disabled={!canEditSettings || !beginnerAvailable}
                    onClick={() => props.onSetupModeChange("beginner")}
                  >
                    Anfaengeraufbau
                  </button>
                </div>

                {props.room.gameConfig.setupMode === "beginner" && seatedPlayers.length === 3 ? (
                  <p className="muted-copy room-action-hint">
                    Im Anfaengeraufbau mit 3 Spielern werden die Match-Farben auf die offiziellen
                    Einsteigerfarben umgelegt.
                  </p>
                ) : null}

                {!beginnerAvailable ? (
                  <p className="muted-copy room-action-hint">
                    Der Anfaengeraufbau ist nur auf dem Standardbrett verfuegbar.
                  </p>
                ) : null}

                <div className="room-settings-block">
                  <div className="room-setting-head">
                    <span className="eyebrow">Zugregel</span>
                    <strong>{renderTurnRuleLabel(props.room.gameConfig.turnRule)}</strong>
                  </div>
                  <div className="mini-segmented room-starting-mode">
                    <button
                      type="button"
                      className={props.room.gameConfig.turnRule === "standard" ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onTurnRuleChange("standard")}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      className={props.room.gameConfig.turnRule === "paired_players" ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onTurnRuleChange("paired_players")}
                    >
                      Paired Players
                    </button>
                    <button
                      type="button"
                      className={props.room.gameConfig.turnRule === "special_build_phase" ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onTurnRuleChange("special_build_phase")}
                    >
                      Sonderbauphase
                    </button>
                  </div>
                </div>

                <div className="room-settings-block">
                  <div className="room-setting-head">
                    <span className="eyebrow">Startspieler</span>
                    <strong>
                      {usesRolledStart
                        ? "Wird ausgewuerfelt"
                        : startingSeat?.username ??
                          `Platz ${props.room.gameConfig.startingPlayer.seatIndex + 1}`}
                    </strong>
                  </div>
                  <div className="mini-segmented room-starting-mode">
                    <button
                      type="button"
                      className={usesRolledStart ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onStartingPlayerModeChange("rolled")}
                    >
                      Auswuerfeln
                    </button>
                    <button
                      type="button"
                      className={!usesRolledStart ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onStartingPlayerModeChange("manual")}
                    >
                      Manuell
                    </button>
                  </div>
                  <p className="muted-copy room-action-hint">
                    {usesRolledStart
                      ? "Vor Spielstart wuerfeln alle sitzenden Spieler. Nur der erste Spieler wird so bestimmt."
                      : "Nur besetzte Plaetze koennen als erster Spieler gewaehlt werden."}
                  </p>
                  {!usesRolledStart ? (
                    <div className="mini-segmented room-starting-seat">
                      {seatedPlayers.map((seat) => (
                        <button
                          key={seat.index}
                          type="button"
                          className={
                            props.room.gameConfig.startingPlayer.seatIndex === seat.index
                              ? "is-active"
                              : ""
                          }
                          disabled={!canEditSettings}
                          onClick={() => props.onStartingSeatChange(seat.index)}
                        >
                          {seat.username ?? `Platz ${seat.index + 1}`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

          </article>
        </div>
      </div>
    </section>
  );
}
