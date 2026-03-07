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
  SetupMode,
  StartingPlayerMode,
  ServerMessage,
  UserRole
} from "@hexagonia/shared";
import { cloneResourceMap, createEmptyResourceMap, hasResources, RESOURCES } from "@hexagonia/shared";
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
  updateAdminUser,
  updateRoomSettings
} from "./api";
import { bindGlobalUiSounds, uiSoundManager } from "./audio/uiSoundManager";
import type { InteractionMode } from "./BoardScene";
import {
  type BoardVisualSettings,
  resolveInitialBoardVisualSettings,
  BOARD_VISUAL_SETTINGS_STORAGE_KEY,
  serializeBoardVisualSettings
} from "./boardVisuals";
import { AppHeader } from "./components/shell/AppHeader";
import { ToastStack, type ToastMessage } from "./components/shell/ToastStack";
import { AdminScreen, type AdminCreateFormState, type AdminUserDraftState } from "./components/screens/AdminScreen";
import { LandingScreen } from "./components/screens/LandingScreen";
import { LobbyScreen } from "./components/screens/LobbyScreen";
import { MatchScreen, type MaritimeFormState, type TradeFormState } from "./components/screens/MatchScreen";
import { RoomScreen } from "./components/screens/RoomScreen";
import { PlayerIdentity } from "./components/shared/PlayerIdentity";
import { ResourceIcon } from "./resourceIcons";
import {
  type AuthMode,
  type ConnectionState,
  type RouteState,
  getPlayerAccentClass,
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
const BUILD_COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { grain: 2, ore: 3 }
} as const;
const DICE_EXPAND_MS = 150;
const DICE_ROLL_MS = 560;
const DICE_SETTLE_MS = 260;
const ROBBER_UI_DELAY_MS = DICE_EXPAND_MS + DICE_ROLL_MS + DICE_SETTLE_MS;

type MatchAction = Extract<ClientMessage, { type: "match.action" }>["action"];

interface PendingMatchConfirmation {
  title: string;
  detail: string;
  confirmLabel: string;
  message: Extract<ClientMessage, { type: "match.action" }>;
  afterConfirm?: () => void;
}

interface PendingRobberTargetSelection {
  tileId: string;
  targetPlayerIds: string[];
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
  const [soundMuted, setSoundMuted] = useState(() => uiSoundManager.isMuted());
  const [selectedMusicTrackId, setSelectedMusicTrackId] = useState(() => uiSoundManager.getSelectedMusicTrackId());
  const [musicPaused, setMusicPaused] = useState(() => uiSoundManager.isMusicPaused());
  const [musicPlaybackMode, setMusicPlaybackMode] = useState(() => uiSoundManager.getMusicPlaybackMode());
  const [boardVisualSettings, setBoardVisualSettings] = useState<BoardVisualSettings>(() => resolveInitialBoardVisualSettings());
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
    give: createEmptyResourceMap(),
    want: createEmptyResourceMap(),
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
  const [pendingRobberTargetSelection, setPendingRobberTargetSelection] = useState<PendingRobberTargetSelection | null>(null);
  const [robberDiscardDraft, setRobberDiscardDraft] = useState<ResourceMap>(() => createEmptyResourceMap());
  const [robberDiscardMinimized, setRobberDiscardMinimized] = useState(false);
  const musicTracks = useMemo(() => uiSoundManager.getMusicTracks(), []);
  const [robberUiBlockedByDiceAnimation, setRobberUiBlockedByDiceAnimation] = useState(false);

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
  const toastCounterRef = useRef(0);
  const hasSeenDialogStateRef = useRef(false);
  const robberUiMatchIdRef = useRef<string | null>(null);
  const robberUiDiceEventIdRef = useRef<string | null>(null);
  const robberUiBlockTimerRef = useRef<number | null>(null);
  const matchSoundStateRef = useRef<{
    matchId: string | null;
    currentPlayerId: string | null;
    actionableTradeCount: number;
    winnerId: string | null;
  }>({
    matchId: null,
    currentPlayerId: null,
    actionableTradeCount: 0,
    winnerId: null
  });

