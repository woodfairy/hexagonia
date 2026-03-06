import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ClientMessage, MatchSnapshot, Resource, RoomDetails } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import { BoardScene, type BoardFocusCue, type InteractionMode } from "../../BoardScene";
import { formatPhase, renderEventLabel, renderResourceLabel, renderResourceMap } from "../../ui";

export interface TradeFormState {
  give: Resource;
  giveCount: number;
  want: Resource;
  wantCount: number;
  targetPlayerId: string;
}

export interface MaritimeFormState {
  give: Resource;
  receive: Resource;
}

type MatchPanelTab = "overview" | "actions" | "hand" | "trade" | "players";
type SheetState = "peek" | "half" | "full";
type ActionSection = "build" | "cards";
type TradeSection = "player" | "maritime";
type BuildActionId = "road" | "settlement" | "city" | "development";

const MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "overview", label: "Ueberblick" },
  { id: "actions", label: "Aktionen" },
  { id: "hand", label: "Hand" },
  { id: "trade", label: "Handel" },
  { id: "players", label: "Spieler" }
];

const BUILD_COSTS: Record<BuildActionId, Partial<Record<Resource, number>>> = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { grain: 2, ore: 3 },
  development: { grain: 1, wool: 1, ore: 1 }
};

const AUTO_FOCUS_STORAGE_KEY = "hexagonia:auto-focus";

interface FocusableEventResult {
  cue: BoardFocusCue;
  event: MatchSnapshot["eventLog"][number];
}

