import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ClientMessage, MatchSnapshot, Resource, RoomDetails } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";
import { BoardScene, type InteractionMode } from "../../BoardScene";
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

const MATCH_TABS: Array<{ id: MatchPanelTab; label: string }> = [
  { id: "overview", label: "Ueberblick" },
  { id: "actions", label: "Aktionen" },
  { id: "hand", label: "Hand" },
  { id: "trade", label: "Handel" },
  { id: "players", label: "Spieler" }
];

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

  const activePlayer = props.match.players.find((player) => player.id === props.match.currentPlayerId) ?? null;
  const recentEvents = useMemo(() => props.match.eventLog.slice(-5).reverse(), [props.match.eventLog]);
  const tradeTargetPlayers = props.match.players.filter((player) => player.id !== props.match.you);
  const maritimeRatio =
    props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === props.maritimeForm.give)?.ratio ?? 4;
  const interactionHint = getInteractionHint(props.match, props.interactionMode, props.selectedRoadEdges.length);

  const renderQuickActions = () => (
    <div className="quick-action-grid">
      <button
        type="button"
        className="primary-button"
        disabled={!props.match.allowedMoves.canRoll}
        onClick={() =>
          props.onAction({
            type: "match.action",
            matchId: props.match.matchId,
            action: { type: "roll_dice" }
          })
        }
      >
        Wuerfeln
      </button>
      <button
        type="button"
        className={props.interactionMode === "road" ? "secondary-button is-accent" : "secondary-button"}
        disabled={!props.match.allowedMoves.roadEdgeIds.length}
        onClick={() => props.setInteractionMode(props.interactionMode === "road" ? null : "road")}
      >
        Strasse
      </button>
      <button
        type="button"
        className={props.interactionMode === "settlement" ? "secondary-button is-accent" : "secondary-button"}
        disabled={!props.match.allowedMoves.settlementVertexIds.length}
        onClick={() => props.setInteractionMode(props.interactionMode === "settlement" ? null : "settlement")}
      >
        Siedlung
      </button>
      <button
        type="button"
        className={props.interactionMode === "city" ? "secondary-button is-accent" : "secondary-button"}
        disabled={!props.match.allowedMoves.cityVertexIds.length}
        onClick={() => props.setInteractionMode(props.interactionMode === "city" ? null : "city")}
      >
        Stadt
      </button>
      <button
        type="button"
        className="secondary-button"
        disabled={!props.match.allowedMoves.canBuyDevelopmentCard}
        onClick={() =>
          props.onAction({
            type: "match.action",
            matchId: props.match.matchId,
            action: { type: "buy_development_card" }
          })
        }
      >
        Entwicklung
      </button>
      <button
        type="button"
        className="primary-button"
        disabled={!props.match.allowedMoves.canEndTurn}
        onClick={() =>
          props.onAction({
            type: "match.action",
            matchId: props.match.matchId,
            action: { type: "end_turn" }
          })
        }
      >
        Zug beenden
      </button>
    </div>
  );

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
            <h3>Situationsbild</h3>
            <span>{interactionHint}</span>
          </div>
          <div className="status-strip">
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
            <h3>Schnellaktionen</h3>
            <span>{interactionHint}</span>
          </div>
          {renderQuickActions()}
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
                  disabled={!props.match.allowedMoves.canOfferTrade}
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
          </div>
          <div className="board-stage-frame">
            <BoardScene
              interactionMode={props.interactionMode}
              onEdgeSelect={props.onEdgeSelect}
              onTileSelect={props.onTileSelect}
              onVertexSelect={props.onVertexSelect}
              selectedRoadEdges={props.selectedRoadEdges}
              snapshot={props.match}
            />
          </div>
          <div className="board-bottom-hint">{interactionHint}</div>
        </div>

        <aside className="surface match-dock">
          <div className="match-dock-head">
            <div>
              <div className="eyebrow">Partie</div>
              <h2>Kontrollzentrum</h2>
            </div>
            <div className="dock-caption">Code {props.room?.code ?? "----"}</div>
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
            <strong>{activePlayer?.username ?? "-"}</strong>
            <span>{formatPhase(props.match.phase)}</span>
            <span>{interactionHint}</span>
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

function getInteractionHint(match: MatchSnapshot, interactionMode: InteractionMode, selectedRoadCount: number): string {
  if (match.allowedMoves.pendingDiscardCount > 0) {
    return `Du musst ${match.allowedMoves.pendingDiscardCount} Karten ablegen.`;
  }
  if (match.allowedMoves.initialSettlementVertexIds.length > 0) {
    return "Waehle eine Start-Siedlung auf dem Brett.";
  }
  if (match.allowedMoves.initialRoadEdgeIds.length > 0) {
    return "Waehle eine angrenzende Start-Strasse.";
  }
  if (interactionMode === "robber") {
    return "Waehle ein Zielfeld fuer den Raeuber.";
  }
  if (interactionMode === "road_building") {
    return selectedRoadCount === 0
      ? "Waehle die erste kostenlose Strasse."
      : "Waehle die zweite kostenlose Strasse.";
  }
  if (interactionMode === "road") {
    return "Waehle eine legale Strassenkante.";
  }
  if (interactionMode === "settlement") {
    return "Waehle einen legalen Siedlungsplatz.";
  }
  if (interactionMode === "city") {
    return "Waehle eine eigene Siedlung fuer den Ausbau.";
  }
  if (match.allowedMoves.canRoll) {
    return "Der naechste Schritt ist Wuerfeln.";
  }
  if (match.allowedMoves.canEndTurn) {
    return "Du kannst handeln, bauen oder den Zug beenden.";
  }
  return "Warte auf die naechste legale Aktion.";
}
