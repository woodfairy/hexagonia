import type { AuthUser, RoomDetails } from "@hexagonia/shared";

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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unbekannter API-Fehler");
  }

  return (await response.json()) as T;
}

export async function register(payload: {
  email: string;
  username: string;
  password: string;
}): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.user;
}

export async function login(payload: {
  email: string;
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

export async function createRoom(): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>("/api/rooms", {
    method: "POST"
  });
  return response.room;
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

export async function setReady(roomId: string, ready: boolean): Promise<RoomDetails> {
  const response = await request<{ room: RoomDetails }>(`/api/rooms/${roomId}/ready`, {
    method: "POST",
    body: JSON.stringify({ ready })
  });
  return response.room;
}

export async function startRoom(roomId: string): Promise<{ room: RoomDetails; matchId: string }> {
  return request<{ room: RoomDetails; matchId: string }>(`/api/rooms/${roomId}/start`, {
    method: "POST"
  });
}

export function createWebSocket(): WebSocket {
  const url = import.meta.env.VITE_WS_URL ?? getDefaultWebSocketUrl();
  return new WebSocket(url);
}
