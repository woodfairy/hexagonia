import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type {
  AuthUser,
  ClientMessage,
  MatchSnapshot,
  Resource,
  ResourceMap,
  RoomDetails,
  ServerMessage
} from "@hexagonia/shared";
import { RESOURCES, createEmptyResourceMap } from "@hexagonia/shared";
import {
  createRoom,
  createWebSocket,
  getCurrentUser,
  getRoom,
  getRoomByCode,
  joinRoom,
  leaveRoom,
  login,
  logout,
  register,
  setReady,
  startRoom
} from "./api";
import { BoardScene, type InteractionMode } from "./BoardScene";

type AuthMode = "login" | "register";
type RouteState =
  | { kind: "home" }
  | { kind: "room"; roomId: string }
  | { kind: "match"; matchId: string };

const TEXT = {
  title: "Hexagonia",
  subtitle: "Serverautoritatives Echtzeit-Tabletop im Browser",
  login: "Anmelden",
  register: "Registrieren",
  createRoom: "Privaten Raum erstellen",
  joinByCode: "Per Code beitreten",
  startMatch: "Partie starten",
  ready: "Bereit",
  notReady: "Nicht bereit",
  leaveRoom: "Raum verlassen",
  logout: "Abmelden"
} as const;

export function App() {
  const [session, setSession] = useState<AuthUser | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [presence, setPresence] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Verbindung wird initialisiert.");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    username: "",
    password: ""
  });
  const [joinCode, setJoinCode] = useState("");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const [selectedRoadEdges, setSelectedRoadEdges] = useState<string[]>([]);
  const [tradeForm, setTradeForm] = useState({
    give: "brick" as Resource,
    giveCount: 1,
    want: "grain" as Resource,
    wantCount: 1,
    targetPlayerId: ""
  });
  const [maritimeForm, setMaritimeForm] = useState({
    give: "brick" as Resource,
    receive: "grain" as Resource
  });
  const [yearOfPlenty, setYearOfPlenty] = useState<[Resource, Resource]>(["brick", "grain"]);
  const [monopolyResource, setMonopolyResource] = useState<Resource>("ore");
  const [route, setRoute] = useState<RouteState>(readRoute());
  const wsRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<RoomDetails | null>(null);
  const matchRef = useRef<MatchSnapshot | null>(null);
  const routeRef = useRef<RouteState>(route);

  const selfPlayer = useMemo(
    () => match?.players.find((player) => player.id === match.you) ?? null,
    [match]
  );

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    void getCurrentUser()
      .then((user) => {
        setSession(user);
        setStatus(`Willkommen zurück, ${user.username}.`);
      })
      .catch(() => {
        setSession(null);
        setStatus("Bitte an- oder registrieren.");
      });
  }, []);

  useEffect(() => {
    if (!session) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const socket = createWebSocket();
    wsRef.current = socket;

    socket.onopen = () => {
      setStatus("Realtime-Verbindung aktiv.");
      if (roomRef.current) {
        sendMessage(socket, {
          type: "room.subscribe",
          roomId: roomRef.current.id
        });
      }

      if (matchRef.current) {
        sendMessage(socket, {
          type: "match.reconnect",
          matchId: matchRef.current.matchId
        });
      } else if (routeRef.current.kind === "match") {
        sendMessage(socket, {
          type: "match.reconnect",
          matchId: routeRef.current.matchId
        });
      }
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "room.state") {
        setRoom(message.room);
        if (message.room.matchId) {
          navigateTo({ kind: "match", matchId: message.room.matchId });
        }
      }
      if (message.type === "match.snapshot") {
        setMatch(message.snapshot);
        if (!roomRef.current || roomRef.current.id !== message.snapshot.roomId) {
          void getRoom(message.snapshot.roomId).then(setRoom).catch(() => undefined);
        }
      }
      if (message.type === "match.error") {
        setError(message.error);
      }
      if (message.type === "presence.state") {
        setPresence(message.onlineUserIds);
      }
      if (message.type === "match.event") {
        setStatus(renderEvent(message.event.type));
      }
    };

    socket.onclose = () => {
      setStatus("Realtime-Verbindung getrennt.");
    };

    return () => {
      socket.close();
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
    };
  }, [session?.id]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (route.kind === "room") {
      void getRoom(route.roomId)
        .then((nextRoom) => {
          setRoom(nextRoom);
          subscribeRoom(nextRoom.id);
        })
        .catch((routeError: Error) => setError(routeError.message));
    }

    if (route.kind === "match" && wsRef.current?.readyState === WebSocket.OPEN) {
      sendMessage(wsRef.current, {
        type: "match.reconnect",
        matchId: route.matchId
      });
    }
  }, [route, session?.id]);

  useEffect(() => {
    if (!match) {
      setInteractionMode(null);
      setSelectedRoadEdges([]);
      return;
    }

    if (match.allowedMoves.robberMoveOptions.length > 0) {
      setInteractionMode("robber");
      return;
    }

    if (!match.allowedMoves.roadEdgeIds.length && interactionMode === "road_building") {
      setInteractionMode(null);
      setSelectedRoadEdges([]);
    }
  }, [interactionMode, match]);

  function subscribeRoom(roomId: string) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    sendMessage(wsRef.current, {
      type: "room.subscribe",
      roomId
    });
  }

  function sendCurrent(message: ClientMessage) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("WebSocket noch nicht verbunden.");
      return;
    }
    sendMessage(wsRef.current, message);
  }

  function navigateTo(next: RouteState) {
    setRoute(next);
    if (next.kind === "home") {
      window.location.hash = "";
    }
    if (next.kind === "room") {
      window.location.hash = `room/${next.roomId}`;
    }
    if (next.kind === "match") {
      window.location.hash = `match/${next.matchId}`;
    }
  }

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const user =
        authMode === "login"
          ? await login({
              email: authForm.email,
              password: authForm.password
            })
          : await register({
              email: authForm.email,
              username: authForm.username,
              password: authForm.password
            });

      setSession(user);
      setAuthForm({ email: "", username: "", password: "" });
      setStatus(`${user.username} ist angemeldet.`);
    } catch (authError) {
      setError((authError as Error).message);
    }
  };

  const handleCreateRoom = async () => {
    setError(null);
    try {
      const nextRoom = await createRoom();
      setRoom(nextRoom);
      navigateTo({ kind: "room", roomId: nextRoom.id });
      subscribeRoom(nextRoom.id);
    } catch (roomError) {
      setError((roomError as Error).message);
    }
  };

  const handleJoinByCode = async () => {
    setError(null);
    try {
      const targetRoom = await getRoomByCode(joinCode);
      const joinedRoom = await joinRoom(targetRoom.id);
      setRoom(joinedRoom);
      navigateTo({ kind: "room", roomId: joinedRoom.id });
      subscribeRoom(joinedRoom.id);
    } catch (joinError) {
      setError((joinError as Error).message);
    }
  };

  const handleSeatJoin = async (seatIndex: number) => {
    if (!room) {
      return;
    }

    try {
      const nextRoom = await joinRoom(room.id, seatIndex);
      setRoom(nextRoom);
    } catch (joinError) {
      setError((joinError as Error).message);
    }
  };

  const handleReadyToggle = async (ready: boolean) => {
    if (!room) {
      return;
    }

    try {
      const nextRoom = await setReady(room.id, ready);
      setRoom(nextRoom);
    } catch (readyError) {
      setError((readyError as Error).message);
    }
  };

  const handleLeaveRoom = async () => {
    if (!room) {
      return;
    }

    try {
      const nextRoom = await leaveRoom(room.id);
      setRoom(nextRoom.status === "closed" ? null : nextRoom);
      setMatch(null);
      navigateTo({ kind: "home" });
    } catch (leaveError) {
      setError((leaveError as Error).message);
    }
  };

  const handleStartRoom = async () => {
    if (!room) {
      return;
    }

    try {
      const result = await startRoom(room.id);
      setRoom(result.room);
      navigateTo({ kind: "match", matchId: result.matchId });
      sendCurrent({
        type: "match.reconnect",
        matchId: result.matchId
      });
    } catch (startError) {
      setError((startError as Error).message);
    }
  };

  const handleLogout = async () => {
    await logout();
    setSession(null);
    setRoom(null);
    setMatch(null);
    setPresence([]);
    navigateTo({ kind: "home" });
  };

  const handleVertexSelect = (vertexId: string) => {
    if (!match) {
      return;
    }

    if (match.allowedMoves.initialSettlementVertexIds.includes(vertexId)) {
      sendCurrent({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "place_initial_settlement",
          vertexId
        }
      });
      return;
    }

    if (interactionMode === "settlement" && match.allowedMoves.settlementVertexIds.includes(vertexId)) {
      sendCurrent({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "build_settlement",
          vertexId
        }
      });
      setInteractionMode(null);
    }

    if (interactionMode === "city" && match.allowedMoves.cityVertexIds.includes(vertexId)) {
      sendCurrent({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "build_city",
          vertexId
        }
      });
      setInteractionMode(null);
    }
  };

  const handleEdgeSelect = (edgeId: string) => {
    if (!match) {
      return;
    }

    if (match.allowedMoves.initialRoadEdgeIds.includes(edgeId)) {
      sendCurrent({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "place_initial_road",
          edgeId
        }
      });
      return;
    }

    if (interactionMode === "road" && match.allowedMoves.roadEdgeIds.includes(edgeId)) {
      sendCurrent({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "build_road",
          edgeId
        }
      });
      setInteractionMode(null);
    }

    if (interactionMode === "road_building" && match.allowedMoves.roadEdgeIds.includes(edgeId)) {
      setSelectedRoadEdges((current) => {
        if (current.includes(edgeId)) {
          return current.filter((entry) => entry !== edgeId);
        }

        const next = [...current, edgeId].slice(0, 2);
        if (next.length === 2) {
          sendCurrent({
            type: "match.action",
            matchId: match.matchId,
            action: {
              type: "play_road_building",
              edgeIds: next
            }
          });
          setInteractionMode(null);
          return [];
        }

        return next;
      });
    }
  };

  const handleTileSelect = (tileId: string) => {
    if (!match || interactionMode !== "robber") {
      return;
    }

    const option = match.allowedMoves.robberMoveOptions.find((entry) => entry.tileId === tileId);
    const action: Extract<ClientMessage, { type: "match.action" }>["action"] = {
      type: "move_robber",
      tileId
    };
    if (option?.targetPlayerIds[0]) {
      action.targetPlayerId = option.targetPlayerIds[0];
    }
    sendCurrent({
      type: "match.action",
      matchId: match.matchId,
      action
    });
    setInteractionMode(null);
  };

  const sendTradeOffer = () => {
    if (!match) {
      return;
    }

    sendCurrent({
      type: "match.action",
      matchId: match.matchId,
      action: {
        type: "offer_trade",
        targetPlayerId: tradeForm.targetPlayerId || null,
        give: singleResourceMap(tradeForm.give, tradeForm.giveCount),
        want: singleResourceMap(tradeForm.want, tradeForm.wantCount)
      }
    });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-mark">HX</div>
          <div>
            <strong>{TEXT.title}</strong>
            <span>{status}</span>
          </div>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
      </header>

      {!session ? (
        <section className="panel auth-panel">
          <div className="eyebrow">Realtime Browser Strategy</div>
          <h1>{TEXT.title}</h1>
          <p className="lede">{TEXT.subtitle}</p>
          <div className="toggle-row">
            <button className={authMode === "login" ? "is-active" : ""} onClick={() => setAuthMode("login")}>
              {TEXT.login}
            </button>
            <button className={authMode === "register" ? "is-active" : ""} onClick={() => setAuthMode("register")}>
              {TEXT.register}
            </button>
          </div>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              E-Mail
              <input
                autoComplete="email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            {authMode === "register" ? (
              <label>
                Nutzername
                <input
                  autoComplete="username"
                  type="text"
                  value={authForm.username}
                  onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                />
              </label>
            ) : null}
            <label>
              Passwort
              <input
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <button className="primary" type="submit">
              {authMode === "login" ? TEXT.login : TEXT.register}
            </button>
          </form>
        </section>
      ) : null}

      {session && !room && !match ? (
        <section className="panel lobby-panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">Willkommen</div>
              <h2>{session.username}</h2>
            </div>
            <button onClick={handleLogout}>{TEXT.logout}</button>
          </div>
          <div className="action-grid">
            <button className="primary action-card" onClick={handleCreateRoom}>
              <strong>{TEXT.createRoom}</strong>
              <span>Legt einen 4er-Raum an und setzt dich auf Platz 1.</span>
            </button>
            <div className="action-card join-card">
              <strong>{TEXT.joinByCode}</strong>
              <div className="inline-input">
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} />
                <button className="primary" onClick={handleJoinByCode}>
                  Beitreten
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {session && room && !match ? (
        <RoomPanel
          onJoinSeat={handleSeatJoin}
          onLeave={handleLeaveRoom}
          onReady={handleReadyToggle}
          onStart={handleStartRoom}
          presence={presence}
          room={room}
          session={session}
        />
      ) : null}

      {session && match ? (
        <section className="match-layout">
          <BoardScene
            interactionMode={interactionMode}
            onEdgeSelect={handleEdgeSelect}
            onTileSelect={handleTileSelect}
            onVertexSelect={handleVertexSelect}
            selectedRoadEdges={selectedRoadEdges}
            snapshot={match}
          />
          <MatchSidebar
            interactionMode={interactionMode}
            maritimeForm={maritimeForm}
            match={match}
            monopolyResource={monopolyResource}
            onAction={sendCurrent}
            onOfferTrade={sendTradeOffer}
            selectedRoadEdges={selectedRoadEdges}
            selfPlayer={selfPlayer}
            setInteractionMode={setInteractionMode}
            setMaritimeForm={setMaritimeForm}
            setMonopolyResource={setMonopolyResource}
            setSelectedRoadEdges={setSelectedRoadEdges}
            setTradeForm={setTradeForm}
            setYearOfPlenty={setYearOfPlenty}
            tradeForm={tradeForm}
            yearOfPlenty={yearOfPlenty}
          />
        </section>
      ) : null}
    </main>
  );
}

