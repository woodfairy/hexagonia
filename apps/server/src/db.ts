import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { GameState } from "@hexagonia/rules";
import type {
  AdminMatchSummary,
  AdminUserRecord,
  AuthUser,
  MatchEvent,
  RoomDetails,
  SeatState,
  SetupMode,
  StartingPlayerMode,
  UserRole
} from "@hexagonia/shared";
import { PLAYER_COLORS } from "@hexagonia/shared";

interface StoredUser extends AuthUser {
  email: string;
  passwordHash: string;
}

interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
}

const SCHEMA_SQL = `
create table if not exists users (
  id uuid primary key,
  email text unique not null,
  username text unique not null,
  role text not null default 'user',
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key,
  code text unique not null,
  owner_user_id uuid not null references users(id) on delete cascade,
  setup_mode text not null default 'official_variable',
  starting_player_mode text not null default 'rolled',
  starting_seat_index integer not null default 0,
  status text not null,
  match_id uuid null,
  seats jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  seed text not null,
  status text not null,
  winner_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists match_snapshots (
  match_id uuid primary key references matches(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists match_events (
  id bigserial primary key,
  match_id uuid not null references matches(id) on delete cascade,
  seq integer not null,
  event jsonb not null,
  created_at timestamptz not null default now()
);
`;

const MIGRATION_SQL = `
alter table users add column if not exists role text not null default 'user';
alter table rooms add column if not exists setup_mode text not null default 'official_variable';
alter table rooms add column if not exists starting_player_mode text not null default 'rolled';
alter table rooms add column if not exists starting_seat_index integer not null default 0;
`;

