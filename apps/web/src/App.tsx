import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  AdminMatchSummary,
  AdminUserRecord,
  AuthUser,
  ClientMessage,
  MatchSnapshot,
  Resource,
  ResourceMap,
  RoomDetails,
  ServerMessage,
  UserRole
} from "@hexagonia/shared";
import { createEmptyResourceMap, hasResources } from "@hexagonia/shared";
import {
  closeAdminRoom,
  createRoom,
  createAdminUser,
  createWebSocket,
  deleteAdminMatch,
  deleteAdminUser,
  getAdminMatches,
  getAdminRooms,
  getAdminUsers,
  getCurrentUser,
  getMyRooms,
  getRoom,
  getRoomByCode,
  joinRoom,
  kickRoomUser,
  leaveRoom,
  login,
  logout,
  register,
  setReady,
  startRoom,
  updateAdminUser
} from "./api";
import type { InteractionMode } from "./BoardScene";
import { AppHeader } from "./components/shell/AppHeader";
import { ToastStack, type ToastMessage } from "./components/shell/ToastStack";
import { AdminScreen, type AdminCreateFormState, type AdminUserDraftState } from "./components/screens/AdminScreen";
import { AuthScreen } from "./components/screens/AuthScreen";
import { LobbyScreen } from "./components/screens/LobbyScreen";
import { MatchScreen, type MaritimeFormState, type TradeFormState } from "./components/screens/MatchScreen";
import { RoomScreen } from "./components/screens/RoomScreen";
import {
  type AuthMode,
  type ConnectionState,
  type RouteState,
  readRoute,
  renderResourceLabel,
  renderResourceMap
} from "./ui";

const TEXT = {
  title: "Hexagonia",
  subtitle: "Privat spielen, einladen und direkt loslegen"
} as const;

const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 40000;
const RECONNECT_BASE_MS = 1200;
const RECONNECT_MAX_MS = 12000;
const DISCONNECT_TOAST_COOLDOWN_MS = 30000;
const BUILD_COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { grain: 2, ore: 3 }
} as const;

type MatchAction = Extract<ClientMessage, { type: "match.action" }>["action"];

interface PendingMatchConfirmation {
  title: string;
  detail: string;
  confirmLabel: string;
  message: Extract<ClientMessage, { type: "match.action" }>;
  afterConfirm?: () => void;
}

