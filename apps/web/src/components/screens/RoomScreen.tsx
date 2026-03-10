import { useEffect, useState } from "react";
import {
  type AuthUser,
  type BoardSize,
  type RoomDetails,
  type RulesPreset,
  type SetupMode,
  type StartingPlayerMode,
  type TurnRule,
  resolveRoomGameConfig
} from "@hexagonia/shared";
import { createText, resolveText, useI18n } from "../../i18n";
import { renderBoardSizeLabel, renderPlayerColorLabel, renderTurnRuleLabel } from "../../ui";
import { PlayerColorBadge } from "../shared/PlayerIdentity";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";

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
  onRulesPresetChange: (rulesPreset: RulesPreset) => void;
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
  const { locale } = useI18n();
  const text = (de: string, en: string) => resolveText(locale, createText(de, en));
  const seatText = (index: number) => (locale === "en" ? `Seat ${index + 1}` : `Platz ${index + 1}`);
  const playerText = (index: number) => (locale === "en" ? `Player ${index + 1}` : `Spieler ${index + 1}`);

  const currentSeat = props.room.seats.find((seat) => seat.userId === props.session.id) ?? null;
  const seatedPlayers = props.room.seats.filter((seat) => seat.userId);
  const readyPlayers = seatedPlayers.filter((seat) => seat.ready).length;
  const isOwner = props.room.ownerUserId === props.session.id;
  const hasFreeSeat = props.room.seats.some((seat) => !seat.userId);
  const canJoinRoom = !currentSeat && props.room.status === "open" && hasFreeSeat;
  const joinUnavailableLabel =
    props.room.status !== "open"
      ? text("Partie läuft bereits", "Match already running")
      : hasFreeSeat
        ? text("Nicht verfügbar", "Unavailable")
        : text("Raum ist voll", "Room is full");
  const canStart =
    isOwner &&
    seatedPlayers.length >= 3 &&
    seatedPlayers.length <= 6 &&
    readyPlayers === seatedPlayers.length;
  const canEditSettings = isOwner && props.room.status === "open";
  const extendedBoardRequired = seatedPlayers.length >= 5;
  const effectiveGameConfig = resolveRoomGameConfig(props.room.gameConfig, props.room.seats);
  const usesCustomRules = props.room.gameConfig.rulesPreset === "custom";
  const beginnerAvailable = props.room.gameConfig.boardSize === "standard";
  const effectiveStartingSeat =
    props.room.seats.find(
      (seat) => seat.index === effectiveGameConfig.startingPlayer.seatIndex && seat.userId
    ) ?? null;
  const customStartingSeat =
    props.room.seats.find(
      (seat) => seat.index === props.room.gameConfig.startingPlayer.seatIndex && seat.userId
    ) ?? null;
  const usesRolledStart = effectiveGameConfig.startingPlayer.mode === "rolled";
  const usesCustomRolledStart = props.room.gameConfig.startingPlayer.mode === "rolled";
  const [showGameSettings, setShowGameSettings] = useState(isOwner);
  const setupModeLabel =
    effectiveGameConfig.setupMode === "beginner"
      ? text("Anfängeraufbau", "Beginner setup")
      : text("Variabler Aufbau", "Variable setup");
  const startingPlayerLabel = usesRolledStart
    ? text("Start per Würfel", "Start by roll")
    : effectiveStartingSeat?.username ?? `${text("Start:", "Start:")} ${seatText(effectiveGameConfig.startingPlayer.seatIndex)}`;
  const effectiveRulesSummary = [
    renderBoardSizeLabel(locale, effectiveGameConfig.boardSize),
    setupModeLabel,
    renderTurnRuleLabel(locale, effectiveGameConfig.turnRule),
    startingPlayerLabel
  ].join(" / ");
  const settingsSummary = [
    usesCustomRules ? text("Benutzerdefiniert", "Custom") : text("Standardregeln", "Standard rules"),
    effectiveRulesSummary
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
              <div className="eyebrow">{text("Raumlobby", "Room lobby")}</div>
              <div className="room-code-row">
                <h1>{props.room.code}</h1>
                <span className="status-pill">{props.room.status === "open" ? text("Offen", "Open") : text("Laufend", "Running")}</span>
              </div>
              <p className="muted-copy room-subline">{text("Private Einladung für bis zu sechs Spieler.", "Private invite for up to six players.")}</p>
            </div>
            <div className="room-share-actions">
              <button type="button" className="ghost-button" onClick={props.onCopyInviteLink}>
                {text("Link kopieren", "Copy link")}
              </button>
              <button type="button" className="ghost-button" onClick={props.onCopyCode}>
                {text("Code kopieren", "Copy code")}
              </button>
            </div>
          </div>

          <div className="room-meta-strip">
            <span className="status-pill">{locale === "en" ? `${seatedPlayers.length}/6 occupied` : `${seatedPlayers.length}/6 besetzt`}</span>
            <span className={`status-pill ${readyPlayers === seatedPlayers.length && seatedPlayers.length >= 3 ? "" : "muted"}`}>
              {locale === "en" ? `${readyPlayers} ready` : `${readyPlayers} bereit`}
            </span>
            <span className="status-pill">
              {effectiveGameConfig.boardSize === "extended" ? text("Erweitertes Brett", "Extended board") : text("Standardbrett", "Standard board")}
            </span>
            <span className="status-pill">
              {usesRolledStart
                ? text("Start wird ausgewürfelt", "Starting player is rolled")
                : isOwner
                  ? text("Du legst Start fest", "You set the start")
                  : text("Host legt Start fest", "Host sets the start")}
            </span>
          </div>

          <div className="seat-grid">
            {props.room.seats.map((seat) => {
              const online = seat.userId ? props.presence.includes(seat.userId) : false;
              const occupied = !!seat.userId;
              const mine = seat.userId === props.session.id;
              const isHost = seat.userId === props.room.ownerUserId;
              const canKick = isOwner && props.room.status === "open" && occupied && !mine && !!seat.userId;
              const isStartingSeat =
                !usesRolledStart &&
                effectiveGameConfig.startingPlayer.seatIndex === seat.index &&
                occupied;
              const stateLabel = seat.ready ? text("Bereit", "Ready") : occupied ? text("Wartet", "Waiting") : text("Frei", "Open");
              const seatTitle = occupied ? seat.username ?? playerText(seat.index) : text("Freier Platz", "Open seat");
              const indicatorClass = occupied ? (online ? "is-online" : "is-offline") : "is-empty";
              const presenceLabel = occupied
                ? online
                  ? text("Online im Raum", "Online in room")
                  : text("Nicht verbunden", "Disconnected")
                : text("Wartet auf Spieler", "Waiting for player");

              return (
                <article
                  key={seat.index}
                  className={`seat-card player-surface player-accent-${seat.color} ${
                    mine ? "is-mine" : ""
                  } ${occupied ? "is-occupied" : "is-open"} ${isHost ? "is-host" : ""}`}
                >
                  <div className="seat-card-head">
                    <div className="seat-card-title-block">
                      <strong className="seat-card-title">{seatTitle}</strong>
                      {isHost ? <span className="status-pill room-host-pill">{text("Host", "Host")}</span> : null}
                      {mine ? <span className="status-pill muted">{text("Du", "You")}</span> : null}
                    </div>
                    <div className="seat-status-meta">
                      {occupied ? (
                        <PlayerColorBadge color={seat.color} label={renderPlayerColorLabel(locale, seat.color)} compact />
                      ) : (
                        <span className="status-pill muted">{text("Frei", "Open")}</span>
                      )}
                      <span className={`online-indicator ${indicatorClass}`} aria-hidden="true" />
                    </div>
                  </div>
                  <div className="seat-card-summary">
                    {seat.ready ? <span className="status-pill seat-ready-pill">{stateLabel}</span> : null}
                    {isStartingSeat ? <span className="status-pill seat-start-pill">{text("Startspieler", "Starting player")}</span> : null}
                    <span className="seat-card-state-label">{presenceLabel}</span>
                  </div>
                  {canKick ? (
                    <div className="seat-card-action">
                      <button className="ghost-button is-danger" type="button" onClick={() => props.onKickUser(seat.userId!)}>
                        {text("Spieler entfernen", "Remove player")}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </article>

        <div className="room-side-stack">
          <article className="surface room-control-card">
            <div className="eyebrow">{text("Steuerung", "Controls")}</div>
            <h2>{text("Startklar machen", "Get ready")}</h2>
            <div className="room-action-stack">
              {!currentSeat ? (
                canJoinRoom ? (
                  <>
                    <p className="muted-copy room-action-hint">
                      {text(
                        "Beim Beitritt bekommst du automatisch den nächsten freien Platz.",
                        "When you join, you automatically get the next available seat."
                      )}
                    </p>
                    <button className="primary-button" type="button" onClick={props.onJoinRoom} disabled={props.joinRoomPending}>
                      <LoadingButtonContent
                        loading={props.joinRoomPending}
                        idleLabel={text("Beitreten", "Join")}
                        loadingLabel={text("Beitritt läuft...", "Joining...")}
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
                    idleLabel={currentSeat.ready ? text("Nicht mehr bereit", "Not ready anymore") : text("Bereit", "Ready")}
                    loadingLabel={text("Status wird gespeichert...", "Saving status...")}
                  />
                </button>
              ) : null}
              {canStart ? (
                <button className="primary-button" type="button" onClick={props.onStart} disabled={props.startPending}>
                  <LoadingButtonContent
                    loading={props.startPending}
                    idleLabel={text("Partie starten", "Start match")}
                    loadingLabel={text("Partie startet...", "Starting match...")}
                  />
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={props.onLeave} disabled={props.leavePending}>
                <LoadingButtonContent
                  loading={props.leavePending}
                  idleLabel={text("Raum verlassen", "Leave room")}
                  loadingLabel={text("Raum wird verlassen...", "Leaving room...")}
                />
              </button>
            </div>
            <p className="muted-copy room-action-hint">
              {text(
                "Startet mit 3 bis 6 sitzenden Spielern, sobald alle bereit sind. Regeln und Startspieler gelten für die nächste Partie.",
                "Start with 3 to 6 seated players as soon as everyone is ready. Rules and starting player apply to the next match."
              )}
            </p>
            {!isOwner ? (
              <button
                type="button"
                className={`room-settings-toggle ${settingsExpanded ? "is-open" : ""}`}
                aria-expanded={settingsExpanded}
                onClick={() => setShowGameSettings((current) => !current)}
              >
                <span className="room-settings-toggle-copy">
                  <span className="eyebrow">{text("Spieleinstellungen", "Game settings")}</span>
                  <strong>{settingsExpanded ? text("Ausblenden", "Hide") : text("Anzeigen", "Show")}</strong>
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
                    <span className="eyebrow">{text("Regeln", "Rules")}</span>
                    <strong>{usesCustomRules ? text("Benutzerdefiniert", "Custom") : text("Standard", "Standard")}</strong>
                  </div>
                  <div className="mini-segmented room-starting-mode">
                    <button
                      type="button"
                      className={!usesCustomRules ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onRulesPresetChange("standard")}
                    >
                      {text("Standard", "Standard")}
                    </button>
                    <button
                      type="button"
                      className={usesCustomRules ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => props.onRulesPresetChange("custom")}
                    >
                      {text("Benutzerdefiniert", "Custom")}
                    </button>
                  </div>
                  <p className="muted-copy room-action-hint">
                    {usesCustomRules
                      ? text(
                          "Benutzerdefinierte Regeln blenden alle Detail-Einstellungen für Brett, Aufbau, Zugregel und Startspieler auf.",
                          "Custom rules reveal all detailed settings for board, setup, turn rule, and starting player."
                        )
                      : locale === "en"
                        ? `The latest official rules always apply: ${effectiveRulesSummary}.`
                        : `Es gelten immer die aktuellsten offiziellen Regeln: ${effectiveRulesSummary}.`}
                  </p>
                </div>

                {usesCustomRules ? (
                  <>
                    <div className="room-settings-block">
                      <div className="room-setting-head">
                        <span className="eyebrow">{text("Spielfeldgröße", "Board size")}</span>
                        <strong>{props.room.gameConfig.boardSize === "extended" ? text("Erweitert", "Extended") : text("Standard", "Standard")}</strong>
                      </div>
                      <div className="mini-segmented room-setup-mode">
                        <button
                          type="button"
                          className={props.room.gameConfig.boardSize === "standard" ? "is-active" : ""}
                          disabled={!canEditSettings || extendedBoardRequired}
                          onClick={() => props.onBoardSizeChange("standard")}
                        >
                          {text("Standard", "Standard")}
                        </button>
                        <button
                          type="button"
                          className={props.room.gameConfig.boardSize === "extended" ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => props.onBoardSizeChange("extended")}
                        >
                          {text("Erweitert", "Extended")}
                        </button>
                      </div>
                      <p className="muted-copy room-action-hint">
                        {extendedBoardRequired
                          ? text(
                              "Mit 5 oder 6 Spielern ist das erweiterte Brett verpflichtend.",
                              "With 5 or 6 players, the extended board is required."
                            )
                          : text(
                              "Bei 3 oder 4 Spielern kann der Host zwischen Standard und erweitertem Brett wechseln.",
                              "With 3 or 4 players, the host can switch between the standard and extended board."
                            )}
                      </p>
                    </div>

                    <div className="room-settings-block">
                      <div className="room-setting-head">
                        <span className="eyebrow">{text("Aufbau", "Setup")}</span>
                        <strong>
                          {props.room.gameConfig.setupMode === "beginner"
                            ? text("Anfängeraufbau", "Beginner setup")
                            : text("Variabler Aufbau", "Variable setup")}
                        </strong>
                      </div>
                      <div className="mini-segmented room-setup-mode">
                        <button
                          type="button"
                          className={props.room.gameConfig.setupMode === "official_variable" ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => props.onSetupModeChange("official_variable")}
                        >
                          {text("Variabler Aufbau", "Variable setup")}
                        </button>
                        <button
                          type="button"
                          className={props.room.gameConfig.setupMode === "beginner" ? "is-active" : ""}
                          disabled={!canEditSettings || !beginnerAvailable}
                          onClick={() => props.onSetupModeChange("beginner")}
                        >
                          {text("Anfängeraufbau", "Beginner setup")}
                        </button>
                      </div>
                      {props.room.gameConfig.setupMode === "beginner" && seatedPlayers.length === 3 ? (
                        <p className="muted-copy room-action-hint">
                          {text(
                            "Im Anfängeraufbau mit 3 Spielern werden die Match-Farben auf die offiziellen Einsteigerfarben umgelegt.",
                            "In beginner setup with 3 players, the match colors are reassigned to the official beginner colors."
                          )}
                        </p>
                      ) : null}
                      {!beginnerAvailable ? (
                        <p className="muted-copy room-action-hint">
                          {text(
                            "Der Anfängeraufbau ist nur auf dem Standardbrett verfügbar.",
                            "Beginner setup is only available on the standard board."
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="room-settings-block">
                      <div className="room-setting-head">
                        <span className="eyebrow">{text("Zugregel", "Turn rule")}</span>
                        <strong>{renderTurnRuleLabel(locale, props.room.gameConfig.turnRule)}</strong>
                      </div>
                      <div className="mini-segmented room-starting-mode">
                        <button
                          type="button"
                          className={props.room.gameConfig.turnRule === "standard" ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => props.onTurnRuleChange("standard")}
                        >
                          {text("Standard", "Standard")}
                        </button>
                        <button
                          type="button"
                          className={props.room.gameConfig.turnRule === "paired_players" ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => props.onTurnRuleChange("paired_players")}
                        >
                          {text("Paired Players", "Paired players")}
                        </button>
                        <button
                          type="button"
                          className={props.room.gameConfig.turnRule === "special_build_phase" ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => props.onTurnRuleChange("special_build_phase")}
                        >
                          {text("Sonderbauphase", "Special build phase")}
                        </button>
                      </div>
                    </div>

                    <div className="room-settings-block">
                      <div className="room-setting-head">
                        <span className="eyebrow">{text("Startspieler", "Starting player")}</span>
                        <strong>
                          {usesCustomRolledStart
                            ? text("Wird ausgewürfelt", "Will be rolled")
                            : customStartingSeat?.username ?? seatText(props.room.gameConfig.startingPlayer.seatIndex)}
                        </strong>
                      </div>
                      <div className="mini-segmented room-starting-mode">
                        <button
                          type="button"
                          className={usesCustomRolledStart ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => props.onStartingPlayerModeChange("rolled")}
                        >
                          {text("Auswürfeln", "Roll")}
                        </button>
                        <button
                          type="button"
                          className={!usesCustomRolledStart ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => props.onStartingPlayerModeChange("manual")}
                        >
                          {text("Manuell", "Manual")}
                        </button>
                      </div>
                      <p className="muted-copy room-action-hint">
                        {usesCustomRolledStart
                          ? text(
                              "Vor Spielstart würfeln alle sitzenden Spieler. Nur der erste Spieler wird so bestimmt.",
                              "Before the match starts, all seated players roll. Only the first player is determined this way."
                            )
                          : text(
                              "Nur besetzte Plätze können als erster Spieler gewählt werden.",
                              "Only occupied seats can be selected as the starting player."
                            )}
                      </p>
                      {!usesCustomRolledStart ? (
                        <div className="mini-segmented room-starting-seat">
                          {seatedPlayers.map((seat) => (
                            <button
                              key={seat.index}
                              type="button"
                              className={props.room.gameConfig.startingPlayer.seatIndex === seat.index ? "is-active" : ""}
                              disabled={!canEditSettings}
                              onClick={() => props.onStartingSeatChange(seat.index)}
                            >
                              {seat.username ?? seatText(seat.index)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </article>
        </div>
      </div>
    </section>
  );
}