export class Database {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
    await this.pool.query(MIGRATION_SQL);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createUser(input: {
    email?: string;
    username: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<AuthUser> {
    const id = randomUUID();
    const email = (input.email ?? `${id}@users.hexagonia.local`).toLowerCase();
    const result = await this.pool.query(
      `
      insert into users (id, email, username, role, password_hash)
      values ($1, $2, $3, $4, $5)
      returning id, username, role
      `,
      [id, email, input.username, input.role ?? "user", input.passwordHash]
    );

    return result.rows[0] as AuthUser;
  }

  async getUserWithPasswordByEmail(email: string): Promise<StoredUser | null> {
    const result = await this.pool.query(
      `
      select id, email, username, role, password_hash as "passwordHash"
      from users
      where email = $1
      limit 1
      `,
      [email.toLowerCase()]
    );

    return (result.rows[0] as StoredUser | undefined) ?? null;
  }

  async getUserWithPasswordByUsername(username: string): Promise<StoredUser | null> {
    const result = await this.pool.query(
      `
      select id, email, username, role, password_hash as "passwordHash"
      from users
      where username = $1
      limit 1
      `,
      [username]
    );

    return (result.rows[0] as StoredUser | undefined) ?? null;
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const result = await this.pool.query(
      `
      select id, username, role
      from users
      where id = $1
      limit 1
      `,
      [id]
    );

    return (result.rows[0] as AuthUser | undefined) ?? null;
  }

  async listUsers(): Promise<AdminUserRecord[]> {
    const result = await this.pool.query(
      `
      select id, username, role, created_at as "createdAt"
      from users
      order by
        case role when 'admin' then 0 else 1 end,
        created_at desc
      `
    );

    return result.rows.map((row) => normalizeUser(row as AdminUserRecordRow));
  }

  async countAdmins(): Promise<number> {
    const result = await this.pool.query(
      `
      select count(*)::int as count
      from users
      where role = 'admin'
      `
    );

    return (result.rows[0]?.count as number | undefined) ?? 0;
  }

  async updateUser(
    userId: string,
    patch: {
      email?: string;
      username?: string;
      role?: UserRole;
      passwordHash?: string;
    }
  ): Promise<AuthUser | null> {
    const current = await this.getUserWithPasswordById(userId);
    if (!current) {
      return null;
    }

    const result = await this.pool.query(
      `
      update users
      set email = $2,
          username = $3,
          role = $4,
          password_hash = $5
      where id = $1
      returning id, username, role
      `,
      [
        userId,
        patch.email?.toLowerCase() ?? current.email,
        patch.username ?? current.username,
        patch.role ?? current.role,
        patch.passwordHash ?? current.passwordHash
      ]
    );

    return (result.rows[0] as AuthUser | undefined) ?? null;
  }

  async createManagedUser(input: {
    email?: string;
    username: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<AdminUserRecord> {
    const created = await this.createUser(input);
    const user = await this.getAdminUserById(created.id);
    if (!user) {
      throw new Error("User konnte nach Erstellung nicht geladen werden.");
    }
    return user;
  }

  async getAdminUserById(userId: string): Promise<AdminUserRecord | null> {
    const result = await this.pool.query(
      `
      select id, username, role, created_at as "createdAt"
      from users
      where id = $1
      limit 1
      `,
      [userId]
    );

    return result.rows[0] ? normalizeUser(result.rows[0] as AdminUserRecordRow) : null;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.pool.query(`delete from users where id = $1`, [userId]);
  }

  async upsertBootstrapAdmin(input: {
    email?: string;
    username: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    const existing = input.email
      ? await this.getUserWithPasswordByEmail(input.email)
      : await this.getUserWithPasswordByUsername(input.username);
    if (existing) {
      const updated = await this.updateUser(existing.id, {
        username: input.username,
        role: "admin",
        passwordHash: input.passwordHash,
        ...(input.email ? { email: input.email } : {})
      });
      if (!updated) {
        throw new Error("Bootstrap-Admin konnte nicht aktualisiert werden.");
      }
      return updated;
    }

    return this.createUser({
      username: input.username,
      passwordHash: input.passwordHash,
      role: "admin",
      ...(input.email ? { email: input.email } : {})
    });
  }

  async createSession(userId: string, expiresAt: Date): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: randomUUID(),
      userId,
      expiresAt: expiresAt.toISOString()
    };

    await this.pool.query(
      `
      insert into sessions (id, user_id, expires_at)
      values ($1, $2, $3)
      `,
      [session.id, session.userId, session.expiresAt]
    );

    return session;
  }

  async getSessionUser(sessionId: string): Promise<{ session: SessionRecord; user: AuthUser } | null> {
    const result = await this.pool.query(
      `
      select
        s.id,
        s.user_id as "userId",
        s.expires_at as "expiresAt",
        u.id as "userIdResolved",
        u.email as "userEmail",
        u.username as "userUsername",
        u.role as "userRole"
      from sessions s
      join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()
      limit 1
      `,
      [sessionId]
    );

    const row = result.rows[0] as
      | {
          id: string;
          userId: string;
          expiresAt: string;
          userIdResolved: string;
          userEmail: string;
          userUsername: string;
          userRole: UserRole;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      session: {
        id: row.id,
        userId: row.userId,
        expiresAt: new Date(row.expiresAt).toISOString()
      },
      user: {
        id: row.userIdResolved,
        username: row.userUsername,
        role: row.userRole
      }
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query(`delete from sessions where id = $1`, [sessionId]);
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await this.pool.query(`delete from sessions where user_id = $1`, [userId]);
  }

  async createRoom(owner: AuthUser, code: string): Promise<RoomDetails> {
    const roomId = randomUUID();
    const seats: SeatState[] = PLAYER_COLORS.map((color, index) => ({
      index,
      userId: index === 0 ? owner.id : null,
      username: index === 0 ? owner.username : null,
      color,
      ready: false
    }));

    const result = await this.pool.query(
      `
      insert into rooms (id, code, owner_user_id, setup_mode, starting_player_mode, starting_seat_index, status, match_id, seats)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      returning id, code, owner_user_id as "ownerUserId", setup_mode as "setupMode", starting_player_mode as "startingPlayerMode", starting_seat_index as "startingSeatIndex", status, match_id as "matchId", seats, created_at as "createdAt"
      `,
      [roomId, code, owner.id, "official_variable", "rolled", 0, "open", null, JSON.stringify(seats)]
    );

    return normalizeRoom(result.rows[0]);
  }

  async getRoom(roomId: string): Promise<RoomDetails | null> {
    const result = await this.pool.query(
      `
        select id, code, owner_user_id as "ownerUserId", setup_mode as "setupMode", starting_player_mode as "startingPlayerMode", starting_seat_index as "startingSeatIndex", status, match_id as "matchId", seats, created_at as "createdAt"
      from rooms
      where id = $1
      limit 1
      `,
      [roomId]
    );

    return result.rows[0] ? normalizeRoom(result.rows[0]) : null;
  }

  async getRoomByCode(code: string): Promise<RoomDetails | null> {
    const result = await this.pool.query(
      `
        select id, code, owner_user_id as "ownerUserId", setup_mode as "setupMode", starting_player_mode as "startingPlayerMode", starting_seat_index as "startingSeatIndex", status, match_id as "matchId", seats, created_at as "createdAt"
      from rooms
      where upper(code) = upper($1)
      limit 1
      `,
      [code]
    );

    return result.rows[0] ? normalizeRoom(result.rows[0]) : null;
  }

  async listUserRooms(userId: string): Promise<RoomDetails[]> {
    const result = await this.pool.query(
      `
        select id, code, owner_user_id as "ownerUserId", setup_mode as "setupMode", starting_player_mode as "startingPlayerMode", starting_seat_index as "startingSeatIndex", status, match_id as "matchId", seats, created_at as "createdAt"
      from rooms
      where status <> 'closed'
        and (
          owner_user_id = $1::uuid
          or exists (
            select 1
            from jsonb_array_elements(seats) as seat
            where seat->>'userId' = $2::text
          )
        )
      order by
        case status
          when 'in_match' then 0
          when 'open' then 1
          else 2
        end,
        created_at desc
      `,
      [userId, userId]
    );

    return result.rows.map((row) =>
      normalizeRoom(
        row as {
          id: string;
          code: string;
          ownerUserId: string;
          setupMode: SetupMode;
          startingPlayerMode: StartingPlayerMode;
          startingSeatIndex: number;
          status: "open" | "in_match" | "closed";
          matchId: string | null;
          seats: SeatState[] | string;
          createdAt: Date | string;
        }
      )
    );
  }

  async listRooms(): Promise<RoomDetails[]> {
    const result = await this.pool.query(
      `
        select id, code, owner_user_id as "ownerUserId", setup_mode as "setupMode", starting_player_mode as "startingPlayerMode", starting_seat_index as "startingSeatIndex", status, match_id as "matchId", seats, created_at as "createdAt"
      from rooms
      order by
        case status
          when 'in_match' then 0
          when 'open' then 1
          else 2
        end,
        created_at desc
      `
    );

    return result.rows.map((row) =>
      normalizeRoom(
        row as {
          id: string;
          code: string;
          ownerUserId: string;
          setupMode: SetupMode;
          startingPlayerMode: StartingPlayerMode;
          startingSeatIndex: number;
          status: "open" | "in_match" | "closed";
          matchId: string | null;
          seats: SeatState[] | string;
          createdAt: Date | string;
        }
      )
    );
  }

  async deleteRoom(roomId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      delete from rooms
      where id = $1
      `,
      [roomId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async cleanupInactiveRooms(): Promise<number> {
    const result = await this.pool.query(
      `
      delete from rooms r
      where r.match_id is null
        and (
          r.status = 'closed'
          or not exists (
            select 1
            from jsonb_array_elements(r.seats) as seat
            where coalesce(seat->>'userId', '') <> ''
          )
        )
      `
    );

    return result.rowCount ?? 0;
  }

  async saveRoom(room: RoomDetails): Promise<RoomDetails> {
    const normalizedRoom = normalizeRoomBeforeSave(room);
    const result = await this.pool.query(
      `
      update rooms
      set owner_user_id = $2,
          setup_mode = $3,
          starting_player_mode = $4,
          starting_seat_index = $5,
          status = $6,
          match_id = $7,
          seats = $8::jsonb
      where id = $1
      returning id, code, owner_user_id as "ownerUserId", setup_mode as "setupMode", starting_player_mode as "startingPlayerMode", starting_seat_index as "startingSeatIndex", status, match_id as "matchId", seats, created_at as "createdAt"
      `,
      [
        normalizedRoom.id,
        normalizedRoom.ownerUserId,
        normalizedRoom.setupMode,
        normalizedRoom.startingPlayerMode,
        normalizedRoom.startingSeatIndex,
        normalizedRoom.status,
        normalizedRoom.matchId,
        JSON.stringify(normalizedRoom.seats)
      ]
    );

    return normalizeRoom(result.rows[0]);
  }

  async createMatch(state: GameState): Promise<void> {
    await this.pool.query(
      `
      insert into matches (id, room_id, seed, status, winner_id)
      values ($1, $2, $3, $4, $5)
      `,
      [state.matchId, state.roomId, state.seed, state.phase, state.winnerId]
    );

    await this.saveMatchState(state);
    for (const [index, event] of state.eventLog.entries()) {
      await this.appendMatchEvent(state.matchId, index + 1, event);
    }
  }

  async saveMatchState(state: GameState): Promise<void> {
    await this.pool.query(
      `
      update matches
      set status = $2,
          winner_id = $3,
          updated_at = now()
      where id = $1
      `,
      [state.matchId, state.phase, state.winnerId]
    );

    await this.pool.query(
      `
      insert into match_snapshots (match_id, version, snapshot, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (match_id)
      do update set version = excluded.version, snapshot = excluded.snapshot, updated_at = now()
      `,
      [state.matchId, state.version, JSON.stringify(state)]
    );
  }

  async appendMatchEvent(matchId: string, seq: number, event: MatchEvent): Promise<void> {
    await this.pool.query(
      `
      insert into match_events (match_id, seq, event)
      values ($1, $2, $3::jsonb)
      `,
      [matchId, seq, JSON.stringify(event)]
    );
  }

  async loadMatchState(matchId: string): Promise<GameState | null> {
    const result = await this.pool.query(
      `
      select snapshot
      from match_snapshots
      where match_id = $1
      limit 1
      `,
      [matchId]
    );

    return (result.rows[0]?.snapshot as GameState | undefined) ?? null;
  }

  async listMatches(): Promise<AdminMatchSummary[]> {
    const result = await this.pool.query(
      `
      select
        m.id,
        m.room_id as "roomId",
        m.status,
        m.winner_id as "winnerId",
        coalesce(jsonb_array_length(ms.snapshot->'players'), 0)::int as "playerCount",
        m.created_at as "createdAt",
        m.updated_at as "updatedAt"
      from matches m
      left join match_snapshots ms on ms.match_id = m.id
      order by m.updated_at desc
      `
    );

    return result.rows.map((row) => normalizeAdminMatch(row as AdminMatchSummaryRow));
  }

  async deleteMatch(matchId: string): Promise<{ roomId: string } | null> {
    const result = await this.pool.query(
      `
      delete from matches
      where id = $1
      returning room_id as "roomId"
      `,
      [matchId]
    );

    return (result.rows[0] as { roomId: string } | undefined) ?? null;
  }

  private async getUserWithPasswordById(userId: string): Promise<StoredUser | null> {
    const result = await this.pool.query(
      `
      select id, email, username, role, password_hash as "passwordHash"
      from users
      where id = $1
      limit 1
      `,
      [userId]
    );

    return (result.rows[0] as StoredUser | undefined) ?? null;
  }
}

function normalizeRoom(row: {
  id: string;
  code: string;
  ownerUserId: string;
  setupMode: SetupMode;
  startingPlayerMode: StartingPlayerMode;
  startingSeatIndex: number;
  status: "open" | "in_match" | "closed";
  matchId: string | null;
  seats: SeatState[] | string;
  createdAt: Date | string;
}): RoomDetails {
  const seats = typeof row.seats === "string" ? (JSON.parse(row.seats) as SeatState[]) : row.seats;
  return {
    id: row.id,
    code: row.code,
    ownerUserId: row.ownerUserId,
    setupMode: row.setupMode,
    startingPlayerMode: row.startingPlayerMode,
    startingSeatIndex: row.startingSeatIndex,
    status: row.status,
    matchId: row.matchId,
    seats,
    createdAt: new Date(row.createdAt).toISOString()
  };
}

interface AdminUserRecordRow {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date | string;
}

interface AdminMatchSummaryRow {
  id: string;
  roomId: string;
  status: AdminMatchSummary["status"];
  winnerId: string | null;
  playerCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function normalizeUser(row: AdminUserRecordRow): AdminUserRecord {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: new Date(row.createdAt).toISOString()
  };
}

function normalizeAdminMatch(row: AdminMatchSummaryRow): AdminMatchSummary {
  return {
    id: row.id,
    roomId: row.roomId,
    status: row.status,
    winnerId: row.winnerId,
    playerCount: row.playerCount,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

function normalizeRoomBeforeSave(room: RoomDetails): RoomDetails {
  const occupiedSeats = room.seats.filter((seat) => !!seat.userId);
  const startingSeatStillOccupied = occupiedSeats.some((seat) => seat.index === room.startingSeatIndex);
  const nextStartingSeatIndex = startingSeatStillOccupied
    ? room.startingSeatIndex
    : (occupiedSeats[0]?.index ?? room.startingSeatIndex);

  return {
    ...room,
    startingSeatIndex: nextStartingSeatIndex
  };
}
