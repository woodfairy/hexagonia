import { randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import argon2 from "argon2";
import { createMatchState, rollStartingPlayer, roomToPlayers } from "@hexagonia/rules";
import type { ActionIntent, AuthUser, ClientMessage, RoomDetails } from "@hexagonia/shared";
import type { RawData } from "ws";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { Database } from "./db.js";
import { RealtimeHub } from "./realtime.js";

const SESSION_COOKIE_NAME = "hexagonia_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

const registerSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(128),
  recaptchaToken: z.string().min(1).max(4096).optional()
});

const loginSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(128)
});

const joinRoomSchema = z.object({
  seatIndex: z.number().int().min(0).max(3).optional()
});

const readySchema = z.object({
  ready: z.boolean()
});

const roomSettingsSchema = z
  .object({
    setupMode: z.enum(["official_variable", "beginner"]).optional(),
    startingPlayerMode: z.enum(["rolled", "manual"]).optional(),
    startingSeatIndex: z.number().int().min(0).max(3).optional()
  })
  .refine((body) => body.setupMode !== undefined || body.startingPlayerMode !== undefined || body.startingSeatIndex !== undefined, {
    message: "Mindestens eine Spieleinstellung muss gesetzt werden."
  });

const kickRoomSchema = z.object({
  userId: z.string().uuid()
});

const userRoleSchema = z.enum(["user", "admin"]);

const adminCreateUserSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(128),
  role: userRoleSchema.default("user")
});

const adminUpdateUserSchema = z
  .object({
    username: z.string().min(3).max(24).optional(),
    password: z.string().min(8).max(128).optional(),
    role: userRoleSchema.optional()
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Mindestens ein Feld muss aktualisiert werden."
  });