  const selfPlayer = useMemo(
    () => match?.players.find((player) => player.id === match.you) ?? null,
    [match]
  );
  const latestDiceEvent = useMemo(() => (match ? getLatestDiceRollEvent(match) : null), [match]);
  const requiredDiscardCount = match?.allowedMoves.pendingDiscardCount ?? 0;
  const selectedDiscardCount = useMemo(
    () => RESOURCES.reduce((sum, resource) => sum + (robberDiscardDraft[resource] ?? 0), 0),
    [robberDiscardDraft]
  );
  const remainingDiscardCount = Math.max(0, requiredDiscardCount - selectedDiscardCount);
  const canSubmitRobberDiscard =
    !!match && !!selfPlayer?.resources && requiredDiscardCount > 0 && selectedDiscardCount === requiredDiscardCount;
  const robberDiscardStatus = match?.robberDiscardStatus ?? [];
  const robberUiDeferredByDiceAnimation =
    robberUiBlockedByDiceAnimation ||
    (!!match &&
      robberUiMatchIdRef.current === match.matchId &&
      robberUiDiceEventIdRef.current !== null &&
      (latestDiceEvent?.id ?? null) !== robberUiDiceEventIdRef.current);

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
  const isGuestLanding = activeScreen === "auth";

  const playUiSound = useCallback(
    (...args: Parameters<typeof uiSoundManager.play>) => {
      if (isGuestLanding) {
        return;
      }

      void uiSoundManager.play(...args);
    },
    [isGuestLanding]
  );

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
      toastCounterRef.current += 1;
      const id = `toast-${Date.now()}-${toastCounterRef.current}`;
      const nextToast: ToastMessage = body ? { id, tone, title, body } : { id, tone, title };
      playUiSound(getToastSoundId(tone));
      setToasts((current) => [...current, nextToast].slice(-4));
      window.setTimeout(() => {
        removeToast(id);
      }, tone === "error" ? 5400 : 3600);
    },
    [playUiSound, removeToast]
  );

  useEffect(() => {
    uiSoundManager.prime();
    if (isGuestLanding) {
      return;
    }

    const cleanup = bindGlobalUiSounds();
    return cleanup;
  }, [isGuestLanding]);

  useEffect(() => {
    if (!session) {
      return;
    }

    void uiSoundManager.enableMusicByDefault();
  }, [session]);

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
    if (!match) {
      matchSoundStateRef.current = {
        matchId: null,
        currentPlayerId: null,
        actionableTradeCount: 0,
        winnerId: null
      };
      return;
    }

    const actionableTradeCount = getActionableTradeCount(match);
    const previous = matchSoundStateRef.current;

    if (previous.matchId === match.matchId) {
      if (previous.currentPlayerId !== match.currentPlayerId && match.currentPlayerId === match.you) {
        playUiSound("notify", { volume: 0.96, playbackRate: 1.04 });
      }

      if (previous.actionableTradeCount === 0 && actionableTradeCount > 0) {
        playUiSound("notify", { volume: 0.9 });
      }

      if (!previous.winnerId && match.winnerId) {
        playUiSound(match.winnerId === match.you ? "success" : "notify", {
          volume: match.winnerId === match.you ? 1.08 : 0.94
        });
      }
    }

    matchSoundStateRef.current = {
      matchId: match.matchId,
      currentPlayerId: match.currentPlayerId,
      actionableTradeCount,
      winnerId: match.winnerId
    };
  }, [match]);

  useEffect(() => {
    setPendingMatchConfirmation(null);
  }, [match?.matchId, match?.version, route.kind]);

  useEffect(() => {
    setRobberDiscardDraft((current) => {
      if (requiredDiscardCount <= 0 || !selfPlayer?.resources) {
        return createEmptyResourceMap();
      }

      const next = createEmptyResourceMap();
      let used = 0;
      for (const resource of RESOURCES) {
        const available = selfPlayer.resources[resource] ?? 0;
        const kept = Math.min(current[resource] ?? 0, available, requiredDiscardCount - used);
        next[resource] = kept;
        used += kept;
      }

      return next;
    });
  }, [match?.matchId, requiredDiscardCount, selfPlayer?.id, selfPlayer?.resources]);

  useEffect(() => {
    if (requiredDiscardCount <= 0) {
      setRobberDiscardMinimized(false);
    }
  }, [requiredDiscardCount, match?.matchId]);

  useEffect(() => {
    if (!match) {
      if (robberUiBlockTimerRef.current !== null) {
        window.clearTimeout(robberUiBlockTimerRef.current);
        robberUiBlockTimerRef.current = null;
      }
      robberUiMatchIdRef.current = null;
      robberUiDiceEventIdRef.current = null;
      setRobberUiBlockedByDiceAnimation(false);
      return;
    }

    const latestDiceEventId = latestDiceEvent?.id ?? null;
    if (robberUiMatchIdRef.current !== match.matchId) {
      if (robberUiBlockTimerRef.current !== null) {
        window.clearTimeout(robberUiBlockTimerRef.current);
        robberUiBlockTimerRef.current = null;
      }
      robberUiMatchIdRef.current = match.matchId;
      robberUiDiceEventIdRef.current = latestDiceEventId;
      setRobberUiBlockedByDiceAnimation(false);
      return;
    }

    if (latestDiceEventId === null || latestDiceEventId === robberUiDiceEventIdRef.current) {
      return;
    }

    robberUiDiceEventIdRef.current = latestDiceEventId;
    if (robberUiBlockTimerRef.current !== null) {
      window.clearTimeout(robberUiBlockTimerRef.current);
    }
    setRobberUiBlockedByDiceAnimation(true);
    robberUiBlockTimerRef.current = window.setTimeout(() => {
      setRobberUiBlockedByDiceAnimation(false);
      robberUiBlockTimerRef.current = null;
    }, ROBBER_UI_DELAY_MS);
  }, [latestDiceEvent?.id, match?.matchId]);

  useEffect(() => {
    return () => {
      if (robberUiBlockTimerRef.current !== null) {
        window.clearTimeout(robberUiBlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!match || interactionMode !== "robber") {
      setPendingRobberTargetSelection(null);
      return;
    }

    setPendingRobberTargetSelection((current) => {
      if (!current) {
        return null;
      }

      const option = match.allowedMoves.robberMoveOptions.find((entry) => entry.tileId === current.tileId);
      if (!option || option.targetPlayerIds.length <= 1) {
        return null;
      }

      return {
        tileId: current.tileId,
        targetPlayerIds: option.targetPlayerIds
      };
    });
  }, [interactionMode, match]);

  useEffect(() => {
    const dialogOpen = !!pendingMatchConfirmation || !!pendingRobberTargetSelection;
    if (!hasSeenDialogStateRef.current) {
      hasSeenDialogStateRef.current = true;
      return;
    }

    playUiSound(dialogOpen ? "open" : "close", { volume: dialogOpen ? 0.82 : 0.76 });
  }, [pendingMatchConfirmation, pendingRobberTargetSelection, playUiSound]);

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
    const delay = baseDelay + getReconnectJitter(nextAttempt);
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
      if (robberUiDeferredByDiceAnimation) {
        if (interactionMode !== null) {
          setInteractionMode(null);
          setSelectedRoadEdges([]);
        }
        return;
      }

      setInteractionMode("robber");
      return;
    }

    if (match.pendingDevelopmentEffect?.type === "road_building" && match.currentPlayerId === match.you) {
      if (interactionMode !== "road_building") {
        setInteractionMode("road_building");
      }
      if (selectedRoadEdges.length > 0) {
        setSelectedRoadEdges([]);
      }
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

    if (interactionMode === "road_building") {
      setInteractionMode(null);
      setSelectedRoadEdges([]);
    }
  }, [interactionMode, match, robberUiDeferredByDiceAnimation, selectedRoadEdges.length]);

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

      const afterConfirm =
        message.action.type === "play_road_building"
          ? () => setSelectedRoadEdges([])
          : message.action.type === "finish_road_building"
            ? () => {
                setInteractionMode(null);
                setSelectedRoadEdges([]);
              }
            : message.action.type === "place_free_road"
              ? () => setSelectedRoadEdges([])
              : undefined;

      queueMatchConfirmation(message, afterConfirm);
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

  const queueRobberMoveConfirmation = useCallback(
    (tileId: string, targetPlayerId?: string) => {
      if (!matchRef.current) {
        return;
      }

      const action: Extract<ClientMessage, { type: "match.action" }>["action"] = {
        type: "move_robber",
        tileId,
        ...(targetPlayerId ? { targetPlayerId } : {})
      };

      queueMatchConfirmation(
        {
          type: "match.action",
          matchId: matchRef.current.matchId,
          action
        },
        () => {
          setPendingRobberTargetSelection(null);
          setInteractionMode(null);
        }
      );
    },
    [queueMatchConfirmation]
  );

  const handleAdjustRobberDiscard = useCallback(
    (resource: Resource, delta: -1 | 1) => {
      if (!selfPlayer?.resources || requiredDiscardCount <= 0) {
        return;
      }

      setRobberDiscardDraft((current) => {
        const totalSelected = RESOURCES.reduce((sum, entry) => sum + (current[entry] ?? 0), 0);
        const currentCount = current[resource] ?? 0;
        const ownedCount = selfPlayer.resources?.[resource] ?? 0;

        if (delta < 0) {
          if (currentCount <= 0) {
            return current;
          }

          return {
            ...current,
            [resource]: currentCount - 1
          };
        }

        if (totalSelected >= requiredDiscardCount || currentCount >= ownedCount) {
          return current;
        }

        return {
          ...current,
          [resource]: currentCount + 1
        };
      });
    },
    [requiredDiscardCount, selfPlayer?.resources]
  );

  const handleSubmitRobberDiscard = useCallback(() => {
    const currentMatch = matchRef.current;
    if (!currentMatch || !selfPlayer?.resources || requiredDiscardCount <= 0) {
      return;
    }

    if (selectedDiscardCount !== requiredDiscardCount) {
      pushToast("error", "Noch nicht vollständig", `Du musst genau ${requiredDiscardCount} Karten auswählen.`);
      return;
    }

    sendCurrent({
      type: "match.action",
      matchId: currentMatch.matchId,
      action: {
        type: "discard_resources",
        resources: robberDiscardDraft
      }
    });
  }, [pushToast, requiredDiscardCount, robberDiscardDraft, selectedDiscardCount, sendCurrent, selfPlayer?.resources]);

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

  const handleToggleSoundMuted = useCallback(() => {
    setSoundMuted((current) => {
      const next = !current;
      uiSoundManager.setMuted(next);
      if (!next) {
        playUiSound("notify", { volume: 0.82 });
      }
      return next;
    });
  }, [playUiSound]);

  const syncMusicPlayerState = useCallback(() => {
    setSelectedMusicTrackId(uiSoundManager.getSelectedMusicTrackId());
    setMusicPaused(uiSoundManager.isMusicPaused());
    setMusicPlaybackMode(uiSoundManager.getMusicPlaybackMode());
  }, []);

  useEffect(() => {
    syncMusicPlayerState();
    return uiSoundManager.subscribeToMusicState(syncMusicPlayerState);
  }, [syncMusicPlayerState]);

  const handleSelectMusicTrack = useCallback(
    (trackId: string) => {
      void uiSoundManager.setMusicTrack(trackId);
    },
    []
  );

  const handleToggleMusicPaused = useCallback(() => {
    void uiSoundManager.toggleMusicPaused();
  }, []);

  const handleMusicPlaybackModeChange = useCallback((nextMode: "single" | "cycle") => {
    void uiSoundManager.setMusicPlaybackMode(nextMode);
  }, []);

  const handleBoardVisualSettingsChange = useCallback((nextSettings: BoardVisualSettings) => {
    setBoardVisualSettings(nextSettings);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BOARD_VISUAL_SETTINGS_STORAGE_KEY, serializeBoardVisualSettings(nextSettings));
    }
  }, []);

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

  const handleJoinRoom = async () => {
    if (!room) {
      return;
    }

    try {
      const nextRoom = await joinRoom(room.id);
      setRoom(nextRoom);
      await loadMyRooms();
      const joinedSeat = nextRoom.seats.find((seat) => seat.userId === sessionRef.current?.id) ?? null;
      pushToast(
        "success",
        "Raum beigetreten",
        joinedSeat ? `Du sitzt jetzt automatisch auf Platz ${joinedSeat.index + 1}.` : `Du bist jetzt im Raum ${nextRoom.code}.`
      );
    } catch (joinError) {
      pushToast("error", "Beitritt fehlgeschlagen", (joinError as Error).message);
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

  const handleRoomSetupModeChange = async (setupMode: SetupMode) => {
    if (!room || room.setupMode === setupMode) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, { setupMode });
      setRoom(nextRoom);
      await loadMyRooms();
      pushToast(
        "success",
        "Aufbau aktualisiert",
        setupMode === "beginner" ? "Der Anfängeraufbau ist für den nächsten Start vorgemerkt." : "Der variable Aufbau ist für den nächsten Start vorgemerkt."
      );
    } catch (settingsError) {
      pushToast("error", "Aufbau konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleRoomStartingPlayerModeChange = async (startingPlayerMode: StartingPlayerMode) => {
    if (!room || room.startingPlayerMode === startingPlayerMode) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, { startingPlayerMode });
      setRoom(nextRoom);
      await loadMyRooms();
      pushToast(
        "success",
        "Startmodus aktualisiert",
        startingPlayerMode === "rolled"
          ? "Der erste Spieler wird vor Spielstart ausgewürfelt."
          : "Der erste Spieler wird wieder manuell durch den Host festgelegt."
      );
    } catch (settingsError) {
      pushToast("error", "Startmodus konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleRoomStartingSeatChange = async (startingSeatIndex: number) => {
    if (!room || room.startingPlayerMode !== "manual" || room.startingSeatIndex === startingSeatIndex) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, { startingSeatIndex });
      setRoom(nextRoom);
      await loadMyRooms();
      const startingSeat = nextRoom.seats.find((seat) => seat.index === nextRoom.startingSeatIndex);
      pushToast(
        "success",
        "Startspieler aktualisiert",
        startingSeat?.username
          ? `${startingSeat.username} eröffnet die Partie.`
          : `Platz ${nextRoom.startingSeatIndex + 1} eröffnet die Partie.`
      );
    } catch (settingsError) {
      pushToast("error", "Startspieler konnte nicht geändert werden", (settingsError as Error).message);
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
      playUiSound("click", { volume: 0.82 });
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
      playUiSound("click", { volume: 0.82 });
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
      playUiSound("click", { volume: 0.82 });
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
      playUiSound("click", { volume: 0.82 });
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
      playUiSound("click", { volume: 0.82 });
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

    if (interactionMode === "road_building" && match.allowedMoves.freeRoadEdgeIds.includes(edgeId)) {
      playUiSound("click", { volume: 0.78 });
      queueMatchConfirmation({
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "place_free_road",
          edgeId
        }
      });
    }
  };

  const handleTileSelect = (tileId: string) => {
    if (!match || interactionMode !== "robber") {
      return;
    }

    const option = match.allowedMoves.robberMoveOptions.find((entry) => entry.tileId === tileId);
    if (!option) {
      return;
    }

    if (option.targetPlayerIds.length > 1) {
      setPendingRobberTargetSelection({
        tileId,
        targetPlayerIds: option.targetPlayerIds
      });
      return;
    }

    queueRobberMoveConfirmation(tileId, option.targetPlayerIds[0]);
  };

  const sendTradeOffer = () => {
    if (!match) {
      return;
    }

    const toPlayerId = match.currentPlayerId === match.you ? tradeForm.targetPlayerId || null : match.currentPlayerId;

    queueMatchConfirmation(
      {
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "create_trade_offer",
          toPlayerId,
          give: cloneResourceMap(tradeForm.give),
          want: cloneResourceMap(tradeForm.want)
        }
      },
      () =>
        setTradeForm({
          give: createEmptyResourceMap(),
          want: createEmptyResourceMap(),
          targetPlayerId: ""
        })
      );
  };

  const guestInviteCode = !session && route.kind === "invite" ? route.code : null;

  useEffect(() => {
    const guestClassName = "guest-landing-mode";
    document.documentElement.classList.toggle(guestClassName, isGuestLanding);
    document.body.classList.toggle(guestClassName, isGuestLanding);

    return () => {
      document.documentElement.classList.remove(guestClassName);
      document.body.classList.remove(guestClassName);
    };
  }, [isGuestLanding]);

  if (isGuestLanding) {
    return (
      <>
        <LandingScreen
          authForm={authForm}
          authMode={authMode}
          inviteCode={guestInviteCode}
          onAuthFieldChange={(field, value) => setAuthForm((current) => ({ ...current, [field]: value }))}
          onAuthModeChange={setAuthMode}
          onSubmit={handleAuthSubmit}
        />
        <ToastStack onDismiss={removeToast} toasts={toasts} />
      </>
    );
  }

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
        boardVisualSettings={boardVisualSettings}
        connectionState={connectionState}
        connectionStatusText={status}
        eyebrow={displayEyebrow}
        meta={displayMeta}
        musicPaused={musicPaused}
        musicPlaybackMode={musicPlaybackMode}
        musicTracks={musicTracks}
        selectedMusicTrackId={selectedMusicTrackId}
        session={session}
        soundMuted={soundMuted}
        title={headerContext.title}
        onLogout={handleLogout}
        onMusicPlaybackModeChange={handleMusicPlaybackModeChange}
        onNavigateHome={() => navigateTo({ kind: "home" })}
        onSelectMusicTrack={handleSelectMusicTrack}
        onBoardVisualSettingsChange={handleBoardVisualSettingsChange}
        onToggleSoundMuted={handleToggleSoundMuted}
        onToggleMusicPaused={handleToggleMusicPaused}
        {...headerAdminProps}
        {...headerRoomProps}
      />

      <div className="app-stage">
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
              onJoinRoom={handleJoinRoom}
              onKickUser={handleKickRoomUser}
              onLeave={handleLeaveRoom}
              onReady={handleReadyToggle}
              onSetupModeChange={handleRoomSetupModeChange}
              onStartingPlayerModeChange={handleRoomStartingPlayerModeChange}
              onStartingSeatChange={handleRoomStartingSeatChange}
              onStart={handleStartRoom}
            />
          ) : (
            <StatusSurface title="Raum wird geladen" text="Hexagonia verbindet den privaten Raum mit deiner Sitzung." />
          )
        ) : null}

        {activeScreen === "match" && session ? (
          match ? (
            <MatchScreen
              boardVisualSettings={boardVisualSettings}
              interactionMode={interactionMode}
              maritimeForm={maritimeForm}
              match={match}
              monopolyResource={monopolyResource}
              profileMenuProps={{
                boardVisualSettings,
                connectionState,
                musicPaused,
                musicPlaybackMode,
                musicTracks,
                selectedMusicTrackId,
                session,
                soundMuted,
                onBoardVisualSettingsChange: handleBoardVisualSettingsChange,
                onMusicPlaybackModeChange: handleMusicPlaybackModeChange,
                onLogout: handleLogout,
                onNavigateHome: () => navigateTo({ kind: "home" }),
                onSelectMusicTrack: handleSelectMusicTrack,
                onToggleSoundMuted: handleToggleSoundMuted,
                onToggleMusicPaused: handleToggleMusicPaused,
                ...headerAdminProps,
                ...headerRoomProps
              }}
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

      {!robberUiDeferredByDiceAnimation && pendingRobberTargetSelection && match ? (
        <RobberTargetDialog
          players={match.players}
          targetPlayerIds={pendingRobberTargetSelection.targetPlayerIds}
          onCancel={() => setPendingRobberTargetSelection(null)}
          onSelect={(targetPlayerId) => {
            if (!pendingRobberTargetSelection) {
              return;
            }
            const { tileId } = pendingRobberTargetSelection;
            setPendingRobberTargetSelection(null);
            queueRobberMoveConfirmation(tileId, targetPlayerId);
          }}
        />
      ) : null}

      {!robberUiDeferredByDiceAnimation && requiredDiscardCount > 0 ? (
        <RobberDiscardDialog
          canConfirm={canSubmitRobberDiscard}
          draft={robberDiscardDraft}
          minimized={robberDiscardMinimized}
          ownedResources={selfPlayer?.resources ?? null}
          remainingCount={remainingDiscardCount}
          requiredCount={requiredDiscardCount}
          players={match?.players ?? []}
          robberDiscardStatus={robberDiscardStatus}
          selectedCount={selectedDiscardCount}
          onAdjust={handleAdjustRobberDiscard}
          onConfirm={handleSubmitRobberDiscard}
          onExpand={() => setRobberDiscardMinimized(false)}
          onMinimize={() => setRobberDiscardMinimized(true)}
        />
      ) : null}

      {!robberUiDeferredByDiceAnimation &&
      match &&
      match.phase === "robber_interrupt" &&
      requiredDiscardCount === 0 &&
      robberDiscardStatus.length > 0 &&
      match.allowedMoves.robberMoveOptions.length === 0 &&
      !pendingRobberTargetSelection ? (
        <RobberWaitDialog
          currentPlayer={match.players.find((player) => player.id === match.currentPlayerId) ?? null}
          players={match.players}
          robberDiscardStatus={robberDiscardStatus}
        />
      ) : null}

      <ToastStack onDismiss={removeToast} toasts={toasts} />
    </main>
  );
}

function getLatestDiceRollEvent(match: MatchSnapshot): MatchSnapshot["eventLog"][number] | null {
  for (let index = match.eventLog.length - 1; index >= 0; index -= 1) {
    const event = match.eventLog[index];
    if (event?.type === "dice_rolled") {
      return event;
    }
  }

  return null;
}

function getReconnectJitter(attempt: number): number {
  return (attempt * 173) % 351;
}

function getToastSoundId(tone: ToastMessage["tone"]) {
  switch (tone) {
    case "error":
      return "error" as const;
    case "success":
      return "success" as const;
    default:
      return "notify" as const;
  }
}

function getActionableTradeCount(match: MatchSnapshot): number {
  return new Set([
    ...match.allowedMoves.acceptableTradeOfferIds,
    ...match.allowedMoves.declineableTradeOfferIds
  ]).size;
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

function RobberTargetDialog(props: {
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

function RobberDiscardDialog(props: {
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
                    −
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
          <div className={`discard-helper ${props.remainingCount === 0 ? "is-complete" : "is-warning"}`}>
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

function RobberWaitDialog(props: {
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
                ? `${props.currentPlayer.username} versetzt jetzt den Räuber.`
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

function sendMessage(socket: WebSocket, message: ClientMessage) {
  socket.send(JSON.stringify(message));
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
        title: "Straßenbau spielen?",
        detail: "Die Karte wird aktiviert. Danach setzt du eine oder zwei kostenlose Straßen direkt über das Brett.",
        confirmLabel: "Straßenbau starten"
      };
    case "place_free_road":
      return {
        title: "Kostenlose Straße setzen?",
        detail: "Die ausgewählte Kante wird als kostenlose Straße aus dem Straßenbau-Effekt gesetzt.",
        confirmLabel: "Straße setzen"
      };
    case "finish_road_building":
      return {
        title: "Straßenbau beenden?",
        detail: "Der offene Straßenbau-Effekt wird beendet. Du kannst in diesem Zug danach normal weiterspielen.",
        confirmLabel: "Straßenbau beenden"
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
    case "create_trade_offer": {
      const targetName = action.toPlayerId
        ? match.players.find((player) => player.id === action.toPlayerId)?.username ?? "dem Zielspieler"
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
      return null;
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
