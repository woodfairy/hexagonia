import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  AdminMatchSummary,
  AdminUserRecord,
  AuthUser,
  BoardSize,
  ClientMessage,
  MatchSnapshot,
  Resource,
  ResourceMap,
  RoomDetails,
  RulesPreset,
  SetupMode,
  StartingPlayerMode,
  ServerMessage,
  TurnRule,
  UserRole
} from "@hexagonia/shared";
import {
  BUILD_COSTS,
  cloneResourceMap,
  createEmptyResourceMap,
  hasResources,
  RESOURCES,
  sanitizeUsernameInput
} from "@hexagonia/shared";
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
import { bindGlobalHapticsUnlock, uiHapticsManager } from "./audio/uiHapticsManager";
import { bindGlobalMusicUnlock, bindGlobalUiSounds, uiSoundManager } from "./audio/uiSoundManager";
import {
  AppHeaderSkeleton,
  DeepLinkBootSkeleton,
  getActionableTradeCount,
  getMatchActionConfirmation,
  getMatchActionKey,
  getNextAdminUserDraft,
  getReconnectJitter,
  getToastHapticId,
  sendMessage
} from "./appSupport";
import type { InteractionMode } from "./BoardScene";
import {
  type BoardVisualSettings,
  persistBoardVisualSettings,
  resolveInitialBoardVisualSettings,
} from "./boardVisuals";
import { AppHeader } from "./components/shell/AppHeader";
import { ToastStack, type ToastMessage } from "./components/shell/ToastStack";
import { AdminScreen, type AdminCreateFormState, type AdminUserDraftState } from "./components/screens/AdminScreen";
import { LandingScreen } from "./components/screens/LandingScreen";
import { LobbyScreen } from "./components/screens/LobbyScreen";
import {
  RobberDiscardDialog,
  RobberWaitDialog
} from "./components/screens/MatchDialogs";
import {
  MatchScreen,
  type MaritimeFormState,
  type PendingBoardActionState,
  type TradeFormState
} from "./components/screens/MatchScreen";
import { getLatestDiceRollEvent } from "./components/screens/matchScreenViewModel";
import { RoomScreen } from "./components/screens/RoomScreen";
import { PlayerMention } from "./components/shared/PlayerText";
import { getRecaptchaRegisterToken } from "./recaptcha";
import {
  type AuthMode,
  type ConnectionState,
  type RouteState,
  readRoute
} from "./ui";

const TEXT = {
  title: "Hexagonia",
  subtitle: "Mit Freunden spielen, handeln und direkt loslegen"
} as const;

const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 40000;
const RECONNECT_BASE_MS = 1200;
const RECONNECT_MAX_MS = 12000;
const DICE_EXPAND_MS = 0;
const DICE_ROLL_MS = 560;
const DICE_SETTLE_MS = 260;
const DICE_REVEAL_DELAY_MS = DICE_EXPAND_MS + DICE_ROLL_MS + DICE_SETTLE_MS;
type MatchEvent = MatchSnapshot["eventLog"][number];
type DiceRollEvent = Extract<MatchEvent, { type: "dice_rolled" }>;

interface UiFeedbackRequest {
  sound?: Parameters<typeof uiSoundManager.play>;
  haptic?: Parameters<typeof uiHapticsManager.play>[0];
}

function getMatchEventHapticId(event: MatchEvent): Parameters<typeof uiHapticsManager.play>[0] | null {
  switch (event.type) {
    case "resources_discarded":
    case "robber_moved":
      return "robber";
    case "development_card_played":
      return event.payload.cardType === "knight" ? "robber" : "event";
    case "resources_distributed":
    case "trade_offered":
    case "turn_ended":
    case "game_won":
      return null;
    default:
      return "event";
  }
}

function getMatchEventHapticPriority(haptic: Parameters<typeof uiHapticsManager.play>[0]): number {
  switch (haptic) {
    case "robber":
      return 4;
    case "dice":
      return 3;
    case "event":
      return 1;
    default:
      return 0;
  }
}

function getNewMatchEventHaptic(events: MatchEvent[]): Parameters<typeof uiHapticsManager.play>[0] | null {
  let bestHaptic: Parameters<typeof uiHapticsManager.play>[0] | null = null;
  let bestPriority = 0;

  for (const event of events) {
    const haptic = getMatchEventHapticId(event);
    if (!haptic) {
      continue;
    }

    const priority = getMatchEventHapticPriority(haptic);
    if (priority >= bestPriority) {
      bestHaptic = haptic;
      bestPriority = priority;
    }
  }

  return bestHaptic;
}

