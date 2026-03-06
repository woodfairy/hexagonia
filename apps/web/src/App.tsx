import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AuthUser, ClientMessage, MatchSnapshot, Resource, ResourceMap, RoomDetails, ServerMessage } from "@hexagonia/shared";
import { createEmptyResourceMap } from "@hexagonia/shared";
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
import type { InteractionMode } from "./BoardScene";
import { AppHeader } from "./components/shell/AppHeader";
import { ToastStack, type ToastMessage } from "./components/shell/ToastStack";
import { AuthScreen } from "./components/screens/AuthScreen";
import { LobbyScreen } from "./components/screens/LobbyScreen";
import { MatchScreen, type MaritimeFormState, type TradeFormState } from "./components/screens/MatchScreen";
import { RoomScreen } from "./components/screens/RoomScreen";
import {
  type AuthMode,
  type ConnectionState,
  type RouteState,
  readRoute,
  renderEventLabel
} from "./ui";

const TEXT = {
  title: "Hexagonia",
  subtitle: "Serverautoritatives Echtzeit-Tabletop im Browser"
} as const;

export function App() {
  const [session, setSession] = useState<AuthUser | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [presence, setPresence] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("Verbindung wird initialisiert.");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    username: "",
    password: ""
  });
  const [joinCode, setJoinCode] = useState("");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const [selectedRoadEdges, setSelectedRoadEdges] = useState<string[]>([]);
  const [tradeForm, setTradeForm] = useState<TradeFormState>({
    give: "brick",
    giveCount: 1,
    want: "grain",
    wantCount: 1,
    targetPlayerId: ""
  });
  const [maritimeForm, setMaritimeForm] = useState<MaritimeFormState>({
    give: "brick",
    receive: "grain"
  });
  const [yearOfPlenty, setYearOfPlenty] = useState<[Resource, Resource]>(["brick", "grain"]);
  const [monopolyResource, setMonopolyResource] = useState<Resource>("ore");
  const [route, setRoute] = useState<RouteState>(readRoute());

  const wsRef = useRef<WebSocket | null>(null);
  const suppressCloseToastRef = useRef(false);
  const roomRef = useRef<RoomDetails | null>(null);
  const matchRef = useRef<MatchSnapshot | null>(null);
  const routeRef = useRef<RouteState>(route);

  const selfPlayer = useMemo(
    () => match?.players.find((player) => player.id === match.you) ?? null,
    [match]
  );

  const activeScreen = useMemo(() => {
    if (!session) {
      return "auth" as const;
    }
    if (route.kind === "match") {
      return "match" as const;
    }
    if (route.kind === "room") {
      return "room" as const;
    }
    return "lobby" as const;
  }, [route.kind, session]);

  const headerContext = useMemo(() => {
    if (!session) {
      return {
        eyebrow: "Premium Tabletop Plattform",
        title: TEXT.title,
        meta: TEXT.subtitle
      };
    }

    if (activeScreen === "lobby") {
      return {
        eyebrow: "Spielzentrale",
        title: `Willkommen, ${session.username}`,
        meta: "Private Raeume, Reconnect und Echtzeit-Partien"
      };
    }

    if (activeScreen === "room") {
      return {
        eyebrow: "Privater Raum",
        title: room ? `Code ${room.code}` : "Raum wird geladen",
        meta: room ? `${room.seats.filter((seat) => seat.userId).length}/4 Spieler im Raum` : "Synchronisation laeuft"
      };
    }

    return {
      eyebrow: "Laufende Partie",
      title: match ? `Zug ${match.turn}` : "Partie wird geladen",
      meta: match
        ? `Aktiver Spieler: ${match.players.find((player) => player.id === match.currentPlayerId)?.username ?? "-"}`
        : "Reconnect laeuft"
    };
  }, [activeScreen, match, room, session]);

  const removeToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const pushToast = useCallback(
    (tone: ToastMessage["tone"], title: string, body?: string) => {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const nextToast: ToastMessage = body ? { id, tone, title, body } : { id, tone, title };
      setToasts((current) => [...current, nextToast].slice(-4));
      window.setTimeout(() => {
        removeToast(id);
      }, tone === "error" ? 5400 : 3600);
    },
    [removeToast]
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
        setConnectionState("connecting");
        setStatus(`Willkommen zurueck, ${user.username}.`);
      })
      .catch(() => {
        setSession(null);
        setConnectionState("offline");
        setStatus("Bitte an- oder registrieren.");
      });
  }, []);

  useEffect(() => {
    if (!session) {
      suppressCloseToastRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionState("offline");
      return;
    }

    setConnectionState("connecting");
    suppressCloseToastRef.current = false;
    const socket = createWebSocket();
    wsRef.current = socket;

    socket.onopen = () => {
      setConnectionState("online");
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
        pushToast("error", "Aktion fehlgeschlagen", message.error);
      }
      if (message.type === "presence.state") {
        setPresence(message.onlineUserIds);
      }
      if (message.type === "match.event") {
        setStatus(renderEventLabel(message.event.type));
      }
    };

    socket.onclose = () => {
      setConnectionState("offline");
      setStatus("Realtime-Verbindung getrennt.");
      if (suppressCloseToastRef.current) {
        suppressCloseToastRef.current = false;
        return;
      }
      if (session) {
        pushToast("info", "Verbindung getrennt", "Hexagonia versucht beim naechsten Oeffnen automatisch zu verbinden.");
      }
    };

    return () => {
      suppressCloseToastRef.current = true;
      socket.close();
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
    };
  }, [pushToast, session]);

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
        .catch((routeError: Error) => {
          pushToast("error", "Raum konnte nicht geladen werden", routeError.message);
          navigateTo({ kind: "home" });
        });
    }

    if (route.kind === "match" && wsRef.current?.readyState === WebSocket.OPEN) {
      sendMessage(wsRef.current, {
        type: "match.reconnect",
        matchId: route.matchId
      });
    }
  }, [pushToast, route, session]);

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

  const subscribeRoom = useCallback((roomId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    sendMessage(wsRef.current, {
      type: "room.subscribe",
      roomId
    });
  }, []);

  const sendCurrent = useCallback(
    (message: ClientMessage) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        pushToast("error", "WebSocket nicht verbunden", "Die Realtime-Verbindung ist gerade nicht verfuegbar.");
        return;
      }
      sendMessage(wsRef.current, message);
    },
    [pushToast]
  );

  const navigateTo = useCallback((next: RouteState) => {
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
  }, []);

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();

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
      pushToast("success", "Willkommen", `${user.username} ist jetzt in Hexagonia angemeldet.`);
    } catch (authError) {
      pushToast("error", "Anmeldung fehlgeschlagen", (authError as Error).message);
    }
  };

  const handleCreateRoom = async () => {
    try {
      const nextRoom = await createRoom();
      setRoom(nextRoom);
      navigateTo({ kind: "room", roomId: nextRoom.id });
      subscribeRoom(nextRoom.id);
      pushToast("success", "Raum erstellt", `Code ${nextRoom.code} ist bereit.`);
    } catch (roomError) {
      pushToast("error", "Raum konnte nicht erstellt werden", (roomError as Error).message);
    }
  };

  const handleJoinByCode = async () => {
    try {
      const targetRoom = await getRoomByCode(joinCode);
      const joinedRoom = await joinRoom(targetRoom.id);
      setRoom(joinedRoom);
      navigateTo({ kind: "room", roomId: joinedRoom.id });
      subscribeRoom(joinedRoom.id);
      pushToast("success", "Raum beigetreten", `Du bist jetzt im Raum ${joinedRoom.code}.`);
    } catch (joinError) {
      pushToast("error", "Beitritt fehlgeschlagen", (joinError as Error).message);
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
      pushToast("error", "Platz konnte nicht belegt werden", (joinError as Error).message);
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
      pushToast("error", "Ready-Status fehlgeschlagen", (readyError as Error).message);
    }
  };

  const handleLeaveRoom = async () => {
    if (!room) {
      return;
    }

    try {
      await leaveRoom(room.id);
      setRoom(null);
      setMatch(null);
      setPresence([]);
      navigateTo({ kind: "home" });
      pushToast("info", "Raum verlassen", "Du bist zurueck in der Zentrale.");
    } catch (leaveError) {
      pushToast("error", "Raum konnte nicht verlassen werden", (leaveError as Error).message);
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
      pushToast("success", "Partie startet", "Die neue Runde wurde erfolgreich gestartet.");
    } catch (startError) {
      pushToast("error", "Start fehlgeschlagen", (startError as Error).message);
    }
  };

  const handleLogout = async () => {
    try {
      suppressCloseToastRef.current = true;
      await logout();
      setSession(null);
      setRoom(null);
      setMatch(null);
      setPresence([]);
      setJoinCode("");
      navigateTo({ kind: "home" });
      pushToast("info", "Abgemeldet", "Deine Sitzung wurde beendet.");
    } catch (logoutError) {
      pushToast("error", "Logout fehlgeschlagen", (logoutError as Error).message);
    }
  };

  const handleCopyRoomCode = async () => {
    if (!room?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(room.code);
      pushToast("success", "Raumcode kopiert", room.code);
    } catch {
      pushToast("error", "Kopieren fehlgeschlagen", "Der Raumcode konnte nicht in die Zwischenablage kopiert werden.");
    }
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

  const headerRoomProps =
    (activeScreen === "room" || activeScreen === "match") && room?.code
      ? {
          roomCode: room.code,
          onCopyRoomCode: handleCopyRoomCode
        }
      : {};

  return (
    <main className="app-shell">
      <AppHeader
        connectionState={connectionState}
        connectionStatusText={status}
        eyebrow={headerContext.eyebrow}
        meta={headerContext.meta}
        session={session}
        title={headerContext.title}
        onLogout={handleLogout}
        onNavigateHome={() => navigateTo({ kind: "home" })}
        {...headerRoomProps}
      />

      <div className="app-stage">
        {activeScreen === "auth" ? (
          <AuthScreen
            authForm={authForm}
            authMode={authMode}
            onAuthFieldChange={(field, value) => setAuthForm((current) => ({ ...current, [field]: value }))}
            onAuthModeChange={setAuthMode}
            onSubmit={handleAuthSubmit}
          />
        ) : null}

        {activeScreen === "lobby" && session ? (
          <LobbyScreen
            joinCode={joinCode}
            session={session}
            onCreateRoom={handleCreateRoom}
            onJoinByCode={handleJoinByCode}
            onJoinCodeChange={setJoinCode}
          />
        ) : null}

        {activeScreen === "room" && session ? (
          room ? (
            <RoomScreen
              presence={presence}
              room={room}
              session={session}
              onCopyCode={handleCopyRoomCode}
              onJoinSeat={handleSeatJoin}
              onLeave={handleLeaveRoom}
              onReady={handleReadyToggle}
              onStart={handleStartRoom}
            />
          ) : (
            <StatusSurface title="Raum wird geladen" text="Hexagonia verbindet den privaten Raum mit deiner Sitzung." />
          )
        ) : null}

        {activeScreen === "match" && session ? (
          match ? (
            <MatchScreen
              interactionMode={interactionMode}
              maritimeForm={maritimeForm}
              match={match}
              monopolyResource={monopolyResource}
              room={room}
              selfPlayer={selfPlayer}
              selectedRoadEdges={selectedRoadEdges}
              setInteractionMode={setInteractionMode}
              setMaritimeForm={setMaritimeForm}
              setMonopolyResource={setMonopolyResource}
              setSelectedRoadEdges={setSelectedRoadEdges}
              setTradeForm={setTradeForm}
              setYearOfPlenty={setYearOfPlenty}
              tradeForm={tradeForm}
              yearOfPlenty={yearOfPlenty}
              onAction={sendCurrent}
              onEdgeSelect={handleEdgeSelect}
              onOfferTrade={sendTradeOffer}
              onTileSelect={handleTileSelect}
              onVertexSelect={handleVertexSelect}
            />
          ) : (
            <StatusSurface title="Partie wird verbunden" text="Die Realtime-Partie wird wieder an dein Geraet angebunden." />
          )
        ) : null}
      </div>

      <ToastStack onDismiss={removeToast} toasts={toasts} />
    </main>
  );
}

function StatusSurface(props: { title: string; text: string }) {
  return (
    <section className="screen-shell status-shell">
      <article className="surface status-surface">
        <div className="eyebrow">Synchronisation</div>
        <h1>{props.title}</h1>
        <p className="hero-copy">{props.text}</p>
      </article>
    </section>
  );
}

function sendMessage(socket: WebSocket, message: ClientMessage) {
  socket.send(JSON.stringify(message));
}

function singleResourceMap(resource: Resource, count: number): ResourceMap {
  const map = createEmptyResourceMap();
  map[resource] = count;
  return map;
}
