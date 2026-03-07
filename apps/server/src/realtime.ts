import type { FastifyBaseLogger } from "fastify";
import type WebSocket from "ws";
import {
  applyAction,
  createSnapshot,
  setPlayerDisconnectDeadline,
  updatePlayerConnection,
  type GameState
} from "@hexagonia/rules";
import type { ActionIntent, AuthUser, RoomDetails, ServerMessage } from "@hexagonia/shared";
import { Database } from "./db.js";

interface SocketContext {
  socket: WebSocket;
  user: AuthUser;
  roomId: string | null;
  matchId: string | null;
}

export class RealtimeHub {
  private static readonly MATCH_DISCONNECT_GRACE_MS = 12000;
  private static readonly PLAYER_EVICTION_GRACE_MS = 1000 * 60 * 5;
  private readonly contexts = new Set<SocketContext>();
  private readonly roomSubscribers = new Map<string, Set<SocketContext>>();
  private readonly matchSubscribers = new Map<string, Set<SocketContext>>();
  private readonly activeMatches = new Map<string, GameState>();
  private readonly pendingMatchDisconnects = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingRoomEvictions = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingMatchEvictions = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly db: Database,
    private readonly logger: FastifyBaseLogger
  ) {}

  registerConnection(socket: WebSocket, user: AuthUser): SocketContext {
    const context: SocketContext = {
      socket,
      user,
      roomId: null,
      matchId: null
    };
    this.contexts.add(context);
    return context;
  }

  async unregisterConnection(context: SocketContext): Promise<void> {
    this.contexts.delete(context);
    await this.unsubscribeRoom(context);
    await this.unsubscribeMatch(context);
  }

  async subscribeRoom(context: SocketContext, roomId: string): Promise<void> {
    await this.unsubscribeRoom(context);
    context.roomId = roomId;
    this.clearPendingRoomEviction(roomId, context.user.id);

    if (!this.roomSubscribers.has(roomId)) {
      this.roomSubscribers.set(roomId, new Set());
    }
    this.roomSubscribers.get(roomId)!.add(context);

    const room = await this.db.getRoom(roomId);
    if (room) {
      this.send(context.socket, {
        type: "room.state",
        room
      });
    }

    this.broadcastRoomPresence(roomId);
  }

  async subscribeMatch(context: SocketContext, matchId: string): Promise<void> {
    await this.unsubscribeMatch(context);
    context.matchId = matchId;
    this.clearPendingMatchDisconnect(matchId, context.user.id);
    this.clearPendingMatchEviction(matchId, context.user.id);

    if (!this.matchSubscribers.has(matchId)) {
      this.matchSubscribers.set(matchId, new Set());
    }
    this.matchSubscribers.get(matchId)!.add(context);

    const state = await this.getMatchState(matchId);
    if (state.players.some((player) => player.id === context.user.id)) {
      const connectedState = updatePlayerConnection(state, context.user.id, true);
      this.activeMatches.set(matchId, connectedState);
      await this.db.saveMatchState(connectedState);
      this.broadcastMatchState(connectedState);
    } else {
      this.matchSubscribers.get(matchId)?.delete(context);
      context.matchId = null;
      this.send(context.socket, {
        type: "match.error",
        error: "Der Spieler gehört nicht zu dieser Partie."
      });
      return;
    }

    this.broadcastMatchPresence(matchId);
  }

  async initializeMatch(state: GameState): Promise<void> {
    let nextState = state;

    for (const player of state.players) {
      if (this.hasActiveRoomSubscription(state.roomId, player.id) || this.hasActiveMatchSubscription(state.matchId, player.id)) {
        continue;
      }

      nextState = updatePlayerConnection(nextState, player.id, false);
      nextState = setPlayerDisconnectDeadline(
        nextState,
        player.id,
        Date.now() + RealtimeHub.PLAYER_EVICTION_GRACE_MS
      );
      this.startMatchEvictionTimer(state.matchId, player.id);
    }

    this.activeMatches.set(state.matchId, nextState);
    if (nextState !== state) {
      await this.db.saveMatchState(nextState);
    }
    this.broadcastMatchState(nextState);
  }

  async broadcastRoom(room: RoomDetails): Promise<void> {
    const subscribers = this.roomSubscribers.get(room.id);
    if (!subscribers) {
      return;
    }

    for (const context of subscribers) {
      this.send(context.socket, {
        type: "room.state",
        room
      });
    }

    this.broadcastRoomPresence(room.id);
  }

  async applyMatchAction(userId: string, matchId: string, action: ActionIntent): Promise<void> {
    const state = await this.getMatchState(matchId);
    const nextState = applyAction(state, userId, action);
    this.activeMatches.set(matchId, nextState);
    await this.db.saveMatchState(nextState);

    const latestEvent = nextState.eventLog.at(-1);
    if (latestEvent) {
      await this.db.appendMatchEvent(matchId, nextState.eventLog.length, latestEvent);
    }

    this.broadcastMatchState(nextState, latestEvent);
  }

  terminateMatch(matchId: string, reason: string): void {
    const subscribers = this.matchSubscribers.get(matchId);
    if (subscribers) {
      for (const context of subscribers) {
        context.matchId = null;
        this.send(context.socket, {
          type: "match.error",
          error: reason
        });
      }

      this.matchSubscribers.delete(matchId);
    }

    for (const [key, timeout] of this.pendingMatchDisconnects.entries()) {
      if (key.startsWith(`${matchId}:`)) {
        clearTimeout(timeout);
        this.pendingMatchDisconnects.delete(key);
      }
    }

    for (const [key, timeout] of this.pendingMatchEvictions.entries()) {
      if (key.startsWith(`${matchId}:`)) {
        clearTimeout(timeout);
        this.pendingMatchEvictions.delete(key);
      }
    }

    this.activeMatches.delete(matchId);
  }

  private async unsubscribeRoom(context: SocketContext): Promise<void> {
    if (!context.roomId) {
      return;
    }

    const subscribers = this.roomSubscribers.get(context.roomId);
    subscribers?.delete(context);
    if (subscribers && subscribers.size === 0) {
      this.roomSubscribers.delete(context.roomId);
    }

    const roomId = context.roomId;
    context.roomId = null;
    await this.scheduleRoomEviction(roomId, context.user.id);
    this.broadcastRoomPresence(roomId);
  }

  private async unsubscribeMatch(context: SocketContext): Promise<void> {
    if (!context.matchId) {
      return;
    }

    const matchId = context.matchId;
    const subscribers = this.matchSubscribers.get(matchId);
    subscribers?.delete(context);
    if (subscribers && subscribers.size === 0) {
      this.matchSubscribers.delete(matchId);
    }

    context.matchId = null;

    if (!this.hasActiveMatchSubscription(matchId, context.user.id)) {
      this.scheduleMatchDisconnect(matchId, context.user.id);
      await this.scheduleMatchEviction(matchId, context.user.id);
    }

    this.broadcastMatchPresence(matchId);
  }

  private async getMatchState(matchId: string): Promise<GameState> {
    if (this.activeMatches.has(matchId)) {
      return this.activeMatches.get(matchId)!;
    }

    const loaded = await this.db.loadMatchState(matchId);
    if (!loaded) {
      throw new Error(`Unknown match ${matchId}`);
    }

    this.activeMatches.set(matchId, loaded);
    return loaded;
  }

  private broadcastMatchState(state: GameState, latestEvent?: GameState["eventLog"][number]): void {
    const subscribers = this.matchSubscribers.get(state.matchId);
    if (!subscribers) {
      return;
    }

    for (const context of subscribers) {
      this.send(context.socket, {
        type: "match.snapshot",
        snapshot: createSnapshot(state, context.user.id)
      });

      if (latestEvent) {
        this.send(context.socket, {
          type: "match.event",
          event: latestEvent
        });
      }
    }

    this.broadcastMatchPresence(state.matchId);
  }

  private broadcastRoomPresence(roomId: string): void {
    const subscribers = this.roomSubscribers.get(roomId);
    if (!subscribers) {
      return;
    }

    const onlineUserIds = [...new Set([...subscribers].map((context) => context.user.id))];
    const message: ServerMessage = {
      type: "presence.state",
      roomId,
      onlineUserIds
    };

    for (const context of subscribers) {
      this.send(context.socket, message);
    }
  }

  private broadcastMatchPresence(matchId: string): void {
    const subscribers = this.matchSubscribers.get(matchId);
    if (!subscribers) {
      return;
    }

    const onlineUserIds = [...new Set([...subscribers].map((context) => context.user.id))];
    const message: ServerMessage = {
      type: "presence.state",
      matchId,
      onlineUserIds
    };

    for (const context of subscribers) {
      this.send(context.socket, message);
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== 1) {
      return;
    }

    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      this.logger.warn({ error }, "failed to send websocket message");
    }
  }

  private hasActiveRoomSubscription(roomId: string, userId: string): boolean {
    const subscribers = this.roomSubscribers.get(roomId);
    if (!subscribers) {
      return false;
    }

    return [...subscribers].some((context) => context.user.id === userId);
  }

  private hasActiveMatchSubscription(matchId: string, userId: string): boolean {
    const subscribers = this.matchSubscribers.get(matchId);
    if (!subscribers) {
      return false;
    }

    return [...subscribers].some((context) => context.user.id === userId);
  }

  private scheduleMatchDisconnect(matchId: string, userId: string): void {
    const key = this.getMatchDisconnectKey(matchId, userId);
    if (this.pendingMatchDisconnects.has(key)) {
      return;
    }

    const timeout = setTimeout(() => {
      void this.finalizeMatchDisconnect(matchId, userId).catch((error) => {
        this.logger.warn({ error, matchId, userId }, "failed to finalize match disconnect");
      });
    }, RealtimeHub.MATCH_DISCONNECT_GRACE_MS);

    this.pendingMatchDisconnects.set(key, timeout);
  }

  private async scheduleRoomEviction(roomId: string, userId: string): Promise<void> {
    const key = this.getRoomEvictionKey(roomId, userId);
    if (this.pendingRoomEvictions.has(key) || this.hasActiveRoomSubscription(roomId, userId)) {
      return;
    }

    const room = await this.db.getRoom(roomId);
    if (!room || room.status !== "open" || !room.seats.some((seat) => seat.userId === userId)) {
      return;
    }

    const timeout = setTimeout(() => {
      void this.finalizeRoomEviction(roomId, userId).catch((error) => {
        this.logger.warn({ error, roomId, userId }, "failed to finalize room eviction");
      });
    }, RealtimeHub.PLAYER_EVICTION_GRACE_MS);

    this.pendingRoomEvictions.set(key, timeout);
  }

  private startMatchEvictionTimer(matchId: string, userId: string): boolean {
    const key = this.getMatchEvictionKey(matchId, userId);
    if (this.pendingMatchEvictions.has(key) || this.hasActiveMatchSubscription(matchId, userId)) {
      return false;
    }

    const timeout = setTimeout(() => {
      void this.finalizeMatchEviction(matchId, userId).catch((error) => {
        this.logger.warn({ error, matchId, userId }, "failed to finalize match eviction");
      });
    }, RealtimeHub.PLAYER_EVICTION_GRACE_MS);

    this.pendingMatchEvictions.set(key, timeout);
    return true;
  }

  private async scheduleMatchEviction(matchId: string, userId: string): Promise<void> {
    const started = this.startMatchEvictionTimer(matchId, userId);
    if (!started) {
      return;
    }

    let state: GameState | null = null;
    try {
      state = await this.getMatchState(matchId);
    } catch {
      this.clearPendingMatchEviction(matchId, userId);
      return;
    }

    if (!state.players.some((player) => player.id === userId) || this.hasActiveMatchSubscription(matchId, userId)) {
      this.clearPendingMatchEviction(matchId, userId);
      return;
    }

    const nextState = setPlayerDisconnectDeadline(
      state,
      userId,
      Date.now() + RealtimeHub.PLAYER_EVICTION_GRACE_MS
    );
    this.activeMatches.set(matchId, nextState);
    await this.db.saveMatchState(nextState);
    this.broadcastMatchState(nextState);
  }

  private clearPendingMatchDisconnect(matchId: string, userId: string): void {
    const key = this.getMatchDisconnectKey(matchId, userId);
    const timeout = this.pendingMatchDisconnects.get(key);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.pendingMatchDisconnects.delete(key);
  }

  private clearPendingRoomEviction(roomId: string, userId: string): void {
    const key = this.getRoomEvictionKey(roomId, userId);
    const timeout = this.pendingRoomEvictions.get(key);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.pendingRoomEvictions.delete(key);
  }

  private clearPendingMatchEviction(matchId: string, userId: string): void {
    const key = this.getMatchEvictionKey(matchId, userId);
    const timeout = this.pendingMatchEvictions.get(key);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.pendingMatchEvictions.delete(key);
  }

  private async finalizeMatchDisconnect(matchId: string, userId: string): Promise<void> {
    const key = this.getMatchDisconnectKey(matchId, userId);
    this.pendingMatchDisconnects.delete(key);

    if (this.hasActiveMatchSubscription(matchId, userId)) {
      return;
    }

    let state: GameState | null = null;
    try {
      state = await this.getMatchState(matchId);
    } catch {
      return;
    }

    if (!state.players.some((player) => player.id === userId)) {
      return;
    }

    const disconnectedState = updatePlayerConnection(state, userId, false);
    this.activeMatches.set(matchId, disconnectedState);
    await this.db.saveMatchState(disconnectedState);
    this.broadcastMatchState(disconnectedState);
  }

  private async finalizeRoomEviction(roomId: string, userId: string): Promise<void> {
    const key = this.getRoomEvictionKey(roomId, userId);
    this.pendingRoomEvictions.delete(key);

    if (this.hasActiveRoomSubscription(roomId, userId)) {
      return;
    }

    const room = await this.db.getRoom(roomId);
    if (!room || room.status !== "open") {
      return;
    }

    const seat = room.seats.find((entry) => entry.userId === userId);
    if (!seat) {
      return;
    }

    seat.userId = null;
    seat.username = null;
    seat.ready = false;

    const occupiedSeats = room.seats.filter((entry) => entry.userId);
    if (!occupiedSeats.length) {
      room.status = "closed";
      room.matchId = null;
      await this.broadcastRoom(room);
      await this.db.deleteRoom(room.id);
      return;
    } else if (room.ownerUserId === userId) {
      room.ownerUserId = occupiedSeats[0]!.userId!;
    }

    const savedRoom = await this.db.saveRoom(room);
    await this.broadcastRoom(savedRoom);
  }

  private async finalizeMatchEviction(matchId: string, userId: string): Promise<void> {
    const key = this.getMatchEvictionKey(matchId, userId);
    this.pendingMatchEvictions.delete(key);

    if (this.hasActiveMatchSubscription(matchId, userId)) {
      return;
    }

    let state: GameState | null = null;
    try {
      state = await this.getMatchState(matchId);
    } catch {
      return;
    }

    if (!state.players.some((player) => player.id === userId)) {
      return;
    }

    const evictedPlayer = state.players.find((player) => player.id === userId);
    const room = await this.db.getRoom(state.roomId);
    if (!room || room.matchId !== matchId || room.status !== "in_match") {
      return;
    }

    const reason = `${evictedPlayer?.username ?? "Ein Spieler"} war über 5 Minuten getrennt und wurde aus dem Raum entfernt. Die Partie kehrt in die Lobby zurück.`;
    this.terminateMatch(matchId, reason);
    await this.db.deleteMatch(matchId);

    room.matchId = null;
    room.status = "open";
    room.seats = room.seats.map((seat) => ({
      ...seat,
      ready: false
    }));

    const seat = room.seats.find((entry) => entry.userId === userId);
    if (seat) {
      seat.userId = null;
      seat.username = null;
      seat.ready = false;
    }

    const occupiedSeats = room.seats.filter((entry) => entry.userId);
    if (!occupiedSeats.length) {
      room.status = "closed";
      await this.broadcastRoom(room);
      await this.db.deleteRoom(room.id);
      return;
    } else if (room.ownerUserId === userId) {
      room.ownerUserId = occupiedSeats[0]!.userId!;
    }

    const savedRoom = await this.db.saveRoom(room);
    await this.broadcastRoom(savedRoom);
  }

  private getMatchDisconnectKey(matchId: string, userId: string): string {
    return `${matchId}:${userId}`;
  }

  private getRoomEvictionKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  private getMatchEvictionKey(matchId: string, userId: string): string {
    return `${matchId}:${userId}`;
  }
}
