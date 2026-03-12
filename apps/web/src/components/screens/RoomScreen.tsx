import { useEffect, useMemo, useState } from "react";
import {
  type AuthUser,
  type BoardSize,
  getScenarioCatalogEntry,
  getScenarioAllowedLayoutModes,
  getScenarioVictoryPointsToWin,
  isNewWorldScenarioSetupEnabled,
  isScenarioFixedLayoutOnly,
  listScenarioCatalogEntries,
  type LayoutMode,
  type RoomDetails,
  type RulesFamily,
  type RulesPreset,
  type ScenarioId,
  type SetupMode,
  type StartingPlayerMode,
  type TurnRule,
  resolveRoomGameConfig
} from "@hexagonia/shared";
import { uiHapticsManager } from "../../audio/uiHapticsManager";
import { useI18n } from "../../i18n";
import { renderBoardSizeLabel, renderPlayerColorLabel, renderTurnRuleLabel } from "../../ui";
import { PlayerColorBadge } from "../shared/PlayerIdentity";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import { PopupSelect, type PopupSelectOption } from "../shared/PopupSelect";

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
  onRulesFamilyChange: (rulesFamily: RulesFamily) => void;
  onScenarioChange: (scenarioId: ScenarioId) => void;
  onSetupModeChange: (setupMode: SetupMode) => void;
  onLayoutModeChange: (layoutMode: LayoutMode) => void;
  onVictoryPointsToWinChange: (victoryPointsToWin: number) => void;
  onNewWorldScenarioSetupChange: (newWorldScenarioSetupEnabled: boolean) => void;
  onStartingPlayerModeChange: (startingPlayerMode: StartingPlayerMode) => void;
  onStartingSeatChange: (startingSeatIndex: number) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onTurnRuleChange: (turnRule: TurnRule) => void;
  onLeave: () => void;
  onCopyCode: () => void;
  onCopyInviteLink: () => void;
}) {
  const { locale, translate } = useI18n();
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, undefined, undefined, params);
  const seatText = (index: number) => t("room.seat.label", { count: index + 1 });
  const playerText = (index: number) => t("room.seat.player", { count: index + 1 });

  const currentSeat = props.room.seats.find((seat) => seat.userId === props.session.id) ?? null;
  const seatedPlayers = props.room.seats.filter((seat) => seat.userId);
  const readyPlayers = seatedPlayers.filter((seat) => seat.ready).length;
  const isOwner = props.room.ownerUserId === props.session.id;
  const hasFreeSeat = props.room.seats.some((seat) => !seat.userId);
  const canJoinRoom = !currentSeat && props.room.status === "open" && hasFreeSeat;
  const joinUnavailableLabel =
    props.room.status !== "open"
      ? t("room.join.matchRunning")
      : hasFreeSeat
        ? t("room.join.unavailable")
        : t("room.join.full");
  const canStart =
    isOwner &&
    seatedPlayers.length >= 3 &&
    seatedPlayers.length <= 6 &&
    readyPlayers === seatedPlayers.length;
  const canEditSettings = isOwner && props.room.status === "open";
  const extendedBoardRequired = seatedPlayers.length >= 5;
  const effectiveGameConfig = resolveRoomGameConfig(props.room.gameConfig, props.room.seats);
  const effectiveScenario = getScenarioCatalogEntry(effectiveGameConfig.scenarioId);
  const usesCustomRules = props.room.gameConfig.rulesPreset === "custom";
  const beginnerAvailable = effectiveGameConfig.boardSize === "standard";
  const effectiveStartingSeat =
    props.room.seats.find(
      (seat) => seat.index === effectiveGameConfig.startingPlayer.seatIndex && seat.userId
    ) ?? null;
  const usesRolledStart = effectiveGameConfig.startingPlayer.mode === "rolled";
  const newWorldScenarioSetupEnabled = isNewWorldScenarioSetupEnabled(effectiveGameConfig);
  const [showGameSettings, setShowGameSettings] = useState(isOwner);
  const setupModeLabel =
    effectiveGameConfig.setupMode === "beginner"
      ? t("room.setup.beginner")
      : t("room.setup.variable");
  const newWorldSetupLabel = newWorldScenarioSetupEnabled
    ? t("room.newWorldSetup.editor")
    : t("room.newWorldSetup.official");
  const startingPlayerLabel = usesRolledStart
    ? t("room.startingPlayer.rollSummary")
    : effectiveStartingSeat?.username ?? t("room.startingPlayer.fallback", {
        seat: seatText(effectiveGameConfig.startingPlayer.seatIndex)
      });
  const effectiveRulesSummary = [
    effectiveGameConfig.rulesFamily === "seafarers"
      ? effectiveGameConfig.layoutMode === "official_variable"
        ? t("room.layoutMode.variable")
        : t("room.layoutMode.fixed")
      : renderBoardSizeLabel(locale, effectiveGameConfig.boardSize),
    effectiveGameConfig.scenarioId === "seafarers.new_world" ? newWorldSetupLabel : setupModeLabel,
    renderTurnRuleLabel(locale, effectiveGameConfig.turnRule),
    startingPlayerLabel
  ].join(" / ");
  const settingsSummary = [
    usesCustomRules ? t("room.rules.custom") : t("room.rules.standardRules"),
    effectiveRulesSummary
  ].join(" / ");
  const settingsExpanded = isOwner || showGameSettings;
  const scenarioPlayerCount = Math.max(seatedPlayers.length, 3);
  const turnRuleLocked = effectiveGameConfig.rulesFamily === "seafarers";
  const scenarioEntries = useMemo(
    () =>
      listScenarioCatalogEntries(effectiveGameConfig.rulesFamily).filter((entry) =>
        entry.playerCounts.includes(scenarioPlayerCount)
      ),
    [effectiveGameConfig.rulesFamily, scenarioPlayerCount]
  );
  const rulesFamilyOptions = useMemo<PopupSelectOption<RulesFamily>[]>(
    () => [
      {
        value: "base",
        label: t("room.rulesFamily.base.label")
      },
      {
        value: "seafarers",
        label: t("room.rulesFamily.seafarers.label")
      }
    ],
    [t]
  );
  const scenarioOptions = useMemo<PopupSelectOption<ScenarioId>[]>(
    () =>
      scenarioEntries.map((entry) => ({
        value: entry.id,
        label: t(entry.titleKey)
      })),
    [scenarioEntries, t]
  );
  const allowedLayoutModes = useMemo(
    () => getScenarioAllowedLayoutModes(effectiveScenario.id, scenarioPlayerCount),
    [effectiveScenario.id, scenarioPlayerCount]
  );
  const fixedLayoutOnly = useMemo(
    () => isScenarioFixedLayoutOnly(effectiveScenario.id, scenarioPlayerCount),
    [effectiveScenario.id, scenarioPlayerCount]
  );
  const layoutModeOptions = useMemo<PopupSelectOption<LayoutMode>[]>(
    () => [
      {
        value: "official_fixed",
        label: t("room.layoutMode.fixed"),
        meta: fixedLayoutOnly
          ? t("room.layoutMode.fixedOnly")
          : t("room.layoutMode.variableAllowed")
      },
      {
        value: "official_variable",
        label: t("room.layoutMode.variable"),
        meta: t("room.layoutMode.variableAllowed"),
        disabled: !allowedLayoutModes.includes("official_variable")
      }
    ],
    [allowedLayoutModes, fixedLayoutOnly, t]
  );
  const victoryPointOptions = useMemo<PopupSelectOption<`${number}`>[]>(
    () =>
      Array.from({ length: 11 }, (_, index) => index + 8).map((count) => ({
        value: `${count}`,
        label: t("room.victoryPoints.option", { count }),
        meta:
          count === effectiveScenario.defaultVictoryPointsToWin
            ? t("room.victoryPoints.official")
            : undefined
      })),
    [effectiveScenario.defaultVictoryPointsToWin, t]
  );
  const triggerSoftHaptic = () => void uiHapticsManager.play("soft");

  useEffect(() => {
    setShowGameSettings(isOwner);
  }, [isOwner, props.room.id]);

  return (
    <section className="screen-shell room-shell">
      <div className="room-main-grid">
        <article className="surface room-hero">
          <div className="surface-head room-surface-head">
            <div className="room-title-stack">
              <div className="eyebrow">{t("room.hero.eyebrow")}</div>
              <div className="room-code-row">
                <h1>{props.room.code}</h1>
                <span className="status-pill">
                  {props.room.status === "open" ? t("room.status.open") : t("room.status.running")}
                </span>
              </div>
              <p className="muted-copy room-subline">
                {t("room.hero.detail")}
              </p>
            </div>
            <div className="room-share-actions">
              <button type="button" className="ghost-button" onClick={props.onCopyInviteLink}>
                {t("room.hero.copyLink")}
              </button>
              <button type="button" className="ghost-button" onClick={props.onCopyCode}>
                {t("room.hero.copyCode")}
              </button>
            </div>
          </div>

          <div className="room-meta-strip">
            <span className="status-pill">
              {t("room.hero.occupied", { count: seatedPlayers.length })}
            </span>
            <span
              className={`status-pill ${readyPlayers === seatedPlayers.length && seatedPlayers.length >= 3 ? "" : "muted"}`}
            >
              {t("room.hero.ready", { count: readyPlayers })}
            </span>
            <span className="status-pill">
              {t(effectiveScenario.titleKey)}
            </span>
            <span className="status-pill">
              {effectiveGameConfig.rulesFamily === "seafarers"
                ? effectiveGameConfig.layoutMode === "official_variable"
                  ? t("room.layoutMode.variable")
                  : t("room.layoutMode.fixed")
                : effectiveGameConfig.boardSize === "extended"
                  ? t("room.hero.board.extended")
                  : t("room.hero.board.standard")}
            </span>
            <span className="status-pill">
              {usesRolledStart
                ? t("room.hero.start.rolled")
                : isOwner
                  ? t("room.hero.start.self")
                  : t("room.hero.start.host")}
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
              const stateLabel = seat.ready
                ? t("room.seat.ready")
                : occupied
                  ? t("room.seat.waiting")
                  : t("room.seat.open");
              const seatTitle = occupied
                ? seat.username ?? playerText(seat.index)
                : t("room.seat.openTitle");
              const indicatorClass = occupied ? (online ? "is-online" : "is-offline") : "is-empty";
              const presenceLabel = occupied
                ? online
                  ? t("room.seat.online")
                  : t("room.seat.offline")
                : t("room.seat.waitingPlayer");

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
                      {isHost ? <span className="status-pill room-host-pill">{t("room.seat.host")}</span> : null}
                      {mine ? <span className="status-pill muted">{t("room.seat.you")}</span> : null}
                    </div>
                    <div className="seat-status-meta">
                      {occupied ? (
                        <PlayerColorBadge color={seat.color} label={renderPlayerColorLabel(locale, seat.color)} compact />
                      ) : (
                        <span className="status-pill muted">{t("room.seat.open")}</span>
                      )}
                      <span className={`online-indicator ${indicatorClass}`} aria-hidden="true" />
                    </div>
                  </div>
                  <div className="seat-card-summary">
                    {seat.ready ? <span className="status-pill seat-ready-pill">{stateLabel}</span> : null}
                    {isStartingSeat ? <span className="status-pill seat-start-pill">{t("room.seat.startingPlayer")}</span> : null}
                    <span className="seat-card-state-label">{presenceLabel}</span>
                  </div>
                  {canKick ? (
                    <div className="seat-card-action">
                      <button className="ghost-button is-danger" type="button" onClick={() => props.onKickUser(seat.userId!)}>
                        {t("room.seat.removePlayer")}
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
            <div className="eyebrow">{t("room.controls.eyebrow")}</div>
            <h2>{t("room.controls.title")}</h2>
            <div className="room-action-stack">
              {!currentSeat ? (
                canJoinRoom ? (
                  <>
                    <p className="muted-copy room-action-hint">
                      {t("room.controls.joinHint")}
                    </p>
                    <button className="primary-button" type="button" onClick={props.onJoinRoom} disabled={props.joinRoomPending}>
                      <LoadingButtonContent
                        loading={props.joinRoomPending}
                        idleLabel={t("room.controls.join")}
                        loadingLabel={t("room.controls.joinLoading")}
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
                    idleLabel={currentSeat.ready ? t("room.controls.notReady") : t("room.controls.ready")}
                    loadingLabel={t("room.controls.readyLoading")}
                  />
                </button>
              ) : null}
              {canStart ? (
                <button className="primary-button" type="button" onClick={props.onStart} disabled={props.startPending}>
                  <LoadingButtonContent
                    loading={props.startPending}
                    idleLabel={t("room.controls.start")}
                    loadingLabel={t("room.controls.startLoading")}
                  />
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={props.onLeave} disabled={props.leavePending}>
                <LoadingButtonContent
                  loading={props.leavePending}
                  idleLabel={t("room.leave.title")}
                  loadingLabel={t("room.leave.loading")}
                />
              </button>
            </div>
            <p className="muted-copy room-action-hint">
              {t("room.controls.startHint")}
            </p>
            {!isOwner ? (
              <button
                type="button"
                className={`room-settings-toggle ${settingsExpanded ? "is-open" : ""}`}
                aria-expanded={settingsExpanded}
                onClick={() => setShowGameSettings((current) => !current)}
              >
                <span className="room-settings-toggle-copy">
                  <span className="eyebrow">{t("room.settings.eyebrow")}</span>
                  <strong>{settingsExpanded ? t("room.settings.hide") : t("room.settings.show")}</strong>
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
                    <span className="eyebrow">{t("room.rules.eyebrow")}</span>
                    <strong>{usesCustomRules ? t("room.rules.custom") : t("room.rules.standard")}</strong>
                  </div>
                  <div className="mini-segmented room-starting-mode">
                    <button
                      type="button"
                      className={!usesCustomRules ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => {
                        triggerSoftHaptic();
                        props.onRulesPresetChange("standard");
                      }}
                    >
                      {t("room.rules.standard")}
                    </button>
                    <button
                      type="button"
                      className={usesCustomRules ? "is-active" : ""}
                      disabled={!canEditSettings}
                      onClick={() => {
                        triggerSoftHaptic();
                        props.onRulesPresetChange("custom");
                      }}
                    >
                      {t("room.rules.custom")}
                    </button>
                  </div>
                  <p className="muted-copy room-action-hint">
                    {usesCustomRules
                      ? effectiveGameConfig.rulesFamily === "seafarers"
                        ? t("room.custom.seafarersSummary")
                        : t("room.custom.baseSummary")
                      : t("room.official.summary", { summary: effectiveRulesSummary })}
                  </p>
                </div>

                <div className="room-settings-block">
                  <div className="room-setting-head">
                    <span className="eyebrow">{t("room.rulesFamily.eyebrow")}</span>
                    <strong>
                      {effectiveGameConfig.rulesFamily === "base"
                        ? t("room.rulesFamily.base.label")
                        : t("room.rulesFamily.seafarers.label")}
                    </strong>
                  </div>
                  <div className="profile-popup-select-shell">
                    <PopupSelect
                      value={effectiveGameConfig.rulesFamily}
                      options={rulesFamilyOptions}
                      onChange={props.onRulesFamilyChange}
                      ariaLabel={t("room.rulesFamily.aria")}
                      variant="profile"
                      disabled={!canEditSettings}
                    />
                  </div>
                </div>

                <div className="room-settings-block">
                  <div className="room-setting-head">
                    <span className="eyebrow">{t("room.scenario.eyebrow")}</span>
                    <strong>{t(effectiveScenario.titleKey)}</strong>
                  </div>
                  <div className="profile-popup-select-shell">
                    <PopupSelect
                      value={effectiveGameConfig.scenarioId}
                      options={scenarioOptions}
                      onChange={props.onScenarioChange}
                      ariaLabel={t("room.scenario.aria")}
                      variant="profile"
                      disabled={!canEditSettings || scenarioOptions.length === 0}
                    />
                  </div>
                  <p className="muted-copy room-action-hint">{t(effectiveScenario.summaryKey)}</p>
                </div>

                {usesCustomRules ? (
                  <>
                    <div className="room-settings-block">
                      <div className="room-setting-head">
                        <span className="eyebrow">{t("room.victoryPoints.eyebrow")}</span>
                        <strong>
                          {t("room.victoryPoints.summary", {
                            count: getScenarioVictoryPointsToWin(effectiveGameConfig)
                          })}
                        </strong>
                      </div>
                      <div className="profile-popup-select-shell">
                        <PopupSelect
                          value={`${getScenarioVictoryPointsToWin(effectiveGameConfig)}`}
                          options={victoryPointOptions}
                          onChange={(value) => props.onVictoryPointsToWinChange(Number(value))}
                          ariaLabel={t("room.victoryPoints.aria")}
                          variant="profile"
                          disabled={!canEditSettings}
                        />
                      </div>
                    </div>

                    {effectiveGameConfig.rulesFamily === "seafarers" ? (
                      <>
                        <div className="room-settings-block">
                          <div className="room-setting-head">
                            <span className="eyebrow">{t("room.layoutMode.eyebrow")}</span>
                            <strong>
                              {effectiveGameConfig.layoutMode === "official_variable"
                                ? t("room.layoutMode.variable")
                                : t("room.layoutMode.fixed")}
                            </strong>
                          </div>
                          <div className="profile-popup-select-shell">
                            <PopupSelect
                              value={effectiveGameConfig.layoutMode}
                              options={layoutModeOptions}
                              onChange={props.onLayoutModeChange}
                              ariaLabel={t("room.layoutMode.aria")}
                              variant="profile"
                              disabled={!canEditSettings}
                            />
                          </div>
                          <p className="muted-copy room-action-hint">
                            {fixedLayoutOnly
                              ? t("room.layoutMode.fixedOnly")
                              : t("room.layoutMode.variableAllowed")}
                          </p>
                        </div>

                        {effectiveGameConfig.scenarioId === "seafarers.new_world" ? (
                          <div className="room-settings-block">
                            <div className="room-setting-head">
                              <span className="eyebrow">{t("room.newWorldSetup.eyebrow")}</span>
                              <strong>{newWorldSetupLabel}</strong>
                            </div>
                            <div className="mini-segmented room-starting-mode">
                              <button
                                type="button"
                                className={!newWorldScenarioSetupEnabled ? "is-active" : ""}
                                disabled={!canEditSettings}
                                onClick={() => {
                                  triggerSoftHaptic();
                                  props.onNewWorldScenarioSetupChange(false);
                                }}
                              >
                                {t("room.newWorldSetup.official")}
                              </button>
                              <button
                                type="button"
                                className={newWorldScenarioSetupEnabled ? "is-active" : ""}
                                disabled={!canEditSettings}
                                onClick={() => {
                                  triggerSoftHaptic();
                                  props.onNewWorldScenarioSetupChange(true);
                                }}
                              >
                                {t("room.newWorldSetup.editor")}
                              </button>
                            </div>
                            <p className="muted-copy room-action-hint">
                              {newWorldScenarioSetupEnabled
                                ? t("room.newWorldSetup.hint.editor")
                                : t("room.newWorldSetup.hint.official")}
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {effectiveGameConfig.rulesFamily === "base" ? (
                      <>
                        <div className="room-settings-block">
                          <div className="room-setting-head">
                            <span className="eyebrow">{t("room.boardSize.eyebrow")}</span>
                            <strong>
                              {effectiveGameConfig.boardSize === "extended"
                                ? t("room.boardSize.extended")
                                : t("room.boardSize.standard")}
                            </strong>
                          </div>
                          <div className="mini-segmented room-setup-mode">
                            <button
                              type="button"
                              className={effectiveGameConfig.boardSize === "standard" ? "is-active" : ""}
                              disabled={!canEditSettings || extendedBoardRequired}
                              onClick={() => {
                                triggerSoftHaptic();
                                props.onBoardSizeChange("standard");
                              }}
                            >
                              {t("room.boardSize.standard")}
                            </button>
                            <button
                              type="button"
                              className={effectiveGameConfig.boardSize === "extended" ? "is-active" : ""}
                              disabled={!canEditSettings}
                              onClick={() => {
                                triggerSoftHaptic();
                                props.onBoardSizeChange("extended");
                              }}
                            >
                              {t("room.boardSize.extended")}
                            </button>
                          </div>
                          <p className="muted-copy room-action-hint">
                            {extendedBoardRequired
                              ? t("room.boardSize.hint.extendedRequired")
                              : t("room.boardSize.hint.standardOptional")}
                          </p>
                        </div>

                        <div className="room-settings-block">
                          <div className="room-setting-head">
                            <span className="eyebrow">{t("room.setup.eyebrow")}</span>
                            <strong>
                              {effectiveGameConfig.setupMode === "beginner"
                                ? t("room.setup.beginner")
                                : t("room.setup.variable")}
                            </strong>
                          </div>
                          <div className="mini-segmented room-setup-mode">
                            <button
                              type="button"
                              className={effectiveGameConfig.setupMode === "official_variable" ? "is-active" : ""}
                              disabled={!canEditSettings}
                              onClick={() => {
                                triggerSoftHaptic();
                                props.onSetupModeChange("official_variable");
                              }}
                            >
                              {t("room.setup.variable")}
                            </button>
                            <button
                              type="button"
                              className={effectiveGameConfig.setupMode === "beginner" ? "is-active" : ""}
                              disabled={!canEditSettings || !beginnerAvailable}
                              onClick={() => {
                                triggerSoftHaptic();
                                props.onSetupModeChange("beginner");
                              }}
                            >
                              {t("room.setup.beginner")}
                            </button>
                          </div>
                          {effectiveGameConfig.setupMode === "beginner" && seatedPlayers.length === 3 ? (
                            <p className="muted-copy room-action-hint">
                              {t("room.setup.hint.beginnerColors")}
                            </p>
                          ) : null}
                          {!beginnerAvailable ? (
                            <p className="muted-copy room-action-hint">
                              {t("room.setup.hint.beginnerOnlyStandard")}
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    <div className="room-settings-block">
                      <div className="room-setting-head">
                        <span className="eyebrow">{t("room.turnRule.eyebrow")}</span>
                        <strong>{renderTurnRuleLabel(locale, effectiveGameConfig.turnRule)}</strong>
                      </div>
                      <div className="mini-segmented room-starting-mode">
                        <button
                          type="button"
                          className={effectiveGameConfig.turnRule === "standard" ? "is-active" : ""}
                          disabled={!canEditSettings || turnRuleLocked}
                          onClick={() => {
                            triggerSoftHaptic();
                            props.onTurnRuleChange("standard");
                          }}
                        >
                          {t("room.turnRule.standard")}
                        </button>
                        <button
                          type="button"
                          className={effectiveGameConfig.turnRule === "paired_players" ? "is-active" : ""}
                          disabled={!canEditSettings || turnRuleLocked}
                          onClick={() => {
                            triggerSoftHaptic();
                            props.onTurnRuleChange("paired_players");
                          }}
                        >
                          {t("room.turnRule.pairedPlayers")}
                        </button>
                        <button
                          type="button"
                          className={effectiveGameConfig.turnRule === "special_build_phase" ? "is-active" : ""}
                          disabled={!canEditSettings || turnRuleLocked}
                          onClick={() => {
                            triggerSoftHaptic();
                            props.onTurnRuleChange("special_build_phase");
                          }}
                        >
                          {t("room.turnRule.specialBuildPhase")}
                        </button>
                      </div>
                      {turnRuleLocked ? (
                        <p className="muted-copy room-action-hint">{t("room.turnRule.lockedSeafarers")}</p>
                      ) : null}
                    </div>

                    <div className="room-settings-block">
                      <div className="room-setting-head">
                        <span className="eyebrow">{t("room.startingPlayer.eyebrow")}</span>
                        <strong>
                          {usesRolledStart
                            ? t("room.startingPlayer.rolled")
                            : effectiveStartingSeat?.username ?? seatText(effectiveGameConfig.startingPlayer.seatIndex)}
                        </strong>
                      </div>
                      <div className="mini-segmented room-starting-mode">
                        <button
                          type="button"
                          className={usesRolledStart ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => {
                            triggerSoftHaptic();
                            props.onStartingPlayerModeChange("rolled");
                          }}
                        >
                          {t("room.startingPlayer.roll")}
                        </button>
                        <button
                          type="button"
                          className={!usesRolledStart ? "is-active" : ""}
                          disabled={!canEditSettings}
                          onClick={() => {
                            triggerSoftHaptic();
                            props.onStartingPlayerModeChange("manual");
                          }}
                        >
                          {t("room.startingPlayer.manual")}
                        </button>
                      </div>
                      <p className="muted-copy room-action-hint">
                        {usesRolledStart
                          ? t("room.startingPlayer.hint.roll")
                          : t("room.startingPlayer.hint.manual")}
                      </p>
                      {!usesRolledStart ? (
                        <div className="mini-segmented room-starting-seat">
                          {seatedPlayers.map((seat) => (
                            <button
                              key={seat.index}
                              type="button"
                              className={effectiveGameConfig.startingPlayer.seatIndex === seat.index ? "is-active" : ""}
                              disabled={!canEditSettings}
                              onClick={() => {
                                triggerSoftHaptic();
                                props.onStartingSeatChange(seat.index);
                              }}
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