export function MatchScreen(props: {
  match: MatchSnapshot;
  room: RoomDetails | null;
  selfPlayer: MatchSnapshot["players"][number] | null;
  interactionMode: InteractionMode;
  selectedRoadEdges: string[];
  tradeForm: TradeFormState;
  maritimeForm: MaritimeFormState;
  yearOfPlenty: [Resource, Resource];
  monopolyResource: Resource;
  onAction: (message: ClientMessage) => void;
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
  const [activeTab, setActiveTab] = useState<MatchPanelTab>("overview");
  const [sheetState, setSheetState] = useState<SheetState>("half");
  const [actionSection, setActionSection] = useState<ActionSection>("build");
  const [tradeSection, setTradeSection] = useState<TradeSection>("player");
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem(AUTO_FOCUS_STORAGE_KEY) !== "off";
  });

  const activePlayer = props.match.players.find((player) => player.id === props.match.currentPlayerId) ?? null;
  const isCurrentPlayer = props.match.currentPlayerId === props.match.you;
  const recentEvents = useMemo(() => props.match.eventLog.slice(-5).reverse(), [props.match.eventLog]);
  const recentFocusableEvent = useMemo(() => getLatestFocusableEvent(props.match), [props.match]);
  const actionCue = useMemo(
    () => createOwnActionCue(props.match, activePlayer, props.interactionMode, props.selectedRoadEdges),
    [activePlayer, props.interactionMode, props.match, props.selectedRoadEdges]
  );
  const highlightCue = actionCue ?? recentFocusableEvent?.cue ?? null;
  const cameraCue =
    autoFocusEnabled &&
    recentFocusableEvent?.event.byPlayerId &&
    recentFocusableEvent.event.byPlayerId !== props.match.you
      ? recentFocusableEvent.cue
      : null;
  const spotlightCue = cameraCue ?? actionCue ?? recentFocusableEvent?.cue ?? null;
  const tradeTargetPlayers = props.match.players.filter((player) => player.id !== props.match.you);
  const maritimeRatio =
    props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === props.maritimeForm.give)?.ratio ?? 4;
  const turnStatus = getTurnStatus(props.match, activePlayer, props.selfPlayer, props.interactionMode, props.selectedRoadEdges.length);
  const buildActions = [
    createBuildActionState("road", "Strasse", {
      cost: BUILD_COSTS.road,
      enabled: isCurrentPlayer && props.match.allowedMoves.roadEdgeIds.length > 0,
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
      enabled: isCurrentPlayer && props.match.allowedMoves.settlementVertexIds.length > 0,
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
      enabled: isCurrentPlayer && props.match.allowedMoves.cityVertexIds.length > 0,
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
      onClick: () =>
        props.onAction({
          type: "match.action",
          matchId: props.match.matchId,
          action: { type: "buy_development_card" }
        })
    })
  ];
  const canSubmitTradeOffer = canAffordOffer(props.selfPlayer?.resources, props.tradeForm.give, props.tradeForm.giveCount);
  const canSubmitMaritimeTrade = (props.selfPlayer?.resources?.[props.maritimeForm.give] ?? 0) >= maritimeRatio;
  const primaryActions = [
    {
      id: "roll",
      label: "Wuerfeln",
      className: "primary-button",
      disabled: !props.match.allowedMoves.canRoll,
      onClick: () =>
        props.onAction({
          type: "match.action",
          matchId: props.match.matchId,
          action: { type: "roll_dice" }
        })
    },
    {
      id: "end-turn",
      label: "Zug beenden",
      className: "primary-button",
      disabled: !props.match.allowedMoves.canEndTurn,
      onClick: () =>
        props.onAction({
          type: "match.action",
          matchId: props.match.matchId,
          action: { type: "end_turn" }
        })
    },
    {
      id: "cancel-mode",
      label: "Auswahl aufheben",
      className: "ghost-button",
      disabled: !props.interactionMode,
      onClick: () => {
        props.setInteractionMode(null);
        props.setSelectedRoadEdges([]);
      }
    }
  ];

  const renderQuickActions = () =>
    primaryActions.some((action) => !action.disabled) ? (
      <div className="quick-action-grid">
        {primaryActions.map((action) => (
          <button key={action.id} type="button" className={action.className} disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    ) : (
      <div className="action-placeholder">
        <strong>{turnStatus.title}</strong>
        <span>{turnStatus.detail}</span>
      </div>
    );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(AUTO_FOCUS_STORAGE_KEY, autoFocusEnabled ? "on" : "off");
  }, [autoFocusEnabled]);

  const tabPanels: Record<MatchPanelTab, ReactNode> = {
    overview: (
      <div className="panel-frame overview-frame">
        <div className="dock-card-grid">
          <InfoCard label="Phase" value={formatPhase(props.match.phase)} />
          <InfoCard label="Aktiver Spieler" value={activePlayer?.username ?? "-"} />
          <InfoCard label="Wuerfel" value={props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : "Offen"} />
          <InfoCard label="Raum" value={props.room?.code ?? "Unbekannt"} />
        </div>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Status</h3>
            <span>{formatPhase(props.match.phase)}</span>
          </div>
          <div className="turn-status-card">
            <strong>{turnStatus.title}</strong>
            <span>{turnStatus.detail}</span>
          </div>
          <div className="status-strip compact">
            <span className="status-pill">Du: {props.selfPlayer?.publicVictoryPoints ?? 0} VP</span>
            <span className="status-pill">Karten: {props.selfPlayer?.resourceCount ?? 0}</span>
            <span className="status-pill">Entwicklung: {props.selfPlayer?.developmentCardCount ?? 0}</span>
            {props.match.allowedMoves.pendingDiscardCount > 0 ? (
              <span className="status-pill is-warning">Ablegen: {props.match.allowedMoves.pendingDiscardCount}</span>
            ) : null}
          </div>
        </section>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Letzte Aktionen</h3>
          </div>
          <div className="scroll-list event-list">
            {recentEvents.map((event) => (
              <article key={event.id} className="event-card">
                <strong>{renderEventLabel(event.type)}</strong>
                <span>Zug {event.atTurn}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    ),
    actions: (
      <div className="panel-frame actions-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Jetzt moeglich</h3>
            <span>{turnStatus.title}</span>
          </div>
          {renderQuickActions()}
        </section>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Bauen</h3>
            <span>Kosten und Voraussetzungen</span>
          </div>
          <div className="build-action-grid">
            {buildActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`build-action-card ${action.active ? "is-active" : ""}`}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                <span className="build-action-head">
                  <strong>{action.label}</strong>
                  <span>{action.costLabel}</span>
                </span>
                <span className="build-action-note">{action.note}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Entwicklungskarten</h3>
            <span>Spielbar: {props.match.allowedMoves.playableDevelopmentCards.length}</span>
          </div>
          <div className="mini-segmented">
            <button type="button" className={actionSection === "build" ? "is-active" : ""} onClick={() => setActionSection("build")}>
              Schnell
            </button>
            <button type="button" className={actionSection === "cards" ? "is-active" : ""} onClick={() => setActionSection("cards")}>
              Karten
            </button>
          </div>
          {actionSection === "build" ? (
            <div className="action-stack compact">
              <button
                type="button"
                className="secondary-button"
                disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("knight")}
                onClick={() =>
                  props.onAction({
                    type: "match.action",
                    matchId: props.match.matchId,
                    action: { type: "play_knight" }
                  })
                }
              >
                Ritter spielen
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("road_building")}
                onClick={() => {
                  props.setInteractionMode("road_building");
                  props.setSelectedRoadEdges([]);
                }}
              >
                Strassenbau
              </button>
            </div>
          ) : (
            <div className="action-stack compact">
              <div className="triple-select">
                <select
                  value={props.yearOfPlenty[0]}
                  onChange={(event) =>
                    props.setYearOfPlenty(([_, second]) => [event.target.value as Resource, second])
                  }
                >
                  {RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {renderResourceLabel(resource)}
                    </option>
                  ))}
                </select>
                <select
                  value={props.yearOfPlenty[1]}
                  onChange={(event) =>
                    props.setYearOfPlenty(([first]) => [first, event.target.value as Resource])
                  }
                >
                  {RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {renderResourceLabel(resource)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("year_of_plenty")}
                  onClick={() =>
                    props.onAction({
                      type: "match.action",
                      matchId: props.match.matchId,
                      action: {
                        type: "play_year_of_plenty",
                        resources: props.yearOfPlenty
                      }
                    })
                  }
                >
                  Erfindung
                </button>
              </div>
              <div className="triple-select">
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
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("monopoly")}
                  onClick={() =>
                    props.onAction({
                      type: "match.action",
                      matchId: props.match.matchId,
                      action: {
                        type: "play_monopoly",
                        resource: props.monopolyResource
                      }
                    })
                  }
                >
                  Monopol
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    ),
    hand: (
      <div className="panel-frame hand-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Rohstoffe</h3>
            <span>Geheime Handkarten bleiben lokal sichtbar.</span>
          </div>
          <div className="resource-grid">
            {RESOURCES.map((resource) => (
              <article key={resource} className="resource-card">
                <strong>{renderResourceLabel(resource)}</strong>
                <span>{props.selfPlayer?.resources?.[resource] ?? 0}</span>
              </article>
            ))}
          </div>
        </section>
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Entwicklung</h3>
            <span>{props.selfPlayer?.developmentCards?.length ?? 0} Karten</span>
          </div>
          <div className="scroll-list card-list">
            {props.selfPlayer?.developmentCards?.length ? (
              props.selfPlayer.developmentCards.map((card) => (
                <article key={card.id} className="mini-card">
                  <strong>{renderDevelopmentLabel(card.type)}</strong>
                  <span>{card.playable ? "Spielbar" : "Noch gesperrt"}</span>
                </article>
              ))
            ) : (
              <div className="empty-state">Keine Entwicklungskarten auf der Hand.</div>
            )}
          </div>
        </section>
      </div>
    ),
    trade: (
      <div className="panel-frame trade-frame">
        <section className="dock-section">
          <div className="dock-section-head">
            <h3>Handel</h3>
            <span>{tradeSection === "player" ? "Spieler" : "Hafen"}</span>
          </div>
          <div className="mini-segmented">
            <button type="button" className={tradeSection === "player" ? "is-active" : ""} onClick={() => setTradeSection("player")}>
              Spieler
            </button>
            <button type="button" className={tradeSection === "maritime" ? "is-active" : ""} onClick={() => setTradeSection("maritime")}>
              Hafen
            </button>
          </div>
          {tradeSection === "player" ? (
            <>
              {props.match.currentTrade ? (
                <TradeBanner currentUserId={props.match.you} match={props.match} onAction={props.onAction} />
              ) : null}
              <div className="trade-grid">
                <select
                  value={props.tradeForm.give}
                  onChange={(event) =>
                    props.setTradeForm((current) => ({ ...current, give: event.target.value as Resource }))
                  }
                >
                  {RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {renderResourceLabel(resource)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={props.tradeForm.giveCount}
                  onChange={(event) =>
                    props.setTradeForm((current) => ({
                      ...current,
                      giveCount: Number(event.target.value) || 1
                    }))
                  }
                />
                <select
                  value={props.tradeForm.want}
                  onChange={(event) =>
                    props.setTradeForm((current) => ({ ...current, want: event.target.value as Resource }))
                  }
                >
                  {RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {renderResourceLabel(resource)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={props.tradeForm.wantCount}
                  onChange={(event) =>
                    props.setTradeForm((current) => ({
                      ...current,
                      wantCount: Number(event.target.value) || 1
                    }))
                  }
                />
                <select
                  value={props.tradeForm.targetPlayerId}
                  onChange={(event) =>
                    props.setTradeForm((current) => ({ ...current, targetPlayerId: event.target.value }))
                  }
                >
                  <option value="">Offen fuer alle</option>
                  {tradeTargetPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.username}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!props.match.allowedMoves.canOfferTrade || !canSubmitTradeOffer}
                  onClick={props.onOfferTrade}
                >
                  Angebot senden
                </button>
              </div>
            </>
          ) : (
            <div className="trade-grid compact">
              <select
                value={props.maritimeForm.give}
                onChange={(event) =>
                  props.setMaritimeForm((current) => ({ ...current, give: event.target.value as Resource }))
                }
              >
                {RESOURCES.map((resource) => (
                  <option key={resource} value={resource}>
                    {renderResourceLabel(resource)}
                  </option>
                ))}
              </select>
              <select
                value={props.maritimeForm.receive}
                onChange={(event) =>
                  props.setMaritimeForm((current) => ({ ...current, receive: event.target.value as Resource }))
                }
              >
                {RESOURCES.map((resource) => (
                  <option key={resource} value={resource}>
                    {renderResourceLabel(resource)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-button"
                disabled={!isCurrentPlayer || props.match.phase !== "turn_action" || !canSubmitMaritimeTrade}
                onClick={() =>
                  props.onAction({
                    type: "match.action",
                    matchId: props.match.matchId,
                    action: {
                      type: "maritime_trade",
                      give: props.maritimeForm.give,
                      receive: props.maritimeForm.receive,
                      giveCount: maritimeRatio
                    }
                  })
                }
              >
                {maritimeRatio}:1 tauschen
              </button>
            </div>
          )}
        </section>
      </div>
    ),
    players: (
      <div className="panel-frame players-frame">
        <div className="scroll-list player-card-list">
          {props.match.players.map((player) => (
            <article key={player.id} className="player-card">
              <div className="player-card-head">
                <strong>{player.username}</strong>
                <span className={`seat-chip seat-${player.color}`}>{player.color}</span>
              </div>
              <div className="player-stat-grid">
                <InfoCard label="VP" value={String(player.publicVictoryPoints)} />
                <InfoCard label="Karten" value={String(player.resourceCount)} />
                <InfoCard label="Strassen" value={String(player.roadsBuilt)} />
                <InfoCard label="Ritter" value={String(player.playedKnightCount)} />
              </div>
              <div className="status-strip">
                {player.hasLongestRoad ? <span className="status-pill">Laengste Strasse</span> : null}
                {player.hasLargestArmy ? <span className="status-pill">Groesste Rittermacht</span> : null}
                {!player.hasLargestArmy && !player.hasLongestRoad ? (
                  <span className="status-pill muted">Keine Auszeichnung</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    )
  };

  return (
    <section className="screen-shell match-shell">
      <div className="match-screen">
        <div className="match-stage">
          <div className="board-topbar">
            <span className="board-chip">Zug {props.match.turn}</span>
            <span className="board-chip">{formatPhase(props.match.phase)}</span>
            <span className="board-chip">Aktiv: {activePlayer?.username ?? "-"}</span>
            <span className="board-chip">
              Wuerfel: {props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : "offen"}
            </span>
            <button
              type="button"
              className={`board-toggle ${autoFocusEnabled ? "is-active" : ""}`}
              onClick={() => setAutoFocusEnabled((current) => !current)}
            >
              {autoFocusEnabled ? "Auto-Fokus an" : "Auto-Fokus aus"}
            </button>
          </div>
          <div className="board-stage-frame">
            <BoardScene
              cameraCue={cameraCue}
              focusCue={highlightCue}
              interactionMode={props.interactionMode}
              onEdgeSelect={props.onEdgeSelect}
              onTileSelect={props.onTileSelect}
              onVertexSelect={props.onVertexSelect}
              selectedRoadEdges={props.selectedRoadEdges}
              snapshot={props.match}
            />
            <div className="board-hud">
              <div className="board-hud-panel">
                <div className="board-hud-row board-hud-resources">
                  {RESOURCES.map((resource) => (
                    <span key={resource} className="board-hud-pill">
                      <strong>{renderResourceLabel(resource)}</strong>
                      <span>{props.selfPlayer?.resources?.[resource] ?? 0}</span>
                    </span>
                  ))}
                </div>
                <div className="board-hud-row board-hud-stats">
                  <span className="board-hud-pill">
                    <strong>VP</strong>
                    <span>{props.selfPlayer?.publicVictoryPoints ?? 0}</span>
                  </span>
                  <span className="board-hud-pill">
                    <strong>Hand</strong>
                    <span>{props.selfPlayer?.resourceCount ?? 0}</span>
                  </span>
                  <span className="board-hud-pill">
                    <strong>Entwicklung</strong>
                    <span>{props.selfPlayer?.developmentCardCount ?? 0}</span>
                  </span>
                </div>
              </div>
            </div>
            {spotlightCue ? (
              <div className={`board-spotlight ${spotlightCue.mode === "event" ? "is-event" : "is-action"}`}>
                <span className="eyebrow">{spotlightCue.mode === "event" ? "Live-Geschehen" : "Deine Aktion"}</span>
                <strong>{spotlightCue.title}</strong>
                <span>{spotlightCue.detail}</span>
              </div>
            ) : null}
          </div>
          <div className="board-bottom-hint">
            <div className="turn-status-card">
              <strong>{turnStatus.title}</strong>
              <span>{turnStatus.detail}</span>
            </div>
          </div>
        </div>

        <aside className="surface match-dock">
          <div className="match-dock-head">
            <div>
              <div className="eyebrow">Partie</div>
              <h2>Kontrollzentrum</h2>
            </div>
          </div>
          {renderQuickActions()}
          <div className="tab-strip" role="tablist" aria-label="Match Navigation">
            {MATCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "is-active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="tab-panel-shell">{tabPanels[activeTab]}</div>
        </aside>

        <section className={`surface match-sheet is-${sheetState}`}>
          <div className="match-sheet-handle-row">
            <button type="button" className="sheet-size-button" onClick={() => setSheetState("peek")}>
              Kompakt
            </button>
            <button type="button" className="sheet-size-button" onClick={() => setSheetState("half")}>
              Fokus
            </button>
            <button type="button" className="sheet-size-button" onClick={() => setSheetState("full")}>
              Voll
            </button>
          </div>
          <div className="match-sheet-summary">
            <strong>{turnStatus.title}</strong>
            <span>{formatPhase(props.match.phase)}</span>
            <span>{turnStatus.detail}</span>
          </div>
          <div className="sheet-quick-actions">{renderQuickActions()}</div>
          <div className="tab-strip mobile" role="tablist" aria-label="Mobile Match Navigation">
            {MATCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "is-active" : ""}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (sheetState === "peek") {
                    setSheetState("half");
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {sheetState !== "peek" ? <div className="tab-panel-shell mobile">{tabPanels[activeTab]}</div> : null}
        </section>
      </div>
    </section>
  );
}

function TradeBanner(props: {
  match: MatchSnapshot;
  currentUserId: string;
  onAction: (message: ClientMessage) => void;
}) {
  const trade = props.match.currentTrade;
  if (!trade) {
    return null;
  }

  const responderVisible =
    props.currentUserId !== trade.fromPlayerId &&
    (!trade.targetPlayerId || trade.targetPlayerId === props.currentUserId);

  return (
    <div className="trade-banner">
      <div className="trade-banner-copy">
        <strong>Aktuelles Angebot</strong>
        <span>
          {renderResourceMap(trade.give)} gegen {renderResourceMap(trade.want)}
        </span>
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
                    type: "respond_trade",
                    tradeId: trade.id,
                    accept: true
                  }
                })
              }
            >
              Annehmen
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                props.onAction({
                  type: "match.action",
                  matchId: props.match.matchId,
                  action: {
                    type: "respond_trade",
                    tradeId: trade.id,
                    accept: false
                  }
                })
              }
            >
              Ablehnen
            </button>
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
                  type: "cancel_trade",
                  tradeId: trade.id
                }
              })
            }
          >
            Angebot beenden
          </button>
        ) : null}
      </div>
    </div>
  );
}

function InfoCard(props: { label: string; value: string }) {
  return (
    <article className="info-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function renderDevelopmentLabel(type: string): string {
  const labels: Record<string, string> = {
    knight: "Ritter",
    victory_point: "Siegpunkt",
    road_building: "Strassenbau",
    year_of_plenty: "Erfindung",
    monopoly: "Monopol"
  };

  return labels[type] ?? type;
}

function createBuildActionState(
  id: BuildActionId,
  label: string,
  props: {
    cost: Partial<Record<Resource, number>>;
    enabled: boolean;
    phase: MatchSnapshot["phase"];
    isCurrentPlayer: boolean;
    resources: Partial<Record<Resource, number>> | undefined;
    legalTargetCount?: number;
    interactionMode?: InteractionMode;
    activeMode?: InteractionMode;
    onClick: () => void;
  }
) {
  const resources = props.resources;
  const missing = getMissingCost(resources, props.cost);
  const enoughResources = missing.length === 0;
  const isBuildPhase = props.phase === "turn_action";
  const hasLegalTarget = props.legalTargetCount === undefined ? true : props.legalTargetCount > 0;
  const active = props.activeMode ? props.interactionMode === props.activeMode : false;

  let note = `Kosten: ${renderCostText(props.cost)}`;
  if (!props.isCurrentPlayer) {
    note = "Nicht dein Zug";
  } else if (!isBuildPhase) {
    note = props.phase === "turn_roll" ? "Erst wuerfeln" : "Gerade nicht verfuegbar";
  } else if (!enoughResources) {
    note = `Fehlt: ${renderMissingCost(missing)}`;
  } else if (!hasLegalTarget) {
    note = id === "development" ? "Zurzeit nicht verfuegbar" : "Kein gueltiger Bauplatz";
  } else if (active) {
    note = "Bauplatz auf dem Brett waehlen";
  }

  return {
    id,
    label,
    costLabel: renderCostText(props.cost),
    note,
    active,
    disabled: !props.enabled,
    onClick: props.onClick
  };
}

function createOwnActionCue(
  match: MatchSnapshot,
  activePlayer: MatchSnapshot["players"][number] | null,
  interactionMode: InteractionMode,
  selectedRoadEdges: string[]
): BoardFocusCue | null {
  if (match.currentPlayerId !== match.you) {
    return null;
  }

  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    const vertexId = match.allowedMoves.initialSettlementVertexIds[0];
    if (!vertexId) {
      return null;
    }

    return {
      key: `action-initial-settlement-${match.version}-${vertexId}`,
      mode: "action",
      title: "Setze deine Start-Siedlung",
      detail: "Der erste gueltige Bauplatz ist markiert. Du kannst die Kamera trotzdem frei bewegen.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    const edgeId = match.allowedMoves.initialRoadEdgeIds[0];
    if (!edgeId) {
      return null;
    }

    return {
      key: `action-initial-road-${match.version}-${edgeId}`,
      mode: "action",
      title: "Setze deine Start-Strasse",
      detail: "Die naechste erlaubte Kante ist hervorgehoben.",
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "road_building") {
    const edgeId = selectedRoadEdges[0] ?? match.allowedMoves.roadEdgeIds[0];
    if (!edgeId) {
      return null;
    }

    return {
      key: `action-road-building-${match.version}-${selectedRoadEdges.join(",")}-${edgeId}`,
      mode: "action",
      title: selectedRoadEdges.length === 0 ? "Waehle die erste freie Strasse" : "Waehle die zweite freie Strasse",
      detail: "Die markierte Kante zeigt dir den naechsten moeglichen Ausbau.",
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "road") {
    const edgeId = match.allowedMoves.roadEdgeIds[0];
    if (!edgeId) {
      return null;
    }

    return {
      key: `action-road-${match.version}-${edgeId}`,
      mode: "action",
      title: "Baue eine Strasse",
      detail: "Die naechste erlaubte Kante ist markiert.",
      vertexIds: [],
      edgeIds: [edgeId],
      tileIds: [],
      scale: "medium"
    };
  }

  if (interactionMode === "settlement") {
    const vertexId = match.allowedMoves.settlementVertexIds[0];
    if (!vertexId) {
      return null;
    }

    return {
      key: `action-settlement-${match.version}-${vertexId}`,
      mode: "action",
      title: "Baue eine Siedlung",
      detail: "Der markierte Knoten ist ein gueltiger Bauplatz.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "city") {
    const vertexId = match.allowedMoves.cityVertexIds[0];
    if (!vertexId) {
      return null;
    }

    return {
      key: `action-city-${match.version}-${vertexId}`,
      mode: "action",
      title: "Werte eine Siedlung zur Stadt auf",
      detail: "Der markierte Platz kann jetzt ausgebaut werden.",
      vertexIds: [vertexId],
      edgeIds: [],
      tileIds: [],
      scale: "tight"
    };
  }

  if (interactionMode === "robber" || match.phase === "robber_interrupt") {
    const tileId = match.allowedMoves.robberMoveOptions[0]?.tileId;
    if (!tileId) {
      return null;
    }

    return {
      key: `action-robber-${match.version}-${tileId}`,
      mode: "action",
      title: "Bewege den Raeuber",
      detail: "Das markierte Feld ist ein gueltiges Ziel fuer den Raeuber.",
      vertexIds: [],
      edgeIds: [],
      tileIds: [tileId],
      scale: "wide"
    };
  }

  if (match.phase === "setup_forward" || match.phase === "setup_reverse") {
    return {
      key: `action-setup-${match.version}-${activePlayer?.id ?? match.you}`,
      mode: "action",
      title: "Du bist im Startaufbau",
      detail: "Lege zuerst Siedlung und danach Strasse an eine markierte Stelle.",
      vertexIds: [],
      edgeIds: [],
      tileIds: [],
      scale: "wide"
    };
  }

  return null;
}

function getLatestFocusableEvent(match: MatchSnapshot): FocusableEventResult | null {
  for (let index = match.eventLog.length - 1; index >= 0; index -= 1) {
    const event = match.eventLog[index];
    if (!event) {
      continue;
    }

    const cue = createEventCue(match, event);
    if (cue) {
      return { cue, event };
    }
  }

  return null;
}

function createEventCue(
  match: MatchSnapshot,
  event: MatchSnapshot["eventLog"][number]
): BoardFocusCue | null {
  const actorName = getPlayerName(match, event.byPlayerId);

  switch (event.type) {
    case "initial_settlement_placed":
    case "settlement_built": {
      const vertexId = getPayloadString(event.payload, "vertexId");
      if (!vertexId) {
        return null;
      }

      return {
        key: `event-${event.id}-${vertexId}`,
        mode: "event",
        title: `${actorName} setzt eine Siedlung`,
        detail: "Die Kamera zeigt den gerade belegten Bauplatz.",
        vertexIds: [vertexId],
        edgeIds: [],
        tileIds: [],
        scale: "tight"
      };
    }
    case "city_built": {
      const vertexId = getPayloadString(event.payload, "vertexId");
      if (!vertexId) {
        return null;
      }

      return {
        key: `event-${event.id}-${vertexId}`,
        mode: "event",
        title: `${actorName} baut eine Stadt`,
        detail: "Der ausgebauten Stadtplatz wird hervorgehoben.",
        vertexIds: [vertexId],
        edgeIds: [],
        tileIds: [],
        scale: "tight"
      };
    }
    case "initial_road_placed":
    case "road_built": {
      const edgeId = getPayloadString(event.payload, "edgeId");
      if (!edgeId) {
        return null;
      }

      return {
        key: `event-${event.id}-${edgeId}`,
        mode: "event",
        title: `${actorName} baut eine Strasse`,
        detail: "Die neue Verbindung ist direkt im Brett markiert.",
        vertexIds: [],
        edgeIds: [edgeId],
        tileIds: [],
        scale: "medium"
      };
    }
    case "robber_moved": {
      const tileId = getPayloadString(event.payload, "tileId");
      if (!tileId) {
        return null;
      }

      return {
        key: `event-${event.id}-${tileId}`,
        mode: "event",
        title: `${actorName} bewegt den Raeuber`,
        detail: "Das neue Raeuberfeld ist hervorgehoben.",
        vertexIds: [],
        edgeIds: [],
        tileIds: [tileId],
        scale: "wide"
      };
    }
    case "development_card_played": {
      const cardType = getPayloadString(event.payload, "cardType");
      if (cardType === "road_building") {
        const edgeIds = getPayloadStringArray(event.payload, "edgeIds");
        if (!edgeIds.length) {
          return null;
        }

        return {
          key: `event-${event.id}-${edgeIds.join(",")}`,
          mode: "event",
          title: `${actorName} spielt Strassenbau`,
          detail: "Die kostenlosen Strassen werden im Brett markiert.",
          vertexIds: [],
          edgeIds,
          tileIds: [],
          scale: "medium"
        };
      }
      return null;
    }
    default:
      return null;
  }
}

function getPlayerName(match: MatchSnapshot, playerId?: string): string {
  if (!playerId) {
    return "Ein Spieler";
  }

  return match.players.find((player) => player.id === playerId)?.username ?? "Ein Spieler";
}

function getPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function getPayloadStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function getTurnStatus(
  match: MatchSnapshot,
  activePlayer: MatchSnapshot["players"][number] | null,
  selfPlayer: MatchSnapshot["players"][number] | null,
  interactionMode: InteractionMode,
  selectedRoadCount: number
): { title: string; detail: string } {
  const activePlayerName = activePlayer?.username ?? "Unbekannt";
  const isCurrentPlayer = match.currentPlayerId === match.you;
  const trade = match.currentTrade;

  if (match.winnerId) {
    const winner = match.players.find((player) => player.id === match.winnerId)?.username ?? "Unbekannt";
    return { title: `Partie beendet`, detail: `${winner} hat die Partie gewonnen.` };
  }

  if (trade) {
    const proposer = match.players.find((player) => player.id === trade.fromPlayerId)?.username ?? "Unbekannt";
    if (trade.fromPlayerId === match.you) {
      const target = trade.targetPlayerId
        ? match.players.find((player) => player.id === trade.targetPlayerId)?.username ?? "dem Zielspieler"
        : "einen Mitspieler";
      return {
        title: "Warte auf Handelsantwort",
        detail: trade.targetPlayerId ? `${target} entscheidet ueber dein Angebot.` : `Ein Mitspieler kann dein Angebot annehmen.`
      };
    }
    if (!trade.targetPlayerId || trade.targetPlayerId === match.you) {
      return {
        title: "Antwort von dir",
        detail: `${proposer} wartet auf deine Entscheidung zum Handel.`
      };
    }
    const target = match.players.find((player) => player.id === trade.targetPlayerId)?.username ?? activePlayerName;
    return {
      title: `Warte auf ${target}`,
      detail: `${proposer} hat ein Handelsangebot offen.`
    };
  }

  if (match.allowedMoves.pendingDiscardCount > 0) {
    return {
      title: "Aktion von dir",
      detail: `Lege ${match.allowedMoves.pendingDiscardCount} Karten ab, damit ${activePlayerName} weitermachen kann.`
    };
  }

  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    return isCurrentPlayer
      ? { title: "Aktion von dir", detail: "Setze jetzt deine Start-Siedlung." }
      : { title: `Warte auf ${activePlayerName}`, detail: `${activePlayerName} setzt eine Start-Siedlung.` };
  }

  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    return isCurrentPlayer
      ? { title: "Aktion von dir", detail: "Setze jetzt deine angrenzende Start-Strasse." }
      : { title: `Warte auf ${activePlayerName}`, detail: `${activePlayerName} setzt eine Start-Strasse.` };
  }

  if (match.phase === "robber_interrupt") {
    if (isCurrentPlayer && interactionMode === "robber") {
      return { title: "Aktion von dir", detail: "Waehle das Zielfeld fuer den Raeuber." };
    }
    return { title: `Warte auf ${activePlayerName}`, detail: `${activePlayerName} schliesst die Raeuberphase ab.` };
  }

  if (interactionMode === "road_building") {
    return {
      title: "Aktion von dir",
      detail: selectedRoadCount === 0 ? "Waehle die erste kostenlose Strasse." : "Waehle die zweite kostenlose Strasse."
    };
  }

  if (interactionMode === "road") {
    return { title: "Aktion von dir", detail: "Waehle eine gueltige Strassenkante." };
  }

  if (interactionMode === "settlement") {
    return { title: "Aktion von dir", detail: "Waehle einen gueltigen Platz fuer deine Siedlung." };
  }

  if (interactionMode === "city") {
    return { title: "Aktion von dir", detail: "Waehle eine eigene Siedlung fuer den Ausbau." };
  }

  if (match.allowedMoves.canRoll) {
    return isCurrentPlayer
      ? { title: "Aktion von dir", detail: "Du musst jetzt wuerfeln." }
      : { title: `Warte auf ${activePlayerName}`, detail: `${activePlayerName} startet den Zug mit dem Wurf.` };
  }

  if (isCurrentPlayer && match.phase === "turn_action") {
    return { title: "Aktion von dir", detail: "Baue, handle oder beende deinen Zug." };
  }

  if (match.phase === "turn_action") {
    return { title: `Warte auf ${activePlayerName}`, detail: `${activePlayerName} ist am Zug.` };
  }

  if (match.phase === "setup_forward" || match.phase === "setup_reverse") {
    return { title: `Warte auf ${activePlayerName}`, detail: `${activePlayerName} ist im Startaufbau.` };
  }

  if (selfPlayer && !isCurrentPlayer) {
    return { title: `Warte auf ${activePlayerName}`, detail: `${activePlayerName} fuehrt die naechste Aktion aus.` };
  }

  return { title: "Warte auf die naechste Aktion", detail: "Sobald ein legaler Schritt moeglich ist, wird er hier angezeigt." };
}

function renderCostText(cost: Partial<Record<Resource, number>>): string {
  return RESOURCES.flatMap((resource) =>
    cost[resource] ? `${cost[resource]} ${renderResourceLabel(resource)}` : []
  ).join(" · ");
}

function getMissingCost(resources: Partial<Record<Resource, number>> | undefined, cost: Partial<Record<Resource, number>>) {
  return RESOURCES.flatMap((resource) => {
    const required = cost[resource] ?? 0;
    const available = resources?.[resource] ?? 0;
    return required > available ? [{ resource, count: required - available }] : [];
  });
}

function renderMissingCost(missing: Array<{ resource: Resource; count: number }>): string {
  return missing.map((entry) => `${entry.count} ${renderResourceLabel(entry.resource)}`).join(" · ");
}

function canAffordOffer(resources: Partial<Record<Resource, number>> | undefined, resource: Resource, count: number): boolean {
  return (resources?.[resource] ?? 0) >= count;
}
