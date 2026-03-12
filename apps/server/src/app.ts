import { randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import argon2 from "argon2";
import {
  createMatchState,
  isMatchStateSchemaCompatible,
  rollStartingPlayer,
  roomToPlayers
} from "@hexagonia/rules";
import {
  DEFAULT_LOCALE,
  BOARD_SIZES,
  LAYOUT_MODES,
  RULES_PRESETS,
  RULES_FAMILIES,
  SCENARIO_RULESET_IDS,
  TURN_RULES,
  isScenarioId,
  mergeGameConfig,
  mergeRoomGameConfig,
  sanitizeLocale,
  resolveRoomGameConfig,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isValidUsername,
  type ActionIntent,
  type AuthUser,
  type ClientMessage,
  type GameConfig,
  type Locale,
  type RoomGameConfigPatch,
  type RoomDetails,
  type ScenarioId
} from "@hexagonia/shared";
import type { RawData } from "ws";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { Database } from "./db.js";
import { AppError, getErrorDescriptor, getZodErrorDescriptor, sendError } from "./errorDescriptors.js";
import { RealtimeHub } from "./realtime.js";
import { RoomLifecycleService } from "./roomLifecycleService.js";

const SESSION_COOKIE_NAME = "hexagonia_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .refine(isValidUsername, {
    message: "validation.username_invalid_characters"
  });

const localeSchema = z.string().transform((value, context) => {
  const normalized = sanitizeLocale(value);
  if (!normalized) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "validation.invalid_input"
    });
    return z.NEVER;
  }

  return normalized;
});

const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128),
  recaptchaToken: z.string().min(1).max(4096).optional(),
  locale: localeSchema.optional()
});

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128)
});

const authLocaleSchema = z.object({
  locale: localeSchema
});

const joinRoomSchema = z.object({
  seatIndex: z.number().int().min(0).max(5).optional()
});

const readySchema = z.object({
  ready: z.boolean()
});

const scenarioIdSchema = z.custom<ScenarioId>((value): value is ScenarioId => isScenarioId(value));

const roomSettingsSchema = z
  .object({
    rulesPreset: z.enum(RULES_PRESETS).optional(),
    rulesFamily: z.enum(RULES_FAMILIES).optional(),
    scenarioId: scenarioIdSchema.optional(),
    scenarioRulesetId: z.enum(SCENARIO_RULESET_IDS).optional(),
    layoutMode: z.enum(LAYOUT_MODES).optional(),
    scenarioOptions: z
      .object({
        victoryPointsToWin: z.number().int().min(3).max(30).optional()
      })
      .passthrough()
      .optional(),
    boardSize: z.enum(BOARD_SIZES).optional(),
    setupMode: z.enum(["official_variable", "beginner"]).optional(),
    turnRule: z.enum(TURN_RULES).optional(),
    startingPlayer: z
      .object({
        mode: z.enum(["rolled", "manual"]).optional(),
        seatIndex: z.number().int().min(0).max(5).optional()
      })
      .optional(),
    enabledExpansions: z.array(z.enum(["seafarers"])).optional()
  })
  .refine(
    (body) =>
      body.rulesPreset !== undefined ||
      body.rulesFamily !== undefined ||
      body.scenarioId !== undefined ||
      body.scenarioRulesetId !== undefined ||
      body.layoutMode !== undefined ||
      body.scenarioOptions !== undefined ||
      body.boardSize !== undefined ||
      body.setupMode !== undefined ||
      body.turnRule !== undefined ||
      body.startingPlayer !== undefined ||
      body.enabledExpansions !== undefined,
    {
      message: "validation.room_settings_required"
    }
  )
  .refine(
    (body) =>
      body.startingPlayer === undefined ||
      body.startingPlayer.mode !== undefined ||
      body.startingPlayer.seatIndex !== undefined,
    {
      message: "validation.starting_player_settings_required"
    }
  );

const kickRoomSchema = z.object({
  userId: z.string().uuid()
});

const userRoleSchema = z.enum(["user", "admin"]);

const adminCreateUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128),
  role: userRoleSchema.default("user")
});

const adminUpdateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    password: z.string().min(8).max(128).optional(),
    role: userRoleSchema.optional()
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "validation.user_update_required"
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
  const lifecycle = new RoomLifecycleService(db, hub);
  hub.setRoomLifecycleService(lifecycle);
  await resetLegacyMatches(db, lifecycle, app);

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
      const descriptor = getZodErrorDescriptor(error);
      return sendError(reply, 400, descriptor.errorCode, descriptor.errorParams);
    }

    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    const descriptor = getErrorDescriptor(error);

    request.log.error({ err: error }, "request failed");
    return sendError(
      reply,
      statusCode,
      descriptor?.errorCode ?? (statusCode >= 500 ? "generic.internal" : "generic.unknown"),
      descriptor?.errorParams
    );
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
        passwordHash,
        locale: body.locale ?? DEFAULT_LOCALE
      });

      await createSession(reply, db, user.id);
      return { user };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return sendError(reply, 409, "auth.username_taken");
      }
      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const record = await db.getUserWithPasswordByUsername(body.username);

    if (!record || !(await argon2.verify(record.passwordHash, body.password))) {
      return sendError(reply, 401, "auth.invalid_credentials");
    }

    await createSession(reply, db, record.id);
    return {
      user: {
        id: record.id,
        username: record.username,
        role: record.role,
        locale: record.locale
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

  app.patch("/api/auth/me", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return reply;
    }

    const body = authLocaleSchema.parse(request.body ?? {});
    const updated = await db.updateUser(user.id, {
      locale: body.locale
    });
    if (!updated) {
      return sendError(reply, 404, "auth.user_not_found");
    }

    return { user: updated };
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
        return sendError(reply, 409, "auth.username_taken");
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
      return sendError(reply, 404, "admin.user_not_found");
    }

    if (currentUser.role === "admin" && body.role === "user" && (await db.countAdmins()) <= 1) {
      return sendError(reply, 409, "admin.last_admin_role_required");
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
        return sendError(reply, 404, "admin.user_not_found");
      }

      return { user: updated };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return sendError(reply, 409, "auth.username_taken");
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
      return sendError(reply, 404, "admin.user_not_found");
    }

    if (targetUser.id === admin.id) {
      return sendError(reply, 409, "admin.cannot_delete_current_admin");
    }

    if (targetUser.role === "admin" && (await db.countAdmins()) <= 1) {
      return sendError(reply, 409, "admin.last_admin_delete_forbidden");
    }

    const affectedRooms = await db.listUserRooms(targetUser.id);
    for (const room of affectedRooms) {
      if (room.matchId) {
        await lifecycle.resetMatchToRoom(room.matchId, {
          errorCode: "match.terminated.admin_removed_user",
          errorParams: { username: targetUser.username }
        });
      }

      const refreshedRoom = await db.getRoom(room.id);
      if (!refreshedRoom) {
        continue;
      }

      await lifecycle.removeUserFromOpenRoom(refreshedRoom, targetUser.id);
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
      await lifecycle.resetMatchToRoom(room.matchId, {
        errorCode: "match.terminated.admin_stopped"
      });
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
    const room = await lifecycle.resetMatchToRoom(matchId, {
      errorCode: "match.terminated.admin_repair"
    });
    if (!room) {
      return sendError(reply, 404, "match.not_found");
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
      return sendError(reply, 404, "room.not_found");
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
      return sendError(reply, 404, "room.not_found");
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
      return sendError(reply, 409, "room.closed_to_new_players");
    }

    const body = joinRoomSchema.parse(request.body ?? {});
    const existingSeat = room.seats.find((seat) => seat.userId === user.id);
    if (existingSeat) {
      return { room };
    }

    const seat = body.seatIndex !== undefined ? room.seats[body.seatIndex] : room.seats.find((entry) => !entry.userId);
    if (!seat || seat.userId) {
      return sendError(reply, 409, "room.no_free_seat");
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
      return sendError(reply, 409, "room.leave_requires_reconnect");
    }

    const seat = room.seats.find((entry) => entry.userId === user.id);
    if (!seat) {
      return { room };
    }

    const saved = await lifecycle.removeUserFromOpenRoom(room, user.id);
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
      return sendError(reply, 409, "room.kick_only_in_lobby");
    }
    if (room.ownerUserId !== user.id) {
      return sendError(reply, 403, "room.kick_only_host");
    }

    const body = kickRoomSchema.parse(request.body ?? {});
    if (body.userId === user.id) {
      return sendError(reply, 409, "room.kick_self_forbidden");
    }

    const seat = room.seats.find((entry) => entry.userId === body.userId);
    if (!seat) {
      return sendError(reply, 404, "room.player_not_in_room");
    }

    const saved = await lifecycle.removeUserFromOpenRoom(room, body.userId);
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
      return sendError(reply, 409, "room.ready_after_start_forbidden");
    }

    const seat = room.seats.find((entry) => entry.userId === user.id);
    if (!seat) {
      return sendError(reply, 403, "room.ready_requires_seat");
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
      return sendError(reply, 403, "room.settings_only_host");
    }
    if (room.status !== "open") {
      return sendError(reply, 409, "room.settings_only_in_lobby");
    }

    const body = roomSettingsSchema.parse(request.body ?? {});
    const nextGameConfig = mergeRoomGameConfig(room.gameConfig, toGameConfigPatch(body));
    const effectiveNextGameConfig = resolveRoomGameConfig(nextGameConfig, room.seats);
    if (body.startingPlayer?.seatIndex !== undefined) {
      if (effectiveNextGameConfig.startingPlayer.mode !== "manual") {
        return sendError(reply, 409, "room.manual_start_player_only");
      }
      const seat = room.seats.find((entry) => entry.index === body.startingPlayer?.seatIndex);
      if (!seat?.userId) {
        return sendError(reply, 409, "room.start_player_not_in_room");
      }
    } else if (
      effectiveNextGameConfig.startingPlayer.mode === "manual" &&
      !room.seats.some(
        (entry) => entry.index === effectiveNextGameConfig.startingPlayer.seatIndex && !!entry.userId
      )
    ) {
      return sendError(reply, 409, "room.start_player_not_in_room");
    }
    room.gameConfig = nextGameConfig;
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
      return sendError(reply, 403, "room.start_only_owner");
    }
    if (room.status !== "open") {
      return sendError(reply, 409, "room.match_already_active");
    }

    const seatedPlayers = room.seats.filter((seat) => seat.userId);
    if (seatedPlayers.length < 3 || seatedPlayers.length > 6) {
      return sendError(reply, 409, "room.invalid_player_count");
    }
    if (seatedPlayers.some((seat) => !seat.ready)) {
      return sendError(reply, 409, "room.all_players_must_be_ready");
    }

    const effectiveRoomGameConfig = resolveRoomGameConfig(room.gameConfig, room.seats);

    if (effectiveRoomGameConfig.startingPlayer.mode === "manual") {
      const configuredStartSeat = room.seats.find(
        (seat) => seat.index === effectiveRoomGameConfig.startingPlayer.seatIndex
      );
      if (!configuredStartSeat?.userId) {
        return sendError(reply, 409, "room.start_player_not_in_room");
      }
    }

    const matchSeed = randomBytes(32).toString("hex");
    const matchPlayers = roomToPlayers(room);
    const rolledStart =
      effectiveRoomGameConfig.startingPlayer.mode === "rolled"
        ? rollStartingPlayer(matchPlayers, matchSeed)
        : null;
    const startingSeatIndex =
      effectiveRoomGameConfig.startingPlayer.mode === "manual"
        ? resolveManualStartingSeatIndex(room, effectiveRoomGameConfig)
        : rolledStart?.winnerSeatIndex ?? effectiveRoomGameConfig.startingPlayer.seatIndex;
    const matchGameConfig = mergeGameConfig(effectiveRoomGameConfig, {
      startingPlayer: {
        seatIndex: startingSeatIndex
      }
    });

    const state = createMatchState({
      matchId: randomUUID(),
      roomId: room.id,
      seed: matchSeed,
      gameConfig: matchGameConfig,
      ...(rolledStart ? { startingPlayerRoll: rolledStart } : {}),
      players: matchPlayers
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
                errorCode: "ws.unknown_message_type"
              })
            );
        }
      } catch (error) {
        const descriptor = getErrorDescriptor(error);
        socket.send(
          JSON.stringify({
            type: "match.error",
            errorCode: descriptor?.errorCode ?? "generic.unknown",
            ...(descriptor?.errorParams ? { errorParams: descriptor.errorParams } : {})
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
  if (!input.config.RECAPTCHA_SECRET_KEY) {
    return;
  }

  const failOpen = input.config.RECAPTCHA_FAIL_OPEN === true;

  if (!input.recaptchaToken) {
    if (failOpen) {
      input.log.warn("reCAPTCHA token missing for registration; allowing registration");
      return;
    }

    throw new AppError(400, "auth.recaptcha_token_missing");
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
      if (failOpen) {
        input.log.warn({ statusCode: response.status }, "reCAPTCHA verification failed upstream; allowing registration");
        return;
      }

      throw new AppError(400, "auth.recaptcha_verification_failed");
    }

    const verification = (await response.json()) as RecaptchaVerificationResponse;
    if (!verification.success) {
      if (failOpen) {
        input.log.warn(
          { errorCodes: verification["error-codes"] ?? [] },
          "reCAPTCHA verification was not successful; allowing registration"
        );
        return;
      }

      throw new AppError(400, "auth.recaptcha_verification_failed");
    }
  } catch (error) {
    if (failOpen) {
      input.log.warn({ err: error }, "reCAPTCHA verification could not be completed; allowing registration");
      return;
    }

    throw error;
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
    sendError(reply, 401, "auth.not_authenticated");
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
    sendError(reply, 403, "auth.admin_required");
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
    sendError(reply, 404, "room.not_found");
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

async function resetLegacyMatches(
  db: Database,
  lifecycle: RoomLifecycleService,
  app: FastifyInstance
): Promise<void> {
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
    if (isMatchStateSchemaCompatible(state)) {
      continue;
    }

    await lifecycle.resetMatchToRoom(
      room.matchId,
      {
        errorCode: "match.terminated.schema_mismatch"
      }
    );
    resetMatches += 1;
  }

  if (resetMatches > 0) {
    app.log.info({ resetMatches }, "legacy matches reset on startup");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505";
}

function generateRoomCode(): string {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

function resolveManualStartingSeatIndex(room: RoomDetails, gameConfig: GameConfig): number {
  const seat = room.seats.find(
    (entry) => entry.index === gameConfig.startingPlayer.seatIndex
  );
  if (!seat?.userId) {
    throw new AppError(409, "room.start_player_not_in_room");
  }

  return seat.index;
}

function toGameConfigPatch(body: z.infer<typeof roomSettingsSchema>): RoomGameConfigPatch {
  const patch: RoomGameConfigPatch = {};

  if (body.rulesPreset !== undefined) {
    patch.rulesPreset = body.rulesPreset;
  }
  if (body.rulesFamily !== undefined) {
    patch.rulesFamily = body.rulesFamily;
  }
  if (body.scenarioId !== undefined) {
    patch.scenarioId = body.scenarioId;
  }
  if (body.scenarioRulesetId !== undefined) {
    patch.scenarioRulesetId = body.scenarioRulesetId;
  }
  if (body.layoutMode !== undefined) {
    patch.layoutMode = body.layoutMode;
  }
  if (body.scenarioOptions !== undefined) {
    patch.scenarioOptions = body.scenarioOptions;
  }
  if (body.boardSize !== undefined) {
    patch.boardSize = body.boardSize;
  }
  if (body.setupMode !== undefined) {
    patch.setupMode = body.setupMode;
  }
  if (body.turnRule !== undefined) {
    patch.turnRule = body.turnRule;
  }
  if (body.startingPlayer) {
    const startingPlayer: NonNullable<RoomGameConfigPatch["startingPlayer"]> = {};
    if (body.startingPlayer.mode !== undefined) {
      startingPlayer.mode = body.startingPlayer.mode;
    }
    if (body.startingPlayer.seatIndex !== undefined) {
      startingPlayer.seatIndex = body.startingPlayer.seatIndex;
    }
    patch.startingPlayer = startingPlayer;
  }
  if (body.enabledExpansions !== undefined) {
    patch.enabledExpansions = body.enabledExpansions;
  }

  return patch;
}