export function App() {
  const [session, setSession] = useState<AuthUser | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [serverMatch, setServerMatch] = useState<MatchSnapshot | null>(null);
  const [myRooms, setMyRooms] = useState<RoomDetails[]>([]);
  const [presence, setPresence] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("Verbindung wird aufgebaut.");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [socketEpoch, setSocketEpoch] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [soundMuted, setSoundMuted] = useState(() => uiSoundManager.isMuted());
  const [hapticsMuted, setHapticsMuted] = useState(() => uiHapticsManager.isMuted());
  const [selectedMusicTrackId, setSelectedMusicTrackId] = useState(() => uiSoundManager.getSelectedMusicTrackId());
  const [musicPaused, setMusicPaused] = useState(() => uiSoundManager.isMusicPaused());
  const [musicPlaybackMode, setMusicPlaybackMode] = useState(() => uiSoundManager.getMusicPlaybackMode());
  const [boardVisualSettings, setBoardVisualSettings] = useState<BoardVisualSettings>(() => resolveInitialBoardVisualSettings());
  const [authSubmitPending, setAuthSubmitPending] = useState(false);
  const [createRoomPending, setCreateRoomPending] = useState(false);
  const [joinByCodePending, setJoinByCodePending] = useState(false);
  const [roomJoinPending, setRoomJoinPending] = useState(false);
  const [roomReadyPending, setRoomReadyPending] = useState(false);
  const [roomStartPending, setRoomStartPending] = useState(false);
  const [roomLeavePending, setRoomLeavePending] = useState(false);
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
  const [pendingBoardAction, setPendingBoardAction] = useState<PendingBoardActionState | null>(null);
  const [robberDiscardDraft, setRobberDiscardDraft] = useState<ResourceMap>(() => createEmptyResourceMap());
  const [robberDiscardMinimized, setRobberDiscardMinimized] = useState(false);
  const [pendingDiceRevealEvent, setPendingDiceRevealEvent] = useState<DiceRollEvent | null>(null);
  const musicTracks = useMemo(() => uiSoundManager.getMusicTracks(), []);
  const hapticsSupported = uiHapticsManager.isSupported();

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
  const wasRobberUiDeferredRef = useRef(false);
  const lastDiceHapticMatchIdRef = useRef<string | null>(null);
  const lastDiceHapticEventIdRef = useRef<string | null>(null);
  const diceRevealTimerRef = useRef<number | null>(null);
  const pendingRevealedMatchRef = useRef<MatchSnapshot | null>(null);
  const matchFeedbackStateRef = useRef<{
    matchId: string | null;
    currentPlayerId: string | null;
    actionableTradeCount: number;
    winnerId: string | null;
    eventCount: number;
  }>({
    matchId: null,
    currentPlayerId: null,
    actionableTradeCount: 0,
    winnerId: null,
    eventCount: 0
  });

  const selfPlayer = useMemo(
    () => match?.players.find((player) => player.id === match.you) ?? null,
    [match]
  );
  const latestDiceEvent = useMemo(() => (match ? getLatestDiceRollEvent(match) : null), [match]);
  const visibleDiceEvent = pendingDiceRevealEvent ?? latestDiceEvent;
  const requiredDiscardCount = match?.allowedMoves.pendingDiscardCount ?? 0;
  const selectedDiscardCount = useMemo(
    () => RESOURCES.reduce((sum, resource) => sum + (robberDiscardDraft[resource] ?? 0), 0),
    [robberDiscardDraft]
  );
  const remainingDiscardCount = Math.max(0, requiredDiscardCount - selectedDiscardCount);
  const canSubmitRobberDiscard =
    !!match && !!selfPlayer?.resources && requiredDiscardCount > 0 && selectedDiscardCount === requiredDiscardCount;
  const robberDiscardStatus = match?.robberDiscardStatus ?? [];
  const robberUiDeferredByDiceAnimation = pendingDiceRevealEvent !== null;

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
  const isBootingDeepLink = session === undefined && route.kind !== "home";
  const isGuestLanding = activeScreen === "auth" && !isBootingDeepLink;

  const playUiFeedback = useCallback(
    ({ sound, haptic }: UiFeedbackRequest) => {
      if (sound && !isGuestLanding) {
        void uiSoundManager.play(...sound);
      }

      if (haptic) {
        void uiHapticsManager.play(haptic);
      }
    },
    [isGuestLanding]
  );

  const handleRollDiceHaptic = useCallback(() => {
    playUiFeedback({ haptic: "dice" });
  }, [playUiFeedback]);

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
        meta: room ? `Code ${room.code} · ${room.seats.filter((seat) => seat.userId).length}/6 Spieler` : "Synchronisation läuft"
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
      playUiFeedback({ haptic: getToastHapticId(tone) });
      setToasts((current) => [...current, nextToast].slice(-4));
      window.setTimeout(() => {
        removeToast(id);
      }, tone === "error" ? 5400 : 3600);
    },
    [playUiFeedback, removeToast]
  );

  useEffect(() => {
    uiHapticsManager.prime();
    uiSoundManager.prime();
    const hapticsCleanup = bindGlobalHapticsUnlock();
    const cleanup = bindGlobalMusicUnlock();
    return () => {
      hapticsCleanup();
      cleanup();
    };
  }, []);

  useEffect(() => {
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

    void uiSoundManager.applyAuthenticatedMusicDefault();
  }, [session]);

  useEffect(() => {
    if (session === undefined) {
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
    return () => {
      if (diceRevealTimerRef.current !== null) {
        window.clearTimeout(diceRevealTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!serverMatch) {
      pendingRevealedMatchRef.current = null;
      if (diceRevealTimerRef.current !== null) {
        window.clearTimeout(diceRevealTimerRef.current);
        diceRevealTimerRef.current = null;
      }
      if (pendingDiceRevealEvent !== null) {
        setPendingDiceRevealEvent(null);
      }
      if (match !== null) {
        setMatch(null);
      }
      return;
    }

    if (!match || match.matchId !== serverMatch.matchId) {
      pendingRevealedMatchRef.current = null;
      if (diceRevealTimerRef.current !== null) {
        window.clearTimeout(diceRevealTimerRef.current);
        diceRevealTimerRef.current = null;
      }
      if (pendingDiceRevealEvent !== null) {
        setPendingDiceRevealEvent(null);
      }
      if (match !== serverMatch) {
        setMatch(serverMatch);
      }
      return;
    }

    if (pendingDiceRevealEvent) {
      pendingRevealedMatchRef.current = serverMatch;
      return;
    }

    const nextDiceEvent = getLatestDiceRollEvent(serverMatch);
    if (nextDiceEvent && nextDiceEvent.id !== (latestDiceEvent?.id ?? null)) {
      pendingRevealedMatchRef.current = serverMatch;
      setPendingDiceRevealEvent(nextDiceEvent);
      if (diceRevealTimerRef.current !== null) {
        window.clearTimeout(diceRevealTimerRef.current);
      }
      diceRevealTimerRef.current = window.setTimeout(() => {
        const nextMatch = pendingRevealedMatchRef.current;
        pendingRevealedMatchRef.current = null;
        diceRevealTimerRef.current = null;
        setPendingDiceRevealEvent(null);
        if (nextMatch) {
          setMatch(nextMatch);
        }
      }, DICE_REVEAL_DELAY_MS);
      return;
    }

    if (match.version !== serverMatch.version) {
      setMatch(serverMatch);
    }
  }, [latestDiceEvent?.id, match, pendingDiceRevealEvent, serverMatch]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!match) {
      matchFeedbackStateRef.current = {
        matchId: null,
        currentPlayerId: null,
        actionableTradeCount: 0,
        winnerId: null,
        eventCount: 0
      };
      lastDiceHapticEventIdRef.current = null;
      return;
    }

    const actionableTradeCount = getActionableTradeCount(match);
    const previous = matchFeedbackStateRef.current;

    if (previous.matchId === match.matchId) {
      const newEvents =
        match.eventLog.length > previous.eventCount ? match.eventLog.slice(previous.eventCount) : [];
      const eventHaptic = getNewMatchEventHaptic(newEvents);
      if (eventHaptic) {
        playUiFeedback({ haptic: eventHaptic });
      }

      if (previous.currentPlayerId !== match.currentPlayerId && match.currentPlayerId === match.you) {
        playUiFeedback({ haptic: "nudge" });
      }

      if (previous.actionableTradeCount === 0 && actionableTradeCount > 0) {
        playUiFeedback({ haptic: "nudge" });
      }

      if (!previous.winnerId && match.winnerId) {
        playUiFeedback({ haptic: match.winnerId === match.you ? "success" : "nudge" });
      }
    }

    matchFeedbackStateRef.current = {
      matchId: match.matchId,
      currentPlayerId: match.currentPlayerId,
      actionableTradeCount,
      winnerId: match.winnerId,
      eventCount: match.eventLog.length
    };
  }, [match, playUiFeedback]);

  useEffect(() => {
    const latestDiceEventId = visibleDiceEvent?.id ?? null;

    if (!match) {
      lastDiceHapticMatchIdRef.current = null;
      lastDiceHapticEventIdRef.current = null;
      return;
    }

    if (lastDiceHapticMatchIdRef.current !== match.matchId) {
      lastDiceHapticMatchIdRef.current = match.matchId;
      lastDiceHapticEventIdRef.current = latestDiceEventId;
      return;
    }

    if (lastDiceHapticEventIdRef.current === null) {
      lastDiceHapticEventIdRef.current = latestDiceEventId;
      return;
    }

    if (!visibleDiceEvent || latestDiceEventId === lastDiceHapticEventIdRef.current) {
      return;
    }

    lastDiceHapticEventIdRef.current = latestDiceEventId;
    if (visibleDiceEvent.byPlayerId !== match.you) {
      playUiFeedback({ haptic: "dice" });
    }
  }, [match, playUiFeedback, visibleDiceEvent]);

  useEffect(() => {
    setPendingBoardAction(null);
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
    const wasDeferred = wasRobberUiDeferredRef.current;
    wasRobberUiDeferredRef.current = robberUiDeferredByDiceAnimation;

    if (!wasDeferred || robberUiDeferredByDiceAnimation || !match) {
      return;
    }

    const robberUiActive =
      match.phase === "robber_interrupt" &&
      (requiredDiscardCount > 0 ||
        match.allowedMoves.robberMoveOptions.length > 0 ||
        match.robberDiscardStatus.length > 0 ||
        pendingBoardAction !== null);

    if (!robberUiActive) {
      return;
    }

    playUiFeedback({ haptic: "dice" });
  }, [
    match,
    pendingBoardAction,
    playUiFeedback,
    requiredDiscardCount,
    robberUiDeferredByDiceAnimation
  ]);

  useEffect(() => {
    if (!match) {
      setPendingBoardAction(null);
      return;
    }

    setPendingBoardAction((current) => {
      if (!current) {
        return null;
      }

      switch (current.message.action.type) {
        case "place_initial_settlement":
          return match.allowedMoves.initialSettlementVertexIds.includes(current.selection.id)
            ? {
                ...current,
                message: {
                  ...current.message,
                  matchId: match.matchId
                }
              }
            : null;
        case "place_initial_road":
          return match.allowedMoves.initialRoadEdgeIds.includes(current.selection.id)
            ? {
                ...current,
                message: {
                  ...current.message,
                  matchId: match.matchId
                }
              }
            : null;
        case "build_road":
          return interactionMode === "road" && match.allowedMoves.roadEdgeIds.includes(current.selection.id)
            ? {
                ...current,
                message: {
                  ...current.message,
                  matchId: match.matchId
                }
              }
            : null;
        case "build_settlement":
          return interactionMode === "settlement" && match.allowedMoves.settlementVertexIds.includes(current.selection.id)
            ? {
                ...current,
                message: {
                  ...current.message,
                  matchId: match.matchId
                }
              }
            : null;
        case "build_city":
          return interactionMode === "city" && match.allowedMoves.cityVertexIds.includes(current.selection.id)
            ? {
                ...current,
                message: {
                  ...current.message,
                  matchId: match.matchId
                }
              }
            : null;
        case "place_free_road":
          return interactionMode === "road_building" && match.allowedMoves.freeRoadEdgeIds.includes(current.selection.id)
            ? {
                ...current,
                message: {
                  ...current.message,
                  matchId: match.matchId
                }
              }
            : null;
        case "move_robber": {
          if (interactionMode !== "robber") {
            return null;
          }

          const option = match.allowedMoves.robberMoveOptions.find((entry) => entry.tileId === current.selection.id);
          if (!option) {
            return null;
          }

          const targetPlayerId =
            current.message.action.targetPlayerId && option.targetPlayerIds.includes(current.message.action.targetPlayerId)
              ? current.message.action.targetPlayerId
              : undefined;
          const action: Extract<ClientMessage, { type: "match.action" }>["action"] = {
            type: "move_robber",
            tileId: current.selection.id,
            ...(targetPlayerId ? { targetPlayerId } : {})
          };
          const confirmation = getMatchActionConfirmation(match, action);
          if (!confirmation) {
            return null;
          }

          return {
            ...current,
            ...confirmation,
            key: getMatchActionKey(action),
            message: {
              ...current.message,
              matchId: match.matchId,
              action
            },
            targetPlayerIds: option.targetPlayerIds
          };
        }
        default:
          return null;
      }
    });
  }, [interactionMode, match]);

  useEffect(() => {
    const dialogOpen = !!pendingBoardAction;
    if (!hasSeenDialogStateRef.current) {
      hasSeenDialogStateRef.current = true;
      return;
    }

    if (!dialogOpen) {
      return;
    }

    playUiFeedback({ haptic: "dialog" });
  }, [pendingBoardAction, playUiFeedback]);

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
    (nextStatus = "Die Verbindung wird wiederhergestellt.") => {
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
    setStatus(`Hier auf der Insel ist der Empfang gerade schwach. Neuer Versuch in ${seconds}s.`);

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      triggerReconnect("Die Verbindung wird wiederhergestellt.");
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
      setMatch(null);
      setServerMatch(null);
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
    triggerReconnect("Die Verbindung wird hergestellt.");
  }, [clearHeartbeatTimer, clearReconnectTimer, loadAdminData, loadMyRooms, session, triggerReconnect]);

  useEffect(() => {
    const reconnectIfNeeded = () => {
      if (!sessionRef.current) {
        return;
      }

      reconnectAttemptRef.current = 0;
      triggerReconnect("Die Verbindung wird nach deiner Rueckkehr wiederhergestellt.");
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
          setStatus("Hier auf der Insel scheint der Empfang schlecht zu sein. Ein neuer Versuch folgt.");
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
      setStatus("Verbindung steht.");
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
          setServerMatch(null);
          setPendingBoardAction(null);
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
          setServerMatch(null);
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
        setServerMatch(message.snapshot);
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
        triggerReconnect("Der Raum wird wieder verbunden.");
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
        triggerReconnect("Die Partie wird wieder verbunden.");
      }
    }
  }, [loadAdminData, pushToast, route, session, triggerReconnect]);

  useEffect(() => {
    if (!match) {
      setPendingBoardAction(null);
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

    if (interactionMode === "robber") {
      setInteractionMode(null);
      setSelectedRoadEdges([]);
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
        triggerReconnect("Die Verbindung wird wiederhergestellt.");
        pushToast(
          "error",
          "Empfang gerade schlecht",
          "Hier auf der Insel scheint der Empfang schlecht zu sein. Bitte lade die Seite neu und versuche es erneut."
        );
        return;
      }
      sendMessage(wsRef.current, message);
    },
    [pushToast, triggerReconnect]
  );

  const dispatchMatchAction = useCallback(
    (message: Extract<ClientMessage, { type: "match.action" }>, afterConfirm?: () => void) => {
      sendCurrent(message);

      const builtInAfterConfirm =
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

      builtInAfterConfirm?.();
      afterConfirm?.();
    },
    [sendCurrent]
  );

  const handleMatchAction = useCallback(
    (message: ClientMessage) => {
      if (message.type !== "match.action") {
        sendCurrent(message);
        return;
      }

      dispatchMatchAction(message);
    },
    [dispatchMatchAction, sendCurrent]
  );

  const handleConfirmPendingBoardAction = useCallback(() => {
    if (!pendingBoardAction) {
      return;
    }

    if (
      pendingBoardAction.message.action.type === "move_robber" &&
      pendingBoardAction.targetPlayerIds.length > 1 &&
      !pendingBoardAction.message.action.targetPlayerId
    ) {
      return;
    }

    setPendingBoardAction(null);
    dispatchMatchAction(pendingBoardAction.message, pendingBoardAction.afterConfirm);
  }, [dispatchMatchAction, pendingBoardAction]);

  const handleCancelPendingBoardAction = useCallback(() => {
    setPendingBoardAction(null);
  }, []);

  const armBoardAction = useCallback(
    (
      message: Extract<ClientMessage, { type: "match.action" }>,
      selection: PendingBoardActionState["selection"],
      options?: {
        afterConfirm?: () => void;
        targetPlayerIds?: string[];
      }
    ) => {
      const currentMatch = matchRef.current;
      if (!currentMatch) {
        return;
      }

      const confirmation = getMatchActionConfirmation(currentMatch, message.action);
      if (!confirmation) {
        dispatchMatchAction(message, options?.afterConfirm);
        return;
      }

      const nextKey = getMatchActionKey(message.action);
      const currentPendingBoardAction = pendingBoardAction;
      const sameSelection =
        !!currentPendingBoardAction &&
        currentPendingBoardAction.selection.kind === selection.kind &&
        currentPendingBoardAction.selection.id === selection.id &&
        currentPendingBoardAction.key === nextKey;
      const requiresTargetSelection =
        message.action.type === "move_robber" &&
        (options?.targetPlayerIds?.length ?? 0) > 1 &&
        !message.action.targetPlayerId;

      if (sameSelection && !requiresTargetSelection) {
        setPendingBoardAction(null);
        dispatchMatchAction(message, options?.afterConfirm);
        return;
      }

      setPendingBoardAction({
        ...confirmation,
        key: nextKey,
        message,
        selection,
        targetPlayerIds: options?.targetPlayerIds ?? [],
        ...(options?.afterConfirm ? { afterConfirm: options.afterConfirm } : {})
      });
    },
    [dispatchMatchAction, pendingBoardAction]
  );

  const handleSelectPendingRobberTarget = useCallback((targetPlayerId: string) => {
    const currentMatch = matchRef.current;
    if (!currentMatch) {
      return;
    }

    setPendingBoardAction((current) => {
      if (!current || current.message.action.type !== "move_robber") {
        return current;
      }

      const action: Extract<ClientMessage, { type: "match.action" }>["action"] = {
        type: "move_robber",
        tileId: current.selection.id,
        targetPlayerId
      };
      const confirmation = getMatchActionConfirmation(currentMatch, action);
      if (!confirmation) {
        return null;
      }

      return {
        ...current,
        ...confirmation,
        key: getMatchActionKey(action),
        message: {
          ...current.message,
          matchId: currentMatch.matchId,
          action
        }
      };
    });
  }, []);

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
      playUiFeedback({ haptic: "dialog" });
      navigateTo({ kind: "room", roomId });
      triggerReconnect("Der Raum wird wieder verbunden.");
    },
    [navigateTo, playUiFeedback, triggerReconnect]
  );

  const handleResumeMatch = useCallback(
    (matchId: string) => {
      playUiFeedback({ haptic: "dialog" });
      navigateTo({ kind: "match", matchId });
      triggerReconnect("Die Partie wird wieder verbunden.");
    },
    [navigateTo, playUiFeedback, triggerReconnect]
  );

  const handleOpenAdmin = useCallback(() => {
    playUiFeedback({ haptic: "dialog" });
    navigateTo({ kind: "admin" });
  }, [navigateTo, playUiFeedback]);

  const handleToggleSoundMuted = useCallback(() => {
    setSoundMuted((current) => {
      const next = !current;
      uiSoundManager.setMuted(next);
      if (!next) {
        playUiFeedback({ sound: ["click", { volume: 0.82 }] });
      }
      return next;
    });
  }, [playUiFeedback]);

  const handleToggleHapticsMuted = useCallback(() => {
    if (!hapticsSupported) {
      return;
    }

    setHapticsMuted((current) => {
      const next = !current;
      uiHapticsManager.setMuted(next);
      return next;
    });
  }, [hapticsSupported]);

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
    persistBoardVisualSettings(nextSettings);
  }, []);

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (authSubmitPending) {
      return;
    }

    setAuthSubmitPending(true);
    try {
      const recaptchaToken = authMode === "register" ? await getRecaptchaRegisterToken() : null;
      const user =
        authMode === "login"
          ? await login({
              username: authForm.username,
              password: authForm.password
            })
          : await register({
              username: authForm.username,
              password: authForm.password,
              ...(recaptchaToken ? { recaptchaToken } : {})
            });

      setSession(user);
      setAuthForm({ username: "", password: "" });
      setStatus(`${user.username} ist angemeldet.`);
      playUiFeedback({ haptic: "success" });
    } catch (authError) {
      pushToast("error", "Anmeldung fehlgeschlagen", (authError as Error).message);
    } finally {
      setAuthSubmitPending(false);
    }
  };

  const handleCreateRoom = async () => {
    if (createRoomPending) {
      return;
    }

    setCreateRoomPending(true);
    try {
      const nextRoom = await createRoom();
      setRoom(nextRoom);
      await loadMyRooms();
      navigateTo({ kind: "room", roomId: nextRoom.id });
      subscribeRoom(nextRoom.id);
      pushToast("success", "Raum erstellt", `Code ${nextRoom.code} ist bereit.`);
    } catch (roomError) {
      pushToast("error", "Raum konnte nicht erstellt werden", (roomError as Error).message);
    } finally {
      setCreateRoomPending(false);
    }
  };

  const handleJoinByCode = async () => {
    if (joinByCodePending) {
      return;
    }

    setJoinByCodePending(true);
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
    } finally {
      setJoinByCodePending(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!room || roomJoinPending) {
      return;
    }

    setRoomJoinPending(true);
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
    } finally {
      setRoomJoinPending(false);
    }
  };

  const handleReadyToggle = async (ready: boolean) => {
    if (!room || roomReadyPending) {
      return;
    }

    setRoomReadyPending(true);
    try {
      const nextRoom = await setReady(room.id, ready);
      setRoom(nextRoom);
      await loadMyRooms();
      playUiFeedback({ haptic: "success" });
    } catch (readyError) {
      pushToast("error", "Ready-Status fehlgeschlagen", (readyError as Error).message);
    } finally {
      setRoomReadyPending(false);
    }
  };

  const handleRoomSetupModeChange = async (setupMode: SetupMode) => {
    if (!room || room.gameConfig.setupMode === setupMode) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, { setupMode });
      setRoom(nextRoom);
      await loadMyRooms();
    } catch (settingsError) {
      pushToast("error", "Aufbau konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleRoomRulesPresetChange = async (rulesPreset: RulesPreset) => {
    if (!room || room.gameConfig.rulesPreset === rulesPreset) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, { rulesPreset });
      setRoom(nextRoom);
      await loadMyRooms();
    } catch (settingsError) {
      pushToast("error", "Regelprofil konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleRoomBoardSizeChange = async (boardSize: BoardSize) => {
    if (!room || room.gameConfig.boardSize === boardSize) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, { boardSize });
      setRoom(nextRoom);
      await loadMyRooms();
    } catch (settingsError) {
      pushToast("error", "Spielfeld konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleRoomTurnRuleChange = async (turnRule: TurnRule) => {
    if (!room || room.gameConfig.turnRule === turnRule) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, { turnRule });
      setRoom(nextRoom);
      await loadMyRooms();
    } catch (settingsError) {
      pushToast("error", "Zugregel konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleRoomStartingPlayerModeChange = async (startingPlayerMode: StartingPlayerMode) => {
    if (!room || room.gameConfig.startingPlayer.mode === startingPlayerMode) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, {
        startingPlayer: {
          mode: startingPlayerMode
        }
      });
      setRoom(nextRoom);
      await loadMyRooms();
    } catch (settingsError) {
      pushToast("error", "Startmodus konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleRoomStartingSeatChange = async (startingSeatIndex: number) => {
    if (
      !room ||
      room.gameConfig.startingPlayer.mode !== "manual" ||
      room.gameConfig.startingPlayer.seatIndex === startingSeatIndex
    ) {
      return;
    }

    try {
      const nextRoom = await updateRoomSettings(room.id, {
        startingPlayer: {
          seatIndex: startingSeatIndex
        }
      });
      setRoom(nextRoom);
      await loadMyRooms();
    } catch (settingsError) {
      pushToast("error", "Startspieler konnte nicht geändert werden", (settingsError as Error).message);
    }
  };

  const handleLeaveRoom = async () => {
    if (!room || roomLeavePending) {
      return;
    }

    setRoomLeavePending(true);
    try {
      await leaveRoom(room.id);
      setRoom(null);
      setMatch(null);
      setServerMatch(null);
      setPresence([]);
      await loadMyRooms();
      navigateTo({ kind: "home" });
      pushToast("info", "Raum verlassen", "Du bist zurück in der Zentrale.");
    } catch (leaveError) {
      pushToast("error", "Raum konnte nicht verlassen werden", (leaveError as Error).message);
    } finally {
      setRoomLeavePending(false);
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
    if (!room || roomStartPending) {
      return;
    }

    setRoomStartPending(true);
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
    } finally {
      setRoomStartPending(false);
    }
  };

  const handleLogout = async () => {
    try {
      suppressCloseToastRef.current = true;
      await logout();
      setSession(null);
      setRoom(null);
      setMatch(null);
      setServerMatch(null);
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
          username: sanitizeUsernameInput(value)
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
        setServerMatch(null);
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
        setServerMatch(null);
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
      playUiFeedback({ haptic: "nudge" });
      armBoardAction(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "place_initial_settlement",
            vertexId
          }
        },
        { kind: "vertex", id: vertexId }
      );
      return;
    }

    if (
      interactionMode === "settlement" &&
      !!selfResources &&
      hasResources(selfResources, BUILD_COSTS.settlement) &&
      match.allowedMoves.settlementVertexIds.includes(vertexId)
    ) {
      playUiFeedback({ haptic: "nudge" });
      armBoardAction(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "build_settlement",
            vertexId
          }
        },
        { kind: "vertex", id: vertexId },
        { afterConfirm: () => setInteractionMode(null) }
      );
    }

    if (
      interactionMode === "city" &&
      !!selfResources &&
      hasResources(selfResources, BUILD_COSTS.city) &&
      match.allowedMoves.cityVertexIds.includes(vertexId)
    ) {
      playUiFeedback({ haptic: "nudge" });
      armBoardAction(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "build_city",
            vertexId
          }
        },
        { kind: "vertex", id: vertexId },
        { afterConfirm: () => setInteractionMode(null) }
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
      playUiFeedback({ haptic: "nudge" });
      armBoardAction(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "place_initial_road",
            edgeId
          }
        },
        { kind: "edge", id: edgeId }
      );
      return;
    }

    if (
      interactionMode === "road" &&
      !!selfResources &&
      hasResources(selfResources, BUILD_COSTS.road) &&
      match.allowedMoves.roadEdgeIds.includes(edgeId)
    ) {
      playUiFeedback({ haptic: "nudge" });
      armBoardAction(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "build_road",
            edgeId
          }
        },
        { kind: "edge", id: edgeId },
        { afterConfirm: () => setInteractionMode(null) }
      );
    }

    if (interactionMode === "road_building" && match.allowedMoves.freeRoadEdgeIds.includes(edgeId)) {
      playUiFeedback({ haptic: "nudge" });
      armBoardAction(
        {
          type: "match.action",
          matchId: match.matchId,
          action: {
            type: "place_free_road",
            edgeId
          }
        },
        { kind: "edge", id: edgeId }
      );
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

    armBoardAction(
      {
        type: "match.action",
        matchId: match.matchId,
        action: {
          type: "move_robber",
          tileId,
          ...(option.targetPlayerIds.length === 1 ? { targetPlayerId: option.targetPlayerIds[0] } : {})
        }
      },
      { kind: "tile", id: tileId },
      {
        afterConfirm: () => setInteractionMode(null),
        targetPlayerIds: option.targetPlayerIds
      }
    );
  };

  const sendTradeOffer = () => {
    if (!match) {
      return;
    }

    const toPlayerId = match.currentPlayerId === match.you ? tradeForm.targetPlayerId || null : match.currentPlayerId;

    handleMatchAction({
      type: "match.action",
      matchId: match.matchId,
      action: {
        type: "create_trade_offer",
        toPlayerId,
        give: cloneResourceMap(tradeForm.give),
        want: cloneResourceMap(tradeForm.want)
      }
    });
    setTradeForm({
      give: createEmptyResourceMap(),
      want: createEmptyResourceMap(),
      targetPlayerId: ""
    });
  };

  const handleAuthFieldChange = (field: "username" | "password", value: string) => {
    setAuthForm((current) => ({
      ...current,
      [field]: field === "username" ? sanitizeUsernameInput(value) : value
    }));
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

  if (isBootingDeepLink) {
    return (
      <>
        <main className={`app-shell ${route.kind === "match" ? "is-match-screen" : ""}`.trim()}>
          <AppHeaderSkeleton
            eyebrow={
              route.kind === "match"
                ? "Laufende Partie"
                : route.kind === "admin"
                  ? "Administration"
                  : "Privater Raum"
            }
          />
          <div className="app-stage">
            <DeepLinkBootSkeleton kind={route.kind} />
          </div>
        </main>
        <ToastStack onDismiss={removeToast} toasts={toasts} />
      </>
    );
  }

  if (isGuestLanding) {
    return (
      <>
        <LandingScreen
          authForm={authForm}
          authSubmitPending={authSubmitPending}
          authMode={authMode}
          inviteCode={guestInviteCode}
          musicPaused={session === undefined ? true : musicPaused}
          musicPlaybackMode={musicPlaybackMode}
          musicTracks={musicTracks}
          selectedMusicTrackId={selectedMusicTrackId}
          onAuthFieldChange={handleAuthFieldChange}
          onAuthModeChange={setAuthMode}
          onMusicPlaybackModeChange={handleMusicPlaybackModeChange}
          onSelectMusicTrack={handleSelectMusicTrack}
          onSubmit={handleAuthSubmit}
          onToggleMusicPaused={handleToggleMusicPaused}
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

  const displayEyebrow = !session ? "Mit Freunden spielen" : activeScreen === "lobby" ? "HEXAGONIA" : headerContext.eyebrow;
  const currentMatchPlayer = match?.players.find((player) => player.id === match.currentPlayerId) ?? null;
  const displayMeta =
    !session
      ? TEXT.subtitle
      : activeScreen === "lobby"
        ? ""
        : activeScreen === "room" && room
          ? `Code ${room.code} - ${room.seats.filter((seat) => seat.userId).length}/6 Spieler`
          : activeScreen === "match" && match
            ? currentMatchPlayer
              ? (
                  <>
                    Am Zug:{" "}
                    <PlayerMention color={currentMatchPlayer.color}>
                      {currentMatchPlayer.id === match.you ? "Du" : currentMatchPlayer.username}
                    </PlayerMention>
                  </>
                )
              : "Am Zug: -"
            : headerContext.meta;

  return (
    <main className={`app-shell ${activeScreen === "match" ? "is-match-screen" : ""}`.trim()}>
      <AppHeader
        boardVisualSettings={boardVisualSettings}
        connectionState={connectionState}
        connectionStatusText={status}
        eyebrow={displayEyebrow}
        hapticsMuted={hapticsMuted}
        hapticsSupported={hapticsSupported}
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
        onToggleHapticsMuted={handleToggleHapticsMuted}
        onToggleSoundMuted={handleToggleSoundMuted}
        onToggleMusicPaused={handleToggleMusicPaused}
        {...headerAdminProps}
        {...headerRoomProps}
      />

      <div className="app-stage">
        {activeScreen === "lobby" && session ? (
          <LobbyScreen
            createRoomPending={createRoomPending}
            joinByCodePending={joinByCodePending}
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
              joinRoomPending={roomJoinPending}
              leavePending={roomLeavePending}
              presence={presence}
              readyPending={roomReadyPending}
              room={room}
              session={session}
              startPending={roomStartPending}
              onCopyCode={handleCopyRoomCode}
              onCopyInviteLink={handleCopyInviteLink}
              onJoinRoom={handleJoinRoom}
              onBoardSizeChange={handleRoomBoardSizeChange}
              onKickUser={handleKickRoomUser}
              onLeave={handleLeaveRoom}
              onReady={handleReadyToggle}
              onSetupModeChange={handleRoomSetupModeChange}
              onRulesPresetChange={handleRoomRulesPresetChange}
              onStartingPlayerModeChange={handleRoomStartingPlayerModeChange}
              onStartingSeatChange={handleRoomStartingSeatChange}
              onStart={handleStartRoom}
              onTurnRuleChange={handleRoomTurnRuleChange}
            />
          ) : (
            <DeepLinkBootSkeleton kind="room" />
          )
        ) : null}

        {activeScreen === "match" && session ? (
          match ? (
            <MatchScreen
              boardVisualSettings={boardVisualSettings}
              interactionMode={interactionMode}
              maritimeForm={maritimeForm}
              match={match}
              pendingDiceEvent={pendingDiceRevealEvent}
              diceRevealPending={robberUiDeferredByDiceAnimation}
              monopolyResource={monopolyResource}
              profileMenuProps={{
                boardVisualSettings,
                connectionState,
                hapticsMuted,
                hapticsSupported,
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
                onToggleHapticsMuted: handleToggleHapticsMuted,
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
              onCancelPendingBoardAction={handleCancelPendingBoardAction}
              onConfirmPendingBoardAction={handleConfirmPendingBoardAction}
              onRollDice={handleRollDiceHaptic}
              onEdgeSelect={handleEdgeSelect}
              onOfferTrade={sendTradeOffer}
              onSelectPendingRobberTarget={handleSelectPendingRobberTarget}
              onTileSelect={handleTileSelect}
              onVertexSelect={handleVertexSelect}
              pendingBoardAction={robberUiDeferredByDiceAnimation ? null : pendingBoardAction}
            />
          ) : (
            <DeepLinkBootSkeleton kind="match" />
          )
        ) : null}
      </div>

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
      !pendingBoardAction ? (
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