export function App() {
  const [session, setSession] = useState<AuthUser | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [myRooms, setMyRooms] = useState<RoomDetails[]>([]);
  const [presence, setPresence] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("Verbindung wird initialisiert.");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [socketEpoch, setSocketEpoch] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({
    username: "",
    password: ""
  });
  const [joinCode, setJoinCode] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUserRecord[]>([]);
  const [adminRooms, setAdminRooms] = useState<RoomDetails[]>([]);
  const [adminMatches, setAdminMatches] = useState<AdminMatchSummary[]>([]);
  const [adminCreateForm, setAdminCreateForm] = useState<AdminCreateFormState>({
    username: "",
    password: "",
    role: "user"
  });
  const [adminUserDrafts, setAdminUserDrafts] = useState<Record<string, AdminUserDraftState>>({});
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
  const [pendingMatchConfirmation, setPendingMatchConfirmation] = useState<PendingMatchConfirmation | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const suppressCloseToastRef = useRef(false);
  const sessionRef = useRef<AuthUser | null | undefined>(session);
  const roomRef = useRef<RoomDetails | null>(null);
  const matchRef = useRef<MatchSnapshot | null>(null);
  const routeRef = useRef<RouteState>(route);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const lastServerActivityRef = useRef(Date.now());
  const lastDisconnectToastAtRef = useRef(0);

  const selfPlayer = useMemo(
    () => match?.players.find((player) => player.id === match.you) ?? null,
    [match]
  );

  const activeScreen = useMemo(() => {
    if (!session) {
      return "auth" as const;
    }
    if (route.kind === "admin" && session.role === "admin") {
      return "admin" as const;
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
        eyebrow: "Mit Freunden spielen",
        title: TEXT.title,
        meta: TEXT.subtitle
      };
    }

    if (activeScreen === "lobby") {
      return {
        eyebrow: "Spielzentrale",
        title: `Willkommen, ${session.username}`,
        meta: "Raum erstellen oder mit einem Code beitreten"
      };
    }

    if (activeScreen === "admin") {
      return {
        eyebrow: "Administration",
        title: "Admin-Konsole",
        meta: "Konten, Räume und laufende Partien zentral verwalten"
      };
    }

    if (activeScreen === "room") {
      return {
        eyebrow: "Privater Raum",
        title: room ? "Raumlobby" : "Raum wird geladen",
        meta: room ? `Code ${room.code} · ${room.seats.filter((seat) => seat.userId).length}/4 Spieler` : "Synchronisation läuft"
      };
    }

    return {
      eyebrow: "Laufende Partie",
      title: match ? `Zug ${match.turn}` : "Partie wird geladen",
      meta: match
        ? `Am Zug: ${match.players.find((player) => player.id === match.currentPlayerId)?.username ?? "-"}`
        : "Verbindung läuft"
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
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setPendingMatchConfirmation(null);
  }, [match?.matchId, match?.version, route.kind]);

  useEffect(() => {
    setAdminUserDrafts((current) =>
      Object.fromEntries(
        adminUsers.map((user) => [
          user.id,
          {
            username: current[user.id]?.username ?? user.username,
            password: current[user.id]?.password ?? "",
            role: current[user.id]?.role ?? user.role
          }
        ])
      )
    );
  }, [adminUsers]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const loadMyRooms = useCallback(
    async (silent = true) => {
      if (!sessionRef.current) {
        setMyRooms([]);
        return;
      }

      try {
        const rooms = await getMyRooms();
        setMyRooms(rooms);
      } catch (error) {
        if (!silent) {
          pushToast("error", "Partien konnten nicht geladen werden", (error as Error).message);
        }
      }
    },
    [pushToast]
  );

  const loadAdminData = useCallback(
    async (silent = true) => {
      if (sessionRef.current?.role !== "admin") {
        setAdminUsers([]);
        setAdminRooms([]);
        setAdminMatches([]);
        setAdminUserDrafts({});
        return;
      }

      try {
        const [users, rooms, matches] = await Promise.all([getAdminUsers(), getAdminRooms(), getAdminMatches()]);
        setAdminUsers(users);
        setAdminRooms(rooms);
        setAdminMatches(matches);
      } catch (error) {
        if (!silent) {
          pushToast("error", "Admin-Daten konnten nicht geladen werden", (error as Error).message);
        }
      }
    },
    [pushToast]
  );

  const triggerReconnect = useCallback(
    (nextStatus = "Realtime-Verbindung wird wiederhergestellt.") => {
      if (!sessionRef.current) {
        return;
      }

      const currentSocket = wsRef.current;
      if (
        currentSocket &&
        (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      clearReconnectTimer();
      setConnectionState("connecting");
      setStatus(nextStatus);
      setSocketEpoch((current) => current + 1);
    },
    [clearReconnectTimer]
  );

  const scheduleReconnect = useCallback(() => {
    if (!sessionRef.current || reconnectTimerRef.current !== null) {
      return;
    }

    const nextAttempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = nextAttempt;
    const baseDelay = Math.min(RECONNECT_BASE_MS * 2 ** (nextAttempt - 1), RECONNECT_MAX_MS);
    const delay = baseDelay + Math.round(Math.random() * 350);
    const seconds = Math.max(1, Math.round(delay / 1000));
    setConnectionState("connecting");
    setStatus(`Verbindung unterbrochen. Neuer Versuch in ${seconds}s.`);

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      triggerReconnect("Realtime-Verbindung wird wiederhergestellt.");
    }, delay);
  }, [triggerReconnect]);

  const syncRealtimeSubscriptions = useCallback((socket: WebSocket) => {
    const currentRoute = routeRef.current;

    if (currentRoute.kind === "room") {
      sendMessage(socket, {
        type: "room.subscribe",
        roomId: currentRoute.roomId
      });
      return;
    }

    if (currentRoute.kind === "match") {
      const currentRoomId = roomRef.current?.id;
      if (currentRoomId) {
        sendMessage(socket, {
          type: "room.subscribe",
          roomId: currentRoomId
        });
      }

      sendMessage(socket, {
        type: "match.reconnect",
        matchId: matchRef.current?.matchId ?? currentRoute.matchId
      });
    }
  }, []);

  useEffect(() => {
    void getCurrentUser()
      .then((user) => {
        setSession(user);
        setConnectionState("connecting");
        setStatus(`Willkommen zurück, ${user.username}.`);
      })
      .catch(() => {
        setSession(null);
        setConnectionState("offline");
        setStatus("Bitte an- oder registrieren.");
      });
  }, []);

  useEffect(() => {
    if (!session) {
      clearReconnectTimer();
      clearHeartbeatTimer();
      reconnectAttemptRef.current = 0;
      setMyRooms([]);
      setAdminUsers([]);
      setAdminRooms([]);
      setAdminMatches([]);
      setAdminUserDrafts({});
      setAdminCreateForm({
        username: "",
        password: "",
        role: "user"
      });
      suppressCloseToastRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionState("offline");
      setStatus("Bitte an- oder registrieren.");
      return;
    }

    reconnectAttemptRef.current = 0;
    void loadMyRooms();
    if (session.role === "admin") {
      void loadAdminData();
    } else {
      setAdminUsers([]);
      setAdminRooms([]);
      setAdminMatches([]);
      setAdminUserDrafts({});
    }
    triggerReconnect("Realtime-Verbindung wird hergestellt.");
  }, [clearHeartbeatTimer, clearReconnectTimer, loadAdminData, loadMyRooms, session, triggerReconnect]);

  useEffect(() => {
    const reconnectIfNeeded = () => {
      if (!sessionRef.current) {
        return;
      }

      reconnectAttemptRef.current = 0;
      triggerReconnect("Realtime-Verbindung wird nach Rückkehr wiederhergestellt.");
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectIfNeeded();
      }
    };

    window.addEventListener("online", reconnectIfNeeded);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("online", reconnectIfNeeded);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [triggerReconnect]);

  useEffect(() => {
    if (!session) {
      return;
    }

    suppressCloseToastRef.current = false;
    const socket = createWebSocket();
    wsRef.current = socket;
    lastServerActivityRef.current = Date.now();

    const startHeartbeat = () => {
      clearHeartbeatTimer();
      heartbeatTimerRef.current = window.setInterval(() => {
        if (wsRef.current !== socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        if (Date.now() - lastServerActivityRef.current > HEARTBEAT_TIMEOUT_MS) {
          setStatus("Realtime-Verbindung antwortet nicht. Neuer Verbindungsversuch folgt.");
          socket.close();
          return;
        }

        sendMessage(socket, {
          type: "client.ping",
          at: Date.now()
        });
      }, HEARTBEAT_INTERVAL_MS);
    };

    socket.onopen = () => {
      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      lastServerActivityRef.current = Date.now();
      setConnectionState("online");
      setStatus("Realtime-Verbindung aktiv.");
      startHeartbeat();
      syncRealtimeSubscriptions(socket);
      void loadMyRooms();
      if (sessionRef.current?.role === "admin") {
        void loadAdminData();
      }
    };

    socket.onmessage = (event) => {
      lastServerActivityRef.current = Date.now();
      const message = JSON.parse(event.data) as ServerMessage;

      if (message.type === "server.pong") {
        return;
      }

      if (message.type === "room.state") {
        setRoom(message.room);
        void loadMyRooms();
        const sessionUserId = sessionRef.current?.id;
        const isSeatedInRoom = sessionUserId
          ? message.room.seats.some((seat) => seat.userId === sessionUserId)
          : false;
        const currentRoute = routeRef.current;
        const currentMatchRoomId = matchRef.current?.roomId;

        if (
          currentRoute.kind === "match" &&
          !message.room.matchId &&
          (currentMatchRoomId === message.room.id || roomRef.current?.id === message.room.id)
        ) {
          setMatch(null);
          setInteractionMode(null);
          setSelectedRoadEdges([]);
          navigateTo(
            message.room.status === "closed" && !isSeatedInRoom
              ? { kind: "home" }
              : { kind: "room", roomId: message.room.id }
          );
          pushToast(
            "info",
            "Partie zur Lobby zurückgesetzt",
            isSeatedInRoom
              ? "Ein Spieler wurde entfernt. Der Raum wartet jetzt wieder auf Spieler."
              : "Die laufende Partie existiert nicht mehr. Du bist wieder in der Raumansicht."
          );
          return;
        }

        if (currentRoute.kind === "room" && currentRoute.roomId === message.room.id && message.room.status === "closed" && !isSeatedInRoom) {
          setRoom(null);
          setMatch(null);
          setPresence([]);
          navigateTo({ kind: "home" });
          pushToast("info", "Raum geschlossen", "Dieser Raum wurde beendet und aus der Liste entfernt.");
          return;
        }

        if (message.room.matchId && isSeatedInRoom) {
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
    };

    socket.onerror = () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    socket.onclose = () => {
      clearHeartbeatTimer();
      if (wsRef.current === socket) {
        wsRef.current = null;
      }

      if (suppressCloseToastRef.current) {
        suppressCloseToastRef.current = false;
        return;
      }

      if (!sessionRef.current) {
        setConnectionState("offline");
        setStatus("Bitte an- oder registrieren.");
        return;
      }

      const now = Date.now();
      if (now - lastDisconnectToastAtRef.current > DISCONNECT_TOAST_COOLDOWN_MS) {
        lastDisconnectToastAtRef.current = now;
        pushToast("info", "Verbindung wird wiederhergestellt", "Hexagonia verbindet deine laufenden Räume und Partien automatisch neu.");
      }

      scheduleReconnect();
    };

    return () => {
      clearHeartbeatTimer();
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        suppressCloseToastRef.current = true;
        socket.close();
      }
    };
  }, [
    clearHeartbeatTimer,
    clearReconnectTimer,
    loadAdminData,
    loadMyRooms,
    pushToast,
    scheduleReconnect,
    session,
    socketEpoch,
    syncRealtimeSubscriptions
  ]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (route.kind === "admin") {
      if (session.role !== "admin") {
        navigateTo({ kind: "home" });
        return;
      }
      void loadAdminData(false);
      return;
    }

    if (route.kind === "invite") {
      void getRoomByCode(route.code)
        .then((nextRoom) => {
          setRoom(nextRoom);
          navigateTo({ kind: "room", roomId: nextRoom.id });
          subscribeRoom(nextRoom.id);
          pushToast("success", "Einladung geöffnet", `Du bist jetzt im Raum ${nextRoom.code}.`);
        })
        .catch((routeError: Error) => {
          pushToast("error", "Einladung ungültig", routeError.message);
          navigateTo({ kind: "home" });
        });
      return;
    }

    if (route.kind === "room") {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        triggerReconnect("Realtime-Verbindung wird für den Raum wiederhergestellt.");
      }
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

    if (route.kind === "match") {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage(wsRef.current, {
          type: "match.reconnect",
          matchId: route.matchId
        });
      } else {
        triggerReconnect("Realtime-Verbindung wird für die Partie wiederhergestellt.");
      }
    }
  }, [loadAdminData, pushToast, route, session, triggerReconnect]);

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

    const selfPlayer = match.players.find((player) => player.id === match.you);
    const selfResources = selfPlayer?.resources;
    const canBuildRoad = !!selfResources && hasResources(selfResources, BUILD_COSTS.road);
    const canBuildSettlement = !!selfResources && hasResources(selfResources, BUILD_COSTS.settlement);
    const canBuildCity = !!selfResources && hasResources(selfResources, BUILD_COSTS.city);

    if (
      (interactionMode === "road" && (!canBuildRoad || !match.allowedMoves.roadEdgeIds.length)) ||
      (interactionMode === "settlement" &&
        (!canBuildSettlement || !match.allowedMoves.settlementVertexIds.length)) ||
      (interactionMode === "city" && (!canBuildCity || !match.allowedMoves.cityVertexIds.length))
    ) {
      setInteractionMode(null);
      setSelectedRoadEdges([]);
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

  useEffect(() => {
    if (route.kind !== "match" || !room?.id || wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    sendMessage(wsRef.current, {
      type: "room.subscribe",
      roomId: room.id
    });
  }, [room?.id, route.kind]);

  const sendCurrent = useCallback(
    (message: ClientMessage) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        triggerReconnect("Realtime-Verbindung wird wiederhergestellt.");
        pushToast("error", "WebSocket nicht verbunden", "Die Realtime-Verbindung ist gerade nicht verfügbar.");
        return;
      }
      sendMessage(wsRef.current, message);
    },
    [pushToast, triggerReconnect]
  );

  const queueMatchConfirmation = useCallback(
    (message: Extract<ClientMessage, { type: "match.action" }>, afterConfirm?: () => void) => {
      const currentMatch = matchRef.current;
      if (!currentMatch) {
        return;
      }

      const confirmation = getMatchActionConfirmation(currentMatch, message.action);
      if (!confirmation) {
        sendCurrent(message);
        afterConfirm?.();
        return;
      }

      setPendingMatchConfirmation({
        ...confirmation,
        message,
        ...(afterConfirm ? { afterConfirm } : {})
      });
    },
    [sendCurrent]
  );

  const handleMatchAction = useCallback(
    (message: ClientMessage) => {
      if (message.type !== "match.action") {
        sendCurrent(message);
        return;
      }

      queueMatchConfirmation(message);
    },
    [queueMatchConfirmation, sendCurrent]
  );

  const handleConfirmPendingAction = useCallback(() => {
    if (!pendingMatchConfirmation) {
      return;
    }

    sendCurrent(pendingMatchConfirmation.message);
    pendingMatchConfirmation.afterConfirm?.();
    setPendingMatchConfirmation(null);
  }, [pendingMatchConfirmation, sendCurrent]);

  const handleCancelPendingAction = useCallback(() => {
    setPendingMatchConfirmation(null);
  }, []);

  const navigateTo = useCallback((next: RouteState) => {
    setRoute(next);
    if (next.kind === "home") {
      window.location.hash = "";
    }
    if (next.kind === "admin") {
      window.location.hash = "admin";
    }
    if (next.kind === "invite") {
      window.location.hash = `invite/${next.code}`;
    }
    if (next.kind === "room") {
      window.location.hash = `room/${next.roomId}`;
    }
    if (next.kind === "match") {
      window.location.hash = `match/${next.matchId}`;
    }
  }, []);

  const handleOpenTrackedRoom = useCallback(
    (roomId: string) => {
      navigateTo({ kind: "room", roomId });
      triggerReconnect("Realtime-Verbindung wird für den Raum wiederhergestellt.");
    },
    [navigateTo, triggerReconnect]
  );

  const handleResumeMatch = useCallback(
    (matchId: string) => {
      navigateTo({ kind: "match", matchId });
      triggerReconnect("Realtime-Verbindung wird für die Partie wiederhergestellt.");
    },
    [navigateTo, triggerReconnect]
  );

  const handleOpenAdmin = useCallback(() => {
    navigateTo({ kind: "admin" });
  }, [navigateTo]);

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();

    try {
      const user =
        authMode === "login"
          ? await login({
              username: authForm.username,
              password: authForm.password
            })
          : await register({
              username: authForm.username,
              password: authForm.password
            });

      setSession(user);
      setAuthForm({ username: "", password: "" });
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
      await loadMyRooms();
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
      await loadMyRooms();
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
      await loadMyRooms();
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
      await loadMyRooms();
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
      await loadMyRooms();
      navigateTo({ kind: "home" });
      pushToast("info", "Raum verlassen", "Du bist zurück in der Zentrale.");
    } catch (leaveError) {
      pushToast("error", "Raum konnte nicht verlassen werden", (leaveError as Error).message);
    }
  };

  const handleKickRoomUser = async (userId: string) => {
    if (!room) {
      return;
    }

    try {
      const nextRoom = await kickRoomUser(room.id, userId);
      setRoom(nextRoom);
      await loadMyRooms();
      pushToast("info", "Spieler entfernt", "Der Platz in der Lobby wurde freigegeben.");
    } catch (kickError) {
      pushToast("error", "Spieler konnte nicht entfernt werden", (kickError as Error).message);
    }
  };

  const handleStartRoom = async () => {
    if (!room) {
      return;
    }

    try {
      const result = await startRoom(room.id);
      setRoom(result.room);
      await loadMyRooms();
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
      setMyRooms([]);
      clearReconnectTimer();
      clearHeartbeatTimer();
      reconnectAttemptRef.current = 0;
      setAdminCreateForm({
        username: "",
        password: "",
        role: "user"
      });
      navigateTo({ kind: "home" });
      pushToast("info", "Abgemeldet", "Deine Sitzung wurde beendet.");
    } catch (logoutError) {
      pushToast("error", "Logout fehlgeschlagen", (logoutError as Error).message);
    }
  };

  const handleAdminCreateFormChange = (field: keyof AdminCreateFormState, value: string) => {
    setAdminCreateForm((current) => {
      if (field === "role") {
        return {
          ...current,
          role: value as UserRole
        };
      }

      if (field === "username") {
        return {
          ...current,
          username: value
        };
      }

      return {
        ...current,
        password: value
      };
    });
  };

  const handleAdminCreateUser = async () => {
    try {
      await createAdminUser(adminCreateForm);
      setAdminCreateForm({
        username: "",
        password: "",
        role: "user"
      });
      await loadAdminData();
      pushToast("success", "Nutzer angelegt", "Das Konto wurde in der Admin-Konsole angelegt.");
    } catch (error) {
      pushToast("error", "Nutzer konnte nicht angelegt werden", (error as Error).message);
    }
  };

  const handleAdminUserDraftChange = (userId: string, field: keyof AdminUserDraftState, value: string) => {
    setAdminUserDrafts((current) => ({
      ...current,
      [userId]: getNextAdminUserDraft(current, adminUsers, userId, field, value)
    }));
  };

  const handleAdminSaveUser = async (userId: string) => {
    const draft = adminUserDrafts[userId];
    const currentUser = adminUsers.find((user) => user.id === userId);
    if (!draft || !currentUser) {
      return;
    }

    try {
      const payload: {
        username?: string;
        password?: string;
        role?: UserRole;
      } = {};

      if (draft.username !== currentUser.username) {
        payload.username = draft.username;
      }
      if (draft.role !== currentUser.role) {
        payload.role = draft.role;
      }
      if (draft.password.trim()) {
        payload.password = draft.password;
      }

      if (!Object.keys(payload).length) {
        pushToast("info", "Keine Änderung", "Für dieses Konto wurden keine neuen Werte gesetzt.");
        return;
      }

      const updated = await updateAdminUser(userId, payload);
      if (session?.id === updated.id) {
        setSession(updated);
      }
      await loadAdminData();
      pushToast("success", "Nutzer gespeichert", `${updated.username} wurde aktualisiert.`);
    } catch (error) {
      pushToast("error", "Nutzer konnte nicht gespeichert werden", (error as Error).message);
    }
  };

  const handleAdminDeleteUser = async (userId: string) => {
    try {
      await deleteAdminUser(userId);
      await loadAdminData();
      await loadMyRooms();
      pushToast("info", "Nutzer gelöscht", "Das Konto wurde entfernt und betroffene Räume aktualisiert.");
    } catch (error) {
      pushToast("error", "Nutzer konnte nicht gelöscht werden", (error as Error).message);
    }
  };

  const handleAdminCloseRoom = async (roomId: string) => {
    try {
      const savedRoom = await closeAdminRoom(roomId);
      if (room?.id === savedRoom.id) {
        setRoom(null);
        setMatch(null);
        setPresence([]);
        navigateTo({ kind: "home" });
      }
      await loadAdminData();
      await loadMyRooms();
      pushToast("info", "Raum geschlossen", `Raum ${savedRoom.code} wurde administrativ geschlossen.`);
    } catch (error) {
      pushToast("error", "Raum konnte nicht geschlossen werden", (error as Error).message);
    }
  };

  const handleAdminDeleteMatch = async (matchId: string) => {
    try {
      const savedRoom = await deleteAdminMatch(matchId);
      if (match?.matchId === matchId) {
        setMatch(null);
      }
      if (room?.id === savedRoom.id) {
        setRoom(savedRoom);
      }
      await loadAdminData();
      await loadMyRooms();
      pushToast("info", "Match zurückgesetzt", "Die Partie wurde entfernt und der Raum wieder geöffnet.");
    } catch (error) {
      pushToast("error", "Match konnte nicht zurückgesetzt werden", (error as Error).message);
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

  const handleCopyInviteLink = async () => {
    if (!room?.code) {
      return;
    }

    try {
      const inviteUrl = new URL(window.location.href);
      inviteUrl.hash = `invite/${room.code}`;
      await navigator.clipboard.writeText(inviteUrl.toString());
      pushToast("success", "Einladungslink kopiert", room.code);
    } catch {
      pushToast("error", "Kopieren fehlgeschlagen", "Der Einladungslink konnte nicht in die Zwischenablage kopiert werden.");
    }
  };

  const handleVertexSelect = (vertexId: string) => {
    if (!match) {
      return;
    }

    const selfPlayer = match.players.find((player) => player.id === match.you);
    const selfResources = selfPlayer?.resources;

    if (match.allowedMoves.initialSettlementVertexIds.includes(vertexId)) {
      queueMatchConfirmation({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "place_initial_settlement",
          vertexId
        }
      });
      return;
    }

    if (
      interactionMode === "settlement" &&
      !!selfResources &&
      hasResources(selfResources, BUILD_COSTS.settlement) &&
      match.allowedMoves.settlementVertexIds.includes(vertexId)
    ) {
      queueMatchConfirmation(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "build_settlement",
            vertexId
          }
        },
        () => setInteractionMode(null)
      );
    }

    if (
      interactionMode === "city" &&
      !!selfResources &&
      hasResources(selfResources, BUILD_COSTS.city) &&
      match.allowedMoves.cityVertexIds.includes(vertexId)
    ) {
      queueMatchConfirmation(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "build_city",
            vertexId
          }
        },
        () => setInteractionMode(null)
      );
    }
  };

  const handleEdgeSelect = (edgeId: string) => {
    if (!match) {
      return;
    }

    const selfPlayer = match.players.find((player) => player.id === match.you);
    const selfResources = selfPlayer?.resources;

    if (match.allowedMoves.initialRoadEdgeIds.includes(edgeId)) {
      queueMatchConfirmation({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "place_initial_road",
          edgeId
        }
      });
      return;
    }

    if (
      interactionMode === "road" &&
      !!selfResources &&
      hasResources(selfResources, BUILD_COSTS.road) &&
      match.allowedMoves.roadEdgeIds.includes(edgeId)
    ) {
      queueMatchConfirmation(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "build_road",
            edgeId
          }
        },
        () => setInteractionMode(null)
      );
    }

    if (interactionMode === "road_building" && match.allowedMoves.roadEdgeIds.includes(edgeId)) {
      setSelectedRoadEdges((current) => {
        if (current.includes(edgeId)) {
          return current.filter((entry) => entry !== edgeId);
        }

        const next = [...current, edgeId].slice(0, 2);
        if (next.length === 2) {
          queueMatchConfirmation(
            {
              type: "match.action",
              matchId: match.matchId,
              action: {
                type: "play_road_building",
                edgeIds: next
              }
            },
            () => {
              setInteractionMode(null);
              setSelectedRoadEdges([]);
            }
          );
          return next;
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
    queueMatchConfirmation(
      {
        type: "match.action",
        matchId: match.matchId,
        action
      },
      () => setInteractionMode(null)
    );
  };

  const sendTradeOffer = () => {
    if (!match) {
      return;
    }

    queueMatchConfirmation({
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
          onCopyInviteLink: handleCopyInviteLink,
          onCopyRoomCode: handleCopyRoomCode
        }
      : {};
  const headerAdminProps = session?.role === "admin" ? { onNavigateAdmin: handleOpenAdmin } : {};

  const displayEyebrow = !session ? "Mit Freunden spielen" : headerContext.eyebrow;
  const displayMeta =
    !session
      ? TEXT.subtitle
      : activeScreen === "lobby"
        ? "Raum erstellen oder mit einem Code beitreten"
        : activeScreen === "room" && room
          ? `Code ${room.code} - ${room.seats.filter((seat) => seat.userId).length}/4 Spieler`
          : activeScreen === "match" && match
            ? `Am Zug: ${match.players.find((player) => player.id === match.currentPlayerId)?.username ?? "-"}`
            : headerContext.meta;

  return (
    <main className={`app-shell ${activeScreen === "match" ? "is-match-screen" : ""}`.trim()}>
      <AppHeader
        connectionState={connectionState}
        connectionStatusText={status}
        eyebrow={displayEyebrow}
        meta={displayMeta}
        session={session}
        title={headerContext.title}
        onLogout={handleLogout}
        onNavigateHome={() => navigateTo({ kind: "home" })}
        {...headerAdminProps}
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
            rooms={myRooms}
            session={session}
            onCreateRoom={handleCreateRoom}
            onJoinByCode={handleJoinByCode}
            onJoinCodeChange={setJoinCode}
            onOpenRoom={handleOpenTrackedRoom}
            onResumeMatch={handleResumeMatch}
          />
        ) : null}

        {activeScreen === "admin" && session?.role === "admin" ? (
          <AdminScreen
            createForm={adminCreateForm}
            matches={adminMatches}
            rooms={adminRooms}
            session={session}
            userDrafts={adminUserDrafts}
            users={adminUsers}
            onCloseRoom={handleAdminCloseRoom}
            onCreateFormChange={handleAdminCreateFormChange}
            onCreateUser={handleAdminCreateUser}
            onDeleteMatch={handleAdminDeleteMatch}
            onDeleteUser={handleAdminDeleteUser}
            onOpenRoom={handleOpenTrackedRoom}
            onSaveUser={handleAdminSaveUser}
            onUserDraftChange={handleAdminUserDraftChange}
          />
        ) : null}

        {activeScreen === "room" && session ? (
          room ? (
            <RoomScreen
              presence={presence}
              room={room}
              session={session}
              onCopyCode={handleCopyRoomCode}
              onCopyInviteLink={handleCopyInviteLink}
              onJoinSeat={handleSeatJoin}
              onKickUser={handleKickRoomUser}
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
              onAction={handleMatchAction}
              onEdgeSelect={handleEdgeSelect}
              onOfferTrade={sendTradeOffer}
              onTileSelect={handleTileSelect}
              onVertexSelect={handleVertexSelect}
            />
          ) : (
            <StatusSurface title="Partie wird verbunden" text="Die Realtime-Partie wird wieder an dein Gerät angebunden." />
          )
        ) : null}
      </div>

      {pendingMatchConfirmation ? (
        <ConfirmActionDialog
          confirmLabel={pendingMatchConfirmation.confirmLabel}
          detail={pendingMatchConfirmation.detail}
          title={pendingMatchConfirmation.title}
          onCancel={handleCancelPendingAction}
          onConfirm={handleConfirmPendingAction}
        />
      ) : null}

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

function ConfirmActionDialog(props: {
  title: string;
  detail: string;
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

function sendMessage(socket: WebSocket, message: ClientMessage) {
  socket.send(JSON.stringify(message));
}

function singleResourceMap(resource: Resource, count: number): ResourceMap {
  const map = createEmptyResourceMap();
  map[resource] = count;
  return map;
}

function getMatchActionConfirmation(
  match: MatchSnapshot,
  action: MatchAction
): { title: string; detail: string; confirmLabel: string } | null {
  switch (action.type) {
    case "place_initial_settlement":
      return {
        title: "Start-Siedlung setzen?",
        detail: "Die ausgewählte Position wird als deine Start-Siedlung gesetzt.",
        confirmLabel: "Siedlung setzen"
      };
    case "place_initial_road":
      return {
        title: "Start-Straße setzen?",
        detail: "Die ausgewählte Kante wird als deine Start-Straße gesetzt.",
        confirmLabel: "Straße setzen"
      };
    case "build_road":
      return {
        title: "Straße bauen?",
        detail: "Die Straße wird sofort gebaut und die Baukosten werden bezahlt.",
        confirmLabel: "Straße bauen"
      };
    case "build_settlement":
      return {
        title: "Siedlung bauen?",
        detail: "Die Siedlung wird sofort gebaut und die Baukosten werden bezahlt.",
        confirmLabel: "Siedlung bauen"
      };
    case "build_city":
      return {
        title: "Stadt bauen?",
        detail: "Die ausgewählte Siedlung wird zur Stadt ausgebaut und die Baukosten werden bezahlt.",
        confirmLabel: "Stadt bauen"
      };
    case "buy_development_card":
      return {
        title: "Entwicklungskarte kaufen?",
        detail: "Die Rohstoffe werden direkt abgezogen und du ziehst eine verdeckte Entwicklungskarte.",
        confirmLabel: "Karte kaufen"
      };
    case "play_knight":
      return {
        title: "Ritter spielen?",
        detail: "Der Ritter wird ausgespielt und danach setzt du den Räuber.",
        confirmLabel: "Ritter spielen"
      };
    case "play_road_building":
      return {
        title: "Kostenlose Straßen setzen?",
        detail:
          action.edgeIds.length === 2
            ? "Beide ausgewählten Kanten werden als kostenlose Straßen gesetzt."
            : "Die ausgewählte Kante wird als kostenlose Straße gesetzt.",
        confirmLabel: "Straßen setzen"
      };
    case "play_year_of_plenty":
      return {
        title: "Erfindung ausspielen?",
        detail: `Du nimmst ${renderResourceLabel(action.resources[0])} und ${renderResourceLabel(action.resources[1])} aus der Bank.`,
        confirmLabel: "Erfindung spielen"
      };
    case "play_monopoly":
      return {
        title: "Monopol ausspielen?",
        detail: `Alle Mitspieler geben dir ihre ${renderResourceLabel(action.resource)}-Karten.`,
        confirmLabel: "Monopol spielen"
      };
    case "move_robber": {
      const targetName = action.targetPlayerId
        ? match.players.find((player) => player.id === action.targetPlayerId)?.username
        : null;
      return {
        title: "Räuber versetzen?",
        detail: targetName
          ? `Der Räuber wird auf das gewählte Feld versetzt und ${targetName} wird als Zielspieler verwendet.`
          : "Der Räuber wird auf das gewählte Feld versetzt.",
        confirmLabel: "Räuber setzen"
      };
    }
    case "offer_trade": {
      const targetName = action.targetPlayerId
        ? match.players.find((player) => player.id === action.targetPlayerId)?.username ?? "dem Zielspieler"
        : "allen Mitspielern";
      return {
        title: "Handelsangebot senden?",
        detail: `${renderResourceMap(action.give)} gegen ${renderResourceMap(action.want)} an ${targetName}.`,
        confirmLabel: "Angebot senden"
      };
    }
    case "maritime_trade":
      return {
        title: "Hafenhandel bestätigen?",
        detail: `Tausche ${action.giveCount} ${renderResourceLabel(action.give)} gegen 1 ${renderResourceLabel(action.receive)}.`,
        confirmLabel: "Tausch senden"
      };
    case "discard_resources":
      return {
        title: "Karten abwerfen?",
        detail: `Diese Karten werden abgelegt: ${renderResourceMap(action.resources)}.`,
        confirmLabel: "Karten abwerfen"
      };
    case "end_turn":
      return {
        title: "Zug beenden?",
        detail: "Danach kann in diesem Zug nichts mehr gebaut oder gespielt werden.",
        confirmLabel: "Zug beenden"
      };
    default:
      return null;
  }
}

function getNextAdminUserDraft(
  currentDrafts: Record<string, AdminUserDraftState>,
  users: AdminUserRecord[],
  userId: string,
  field: keyof AdminUserDraftState,
  value: string
): AdminUserDraftState {
  const baseUser = users.find((user) => user.id === userId);
  const current = currentDrafts[userId];
  const draft: AdminUserDraftState = {
    username: current?.username ?? baseUser?.username ?? "",
    password: current?.password ?? "",
    role: current?.role ?? baseUser?.role ?? "user"
  };

  if (field === "role") {
    return {
      ...draft,
      role: value as UserRole
    };
  }

  if (field === "username") {
    return {
      ...draft,
      username: value
    };
  }

  return {
    ...draft,
    password: value
  };
}
