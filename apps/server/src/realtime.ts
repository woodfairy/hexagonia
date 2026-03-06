import type { FastifyBaseLogger } from "fastify";
import type WebSocket from "ws";
import { applyAction, createSnapshot, updatePlayerConnection, type GameState } from "@hexagonia/rules";
import type { ActionIntent, AuthUser, RoomDetails, ServerMessage } from "@hexagonia/shared";
import { Database } from "./db";

interface SocketContext {
  socket: WebSocket;
  user: AuthUser;
  roomId: string | null;
  matchId: string | null;
}

export class RealtimeHub {
  private readonly contexts = new Set<SocketContext>();
  private readonly roomSubscribers = new Map<string, Set<SocketContext>>();
  private readonly matchSubscribers = new Map<string, Set<SocketContext>>();
  private readonly activeMatches = new Map<string, GameState>();

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
    this.activeMatches.set(state.matchId, state);
    this.broadcastMatchState(state);
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

    const state = await this.getMatchState(matchId);
    if (state.players.some((player) => player.id === context.user.id)) {
      const disconnectedState = updatePlayerConnection(state, context.user.id, false);
      this.activeMatches.set(matchId, disconnectedState);
      await this.db.saveMatchState(disconnectedState);
      this.broadcastMatchState(disconnectedState);
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
}
