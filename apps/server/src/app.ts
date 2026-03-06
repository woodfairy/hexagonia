import { randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import argon2 from "argon2";
import { createMatchState, roomToPlayers } from "@hexagonia/rules";
import type { ActionIntent, AuthUser, ClientMessage, RoomDetails } from "@hexagonia/shared";
import { z } from "zod";
import type { AppConfig } from "./config";
import { Database } from "./db";
import { RealtimeHub } from "./realtime";

const SESSION_COOKIE_NAME = "hexagonia_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const joinRoomSchema = z.object({
  seatIndex: z.number().int().min(0).max(3).optional()
});

const readySchema = z.object({
  ready: z.boolean()
});

export async function createApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const db = new Database(config.DATABASE_URL);
  await db.init();
  const hub = new RealtimeHub(db, app.log);

  app.addHook("onClose", async () => {
    await db.close();
  });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(cookie, {
    secret: config.SESSION_COOKIE_SECRET,
    hook: "onRequest"
  });

  await app.register(websocket);

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);

    try {
      const passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id
      });

      const user = await db.createUser({
        email: body.email,
        username: body.username,
        passwordHash
      });

      await createSession(reply, db, user.id);
      return { user };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "E-Mail oder Nutzername ist bereits vergeben." });
      }
      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const record = await db.getUserWithPasswordByEmail(body.email);

    if (!record || !(await argon2.verify(record.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Ungültige Zugangsdaten." });
    }

    await createSession(reply, db, record.id);
    return {
      user: {
        id: record.id,
        email: record.email,
        username: record.username
      }
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      await db.deleteSession(sessionId);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }
    return { user };
  });

  app.post("/api/rooms", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await db.createRoom(user, generateRoomCode());
    await hub.broadcastRoom(room);
    return { room };
  });

  app.get("/api/rooms/:roomId", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await db.getRoom((request.params as { roomId: string }).roomId);
    if (!room) {
      return reply.code(404).send({ error: "Raum nicht gefunden." });
    }
    return { room };
  });

  app.get("/api/rooms/by-code/:code", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await db.getRoomByCode((request.params as { code: string }).code);
    if (!room) {
      return reply.code(404).send({ error: "Raum nicht gefunden." });
    }
    return { room };
  });

  app.post("/api/rooms/:roomId/join", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await requireRoom(db, reply, (request.params as { roomId: string }).roomId);
    if (!room) {
      return reply;
    }
    if (room.status !== "open") {
      return reply.code(409).send({ error: "Dieser Raum nimmt gerade keine neuen Spieler an." });
    }

    const body = joinRoomSchema.parse(request.body ?? {});
    const existingSeat = room.seats.find((seat) => seat.userId === user.id);
    if (existingSeat) {
      return { room };
    }

    const seat = body.seatIndex !== undefined ? room.seats[body.seatIndex] : room.seats.find((entry) => !entry.userId);
    if (!seat || seat.userId) {
      return reply.code(409).send({ error: "Der gewünschte Platz ist nicht verfügbar." });
    }

    seat.userId = user.id;
    seat.username = user.username;
    seat.ready = false;

    const saved = await db.saveRoom(room);
    await hub.broadcastRoom(saved);
    return { room: saved };
  });

  app.post("/api/rooms/:roomId/leave", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await requireRoom(db, reply, (request.params as { roomId: string }).roomId);
    if (!room) {
      return reply;
    }
    if (room.status === "in_match") {
      return reply.code(409).send({ error: "Laufende Partien werden über Reconnect fortgesetzt, nicht über Verlassen." });
    }

    const seat = room.seats.find((entry) => entry.userId === user.id);
    if (!seat) {
      return { room };
    }

    seat.userId = null;
    seat.username = null;
    seat.ready = false;

    const occupiedSeats = room.seats.filter((entry) => entry.userId);
    if (!occupiedSeats.length) {
      room.status = "closed";
    }
    if (room.ownerUserId === user.id && occupiedSeats.length > 0) {
      room.ownerUserId = occupiedSeats[0]!.userId!;
    }

    const saved = await db.saveRoom(room);
    await hub.broadcastRoom(saved);
    return { room: saved };
  });

  app.post("/api/rooms/:roomId/ready", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await requireRoom(db, reply, (request.params as { roomId: string }).roomId);
    if (!room) {
      return reply;
    }
    if (room.status !== "open") {
      return reply.code(409).send({ error: "Bereits gestartete Räume können nicht mehr bereit gesetzt werden." });
    }

    const seat = room.seats.find((entry) => entry.userId === user.id);
    if (!seat) {
      return reply.code(403).send({ error: "Nur sitzende Spieler können bereit gesetzt werden." });
    }

    const body = readySchema.parse(request.body);
    seat.ready = body.ready;
    const saved = await db.saveRoom(room);
    await hub.broadcastRoom(saved);
    return { room: saved };
  });

  app.post("/api/rooms/:roomId/start", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await requireRoom(db, reply, (request.params as { roomId: string }).roomId);
    if (!room) {
      return reply;
    }
    if (room.ownerUserId !== user.id) {
      return reply.code(403).send({ error: "Nur der Raumbesitzer kann das Spiel starten." });
    }
    if (room.status !== "open") {
      return reply.code(409).send({ error: "Dieser Raum hat bereits ein aktives Spiel." });
    }

    const seatedPlayers = room.seats.filter((seat) => seat.userId);
    if (seatedPlayers.length < 3 || seatedPlayers.length > 4) {
      return reply.code(409).send({ error: "Für das Basisspiel werden 3 bis 4 Spieler benötigt." });
    }
    if (seatedPlayers.some((seat) => !seat.ready)) {
      return reply.code(409).send({ error: "Alle sitzenden Spieler müssen bereit sein." });
    }

    const state = createMatchState({
      matchId: randomUUID(),
      roomId: room.id,
      seed: randomUUID(),
      players: roomToPlayers(room)
    });

    room.status = "in_match";
    room.matchId = state.matchId;

    await db.createMatch(state);
    const savedRoom = await db.saveRoom(room);
    await hub.initializeMatch(state);
    await hub.broadcastRoom(savedRoom);

    return {
      room: savedRoom,
      matchId: state.matchId
    };
  });

  app.get("/ws", { websocket: true }, async (connection, request) => {
    const socket = connection.socket;
    const user = await getUserFromRequest(request, db);
    if (!user) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const context = hub.registerConnection(socket, user);

    socket.on("message", async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as ClientMessage;
        switch (message.type) {
          case "room.subscribe":
            await hub.subscribeRoom(context, message.roomId);
            break;
          case "match.reconnect":
            await hub.subscribeMatch(context, message.matchId);
            break;
          case "match.action":
            await hub.applyMatchAction(user.id, message.matchId, message.action as ActionIntent);
            break;
          default:
            socket.send(
              JSON.stringify({
                type: "match.error",
                error: "Unbekannter Nachrichtentyp."
              })
            );
        }
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "match.error",
            error: error instanceof Error ? error.message : "Unbekannter Fehler"
          })
        );
      }
    });

    socket.on("close", () => {
      void hub.unregisterConnection(context);
    });
  });

  return app;
}

async function createSession(reply: FastifyReply, db: Database, userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await db.createSession(userId, expiresAt);
  reply.setCookie(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: "/"
  });
}

async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  db: Database
): Promise<AuthUser | null> {
  const user = await getUserFromRequest(request, db);
  if (!user) {
    reply.code(401).send({ error: "Nicht angemeldet." });
    return null;
  }
  return user;
}

async function getUserFromRequest(
  request: FastifyRequest,
  db: Database
): Promise<AuthUser | null> {
  const sessionId = request.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return null;
  }

  const session = await db.getSessionUser(sessionId);
  return session?.user ?? null;
}

async function requireRoom(
  db: Database,
  reply: FastifyReply,
  roomId: string
): Promise<RoomDetails | null> {
  const room = await db.getRoom(roomId);
  if (!room) {
    reply.code(404).send({ error: "Raum nicht gefunden." });
    return null;
  }
  return room;
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505";
}

function generateRoomCode(): string {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}
