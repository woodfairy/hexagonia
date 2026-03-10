import type { GameState } from "@hexagonia/rules";
import type { ErrorDescriptor, RoomDetails, SeatState } from "@hexagonia/shared";
import { Database } from "./db.js";

export interface RoomLifecycleRealtimeBridge {
  broadcastRoom(room: RoomDetails): Promise<void>;
  terminateMatch(matchId: string, reason: ErrorDescriptor): void;
}

export class RoomLifecycleService {
  constructor(
    private readonly db: Database,
    private readonly realtime: RoomLifecycleRealtimeBridge
  ) {}

  async resetMatchToRoom(matchId: string, reason: ErrorDescriptor): Promise<RoomDetails | null> {
    this.realtime.terminateMatch(matchId, reason);
    const deleted = await this.db.deleteMatch(matchId);
    if (!deleted) {
      return null;
    }

    const room = await this.db.getRoom(deleted.roomId);
    if (!room) {
      return null;
    }

    room.matchId = null;
    room.status = hasOccupiedSeats(room) ? "open" : "closed";
    room.seats = room.seats.map((seat) => ({
      ...seat,
      ready: false
    }));

    return this.persistRoomOrDeleteIfEmpty(room);
  }

  async removeUserFromOpenRoom(room: RoomDetails, userId: string): Promise<RoomDetails> {
    const seat = room.seats.find((entry) => entry.userId === userId);
    if (!seat) {
      return room;
    }

    seat.userId = null;
    seat.username = null;
    seat.ready = false;
    room.seats = compactOccupiedSeats(room.seats);

    if (room.ownerUserId === userId) {
      room.ownerUserId = room.seats.find((entry) => entry.userId)?.userId ?? room.ownerUserId;
    }

    return this.persistRoomOrDeleteIfEmpty(room);
  }

  async evictRoomUser(roomId: string, userId: string): Promise<void> {
    const room = await this.db.getRoom(roomId);
    if (!room || room.status !== "open" || !room.seats.some((seat) => seat.userId === userId)) {
      return;
    }

    await this.removeUserFromOpenRoom(room, userId);
  }

  async evictMatchPlayer(matchId: string, state: GameState, userId: string): Promise<void> {
    const evictedPlayer = state.players.find((player) => player.id === userId);
    const room = await this.db.getRoom(state.roomId);
    if (!room || room.matchId !== matchId || room.status !== "in_match") {
      return;
    }

    this.realtime.terminateMatch(matchId, {
      errorCode: "match.terminated.player_evicted",
      ...(evictedPlayer?.username ? { errorParams: { username: evictedPlayer.username } } : {})
    });
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

    room.seats = compactOccupiedSeats(room.seats);

    if (room.ownerUserId === userId) {
      room.ownerUserId = room.seats.find((entry) => entry.userId)?.userId ?? room.ownerUserId;
    }

    await this.persistRoomOrDeleteIfEmpty(room);
  }

  private async persistRoomOrDeleteIfEmpty(room: RoomDetails): Promise<RoomDetails> {
    if (!hasOccupiedSeats(room)) {
      room.status = "closed";
      room.matchId = null;
      await this.realtime.broadcastRoom(room);
      await this.db.deleteRoom(room.id);
      return room;
    }

    const savedRoom = await this.db.saveRoom(room);
    await this.realtime.broadcastRoom(savedRoom);
    return savedRoom;
  }
}

function hasOccupiedSeats(room: RoomDetails): boolean {
  return room.seats.some((seat) => !!seat.userId);
}

function compactOccupiedSeats(seats: SeatState[]): SeatState[] {
  const orderedSeats = [...seats].sort((left, right) => left.index - right.index);
  const occupiedSeats = orderedSeats.filter((seat) => !!seat.userId);

  return orderedSeats.map((seat, index) => {
    const occupant = occupiedSeats[index];
    if (!occupant) {
      return {
        ...seat,
        userId: null,
        username: null,
        ready: false
      };
    }

    return {
      ...seat,
      userId: occupant.userId,
      username: occupant.username,
      ready: occupant.ready
    };
  });
}
