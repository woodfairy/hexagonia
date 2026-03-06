import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { GameState } from "@hexagonia/rules";
import type { AuthUser, MatchEvent, RoomDetails, SeatState } from "@hexagonia/shared";
import { PLAYER_COLORS } from "@hexagonia/shared";

interface StoredUser extends AuthUser {
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

export class Database {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createUser(input: {
    email: string;
    username: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    const id = randomUUID();
    const result = await this.pool.query(
      `
      insert into users (id, email, username, password_hash)
      values ($1, $2, $3, $4)
      returning id, email, username
      `,
      [id, input.email.toLowerCase(), input.username, input.passwordHash]
    );

    return result.rows[0] as AuthUser;
  }

  async getUserWithPasswordByEmail(email: string): Promise<StoredUser | null> {
    const result = await this.pool.query(
      `
      select id, email, username, password_hash as "passwordHash"
      from users
      where email = $1
      limit 1
      `,
      [email.toLowerCase()]
    );

    return (result.rows[0] as StoredUser | undefined) ?? null;
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const result = await this.pool.query(
      `
      select id, email, username
      from users
      where id = $1
      limit 1
      `,
      [id]
    );

    return (result.rows[0] as AuthUser | undefined) ?? null;
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
        u.username as "userUsername"
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
        email: row.userEmail,
        username: row.userUsername
      }
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query(`delete from sessions where id = $1`, [sessionId]);
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
      insert into rooms (id, code, owner_user_id, status, match_id, seats)
      values ($1, $2, $3, $4, $5, $6::jsonb)
      returning id, code, owner_user_id as "ownerUserId", status, match_id as "matchId", seats, created_at as "createdAt"
      `,
      [roomId, code, owner.id, "open", null, JSON.stringify(seats)]
    );

    return normalizeRoom(result.rows[0]);
  }

  async getRoom(roomId: string): Promise<RoomDetails | null> {
    const result = await this.pool.query(
      `
      select id, code, owner_user_id as "ownerUserId", status, match_id as "matchId", seats, created_at as "createdAt"
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
      select id, code, owner_user_id as "ownerUserId", status, match_id as "matchId", seats, created_at as "createdAt"
      from rooms
      where upper(code) = upper($1)
      limit 1
      `,
      [code]
    );

    return result.rows[0] ? normalizeRoom(result.rows[0]) : null;
  }

  async saveRoom(room: RoomDetails): Promise<RoomDetails> {
    const result = await this.pool.query(
      `
      update rooms
      set owner_user_id = $2,
          status = $3,
          match_id = $4,
          seats = $5::jsonb
      where id = $1
      returning id, code, owner_user_id as "ownerUserId", status, match_id as "matchId", seats, created_at as "createdAt"
      `,
      [room.id, room.ownerUserId, room.status, room.matchId, JSON.stringify(room.seats)]
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
}

function normalizeRoom(row: {
  id: string;
  code: string;
  ownerUserId: string;
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
    status: row.status,
    matchId: row.matchId,
    seats,
    createdAt: new Date(row.createdAt).toISOString()
  };
}