function RoomPanel(props: {
  room: RoomDetails;
  session: AuthUser;
  presence: string[];
  onJoinSeat: (seatIndex: number) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const currentSeat = props.room.seats.find((seat) => seat.userId === props.session.id) ?? null;
  const canStart =
    props.room.ownerUserId === props.session.id &&
    props.room.seats.filter((seat) => seat.userId).length >= 3 &&
    props.room.seats.filter((seat) => seat.userId).every((seat) => seat.ready);

  return (
    <section className="panel room-panel">
      <div className="section-head">
        <div>
          <div className="eyebrow">Privater Raum</div>
          <h2>Code {props.room.code}</h2>
        </div>
        <div className="room-actions">
          {currentSeat ? (
            <button className={currentSeat.ready ? "primary" : ""} onClick={() => props.onReady(!currentSeat.ready)}>
              {currentSeat.ready ? TEXT.notReady : TEXT.ready}
            </button>
          ) : null}
          {canStart ? (
            <button className="primary" onClick={props.onStart}>
              {TEXT.startMatch}
            </button>
          ) : null}
          <button onClick={props.onLeave}>{TEXT.leaveRoom}</button>
        </div>
      </div>
      <div className="seat-grid">
        {props.room.seats.map((seat) => {
          const online = seat.userId ? props.presence.includes(seat.userId) : false;
          return (
            <article className="seat-card" key={seat.index}>
              <div className={`seat-chip seat-${seat.color}`}>Platz {seat.index + 1}</div>
              <strong>{seat.username ?? "Frei"}</strong>
              <span>{seat.ready ? "Bereit" : seat.userId ? "Wartet" : "Offen"}</span>
              {seat.userId ? <span>{online ? "Online" : "Offline"}</span> : null}
              {!seat.userId && props.room.status === "open" ? (
                <button className="primary" onClick={() => props.onJoinSeat(seat.index)}>
                  Platz nehmen
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MatchSidebar(props: {
  match: MatchSnapshot;
  selfPlayer: MatchSnapshot["players"][number] | null;
  interactionMode: InteractionMode;
  selectedRoadEdges: string[];
  tradeForm: {
    give: Resource;
    giveCount: number;
    want: Resource;
    wantCount: number;
    targetPlayerId: string;
  };
  maritimeForm: {
    give: Resource;
    receive: Resource;
  };
  yearOfPlenty: [Resource, Resource];
  monopolyResource: Resource;
  setInteractionMode: (mode: InteractionMode) => void;
  setSelectedRoadEdges: Dispatch<SetStateAction<string[]>>;
  setTradeForm: Dispatch<
    SetStateAction<{
      give: Resource;
      giveCount: number;
      want: Resource;
      wantCount: number;
      targetPlayerId: string;
    }>
  >;
  setMaritimeForm: Dispatch<
    SetStateAction<{
      give: Resource;
      receive: Resource;
    }>
  >;
  setYearOfPlenty: Dispatch<SetStateAction<[Resource, Resource]>>;
  setMonopolyResource: Dispatch<SetStateAction<Resource>>;
  onAction: (message: ClientMessage) => void;
  onOfferTrade: () => void;
}) {
  const tradeTargetPlayers = props.match.players.filter((player) => player.id !== props.match.you);
  const maritimeRatio =
    props.match.allowedMoves.maritimeRates.find((rate) => rate.resource === props.maritimeForm.give)?.ratio ?? 4;

  return (
    <aside className="sidebar">
      <section className="panel slim-panel">
        <div className="eyebrow">Partie</div>
        <h3>Zug {props.match.turn}</h3>
        <p>Phase: {props.match.phase}</p>
        <p>Aktiver Spieler: {props.match.players.find((player) => player.id === props.match.currentPlayerId)?.username}</p>
        <p>Würfel: {props.match.dice ? `${props.match.dice[0]} + ${props.match.dice[1]}` : "Noch nicht geworfen"}</p>
      </section>
      <section className="panel slim-panel">
        <div className="eyebrow">Spieler</div>
        <div className="player-list">
          {props.match.players.map((player) => (
            <article className="player-row" key={player.id}>
              <strong>{player.username}</strong>
              <span>{player.publicVictoryPoints} VP</span>
              <span>{player.resourceCount} Karten</span>
            </article>
          ))}
        </div>
      </section>
      <section className="panel slim-panel">
        <div className="eyebrow">Hand</div>
        <div className="resource-row">
          {RESOURCES.map((resource) => (
            <span key={resource} className="resource-pill">
              {resource}: {props.selfPlayer?.resources?.[resource] ?? 0}
            </span>
          ))}
        </div>
      </section>
      <section className="panel slim-panel">
        <div className="eyebrow">Aktionen</div>
        <div className="button-grid">
          <button
            className="primary"
            disabled={!props.match.allowedMoves.canRoll}
            onClick={() =>
              props.onAction({
                type: "match.action",
                matchId: props.match.matchId,
                action: { type: "roll_dice" }
              })
            }
          >
            Würfeln
          </button>
          <button onClick={() => props.setInteractionMode("road")} disabled={!props.match.allowedMoves.roadEdgeIds.length}>
            Straße
          </button>
          <button onClick={() => props.setInteractionMode("settlement")} disabled={!props.match.allowedMoves.settlementVertexIds.length}>
            Siedlung
          </button>
          <button onClick={() => props.setInteractionMode("city")} disabled={!props.match.allowedMoves.cityVertexIds.length}>
            Stadt
          </button>
          <button
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
            className="primary"
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
      </section>
      <section className="panel slim-panel">
        <div className="eyebrow">Entwicklungskarten</div>
        <div className="button-grid">
          <button
            disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("knight")}
            onClick={() =>
              props.onAction({
                type: "match.action",
                matchId: props.match.matchId,
                action: { type: "play_knight" }
              })
            }
          >
            Ritter
          </button>
          <button
            disabled={!props.match.allowedMoves.playableDevelopmentCards.includes("road_building")}
            onClick={() => {
              props.setInteractionMode("road_building");
              props.setSelectedRoadEdges([]);
            }}
          >
            Straßenbau
          </button>
          <button
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
          <button
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
        <div className="inline-select-row">
          <select
            value={props.yearOfPlenty[0]}
            onChange={(event) => props.setYearOfPlenty(([_, second]) => [event.target.value as Resource, second])}
          >
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <select
            value={props.yearOfPlenty[1]}
            onChange={(event) => props.setYearOfPlenty(([first]) => [first, event.target.value as Resource])}
          >
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <select value={props.monopolyResource} onChange={(event) => props.setMonopolyResource(event.target.value as Resource)}>
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="panel slim-panel">
        <div className="eyebrow">Spielerhandel</div>
        <div className="trade-grid">
          <select value={props.tradeForm.give} onChange={(event) => props.setTradeForm((current) => ({ ...current, give: event.target.value as Resource }))}>
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <input type="number" min={1} value={props.tradeForm.giveCount} onChange={(event) => props.setTradeForm((current) => ({ ...current, giveCount: Number(event.target.value) || 1 }))} />
          <select value={props.tradeForm.want} onChange={(event) => props.setTradeForm((current) => ({ ...current, want: event.target.value as Resource }))}>
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <input type="number" min={1} value={props.tradeForm.wantCount} onChange={(event) => props.setTradeForm((current) => ({ ...current, wantCount: Number(event.target.value) || 1 }))} />
          <select value={props.tradeForm.targetPlayerId} onChange={(event) => props.setTradeForm((current) => ({ ...current, targetPlayerId: event.target.value }))}>
            <option value="">Offen</option>
            {tradeTargetPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.username}
              </option>
            ))}
          </select>
          <button onClick={props.onOfferTrade} disabled={!props.match.allowedMoves.canOfferTrade}>
            Anbieten
          </button>
        </div>
        {props.match.currentTrade ? <TradeBanner currentUserId={props.match.you} match={props.match} onAction={props.onAction} /> : null}
      </section>
      <section className="panel slim-panel">
        <div className="eyebrow">Hafenhandel</div>
        <div className="trade-grid">
          <select value={props.maritimeForm.give} onChange={(event) => props.setMaritimeForm((current) => ({ ...current, give: event.target.value as Resource }))}>
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <span>{maritimeRatio}:1</span>
          <select value={props.maritimeForm.receive} onChange={(event) => props.setMaritimeForm((current) => ({ ...current, receive: event.target.value as Resource }))}>
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <button
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
            Tauschen
          </button>
        </div>
      </section>
    </aside>
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
    <div className="selection-banner">
      <span>
        Handel: {renderResourceMap(trade.give)} gegen {renderResourceMap(trade.want)}
      </span>
      {responderVisible ? (
        <>
          <button
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
          Abbrechen
        </button>
      ) : null}
    </div>
  );
}

function sendMessage(socket: WebSocket, message: ClientMessage) {
  socket.send(JSON.stringify(message));
}

function renderEvent(type: string): string {
  const labels: Record<string, string> = {
    match_started: "Partie gestartet.",
    initial_settlement_placed: "Start-Siedlung gesetzt.",
    initial_road_placed: "Start-Straße gesetzt.",
    dice_rolled: "Würfel geworfen.",
    road_built: "Straße gebaut.",
    settlement_built: "Siedlung gebaut.",
    city_built: "Stadt gebaut.",
    robber_moved: "Räuber versetzt.",
    trade_completed: "Handel abgeschlossen.",
    turn_ended: "Zug beendet."
  };
  return labels[type] ?? "Spielstatus aktualisiert.";
}

function singleResourceMap(resource: Resource, count: number): ResourceMap {
  const map = createEmptyResourceMap();
  map[resource] = count;
  return map;
}

function renderResourceMap(resourceMap: ResourceMap): string {
  return RESOURCES.map((resource) => [resource, resourceMap[resource]] as const)
    .filter(([, count]) => count > 0)
    .map(([resource, count]) => `${count} ${resource}`)
    .join(", ");
}

function readRoute(): RouteState {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    return { kind: "home" };
  }

  const [kind, id] = hash.split("/");
  if (kind === "room" && id) {
    return { kind: "room", roomId: id };
  }
  if (kind === "match" && id) {
    return { kind: "match", matchId: id };
  }
  return { kind: "home" };
}
