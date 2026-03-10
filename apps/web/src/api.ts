import type {
  AdminMatchSummary,
  AdminUserRecord,
  AuthUser,
  ErrorDescriptor,
  Locale,
  RoomDetails,
  RoomGameConfigPatch,
  UserRole
} from "@hexagonia/shared";
import { getRuntimeApiBaseUrl, getRuntimeWebSocketUrl } from "./runtimeConfig";

function getDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return "";
}

function getDefaultWebSocketUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:3000/ws";
  }

  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly errorParams?: ErrorDescriptor["errorParams"]
  ) {
    super(errorCode);
    this.name = "ApiError";
  }
}

const API_BASE_URL = getRuntimeApiBaseUrl() ?? getDefaultApiBaseUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? ((await response.json().catch(() => null)) as
          | {
              errorCode?: string;
              errorParams?: ErrorDescriptor["errorParams"];
              error?: string;
              message?: string;
            }
          | null)
      : null;
    const fallbackText = payload
      ? null
      : ((await response.text().catch(() => "")) || "").replace(/\s+/g, " ").trim();

    if (payload?.errorCode) {
      throw new ApiError(response.status, payload.errorCode, payload.errorParams);
    }

    const fallbackMessage =
      payload?.error ??
      payload?.message ??
      (fallbackText && fallbackText.length < 240 ? fallbackText : null) ??
      `${response.status} ${response.statusText || "Error"}`;
    throw new ApiError(response.status, "generic.unknown", { message: fallbackMessage });
  }

  return (await response.json()) as T;
}

export async function register(payload: {
  username: string;
  password: string;
  recaptchaToken?: string;
  locale: Locale;
}): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.user;
}

export async function login(payload: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.user;
}

export async function logout(): Promise<void> {
  await request<{ ok: true }>("/api/auth/logout", {
    method: "POST"
  });
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>("/api/auth/me");
  return response.user;
}

export async function updateCurrentUserLocale(locale: Locale): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ locale })
  });
  return response.user;
}

export async function getAdminUsers(): Promise<AdminUserRecord[]> {
  const response = await request<{ users: AdminUserRecord[] }>("/api/admin/users");
  return response.users;
}

export async function createAdminUser(payload: {
  username: string;
  password: string;
  role: UserRole;
}): Promise<AdminUserRecord> {
  const response = await request<{ user: AdminUserRecord }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.user;
}

export async function updateAdminUser(
  userId: string,
  payload: {
    username?: string;
    password?: string;
    role?: UserRole;
  }
): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.user;
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await request<{ ok: true }>(`/api/admin/users/${userId}`, {
    method: "DELETE"
  });
}

export async function getAdminRooms(): Promise<RoomDetails[]> {
  const response = await request<{ rooms: RoomDetails[] }>("/api/admin/rooms");
  return response.rooms;
}

export async function closeAdminRoom(roomId: string): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/admin/rooms/${roomId}/close`, {
    method: "POST"
  });
  return response.room;
}

export async function getAdminMatches(): Promise<AdminMatchSummary[]> {
  const response = await request<{ matches: AdminMatchSummary[] }>("/api/admin/matches");
  return response.matches;
}

export async function deleteAdminMatch(matchId: string): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/admin/matches/${matchId}`, {
    method: "DELETE"
  });
  return response.room;
}

export async function createRoom(): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>("/api/rooms", {
    method: "POST"
  });
  return response.room;
}

export async function getMyRooms(): Promise<RoomDetails[]> {
  const response = await request<{ rooms: RoomDetails[] }>("/api/rooms/mine");
  return response.rooms;
}

export async function getRoom(roomId: string): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/${roomId}`);
  return response.room;
}

export async function getRoomByCode(code: string): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/by-code/${code}`);
  return response.room;
}

export async function joinRoom(roomId: string, seatIndex?: number): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify(seatIndex === undefined ? {} : { seatIndex })
  });
  return response.room;
}

export async function leaveRoom(roomId: string): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/${roomId}/leave`, {
    method: "POST"
  });
  return response.room;
}

export async function kickRoomUser(roomId: string, userId: string): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/${roomId}/kick`, {
    method: "POST",
    body: JSON.stringify({ userId })
  });
  return response.room;
}

export async function setReady(roomId: string, ready: boolean): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/${roomId}/ready`, {
    method: "POST",
    body: JSON.stringify({ ready })
  });
  return response.room;
}

export async function updateRoomSettings(
  roomId: string,
  payload: RoomGameConfigPatch
): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/${roomId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.room;
}

export async function startRoom(roomId: string): Promise<{ room: RoomDetails; matchId: string }> {
  return request<{ room: RoomDetails; matchId: string }>(`/api/rooms/${roomId}/start`, {
    method: "POST"
  });
}

export function createWebSocket(): WebSocket {
  const url = getRuntimeWebSocketUrl() ?? getDefaultWebSocketUrl();
  return new WebSocket(url);
}