export async function createApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const db = new Database(config.DATABASE_URL);
  await db.init();
  const cleanedUpRooms = await db.cleanupInactiveRooms();
  if (cleanedUpRooms > 0) {
    app.log.info({ cleanedUpRooms }, "inactive rooms cleaned up");
  }
  await ensureBootstrapAdmin(db, config);
  const hub = new RealtimeHub(db, app.log);
  await resetLegacyMatches(db, hub, app);

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

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: formatZodError(error)
      });
    }

    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler.";
    const safeMessage =
      statusCode >= 500
        ? "Interner Serverfehler. Bitte versuche es erneut."
        : errorMessage;

    request.log.error({ err: error }, "request failed");
    return reply.code(statusCode).send({
      error: safeMessage
    });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    await verifyRegistrationRecaptcha({
      config,
      log: request.log,
      ...(body.recaptchaToken === undefined ? {} : { recaptchaToken: body.recaptchaToken }),
      remoteIp: request.ip
    });

    try {
      const passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id
      });

      const user = await db.createUser({
        username: body.username,
        passwordHash
      });

      await createSession(reply, db, user.id);
      return { user };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Der Nutzername ist bereits vergeben." });
      }
      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const record = await db.getUserWithPasswordByUsername(body.username);

    if (!record || !(await argon2.verify(record.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Ungültige Zugangsdaten." });
    }

    await createSession(reply, db, record.id);
    return {
      user: {
        id: record.id,
        username: record.username,
        role: record.role
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

  app.get("/api/admin/users", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const users = await db.listUsers();
    return { users };
  });

  app.post("/api/admin/users", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const body = adminCreateUserSchema.parse(request.body);

    try {
      const passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id
      });

      const user = await db.createManagedUser({
        username: body.username,
        passwordHash,
        role: body.role
      });

      return { user };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Der Nutzername ist bereits vergeben." });
      }
      throw error;
    }
  });

  app.patch("/api/admin/users/:userId", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const body = adminUpdateUserSchema.parse(request.body ?? {});
    const userId = (request.params as { userId: string }).userId;
    const currentUser = await db.getUserById(userId);
    if (!currentUser) {
      return reply.code(404).send({ error: "Nutzer nicht gefunden." });
    }

    if (currentUser.role === "admin" && body.role === "user" && (await db.countAdmins()) <= 1) {
      return reply.code(409).send({ error: "Der letzte Admin kann nicht entzogen werden." });
    }

    try {
      const updated = await db.updateUser(userId, {
        ...(body.username ? { username: body.username } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.password
          ? {
              passwordHash: await argon2.hash(body.password, {
                type: argon2.argon2id
              })
            }
          : {})
      });

      if (!updated) {
        return reply.code(404).send({ error: "Nutzer nicht gefunden." });
      }

      return { user: updated };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Der Nutzername ist bereits vergeben." });
      }
      throw error;
    }
  });

  app.delete("/api/admin/users/:userId", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const userId = (request.params as { userId: string }).userId;
    const targetUser = await db.getUserById(userId);
    if (!targetUser) {
      return reply.code(404).send({ error: "Nutzer nicht gefunden." });
    }

    if (targetUser.id === admin.id) {
      return reply.code(409).send({ error: "Den aktuell angemeldeten Admin kannst du nicht löschen." });
    }

    if (targetUser.role === "admin" && (await db.countAdmins()) <= 1) {
      return reply.code(409).send({ error: "Der letzte Admin kann nicht gelöscht werden." });
    }

    const affectedRooms = await db.listUserRooms(targetUser.id);
    for (const room of affectedRooms) {
      if (room.matchId) {
        await resetMatchToRoom(db, hub, room.matchId, `Partie durch Admin beendet, weil ${targetUser.username} entfernt wurde.`);
      }

      const refreshedRoom = await db.getRoom(room.id);
      if (!refreshedRoom) {
        continue;
      }

      for (const seat of refreshedRoom.seats) {
        if (seat.userId === targetUser.id) {
          seat.userId = null;
          seat.username = null;
          seat.ready = false;
        }
      }

      const remainingSeatOwner = refreshedRoom.seats.find((seat) => seat.userId)?.userId ?? null;
      if (refreshedRoom.ownerUserId === targetUser.id) {
        refreshedRoom.ownerUserId = remainingSeatOwner ?? admin.id;
      }

      if (!remainingSeatOwner) {
        refreshedRoom.status = "closed";
        refreshedRoom.matchId = null;
        await hub.broadcastRoom(refreshedRoom);
        await db.deleteRoom(refreshedRoom.id);
        continue;
      }

      const saved = await db.saveRoom(refreshedRoom);
      await hub.broadcastRoom(saved);
    }

    await db.deleteSessionsByUserId(targetUser.id);
    await db.deleteUser(targetUser.id);
    return { ok: true };
  });

  app.get("/api/admin/rooms", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const rooms = await db.listRooms();
    return { rooms };
  });

  app.post("/api/admin/rooms/:roomId/close", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const room = await requireRoom(db, reply, (request.params as { roomId: string }).roomId);
    if (!room) {
      return reply;
    }

    if (room.matchId) {
      await resetMatchToRoom(db, hub, room.matchId, "Partie wurde vom Admin gestoppt.");
    }

    const refreshedRoom = (await db.getRoom(room.id)) ?? room;
    refreshedRoom.status = "closed";
    refreshedRoom.matchId = null;
    refreshedRoom.ownerUserId = admin.id;
    refreshedRoom.seats = refreshedRoom.seats.map((seat) => ({
      ...seat,
      userId: null,
      username: null,
      ready: false
    }));

    await hub.broadcastRoom(refreshedRoom);
    await db.deleteRoom(refreshedRoom.id);
    return { room: refreshedRoom };
  });

  app.get("/api/admin/matches", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const matches = await db.listMatches();
    return { matches };
  });

  app.delete("/api/admin/matches/:matchId", async (request, reply) => {
    const admin = await requireAdmin(request, reply, db);
    if (!admin) {
      return reply;
    }

    const matchId = (request.params as { matchId: string }).matchId;
    const room = await resetMatchToRoom(db, hub, matchId, "Partie wurde vom Admin zur Reparatur entfernt.");
    if (!room) {
      return reply.code(404).send({ error: "Partie nicht gefunden." });
    }

    return { room };
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

  app.get("/api/rooms/mine", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const rooms = await db.listUserRooms(user.id);
    return { rooms };
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
      return reply.code(409).send({ error: "Kein freier Platz mehr vorhanden." });
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

    const saved = await removeUserFromOpenRoom(db, hub, room, user.id);
    return { room: saved };
  });

  app.post("/api/rooms/:roomId/kick", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await requireRoom(db, reply, (request.params as { roomId: string }).roomId);
    if (!room) {
      return reply;
    }
    if (room.status !== "open") {
      return reply.code(409).send({ error: "Spieler können nur in der Lobby entfernt werden." });
    }
    if (room.ownerUserId !== user.id) {
      return reply.code(403).send({ error: "Nur der Host kann Spieler aus der Lobby entfernen." });
    }

    const body = kickRoomSchema.parse(request.body ?? {});
    if (body.userId === user.id) {
      return reply.code(409).send({ error: "Du kannst dich nicht selbst entfernen." });
    }

    const seat = room.seats.find((entry) => entry.userId === body.userId);
    if (!seat) {
      return reply.code(404).send({ error: "Dieser Spieler sitzt nicht in diesem Raum." });
    }

    const saved = await removeUserFromOpenRoom(db, hub, room, body.userId);
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

  app.patch("/api/rooms/:roomId/settings", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const room = await requireRoom(db, reply, (request.params as { roomId: string }).roomId);
    if (!room) {
      return reply;
    }
    if (room.ownerUserId !== user.id) {
      return reply.code(403).send({ error: "Nur der Host kann die Spieleinstellungen ändern." });
    }
    if (room.status !== "open") {
      return reply.code(409).send({ error: "Spieleinstellungen können nur in der Lobby geändert werden." });
    }

    const body = roomSettingsSchema.parse(request.body ?? {});
    if (body.setupMode !== undefined) {
      room.setupMode = body.setupMode;
    }
    if (body.startingPlayerMode !== undefined) {
      room.startingPlayerMode = body.startingPlayerMode;
    }
    if (body.startingSeatIndex !== undefined) {
      if ((body.startingPlayerMode ?? room.startingPlayerMode) !== "manual") {
        return reply.code(409).send({ error: "Ein fester Startspieler kann nur im manuellen Modus gewählt werden." });
      }
      const seat = room.seats.find((entry) => entry.index === body.startingSeatIndex);
      if (!seat?.userId) {
        return reply.code(409).send({ error: "Der gewählte Startspieler sitzt nicht im Raum." });
      }
      room.startingSeatIndex = body.startingSeatIndex;
    }
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

    if (room.startingPlayerMode === "manual") {
      const configuredStartSeat = room.seats.find((seat) => seat.index === room.startingSeatIndex);
      if (!configuredStartSeat?.userId) {
        return reply.code(409).send({ error: "Der gewählte Startspieler sitzt nicht im Raum." });
      }
    }

    const matchSeed = randomBytes(32).toString("hex");
    const matchPlayers = roomToPlayers(room);
    const rolledStart = room.startingPlayerMode === "rolled" ? rollStartingPlayer(matchPlayers, matchSeed) : null;
    const startingSeatIndex =
      room.startingPlayerMode === "manual"
        ? resolveManualStartingSeatIndex(room)
        : rolledStart?.winnerSeatIndex ?? room.startingSeatIndex;

    const state = createMatchState({
      matchId: randomUUID(),
      roomId: room.id,
      seed: matchSeed,
      setupMode: room.setupMode,
      startingPlayerMode: room.startingPlayerMode,
      startingSeatIndex,
      ...(rolledStart ? { startingPlayerRoll: rolledStart } : {}),
      players: matchPlayers
    });

    room.startingSeatIndex = startingSeatIndex;
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

  app.get("/ws", { websocket: true }, async (socket, request) => {
    const user = await getUserFromRequest(request, db);
    if (!user) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const context = hub.registerConnection(socket, user);

    socket.on("message", async (rawMessage: RawData) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as ClientMessage;
        switch (message.type) {
          case "room.subscribe":
            await hub.subscribeRoom(context, message.roomId);
            break;
          case "match.reconnect":
            await hub.subscribeMatch(context, message.matchId);
            break;
          case "client.ping":
            socket.send(
              JSON.stringify({
                type: "server.pong",
                at: message.at
              })
            );
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

type RecaptchaVerificationResponse = {
  success?: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
};

async function verifyRegistrationRecaptcha(input: {
  config: AppConfig;
  log: FastifyRequest["log"];
  recaptchaToken?: string;
  remoteIp?: string;
}): Promise<void> {
  const recaptchaEnabled = input.config.RECAPTCHA_ENABLED ?? Boolean(input.config.RECAPTCHA_SECRET_KEY);
  if (!recaptchaEnabled) {
    return;
  }

  if (!input.config.RECAPTCHA_SECRET_KEY) {
    input.log.warn("reCAPTCHA is enabled but RECAPTCHA_SECRET_KEY is missing; allowing registration");
    return;
  }

  if (!input.recaptchaToken) {
    input.log.warn("reCAPTCHA token missing for registration; allowing registration");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const payload = new URLSearchParams({
      secret: input.config.RECAPTCHA_SECRET_KEY,
      response: input.recaptchaToken
    });

    if (input.remoteIp) {
      payload.set("remoteip", input.remoteIp);
    }

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload,
      signal: controller.signal
    });

    if (!response.ok) {
      input.log.warn({ statusCode: response.status }, "reCAPTCHA verification failed upstream; allowing registration");
      return;
    }

    const verification = (await response.json()) as RecaptchaVerificationResponse;
    if (!verification.success) {
      input.log.warn(
        { errorCodes: verification["error-codes"] ?? [] },
        "reCAPTCHA verification was not successful; allowing registration"
      );
    }
  } catch (error) {
    input.log.warn({ err: error }, "reCAPTCHA verification could not be completed; allowing registration");
  } finally {
    clearTimeout(timeout);
  }
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

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  db: Database
): Promise<AuthUser | null> {
  const user = await requireUser(request, reply, db);
  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    reply.code(403).send({ error: "Adminrechte erforderlich." });
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

async function ensureBootstrapAdmin(db: Database, config: AppConfig): Promise<void> {
  if (!config.ADMIN_USERNAME || !config.ADMIN_PASSWORD) {
    return;
  }

  const passwordHash = await argon2.hash(config.ADMIN_PASSWORD, {
    type: argon2.argon2id
  });

  await db.upsertBootstrapAdmin({
    username: config.ADMIN_USERNAME,
    passwordHash,
    ...(config.ADMIN_EMAIL ? { email: config.ADMIN_EMAIL } : {})
  });
}

async function resetLegacyMatches(db: Database, hub: RealtimeHub, app: FastifyInstance): Promise<void> {
  const rooms = await db.listRooms();
  const activeRooms = rooms.filter((room) => !!room.matchId);
  if (!activeRooms.length) {
    return;
  }

  let resetMatches = 0;
  for (const room of activeRooms) {
    if (!room.matchId) {
      continue;
    }

    const state = await db.loadMatchState(room.matchId);
    if (state?.schemaVersion && state.schemaVersion >= 3) {
      continue;
    }

    await resetMatchToRoom(
      db,
      hub,
      room.matchId,
      "Partie wurde nach dem Regel-Update beendet. Bitte startet eine neue Runde."
    );
    resetMatches += 1;
  }

  if (resetMatches > 0) {
    app.log.info({ resetMatches }, "legacy matches reset on startup");
  }
}

async function resetMatchToRoom(
  db: Database,
  hub: RealtimeHub,
  matchId: string,
  reason: string
): Promise<RoomDetails | null> {
  hub.terminateMatch(matchId, reason);
  const deleted = await db.deleteMatch(matchId);
  if (!deleted) {
    return null;
  }

  const room = await db.getRoom(deleted.roomId);
  if (!room) {
    return null;
  }

  room.matchId = null;
  room.status = room.seats.some((seat) => seat.userId) ? "open" : "closed";
  room.seats = room.seats.map((seat) => ({
    ...seat,
    ready: false
  }));

  if (!hasOccupiedSeats(room)) {
    await hub.broadcastRoom(room);
    await db.deleteRoom(room.id);
    return room;
  }

  const saved = await db.saveRoom(room);
  await hub.broadcastRoom(saved);
  return saved;
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505";
}

function generateRoomCode(): string {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

function hasOccupiedSeats(room: RoomDetails): boolean {
  return room.seats.some((seat) => !!seat.userId);
}

function resolveManualStartingSeatIndex(room: RoomDetails): number {
  const seat = room.seats.find((entry) => entry.index === room.startingSeatIndex);
  if (!seat?.userId) {
    throw new Error("Der gewählte Startspieler sitzt nicht im Raum.");
  }

  return seat.index;
}

async function removeUserFromOpenRoom(
  db: Database,
  hub: RealtimeHub,
  room: RoomDetails,
  userId: string
): Promise<RoomDetails> {
  const seat = room.seats.find((entry) => entry.userId === userId);
  if (!seat) {
    return room;
  }

  seat.userId = null;
  seat.username = null;
  seat.ready = false;

  const occupiedSeats = room.seats.filter((entry) => entry.userId);
  if (!occupiedSeats.length) {
    room.status = "closed";
    room.matchId = null;
    await hub.broadcastRoom(room);
    await db.deleteRoom(room.id);
    return room;
  }

  if (room.ownerUserId === userId) {
    room.ownerUserId = occupiedSeats[0]!.userId!;
  }

  const saved = await db.saveRoom(room);
  await hub.broadcastRoom(saved);
  return saved;
}

function formatZodError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return "Ungültige Eingabe.";
  }

  const field = String(firstIssue.path[0] ?? "");

  if (field === "username" && firstIssue.code === "too_small" && typeof firstIssue.minimum === "number") {
    return `Der Nutzername muss mindestens ${firstIssue.minimum} Zeichen haben.`;
  }

  if (field === "username" && firstIssue.code === "too_big" && typeof firstIssue.maximum === "number") {
    return `Der Nutzername darf höchstens ${firstIssue.maximum} Zeichen haben.`;
  }

  if (field === "password" && firstIssue.code === "too_small" && typeof firstIssue.minimum === "number") {
    return `Das Passwort muss mindestens ${firstIssue.minimum} Zeichen haben.`;
  }

  if (field === "password" && firstIssue.code === "too_big" && typeof firstIssue.maximum === "number") {
    return `Das Passwort darf höchstens ${firstIssue.maximum} Zeichen haben.`;
  }

  if (field === "seatIndex") {
    return "Der gewählte Sitzplatz ist ungültig.";
  }

  if (field === "ready") {
    return "Der Bereit-Status ist ungültig.";
  }

  return firstIssue.message || "Ungültige Eingabe.";
}
